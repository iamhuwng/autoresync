import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentHomeworkListPage } from './StudentHomeworkListPage';

const {
  createSubmissionMock,
  navigateMock,
  trackActionMock,
  useMediaQueryMock,
  useResolvedStudentHomeworkListMock,
} = vi.hoisted(() => ({
  createSubmissionMock: vi.fn(),
  navigateMock: vi.fn(),
  trackActionMock: vi.fn(),
  useMediaQueryMock: vi.fn(),
  useResolvedStudentHomeworkListMock: vi.fn(),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: navigateMock,
  }),
}));

vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: (...args: unknown[]) => useMediaQueryMock(...args),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: trackActionMock,
  }),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'student-1',
      displayName: 'Student One',
    },
    profile: {
      avatarUrl: null,
    },
  }),
}));

vi.mock('../context/StudentShellDataContext', () => ({
  useResolvedStudentHomeworkList: (...args: unknown[]) => useResolvedStudentHomeworkListMock(...args),
}));

vi.mock('../services/homeworkSubmissionService', () => ({
  createSubmission: (...args: unknown[]) => createSubmissionMock(...args),
}));

vi.mock('../components/layout/StudentLayout', () => ({
  StudentLayout: ({ children, rightPanel }: any) => (
    <div>
      <div>{children}</div>
      <div>{rightPanel}</div>
    </div>
  ),
}));

vi.mock('../components/layout/StudentSidebar', () => ({
  StudentSidebar: () => <div>Sidebar</div>,
}));

vi.mock('../components/layout/studentLayoutStyles', () => ({
  S: {
    widgetTitle: {},
    feedHeader: {},
    feedHeaderText: {},
    feedHeaderTitle: {},
    feedHeaderSubtitle: {},
  },
  mobileStyles: {
    feedSubtitleHidden: { display: 'none' },
    fullWidthButton: { width: '100%', minHeight: '44px' },
    touchTarget: { minHeight: '44px', minWidth: '44px' },
  },
  studentTokens: {
    bgSurfaceAlt: '#f1f4f6',
    textBody: '#586064',
    outlineSoft: '#abb3b7',
    accentSoft: '#ecebff',
    accentHover: '#3f38c7',
    bgSurface: '#ffffff',
    textPrimary: '#2b3437',
    textMuted: '#7a8488',
    radiusPill: 999,
    borderWhisper: '#d7dadd',
    accent: '#4d44e3',
    textDim: '#8f989c',
    borderSoft: '#c8cdd1',
    bgShell: '#f1f4f6',
    radiusSoft: 12,
    bgSurfaceStrong: '#e7eaed',
  },
}));

vi.mock('../components/results/DeferredResultSlidePanel', () => ({
  DeferredResultSlidePanel: ({ resultId, onClose }: any) => (
    <div data-testid="result-slide-panel" data-result-id={resultId}>
      <button onClick={onClose}>Close Panel</button>
    </div>
  ),
}));

function makeHomeworkItem(overrides: Record<string, unknown> = {}) {
  return {
    homework: {
      id: 'hw-1',
      title: 'Reading Homework',
      createdBy: 'teacher-1',
      materialId: 'material-1',
      materialTitle: 'Reading Homework',
      materialSkill: 'reading',
      materialType: 'quiz',
      scheduling: {
        dueDate: Date.now() + 60_000,
      },
      config: {
        maxAttempts: 2,
        timerMinutes: 30,
        lateSubmissionAllowed: false,
      },
      target: {
        type: 'class',
        className: 'Class A',
      },
    },
    latestSubmission: null,
    attemptsUsed: 0,
    attemptsRemaining: 2,
    canSubmit: true,
    canViewFeedback: false,
    status: 'not_started',
    ...overrides,
  };
}

