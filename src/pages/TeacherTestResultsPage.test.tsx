import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherTestResultsPage from './TeacherTestResultsPage';

const {
  refMock,
  getMock,
  getSessionResultsMock,
  exportClassResultsToCSVMock,
  generateClassReportPDFMock,
  trackActionMock,
  reportingTrackActionMock,
  navigateToMock,
  classifyTeacherResultVisibilityMock,
} = vi.hoisted(() => ({
  refMock: vi.fn((_database, path) => ({ path })),
  getMock: vi.fn(),
  getSessionResultsMock: vi.fn(),
  exportClassResultsToCSVMock: vi.fn(),
  generateClassReportPDFMock: vi.fn(),
  trackActionMock: vi.fn(),
  reportingTrackActionMock: vi.fn(),
  navigateToMock: vi.fn(),
  classifyTeacherResultVisibilityMock: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  user: { uid: 'teacher-1' },
  profile: { role: 'teacher' },
}));

vi.mock('../services/firebase', () => ({ database: {} }));
vi.mock('firebase/database', () => ({ ref: refMock, get: getMock }));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    profile: authState.profile,
  }),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({ navigateTo: navigateToMock }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: trackActionMock }),
}));

vi.mock('../components/modern', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardBody: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@mantine/core', () => {
  const Box = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const Tabs = ({ children }: any) => <div>{children}</div>;
  Tabs.List = Box;
  Tabs.Tab = ({ children, ...props }: any) => <button {...props}>{children}</button>;
  Tabs.Panel = Box;

  return {
    Center: Box,
    Loader: () => <div>Loading...</div>,
    Modal: ({ opened, children }: any) => (opened ? <div>{children}</div> : null),
    Stack: Box,
    Title: Box,
    Text: Box,
    Tabs,
    Badge: ({ children }: any) => <span>{children}</span>,
    Group: Box,
  };
});

vi.mock('../components/results/QuestionAnalytics', () => ({
  QuestionAnalytics: () => <div>Question Analytics</div>,
}));

vi.mock('../components/results/ReMarkingModal', () => ({
  ReMarkingModal: () => null,
}));

vi.mock('../components/feedback/FeedbackEditor', () => ({
  FeedbackEditor: () => <div>Feedback Editor</div>,
}));

vi.mock('../components/writing-results/WritingTestResultsSection', () => ({
  __esModule: true,
  default: ({ sessionCode, testTitle }: any) => <div>Writing Results Section {sessionCode} {testTitle}</div>,
}));

vi.mock('../services/testResults.service', () => ({
  getSessionResults: getSessionResultsMock,
  updateResultScore: vi.fn(),
  markAsReviewed: vi.fn(),
}));

vi.mock('../services/feedbackService', () => ({
  saveQuestionFeedback: vi.fn(),
  saveOverallFeedback: vi.fn(),
}));

vi.mock('../utils/csvExport', () => ({
  exportClassResultsToCSV: exportClassResultsToCSVMock,
}));

vi.mock('../utils/pdfReportGenerator', () => ({
  generateClassReportPDF: generateClassReportPDFMock,
}));

vi.mock('../services/reportingService', () => ({
  reportingService: {
    trackAction: reportingTrackActionMock,
  },
}));

vi.mock('../services/resultVisibility.service', () => ({
  classifyTeacherResultVisibility: classifyTeacherResultVisibilityMock,
}));

const now = 1_710_000_000_000;

const sessionSnapshot = {
  sessionCode: 'SESSION-1',
  testId: 'test-1',
  lastTestId: 'test-1',
  status: 'completed',
  createdAt: now - 60_000,
  players: {
    'student-1': {
      integrity: {
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
        riskLevel: 'medium',
        events: [
          { type: 'tab_switch', timestamp: now - 10_000, durationMs: 6000, withinGrace: false, counted: true },
          { type: 'copy_attempt', timestamp: now - 5_000, withinGrace: false, counted: true },
        ],
      },
    },
  },
};

const testSnapshot = {
  title: 'Reading Test',
  type: 'test',
  skill: 'reading',
  questions: [],
  duration: 60,
};

const canonicalResults = [
  {
    resultId: 'result-visible',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-1',
    studentName: 'Student One',
    totalScore: 18,
    maxScore: 20,
    percentage: 90,
    bandScore: 8,
    questionResults: [
      {
        questionNumber: 1,
        questionType: 'multiple-choice',
        isCorrect: true,
        score: 1,
        maxScore: 1,
        studentAnswer: 'A',
        correctAnswer: 'A',
        feedback: '',
      },
    ],
    correct: 18,
    incorrect: 2,
    partialCredit: 0,
    totalQuestions: 20,
    submittedAt: now - 2_000,
    timeElapsed: 900,
    testDuration: 60,
    createdAt: now - 2_000,
    testTitle: 'Reading Test',
    testType: 'test',
    testSkill: 'reading',
    markingStatus: 'auto-marked',
    visibility: { visibilityOwnerTeacherId: 'teacher-1' },
  },
  {
    resultId: 'result-analytics-excluded',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-2',
    studentName: 'Student Two',
    teacherId: 'legacy-solo-owner',
    totalScore: 15,
    maxScore: 20,
    percentage: 75,
    bandScore: 6.5,
    questionResults: [
      {
        questionNumber: 2,
        questionType: 'multiple-choice',
        isCorrect: false,
        score: 0,
        maxScore: 1,
        studentAnswer: 'B',
        correctAnswer: 'C',
        feedback: '',
      },
    ],
    correct: 15,
    incorrect: 5,
    partialCredit: 0,
    totalQuestions: 20,
    submittedAt: now - 1_500,
    timeElapsed: 880,
    testDuration: 60,
    createdAt: now - 1_500,
    testTitle: 'Reading Test',
    testType: 'test',
    testSkill: 'reading',
    markingStatus: 'auto-marked',
    visibility: {
      visibilityOwnerTeacherId: null,
      ownershipResolved: true,
      contextType: 'solo_practice',
    },
  },
  {
    resultId: 'result-hidden',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-3',
    studentName: 'Hidden Student',
    teacherId: 'legacy-hidden-owner',
    totalScore: 12,
    maxScore: 20,
    percentage: 60,
    bandScore: 5.5,
    questionResults: [],
    correct: 12,
    incorrect: 8,
    partialCredit: 0,
    totalQuestions: 20,
    submittedAt: now - 1_000,
    timeElapsed: 870,
    testDuration: 60,
    createdAt: now - 1_000,
    testTitle: 'Reading Test',
    testType: 'test',
    testSkill: 'reading',
    markingStatus: 'auto-marked',
    visibility: {
      visibilityOwnerTeacherId: null,
      ownershipResolved: false,
      contextType: 'course_material',
    },
  },
];

