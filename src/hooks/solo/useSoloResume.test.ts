import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoloResume } from './useSoloResume';
import type { SoloSessionProgress } from '../../types/practice.types';

const {
  mockStorageGet,
  mockStorageRemove,
} = vi.hoisted(() => ({
  mockStorageGet: vi.fn(),
  mockStorageRemove: vi.fn(),
}));

vi.mock('@/core/platform/storage', () => ({
  storage: {
    get: (...args: unknown[]) => mockStorageGet(...args),
    remove: (...args: unknown[]) => mockStorageRemove(...args),
  },
}));

describe('useSoloResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageRemove.mockResolvedValue(undefined);
  });

  it('returns saved mobileState from stored progress', async () => {
    const savedProgress: SoloSessionProgress = {
      materialId: 'material-1',
      studentId: 'student-1',
      answers: { 1: 'A' },
      currentQuestion: 4,
      timeElapsed: 125,
      startedAt: 1000,
      lastSavedAt: Date.now(),
      mobileState: {
        activePassageId: 'p2',
        questionSheetOpen: true,
        reviewSummaryOpen: false,
        passageScrollByPassage: { p2: 200 },
        activeQuestionGroupByPassage: { p2: 6 },
        questionSheetScrollByPassage: { p2: 44 },
        textSize: 18,
      },
    };

    mockStorageGet.mockResolvedValueOnce(savedProgress);

    const { result } = renderHook(() =>
      useSoloResume({
        materialId: 'material-1',
        studentId: 'student-1',
      }),
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.savedProgress?.mobileState).toEqual(savedProgress.mobileState);
  });
});
