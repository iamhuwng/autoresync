import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetTestFromFirebase,
  mockGetThcsTestFromFirebase,
} = vi.hoisted(() => ({
  mockGetTestFromFirebase: vi.fn(),
  mockGetThcsTestFromFirebase: vi.fn(),
}));

vi.mock('./testStorage', () => ({
  getTestFromFirebase: (...args: unknown[]) => mockGetTestFromFirebase(...args),
}));

vi.mock('./thcsTestStorage', () => ({
  getThcsTestFromFirebase: (...args: unknown[]) => mockGetThcsTestFromFirebase(...args),
}));

import { buildResultFeedbackPayload } from './resultFeedbackPayload.service';

const GENERIC_TEST_DATA = {
  title: 'Grammar Progress Check',
  questions: [
    {
      number: 1,
      question: 'Choose the best answer.',
      type: 'mcq-grammar',
      options: ['A', 'B', 'C', 'D'],
      answer: 'D',
    },
  ],
  passages: [],
};

describe('buildResultFeedbackPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThcsTestFromFirebase.mockResolvedValue({ success: false });
    mockGetTestFromFirebase.mockResolvedValue({ success: true, data: GENERIC_TEST_DATA });
  });

  it('returns a generic payload for non-THCS, non-IELTS results with saved question data', async () => {
    const payload = await buildResultFeedbackPayload(
      {
        resultId: 'res-generic',
        testId: 'test-generic',
        testTitle: 'Grammar Progress Check',
        testType: 'grammar-quiz',
        testSkill: 'grammar',
        totalScore: 0,
        maxScore: 1,
        percentage: 0,
        timeElapsed: 120,
        submittedAt: 1710921600000,
        totalQuestions: 1,
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'mcq-grammar',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: '',
            correctAnswer: 'D',
          },
        ],
      } as any,
      'res-generic',
    );

    expect(payload).not.toBeNull();
    expect(payload?.testMetadata.family).toBe('generic');
    expect(payload?.testMetadata.type).toBe('grammar-quiz');
    expect(payload?.sections[0]?.questions[0]?.questionText).toBe('Choose the best answer.');
  });

  it('does not misclassify generic reading results as IELTS without IELTS evidence', async () => {
    const payload = await buildResultFeedbackPayload(
      {
        resultId: 'res-reading',
        testId: 'test-reading',
        testTitle: 'Reading Skills Check',
        testType: 'reading',
        testSkill: 'reading',
        totalScore: 0,
        maxScore: 1,
        percentage: 0,
        timeElapsed: 120,
        submittedAt: 1710921600000,
        totalQuestions: 1,
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'reading-comprehension',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: '',
            correctAnswer: 'B',
          },
        ],
      } as any,
      'res-reading',
    );

    expect(payload).not.toBeNull();
    expect(payload?.testMetadata.family).toBe('generic');
  });

  it('keeps true IELTS results on the IELTS prompt path', async () => {
    const payload = await buildResultFeedbackPayload(
      {
        resultId: 'res-ielts',
        testId: 'test-ielts',
        testTitle: 'IELTS Reading Practice 1',
        testType: 'ielts-reading',
        testSkill: 'reading',
        totalScore: 15,
        maxScore: 20,
        percentage: 75,
        bandScore: 6.5,
        timeElapsed: 1800,
        submittedAt: 1710921600000,
        totalQuestions: 20,
        ieltsData: {
          passageResults: [
            { passageName: 'Passage 1', questionRange: [1, 10], correct: 7, total: 10, percentage: 70 },
          ],
        },
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'matching',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: 'A',
            correctAnswer: 'B',
          },
        ],
      } as any,
      'res-ielts',
    );

    expect(payload).not.toBeNull();
    expect(payload?.testMetadata.family).toBe('ielts');
    expect(payload?.testMetadata.kind).toBe('ielts-reading');
    expect(payload?.testMetadata.formatKind).toBe('ielts-reading');
    expect(payload?.testMetadata.segmentLabel).toBe('Passage');
    expect(payload?.testMetadata.unansweredCount).toBe(0);
    expect(payload?.testMetadata.questionTypeBreakdown?.[0]?.questionType).toBe('matching');
    expect(payload?.testMetadata.segmentBreakdown).toHaveLength(1);
    expect(payload?.testMetadata.bandScore).toBe(6.5);
  });

  it('builds Reading V2 feedback sections from the saved review payload without loading V1 storage', async () => {
    const payload = await buildResultFeedbackPayload(
      {
        resultId: 'res-reading-v2',
        deliveryEngine: 'reading-v2',
        testId: 'material-v2',
        testTitle: 'Reading V2 Practice',
        testType: 'ielts-reading',
        testSkill: 'reading',
        totalScore: 1,
        maxScore: 2,
        percentage: 50,
        bandScore: 5,
        timeElapsed: 1200,
        submittedAt: 1710921600000,
        totalQuestions: 2,
        ieltsData: {
          passageResults: [
            { passageName: 'Passage A', questionRange: [1, 2], correct: 1, total: 2, percentage: 50 },
          ],
        },
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'matching-headings',
            isCorrect: true,
            score: 1,
            maxScore: 1,
            studentAnswer: 'A',
            correctAnswer: 'A',
          },
          {
            questionNumber: 2,
            questionType: 'matching-headings',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: 'B',
            correctAnswer: 'C',
          },
        ],
        readingV2: {
          result: {},
          reviewPayload: {
            deliveryEngine: 'reading-v2',
            schemaVersion: 1,
            resultId: 'res-reading-v2',
            sourceSnapshotVersionId: 'snapshot-1',
            materialId: 'material-v2',
            materialKind: 'full-test',
            materialLabel: 'Reading V2',
            title: 'Reading V2 Practice',
            taskGroups: [
              {
                taskGroupId: 'tg-1',
                title: 'Matching Headings',
                officialTaskType: 'matching-headings',
                engineeringFamily: 'matching',
                instructionText: 'Choose the correct heading.',
                passageSection: {
                  title: 'Passage A',
                },
                stimulusContext: [
                  {
                    stimulusId: 'stimulus-1',
                    title: 'Passage A',
                    kind: 'passage',
                    anchorLabels: [],
                    excerpt: 'A short passage excerpt.',
                  },
                ],
                interactions: [
                  {
                    interactionId: 'interaction-1',
                    taskGroupId: 'tg-1',
                    displayNumber: 1,
                    taskFamily: 'matching',
                    officialTaskType: 'matching-headings',
                    studentAnswer: 'A',
                    correctAnswer: 'A',
                    score: 1,
                    maxScore: 1,
                    reviewState: 'released',
                  },
                  {
                    interactionId: 'interaction-2',
                    taskGroupId: 'tg-1',
                    displayNumber: 2,
                    taskFamily: 'matching',
                    officialTaskType: 'matching-headings',
                    studentAnswer: 'B',
                    correctAnswer: 'C',
                    score: 0,
                    maxScore: 1,
                    reviewState: 'released',
                  },
                ],
              },
            ],
          },
        },
      } as any,
      'res-reading-v2',
    );

    expect(payload).not.toBeNull();
    expect(mockGetTestFromFirebase).not.toHaveBeenCalled();
    expect(payload?.testMetadata.family).toBe('ielts');
    expect(payload?.testMetadata.kind).toBe('ielts-reading');
    expect(payload?.sections[0]).toEqual(expect.objectContaining({
      id: 'tg-1',
      name: 'Matching Headings',
      instructionText: 'Choose the correct heading.',
    }));
    expect(payload?.sections[0]?.passage).toEqual(expect.objectContaining({
      title: 'Passage A',
      content: 'A short passage excerpt.',
    }));
    expect(payload?.sections[0]?.questions).toHaveLength(2);
    expect(payload?.sections[0]?.questions[1]).toEqual(expect.objectContaining({
      questionNumber: 2,
      correctAnswer: 'C',
    }));
  });
});
