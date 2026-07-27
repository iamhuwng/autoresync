import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BookRuntimeClient,
  BookRuntimeDraftAddress,
} from '../../services/book-activity/activityRuntime.browser';
import { BookRuntimeClientError } from '../../services/book-activity/activityRuntime.browser';
import { useBookActivityRuntime, type BookRuntimeRecoveryStore } from './useBookActivityRuntime';

const address: Omit<BookRuntimeDraftAddress, 'interactionId'> = {
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextId: 'context-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
};

const operationId = '00000000-0000-4000-8000-000000000076';

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
  ...overrides,
});

describe('useBookActivityRuntime', () => {
  afterEach(() => {
    vi.useRealTimers();
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
      await vi.advanceTimersByTimeAsync(20);
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
    await act(async () => { await vi.advanceTimersByTimeAsync(20); await Promise.resolve(); });
    act(() => { result.current.change('interaction-1', { text: 'latest' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(20); await Promise.resolve(); });
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
    await act(async () => { await vi.advanceTimersByTimeAsync(20); await Promise.resolve(); });
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
    const client = runtimeClient({
      saveDraft: vi.fn(() => new Promise<never>(() => {})),
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
});
