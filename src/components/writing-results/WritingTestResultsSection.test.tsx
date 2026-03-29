import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingTestResultsSection from './WritingTestResultsSection';

const {
  getSessionResultsMock,
  getSubmissionMock,
  navigateToMock,
  trackActionMock,
  classifyTeacherResultVisibilityMock,
} = vi.hoisted(() => ({
  getSessionResultsMock: vi.fn(),
  getSubmissionMock: vi.fn(),
  navigateToMock: vi.fn(),
  trackActionMock: vi.fn(),
  classifyTeacherResultVisibilityMock: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  user: { uid: 'teacher-1' },
  profile: { role: 'teacher' },
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    profile: authState.profile,
  }),
}));

vi.mock('../../hooks/useNavigation', () => ({
  useNavigation: () => ({ navigateTo: navigateToMock }),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: trackActionMock }),
}));

vi.mock('../../services/testResults.service', () => ({
  getSessionResults: getSessionResultsMock,
}));

vi.mock('../../services/writingSubmissionService', () => ({
  getSubmission: getSubmissionMock,
}));

vi.mock('../../services/resultVisibility.service', () => ({
  classifyTeacherResultVisibility: classifyTeacherResultVisibilityMock,
}));

vi.mock('./WritingResultDetailModal', () => ({
  __esModule: true,
  default: ({ submission, onEditGrades }: any) => (
    <div>
      Writing Result Detail Modal {submission.studentName}
      <button onClick={onEditGrades}>Edit Grades</button>
    </div>
  ),
}));

const canonicalResults = [
  {
    resultId: 'submission-visible',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-1',
    studentName: 'Writer One',
    totalScore: 0,
    maxScore: 0,
    percentage: 0,
    bandScore: 6.5,
    questionResults: [],
    correct: 0,
    incorrect: 0,
    partialCredit: 0,
    totalQuestions: 0,
    submittedAt: 1_710_000_000_000,
    timeElapsed: 900,
    testDuration: 60,
    createdAt: 1_710_000_000_000,
    testTitle: 'Writing Test',
    testType: 'test',
    testSkill: 'writing',
    markingStatus: 'pending-review',
    writingData: {
      submissionId: 'submission-visible',
      overallBand: 6.5,
      markingStatus: 'pending-review',
    },
    visibility: { visibilityOwnerTeacherId: 'teacher-1' },
  },
  {
    resultId: 'submission-analytics-excluded',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-2',
    studentName: 'Writer Two',
    teacherId: 'legacy-solo-owner',
    totalScore: 0,
    maxScore: 0,
    percentage: 0,
    bandScore: 5.5,
    questionResults: [],
    correct: 0,
    incorrect: 0,
    partialCredit: 0,
    totalQuestions: 0,
    submittedAt: 1_710_000_010_000,
    timeElapsed: 880,
    testDuration: 60,
    createdAt: 1_710_000_010_000,
    testTitle: 'Writing Test',
    testType: 'test',
    testSkill: 'writing',
    markingStatus: 'graded',
    writingData: {
      submissionId: 'submission-analytics-excluded',
      overallBand: 5.5,
      markingStatus: 'graded',
    },
    visibility: {
      visibilityOwnerTeacherId: null,
      ownershipResolved: true,
      contextType: 'solo_practice',
    },
  },
  {
    resultId: 'submission-hidden',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-3',
    studentName: 'Hidden Writer',
    teacherId: 'legacy-hidden-owner',
    totalScore: 0,
    maxScore: 0,
    percentage: 0,
    bandScore: 4.5,
    questionResults: [],
    correct: 0,
    incorrect: 0,
    partialCredit: 0,
    totalQuestions: 0,
    submittedAt: 1_710_000_020_000,
    timeElapsed: 850,
    testDuration: 60,
    createdAt: 1_710_000_020_000,
    testTitle: 'Writing Test',
    testType: 'test',
    testSkill: 'writing',
    markingStatus: 'pending-review',
    writingData: {
      submissionId: 'submission-hidden',
      overallBand: 4.5,
      markingStatus: 'pending-review',
    },
    visibility: {
      visibilityOwnerTeacherId: null,
      ownershipResolved: false,
      contextType: 'course_material',
    },
  },
];

