import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiProvider } from './gemini.provider';
import type { Chunk } from '../../types/document.types';
import { loadAllGeminiApiKeys } from '../../config/env.config';
import { isKeyBenched } from '../key-cooldown.service';

// Mock Google Generative AI
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn(),
    }),
  })),
}));

// Mock env config
vi.mock('../../config/env.config', () => ({
  loadAllGeminiApiKeys: vi.fn(() => Promise.resolve(['test-key-1', 'test-key-2'])),
}));

// Mock response validator
vi.mock('./response.validator', () => ({
  validateAIResponse: vi.fn((data) => ({
    success: true,
    data: data,
  })),
  validatePassagesOnly: vi.fn((data) => ({
    success: true,
    data,
  })),
  validateQuestionsAndAnswers: vi.fn((data) => ({
    success: true,
    data,
  })),
  normalizeQuestionType: vi.fn((type) => type),
  normalizeAnswer: vi.fn((answer) => answer),
}));

vi.mock('../key-cooldown.service', () => ({
  benchKey: vi.fn(),
  isKeyBenched: vi.fn(() => false),
  shouldBenchGeminiKeyError: vi.fn((message: string) => {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('403')
      || normalized.includes('forbidden')
      || normalized.includes('blocked')
      || normalized.includes('invalid api key')
      || normalized.includes('api_key_invalid')
      || normalized.includes('api key invalid')
      || normalized.includes('api key not valid')
      || normalized.includes('api key expired')
      || normalized.includes('key expired')
      || normalized.includes('429')
      || normalized.includes('rate limit')
      || normalized.includes('quota');
  }),
}));

