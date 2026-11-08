import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReadingV2CanonicalFixture } from '../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { useReadingV2StudioAutosave } from './useReadingV2StudioAutosave';
import type { ReadingV2StudioWorkflowSnapshot } from '../../components/reading-v2/studio/ReadingV2StudioShell';

const createSnapshot = (title: string): ReadingV2StudioWorkflowSnapshot => ({
  draftId: 'autosave-draft',
  materialId: 'autosave-material',
  document: { ...createReadingV2CanonicalFixture('sentence-completion'), title },
  metadata: {
    title,
    productMarker: 'Reading V2',
    materialKind: 'full-test',
    durationMinutes: 60,
    difficulty: 'intermediate',
    targetBand: 'Band 6-7',
    description: '',
    tags: [],
    visibility: 'private',
    ownerId: 'teacher-1',
    provenanceSummary: 'Autosave test',
  },
  revision: 1,
});

describe('useReadingV2StudioAutosave', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules queued Studio draft snapshots outside the shell and reports the saved revision', async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => ({ revision: 2 }));
    const onResult = vi.fn();
    const { result, unmount } = renderHook(() =>
      useReadingV2StudioAutosave({
        autosaveKey: 'autosave-draft',
        enabled: true,
        intervalMs: 100,
        saveDraft,
        onResult,
      }),
    );

    act(() => {
      result.current.queueAutosave(createSnapshot('Queued title'));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'autosave-draft',
      document: expect.objectContaining({ title: 'Queued title' }),
    }));
    expect(onResult).toHaveBeenCalledWith({
      status: 'saved',
      draftId: 'autosave-draft',
      revision: 2,
    });

    unmount();
  });

  it('does not save when autosave is disabled', async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => ({ revision: 1 }));
    const { result, unmount } = renderHook(() =>
      useReadingV2StudioAutosave({
        autosaveKey: 'autosave-disabled',
        enabled: false,
        intervalMs: 100,
        saveDraft,
      }),
    );

    act(() => {
      result.current.queueAutosave(createSnapshot('Disabled title'));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(saveDraft).not.toHaveBeenCalled();

    unmount();
  });

  it('reports autosave conflicts without dropping the queued draft and saves after recovery', async () => {
    vi.useFakeTimers();
    const staleConflict = new Error('stale revision conflict');
    const saveDraft = vi
      .fn()
      .mockRejectedValueOnce(staleConflict)
      .mockResolvedValueOnce({ revision: 1 });
    const onResult = vi.fn();
    const { result, unmount } = renderHook(() =>
      useReadingV2StudioAutosave({
        autosaveKey: 'autosave-conflict-draft',
        enabled: true,
        intervalMs: 100,
        saveDraft,
        onResult,
      }),
    );

    act(() => {
      result.current.queueAutosave(createSnapshot('Recovered title'));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onResult).toHaveBeenCalledWith({
      status: 'failed',
      draftId: 'autosave-draft',
      error: staleConflict,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledWith({
      status: 'saved',
      draftId: 'autosave-draft',
      revision: 1,
    });

    unmount();
  });

  it('preserves newer edits queued while an autosave is in flight', async () => {
    vi.useFakeTimers();
    let resolveFirstSave: ((value: { revision: number }) => void) | undefined;
    const saveDraft = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ revision: number }>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce({ revision: 3 });
    const { result, unmount } = renderHook(() =>
      useReadingV2StudioAutosave({
        autosaveKey: 'autosave-draft',
        enabled: true,
        intervalMs: 100,
        saveDraft,
      }),
    );

    act(() => {
      result.current.queueAutosave(createSnapshot('First queued title'));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    act(() => {
      result.current.queueAutosave(createSnapshot('Second queued title'));
      resolveFirstSave?.({ revision: 2 });
    });

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({
      document: expect.objectContaining({ title: 'Second queued title' }),
      revision: 2,
    }));

    unmount();
  });

  it('retains work and releases the queue when an adapter throws synchronously', async () => {
    vi.useFakeTimers();
    const failure = new Error('synchronous adapter failure');
    const saveDraft = vi.fn()
      .mockImplementationOnce(() => { throw failure; })
      .mockResolvedValueOnce({ revision: 2 });
    const onResult = vi.fn();
    const { result } = renderHook(() => useReadingV2StudioAutosave({
      autosaveKey: 'draft-1', enabled: true, intervalMs: 100, saveDraft, onResult,
    }));
    act(() => result.current.queueAutosave(createSnapshot('Local work')));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: failure }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      document: expect.objectContaining({ title: 'Local work' }),
    }));
  });

  it('ignores obsolete callbacks and does not carry queued work to another session', async () => {
    vi.useFakeTimers();
    let finish: (value: { revision: number }) => void = () => {};
    const saveDraft = vi.fn()
      .mockImplementationOnce(() => new Promise<{ revision: number }>((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce({ revision: 1 });
    const onResult = vi.fn();
    const { result, rerender } = renderHook(({ session }) => useReadingV2StudioAutosave({
      autosaveKey: session, enabled: true, intervalMs: 100, saveDraft, onResult,
    }), { initialProps: { session: 'teacher-1:draft-1' } });
    act(() => result.current.queueAutosave(createSnapshot('Old work')));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => result.current.queueAutosave(createSnapshot('Old queued work')));
    rerender({ session: 'teacher-2:draft-2' });
    await act(async () => {
      finish({ revision: 1 });
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(onResult).not.toHaveBeenCalled();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    act(() => result.current.queueAutosave(createSnapshot('New work')));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'saved', revision: 1 }));
  });

  it('serializes a manual save behind autosave and includes context-only edits at the acknowledged revision', async () => {
    vi.useFakeTimers();
    let acknowledge: (value: { revision: number }) => void = () => {};
    const saveDraft = vi.fn()
      .mockImplementationOnce(() => new Promise<{ revision: number }>((resolve) => { acknowledge = resolve; }))
      .mockResolvedValueOnce({ revision: 3 });
    const { result } = renderHook(() => useReadingV2StudioAutosave({
      autosaveKey: 'teacher:draft', enabled: true, intervalMs: 100, saveDraft,
    }));
    act(() => result.current.queueAutosave(createSnapshot('Original')));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    const contextOnly = { ...createSnapshot('Original'), workflowOrigin: { mode: 'duplicate-material' as const } };
    let saved: Promise<{ revision: number }>;
    act(() => { saved = result.current.saveNow(contextOnly); });
    expect(saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => { acknowledge({ revision: 2 }); await saved; });
    expect(saveDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({
      revision: 2, workflowOrigin: { mode: 'duplicate-material' },
    }));
    expect(result.current.saveState).toBe('saved');
  });
});
