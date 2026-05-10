import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoloResume } from './useSoloResume';
import type { SoloSessionProgress } from '../../types/practice.types';
import { buildLegacySoloProgressStorageKey, buildSoloProgressStorageKey } from '../../services/soloProgress.service';

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
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('removes expired progress and returns null (homework expiration clears saved state)', async () => {
    const expiredProgress: SoloSessionProgress = {
      materialId: 'material-1',
      studentId: 'student-1',
      answers: { 1: 'A' },
      currentQuestion: 4,
      timeElapsed: 125,
      startedAt: 1000,
      lastSavedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago — expired
      mobileState: {
        kind: 'listening',
        version: 1,
        viewedPartNumber: 2,
        currentQuestionNumber: 15,
      } as any,
    };

    mockStorageGet.mockResolvedValueOnce(expiredProgress);

    const { result } = renderHook(() =>
      useSoloResume({
        materialId: 'material-1',
        studentId: 'student-1',
      }),
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    // Expired progress should be null
    expect(result.current.savedProgress).toBeNull();
    // Storage key should have been removed
    expect(mockStorageRemove).toHaveBeenCalledWith(
      buildSoloProgressStorageKey({
        materialId: 'material-1',
        studentId: 'student-1',
        scopeContext: { mode: 'self_study' },
      }),
    );
  });

  it('discardProgress removes stored key and clears savedProgress', async () => {
    const savedProgress: SoloSessionProgress = {
      materialId: 'material-1',
      studentId: 'student-1',
      answers: { 1: 'A' },
      currentQuestion: 4,
      timeElapsed: 125,
      startedAt: 1000,
      lastSavedAt: Date.now(),
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

    expect(result.current.savedProgress).not.toBeNull();

    // Discard
    act(() => {
      result.current.discardProgress();
    });

    expect(result.current.savedProgress).toBeNull();
    expect(mockStorageRemove).toHaveBeenCalledWith(
      buildSoloProgressStorageKey({
        materialId: 'material-1',
        studentId: 'student-1',
        scopeContext: { mode: 'self_study' },
      }),
    );
    expect(mockStorageRemove).toHaveBeenCalledWith(
      buildLegacySoloProgressStorageKey('material-1', 'student-1'),
    );
  });

  it('returns null when materialId or studentId is missing', async () => {
    const { result } = renderHook(() =>
      useSoloResume({
        materialId: undefined,
        studentId: 'student-1',
      }),
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.savedProgress).toBeNull();
    expect(mockStorageGet).not.toHaveBeenCalled();
  });

  it('does not re-read progress when the scopeContext identity changes without semantic changes', async () => {
    const savedProgress: SoloSessionProgress = {
      materialId: 'material-1',
      studentId: 'student-1',
      answers: { 1: 'A' },
      currentQuestion: 2,
      timeElapsed: 45,
      startedAt: 1000,
      lastSavedAt: Date.now(),
    };

    mockStorageGet.mockResolvedValue(savedProgress);

    const { result, rerender } = renderHook(
      ({ scopeContext }) => useSoloResume({
        materialId: 'material-1',
        studentId: 'student-1',
        scopeContext,
      }),
      {
        initialProps: {
          scopeContext: {
            mode: 'homework' as const,
            homeworkId: 'hw-1',
            submissionId: 'sub-1',
          },
        },
      },
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(mockStorageGet).toHaveBeenCalledTimes(1);

    rerender({
      scopeContext: {
        mode: 'homework' as const,
        homeworkId: 'hw-1',
        submissionId: 'sub-1',
      },
    });

    await waitFor(() => {
      expect(result.current.savedProgress).toEqual(savedProgress);
    });

    expect(mockStorageGet).toHaveBeenCalledTimes(1);
  });
});
