import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherHomeworkDetailPage from './TeacherHomeworkDetailPage';

const {
  useHomeworkDetailMock,
  useClassRosterMock,
  useAuthMock,
  useNavigationMock,
  resetStudentHomeworkMock,
  updateStudentOverrideMock,
  updateHomeworkMock,
  sendHomeworkReminderNotificationMock,
  refreshReadingV2MasterAssignmentFromLatestMock,
  trackActionMock,
} = vi.hoisted(() => ({
  useHomeworkDetailMock: vi.fn(),
  useClassRosterMock: vi.fn(),
  useAuthMock: vi.fn(),
  useNavigationMock: vi.fn(),
  resetStudentHomeworkMock: vi.fn(),
  updateStudentOverrideMock: vi.fn(),
  updateHomeworkMock: vi.fn(),
  sendHomeworkReminderNotificationMock: vi.fn(),
  refreshReadingV2MasterAssignmentFromLatestMock: vi.fn(),
  trackActionMock: vi.fn(),
}));

vi.mock('./TeacherHomeworkDetailPage.css', () => ({}));

vi.mock('../hooks/useHomeworkDetail', () => ({
  useHomeworkDetail: useHomeworkDetailMock,
}));

vi.mock('../hooks/useClassRoster', () => ({
  useClassRoster: useClassRosterMock,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: useNavigationMock,
}));

vi.mock('../components/modern', () => ({
  Button: ({ children, loading: _loading, variant: _variant, size: _size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
  CardBody: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  VanillaLoader: () => <div>Loading...</div>,
}));

vi.mock('../components/modern/ToastNotification', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../components/navigation', () => ({
  TeacherHeader: () => <div>Teacher Header</div>,
}));

vi.mock('../components/homework/HomeworkBreadcrumb', () => ({
  default: () => <div>Homework Breadcrumb</div>,
}));

vi.mock('../components/homework/HomeworkAlertBanner', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../components/homework/HomeworkSummaryStats', () => ({
  __esModule: true,
  default: () => <div>Homework Summary Stats</div>,
}));

vi.mock('../components/homework/HomeworkScoreDistribution', () => ({
  __esModule: true,
  default: () => <div>Homework Score Distribution</div>,
}));

vi.mock('../components/homework/HomeworkStatusBadge', () => ({
  HomeworkStatusBadge: ({ status }: { status: string }) => <div>{status}</div>,
}));

vi.mock('../components/results/ResultDetailModal', () => ({
  ResultDetailModal: () => null,
}));

vi.mock('../components/homework/ExtendStudentDeadlineModal', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../components/homework/ExemptStudentModal', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../components/homework/StudentActionMenu', () => ({
  __esModule: true,
  default: () => <div>Student Action Menu</div>,
}));

vi.mock('../services/homeworkSubmissionService', () => ({
  resetStudentHomework: resetStudentHomeworkMock,
}));

vi.mock('../services/homeworkManager', () => ({
  updateHomework: updateHomeworkMock,
  updateStudentOverride: updateStudentOverrideMock,
}));

vi.mock('../services/reading-v2/readingV2AssignmentRefreshRepository.service', () => ({
  refreshReadingV2MasterAssignmentFromLatest: refreshReadingV2MasterAssignmentFromLatestMock,
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  get: vi.fn(),
  ref: vi.fn((_database, path) => ({ path })),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../services/notificationService', () => ({
  sendHomeworkReminderNotification: sendHomeworkReminderNotificationMock,
}));

vi.mock('../services/reportingService', () => ({
  reportingService: {
    trackAction: trackActionMock,
  },
}));

const now = 1_710_000_000_000;

const homeworkAssignment = {
  id: 'hw-1',
  title: 'Homework 1',
  materialTitle: 'Homework 1',
  description: 'Integrity-enabled homework',
  status: 'active',
  materialType: 'ielts-reading',
  target: {
    type: 'students',
    studentIds: ['student-1'],
    studentNames: ['Student One'],
  },
  scheduling: {
    availableFrom: now - 60_000,
    dueDate: now + 86_400_000,
  },
  config: {
    maxAttempts: 2,
    timerMinutes: 60,
    feedbackTiming: 'after_due_date',
    lateSubmissionAllowed: true,
  },
  stats: {
    totalAssigned: 1,
    averageScore: 90,
  },
  createdAt: now - 120_000,
  tags: [],
  studentOverrides: {},
};

const legacyIntegrityReport = {
  violationCount: 2,
  totalEvents: 2,
  tabSwitchCount: 1,
  totalTimeAwayMs: 6000,
  copyAttempts: 1,
  pasteAttempts: 0,
  rightClickAttempts: 0,
  fullscreenExitCount: 0,
  keyboardShortcutAttempts: 0,
  forceSubmitted: false,
  forceSubmittedBy: null,
  riskLevel: 'medium' as const,
  events: [
    {
      type: 'tab_switch',
      timestamp: now - 10_000,
      durationMs: 6000,
      withinGrace: false,
      counted: true,
    },
    {
      type: 'copy_attempt',
      timestamp: now - 5_000,
      withinGrace: false,
      counted: true,
    },
  ],
};

