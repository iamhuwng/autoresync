import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestCompletionCheck } from './useTestCompletionCheck';
import {
  getAttemptInfo,
  getLatestSubmission,
  getSubmissionById,
} from '../../services/homeworkSubmissionService';

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));
const { mockTrackAntiCheatAction } = vi.hoisted(() => ({
  mockTrackAntiCheatAction: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  onValue: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('../../services/sessionService', () => ({
  sessionService: {
    getPlayerId: vi.fn(),
    getPlayerName: vi.fn(() => 'Student'),
  },
}));

vi.mock('../../services/homeworkSubmissionService', () => ({
  getAttemptInfo: vi.fn(),
  getLatestSubmission: vi.fn(),
  getSubmissionById: vi.fn(),
}));

vi.mock('../../services/antiCheatReporting', () => ({
  trackAntiCheatAction: mockTrackAntiCheatAction,
}));

describe('useTestCompletionCheck homework mode', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockTrackAntiCheatAction.mockReset();
    vi.mocked(getAttemptInfo).mockResolvedValue({
      maxAttempts: 1,
      usedAttempts: 0,
      remainingAttempts: 1,
      canAttempt: true,
      attemptsNullified: false,
    });
    vi.mocked(getLatestSubmission).mockResolvedValue(null);
    vi.mocked(getSubmissionById).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects when attempts were nullified', async () => {
    vi.mocked(getAttemptInfo).mockResolvedValue({
      maxAttempts: null,
      usedAttempts: 0,
      remainingAttempts: 0,
      canAttempt: false,
      attemptsNullified: true,
    });

    renderHook(() =>
      useTestCompletionCheck({
        sessionCode: undefined,
        enabled: true,
        mode: 'homework',
        homeworkId: 'hw-1',
        studentId: 'student-1',
      }),
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/student/homework/hw-1', { replace: true });
    });
    expect(mockTrackAntiCheatAction).toHaveBeenCalledWith(
      'blockHomeworkEntry',
      expect.objectContaining({
        context: 'homework',
        homeworkId: 'hw-1',
      }),
      expect.objectContaining({
        reason: 'attempts_nullified',
      }),
    );
  });

  it('redirects when the latest homework submission is already submitted', async () => {
    vi.mocked(getLatestSubmission).mockResolvedValue({
      id: 'submission-1',
      status: 'submitted',
    } as any);

    renderHook(() =>
      useTestCompletionCheck({
        sessionCode: undefined,
        enabled: true,
        mode: 'homework',
        homeworkId: 'hw-2',
        studentId: 'student-2',
      }),
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/student/homework/hw-2', { replace: true });
    });
  });

  it('does not redirect when resuming a valid in-progress submission', async () => {
    vi.mocked(getSubmissionById).mockResolvedValue({
      id: 'submission-2',
      status: 'in_progress',
    } as any);

    renderHook(() =>
      useTestCompletionCheck({
        sessionCode: undefined,
        enabled: true,
        mode: 'homework',
        homeworkId: 'hw-3',
        studentId: 'student-3',
        submissionId: 'submission-2',
      }),
    );

    await waitFor(() => {
      expect(getAttemptInfo).toHaveBeenCalledWith('hw-3', 'student-3');
      expect(getSubmissionById).toHaveBeenCalledWith('submission-2');
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects when the requested submission is missing', async () => {
    vi.mocked(getAttemptInfo).mockResolvedValue({
      maxAttempts: 2,
      usedAttempts: 0,
      remainingAttempts: 2,
      canAttempt: true,
      attemptsNullified: false,
    });
    vi.mocked(getSubmissionById).mockResolvedValue(null);

    renderHook(() =>
      useTestCompletionCheck({
        sessionCode: undefined,
        enabled: true,
        mode: 'homework',
        homeworkId: 'hw-4',
        studentId: 'student-4',
        submissionId: 'missing-submission',
      }),
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/student/homework/hw-4', { replace: true });
    });
  });
});
