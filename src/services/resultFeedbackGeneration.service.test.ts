import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetTestResult,
  mockBuildResultFeedbackPayload,
  mockGenerateFormativeFeedback,
  mockRef,
  mockUpdate,
} = vi.hoisted(() => ({
  mockGetTestResult: vi.fn(),
  mockBuildResultFeedbackPayload: vi.fn(),
  mockGenerateFormativeFeedback: vi.fn(),
  mockRef: vi.fn((_database: unknown, path: string) => ({ path })),
  mockUpdate: vi.fn(),
}));

vi.mock('./testResults.service', () => ({
  getTestResult: (...args: unknown[]) => mockGetTestResult(...args),
}));

vi.mock('./resultFeedbackPayload.service', () => ({
  buildResultFeedbackPayload: (...args: unknown[]) => mockBuildResultFeedbackPayload(...args),
}));

vi.mock('./formativeFeedback.service', () => ({
  generateFormativeFeedback: (...args: unknown[]) => mockGenerateFormativeFeedback(...args),
}));

vi.mock('firebase/database', () => ({
  ref: (...args: unknown[]) => mockRef(...args),
  update: (...args: unknown[]) => mockUpdate(...args),
}));

vi.mock('./firebase', () => ({
  database: {},
}));

import { generateFormativeFeedbackForSavedResult } from './resultFeedbackGeneration.service';

describe('generateFormativeFeedbackForSavedResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds payload from the saved result before triggering generation', async () => {
    mockGetTestResult.mockResolvedValue({ resultId: 'result-1', testType: 'ielts-reading' });
    mockBuildResultFeedbackPayload.mockResolvedValue({
      gradingResult: { scaledScore: 7 },
      sections: [{ id: 'section-1' }],
      testMetadata: { title: 'IELTS Reading Practice 1', family: 'ielts' },
      resultId: 'result-1',
    });
    mockGenerateFormativeFeedback.mockResolvedValue({
      saved: true,
      aiApplied: true,
      mode: 'ai',
    });

    const result = await generateFormativeFeedbackForSavedResult('result-1');

    expect(mockGetTestResult).toHaveBeenCalledWith('result-1');
    expect(mockBuildResultFeedbackPayload).toHaveBeenCalledWith(
      expect.objectContaining({ resultId: 'result-1' }),
      'result-1',
    );
    expect(mockGenerateFormativeFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ scaledScore: 7 }),
      expect.any(Array),
      expect.objectContaining({ family: 'ielts' }),
      'result-1',
      undefined,
    );
    expect(result).toEqual({
      saved: true,
      aiApplied: true,
      mode: 'ai',
    });
  });

  it('returns null when the saved result is missing or ineligible', async () => {
    mockGetTestResult.mockResolvedValue(null);

    await expect(generateFormativeFeedbackForSavedResult('missing-result')).resolves.toBeNull();

    mockGetTestResult.mockResolvedValue({ resultId: 'result-2', testType: 'writing' });
    mockBuildResultFeedbackPayload.mockResolvedValue(null);

    await expect(generateFormativeFeedbackForSavedResult('result-2')).resolves.toBeNull();
    expect(mockGenerateFormativeFeedback).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      { path: 'test_results/result-2' },
      expect.objectContaining({
        feedbackGenerationMeta: expect.objectContaining({
          lastOutcome: 'skipped-ineligible',
        }),
      }),
    );
  });

  it('passes force-upgrade options through to the generation service', async () => {
    mockGetTestResult.mockResolvedValue({ resultId: 'result-1', testType: 'THCS-THPT' });
    mockBuildResultFeedbackPayload.mockResolvedValue({
      gradingResult: { scaledScore: 6 },
      sections: [{ id: 'section-1' }],
      testMetadata: { title: 'THCS Test', family: 'thcs' },
      resultId: 'result-1',
    });
    mockGenerateFormativeFeedback.mockResolvedValue({
      saved: true,
      aiApplied: false,
      mode: 'deterministic',
      upgradeAttempted: true,
      upgradeApplied: false,
    });

    await generateFormativeFeedbackForSavedResult('result-1', { forceAiUpgrade: true });

    expect(mockGenerateFormativeFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ scaledScore: 6 }),
      expect.any(Array),
      expect.objectContaining({ family: 'thcs' }),
      'result-1',
      { forceAiUpgrade: true },
    );
  });
});
