import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestAutoSave } from './useTestAutoSave';
import type { SavedMobileState } from '../types/practice.types';

const {
  mockUpdate,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_: unknown, path: string) => path),
  update: (...args: unknown[]) => mockUpdate(...args),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

const sampleMobileState: SavedMobileState = {
  activePassageId: 'p2',
  questionSheetOpen: true,
  reviewSummaryOpen: false,
  passageScrollByPassage: { p1: 120, p2: 280 },
  activeQuestionGroupByPassage: { p2: 7 },
  questionSheetScrollByPassage: { p2: 96 },
  textSize: 18,
};

describe('useTestAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('writes mobileState to the player path when provided', async () => {
    const { unmount } = renderHook(() =>
      useTestAutoSave({
        sessionCode: 'SESSION123',
        studentId: 'student-1',
        answers: {
          1: 'A',
        },
        mobileState: sampleMobileState,
        debounceDelay: 2000,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      'game_sessions/SESSION123/players/student-1',
      expect.objectContaining({
        mobileState: sampleMobileState,
        answers: expect.objectContaining({
          1: expect.objectContaining({ answer: 'A' }),
        }),
      }),
    );

    unmount();
  });

  it('still saves after rerenders with equivalent mobileState snapshots', async () => {
    const { rerender, unmount } = renderHook(
      ({ answers, mobileState }) =>
        useTestAutoSave({
          sessionCode: 'SESSION123',
          studentId: 'student-1',
          answers,
          mobileState,
          debounceDelay: 2000,
        }),
      {
        initialProps: {
          answers: { 5: 'G' },
          mobileState: sampleMobileState,
        },
      },
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    rerender({
      answers: { 5: 'G' },
      mobileState: {
        ...sampleMobileState,
        passageScrollByPassage: { ...sampleMobileState.passageScrollByPassage },
        activeQuestionGroupByPassage: { ...sampleMobileState.activeQuestionGroupByPassage },
        questionSheetScrollByPassage: { ...sampleMobileState.questionSheetScrollByPassage },
      },
    });

    await act(async () => {
      vi.advanceTimersByTime(2200);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      mockUpdate.mock.calls.some(
        ([path, payload]) =>
          path === 'game_sessions/SESSION123/players/student-1'
          && payload
          && typeof payload === 'object'
          && 'answers' in (payload as Record<string, unknown>)
          && Boolean((payload as { answers?: Record<string, { answer?: string }> }).answers?.['5']?.answer === 'G'),
      ),
    ).toBe(true);

    unmount();
  });
});
