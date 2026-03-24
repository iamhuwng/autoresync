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
    expect(payload?.testMetadata.bandScore).toBe(6.5);
  });
});
