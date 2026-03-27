import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  mockUseMonitorSession,
  mockUseMonitorControls,
  mockUseNavigation,
  mockUseHeadphonePermission,
  mockUsePagination,
  mockUseTimerExpiry,
  mockNotificationsShow,
  mockCalculateSessionStatistics,
  mockTrackAction,
} = vi.hoisted(() => ({
  mockUseMonitorSession: vi.fn(),
  mockUseMonitorControls: vi.fn(),
  mockUseNavigation: vi.fn(),
  mockUseHeadphonePermission: vi.fn(),
  mockUsePagination: vi.fn(),
  mockUseTimerExpiry: vi.fn(),
  mockNotificationsShow: vi.fn(),
  mockCalculateSessionStatistics: vi.fn(),
  mockTrackAction: vi.fn(),
}));

vi.mock('@mantine/core', () => ({
  Center: ({ children }: any) => <div>{children}</div>,
  Loader: () => <div>Loading...</div>,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: (...args: any[]) => mockNotificationsShow(...args),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ sessionCode: 'SESSION-1' }),
  };
});

vi.mock('../components/modern', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardBody: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../components/test/StudentProgressCard', () => ({
  StudentProgressCard: ({ name }: any) => <div data-testid="student-progress-card">{name}</div>,
}));

vi.mock('../components/test/IntegrityDetailPanel', () => ({
  IntegrityDetailPanel: ({ isOpen, studentName, report }: any) => (
    isOpen ? (
      <div data-testid="integrity-detail-panel">
        {studentName}::{report.violationCount}
      </div>
    ) : null
  ),
}));

vi.mock('../components/test/TeacherTestControlBar', () => ({
  TeacherTestControlBar: () => <div data-testid="teacher-control-bar" />,
}));

vi.mock('../components/test/StudentDetailModal', () => ({
  StudentDetailModal: () => null,
}));

vi.mock('../components/test/AudioProgressPanel', () => ({
  AudioProgressPanel: () => null,
}));

vi.mock('../components/test/HeadphoneRequestPanel', () => ({
  HeadphoneRequestPanel: () => null,
}));

vi.mock('../components/test/CountdownWarningModal', () => ({
  CountdownWarningModal: () => null,
}));

vi.mock('../components/test/AccommodationStatusBar', () => ({
  AccommodationStatusBar: () => null,
}));

vi.mock('../components/thcs-grading/THCSStudentProgressCard', () => ({
  THCSStudentProgressCard: () => null,
}));

vi.mock('../components/thcs-grading/InlineWritingGrader', () => ({
  InlineWritingGrader: () => null,
}));

vi.mock('../components/writing-monitor/WritingMonitorCard', () => ({
  default: () => null,
}));

vi.mock('../components/writing-monitor/WritingPeekModal', () => ({
  default: () => null,
}));

vi.mock('../hooks/monitor', () => ({
  useMonitorSession: (...args: any[]) => mockUseMonitorSession(...args),
  useMonitorControls: (...args: any[]) => mockUseMonitorControls(...args),
}));

vi.mock('../hooks/audio/useHeadphonePermission', () => ({
  useHeadphonePermission: (...args: any[]) => mockUseHeadphonePermission(...args),
}));

vi.mock('../hooks/monitor/usePagination', () => ({
  usePagination: (...args: any[]) => mockUsePagination(...args),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: (...args: any[]) => mockUseNavigation(...args),
}));

vi.mock('../hooks/test/useTimerExpiry', () => ({
  useTimerExpiry: (...args: any[]) => mockUseTimerExpiry(...args),
}));

vi.mock('../utils/monitor', () => ({
  calculateSessionStatistics: (...args: any[]) => mockCalculateSessionStatistics(...args),
  transformAnswersForModal: vi.fn(() => []),
}));

vi.mock('../services/writingSubmissionService', () => ({
  autoSubmitFromRTDB: vi.fn(),
}));

