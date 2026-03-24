import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentHomeworkListPage } from './StudentHomeworkListPage';

const {
  createSubmissionMock,
  navigateMock,
  useStudentHomeworkListMock,
} = vi.hoisted(() => ({
  createSubmissionMock: vi.fn(),
  navigateMock: vi.fn(),
  useStudentHomeworkListMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

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

vi.mock('../hooks/useHomeworkSubmission', () => ({
  useStudentHomeworkList: (...args: unknown[]) => useStudentHomeworkListMock(...args),
}));

vi.mock('../services/homeworkSubmissionService', () => ({
  createSubmission: (...args: unknown[]) => createSubmissionMock(...args),
}));

vi.mock('@mantine/core', () => ({
  Loader: () => <div>Loading...</div>,
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
    rightSticky: {},
    widget: {},
    widgetTitle: {},
    feedHeader: {},
    feedHeaderTitle: {},
    filterBar: {},
    filterTab: {},
    filterTabActive: {},
  },
}));

vi.mock('../components/results/ResultSlidePanel', () => ({
  ResultSlidePanel: ({ resultId, onClose }: any) => (
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
    createSubmissionMock.mockResolvedValue({ id: 'submission-1' });
    useStudentHomeworkListMock.mockReturnValue({
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

    useStudentHomeworkListMock.mockReturnValue({
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
    expect(navigateMock).not.toHaveBeenCalledWith('/student/academic-record', expect.anything());
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

    useStudentHomeworkListMock.mockReturnValue({
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
    expect(navigateMock).not.toHaveBeenCalledWith('/student/academic-record', expect.anything());
  });

  it('creates a submission and navigates into practice for a new attempt', async () => {
    const notStartedItem = makeHomeworkItem();

    useStudentHomeworkListMock.mockReturnValue({
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

    expect(createSubmissionMock).toHaveBeenCalledWith('hw-1', 'student-1', 'Student One');
  });
});
