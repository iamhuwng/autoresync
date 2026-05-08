import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoloSubmission } from './useSoloSubmission';
import { getTestQuestionsFromFirebase } from '../../services/testStorage';
import { scoreQuestion } from '../../services/autoMarking.service';
import { saveTestResult } from '../../services/testResults.service';
import { clearSoloProgress } from './useSoloAutoSave';
import { getIELTSQuestionsForStudent } from '../../utils/thcsShuffle';
import type { HomeworkIntegrity } from '../../types/integrity.types';
import { submitHomework } from '../../services/homeworkSubmissionService';

const {
  mockNavigateTo,
  mockTrackAntiCheatAction,
} = vi.hoisted(() => ({
  mockNavigateTo: vi.fn(() => ({ success: true })),
  mockTrackAntiCheatAction: vi.fn(),
}));

vi.mock('../useNavigation', () => ({
  useNavigation: () => ({ navigateTo: mockNavigateTo }),
}));

vi.mock('../../services/testStorage', () => ({
  getTestQuestionsFromFirebase: vi.fn(),
}));

vi.mock('../../services/autoMarking.service', () => ({
  scoreQuestion: vi.fn(),
}));

vi.mock('../../services/testResults.service', () => ({
  saveTestResult: vi.fn(),
}));

vi.mock('./useSoloAutoSave', () => ({
  clearSoloProgress: vi.fn(),
}));

vi.mock('../../services/homeworkSubmissionService', () => ({
  submitHomework: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../services/antiCheatReporting', () => ({
  summarizeError: (error: unknown) => ({
    errorMessage: error instanceof Error ? error.message : String(error),
  }),
  summarizeIntegritySnapshot: (report: any) => ({
    violationCount: report?.violationCount ?? 0,
    totalEvents: report?.totalEvents ?? 0,
    riskLevel: report?.riskLevel ?? 'low',
    forceSubmitted: report?.forceSubmitted ?? false,
  }),
  trackAntiCheatAction: mockTrackAntiCheatAction,
}));