describe('StudentHomeworkListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMediaQueryMock.mockReturnValue(false);
    createSubmissionMock.mockResolvedValue({ id: 'submission-1' });
    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [],
      inProgress: [],
      completed: [],
      overdue: [],
    });
  });

  it('opens the result slide panel when a completed score card is clicked', () => {
    const completedItem = makeHomeworkItem({
      latestSubmission: {
        id: 'submission-1',
        status: 'submitted',
        resultId: 'result-1',
        percentage: 92,
      },
      canSubmit: false,
      canViewFeedback: true,
      status: 'submitted',
    });

    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [completedItem],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [],
      inProgress: [],
      completed: [completedItem],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    fireEvent.click(screen.getByText('Your Score'));

    expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'result-1');
    expect(trackActionMock).toHaveBeenCalledWith('viewHomeworkResult', expect.objectContaining({
      resultId: 'result-1',
      source: 'result_panel',
    }));
  });

  it('opens the result slide panel from submitted homework actions', () => {
    const completedItem = makeHomeworkItem({
      latestSubmission: {
        id: 'submission-1',
        status: 'submitted',
        resultId: 'result-2',
        percentage: 88,
      },
      canSubmit: false,
      canViewFeedback: true,
      status: 'submitted',
    });

    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [completedItem],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [],
      inProgress: [],
      completed: [completedItem],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    fireEvent.click(screen.getByText('View Details'));

    expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'result-2');
    expect(trackActionMock).toHaveBeenCalledWith('viewHomeworkResult', expect.objectContaining({
      resultId: 'result-2',
      source: 'homework_card',
    }));
  });

  it('creates a submission and navigates into practice for a new attempt', async () => {
    const notStartedItem = makeHomeworkItem();

    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [notStartedItem],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [notStartedItem],
      inProgress: [],
      completed: [],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    fireEvent.click(screen.getByText('Start Homework'));

    await waitFor(() => {
      expect(createSubmissionMock).toHaveBeenCalledWith('hw-1', 'student-1', 'Student One');
      expect(navigateMock).toHaveBeenCalledWith(
        'STUDENT_PRACTICE',
        { materialId: 'material-1' },
        expect.objectContaining({
          reason: 'student_homework_start',
          state: expect.objectContaining({
            isHomework: true,
            homeworkId: 'hw-1',
            submissionId: 'submission-1',
            teacherId: 'teacher-1',
          }),
        }),
      );
    });
  });

  it('shows pending-review copy for manual-review submissions without a score', () => {
    const pendingReviewItem = makeHomeworkItem({
      homework: {
        ...makeHomeworkItem().homework,
        materialSkill: 'writing',
      },
      latestSubmission: {
        id: 'submission-writing-1',
        status: 'submitted',
        resultId: 'result-writing-1',
      },
      canSubmit: false,
      canViewFeedback: true,
      status: 'submitted',
    });

    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [pendingReviewItem],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [],
      inProgress: [],
      completed: [pendingReviewItem],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    expect(screen.getAllByText('Pending Review')[0]).toBeInTheDocument();
    expect(screen.getByText('Awaiting teacher')).toBeInTheDocument();
  });

  it('stacks the homework summary and full-width actions on mobile', () => {
    useMediaQueryMock.mockReturnValue(true);

    const notStartedItem = makeHomeworkItem();

    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [notStartedItem],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [notStartedItem],
      inProgress: [],
      completed: [],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    expect(screen.getByRole('heading', { name: 'My Homework' })).toHaveStyle({ fontSize: '1.5rem' });
    expect(screen.getByText('Track upcoming assignments, review progress, and continue active work without losing the calm academic workspace.')).toHaveStyle({ display: 'none' });
    expect(screen.getByText('Assignments').closest('div')).toHaveStyle({ width: '100%', padding: '16px 14px' });
    expect(screen.getByRole('button', { name: 'Not Started' })).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
    expect(screen.getByRole('button', { name: 'Start Homework' })).toHaveStyle({ width: '100%', minHeight: '44px' });
    expect(screen.getByRole('button', { name: 'Start Homework' }).parentElement).toHaveStyle({ flexDirection: 'column' });
  });
});