vi.mock('../services/sessionStudentControlService', () => ({
  requestIntegrityLogRefresh: vi.fn(),
  requestTeacherForceSubmit: vi.fn(),
  resetStudentSessionSubmission: vi.fn(),
}));

vi.mock('../services/reportingService', () => ({
  reportingService: {
    trackAction: (...args: any[]) => mockTrackAction(...args),
  },
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

import TeacherTestMonitorPage from './TeacherTestMonitorPage';

const STUDENTS = [
  {
    studentId: 'student-1',
    name: 'Ada',
    progress: 100,
    answeredCount: 10,
    status: 'submitted',
    currentQuestion: 10,
    recentAnswers: [],
    lastActivity: 1000,
    rawAnswers: {},
  },
];

function buildMonitorSession(reviewReleaseState: 'locked-review' | 'review-released' | 'feedback-released' = 'locked-review') {
  return {
    status: 'in-progress',
    createdAt: 0,
    testId: 'test-1',
    currentTestId: 'test-1',
    reviewReleaseState,
    antiCheatConfig: {
      preset: 'strict',
    },
    players: {
      'student-1': {
        name: 'Ada',
      },
    },
  };
}

describe('TeacherTestMonitorPage release controls', () => {
  const mockSetReviewReleaseState = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseNavigation.mockReturnValue({ navigateTo: vi.fn() });
    mockUseHeadphonePermission.mockReturnValue({
      pendingCount: 0,
      approveRequest: vi.fn(),
      denyRequest: vi.fn(),
      revokePermission: vi.fn(),
      allRequests: [],
    });
    mockUsePagination.mockReturnValue({
      paginatedItems: STUDENTS,
      currentPage: 1,
      totalPages: 1,
      showPagination: false,
      handlePageChange: vi.fn(),
    });
    mockUseTimerExpiry.mockReturnValue({
      isCountdownWarningActive: false,
      countdownWarningRemaining: 0,
      triggerCountdownWarning: vi.fn(),
      cancelCountdown: vi.fn(),
      endNow: vi.fn(),
    });
    mockCalculateSessionStatistics.mockReturnValue({
      totalStudents: 1,
      submittedCount: 1,
      workingCount: 0,
      disconnectedCount: 0,
      averageProgress: 100,
    });
    mockUseMonitorSession.mockReturnValue({
      session: buildMonitorSession(),
      students: STUDENTS,
      testData: {
        questionCount: 10,
        duration: 30,
        type: 'exam',
        title: 'Reading Mock',
        skill: 'Reading',
      },
      fullTestData: {
        questions: [],
        sections: [],
      },
      loading: false,
      error: null,
    });

    mockSetReviewReleaseState.mockResolvedValue(undefined);
    mockUseMonitorControls.mockReturnValue({
      startTest: vi.fn(),
      pauseTest: vi.fn(),
      endTest: vi.fn(),
      extendTime: vi.fn(),
      pauseAllAudio: vi.fn(),
      resumeAllAudio: vi.fn(),
      skipToSection: vi.fn(),
      seekToPosition: vi.fn(),
      setPlaybackSpeed: vi.fn(),
      setStudentAccommodation: vi.fn(),
      clearStudentAccommodation: vi.fn(),
      completeBaseTest: vi.fn(),
      endFullSession: vi.fn(),
      setReviewReleaseState: mockSetReviewReleaseState,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the review release control bar when students have submitted', async () => {
    render(<TeacherTestMonitorPage />);

    expect(await screen.findByText('Student Review Access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Locked/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Full/i })).toBeInTheDocument();
  });

  it('updates the live-session release state from the monitor controls', async () => {
    render(<TeacherTestMonitorPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Review/i }));

    await waitFor(() => {
      expect(mockSetReviewReleaseState).toHaveBeenCalledWith('review-released');
    });

    expect(mockNotificationsShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Review Access: Review',
      }),
    );
  });

  it('does not rewrite the release state when the active state is clicked', async () => {
    render(<TeacherTestMonitorPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Locked/i }));

    expect(mockSetReviewReleaseState).not.toHaveBeenCalled();
    expect(mockNotificationsShow).not.toHaveBeenCalled();
  });

  it('surfaces integrity alerts and opens the detail panel from the monitor banner', async () => {
    mockUseMonitorSession.mockReturnValue({
      session: {
        ...buildMonitorSession(),
        players: {
          'student-1': {
            name: 'Ada',
            integrity: {
              violationCount: 6,
              totalEvents: 6,
              tabSwitchCount: 6,
              totalTimeAwayMs: 65000,
              copyAttempts: 0,
              pasteAttempts: 0,
              rightClickAttempts: 0,
              fullscreenExitCount: 0,
              keyboardShortcutAttempts: 0,
              riskLevel: 'high',
              forceSubmitted: false,
            },
          },
        },
      },
      students: STUDENTS,
      testData: {
        questionCount: 10,
        duration: 30,
        type: 'exam',
        title: 'Reading Mock',
        skill: 'Reading',
      },
      fullTestData: {
        questions: [],
        sections: [],
      },
      loading: false,
      error: null,
    });

    render(<TeacherTestMonitorPage />);

    expect(await screen.findByText('Session Integrity')).toBeInTheDocument();
    expect(screen.getByText('Flagged Students')).toBeInTheDocument();
    expect(screen.getByText('Counted Violations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ada/i })).toBeInTheDocument();
    expect(screen.getByText(/6 tab switches/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ada/i }));

    expect(await screen.findByTestId('integrity-detail-panel')).toHaveTextContent('Ada::6');
    expect(mockTrackAction).toHaveBeenCalledWith(
      'liveSessions',
      'viewIntegrityDetails',
      expect.objectContaining({
        studentId: 'student-1',
        violationCount: 6,
        riskLevel: 'high',
      }),
    );
  });

  it('shows a teacher notification when a student accrues new integrity violations', async () => {
    const liveState = {
      current: {
        session: {
          ...buildMonitorSession(),
          players: {
            'student-1': {
              name: 'Ada',
              integrity: {
                violationCount: 1,
                totalEvents: 1,
                tabSwitchCount: 1,
                totalTimeAwayMs: 12000,
                copyAttempts: 0,
                pasteAttempts: 0,
                rightClickAttempts: 0,
                fullscreenExitCount: 0,
                keyboardShortcutAttempts: 0,
                riskLevel: 'medium',
                forceSubmitted: false,
              },
            },
          },
        },
        students: STUDENTS,
        testData: {
          questionCount: 10,
          duration: 30,
          type: 'exam',
          title: 'Reading Mock',
          skill: 'Reading',
        },
        fullTestData: {
          questions: [],
          sections: [],
        },
        loading: false,
        error: null,
      },
    };

    mockUseMonitorSession.mockImplementation(() => liveState.current);

    const { rerender } = render(<TeacherTestMonitorPage />);

    expect(mockNotificationsShow).not.toHaveBeenCalled();

    liveState.current = {
      ...liveState.current,
      session: {
        ...liveState.current.session,
        players: {
          'student-1': {
            name: 'Ada',
            integrity: {
              violationCount: 4,
              totalEvents: 4,
              tabSwitchCount: 4,
              totalTimeAwayMs: 48000,
              copyAttempts: 0,
              pasteAttempts: 0,
              rightClickAttempts: 0,
              fullscreenExitCount: 0,
              keyboardShortcutAttempts: 0,
              riskLevel: 'high',
              forceSubmitted: false,
            },
          },
        },
      },
    };

    rerender(<TeacherTestMonitorPage />);

    await waitFor(() => {
      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'High-Risk Integrity Alert',
          message: expect.stringContaining('Ada'),
          color: 'red',
        }),
      );
    });
  });
});
