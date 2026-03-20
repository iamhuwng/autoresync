import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherTestResultsPage from './TeacherTestResultsPage';

const {
  refMock,
  getMock,
  getSessionResultsMock,
  updateResultScoreMock,
  markAsReviewedMock,
  saveQuestionFeedbackMock,
  saveOverallFeedbackMock,
  trackActionMock,
} = vi.hoisted(() => ({
  refMock: vi.fn((_database, path) => ({ path })),
  getMock: vi.fn(),
  getSessionResultsMock: vi.fn(),
  updateResultScoreMock: vi.fn(),
  markAsReviewedMock: vi.fn(),
  saveQuestionFeedbackMock: vi.fn(),
  saveOverallFeedbackMock: vi.fn(),
  trackActionMock: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  ref: refMock,
  get: getMock,
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    currentUser: { uid: 'teacher-1' },
  }),
}));

vi.mock('../components/modern', () => ({
  Button: ({ children, loading: _loading, variant: _variant, size: _size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
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
    Modal: ({ opened, title, children }: any) =>
      opened ? (
        <div>
          <div>{title}</div>
          {children}
        </div>
      ) : null,
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
  default: () => <div>Writing Results Section</div>,
}));

vi.mock('../services/testResults.service', () => ({
  getSessionResults: getSessionResultsMock,
  updateResultScore: updateResultScoreMock,
  markAsReviewed: markAsReviewedMock,
}));

vi.mock('../services/feedbackService', () => ({
  saveQuestionFeedback: saveQuestionFeedbackMock,
  saveOverallFeedback: saveOverallFeedbackMock,
}));

vi.mock('../services/reportingService', () => ({
  reportingService: {
    trackAction: trackActionMock,
  },
}));

vi.mock('../utils/csvExport', () => ({
  exportClassResultsToCSV: vi.fn(),
}));

vi.mock('../utils/pdfReportGenerator', () => ({
  generateClassReportPDF: vi.fn(),
}));

vi.mock('../services/autoMarking.service', () => ({
  markTest: vi.fn(),
  calculateBandScore: vi.fn((percentage: number) => percentage / 10),
}));

const now = 1_710_000_000_000;

const sessionSnapshot = {
  sessionCode: 'SESSION-1',
  testId: 'test-1',
  lastTestId: 'test-1',
  teacherId: 'teacher-1',
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
      },
    },
    'student-2': {
      integrity: {
        violationCount: 1,
        totalEvents: 1,
        tabSwitchCount: 1,
        totalTimeAwayMs: 3000,
        copyAttempts: 0,
        pasteAttempts: 0,
        rightClickAttempts: 0,
        fullscreenExitCount: 0,
        keyboardShortcutAttempts: 0,
        forceSubmitted: false,
        forceSubmittedBy: null,
        riskLevel: 'medium',
        eventCount: 1,
        eventSummary: '1 tab switch',
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

const permanentResults = [
  {
    resultId: 'result-1',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-1',
    studentName: 'Student One',
    totalScore: 18,
    maxScore: 20,
    percentage: 90,
    bandScore: 8,
    questionResults: [],
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
  },
  {
    resultId: 'result-2',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-2',
    studentName: 'Student Two',
    totalScore: 15,
    maxScore: 20,
    percentage: 75,
    bandScore: 6.5,
    questionResults: [],
    correct: 15,
    incorrect: 5,
    partialCredit: 0,
    totalQuestions: 20,
    submittedAt: now - 1_000,
    timeElapsed: 880,
    testDuration: 60,
    createdAt: now - 1_000,
    testTitle: 'Reading Test',
    testType: 'test',
    testSkill: 'reading',
    markingStatus: 'auto-marked',
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

    getMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path === 'game_sessions/SESSION-1') {
        return createSnapshot(sessionSnapshot);
      }

      if (path === 'users/teacher-1/role') {
        return createSnapshot('teacher');
      }

      if (path === 'tests/test-1') {
        return createSnapshot(testSnapshot);
      }

      return createSnapshot(null);
    });

    getSessionResultsMock.mockResolvedValue(permanentResults);
    updateResultScoreMock.mockResolvedValue(undefined);
    markAsReviewedMock.mockResolvedValue(undefined);
    saveQuestionFeedbackMock.mockResolvedValue(undefined);
    saveOverallFeedbackMock.mockResolvedValue(undefined);
  });

  it('shows detail panels only for valid session integrity reports with event timelines', async () => {
    renderPage();

    await screen.findByText('Student One');
    await screen.findByText('Student Two');

    expect(screen.getByTitle('2 integrity violations')).toBeInTheDocument();
    expect(screen.queryByTitle('1 integrity violation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('2 integrity violations'));

    expect(await screen.findByText('Event Timeline (2 events)')).toBeInTheDocument();
    expect(screen.getAllByText(/Tab Switch/).length).toBeGreaterThan(0);
    expect(trackActionMock).toHaveBeenCalledWith('results', 'viewIntegrityDetails', {
      sessionCode: 'SESSION-1',
      studentId: 'student-1',
      studentName: 'Student One',
      violationCount: 2,
    });
  });
});
