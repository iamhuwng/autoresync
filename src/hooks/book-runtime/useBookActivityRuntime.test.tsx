import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BookRuntimeClient,
  BookRuntimeDraftAddress,
} from '../../services/book-activity/activityRuntime.browser';
import { BookRuntimeClientError } from '../../services/book-activity/activityRuntime.browser';
import {
  resetBookRuntimeDraftWriteBudgetsForTest,
  useBookActivityRuntime,
  type BookRuntimeRecoveryStore,
} from './useBookActivityRuntime';
import { resolveBookScheduleWindow } from '../../services/book-delivery/bookScheduleWindow.service';

const address: Omit<BookRuntimeDraftAddress, 'interactionId'> = {
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextId: 'context-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
};

const operationId = '00000000-0000-4000-8000-000000000076';

const windowDecision = (
  operation: 'launch' | 'autosave' | 'submit',
  evaluatedAt: string,
  lateSubmissionAllowed = false,
) => resolveBookScheduleWindow({
  assignmentId: 'context-1',
  recipientId: 'student-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  nodeKey: 'unit-1',
  operation,
  schedule: {
    schemaVersion: 1,
    resolverVersion: 1,
    availableFrom: '2026-08-02T00:00:00.000Z',
    finalDueAt: '2026-08-05T00:00:00.000Z',
    scheduleRules: [],
  },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  studentExtensions: {},
  lateSubmissionAllowed,
  policyRevision: 1,
  authorityRevision: 1,
  evaluatedAt,
  maxAttempts: 2,
  attemptsUsed: 0,
});

