import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  useMediaQueryMock,
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
  useMediaQueryMock: vi.fn(),
  useNavigationMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
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

vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: (...args: unknown[]) => useMediaQueryMock(...args),
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
  Button: ({ children, onClick, disabled, loading, style, fullWidth }: any) => (
    <button onClick={onClick} disabled={disabled || loading} style={style} data-full-width={fullWidth ? 'true' : 'false'}>
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
    useMediaQueryMock.mockReturnValue(false);

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

  it('opens the start modal with mobile full-width actions and starts the attempt', async () => {
    const navigateTo = vi.fn();
    useNavigationMock.mockReturnValue({
      navigateTo,
    });
    useMediaQueryMock.mockReturnValue(true);

    renderPage();

    expect(screen.queryByText(/legacy/i)).not.toBeInTheDocument();

    const startHomeworkButton = await screen.findByText('Start Homework');
    expect(startHomeworkButton.style.background).not.toContain('linear-gradient');

    fireEvent.click(startHomeworkButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const cancelButton = screen.getByText('Cancel');
    const startNowButton = screen.getByText('Start Now');

    expect(cancelButton).toHaveStyle({ width: '100%', minHeight: '44px' });
    expect(startNowButton).toHaveStyle({ width: '100%', minHeight: '44px' });
    expect(startNowButton.style.background).not.toContain('linear-gradient');

    fireEvent.click(startNowButton);

    await waitFor(() => {
      expect(startAttemptMock).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the resume action tokenized when an attempt is already in progress', async () => {
    const navigateTo = vi.fn();
    useNavigationMock.mockReturnValue({
      navigateTo,
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
      currentSubmission: {
        id: 'submission-2',
        testId: 'test-2',
      },
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
      hasInProgressAttempt: true,
      startAttempt: startAttemptMock,
    });

    renderPage();

    expect(screen.queryByText(/legacy/i)).not.toBeInTheDocument();

    const resumeButton = await screen.findByText('Resume Attempt');
    expect(resumeButton.style.background).not.toContain('linear-gradient');

    fireEvent.click(resumeButton);

    expect(navigateTo).toHaveBeenCalled();
  });
});
