import { fireEvent, render, screen } from '@testing-library/react';
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
  sendHomeworkReminderNotificationMock,
  trackActionMock,
} = vi.hoisted(() => ({
  useHomeworkDetailMock: vi.fn(),
  useClassRosterMock: vi.fn(),
  useAuthMock: vi.fn(),
  useNavigationMock: vi.fn(),
  resetStudentHomeworkMock: vi.fn(),
  updateStudentOverrideMock: vi.fn(),
  sendHomeworkReminderNotificationMock: vi.fn(),
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
  updateStudentOverride: updateStudentOverrideMock,
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
});