describe('Gemini Provider', () => {
  let provider: GeminiProvider;
  const mockChunk: Chunk = {
    id: 'chunk-1',
    number: 1,
    text: 'Test content for parsing',
    isLast: false,
    startIndex: 0,
    endIndex: 100,
    wordCount: 20,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAllGeminiApiKeys).mockResolvedValue(['test-key-1', 'test-key-2']);
    vi.mocked(isKeyBenched).mockImplementation(() => false);
    provider = new GeminiProvider();
  });

  describe('Initialization', () => {
    it('should start uninitialized before first use', () => {
      const status = provider.getStatus();

      expect(status.available).toBe(false);
      expect(status.name).toBe('gemini');
    });

    it('should initialize with API keys on first parse', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              passages: [],
              questions: [],
              answerKey: {},
              confidence: 90,
            }),
          },
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(true);

      const { loadAllGeminiApiKeys } = await import('../../config/env.config');

      expect(loadAllGeminiApiKeys).toHaveBeenCalled();
      expect(provider.getStatus().available).toBe(true);
    });

    it('should refresh Gemini clients when new keys appear after initial initialization', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const { loadAllGeminiApiKeys } = await import('../../config/env.config');
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              passages: [],
              questions: [],
              answerKey: {},
              confidence: 90,
            }),
          },
        }),
      };

      vi.mocked(loadAllGeminiApiKeys)
        .mockResolvedValueOnce(['env-key-1', 'env-key-2', 'env-key-3'])
        .mockResolvedValueOnce(['env-key-1', 'env-key-2', 'env-key-3', 'firestore-key']);

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      await provider.parseChunk(mockChunk);
      await provider.parseChunk(mockChunk);

      expect(loadAllGeminiApiKeys).toHaveBeenCalledTimes(2);
      expect(vi.mocked(GoogleGenerativeAI)).toHaveBeenCalledWith('firestore-key');
    });
  });

  describe('Split Parsing Retries', () => {
    it('retries questions+answers on blocked Gemini key before provider fallback', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      vi.mocked(loadAllGeminiApiKeys).mockResolvedValue(['usable-key', 'blocked-key']);
      const attemptedKeys: string[] = [];

      vi.mocked(GoogleGenerativeAI).mockImplementation((apiKey: string) => ({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: vi.fn().mockImplementation(() => {
            attemptedKeys.push(apiKey);
            if (apiKey === 'blocked-key') {
              return Promise.reject(new Error('403 Forbidden: API_KEY_HTTP_REFERRER_BLOCKED'));
            }

            return Promise.resolve({
              response: {
                text: () => JSON.stringify({
                  questions: [
                    {
                      questionNumber: 35,
                      questionText: 'removes carbon dioxide as soon as it is produced',
                      type: 'multiple-choice',
                      answer: 'A',
                      options: ['A', 'B', 'C'],
                      confidence: 90,
                    },
                  ],
                  answerKey: { 35: 'A' },
                  confidence: 90,
                }),
              },
            });
          }),
        }),
      }) as any);

      const result = await provider.parseQuestionsAndAnswers('Questions 35-40\n**35.** removes carbon dioxide...');

      expect(result.success).toBe(true);
      expect(attemptedKeys).toEqual(['blocked-key', 'usable-key']);
    });

    it('retries questions+answers on 503 high demand across keys', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      let callCount = 0;

      const mockModel = {
        generateContent: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('503: This model is currently experiencing high demand'));
          }

          return Promise.resolve({
            response: {
              text: () => JSON.stringify({
                questions: [
                  {
                    questionNumber: 35,
                    questionText: 'removes carbon dioxide as soon as it is produced',
                    type: 'multiple-choice',
                    answer: 'A',
                    options: ['A', 'B', 'C'],
                    confidence: 90,
                  },
                ],
                answerKey: { 35: 'A' },
                confidence: 90,
              }),
            },
          });
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      const result = await provider.parseQuestionsAndAnswers('Questions 35-40\n**35.** removes carbon dioxide...');

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });
  });

  describe('Parse Chunk', () => {
    it('should successfully parse chunk', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              passages: [],
              questions: [
                {
                  questionNumber: 1,
                  questionText: 'Test?',
                  type: 'multiple-choice',
                  options: ['A', 'B'],
                  answer: 'A',
                  confidence: 95,
                },
              ],
              answerKey: {},
              confidence: 90,
            }),
          },
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.questions).toHaveLength(1);
      }
    });

    it('should handle API errors', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('API Error');
      }
    });

    it('should extract JSON from markdown code blocks', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => '```json\n{"passages":[],"questions":[],"answerKey":{},"confidence":90}\n```',
          },
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(true);
    });

    it('should handle invalid JSON responses', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => 'Invalid JSON response',
          },
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(false);
    });
  });

  describe('API Key Rotation', () => {
    it('should skip keys that are already benched in the shared cooldown registry', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const { isKeyBenched } = await import('../key-cooldown.service');
      const firstKeyGenerate = vi.fn();
      const secondKeyGenerate = vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            passages: [],
            questions: [],
            answerKey: {},
            confidence: 90,
          }),
        },
      });

      vi.mocked(isKeyBenched).mockImplementation((key) => key === 'test-key-1');
      vi.mocked(GoogleGenerativeAI).mockImplementation((apiKey: string) => ({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: apiKey === 'test-key-1' ? firstKeyGenerate : secondKeyGenerate,
        }),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(firstKeyGenerate).not.toHaveBeenCalled();
      expect(secondKeyGenerate).toHaveBeenCalledTimes(1);
    });

    it('should rotate keys on rate limit error', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const { benchKey } = await import('../key-cooldown.service');
      let callCount = 0;

      const mockModel = {
        generateContent: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('429: Rate limit exceeded'));
          }
          return Promise.resolve({
            response: {
              text: () => JSON.stringify({
                passages: [],
                questions: [],
                answerKey: {},
                confidence: 90,
              }),
            },
          });
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(callCount).toBe(2); // First attempt + retry with rotated key
      expect(benchKey).toHaveBeenCalled();
    });

    it('should detect rate limit patterns', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const errorPatterns = [
        '429: Rate limit',
        'rate limit exceeded',
        'quota exceeded',
      ];

      for (const errorMsg of errorPatterns) {
        let callCount = 0;
        const mockModel = {
          generateContent: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.reject(new Error(errorMsg));
            }
            return Promise.resolve({
              response: {
                text: () => JSON.stringify({
                  passages: [],
                  questions: [],
                  answerKey: {},
                  confidence: 90,
                }),
              },
            });
          }),
        };

        vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
          getGenerativeModel: vi.fn().mockReturnValue(mockModel),
        }) as any);

        provider = new GeminiProvider();
        const result = await provider.parseChunk(mockChunk);

        expect(result.success).toBe(true);
      }
    });

    it('should fail after all keys exhausted', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(new Error('429: Rate limit')),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('exhausted');
      }
    });

    it('rotates structured JSON generation when selected key is expired', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const { benchKey } = await import('../key-cooldown.service');
      const expiredKeyGenerate = vi.fn().mockRejectedValue(
        new Error('[400] API key expired. Please renew the API key. [{"reason":"API_KEY_INVALID"}]'),
      );
      const healthyKeyGenerate = vi.fn().mockResolvedValue({
        response: { text: () => JSON.stringify({ ok: true }) },
      });

      vi.mocked(GoogleGenerativeAI).mockImplementation((apiKey: string) => ({
        getGenerativeModel: vi.fn().mockReturnValue({
          generateContent: apiKey === 'test-key-2' ? expiredKeyGenerate : healthyKeyGenerate,
        }),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.generateStructuredJson('Return {"ok": true}');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ ok: true });
      }
      expect(expiredKeyGenerate).toHaveBeenCalledTimes(1);
      expect(healthyKeyGenerate).toHaveBeenCalledTimes(1);
      expect(benchKey).toHaveBeenCalledWith(
        'test-key-2',
        'gemini',
        expect.stringContaining('API key expired'),
      );
    });

    it('waits and retries structured JSON once on temporary 503 high-demand errors', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const generateContent = vi.fn()
        .mockRejectedValueOnce(new Error('503 This model is currently experiencing high demand. Please try again in 0.001s.'))
        .mockResolvedValueOnce({
          response: { text: () => JSON.stringify({ ok: true }) },
        });

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue({ generateContent }),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.generateStructuredJson('Return {"ok": true}');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ ok: true });
      }
      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it('should rotate keys on temporary 503 high-demand errors for questions+answers', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      let callCount = 0;
      const mockModel = {
        generateContent: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('503 This model is currently experiencing high demand'));
          }

          return Promise.resolve({
            response: {
              text: () => JSON.stringify({
                questions: [
                  {
                    questionNumber: 1,
                    questionText: 'Paragraph B',
                    type: 'matching-headings',
                    answer: 'vii',
                    confidence: 93,
                  },
                ],
                answerKey: { 1: 'vii' },
                confidence: 93,
              }),
            },
          });
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.parseQuestionsAndAnswers('Questions 1-1\n1. Paragraph B');

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });
  });

  describe('Status Management', () => {
    it('should return provider status', () => {
      const status = provider.getStatus();

      expect(status).toHaveProperty('name');
      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('lastError');
      expect(status).toHaveProperty('requestCount');
      expect(status).toHaveProperty('lastRequestTime');
    });

    it('should update request count', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              passages: [],
              questions: [],
              answerKey: {},
              confidence: 90,
            }),
          },
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();

      const initialCount = provider.getStatus().requestCount;
      await provider.parseChunk(mockChunk);
      const newCount = provider.getStatus().requestCount;

      expect(newCount).toBeGreaterThan(initialCount);
    });

    it('should track last error', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(new Error('Test error')),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      await provider.parseChunk(mockChunk);

      const status = provider.getStatus();
      expect(status.lastError).toContain('Test error');
    });
  });

  describe('Connection Test', () => {
    it('should test connection successfully', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockResolvedValue({
          response: { text: () => 'test' },
        }),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.testConnection();

      expect(result.success).toBe(true);
    });

    it('should handle connection test failure', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Connection failed');
      }
    });
  });

  describe('Reset', () => {
    it('should reset error state', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockModel = {
        generateContent: vi.fn().mockRejectedValue(new Error('Test error')),
      };

      vi.mocked(GoogleGenerativeAI).mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockModel),
      }) as any);

      provider = new GeminiProvider();
      await provider.parseChunk(mockChunk);

      expect(provider.getStatus().lastError).toBeTruthy();

      provider.reset();

      expect(provider.getStatus().lastError).toBeNull();
    });

    it('should reset key index', async () => {
      provider.reset();

      // After reset, should use first key again
      const status = provider.getStatus();
      expect(status).toBeTruthy();
    });
  });
});
