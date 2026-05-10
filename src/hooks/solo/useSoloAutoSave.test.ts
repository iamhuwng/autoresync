import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoloAutoSave, clearSoloProgress, cleanupExpiredProgress } from './useSoloAutoSave';
import type { SavedMobileState } from '../../types/practice.types';
import { buildLegacySoloProgressStorageKey, buildSoloProgressStorageKey } from '../../services/soloProgress.service';

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
  kind: 'reading',
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
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
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
      buildSoloProgressStorageKey({
        materialId: 'material-1',
        studentId: 'student-1',
        scopeContext: { mode: 'self_study' },
      }),
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

  it('flushes progress when the app backgrounds before the interval elapses', async () => {
    renderHook(() =>
      useSoloAutoSave({
        materialId: 'material-1',
        studentId: 'student-1',
        answers: { 1: 'A' },
        currentQuestion: 2,
        timeElapsed: 45,
        mobileState: sampleMobileState,
        enabled: true,
      }),
    );

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStorageSet).toHaveBeenCalledWith(
      buildSoloProgressStorageKey({
        materialId: 'material-1',
        studentId: 'student-1',
        scopeContext: { mode: 'self_study' },
      }),
      expect.objectContaining({
        currentQuestion: 2,
        timeElapsed: 45,
        mobileState: sampleMobileState,
      }),
    );
  });

  it('flushes progress on unmount before the interval elapses', async () => {
    const { unmount } = renderHook(() =>
      useSoloAutoSave({
        materialId: 'material-1',
        studentId: 'student-1',
        answers: { 1: 'B' },
        currentQuestion: 6,
        timeElapsed: 90,
        mobileState: sampleMobileState,
        enabled: true,
      }),
    );

    await act(async () => {
      unmount();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStorageSet).toHaveBeenCalledWith(
      buildSoloProgressStorageKey({
        materialId: 'material-1',
        studentId: 'student-1',
        scopeContext: { mode: 'self_study' },
      }),
      expect.objectContaining({
        answers: { 1: 'B' },
        currentQuestion: 6,
        timeElapsed: 90,
      }),
    );
  });

  it('does not force-save on rerender when scopeContext identity changes', async () => {
    const { rerender } = renderHook(
      ({ currentQuestion, timeElapsed }) =>
        useSoloAutoSave({
          materialId: 'material-1',
          studentId: 'student-1',
          scopeContext: {
            mode: 'course_material',
            courseId: 'course-1',
            moduleId: 'module-1',
          },
          answers: { 1: 'A' },
          currentQuestion,
          timeElapsed,
          mobileState: sampleMobileState,
          enabled: true,
        }),
      {
        initialProps: {
          currentQuestion: 1,
          timeElapsed: 0,
        },
      },
    );

    await act(async () => {
      rerender({ currentQuestion: 2, timeElapsed: 1 });
      rerender({ currentQuestion: 3, timeElapsed: 2 });
      rerender({ currentQuestion: 4, timeElapsed: 3 });
      await Promise.resolve();
    });

    expect(mockStorageSet).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStorageSet).toHaveBeenCalledTimes(1);
    expect(mockStorageSet).toHaveBeenCalledWith(
      buildSoloProgressStorageKey({
        materialId: 'material-1',
        studentId: 'student-1',
        scopeContext: {
          mode: 'course_material',
          courseId: 'course-1',
          moduleId: 'module-1',
        },
      }),
      expect.objectContaining({
        currentQuestion: 4,
        timeElapsed: 3,
      }),
    );
  });
});

describe('clearSoloProgress (submit clears saved state)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageRemove.mockResolvedValue(undefined);
  });

  it('removes the storage key for the given material and student', async () => {
    await clearSoloProgress('material-1', 'student-1');

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

  it('removes mobileState along with all other progress fields', async () => {
    // Pre-store progress with mobileState
    mockStorageSet.mockResolvedValue(undefined);
    await mockStorageSet(buildSoloProgressStorageKey({
      materialId: 'material-1',
      studentId: 'student-1',
      scopeContext: { mode: 'self_study' },
    }), {
      materialId: 'material-1',
      studentId: 'student-1',
      answers: { 1: 'A' },
      currentQuestion: 4,
      timeElapsed: 125,
      startedAt: 1000,
      lastSavedAt: Date.now(),
      mobileState: {
        kind: 'listening',
        version: 1,
        viewedPartNumber: 2,
        currentQuestionNumber: 15,
      },
    });

    // Clear it
    await clearSoloProgress('material-1', 'student-1');

    // The remove call erases the entire blob (including mobileState)
    expect(mockStorageRemove).toHaveBeenCalledWith(
      buildSoloProgressStorageKey({
        materialId: 'material-1',
        studentId: 'student-1',
        scopeContext: { mode: 'self_study' },
      }),
    );
  });
});

describe('cleanupExpiredProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageRemove.mockResolvedValue(undefined);
  });

  it('cleans recognized solo-practice keys without deleting unrelated legacy namespaces', async () => {
    mockStorageKeys.mockImplementation(async (prefix?: string) => {
      if (prefix === 'solo_progress_v2__') {
        return ['solo_progress_v2__self_study__student-1__material-1'];
      }

      if (prefix === 'solo_progress_') {
        return [
          'solo_progress_v2__self_study__student-1__material-1',
          'solo_progress_audio-material-1',
        ];
      }

      return [];
    });
    mockStorageGet.mockImplementation(async (key: string) => {
      if (key === 'solo_progress_v2__self_study__student-1__material-1') {
        return {
          materialId: 'material-1',
          studentId: 'student-1',
          answers: { 1: 'A' },
          currentQuestion: 1,
          timeElapsed: 10,
          startedAt: 1,
          lastSavedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        };
      }

      if (key === 'solo_progress_audio-material-1') {
        return {
          testId: 'audio-material-1',
          section: 1,
          position: 24,
          savedAt: Date.now(),
        };
      }

      return null;
    });

    await cleanupExpiredProgress();

    expect(mockStorageRemove).toHaveBeenCalledWith('solo_progress_v2__self_study__student-1__material-1');
    expect(mockStorageRemove).not.toHaveBeenCalledWith('solo_progress_audio-material-1');
  });
});