const store = (): BookRuntimeRecoveryStore => {
  const values = new Map<string, unknown>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

const runtimeClient = (overrides: Partial<BookRuntimeClient> = {}): BookRuntimeClient => ({
  readDraft: vi.fn(async () => null),
  readTerminal: vi.fn(async () => ({ status: 'absent' as const })),
  saveDraft: vi.fn(async (input) => ({
    status: 'accepted' as const,
    receipt: {
      operationId: input.operationId,
      fingerprint: '',
      status: 'accepted' as const,
      bindingId: input.bindingId,
      draftRevision: input.clientRevision + 1,
      createdAt: '2026-07-28T00:00:00.000Z',
    },
  })),
  submitActivity: vi.fn(async (input) => ({
    status: 'accepted' as const,
    resultStatus: 'submitted' as const,
    completionStatus: 'completed' as const,
    receipt: {
      operationId: input.operationId,
      fingerprint: '',
      status: 'accepted' as const,
      bindingId: input.bindingId,
      attemptId: 'attempt-1',
      createdAt: '2026-07-28T00:00:00.000Z',
    },
  })),
  ...overrides,
});

describe('useBookActivityRuntime', () => {
  it('hydrates an exhausted submitted placement without allowing writes', async () => {
    const client = runtimeClient({ readDraft: vi.fn(async () => ({
      schemaVersion: 1, ...address, recipientId: 'student-1', interactionId: 'interaction-1',
      revision: 1, response: { text: 'submitted answer' }, updatedByOperationId: operationId,
      updatedAt: '2026-07-28T00:00:00.000Z',
    })) });
    const readTerminal = vi.fn(async () => ({ status: 'confirmed-present' as const, resultStatus: 'submitted' as const }));
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ['interaction-1'], storage: store(), canAutosave: false, canSubmit: false, readTerminal }));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'submitted answer' } });
    expect(result.current.terminalReadStatus).toBe('confirmed-present');
    expect(result.current.terminalReadResultStatus).toBe('submitted');
    act(() => { expect(result.current.change('interaction-1', { text: 'overwrite' })).toBe(false); });
    await act(async () => { await result.current.flush(); await expect(result.current.submitActivity('interaction-1')).rejects.toThrow(); });
    expect(readTerminal).toHaveBeenCalledOnce();
    expect(client.readDraft).toHaveBeenCalledOnce();
    expect(client.saveDraft).not.toHaveBeenCalled();
    expect(client.submitActivity).not.toHaveBeenCalled();
  });
  it('rejects edits during hydration and after a restored terminal', async () => {
    let resolveTerminal!: (value: { status: 'confirmed-present'; resultStatus: 'submitted' }) => void;
    const readTerminal = () => new Promise<{ status: 'confirmed-present'; resultStatus: 'submitted' }>((resolve) => { resolveTerminal = resolve; });
    const client = runtimeClient();
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ['interaction-1'], storage: store(), readTerminal }));
    act(() => { expect(result.current.change('interaction-1', { text: 'early' })).toBe(false); });
    await act(async () => { resolveTerminal({ status: 'confirmed-present', resultStatus: 'submitted' }); });
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => { expect(result.current.change('interaction-1', { text: 'completed edit' })).toBe(false); });
    expect(result.current.responses).toEqual({});
    expect(client.saveDraft).not.toHaveBeenCalled();
  });

  it.each(['network_failure', 'invalid_response', 'denied'] as const)('locks %s after attempted submission until a non-destructive terminal read resolves it', async (outcome) => {
    let committed = false;
    let settle!: () => void;
    const requestGate = new Promise<void>((resolve) => { settle = resolve; });
    const client = runtimeClient({ submitActivity: vi.fn(async (input) => {
      await requestGate;
      committed = true;
      if (outcome === 'denied') return { status: 'denied' as const, resultStatus: 'submitted' as const, completionStatus: 'completed' as const,
        receipt: { operationId: input.operationId, fingerprint: '', status: 'denied' as const, bindingId: input.bindingId, createdAt: '2026-07-28T00:00:00.000Z' } };
      throw new BookRuntimeClientError(outcome);
    }) });
    const readTerminal = vi.fn(async () => committed ? { status: 'confirmed-present' as const, resultStatus: 'submitted' as const } : { status: 'confirmed-absent' as const });
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ['interaction-1'], storage: store(), readTerminal }));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => { result.current.change('interaction-1', { text: 'final' }); });
    let submission!: Promise<unknown>;
    act(() => { submission = result.current.submitActivity('interaction-1'); });
    await waitFor(() => expect(client.submitActivity).toHaveBeenCalledTimes(1));
    act(() => { expect(result.current.change('interaction-1', { text: 'edit during submission' })).toBe(false); });
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'final' } });
    await act(async () => { settle(); await expect(submission).rejects.toThrow(); });
    expect(result.current.terminalReadStatus).toBe('unavailable');
    expect(result.current.status).toBe('error');
    act(() => { expect(result.current.change('interaction-1', { text: 'new edit' })).toBe(false); });
    await act(async () => { await expect(result.current.submitActivity('interaction-1')).rejects.toThrow(); });
    expect(client.submitActivity).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.refreshTerminal(); });
    expect(result.current.terminalReadStatus).toBe('confirmed-present');
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'final' } });
    expect(client.readDraft).toHaveBeenCalledTimes(1);
  });
  afterEach(() => {
    resetBookRuntimeDraftWriteBudgetsForTest();
    vi.useRealTimers();
  });

  it('loads saved responses when schedule authority enables the runtime after mount', async () => {
    const client = runtimeClient({
      readDraft: vi.fn(async () => ({
        schemaVersion: 1,
        ...address,
        recipientId: 'student-1',
        interactionId: 'interaction-1',
        revision: 1,
        response: { text: 'saved response' },
        updatedByOperationId: operationId,
        updatedAt: '2026-07-28T00:00:00.000Z',
      })),
    });
    const { result, rerender } = renderHook(
      ({ enabled }) => useBookActivityRuntime({
        client,
        recipientId: 'student-1',
        address,
        interactionIds: ['interaction-1'],
        storage: store(),
        enabled,
      }),
      { initialProps: { enabled: false } },
    );

    await waitFor(() => expect(result.current.status).toBe('idle'));
    rerender({ enabled: true });

    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.responses).toEqual({
      'interaction-1': { text: 'saved response' },
    });
    expect(client.readDraft).toHaveBeenCalledOnce();
  });

  it('submits a preserved legacy saved response through the current submission boundary', async () => {
    const legacy = [{ interactionId: 'interaction-1', answer: ['option-a'] }];
    const client = runtimeClient({
      readDraft: vi.fn(async () => ({
        schemaVersion: 1 as const,
        ...address,
        recipientId: 'student-1',
        interactionId: 'interaction-1',
        revision: 1,
        response: legacy,
        updatedByOperationId: operationId,
        updatedAt: '2026-07-28T00:00:00.000Z',
      })),
    });
    const { result } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
    }));

    await waitFor(() => expect(result.current.status).toBe('saved'));
    await act(async () => { await result.current.submitActivity('interaction-1'); });
    expect(client.submitActivity).toHaveBeenCalledWith(expect.objectContaining({ response: legacy }));
  });

  it('consumes explicit permissions and never reconstructs release or late policy from browser time', async () => {
    const client = runtimeClient();
    const unreleased = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      windowDecision: windowDecision('launch', '2026-08-01T00:00:00.000Z'),
      now: () => Date.parse('2099-01-01T00:00:00.000Z'),
    }));
    await waitFor(() => expect(unreleased.result.current.status).not.toBe('loading'));
    let unreleasedChanged = true;
    act(() => {
      unreleasedChanged = unreleased.result.current.change(
        'interaction-1',
        { text: 'forged-clock' },
      );
    });
    expect(unreleasedChanged).toBe(false);
    expect(client.saveDraft).not.toHaveBeenCalled();
    unreleased.unmount();

    const overdue = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      initialResponses: { 'interaction-1': { text: 'answer' } },
      storage: store(),
      windowDecision: windowDecision('launch', '2026-08-06T00:00:00.000Z'),
      now: () => Date.parse('2000-01-01T00:00:00.000Z'),
    }));
    await waitFor(() => expect(overdue.result.current.status).not.toBe('loading'));
    let overdueChanged = false;
    await act(async () => {
      overdueChanged = overdue.result.current.change(
        'interaction-1',
        { text: 'editable overdue' },
      );
      await overdue.result.current.flush();
    });
    expect(overdueChanged).toBe(true);
    let submitError: unknown;
    await act(async () => {
      try {
        await overdue.result.current.submitActivity('interaction-1');
      } catch (error) {
        submitError = error;
      }
    });
    expect(submitError).toMatchObject({
      code: 'forbidden',
      currentWindow: { phase: 'overdue', permissions: { canSubmit: false } },
    });
    expect(client.submitActivity).not.toHaveBeenCalled();
    overdue.unmount();
  });

  it('updates immediately, debounces one save, and flushes queued changes', async () => {
    vi.useFakeTimers();
    const client = runtimeClient();
    const metrics: Array<Record<string, unknown>> = [];
    const { result } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 20,
      now: () => Date.now(),
      tabId: 'tab-1',
      onMetric: (metric) => { metrics.push(metric); },
    }));

    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    act(() => { result.current.change('interaction-1', { text: 'draft' }); });
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'draft' } });
    expect(result.current.status).toBe('pending');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_499);
    });
    expect(client.saveDraft).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(client.saveDraft).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
    expect(client.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      clientRevision: 0,
      response: { text: 'draft' },
    }));
    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'autosave-ack' }),
      expect.objectContaining({ event: 'autosave-write' }),
    ]));
    expect(metrics.every((metric) => !Object.hasOwn(metric, 'response'))).toBe(true);
  });

  it('keeps one write in flight and coalesces the latest queued response', async () => {
    vi.useFakeTimers();
    let releaseFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let callCount = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const client = runtimeClient({
      saveDraft: vi.fn(async (input) => {
        callCount += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (callCount === 1) await firstSave;
        inFlight -= 1;
        return {
          status: 'accepted' as const,
          receipt: {
            operationId: input.operationId,
            fingerprint: '',
            status: 'accepted' as const,
            bindingId: input.bindingId,
            draftRevision: input.clientRevision + 1,
            createdAt: '2026-07-28T00:00:00.000Z',
          },
        };
      }),
    });
    const { result } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 20,
      tabId: 'tab-1',
    }));

    act(() => { result.current.change('interaction-1', { text: 'first' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); await Promise.resolve(); });
    act(() => { result.current.change('interaction-1', { text: 'latest' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); await Promise.resolve(); });
    expect(callCount).toBe(1);
    expect(maxInFlight).toBe(1);

    releaseFirst();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callCount).toBe(2);
    expect(client.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      response: { text: 'latest' },
      clientRevision: 1,
    }));
    const saveCalls = vi.mocked(client.saveDraft).mock.calls;
    expect(saveCalls[0]?.[0].operationId).toBe(saveCalls[1]?.[0].operationId);
  });

  it('counts forced flushes against the six-write trailing Activity budget', async () => {
    vi.useFakeTimers();
    const client = runtimeClient();
    const { result, rerender } = renderHook(({ currentAddress }) => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address: currentAddress,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 60_000,
      flushDeadlineMs: 10,
      now: () => Date.now(),
    }), { initialProps: { currentAddress: address } });

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    for (let index = 0; index < 6; index += 1) {
      act(() => { result.current.change('interaction-1', { index }); });
      await act(async () => { await result.current.flush('navigation'); });
    }
    expect(client.saveDraft).toHaveBeenCalledTimes(6);

    rerender({ currentAddress: { ...address, bindingId: 'binding-addition', bindingRevision: 2, activityVersion: 2 } });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => { result.current.change('interaction-1', { index: 6 }); });
    let seventh!: Awaited<ReturnType<typeof result.current.flush>>;
    await act(async () => {
      const pending = result.current.flush('navigation');
      await vi.advanceTimersByTimeAsync(10);
      seventh = await pending;
    });
    expect(seventh).toEqual({ status: 'deadline', safeToLeave: false });
    expect(client.saveDraft).toHaveBeenCalledTimes(6);
    expect(result.current.status).toBe('unsafe-to-leave');
  });

  it('retains local response through transient failure and explicit retry', async () => {
    vi.useFakeTimers();
    let fail = true;
    const client = runtimeClient({
      saveDraft: vi.fn(async (input) => {
        if (fail) {
          fail = false;
          throw new BookRuntimeClientError('network_failure');
        }
        return {
          status: 'accepted' as const,
          receipt: {
            operationId: input.operationId,
            fingerprint: '',
            status: 'accepted' as const,
            bindingId: input.bindingId,
            draftRevision: 1,
            createdAt: '2026-07-28T00:00:00.000Z',
          },
        };
      }),
    });
    const { result } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 20,
      retryBaseMs: 60_000,
      tabId: 'tab-1',
    }));

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => { result.current.change('interaction-1', { text: 'retained' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); await Promise.resolve(); });
    expect(result.current.status).toBe('retrying');
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'retained' } });
    await act(async () => { await result.current.retry(); });
    expect(result.current.status).toBe('saved');
    expect(client.saveDraft).toHaveBeenCalledTimes(2);
  });

  it('retains local response offline without issuing a Worker write', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      const client = runtimeClient();
      const { result } = renderHook(() => useBookActivityRuntime({
        client,
        recipientId: 'student-1',
        address,
        interactionIds: ['interaction-1'],
        storage: store(),
        tabId: 'tab-1',
      }));
      await waitFor(() => expect(result.current.status).toBe('saved'));
      act(() => { result.current.change('interaction-1', { text: 'offline' }); });
      await act(async () => { await result.current.flush('offline-test'); });
      expect(result.current.status).toBe('offline');
      expect(result.current.responses).toEqual({ 'interaction-1': { text: 'offline' } });
      expect(client.saveDraft).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnline });
    }
  });

  it('marks a bounded flush deadline unsafe to leave', async () => {
    vi.useFakeTimers();
    let releaseSave!: () => void;
    const delayed = new Promise<void>((resolve) => { releaseSave = resolve; });
    const client = runtimeClient({
      saveDraft: vi.fn(async (input) => {
        await delayed;
        return {
          status: 'accepted' as const,
          receipt: {
            operationId: input.operationId,
            fingerprint: '',
            status: 'accepted' as const,
            bindingId: input.bindingId,
            draftRevision: 1,
            createdAt: '2026-07-28T00:00:00.000Z',
          },
        };
      }),
    });
    const { result } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 60_000,
      flushDeadlineMs: 10,
      tabId: 'tab-1',
    }));
    act(() => { result.current.change('interaction-1', { text: 'deadline' }); });
    let outcome;
    await act(async () => {
      const flush = result.current.flush('deadline-test');
      await vi.advanceTimersByTimeAsync(10);
      outcome = await flush;
    });
    expect(outcome).toEqual({ status: 'deadline', safeToLeave: false });
    expect(result.current.status).toBe('unsafe-to-leave');
    releaseSave();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(client.saveDraft).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('saved');
  });

  it('flushes a pending response when the Activity unmounts', async () => {
    const client = runtimeClient();
    const { result, unmount } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 60_000,
      tabId: 'tab-1',
    }));
    act(() => { result.current.change('interaction-1', { text: 'unmount' }); });
    unmount();
    await waitFor(() => expect(client.saveDraft).toHaveBeenCalledTimes(1));
  });

  it('keeps local response on CAS conflict and exposes recovery choices', async () => {
    const client = runtimeClient({
      saveDraft: vi.fn(async (input) => ({
        status: 'conflict' as const,
        receipt: {
          operationId: input.operationId,
          fingerprint: '',
          status: 'conflict' as const,
          bindingId: input.bindingId,
          createdAt: '2026-07-28T00:00:00.000Z',
        },
      })),
      readDraft: vi.fn(async () => ({
        schemaVersion: 1 as const,
        ...address,
        recipientId: 'student-1',
        interactionId: 'interaction-1',
        revision: 2,
        response: { text: 'server' },
        updatedByOperationId: operationId,
        updatedAt: '2026-07-28T00:00:00.000Z',
      })),
    });
    const { result } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 60_000,
      tabId: 'tab-1',
    }));

    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => { result.current.change('interaction-1', { text: 'local' }); });
    await act(async () => { await result.current.flush('test'); });
    expect(result.current.status).toBe('conflict');
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'local' } });
    expect(result.current.conflict).toMatchObject({
      interactionId: 'interaction-1',
      localResponse: { text: 'local' },
      serverResponse: { text: 'server' },
      serverRevision: 2,
    });
  });

  it('reloads acknowledged server state and discards retained local state', async () => {
    let serverResponse: unknown = { text: 'server' };
    const client = runtimeClient({
      readDraft: vi.fn(async () => ({
        schemaVersion: 1 as const,
        ...address,
        recipientId: 'student-1',
        interactionId: 'interaction-1',
        revision: 1,
        response: serverResponse,
        updatedByOperationId: operationId,
        updatedAt: '2026-07-28T00:00:00.000Z',
      })),
    });
    const { result } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 60_000,
      tabId: 'tab-1',
    }));

    await waitFor(() => expect(result.current.responses).toEqual({ 'interaction-1': { text: 'server' } }));
    act(() => { result.current.change('interaction-1', { text: 'local' }); });
    await act(async () => { await result.current.discardLocal(); });
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'server' } });
    serverResponse = { text: 'reloaded' };
    await act(async () => { await result.current.reload(); });
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'reloaded' } });
  });

  it('flushes before terminal submission and reuses the immutable acknowledgement on double submit', async () => {
    const client = runtimeClient();
    const { result } = renderHook(() => useBookActivityRuntime({
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      debounceMs: 60_000,
      tabId: 'tab-1',
    }));

    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => { result.current.change('interaction-1', { text: 'final' }); });
    let first;
    await act(async () => { first = await result.current.submitActivity('interaction-1'); });
    let second;
    await act(async () => { second = await result.current.submitActivity('interaction-1'); });

    expect(first).toEqual(expect.objectContaining({
      status: 'accepted',
      resultStatus: 'submitted',
      completionStatus: 'completed',
    }));
    expect(second).toEqual(first);
    expect(client.submitActivity).toHaveBeenCalledTimes(1);
    expect(client.saveDraft).toHaveBeenCalledTimes(1);
    expect(result.current.terminalResult).toEqual(first);
    expect(result.current.terminalReadStatus).toBe('confirmed-absent');
  });

  it('restores terminal status after remount without fabricating a runtime receipt', async () => {
    const terminal = {
      status: 'confirmed-present' as const,
      resultStatus: 'submitted' as const,
    };
    const client = runtimeClient({
      readDraft: vi.fn(async () => ({
        schemaVersion: 1 as const,
        ...address,
        recipientId: 'student-1',
        interactionId: 'interaction-1',
        revision: 1,
        response: { text: 'saved response' },
        updatedByOperationId: operationId,
        updatedAt: '2026-07-28T00:00:00.000Z',
      })),
    });
    const readTerminal = vi.fn(async () => terminal);
    const options = {
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      readTerminal,
    };
    const first = renderHook(() => useBookActivityRuntime(options));
    await waitFor(() => expect(first.result.current.terminalReadStatus).toBe('confirmed-present'));
    first.unmount();

    const second = renderHook(() => useBookActivityRuntime(options));
    await waitFor(() => expect(second.result.current.terminalReadStatus).toBe('confirmed-present'));
    expect(second.result.current.responses).toEqual({ 'interaction-1': { text: 'saved response' } });
    expect(second.result.current.terminalResult).toBeNull();
    expect(second.result.current.terminalReadResultStatus).toBe(terminal.resultStatus);
    expect(client.submitActivity).not.toHaveBeenCalled();
    expect(readTerminal).toHaveBeenCalledTimes(2);
  });

  it('keeps submission status unavailable when the terminal read fails', async () => {
    const { result } = renderHook(() => useBookActivityRuntime({
      client: runtimeClient(),
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1'],
      storage: store(),
      readTerminal: async () => ({ status: 'unavailable' as const }),
    }));

    await waitFor(() => expect(result.current.terminalReadStatus).toBe('unavailable'));
    expect(result.current.terminalResult).toBeNull();
  });

  it('does not apply a stale terminal read after the runtime generation changes', async () => {
    let resolveFirst!: (value: { readonly status: 'confirmed-present'; readonly resultStatus: 'submitted' }) => void;
    const readTerminal = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ status: 'confirmed-absent' as const });
    const client = runtimeClient();
    const { result, rerender } = renderHook(
      ({ contextId }) => useBookActivityRuntime({
        client,
        recipientId: 'student-1',
        address: { ...address, contextId },
        interactionIds: ['interaction-1'],
        storage: store(),
        readTerminal,
      }),
      { initialProps: { contextId: 'context-1' } },
    );

    rerender({ contextId: 'context-2' });
    resolveFirst({ status: 'confirmed-present', resultStatus: 'submitted' });

    await waitFor(() => expect(result.current.terminalReadStatus).toBe('confirmed-absent'));
    expect(result.current.terminalReadResultStatus).toBeNull();
  });
});