const submissionFixtures: Record<string, any> = {
  'submission-visible': {
    id: 'submission-visible',
    studentId: 'student-1',
    studentName: 'Writer One',
    context: { type: 'live-session', sessionCode: 'SESSION-1' },
    testMeta: { testId: 'test-1', testTitle: 'Writing Test', format: 'ielts', duration: 60 },
    tasks: [
      { taskNumber: 1, essayText: 'Essay 1', wordCount: 150, activeTimeSeconds: 100, taskType: 'task-1', promptText: 'Prompt', wordMinimum: 150 },
      { taskNumber: 2, essayText: 'Essay 2', wordCount: 250, activeTimeSeconds: 200, taskType: 'task-2', promptText: 'Prompt', wordMinimum: 250 },
    ],
    submittedAt: 1_710_000_000_000,
    totalElapsedTimeSeconds: 900,
    pasteAttemptCount: 0,
    markingStatus: 'pending-review',
    grading: {
      teacherId: 'teacher-1',
      teacherName: 'Teacher',
      gradedAt: 1_710_000_030_000,
      overallBand: 6.5,
      perTask: [
        { taskNumber: 1, criteriaScores: {}, taskBand: 6, isVoided: false },
        { taskNumber: 2, criteriaScores: {}, taskBand: 7, isVoided: false },
      ],
      feedback: { overall: '<p>Good</p>', perCriteria: { CC: '', LR: '', GRA: '' } },
    },
    annotations: [],
    auditTrail: [],
  },
  'submission-analytics-excluded': {
    id: 'submission-analytics-excluded',
    studentId: 'student-2',
    studentName: 'Writer Two',
    context: { type: 'live-session', sessionCode: 'SESSION-1' },
    testMeta: { testId: 'test-1', testTitle: 'Writing Test', format: 'ielts', duration: 60 },
    tasks: [],
    submittedAt: 1_710_000_010_000,
    totalElapsedTimeSeconds: 880,
    pasteAttemptCount: 0,
    markingStatus: 'graded',
    grading: {
      teacherId: 'teacher-1',
      teacherName: 'Teacher',
      gradedAt: 1_710_000_040_000,
      overallBand: 5.5,
      perTask: [
        { taskNumber: 1, criteriaScores: {}, taskBand: 5, isVoided: false },
        { taskNumber: 2, criteriaScores: {}, taskBand: 6, isVoided: false },
      ],
      feedback: { overall: '<p>Ok</p>', perCriteria: { CC: '', LR: '', GRA: '' } },
    },
    annotations: [],
    auditTrail: [],
  },
};

