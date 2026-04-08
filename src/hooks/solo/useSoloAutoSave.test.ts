import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoloAutoSave } from './useSoloAutoSave';
import type { SavedMobileState } from '../../types/practice.types';

const {
  mockStorageGet,
  mockStorageSet,
  mockStorageRemove,
  mockStorageKeys,
} = vi.hoisted(() => ({
  mockStorageGet: vi.fn(),
  mockStorageSet: vi.fn(),
  mockStorageRemove: vi.fn(),
  mockStorageKeys: vi.fn(),
}));

vi.mock('@/core/platform/storage', () => ({
  storage: {
    get: (...args: unknown[]) => mockStorageGet(...args),
    set: (...args: unknown[]) => mockStorageSet(...args),
    remove: (...args: unknown[]) => mockStorageRemove(...args),
    keys: (...args: unknown[]) => mockStorageKeys(...args),
  },
}));

const sampleMobileState: SavedMobileState = {
  activePassageId: 'p1',
  questionSheetOpen: true,
  reviewSummaryOpen: false,
  passageScrollByPassage: { p1: 140 },
  activeQuestionGroupByPassage: { p1: 3 },
  questionSheetScrollByPassage: { p1: 90 },
  textSize: 17,
};

describe('useSoloAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockStorageGet.mockResolvedValue(null);
    mockStorageSet.mockResolvedValue(undefined);
    mockStorageRemove.mockResolvedValue(undefined);
    mockStorageKeys.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('stores mobileState through the storage abstraction', async () => {
    const { result, unmount } = renderHook(() =>
      useSoloAutoSave({
        materialId: 'material-1',
        studentId: 'student-1',
        answers: { 1: 'A' },
        currentQuestion: 4,
        timeElapsed: 125,
        mobileState: sampleMobileState,
        enabled: true,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStorageSet).toHaveBeenCalledWith(
      'solo_progress_material-1_student-1',
      expect.objectContaining({
        answers: { 1: 'A' },
        currentQuestion: 4,
        timeElapsed: 125,
        mobileState: sampleMobileState,
      }),
    );

    expect(result.current.status).toBe('saved');
    expect(result.current.error).toBeNull();
    expect(result.current.lastSaved).not.toBeNull();
    unmount();
  });

  it('returns error status when the storage write fails', async () => {
    mockStorageSet.mockRejectedValueOnce(new Error('disk full'));

    const { result, unmount } = renderHook(() =>
      useSoloAutoSave({
        materialId: 'material-1',
        studentId: 'student-1',
        answers: { 1: 'A' },
        currentQuestion: 4,
        timeElapsed: 125,
        mobileState: sampleMobileState,
        enabled: true,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('disk full');
    unmount();
  });
});
