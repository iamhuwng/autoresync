import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestAttempts } from './useTestAttempts';
import type { TestResultRecord } from '../services/testResults.service';

const { getStudentTestAttemptsMock } = vi.hoisted(() => ({
  getStudentTestAttemptsMock: vi.fn(),
}));

vi.mock('../services/testResults.service', () => ({
  getStudentTestAttempts: (...args: unknown[]) => getStudentTestAttemptsMock(...args),
}));

function makeAttempt(resultId: string, submittedAt: number): TestResultRecord {
  return {
    resultId,
    testId: 'test-1',
    testTitle: 'Reading Test',
    testType: 'reading',
    testSkill: 'reading',
    studentId: 'student-1',
    totalScore: 8,
    maxScore: 10,
    percentage: 80,
    correct: 8,
    incorrect: 2,
    partialCredit: 0,
    totalQuestions: 10,
    submittedAt,
    questionResults: [],
  } as TestResultRecord;
}

describe('useTestAttempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty data and skips loading when inputs are missing', () => {
    const { result, rerender } = renderHook(
      ({ studentId, testId }) => useTestAttempts(studentId, testId),
      {
        initialProps: { studentId: undefined as string | undefined, testId: 'test-1' as string | undefined },
      },
    );

    expect(result.current).toEqual({
      attempts: [],
      loading: false,
      error: null,
    });

    rerender({ studentId: 'student-1', testId: undefined });

    expect(result.current).toEqual({
      attempts: [],
      loading: false,
      error: null,
    });
    expect(getStudentTestAttemptsMock).not.toHaveBeenCalled();
  });

  it('loads attempts for the student and test id', async () => {
    getStudentTestAttemptsMock.mockResolvedValue([
      makeAttempt('result-2', 200),
      makeAttempt('result-1', 100),
    ]);

    const { result } = renderHook(() => useTestAttempts('student-1', 'test-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getStudentTestAttemptsMock).toHaveBeenCalledWith('student-1', 'test-1');
    expect(result.current.attempts.map((attempt: TestResultRecord) => attempt.resultId)).toEqual([
      'result-2',
      'result-1',
    ]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces service errors as a message string', async () => {
    getStudentTestAttemptsMock.mockRejectedValue(new Error('attempt lookup failed'));

    const { result } = renderHook(() => useTestAttempts('student-1', 'test-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.attempts).toEqual([]);
    expect(result.current.error).toBe('attempt lookup failed');
  });
});
