import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentHomeworkDetailPage from './StudentHomeworkDetailPage';
import StudentShellRoute from '../routes/StudentShellRoute';

const {
  authState,
  getTestFromFirebaseMock,
  firebaseGetMock,
  firebaseRefMock,
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
  firebaseGetMock: vi.fn(),
  firebaseRefMock: vi.fn(),
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
  default: {},
}));

vi.mock('../hooks/useAuth', () => ({
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

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => firebaseGetMock(...args),
  ref: (...args: unknown[]) => firebaseRefMock(...args),
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
    firebaseRefMock.mockImplementation((_database, path) => path);
    firebaseGetMock.mockResolvedValue({
      exists: () => false,
      val: () => null,
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

  it('hydrates Reading V2 homework headers from the student-readable bridge and projection', async () => {
    getTestFromFirebaseMock.mockResolvedValue({
      success: true,
      data: {
        id: 'material-1',
        materialId: 'material-1',
        deliveryEngine: 'reading-v2',
        productLabel: 'Reading V2',
        title: 'V2 Homework Material',
        materialKind: 'full-test',
        duration: 35,
        metadata: {
          deliveryEngine: 'reading-v2',
          productLabel: 'Reading V2',
          title: 'V2 Homework Material',
          materialKind: 'full-test',
          duration: 35,
          difficulty: 'intermediate',
          description: '',
          tags: [],
          visibility: 'private',
          publishedSnapshotVersionId: 'snapshot-1',
        },
        publishedSnapshotVersionId: 'snapshot-1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        questionCount: 0,
        questions: [],
      },
    });
    firebaseGetMock.mockImplementation(async (path: string) => {
      const valueByPath: Record<string, unknown> = {
        'reading_v2/projections/student_safe_tests/material-1:snapshot-1': {
          deliveryEngine: 'reading-v2',
          plane: 'projection',
          projectionKind: 'student-safe',
          sourceSnapshotVersionId: 'snapshot-1',
          content: {
            taskGroups: [
              {
                interactions: [
                  { interactionId: 'q1' },
                ],
              },
            ],
          },
        },
      };
      const value = valueByPath[path];
      return {
        exists: () => value !== undefined,
        val: () => value,
      };
    });

    renderPage();

    expect(await screen.findByText('1 questions')).toBeInTheDocument();
    await waitFor(() => {
      expect(firebaseRefMock).not.toHaveBeenCalledWith({}, 'reading_v2/material_metadata/material-1');
    });
    expect(getTestFromFirebaseMock).toHaveBeenCalledWith('material-1');
  });

  it('shows Reading Passage set summary without legacy material lookup', async () => {
    useHomeworkSubmissionMock.mockReturnValue({
      homework: {
        id: 'hw-1',
        title: 'Selected Reading Passages',
        materialId: 'reading-passage-set:hw-1',
        materialTitle: 'Selected Reading Passages',
        materialSkill: 'reading',
        materialType: 'reading-passage-set',
        description: 'Read the assigned passages.',
        scheduling: {
          dueDate: Date.now() + 60_000,
        },
        config: {
          maxAttempts: 2,
          timerMinutes: 40,
          feedbackTiming: 'after_completion',
          lateSubmissionAllowed: false,
        },
        readingPassageSet: {
          titleSnapshot: 'Selected Reading Passages',
          items: [
            {
              order: 2,
              passageMaterialId: 'passage-b',
              snapshotVersionId: 'snap-b',
              titleSnapshot: 'Passage B',
              questionCount: 10,
              sourceOrderDisplay: 'Passage 2',
              sourceFullTestTitle: 'Mock Test 2',
              testTypeIds: ['ielts'],
            },
            {
              order: 1,
              passageMaterialId: 'passage-a',
              snapshotVersionId: 'snap-a',
              titleSnapshot: 'Passage A',
              questionCount: 8,
              sourceOrderDisplay: 'Passage 1',
              sourceFullTestTitle: 'Mock Test 1',
              testTypeIds: ['ielts'],
            },
          ],
        },
      },
      currentSubmission: null,
      allSubmissions: [],
      bestSubmission: null,
      maxAttempts: 2,
      attemptsUsed: 0,
      attemptsRemaining: 2,
      isLoading: false,
      error: null,
      isOverdue: false,
      isAvailable: true,
      canStartAttempt: true,
      hasInProgressAttempt: false,
      startAttempt: startAttemptMock,
    });

    renderPage();

    expect(await screen.findByText('Reading Passage Set')).toBeInTheDocument();
    expect(screen.getByText('2 passages, 18 questions')).toBeInTheDocument();
    expect(screen.getByText('Passage A, Passage B')).toBeInTheDocument();
    expect(getTestFromFirebaseMock).not.toHaveBeenCalled();
    expect(firebaseGetMock).not.toHaveBeenCalled();
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
