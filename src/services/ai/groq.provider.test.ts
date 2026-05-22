import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroqProvider } from './groq.provider';
import type { Chunk } from '../../types/document.types';
import { getEnv } from '../../config/env.config';

// Mock Groq SDK
vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

// Mock env config
vi.mock('../../config/env.config', () => ({
  getEnv: vi.fn(() => ({ VITE_GROQ_API_KEY: 'test-groq-key' })),
}));

vi.mock('../api-keys.service', () => ({
  getDecryptedKeys: vi.fn().mockResolvedValue([]),
}));

// Mock response validator
vi.mock('./response.validator', () => ({
  validateAIResponse: vi.fn((data) => ({ success: true, data })),
  validatePassagesOnly: vi.fn((data) => ({ success: true, data })),
  validateQuestionsAndAnswers: vi.fn((data) => ({ success: true, data })),
  normalizeQuestionType: vi.fn((type) => type),
  normalizeAnswer: vi.fn((answer) => answer),
}));

describe('Groq Provider', () => {
  let provider: GroqProvider;
  const mockChunk: Chunk = {
    id: 'chunk-1',
    number: 1,
    text: 'Test content',
    isLast: false,
    startIndex: 0,
    endIndex: 100,
    wordCount: 20,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEnv).mockReturnValue({ VITE_GROQ_API_KEY: 'test-groq-key' });
    provider = new GroqProvider();
  });

  describe('Initialization', () => {
    it('should initialize lazily when a client call is made', async () => {
      await provider.testConnection();

      const status = provider.getStatus();
      expect(status.available).toBe(true);
      expect(status.name).toBe('groq');
    });

    it('should handle missing API key', () => {
      vi.mocked(getEnv).mockReturnValue({});

      const newProvider = new GroqProvider();
      const status = newProvider.getStatus();

      expect(status.available).toBe(false);
    });
  });

  describe('Parse Chunk', () => {
    it('should successfully parse chunk', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              passages: [],
              questions: [
                {
                  questionNumber: 1,
                  questionText: 'Test?',
                  type: 'completion',
                  answer: 'test',
                  confidence: 90,
                },
              ],
              answerKey: {},
              confidence: 90,
            }),
          },
        }],
      };

      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(true);
    });

    it('should handle API errors', async () => {
      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('API Error');
      }
    });

    it('should extract JSON from response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '```json\n{"passages":[],"questions":[],"answerKey":{},"confidence":90}\n```',
          },
        }],
      };

      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(true);
    });

    it('should handle invalid JSON', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON',
          },
        }],
      };

      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(false);
    });

    it('should fail when client not initialized', async () => {
      vi.mocked(getEnv).mockReturnValue({});

      const newProvider = new GroqProvider();
      const result = await newProvider.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not initialized');
      }
    });

    it('should retry questions+answers with a smaller output budget when the request is too large', async () => {
      const oversizedError = new Error(
        '413 {"error":{"message":"Request too large for model `llama-3.3-70b-versatile` please reduce your message size","type":"tokens","code":"rate_limit_exceeded"}}'
      );
      const create = vi.fn()
        .mockRejectedValueOnce(oversizedError)
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                questions: [
                  {
                    questionNumber: 35,
                    questionText: 'removes carbon dioxide as soon as it is produced',
                    type: 'matching-information',
                    answer: 'C',
                    confidence: 90,
                  },
                ],
                answerKey: { 35: 'C' },
                confidence: 90,
              }),
            },
          }],
        });

      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: {
          completions: { create },
        },
      }) as any);

      provider = new GroqProvider();
      const result = await provider.parseQuestionsAndAnswers('Questions 35-40\n**35.** removes carbon dioxide as soon as it is produced');

      expect(result.success).toBe(true);
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[0]?.[0]?.max_tokens).toBe(8192);
      expect(create.mock.calls[1]?.[0]?.max_tokens).toBe(4096);
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
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              passages: [],
              questions: [],
              answerKey: {},
              confidence: 90,
            }),
          },
        }],
      };

      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      const initialCount = provider.getStatus().requestCount;
      await provider.parseChunk(mockChunk);
      const newCount = provider.getStatus().requestCount;

      expect(newCount).toBeGreaterThan(initialCount);
    });

    it('should track last error', async () => {
      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Test error')),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      await provider.parseChunk(mockChunk);

      const status = provider.getStatus();
      expect(status.lastError).toContain('Test error');
    });
  });

  describe('Structured JSON key slots', () => {
    it('honors an explicit preferred key slot for structured generation', async () => {
      const clientsByKey = new Map<string, { chat: { completions: { create: ReturnType<typeof vi.fn> } } }>();
      ['slot-key-1', 'slot-key-2', 'slot-key-3'].forEach((apiKey) => {
        clientsByKey.set(apiKey, {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue({
                choices: [{ message: { content: '{"ok":true}' } }],
              }),
            },
          },
        });
      });
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'slot-key-1',
        VITE_GROQ_API_KEY_2: 'slot-key-2',
        VITE_GROQ_API_KEY_3: 'slot-key-3',
      } as any);

      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => clientsByKey.get(options.apiKey) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', { preferredKeyIndex: 1 });

      expect(result.success).toBe(true);
      expect(clientsByKey.get('slot-key-2')?.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(clientsByKey.get('slot-key-1')?.chat.completions.create).not.toHaveBeenCalled();
      expect(clientsByKey.get('slot-key-3')?.chat.completions.create).not.toHaveBeenCalled();
    });

    it('falls back when the preferred structured-generation slot is benched', async () => {
      const { benchKey } = await import('../key-cooldown.service');
      benchKey('benched-groq-slot-key', 'groq', 'Rate limit');
      const clientsByKey = new Map<string, { chat: { completions: { create: ReturnType<typeof vi.fn> } } }>();
      ['benched-groq-slot-key', 'fresh-groq-slot-key'].forEach((apiKey) => {
        clientsByKey.set(apiKey, {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue({
                choices: [{ message: { content: '{"ok":true}' } }],
              }),
            },
          },
        });
      });
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'benched-groq-slot-key',
        VITE_GROQ_API_KEY_2: 'fresh-groq-slot-key',
      } as any);

      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => clientsByKey.get(options.apiKey) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', { preferredKeyIndex: 0 });

      expect(result.success).toBe(true);
      expect(clientsByKey.get('benched-groq-slot-key')?.chat.completions.create).not.toHaveBeenCalled();
      expect(clientsByKey.get('fresh-groq-slot-key')?.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('reports available structured-generation key slots with fingerprints only', async () => {
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'fingerprint-slot-key-1',
        VITE_GROQ_API_KEY_2: 'fingerprint-slot-key-2',
      } as any);
      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: { completions: { create: vi.fn() } },
      }) as any);
      provider = new GroqProvider();

      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(slots).toHaveLength(2);
      expect(slots[0]).toEqual(expect.objectContaining({ index: 0, available: true }));
      expect(slots[0]?.fingerprint).toMatch(/^groq-[0-9a-f]{8}$/);
      expect(JSON.stringify(slots)).not.toContain('fingerprint-slot-key');
    });

    it('honors per-call model selection for structured generation', async () => {
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'model-selection-slot-key',
      } as any);
      const create = vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"ok":true}' } }],
      });
      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: { completions: { create } },
      }) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        preferredKeyIndex: 0,
      });

      expect(result.success).toBe(true);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        response_format: { type: 'json_object' },
      }));
    });

    it('honors per-call response format for structured generation', async () => {
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'response-format-slot-key',
      } as any);
      const create = vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"ok":true}' } }],
      });
      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: { completions: { create } },
      }) as any);
      provider = new GroqProvider();
      const responseFormat = {
        type: 'json_schema',
        json_schema: {
          name: 'strict_fixture',
          strict: true,
          schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
            additionalProperties: false,
          },
        },
      };

      const result = await provider.generateStructuredJson('{"request":true}', {
        model: 'openai/gpt-oss-120b',
        preferredKeyIndex: 0,
        responseFormat,
      });

      expect(result.success).toBe(true);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        model: 'openai/gpt-oss-120b',
        response_format: responseFormat,
      }));
    });

    it('retries structured generation with smaller max tokens after request-size TPM errors', async () => {
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'tpm-retry-slot-key',
      } as any);
      const create = vi.fn()
        .mockRejectedValueOnce(new Error('413 Request too large for model on tokens per minute (TPM)'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"ok":true}' } }],
        });
      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: { completions: { create } },
      }) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', {
        preferredKeyIndex: 0,
        maxOutputTokens: 12_288,
      });

      expect(result.success).toBe(true);
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls.map(([payload]) => payload.max_tokens)).toEqual([12_288, 8192]);
      const slots = await provider.getAvailableStructuredJsonKeySlots();
      expect(slots[0]?.available).toBe(true);
    });

    it('benches structured generation slots when request-size retries still fail', async () => {
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'tpm-failing-slot-key',
      } as any);
      const create = vi.fn().mockRejectedValue(new Error('413 Request too large for model on tokens per minute (TPM)'));
      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: { completions: { create } },
      }) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', {
        preferredKeyIndex: 0,
        maxOutputTokens: 4096,
      });
      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(result.success).toBe(false);
      expect(create.mock.calls.map(([payload]) => payload.max_tokens)).toEqual([4096, 3072, 2048, 1024]);
      expect(slots[0]?.available).toBe(false);
    });

    it('benches the failing preferred slot during concurrent structured calls', async () => {
      const clientsByKey = new Map<string, { chat: { completions: { create: ReturnType<typeof vi.fn> } } }>();
      clientsByKey.set('race-slot-key-1', {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() =>
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error('429 rate limit')), 5);
              }),
            ),
          },
        },
      });
      clientsByKey.set('race-slot-key-2', {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '{"ok":true}' } }],
            }),
          },
        },
      });
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'race-slot-key-1',
        VITE_GROQ_API_KEY_2: 'race-slot-key-2',
      } as any);

      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => clientsByKey.get(options.apiKey) as any);
      provider = new GroqProvider();

      await Promise.allSettled([
        provider.generateStructuredJson('{"request":1}', { preferredKeyIndex: 0 }),
        provider.generateStructuredJson('{"request":2}', { preferredKeyIndex: 1 }),
      ]);
      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(slots[0]?.available).toBe(false);
      expect(slots[1]?.available).toBe(true);
    });

    it('benches hard preferred-slot key errors for structured generation', async () => {
      const clientsByKey = new Map<string, { chat: { completions: { create: ReturnType<typeof vi.fn> } } }>();
      clientsByKey.set('hard-error-slot-key-1', {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('401 Invalid API key')),
          },
        },
      });
      clientsByKey.set('hard-error-slot-key-2', {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '{"ok":true}' } }],
            }),
          },
        },
      });
      vi.mocked(getEnv).mockReturnValue({
        VITE_GROQ_API_KEY_1: 'hard-error-slot-key-1',
        VITE_GROQ_API_KEY_2: 'hard-error-slot-key-2',
      } as any);

      const Groq = (await import('groq-sdk')).default;
      vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => clientsByKey.get(options.apiKey) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', { preferredKeyIndex: 0 });
      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(result.success).toBe(false);
      expect(slots[0]?.available).toBe(false);
      expect(slots[1]?.available).toBe(true);
    });
  });

  describe('Connection Test', () => {
    it('should test connection successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'test',
          },
        }],
      };

      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
    });

    it('should handle connection test failure', async () => {
      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Connection failed')),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Connection failed');
      }
    });
  });

  describe('Reset', () => {
    it('should reset error state', async () => {
      const Groq = (await import('groq-sdk')).default;
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Test error')),
          },
        },
      };

      vi.mocked(Groq).mockImplementation(() => mockClient as any);
      provider = new GroqProvider();

      await provider.parseChunk(mockChunk);
      expect(provider.getStatus().lastError).toBeTruthy();

      provider.reset();
      expect(provider.getStatus().lastError).toBeNull();
    });
  });
});
