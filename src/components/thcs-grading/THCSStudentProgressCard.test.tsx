import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THCSStudentProgressCard } from './THCSStudentProgressCard';

describe('THCSStudentProgressCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows force submit for working students and hides reset', () => {
    const onForceSubmit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <THCSStudentProgressCard
        studentId="student-1"
        name="Student One"
        progress={40}
        answeredCount={4}
        totalQuestions={10}
        status="working"
        partBreakdown={[]}
        writingSubmitted={0}
        writingTotal={0}
        onForceSubmit={onForceSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Force Submit' }));

    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    expect(onForceSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows reset for submitted students and hides force submit', () => {
    const onResetSubmit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <THCSStudentProgressCard
        studentId="student-2"
        name="Student Two"
        progress={100}
        answeredCount={10}
        totalQuestions={10}
        status="submitted"
        partBreakdown={[]}
        writingSubmitted={0}
        writingTotal={0}
        onResetSubmit={onResetSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.queryByRole('button', { name: 'Force Submit' })).not.toBeInTheDocument();
    expect(onResetSubmit).toHaveBeenCalledTimes(1);
  });
});
