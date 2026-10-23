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
  it('does not replace an aggregate with older local recovery', async () => {
    const recovery = store();
    const savedAt = Date.now();
    for (const interactionId of ['interaction-1', 'interaction-2']) {
      await recovery.set(`book-runtime-draft:v1:student-1:binding-1:1:context-1:placement-1:activity-1:1:${interactionId}`, {
        schemaVersion: 1, ownerId: 'tab-1', address: { ...address, recipientId: 'student-1', interactionId },
        response: { text: 'older local answer' }, clientRevision: 99,
        updatedAt: savedAt - 1_000, expiresAt: savedAt + 60_000,
      });
    }
    const client = runtimeClient({ readDraft: vi.fn(async (input) => ({
      schemaVersion: 1, ...input, recipientId: 'student-1', revision: 4,
      response: [{ interactionId: 'interaction-1', answer: 'newer aggregate answer' }, { interactionId: 'interaction-2' }],
      updatedByOperationId: operationId, updatedAt: new Date(savedAt).toISOString(),
    })) });
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ['interaction-1', 'interaction-2'], storage: recovery }));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.responses).toEqual({ 'interaction-1': [{ interactionId: 'interaction-1', answer: 'newer aggregate answer' }] });
    expect(client.saveDraft).not.toHaveBeenCalled();
  });

  it('keeps edits made while a local recovery read is in flight', async () => {
    let release!: (value: unknown) => void;
    const recovery = { ...store(), get: vi.fn(() => new Promise<unknown>((resolve) => { release = resolve; })) };
    const client = runtimeClient();
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ['interaction-1'], storage: recovery }));
    await waitFor(() => expect(recovery.get).toHaveBeenCalled());
    act(() => { expect(result.current.change('interaction-1', { text: 'new edit' })).toBe(true); });
    const savedAt = Date.now();
    await act(async () => { release({ schemaVersion: 1, ownerId: 'tab-1',
      address: { ...address, recipientId: 'student-1', interactionId: 'interaction-1' },
      response: { text: 'old recovered edit' }, clientRevision: 0, updatedAt: savedAt - 1_000, expiresAt: savedAt + 60_000 }); });
    await waitFor(() => expect(result.current.responses).toEqual({ 'interaction-1': { text: 'new edit' } }));
    await act(async () => { await result.current.flush(); });
    expect(client.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ response: [{ interactionId: 'interaction-1', answer: 'new edit' }] }));
  });

  it('restores one Activity snapshot and submits its acknowledged revision', async () => {
    const ids = ['interaction-1', 'interaction-2'];
    const rows = [{ interactionId: ids[0], answer: '' }, { interactionId: ids[1], answer: 'saved answer' }];
    const client = runtimeClient({ readDraft: vi.fn(async (input) => ({
      schemaVersion: 1, ...input, recipientId: 'student-1', revision: 4,
      response: rows,
      updatedByOperationId: operationId, updatedAt: new Date().toISOString(),
    })) });
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ids, storage: store() }));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(client.readDraft).toHaveBeenCalledOnce();
    expect(client.saveDraft).not.toHaveBeenCalled();
    await act(async () => { await result.current.submitActivity(ids[0]); });
    expect(client.saveDraft).not.toHaveBeenCalled();
    expect(client.submitActivity).toHaveBeenCalledWith(expect.objectContaining({ response: rows, clientRevision: 4 }));
  });

  it('saves six rapid answers as one Activity snapshot and submits its acknowledged revision', async () => {
    const client = runtimeClient();
    const ids = Array.from({ length: 6 }, (_, index) => `interaction-${index + 1}`);
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ids, storage: store() }));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    act(() => { ids.forEach((id, index) => result.current.change(id, { text: `answer ${index + 1}` })); });
    await act(async () => { await result.current.flush(); });
    expect(client.saveDraft).toHaveBeenCalledTimes(1);
    expect(client.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ interactionId: ids[0], clientRevision: 0,
      response: ids.map((interactionId, index) => ({ interactionId, answer: `answer ${index + 1}` })) }));
    await act(async () => { await result.current.submitActivity(ids[0]); });
    expect(client.saveDraft).toHaveBeenCalledTimes(1);
    expect(client.submitActivity).toHaveBeenCalledWith(expect.objectContaining({ clientRevision: 1 }));
  });
  it('distinguishes untouched questions from an uncertain submission and preserves explicit blank answers', async () => {
    const client = runtimeClient();
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ['interaction-1', 'interaction-2'], storage: store() }));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    await act(async () => {
      await expect(result.current.submitActivity('interaction-1')).rejects.toMatchObject({ code: 'incomplete_response' });
    });
    expect(client.submitActivity).not.toHaveBeenCalled();
    expect(result.current.terminalReadStatus).toBe('confirmed-absent');
    act(() => {
      result.current.change('interaction-1', { text: '' });
      result.current.change('interaction-2', { text: 'answer' });
    });
    await act(async () => { await result.current.flush(); });
    await act(async () => { await result.current.submitActivity('interaction-1'); });
    expect(client.submitActivity).toHaveBeenCalledWith(expect.objectContaining({ response: [
      { interactionId: 'interaction-1', answer: '' }, { interactionId: 'interaction-2', answer: 'answer' },
    ] }));
  });
  it.each(['reload', 'reconnect'] as const)('automatically saves restored local work after %s finishes hydration', async (entry) => {
    const previousOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: entry === 'reload' });
    try {
      const savedAt = Date.now() - 1_000;
      const recovery = store();
      const key = 'book-runtime-draft:v1:student-1:binding-1:1:context-1:placement-1:activity-1:1:interaction-1';
      await recovery.set(key, { schemaVersion: 1, ownerId: 'tab-1',
        address: { ...address, recipientId: 'student-1', interactionId: 'interaction-1' },
        response: { text: 'latest local answer' }, clientRevision: 4,
        updatedAt: savedAt, expiresAt: savedAt + 60_000 });
      const client = runtimeClient({ readDraft: vi.fn(async () => ({
        schemaVersion: 1, ...address, recipientId: 'student-1', interactionId: 'interaction-1',
        revision: 4, response: [{ interactionId: 'interaction-1', answer: 'previous server answer' }], updatedByOperationId: operationId,
        updatedAt: new Date(savedAt - 1_000).toISOString(),
      })) });
      const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
        interactionIds: ['interaction-1'], storage: recovery, tabId: 'tab-1' }));
      if (entry === 'reconnect') {
        await waitFor(() => expect(result.current.status).toBe('offline'));
        expect(client.saveDraft).not.toHaveBeenCalled();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        act(() => { window.dispatchEvent(new Event('online')); });
      }
      await waitFor(() => expect(client.saveDraft).toHaveBeenCalledOnce());
      expect(client.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
        response: [{ interactionId: 'interaction-1', answer: 'latest local answer' }], clientRevision: 4,
      }));
      await waitFor(() => expect(result.current.status).toBe('saved'));
      expect(result.current.isDirty).toBe(false);
      expect(await recovery.get(key)).toBeNull();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: previousOnline });
    }
  });

  it('hydrates an exhausted submitted placement without allowing writes', async () => {
    const client = runtimeClient({ readDraft: vi.fn(async () => ({
      schemaVersion: 1, ...address, recipientId: 'student-1', interactionId: 'interaction-1',
      revision: 1, response: { text: 'submitted answer' }, updatedByOperationId: operationId,
      updatedAt: '2026-07-28T00:00:00.000Z',
    })) });
    const readTerminal = vi.fn(async () => ({ status: 'confirmed-present' as const, resultStatus: 'submitted' as const,
      responses: { 'interaction-1': { text: 'submitted answer' } } }));
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ['interaction-1'], storage: store(), canAutosave: false, canSubmit: false, readTerminal }));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.responses).toEqual({ 'interaction-1': { text: 'submitted answer' } });
    expect(result.current.terminalReadStatus).toBe('confirmed-present');
    expect(result.current.terminalReadResultStatus).toBe('submitted');
    act(() => { expect(result.current.change('interaction-1', { text: 'overwrite' })).toBe(false); });
    await act(async () => { await result.current.flush(); await expect(result.current.submitActivity('interaction-1')).rejects.toThrow(); });
    expect(readTerminal).toHaveBeenCalledOnce();
    expect(client.readDraft).not.toHaveBeenCalled();
    expect(client.saveDraft).not.toHaveBeenCalled();
    expect(client.submitActivity).not.toHaveBeenCalled();
  });
  it('rejects edits during hydration and after a restored terminal', async () => {
    let resolveTerminal!: (value: { status: 'confirmed-present'; resultStatus: 'submitted'; responses: Record<string, unknown> }) => void;
    const readTerminal = () => new Promise<{ status: 'confirmed-present'; resultStatus: 'submitted'; responses: Record<string, unknown> }>((resolve) => { resolveTerminal = resolve; });
    const client = runtimeClient();
    const { result } = renderHook(() => useBookActivityRuntime({ client, recipientId: 'student-1', address,
      interactionIds: ['interaction-1'], storage: store(), readTerminal }));
    act(() => { expect(result.current.change('interaction-1', { text: 'early' })).toBe(false); });
    await act(async () => { resolveTerminal({ status: 'confirmed-present', resultStatus: 'submitted', responses: {} }); });
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
    const readTerminal = vi.fn(async () => committed ? { status: 'confirmed-present' as const, resultStatus: 'submitted' as const,
      responses: { 'interaction-1': { text: 'final' } } } : { status: 'confirmed-absent' as const });
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
        response: [{ interactionId: 'interaction-1', answer: 'saved response' }],
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
      'interaction-1': [{ interactionId: 'interaction-1', answer: 'saved response' }],
    });
    expect(client.readDraft).toHaveBeenCalledOnce();
  });

  it('submits a saved choice snapshot through the current submission boundary', async () => {
    const response = [{ interactionId: 'interaction-1', answer: ['option-a'] }];
    const client = runtimeClient({
      readDraft: vi.fn(async () => ({
        schemaVersion: 1 as const,
        ...address,
        recipientId: 'student-1',
        interactionId: 'interaction-1',
        revision: 1,
        response,
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
    expect(client.submitActivity).toHaveBeenCalledWith(expect.objectContaining({ response }));
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
      response: [{ interactionId: 'interaction-1', answer: 'draft' }],
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
    const operationPayloads = new Map<string, string>();
    let inFlight = 0;
    let maxInFlight = 0;
    const client = runtimeClient({
      saveDraft: vi.fn(async (input) => {
        callCount += 1;
        const payload = JSON.stringify(input.response);
        const previousPayload = operationPayloads.get(input.operationId);
        operationPayloads.set(input.operationId, payload);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (callCount === 1) await firstSave;
        inFlight -= 1;
        if (previousPayload !== undefined && previousPayload !== payload) {
          return {
            status: 'conflict' as const,
            receipt: {
              operationId: input.operationId, fingerprint: '', status: 'conflict' as const, bindingId: input.bindingId,
              draftRevision: input.clientRevision, createdAt: '2026-07-28T00:00:00.000Z',
            },
          };
        }
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
      interactionIds: ['interaction-1', 'interaction-2'],
      storage: store(),
      debounceMs: 20,
      tabId: 'tab-1',
    }));

    act(() => { result.current.change('interaction-1', { text: 'first' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); await Promise.resolve(); });
    act(() => { result.current.change('interaction-1', { text: 'latest' }); result.current.change('interaction-2', { text: 'second' }); });
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
      response: [{ interactionId: 'interaction-1', answer: 'latest' }, { interactionId: 'interaction-2', answer: 'second' }],
      clientRevision: 1,
    }));
    expect(result.current.status).toBe('saved');
    expect(result.current.isDirty).toBe(false);
    await act(async () => { await result.current.submitActivity('interaction-1'); });
    expect(client.submitActivity).toHaveBeenCalledWith(expect.objectContaining({
      response: [{ interactionId: 'interaction-1', answer: 'latest' }, { interactionId: 'interaction-2', answer: 'second' }],
    }));
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
      act(() => { result.current.change('interaction-1', { text: String(index) }); });
      await act(async () => { await result.current.flush('navigation'); });
    }
    expect(client.saveDraft).toHaveBeenCalledTimes(6);

    rerender({ currentAddress: { ...address, bindingId: 'binding-addition', bindingRevision: 2, activityVersion: 2 } });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => { result.current.change('interaction-1', { text: '6' }); });
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
        response: [{ interactionId: 'interaction-1', answer: 'server' }],
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
      localResponse: [{ interactionId: 'interaction-1', answer: 'local' }],
      serverResponse: [{ interactionId: 'interaction-1', answer: 'server' }],
      serverRevision: 2,
    });
  });

  it('reloads acknowledged server state and discards retained local state', async () => {
    let serverResponse: unknown = [{ interactionId: 'interaction-1', answer: 'server' }];
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

    await waitFor(() => expect(result.current.responses).toEqual({ 'interaction-1': [{ interactionId: 'interaction-1', answer: 'server' }] }));
    act(() => { result.current.change('interaction-1', { text: 'local' }); });
    await act(async () => { await result.current.discardLocal(); });
    expect(result.current.responses).toEqual({ 'interaction-1': [{ interactionId: 'interaction-1', answer: 'server' }] });
    serverResponse = [{ interactionId: 'interaction-1', answer: 'reloaded' }];
    await act(async () => { await result.current.reload(); });
    expect(result.current.responses).toEqual({ 'interaction-1': [{ interactionId: 'interaction-1', answer: 'reloaded' }] });
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

  it('restores committed answers after remount when submission cleared the drafts', async () => {
    const terminal = {
      status: 'confirmed-present' as const,
      resultStatus: 'submitted' as const,
      responses: { 'interaction-1': { text: 'submitted response' }, 'interaction-2': { selectedOptionId: 'option-a' } },
    };
    const client = runtimeClient();
    const readTerminal = vi.fn(async () => terminal);
    const options = {
      client,
      recipientId: 'student-1',
      address,
      interactionIds: ['interaction-1', 'interaction-2'],
      storage: store(),
      readTerminal,
    };
    const first = renderHook(() => useBookActivityRuntime(options));
    await waitFor(() => expect(first.result.current.terminalReadStatus).toBe('confirmed-present'));
    first.unmount();

    const second = renderHook(() => useBookActivityRuntime(options));
    await waitFor(() => expect(second.result.current.terminalReadStatus).toBe('confirmed-present'));
    expect(second.result.current.responses).toEqual(terminal.responses);
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
    let resolveFirst!: (value: { readonly status: 'confirmed-present'; readonly resultStatus: 'submitted'; readonly responses: Record<string, unknown> }) => void;
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
    resolveFirst({ status: 'confirmed-present', resultStatus: 'submitted', responses: {} });

    await waitFor(() => expect(result.current.terminalReadStatus).toBe('confirmed-absent'));
    expect(result.current.terminalReadResultStatus).toBeNull();
  });
});