function createSnapshot(value: any) {
  return {
    exists: () => value !== null,
    val: () => value,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher-test-results/SESSION-1']}>
      <Routes>
        <Route path="/teacher-test-results/:sessionCode" element={<TeacherTestResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeacherTestResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authState.user = { uid: 'teacher-1' };
    authState.profile = { role: 'teacher' };

    getMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path === 'game_sessions/SESSION-1') {
        return createSnapshot(sessionSnapshot);
      }
      if (path === 'tests/test-1') {
        return createSnapshot(testSnapshot);
      }
      return createSnapshot(null);
    });

    getSessionResultsMock.mockResolvedValue(canonicalResults);
    classifyTeacherResultVisibilityMock.mockImplementation(({ result }: any) => {
      if (result.visibility?.ownershipResolved === false) {
        return { shouldDisplayInTeacherHistory: false, excludeFromAnalytics: false };
      }
      if (result.visibility?.contextType === 'solo_practice') {
        return { shouldDisplayInTeacherHistory: true, excludeFromAnalytics: true };
      }
      return { shouldDisplayInTeacherHistory: true, excludeFromAnalytics: false };
    });
  });

  it('renders only teacher-visible rows and filters analytics exports to eligible results', async () => {
    renderPage();

    await screen.findByText('Student One');
    await screen.findByText('Student Two');

    expect(screen.queryByText('Hidden Student')).not.toBeInTheDocument();
    expect(screen.getByText('Students').parentElement).toHaveTextContent('1');
    expect(screen.getAllByText('Question Analytics')).toHaveLength(1);

    fireEvent.click(screen.getByText('Download CSV'));
    expect(trackActionMock).toHaveBeenCalledWith('exportResultsCsv', {
      source: 'teacher_test_results',
      sessionCode: 'SESSION-1',
      resultCount: 1,
    });
    expect(exportClassResultsToCSVMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ studentName: 'Student One' }),
      ]),
      'SESSION-1',
      'Reading Test',
    );
    expect(exportClassResultsToCSVMock.mock.calls[0][0]).toHaveLength(1);

    fireEvent.click(screen.getByText('Export PDF'));
    expect(trackActionMock).toHaveBeenCalledWith('exportResultsPdf', {
      source: 'teacher_test_results',
      sessionCode: 'SESSION-1',
      resultCount: 1,
    });
    expect(generateClassReportPDFMock.mock.calls[0][0]).toHaveLength(1);
    expect(generateClassReportPDFMock.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({ studentName: 'Student One' }),
    );
  });

  it('uses normalized owner data for super-admin analytics classification', async () => {
    authState.user = { uid: 'admin-1' };
    authState.profile = { role: 'super_admin' };

    renderPage();

    await screen.findByText('Student One');

    expect(classifyTeacherResultVisibilityMock).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ resultId: 'result-analytics-excluded' }),
      teacherId: 'admin-1',
      hasAssignmentAccess: true,
    }));
    expect(classifyTeacherResultVisibilityMock).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ resultId: 'result-hidden' }),
      teacherId: 'admin-1',
      hasAssignmentAccess: true,
    }));
  });

  it('uses shared navigation for history and keeps integrity tracking intact', async () => {
    renderPage();

    await screen.findByText('Student One');
    fireEvent.click(screen.getAllByText('History')[0]);

    expect(trackActionMock).toHaveBeenCalledWith('openStudentHistory', {
      source: 'teacher_test_results',
      sessionCode: 'SESSION-1',
      studentId: 'student-1',
      resultId: 'result-visible',
    });
    expect(navigateToMock).toHaveBeenCalledWith(
      'TEACHER_STUDENT_HISTORY',
      { studentId: 'student-1' },
      { reason: 'teacher_test_results_history' },
    );

    fireEvent.click(await screen.findByTitle('2 integrity violations'));
    expect(await screen.findByText('Event Timeline (2 events)')).toBeInTheDocument();
    expect(reportingTrackActionMock).toHaveBeenCalledWith('results', 'viewIntegrityDetails', {
      sessionCode: 'SESSION-1',
      studentId: 'student-1',
      studentName: 'Student One',
      violationCount: 2,
    });
  });

  it('hands writing sessions off to the dedicated writing results surface', async () => {
    getMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path === 'game_sessions/SESSION-1') {
        return createSnapshot(sessionSnapshot);
      }
      if (path === 'tests/test-1') {
        return createSnapshot({ ...testSnapshot, skill: 'Writing' });
      }
      return createSnapshot(null);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Writing Results Section SESSION-1 Reading Test')).toBeInTheDocument();
    });
  });
});
