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
  revisionToken: 'autosave-rev-1',
});

describe('useReadingV2StudioAutosave', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules queued Studio draft snapshots outside the shell and reports the saved revision', async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => ({ revisionToken: 'autosave-rev-2' }));
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
      revisionToken: 'autosave-rev-2',
    });

    unmount();
  });

  it('does not save when autosave is disabled', async () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn(async () => ({ revisionToken: 'unused' }));
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
      .mockResolvedValueOnce({ revisionToken: 'autosave-recovered-rev' });
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
      revisionToken: 'autosave-recovered-rev',
    });

    unmount();
  });

  it('preserves newer edits queued while an autosave is in flight', async () => {
    vi.useFakeTimers();
    let resolveFirstSave: ((value: { revisionToken: string }) => void) | undefined;
    const saveDraft = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ revisionToken: string }>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce({ revisionToken: 'autosave-rev-3' });
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
      resolveFirstSave?.({ revisionToken: 'autosave-rev-2' });
    });

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({
      document: expect.objectContaining({ title: 'Second queued title' }),
      revisionToken: 'autosave-rev-2',
    }));

    unmount();
  });
});
