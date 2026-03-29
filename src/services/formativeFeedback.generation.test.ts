import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockRef, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockRef: vi.fn((_database: unknown, path: string) => ({ path })),
  mockUpdate: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  ref: (...args: unknown[]) => mockRef(...args),
  update: (...args: unknown[]) => mockUpdate(...args),
}));

vi.mock('./firebase', () => ({
  database: {},
  firestore: {},
}));

import { generateFormativeFeedback } from './formativeFeedback.service';

const gradingResult = {
  testId: 'test-1',
  studentId: 'student-1',
  totalPoints: 7,
  maxPoints: 10,
  scaledScore: 7.0,
  sectionResults: [],
  questionResults: {
    1: {
      questionNumber: 1,
      isCorrect: false,
      studentAnswer: 'B',
      correctAnswer: 'C',
      pointsEarned: 0,
      pointsMax: 1,
    },
  },
} as any;

const sections = [
  {
    id: 'section-1',
    name: 'Grammar',
    questions: [
      {
        questionNumber: 1,
        questionText: 'Choose the best answer.',
        type: 'mcq-grammar',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'C',
      },
    ],
  },
] as any;

const testMetadata = {
  title: 'THCS Progress Check',
  gradeLevel: 8,
  family: 'thcs',
  type: 'THCS-THPT',
} as const;

const storedFeedback = {
  analysis: { strengths: [], revision: [], critical: [] },
  deterministicFeedback: 'Stored feedback already finalized.',
  generatedAt: 1710921600000,
  resultId: 'result-1',
  generationMode: 'deterministic',
  totalCorrect: 7,
  totalQuestions: 10,
  scaledScore: 7.0,
} as const;

describe('generateFormativeFeedback single-write guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses stored feedback without overwriting the result payload', async () => {
    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => storedFeedback,
    });

    const result = await generateFormativeFeedback(
      gradingResult,
      sections,
      testMetadata,
      'result-1',
    );

    expect(result).toEqual({
      saved: true,
      aiApplied: false,
      mode: 'deterministic',
      reusedExisting: true,
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      { path: 'test_results/result-1' },
      expect.objectContaining({
        feedbackGenerationMeta: expect.objectContaining({
          kind: 'thcs',
          lastOutcome: 'reused',
        }),
      }),
    );
  });

  it('bypasses stored deterministic feedback when a force-upgrade is requested, but keeps the old payload if AI upgrade fails', async () => {
    mockGet.mockResolvedValue({
      exists: () => true,
      val: () => storedFeedback,
    });

    const result = await generateFormativeFeedback(
      gradingResult,
      sections,
      testMetadata,
      'result-1',
      { forceAiUpgrade: true },
    );

    expect(result).toEqual({
      saved: true,
      aiApplied: false,
      mode: 'deterministic',
      reusedExisting: true,
      error: 'AI upgrade did not complete. The existing feedback is still being shown.',
      upgradeAttempted: true,
      upgradeApplied: false,
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      { path: 'test_results/result-1' },
      expect.objectContaining({
        feedbackGenerationMeta: expect.objectContaining({
          kind: 'thcs',
          lastOutcome: 'reused',
          lastError: 'AI upgrade did not complete. The existing feedback is still being shown.',
        }),
      }),
    );
  });

  it('dedupes concurrent generation requests for the same result id', async () => {
    let resolveGet: ((value: { exists: () => boolean; val: () => typeof storedFeedback }) => void) | undefined;
    const pendingSnapshot = new Promise<{ exists: () => boolean; val: () => typeof storedFeedback }>((resolve) => {
      resolveGet = resolve;
    });
    mockGet.mockReturnValue(pendingSnapshot);

    const firstRequest = generateFormativeFeedback(
      gradingResult,
      sections,
      testMetadata,
      'result-1',
    );
    const secondRequest = generateFormativeFeedback(
      gradingResult,
      sections,
      testMetadata,
      'result-1',
    );

    resolveGet?.({
      exists: () => true,
      val: () => storedFeedback,
    });

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      {
        saved: true,
        aiApplied: false,
        mode: 'deterministic',
        reusedExisting: true,
      },
      {
        saved: true,
        aiApplied: false,
        mode: 'deterministic',
        reusedExisting: true,
      },
    ]);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
