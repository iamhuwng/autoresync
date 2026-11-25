import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../types/homework.types';
import { transformStudentHomeworkListRecords } from '../hooks/useHomeworkSubmission';
import { isBookHomeworkCompatibilityProjection } from '../services/book-homework/bookHomeworkCompatibilityProjection.service';
import { buildBookHomeworkListRecord } from '../services/book-homework/bookHomeworkStudentList.service';
import type { StudentBookHomeworkSummaryRecord } from '../services/book-homework/studentBookHomeworkSummary.types';
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

vi.mock('../services/firebase', () => ({
  database: {},
  auth: {},
  firestore: {},
}));

vi.mock('../services/homeworkSubmissionService', () => ({
  createSubmission: (...args: unknown[]) => createSubmissionMock(...args),
}));

vi.mock('../components/layout/StudentLayout', () => ({
  StudentLayout: ({ children, sidebar, rightPanel }: any) => (
    <div>
      <div>{sidebar}</div>
      <div>{children}</div>
      <div data-testid="right-panel">{rightPanel}</div>
    </div>
  ),
}));

vi.mock('../components/layout/StudentSidebar', () => ({
  StudentSidebar: ({ pendingHomeworkCount }: { pendingHomeworkCount?: number }) => (
    <div data-testid="student-sidebar" data-pending-homework-count={pendingHomeworkCount ?? 0}>
      Sidebar
    </div>
  ),
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

  it('opens homework detail instead of no-op when the list row cannot start directly', () => {
    const blockedItem = makeHomeworkItem({
      canSubmit: false,
      attemptsRemaining: 0,
      status: 'not_started',
    });

    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [blockedItem],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [blockedItem],
      inProgress: [],
      completed: [],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    fireEvent.click(screen.getByText('View Details'));

    expect(createSubmissionMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith(
      'STUDENT_HOMEWORK_DETAIL',
      { homeworkId: 'hw-1' },
      { reason: 'student_homework_detail_from_list' },
    );
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

  it('starts an allowed retake instead of opening the previous result', async () => {
    const item = makeHomeworkItem({
      latestSubmission: { id: 'previous-attempt', status: 'submitted', resultId: 'previous-result', percentage: 100 },
      status: 'submitted',
      attemptsUsed: 1,
      attemptsRemaining: 1,
    });
    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [item], isLoading: false, error: null, refreshData: vi.fn(),
      notStarted: [], inProgress: [], completed: [item], overdue: [],
    });

    render(<StudentHomeworkListPage />);
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(createSubmissionMock).toHaveBeenCalledWith('hw-1', 'student-1', 'Student One'));
    expect(navigateMock).toHaveBeenCalledWith('STUDENT_PRACTICE', { materialId: 'material-1' }, expect.objectContaining({
      state: expect.objectContaining({ submissionId: 'submission-1' }),
    }));
    expect(screen.queryByTestId('result-slide-panel')).not.toBeInTheDocument();
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

  it('shows Reading Passage set summary without loading material detail', () => {
    const passageSetItem = makeHomeworkItem({
      homework: {
        ...makeHomeworkItem().homework,
        title: 'Selected Reading Passages',
        materialId: 'reading-passage-set:hw-1',
        materialTitle: 'Selected Reading Passages',
        materialSkill: 'reading',
        materialType: 'reading-passage-set',
        readingPassageSet: {
          titleSnapshot: 'Selected Reading Passages',
          items: [
            {
              order: 1,
              passageMaterialId: 'passage-a',
              snapshotVersionId: 'snapshot-a',
              titleSnapshot: 'Passage A',
              questionCount: 10,
              testTypeIds: ['ielts'],
            },
            {
              order: 2,
              passageMaterialId: 'passage-b',
              snapshotVersionId: 'snapshot-b',
              titleSnapshot: 'Passage B',
              questionCount: 8,
              testTypeIds: ['ielts'],
            },
          ],
        },
      },
    });

    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [passageSetItem],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [passageSetItem],
      inProgress: [],
      completed: [],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    expect(screen.getByText('Reading Passage Set')).toBeInTheDocument();
    expect(screen.getByText('2 passages, 18 questions')).toBeInTheDocument();
    expect(screen.getByText('Passage A, Passage B')).toBeInTheDocument();
  });

  it('routes a Book compatibility assignment to detail without legacy submission dispatch', async () => {
    const bookItem = makeHomeworkItem({
      homework: {
        schemaVersion: 1,
        assignmentKind: 'book_homework_compatibility',
        id: 'book-assignment-1',
        createdBy: 'teacher-1',
        createdAt: 100,
        updatedAt: 200,
        materialId: 'book-material-1',
        materialTitle: 'Vocabulary Book',
        materialType: 'book',
        materialSkill: 'mixed',
        title: 'Vocabulary Book Homework',
        target: { type: 'students', studentIds: ['student-1'] },
        scheduling: { dueDate: Date.now() + 60_000 },
        config: {
          timerMinutes: null,
          maxAttempts: null,
          feedbackTiming: 'never',
          lateSubmissionAllowed: false,
        },
        visibility: {
          showTimer: false,
          showAttempts: false,
          showDueDate: true,
          showQuestionCount: false,
          showDuration: false,
        },
        archived: false,
        tags: [],
        bookHomeworkCompatibility: {
          schemaVersion: 1,
          assignmentId: 'book-assignment-1',
          sourceSagaRevision: 3,
          sourceFingerprint: 'fingerprint-1',
        },
      },
      canSubmit: false,
      attemptsRemaining: null,
      status: 'not_started',
    });

    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [bookItem],
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
      notStarted: [bookItem],
      inProgress: [],
      completed: [],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    const bookCard = screen.getByText('Vocabulary Book Homework').closest('article');
    expect(bookCard).toHaveTextContent('Book Homework');
    expect(bookCard).not.toHaveTextContent('Not Started');
    expect(bookCard).not.toHaveTextContent('Attempts:');

    fireEvent.click(screen.getByText('View Details'));

    await waitFor(() => {
      expect(createSubmissionMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith(
        'STUDENT_HOMEWORK_DETAIL',
        { homeworkId: 'book-assignment-1' },
        { reason: 'student_book_homework_detail' },
      );
      expect(trackActionMock).toHaveBeenCalledWith(
        'bookHomeworkStudentDetailOpened',
        {
          homeworkId: 'book-assignment-1',
          source: 'student_homework_list',
        },
      );
    });
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

  it('keeps last-good Homework visible when a warmed refresh fails', () => {
    const refreshData = vi.fn();
    const notStartedItem = makeHomeworkItem();
    useResolvedStudentHomeworkListMock.mockReturnValue({
      homeworkItems: [notStartedItem],
      isLoading: false,
      error: 'Refresh failed',
      refreshData,
      notStarted: [notStartedItem],
      inProgress: [],
      completed: [],
      overdue: [],
    });

    render(<StudentHomeworkListPage />);

    expect(screen.getByText('Reading Homework')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh failed');
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(refreshData).toHaveBeenCalledOnce();
    expect(trackActionMock).toHaveBeenCalledWith('refreshHomeworkList', {
      source: 'stale_content_error',
    });
  });

  it('accurately categorizes Book compatibility assignments across summary cards, tabs, due-soon widgets, and sidebar count without inflating overdue or pending counts for completed work', () => {
    const now = Date.now();

    const makeGenuineBookAssignment = (
      id: string,
      title: string,
      dueDate: number,
      createdAt: number,
    ): HomeworkAssignment => ({
      schemaVersion: 1,
      assignmentKind: 'book_homework_compatibility',
      id,
      createdBy: 'teacher-1',
      createdAt,
      updatedAt: createdAt,
      materialId: `book-${id}`,
      materialTitle: title,
      materialType: 'book',
      materialSkill: 'mixed',
      title,
      target: { type: 'students', studentIds: ['student-1'] },
      scheduling: { dueDate },
      config: {
        timerMinutes: null,
        maxAttempts: null,
        feedbackTiming: 'never',
        lateSubmissionAllowed: false,
      },
      visibility: {
        showTimer: false,
        showAttempts: false,
        showDueDate: true,
        showQuestionCount: false,
        showDuration: false,
      },
      archived: false,
      tags: [],
      bookHomeworkCompatibility: {
        schemaVersion: 1,
        assignmentId: id,
        sourceSagaRevision: 1,
        sourceFingerprint: `fp-${id}`,
      },
    } as unknown as HomeworkAssignment);

    const makeSummary = (
      homeworkId: string,
      overrides: Partial<StudentBookHomeworkSummaryRecord>,
    ): StudentBookHomeworkSummaryRecord => ({
      schemaVersion: 1,
      studentId: 'student-1',
      homeworkId,
      bookId: `book-${homeworkId}`,
      status: 'not_started',
      isComplete: false,
      submittedCount: 0,
      requiredCount: 2,
      scoredCount: 0,
      pendingReviewCount: 0,
      latestSubmittedAt: 0,
      updatedAt: now,
      activities: [],
      ...overrides,
    });

    // 1. Completed Book homework with earliest past dueDate -> MUST land in Completed, NEVER Overdue or nextDueItem
    const bookCompletedPastDueHw = makeGenuineBookAssignment(
      'hw-book-completed-past',
      'Book PDF Completed Past Due',
      now - 2 * 86_400_000,
      500,
    );
    // 2. Completed Book homework due within 24h -> MUST land in Completed, NEVER dueSoonItems or Not Started
    const bookCompletedDueSoonHw = makeGenuineBookAssignment(
      'hw-book-completed-soon',
      'Book PDF Completed Due Soon',
      now + 4 * 3_600_000,
      450,
    );
    // 3. Uncompleted overdue Book homework -> lands in Overdue and becomes nextDueItem
    const bookOverdueHw = makeGenuineBookAssignment(
      'hw-book-overdue',
      'Book PDF Overdue Incomplete',
      now - 86_400_000,
      400,
    );
    // 4. In-progress Book homework due within 24h -> lands in In Progress and counts in dueSoonItems
    const bookInProgressHw = makeGenuineBookAssignment(
      'hw-book-in-progress',
      'Book PDF In Progress Soon',
      now + 12 * 3_600_000,
      300,
    );
    // 5. Not-started Book homework due in 5 days -> lands in Not Started and pendingHomeworkCount (not dueSoonItems)
    const bookNotStartedHw = makeGenuineBookAssignment(
      'hw-book-not-started',
      'Book PDF Not Started Future',
      now + 5 * 86_400_000,
      200,
    );

    for (const fixture of [
      bookCompletedPastDueHw,
      bookCompletedDueSoonHw,
      bookOverdueHw,
      bookInProgressHw,
      bookNotStartedHw,
    ]) {
      expect(isBookHomeworkCompatibilityProjection(fixture)).toBe(true);
    }

    const listRecords = [
      buildBookHomeworkListRecord(
        bookCompletedPastDueHw,
        now,
        makeSummary('hw-book-completed-past', {
          status: 'completed',
          isComplete: true,
          submittedCount: 2,
          requiredCount: 2,
          scoredCount: 2,
          pendingReviewCount: 0,
          latestSubmittedAt: now - 3 * 86_400_000,
        }),
      ),
      buildBookHomeworkListRecord(
        bookCompletedDueSoonHw,
        now,
        makeSummary('hw-book-completed-soon', {
          status: 'completed',
          isComplete: true,
          submittedCount: 2,
          requiredCount: 2,
          scoredCount: 1,
          pendingReviewCount: 1,
          latestSubmittedAt: now - 3_600_000,
        }),
      ),
      buildBookHomeworkListRecord(
        bookOverdueHw,
        now,
        makeSummary('hw-book-overdue', {
          status: 'in_progress',
          isComplete: false,
          submittedCount: 1,
          requiredCount: 2,
          scoredCount: 1,
          pendingReviewCount: 0,
          latestSubmittedAt: now - 2 * 86_400_000,
        }),
      ),
      buildBookHomeworkListRecord(
        bookInProgressHw,
        now,
        makeSummary('hw-book-in-progress', {
          status: 'in_progress',
          isComplete: false,
          submittedCount: 1,
          requiredCount: 3,
          scoredCount: 0,
          pendingReviewCount: 1,
          latestSubmittedAt: now - 1_800_000,
        }),
      ),
      buildBookHomeworkListRecord(bookNotStartedHw, now, null),
    ];

    const categorized = transformStudentHomeworkListRecords(listRecords);
    expect(categorized.completed.map((item) => item.homework.id)).toEqual([
      'hw-book-completed-past',
      'hw-book-completed-soon',
    ]);
    expect(categorized.completed[0]?.status).toBe('graded');
    expect(categorized.completed[0]?.isOverdue).toBe(false);
    expect(categorized.completed[1]?.status).toBe('submitted');
    expect(categorized.notStarted.map((item) => item.homework.id)).toEqual(['hw-book-not-started']);
    expect(categorized.inProgress.map((item) => item.homework.id)).toEqual(['hw-book-in-progress']);
    expect(categorized.overdue.map((item) => item.homework.id)).toEqual(['hw-book-overdue']);

    useResolvedStudentHomeworkListMock.mockReturnValue({
      ...categorized,
      isLoading: false,
      error: null,
      refreshData: vi.fn(),
    });

    render(<StudentHomeworkListPage />);

    const summaryCardValue = (label: string) => {
      const card = screen.getAllByText(label)
        .find((el) => el.parentElement?.textContent?.includes('Total assigned tasks')
          || el.parentElement?.textContent?.includes('Awaiting first attempt')
          || el.parentElement?.textContent?.includes('Currently working on')
          || el.parentElement?.textContent?.includes('Submitted or graded')
          || el.parentElement?.textContent?.includes('Past due date'))!.parentElement!;
      return card.textContent;
    };
    expect(summaryCardValue('Assignments')).toContain('5');
    expect(summaryCardValue('Not Started')).toContain('1');
    expect(summaryCardValue('In Progress')).toContain('1');
    expect(summaryCardValue('Completed')).toContain('2');
    expect(summaryCardValue('Overdue')).toContain('1');

    // StudentSidebar pendingHomeworkCount reflects only genuine notStarted items (1), not completed Book homeworks
    expect(screen.getByTestId('student-sidebar')).toHaveAttribute('data-pending-homework-count', '1');

    // Right-rail Due Soon callout & nextDueItem exclude completed Book homeworks
    const rightPanel = screen.getByTestId('right-panel');
    expect(rightPanel).toHaveTextContent('1 assignment');
    expect(rightPanel).toHaveTextContent('Book PDF Overdue Incomplete');
    expect(rightPanel).not.toHaveTextContent('Book PDF Completed Past Due');
    expect(rightPanel).not.toHaveTextContent('Book PDF Completed Due Soon');

    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(screen.getByText('Book PDF Completed Past Due')).toBeInTheDocument();
    expect(screen.getByText('Book PDF Completed Due Soon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Not Started' }));
    expect(screen.getByText('Book PDF Not Started Future')).toBeInTheDocument();
    expect(screen.queryByText('Book PDF Completed Past Due')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'In Progress' }));
    expect(screen.getByText('Book PDF In Progress Soon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(screen.getByText('Book PDF Overdue Incomplete')).toBeInTheDocument();
    expect(screen.queryByText('Book PDF Completed Past Due')).not.toBeInTheDocument();
  });
});
