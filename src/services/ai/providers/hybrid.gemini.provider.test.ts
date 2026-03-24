import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hybridGeminiProvider } from './hybrid.gemini.provider';

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn(),
    }),
  })),
}));

vi.mock('../../../config/env.config', () => ({
  loadAllGeminiApiKeys: vi.fn(() => Promise.resolve(['hybrid-key-1', 'hybrid-key-2'])),
}));

vi.mock('../../key-cooldown.service', () => ({
  benchKey: vi.fn(),
  isKeyBenched: vi.fn(() => false),
  shouldBenchGeminiKeyError: vi.fn((message: string) => message.toLowerCase().includes('429')),
}));

describe('Hybrid Gemini Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hybridGeminiProvider as any).apiKeys = [];
    (hybridGeminiProvider as any).currentKeyIndex = 0;
  });

  it('loads keys from the shared Gemini key loader', async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { loadAllGeminiApiKeys } = await import('../../../config/env.config');

    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            passages: [{ id: 'passage-1', title: 'P1', content: 'Body', questionStart: 1, questionEnd: 1, wordCount: 10 }],
            questions: [{ questionNumber: 1, questionText: 'Question 1', type: '', options: [], answer: 'A', confidence: 95 }],
            answerKey: { 1: 'A' },
            confidence: 90,
          }),
        },
      }),
    };

    vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue(mockModel),
    }) as any);

    const result = await hybridGeminiProvider.extractSections('Sample document');

    expect(result.success).toBe(true);
    expect(loadAllGeminiApiKeys).toHaveBeenCalled();
  });

  it('benches a rate-limited key for maintenance detection', async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { benchKey } = await import('../../key-cooldown.service');

    const mockModel = {
      generateContent: vi.fn().mockRejectedValue(new Error('429 rate limit')),
    };

    vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue(mockModel),
    }) as any);

    const result = await hybridGeminiProvider.extractSections('Sample document');

    expect(result.success).toBe(false);
    expect(benchKey).toHaveBeenCalled();
  });
});