describe('useSoloSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getTestQuestionsFromFirebase).mockResolvedValue({
      success: true,
      data: [
        {
          number: 1,
          type: 'multiple-choice',
          question: 'Q1',
          options: ['A', 'B'],
          answer: 'A',
          passageId: 'p1',
          points: 1,
        },
      ] as any,
    });

    vi.mocked(scoreQuestion).mockImplementation((question: any, studentAnswer: string) => ({
      isCorrect: question.answer === studentAnswer,
      score: question.answer === studentAnswer ? 1 : 0,
    }) as any);

    vi.mocked(saveTestResult).mockResolvedValue('result-1');
  });

  it('lazy-loads grading questions at submit time and reuses them for result persistence', async () => {
    const questionsWithAnswersRef = { current: null } as any;

    const { result } = renderHook(() =>
      useSoloSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          questionCount: 1,
          title: 'Practice Test',
          type: 'IELTS',
          skill: 'Reading',
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        answers: {
          1: 'A',
        },
        materialId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student One',
        timeRemaining: 1200,
        resolvedSettings: null,
        context: {
          type: 'self_study',
          source: {
            type: 'material',
            id: 'test-1',
            name: 'Practice Test',
          },
        },
        questionsWithAnswersRef,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    await waitFor(() => {
      expect(getTestQuestionsFromFirebase).toHaveBeenCalledWith('test-1');
      expect(saveTestResult).toHaveBeenCalled();
    });

    const saveCall = vi.mocked(saveTestResult).mock.calls[0];
    expect(saveCall?.[7]).toBeUndefined();
    expect(saveCall?.[11]).toEqual(
      expect.objectContaining({
        type: 'self_study',
        source: expect.objectContaining({
          id: 'test-1',
          name: 'Practice Test',
        }),
      }),
    );

    expect(getTestQuestionsFromFirebase).toHaveBeenCalledTimes(1);
    expect(questionsWithAnswersRef.current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ answer: 'A' }),
      ]),
    );
    expect(clearSoloProgress).toHaveBeenCalledWith('test-1', 'student-1');
    expect(mockNavigateTo).toHaveBeenCalledWith('STUDENT_ACADEMIC_RECORD', undefined, {
      replace: true,
      state: { resultId: 'result-1', showResult: true },
      reason: 'test_submission_solo',
    });
    expect(saveCall?.[13]).toEqual(
      expect.objectContaining({
        passageResults: expect.arrayContaining([
          expect.objectContaining({
            passageName: 'Passage 1',
          }),
        ]),
      }),
    );
  });

  it('replays option shuffling on lazy grading questions for homework or practice flows', async () => {
    const fullQuestions = [
      {
        id: 'question-1',
        number: 1,
        type: 'multiple-choice',
        question: 'Q1',
        options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        answer: 'B',
        passageId: 'p1',
        points: 1,
      },
    ] as any;

    const studentId = ['student-a', 'student-b', 'student-c', 'student-d'].find((candidate) => {
      const shuffled = getIELTSQuestionsForStudent(fullQuestions, candidate, 'test-1', {
        shuffleQuestions: false,
        shuffleOptions: true,
      })[0];

      return shuffled.options.join('|') !== fullQuestions[0]!.options.join('|');
    });

    expect(studentId).toBeDefined();

    const shuffledGradingQuestion = getIELTSQuestionsForStudent(fullQuestions, studentId!, 'test-1', {
      shuffleQuestions: false,
      shuffleOptions: true,
    })[0];

    vi.mocked(getTestQuestionsFromFirebase).mockResolvedValueOnce({
      success: true,
      data: fullQuestions,
    });

    vi.mocked(scoreQuestion).mockImplementation((question: any, studentAnswer: string) => ({
      isCorrect: question.answer === studentAnswer,
      score: question.answer === studentAnswer ? 1 : 0,
    }) as any);

    const { result } = renderHook(() =>
      useSoloSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          questionCount: 1,
          title: 'Practice Test',
          type: 'IELTS',
          skill: 'Reading',
          questions: [
            {
              id: 'question-1',
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: shuffledGradingQuestion.options,
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        answers: {
          1: shuffledGradingQuestion.answer,
        },
        materialId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student One',
        timeRemaining: 1200,
        resolvedSettings: null,
        context: {
          type: 'self_study',
          source: {
            type: 'material',
            id: 'test-1',
            name: 'Practice Test',
          },
        },
        questionPresentation: {
          studentId,
          shuffleQuestions: false,
          shuffleOptions: true,
        },
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    await waitFor(() => {
      expect(scoreQuestion).toHaveBeenCalled();
    });

    expect(vi.mocked(scoreQuestion).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        options: shuffledGradingQuestion.options,
        answer: shuffledGradingQuestion.answer,
      }),
    );
    expect(clearSoloProgress).toHaveBeenCalledWith('test-1', 'student-1');
    const homeworkSaveCall = vi.mocked(saveTestResult).mock.calls[0];
    expect(homeworkSaveCall?.[13]).toEqual(
      expect.objectContaining({
        passageResults: expect.arrayContaining([
          expect.objectContaining({
            passageName: 'Passage 1',
          }),
        ]),
      }),
    );
  });

  it('persists canonical course-material identifiers without a teacher shortcut', async () => {
    const { result } = renderHook(() =>
      useSoloSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          questionCount: 1,
          title: 'Course Test',
          type: 'IELTS',
          skill: 'Reading',
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        answers: { 1: 'A' },
        materialId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student One',
        timeRemaining: 1200,
        resolvedSettings: null,
        context: {
          type: 'course_material',
          source: {
            type: 'course',
            id: 'course-1',
            name: 'Course One',
          },
        },
        courseContext: {
          courseId: 'course-1',
          moduleId: 'module-1',
        },
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    await waitFor(() => {
      expect(saveTestResult).toHaveBeenCalled();
    });

    const saveCall = vi.mocked(saveTestResult).mock.calls[0];
    expect(saveCall?.[7]).toBeUndefined();
    expect(saveCall?.[10]).toEqual(
      expect.objectContaining({
        courseId: 'course-1',
        moduleId: 'module-1',
      }),
    );
    expect(saveCall?.[11]).toEqual(
      expect.objectContaining({
        type: 'course_material',
        courseId: 'course-1',
        source: expect.objectContaining({
          id: 'course-1',
          name: 'Course One',
          courseId: 'course-1',
        }),
      }),
    );
  });

  it('falls back to materialId and test title when context source id/name are missing', async () => {
    const { result } = renderHook(() =>
      useSoloSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          questionCount: 1,
          title: 'Fallback Title',
          type: 'IELTS',
          skill: 'Reading',
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        answers: { 1: 'A' },
        materialId: 'material-1',
        studentId: 'student-1',
        studentName: 'Student One',
        timeRemaining: 1200,
        resolvedSettings: null,
        context: {
          type: 'self_study',
          source: {
            type: 'material',
          },
        },
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    await waitFor(() => {
      expect(saveTestResult).toHaveBeenCalled();
    });

    const saveCall = vi.mocked(saveTestResult).mock.calls[0];
    expect(saveCall?.[11]).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({
          id: 'material-1',
          name: 'Fallback Title',
        }),
      }),
    );
  });

  it('tracks homework integrity persistence when the homework submission write succeeds', async () => {
    const integrity: HomeworkIntegrity = {
      violationCount: 2,
      totalEvents: 4,
      tabSwitchCount: 2,
      totalTimeAwayMs: 9000,
      copyAttempts: 1,
      pasteAttempts: 0,
      rightClickAttempts: 0,
      fullscreenExitCount: 0,
      keyboardShortcutAttempts: 0,
      forceSubmitted: true,
      forceSubmittedBy: 'system',
      riskLevel: 'high',
      eventCount: 4,
      eventSummary: '2 tab switches, 1 copy attempt',
    };

    const { result } = renderHook(() =>
      useSoloSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          questionCount: 1,
          title: 'Homework Test',
          type: 'IELTS',
          skill: 'Reading',
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        answers: { 1: 'A' },
        materialId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student One',
        timeRemaining: 1200,
        resolvedSettings: null,
        context: {
          type: 'homework',
          source: {
            type: 'homework',
            id: 'hw-1',
            name: 'Homework Test',
          },
        },
        homeworkId: 'hw-1',
        submissionId: 'submission-1',
        integrity,
        telemetrySurface: 'ielts_homework',
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    const saveCall = vi.mocked(saveTestResult).mock.calls[0];
    expect(saveCall?.[7]).toBeUndefined();
    expect(saveCall?.[11]).toEqual(
      expect.objectContaining({
        type: 'homework',
        assignment: expect.objectContaining({
          homeworkId: 'hw-1',
          attemptNumber: 1,
        }),
        source: expect.objectContaining({
          id: 'hw-1',
          name: 'Homework Test',
        }),
      }),
    );

    expect(mockTrackAntiCheatAction).toHaveBeenCalledWith(
      'persistHomeworkIntegrity',
      expect.objectContaining({
        context: 'homework',
        surface: 'ielts_homework',
        homeworkId: 'hw-1',
        submissionId: 'submission-1',
      }),
      expect.objectContaining({
        status: 'success',
        violationCount: 2,
      }),
    );
    expect(submitHomework).toHaveBeenCalled();
    const homeworkSaveCall = vi.mocked(saveTestResult).mock.calls[0];
    expect(homeworkSaveCall?.[13]).toEqual(
      expect.objectContaining({
        passageResults: expect.arrayContaining([
          expect.objectContaining({
            passageName: 'Passage 1',
          }),
        ]),
      }),
    );
  });

  it('bypasses unanswered-questions confirm when skipConfirm is true', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { result } = renderHook(() =>
      useSoloSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          questionCount: 1,
          title: 'Practice Test',
          type: 'IELTS',
          skill: 'Reading',
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        answers: {}, // 0 answered out of 1 → triggers unanswered prompt
        materialId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student One',
        timeRemaining: 1200,
        resolvedSettings: null,
        context: {
          type: 'self_study',
          source: { type: 'material', id: 'test-1', name: 'Practice Test' },
        },
        skipConfirm: true,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(saveTestResult).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows unanswered-questions confirm when skipConfirm is false (default)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { result } = renderHook(() =>
      useSoloSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          questionCount: 1,
          title: 'Practice Test',
          type: 'IELTS',
          skill: 'Reading',
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        answers: {}, // 0 answered out of 1 → triggers unanswered prompt
        materialId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student One',
        timeRemaining: 1200,
        resolvedSettings: null,
        context: {
          type: 'self_study',
          source: { type: 'material', id: 'test-1', name: 'Practice Test' },
        },
        // skipConfirm not set → defaults to false
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(saveTestResult).not.toHaveBeenCalled(); // confirm returned false → aborted
    confirmSpy.mockRestore();
  });
});
