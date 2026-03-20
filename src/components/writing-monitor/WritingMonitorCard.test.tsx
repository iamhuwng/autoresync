import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingMonitorCard from './WritingMonitorCard';

const { onValueMock, refMock } = vi.hoisted(() => ({
  onValueMock: vi.fn(),
  refMock: vi.fn((_database, path: string) => path),
}));

vi.mock('firebase/database', () => ({
  ref: refMock,
  onValue: onValueMock,
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

describe('WritingMonitorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows offline state without peek or reopen actions when disconnected', () => {
    onValueMock.mockImplementation((_ref, callback) => {
      callback({
        exists: () => false,
        val: () => null,
      });
      return () => {};
    });

    render(
      <WritingMonitorCard
        sessionCode="ABC123"
        studentUid="student-1"
        studentName="Student One"
        status="disconnected"
        testFormat="full-test"
        onPeek={vi.fn()}
        onReopen={vi.fn()}
      />,
    );

    expect(screen.getByText('⚠ Offline')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Peek/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reopen/i })).not.toBeInTheDocument();
  });

  it('shows reopen for submitted writing students and hides peek', () => {
    onValueMock.mockImplementation((_ref, callback) => {
      callback({
        exists: () => true,
        val: () => ({
          submitted: true,
          task2: { text: 'sample essay', lastSavedAt: Date.now() },
        }),
      });
      return () => {};
    });

    render(
      <WritingMonitorCard
        sessionCode="ABC123"
        studentUid="student-2"
        studentName="Student Two"
        status="submitted"
        testFormat="task2-only"
        onPeek={vi.fn()}
        onReopen={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Reopen/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Peek/i })).not.toBeInTheDocument();
  });
});
