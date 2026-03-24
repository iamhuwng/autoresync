import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistoricalScores } from './useHistoricalScores';
import type { TestResultRecord } from '../services/testResults.service';

const { getHistoricalScoresMock } = vi.hoisted(() => ({
  getHistoricalScoresMock: vi.fn(),
}));

vi.mock('../services/testResults.service', () => ({
  getHistoricalScores: (...args: unknown[]) => getHistoricalScoresMock(...args),
}));

function makeResult(resultId: string, percentage: number): TestResultRecord {
  return {
    resultId,
    testId: 'test-1',
    testTitle: 'Reading Test',
    testType: 'reading',
    testSkill: 'reading',
    studentId: 'student-1',
    totalScore: percentage / 10,
    maxScore: 10,
    percentage,
    correct: Math.round(percentage / 10),
    incorrect: 10 - Math.round(percentage / 10),
    partialCredit: 0,
    totalQuestions: 10,
    submittedAt: Date.now(),
    questionResults: [],
  } as TestResultRecord;
}

describe('useHistoricalScores', () => {
  const anchorResult = makeResult('anchor-1', 70);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty data and skips loading when required inputs are missing', () => {
    const { result, rerender } = renderHook(
      ({ studentId, anchor }) => useHistoricalScores(studentId, anchor, 5),
      {
        initialProps: { studentId: undefined as string | undefined, anchor: anchorResult as TestResultRecord | null },
      },
    );

    expect(result.current).toEqual({
      scores: [],
      loading: false,
      error: null,
    });

    rerender({ studentId: 'student-1', anchor: null });

    expect(result.current).toEqual({
      scores: [],
      loading: false,
      error: null,
    });
    expect(getHistoricalScoresMock).not.toHaveBeenCalled();
  });

  it('loads historical scores using the anchor result id as the effect key', async () => {
    getHistoricalScoresMock.mockResolvedValue([
      makeResult('anchor-1', 70),
      makeResult('older-1', 62),
    ]);

    const { result } = renderHook(() => useHistoricalScores('student-1', anchorResult, 5));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getHistoricalScoresMock).toHaveBeenCalledWith('student-1', anchorResult, 5);
    expect(result.current.scores.map((score: TestResultRecord) => score.resultId)).toEqual([
      'anchor-1',
      'older-1',
    ]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces service errors as a message string', async () => {
    getHistoricalScoresMock.mockRejectedValue(new Error('history lookup failed'));

    const { result } = renderHook(() => useHistoricalScores('student-1', anchorResult, 5));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.scores).toEqual([]);
    expect(result.current.error).toBe('history lookup failed');
  });
});
