import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentHomeworkDetailPage from './StudentHomeworkDetailPage';
import StudentShellRoute from '../routes/StudentShellRoute';

const {
  authState,
  getTestFromFirebaseMock,
  navigateMock,
  startAttemptMock,
  useHomeworkSubmissionMock,
  useNavigationMock,
} = vi.hoisted(() => ({
  authState: {
    user: {
      uid: 'student-1',
      displayName: 'Student One',
      email: 'student@example.com',
    },
  },
  getTestFromFirebaseMock: vi.fn(),
  navigateMock: vi.fn(),
  startAttemptMock: vi.fn(),
  useHomeworkSubmissionMock: vi.fn(),
  useNavigationMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@mantine/core', () => {
  const Wrap = ({ children }: any) => <div>{children}</div>;
  const AppShell = ({ children }: any) => <div>{children}</div>;
  AppShell.Header = Wrap;
  AppShell.Main = Wrap;

  const Grid = ({ children }: any) => <div>{children}</div>;
  Grid.Col = Wrap;

  const Timeline = ({ children }: any) => <div>{children}</div>;
  Timeline.Item = ({ children, title }: any) => (
    <div>
      <div>{title}</div>
      <div>{children}</div>
    </div>
  );

  const List = ({ children }: any) => <ul>{children}</ul>;
  List.Item = ({ children }: any) => <li>{children}</li>;

  const Text = ({ children }: any) => <span>{children}</span>;
  const Modal = ({ opened, title, children }: any) => (opened ? <div><div>{title}</div>{children}</div> : null);

  return {
    AppShell,
    Badge: Wrap,
    Group: Wrap,
    Text,
    Loader: () => <div>Loading...</div>,
    Stack: Wrap,
    ThemeIcon: Wrap,
    Divider: () => <hr />,
    Alert: Wrap,
    Modal,
    List,
    Grid,
    Timeline,
    Center: Wrap,
  };
});

vi.mock('@tabler/icons-react', () => {
  const Icon = () => <span />;
  return {
    IconClipboard: Icon,
    IconClock: Icon,
    IconCalendar: Icon,
    IconAlertTriangle: Icon,
    IconPlaylistAdd: Icon,
    IconBook: Icon,
    IconArrowLeft: Icon,
    IconCheck: Icon,
    IconX: Icon,
    IconInfoCircle: Icon,
    IconPlayerPlay: Icon,
    IconHistory: Icon,
    IconTrophy: Icon,
    IconEye: Icon,
    IconEyeOff: Icon,
    IconHome: Icon,
    IconBooks: Icon,
  };
});

vi.mock('../hooks/useHomeworkSubmission', () => ({
  useHomeworkSubmission: (...args: unknown[]) => useHomeworkSubmissionMock(...args),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    profile: null,
    logout: vi.fn(),
  }),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => useNavigationMock(),
}));

vi.mock('../context/StudentShellDataContext', () => ({
  StudentShellDataProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock('../components/layout/StudentLayout', () => ({
  StudentLayout: ({ children }: any) => <div data-testid="student-layout">{children}</div>,
}));

vi.mock('../components/layout/StudentSidebar', () => ({
  StudentSidebar: () => <div data-testid="student-sidebar" />,
}));

vi.mock('../services/testStorage', () => ({
  getTestFromFirebase: (...args: unknown[]) => getTestFromFirebaseMock(...args),
}));

vi.mock('../components/modern', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardBody: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onClick, disabled, loading }: any) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
}));

vi.mock('../components/results/DeferredResultSlidePanel', () => ({
  DeferredResultSlidePanel: ({ resultId, onClose }: any) => (
    <div data-testid="result-slide-panel" data-result-id={resultId}>
      <button onClick={onClose}>Close Panel</button>
    </div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student/homework/hw-1']}>
      <Routes>
        <Route path="/student" element={<StudentShellRoute />}>
          <Route path="homework/:homeworkId" element={<StudentHomeworkDetailPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('StudentHomeworkDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      uid: 'student-1',
      displayName: 'Student One',
      email: 'student@example.com',
    };

    useNavigationMock.mockReturnValue({
      navigateTo: vi.fn(),
    });

    startAttemptMock.mockResolvedValue({ id: 'submission-2' });
    getTestFromFirebaseMock.mockResolvedValue({
      success: true,
      data: {
        questions: [{ id: 'q1' }, { id: 'q2' }],
      },
    });

    useHomeworkSubmissionMock.mockReturnValue({
      homework: {
        id: 'hw-1',
        title: 'Reading Homework',
        materialId: 'material-1',
        materialTitle: 'Reading Homework',
        materialSkill: 'reading',
        materialType: 'ielts-reading',
        description: 'Read the passage carefully.',
        scheduling: {
          dueDate: Date.now() + 60_000,
        },
        config: {
          maxAttempts: 2,
          timerMinutes: 30,
          feedbackTiming: 'after_completion',
          lateSubmissionAllowed: false,
        },
      },
      currentSubmission: null,
      allSubmissions: [
        {
          id: 'submission-1',
          status: 'submitted',
          attemptNumber: 1,
          submittedAt: Date.now() - 5_000,
          percentage: 84,
          resultId: 'result-1',
        },
      ],
      bestSubmission: {
        id: 'submission-1',
        percentage: 84,
      },
      maxAttempts: 2,
      attemptsUsed: 1,
      attemptsRemaining: 1,
      isLoading: false,
      error: null,
      isOverdue: false,
      isAvailable: true,
      canStartAttempt: true,
      hasInProgressAttempt: false,
      startAttempt: startAttemptMock,
    });
  });

  it('falls back to email when the student display name is missing', async () => {
    authState.user = {
      uid: 'student-1',
      displayName: '',
      email: 'student@example.com',
    };

    renderPage();
    await screen.findByText('Reading Homework');

    expect(useHomeworkSubmissionMock).toHaveBeenCalledWith(expect.objectContaining({
      studentName: 'student@example.com',
    }));
  });

  it('opens the slide panel locally from attempt history result links', async () => {
    renderPage();

    fireEvent.click(await screen.findByText('View Details'));

    expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'result-1');
    expect(navigateMock).not.toHaveBeenCalledWith('/student/academic-record', expect.anything());
  });
});
