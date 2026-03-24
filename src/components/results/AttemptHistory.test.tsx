import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AttemptHistory } from './AttemptHistory';
import type { TestResultRecord } from '../../services/testResults.service';

function makeAttempt(overrides: Partial<TestResultRecord> = {}): TestResultRecord {
  return {
    resultId: 'result-1',
    sessionCode: 'session-1',
    testId: 'test-1',
    studentId: 'student-1',
    studentName: 'Student',
    totalScore: 8,
    maxScore: 10,
    percentage: 80,
    bandScore: 0,
    questionResults: [],
    correct: 8,
    incorrect: 2,
    partialCredit: 0,
    totalQuestions: 10,
    submittedAt: 1711000000000,
    timeElapsed: 900,
    testDuration: 1800,
    createdAt: 1711000000000,
    testTitle: 'Test',
    testType: 'reading',
    testSkill: 'reading',
    ...overrides,
  } as TestResultRecord;
}

describe('AttemptHistory', () => {
  it('hides when there is only one attempt', () => {
    render(
      <AttemptHistory
        currentResult={makeAttempt()}
        attempts={[makeAttempt()]}
        onAttemptChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('ah-root')).not.toBeInTheDocument();
  });

  it('renders attempt label and improvement text for multiple attempts', () => {
    const attempts = [
      makeAttempt({ resultId: 'result-3', percentage: 90, submittedAt: 3000 }),
      makeAttempt({ resultId: 'result-2', percentage: 75, submittedAt: 2000 }),
      makeAttempt({ resultId: 'result-1', percentage: 60, submittedAt: 1000 }),
    ];

    render(
      <AttemptHistory
        currentResult={attempts[0]}
        attempts={attempts}
        onAttemptChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Attempt 3 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('ah-improvement')).toHaveTextContent('+30% improvement');
  });

  it('calls onAttemptChange when a different attempt is selected', () => {
    const onAttemptChange = vi.fn();
    const attempts = [
      makeAttempt({ resultId: 'result-3', percentage: 90, submittedAt: 3000 }),
      makeAttempt({ resultId: 'result-2', percentage: 75, submittedAt: 2000 }),
      makeAttempt({ resultId: 'result-1', percentage: 60, submittedAt: 1000 }),
    ];

    render(
      <AttemptHistory
        currentResult={attempts[0]}
        attempts={attempts}
        onAttemptChange={onAttemptChange}
      />,
    );

    fireEvent.click(screen.getByTestId('ah-trigger'));
    fireEvent.click(screen.getByTestId('ah-option-2'));

    expect(onAttemptChange).toHaveBeenCalledWith('result-2');
  });
});
