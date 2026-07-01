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
  mockToastShow,
  mockCalculateSessionStatistics,
  mockTrackAction,
  mockLiveIssue,
  mockLiveRefresh,
} = vi.hoisted(() => ({
  mockUseMonitorSession: vi.fn(),
  mockUseMonitorControls: vi.fn(),
  mockUseNavigation: vi.fn(),
  mockUseHeadphonePermission: vi.fn(),
  mockUsePagination: vi.fn(),
  mockUseTimerExpiry: vi.fn(),
  mockToastShow: vi.fn(),
  mockCalculateSessionStatistics: vi.fn(),
  mockTrackAction: vi.fn(),
  mockLiveIssue: vi.fn(),
  mockLiveRefresh: vi.fn(),
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
  VanillaLoader: () => <div>Loading...</div>,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  toast: {
    show: (...args: any[]) => mockToastShow(...args),
  },
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
  AudioProgressPanel: (props: any) => (
    <div
      data-testid="audio-progress-panel"
      data-current-section={props.currentSection}
      data-is-playing={String(props.isPlaying)}
      data-is-paused={String(props.isPaused)}
      data-playback-speed={String(props.playbackSpeed)}
      data-audio-url={props.audioSections?.[0]?.audioUrl}
      data-authorized-delivery={String(Boolean(props.authorizedDelivery))}
      data-master-revision={String(props.masterRevision)}
      data-canonical-position={String(props.canonicalPosition)}
    />
  ),
}));

vi.mock('../features/assessment/listening/live-session/delivery/listeningLiveDeliveryClient', () => ({
  createListeningLiveDeliveryIssuer: () => ({
    issue: (...args: any[]) => mockLiveIssue(...args),
    refresh: (...args: any[]) => mockLiveRefresh(...args),
  }),
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

    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Review Access: Review',
      }),
    );
  });

  it('does not rewrite the release state when the active state is clicked', async () => {
    render(<TeacherTestMonitorPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Locked/i }));

    expect(mockSetReviewReleaseState).not.toHaveBeenCalled();
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('does not render the audio progress panel for non-Listening sessions', async () => {
    render(<TeacherTestMonitorPage />);

    expect(await screen.findByText('Student Review Access')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-progress-panel')).not.toBeInTheDocument();
  });

  it('renders the audio progress panel only for in-progress Listening sessions with audio sections', async () => {
    mockUseMonitorSession.mockReturnValue({
      session: {
        ...buildMonitorSession(),
        status: 'completed',
      },
      students: STUDENTS,
      testData: {
        questionCount: 10,
        duration: 30,
        type: 'exam',
        title: 'Listening Completed',
        skill: 'Listening',
        audioSections: [{ sectionNumber: 1, audioUrl: 'https://cdn.example.com/1.mp3' }],
      },
      fullTestData: {
        questions: [],
        sections: [],
      },
      loading: false,
      error: null,
    });

    const { rerender } = render(<TeacherTestMonitorPage />);

    expect(await screen.findByText('Student Review Access')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-progress-panel')).not.toBeInTheDocument();

    mockUseMonitorSession.mockReturnValue({
      session: buildMonitorSession(),
      students: STUDENTS,
      testData: {
        questionCount: 10,
        duration: 30,
        type: 'exam',
        title: 'Listening Without Audio',
        skill: 'Listening',
        audioSections: [],
      },
      fullTestData: {
        questions: [],
        sections: [],
      },
      loading: false,
      error: null,
    });

    rerender(<TeacherTestMonitorPage />);

    expect(screen.queryByTestId('audio-progress-panel')).not.toBeInTheDocument();
  });

  it('hydrates listening monitor audio controls from canonical masterAudioState on reload', async () => {
    mockUseMonitorSession.mockReturnValue({
      session: {
        ...buildMonitorSession(),
        masterAudioState: {
          schemaVersion: 2,
          revision: 12,
          section: 3,
          position: 42,
          isPlaying: false,
          speed: 1.25,
          timestamp: 10000,
          updateKind: 'command',
          lastAction: 'pause',
          lastActionRevision: 12,
          lastActionTimestamp: 10000,
          actionId: 'pause-12',
          writerUid: 'teacher-1',
          writerClientId: 'monitor-1',
        },
      },
      students: STUDENTS,
      testData: {
        questionCount: 10,
        duration: 30,
        type: 'exam',
        title: 'Listening Mock',
        skill: 'Listening',
        audioSections: [
          { sectionNumber: 1, audioUrl: 'https://cdn.example.com/1.mp3' },
          { sectionNumber: 2, audioUrl: 'https://cdn.example.com/2.mp3' },
          { sectionNumber: 3, audioUrl: 'https://cdn.example.com/3.mp3' },
        ],
      },
      fullTestData: {
        questions: [],
        sections: [],
      },
      loading: false,
      error: null,
    });

    render(<TeacherTestMonitorPage />);

    const panel = await screen.findByTestId('audio-progress-panel');
    await waitFor(() => {
      expect(panel).toHaveAttribute('data-current-section', '3');
      expect(panel).toHaveAttribute('data-is-playing', 'false');
      expect(panel).toHaveAttribute('data-is-paused', 'true');
      expect(panel).toHaveAttribute('data-playback-speed', '1.25');
      expect(panel).toHaveAttribute('data-canonical-position', '42');
    });
  });

  it('resolves asset-ID monitor audio through private delivery before playback', async () => {
    const issued = {
      assetId: 'asset-1',
      url: 'https://delivery.example/private.wav',
      tokenId: 'token-1',
      issuedAt: 1_700_000_000_000,
      expiresAt: 1_700_003_600_000,
      refreshAfter: 1_700_003_000_000,
      ttlMs: 3_600_000,
      deliveryReady: true,
      range: {
        requestRange: 'bytes=0-0',
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/4096',
      },
    };
    mockLiveIssue.mockResolvedValue(issued);
    mockUseMonitorSession.mockReturnValue({
      session: {
        ...buildMonitorSession(),
        teacherId: 'legacy-session-teacher-1',
        createdByUserId: 'teacher-1',
        masterAudioState: {
          revision: 9,
          section: 1,
          isPlaying: false,
          speed: 1,
        },
      },
      students: STUDENTS,
      testData: {
        questionCount: 10,
        duration: 30,
        type: 'exam',
        title: 'Listening Private',
        skill: 'Listening',
        audioSections: [{
          number: 1,
          name: 'Part 1',
          audioUrl: 'https://public.example/legacy.wav',
          assetId: 'asset-1',
        }],
      },
      fullTestData: {
        id: 'test-1',
        authoringVersioning: {
          frozen: true,
          versionId: 'version-1',
        },
      },
      loading: false,
      error: null,
    });

    render(<TeacherTestMonitorPage />);

    await waitFor(() => {
      expect(mockLiveIssue).toHaveBeenCalledWith(expect.objectContaining({
        assetId: 'asset-1',
        liveScope: expect.objectContaining({
          sessionCode: 'SESSION-1',
          testId: 'test-1',
          versionId: 'version-1',
          studentId: 'teacher-1',
          sectionNumber: 1,
        }),
      }));
    });
    const panel = await screen.findByTestId('audio-progress-panel');
    await waitFor(() => {
      expect(panel).toHaveAttribute('data-audio-url', issued.url);
      expect(panel).toHaveAttribute('data-authorized-delivery', 'true');
      expect(panel).toHaveAttribute('data-master-revision', '9');
    });
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

    expect(mockToastShow).not.toHaveBeenCalled();

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
      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'High-Risk Integrity Alert',
          message: expect.stringContaining('Ada'),
          tone: 'error',
        }),
      );
    });
  });
});