const homeworkSubmission = {
  id: 'submission-1',
  homeworkId: 'hw-1',
  studentId: 'student-1',
  studentName: 'Student One',
  status: 'submitted',
  percentage: 90,
  attemptNumber: 1,
  submittedAt: now - 1_000,
  startedAt: now - 10_000,
  timeSpent: 1200,
  integrity: legacyIntegrityReport,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/homework/hw-1']}>
      <Routes>
        <Route path="/teacher/homework/:homeworkId" element={<TeacherHomeworkDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeacherHomeworkDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useHomeworkDetailMock.mockReturnValue({
      homework: homeworkAssignment,
      submissions: [homeworkSubmission],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    useClassRosterMock.mockReturnValue({
      students: [],
      loading: false,
      error: null,
    });

    useAuthMock.mockReturnValue({
      user: { uid: 'teacher-1' },
      profile: { displayName: 'Teacher One' },
      logout: vi.fn(),
    });

    useNavigationMock.mockReturnValue({
      navigateTo: vi.fn(),
    });

    resetStudentHomeworkMock.mockResolvedValue({
      submissionsDeleted: 1,
      resultsDeleted: 1,
    });

    updateStudentOverrideMock.mockResolvedValue(undefined);
    updateHomeworkMock.mockResolvedValue(undefined);
    refreshReadingV2MasterAssignmentFromLatestMock.mockResolvedValue({
      payload: {},
      passageCount: 2,
    });
    sendHomeworkReminderNotificationMock.mockResolvedValue(undefined);
  });

  it('normalizes legacy session-style integrity reports into homework summary details', async () => {
    renderPage();

    const integrityBadges = await screen.findAllByTitle('2 integrity violations');
    fireEvent.click(integrityBadges[0]);

    expect(await screen.findByText('Homework Summary (2 events)')).toBeInTheDocument();
    expect(screen.getByText(/1 tab switches, 1 copy attempts/)).toBeInTheDocument();
    expect(screen.queryByText(/Event Timeline/)).not.toBeInTheDocument();
    expect(trackActionMock).toHaveBeenCalledWith('homework', 'viewIntegrityDetails', {
      homeworkId: 'hw-1',
      studentName: 'Student One',
      violationCount: 2,
    });
  });

  it('shows Reading Passage homework title, source label, Test Type, and assignment state', async () => {
    useHomeworkDetailMock.mockReturnValue({
      homework: {
        ...homeworkAssignment,
        id: 'hw-reading-passage',
        title: 'Making Time for Science',
        materialTitle: 'Making Time for Science',
        materialType: 'reading-passage',
        status: 'active',
        readingPassageSnapshot: {
          passageMaterialId: 'passage-1',
          snapshotVersionId: 'snapshot-1',
          titleSnapshot: 'Making Time for Science',
          questionCount: 13,
          testTypeIds: ['ielts'],
          sourceOrderDisplay: 'Passage 1',
          sourceFullTestTitle: 'British Council Practice Test 01',
        },
      },
      submissions: [homeworkSubmission],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Making Time for Science' })).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Reading Passage')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Passage 1 - British Council Practice Test 01')).toBeInTheDocument();
    expect(screen.getByText('Test Type')).toBeInTheDocument();
    expect(screen.getByText('IELTS')).toBeInTheDocument();
  });

  it('refreshes a composition-backed Reading V2 assignment before any raw submission starts', async () => {
    const refetch = vi.fn();
    const unstartedSubmission = {
      id: 'submission-1',
      homeworkId: 'hw-reading-set',
      studentId: 'student-1',
      studentName: 'Student One',
      status: 'not_started',
    };
    const readingSetHomework = {
      ...homeworkAssignment,
      id: 'hw-1',
      title: 'Full Test Set',
      materialTitle: 'Full Test Set',
      materialType: 'reading-passage-set',
      readingPassageSet: {
        compositionId: 'composition-1',
        compositionVersionId: 'composition-version-old',
        frozenAt: '2026-06-10T00:00:00.000Z',
        assignmentPayloadPath: 'reading_v2/projections/assignment_payloads/hw-1:composition-version-old',
        items: [],
      },
    };

    useHomeworkDetailMock.mockReturnValue({
      homework: readingSetHomework,
      submissions: [unstartedSubmission],
      loading: false,
      error: null,
      refetch,
    });

    renderPage();

    const refreshButton = await screen.findByRole('button', { name: /refresh to latest passage versions/i });
    expect(refreshButton).toBeEnabled();

    fireEvent.click(refreshButton);

    await waitFor(() => expect(refreshReadingV2MasterAssignmentFromLatestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homework: readingSetHomework,
        submissions: [unstartedSubmission],
      }),
    ));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(trackActionMock).toHaveBeenCalledWith('homework', 'reading_v2_assignment_refresh_submitted', {
      homeworkId: 'hw-1',
      passageCount: 2,
    });
  });

  it('blocks Reading V2 assignment refresh from raw submission status, not UI summary rows', async () => {
    useHomeworkDetailMock.mockReturnValue({
      homework: {
        ...homeworkAssignment,
        id: 'hw-reading-set',
        title: 'Full Test Set',
        materialTitle: 'Full Test Set',
        materialType: 'reading-passage-set',
        readingPassageSet: {
          compositionId: 'composition-1',
          compositionVersionId: 'composition-version-old',
          frozenAt: '2026-06-10T00:00:00.000Z',
          assignmentPayloadPath: 'reading_v2/projections/assignment_payloads/hw-reading-set:composition-version-old',
          items: [],
        },
      },
      submissions: [{ id: 'submission-1', studentId: 'student-1', status: 'assigned' }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(await screen.findByText(/submission submission-1 already started/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh to latest passage versions/i })).toBeDisabled();
    expect(refreshReadingV2MasterAssignmentFromLatestMock).not.toHaveBeenCalled();
  });
});