describe('WritingTestResultsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authState.user = { uid: 'teacher-1' };
    authState.profile = { role: 'teacher' };

    getSessionResultsMock.mockResolvedValue(canonicalResults);
    getSubmissionMock.mockImplementation(async (submissionId: string) => ({
      success: Boolean(submissionFixtures[submissionId]),
      data: submissionFixtures[submissionId],
    }));
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

  it('uses canonical visibility filtering before loading submission detail rows', async () => {
    render(<WritingTestResultsSection sessionCode="SESSION-1" testTitle="Writing Test" />);

    await screen.findByText('Writer One');
    await screen.findByText('Writer Two');

    expect(screen.queryByText('Hidden Writer')).not.toBeInTheDocument();
    expect(getSubmissionMock).toHaveBeenCalledTimes(2);
    expect(getSubmissionMock).toHaveBeenCalledWith('submission-visible');
    expect(getSubmissionMock).toHaveBeenCalledWith('submission-analytics-excluded');
    expect(screen.getByText('Total Submissions').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Writer One').closest('tr')).not.toHaveTextContent('6.5');
  });

  it('tracks result detail and grading navigation through shared hooks', async () => {
    render(<WritingTestResultsSection sessionCode="SESSION-1" testTitle="Writing Test" />);

    await screen.findByText('Writer One');

    fireEvent.click(screen.getByText('Writer One'));
    expect(await screen.findByText('Writing Result Detail Modal Writer One')).toBeInTheDocument();
    expect(trackActionMock).toHaveBeenCalledWith('viewResults', {
      source: 'teacher_test_results_writing',
      resultId: 'submission-visible',
      submissionId: 'submission-visible',
    });

    fireEvent.click(screen.getByText('Grade'));
    expect(trackActionMock).toHaveBeenCalledWith('openWritingGrading', {
      source: 'teacher_test_results_writing',
      resultId: 'submission-visible',
      submissionId: 'submission-visible',
      status: 'pending-review',
    });
    expect(navigateToMock).toHaveBeenCalledWith(
      'TEACHER_GRADING_DETAIL',
      { submissionId: 'submission-visible' },
      { reason: 'teacher_writing_results_grade' },
    );
  });

  it('surfaces draft ownership and lock conflict states from grading draft metadata', async () => {
    getSessionResultsMock.mockResolvedValue([
      {
        ...canonicalResults[0],
        resultId: 'submission-draft-owned',
        studentId: 'student-draft-owned',
        studentName: 'Draft Owner',
        writingData: {
          submissionId: 'submission-draft-owned',
          overallBand: null,
          markingStatus: 'pending-review',
        },
      },
      {
        ...canonicalResults[0],
        resultId: 'submission-draft-locked',
        studentId: 'student-draft-locked',
        studentName: 'Locked Writer',
        writingData: {
          submissionId: 'submission-draft-locked',
          overallBand: null,
          markingStatus: 'pending-review',
        },
      },
    ]);
    getSubmissionMock.mockImplementation(async (submissionId: string) => {
      if (submissionId === 'submission-draft-owned') {
        return {
          success: true,
          data: {
            ...submissionFixtures['submission-visible'],
            id: 'submission-draft-owned',
            studentId: 'student-draft-owned',
            studentName: 'Draft Owner',
            gradingDraftMeta: {
              ownerTeacherId: 'teacher-1',
            },
          },
        };
      }

      if (submissionId === 'submission-draft-locked') {
        return {
          success: true,
          data: {
            ...submissionFixtures['submission-visible'],
            id: 'submission-draft-locked',
            studentId: 'student-draft-locked',
            studentName: 'Locked Writer',
            gradingDraftMeta: {
              ownerTeacherId: 'teacher-2',
            },
          },
        };
      }

      return { success: false, data: null };
    });

    render(<WritingTestResultsSection sessionCode="SESSION-1" testTitle="Writing Test" />);

    await screen.findByText('Draft Owner');
    await screen.findByText('Locked Writer');

    expect(screen.getByText('Resume Draft')).toBeInTheDocument();
    expect(screen.getByText('View Conflict')).toBeInTheDocument();
    expect(screen.getByText('draft-in-progress')).toBeInTheDocument();
    expect(screen.getByText('lock conflict')).toBeInTheDocument();
  });

  it('uses normalized owner data for super-admin analytics classification', async () => {
    authState.user = { uid: 'admin-1' };
    authState.profile = { role: 'super_admin' };

    render(<WritingTestResultsSection sessionCode="SESSION-1" testTitle="Writing Test" />);

    await screen.findByText('Writer One');

    expect(classifyTeacherResultVisibilityMock).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ resultId: 'submission-analytics-excluded' }),
      teacherId: 'admin-1',
      hasAssignmentAccess: true,
    }));
    expect(classifyTeacherResultVisibilityMock).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ resultId: 'submission-hidden' }),
      teacherId: 'admin-1',
      hasAssignmentAccess: true,
    }));
  });
});
