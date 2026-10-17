import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroqProvider } from './groq.provider';
import type { Chunk } from '../../types/document.types';
import { getEnv } from '../../config/env.config';
import { getActiveKeyIds } from '../api-keys.service';

// Mock Groq SDK
vi.mock('./browser-provider-clients', () => ({
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
  getActiveKeyIds: vi.fn().mockResolvedValue(['test-key-1']),
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
    vi.mocked(getActiveKeyIds).mockResolvedValue(['test-key-1']);
    provider = new GroqProvider();
  });

  describe('Initialization', () => {
    it('recovers after the Worker key inventory is initially unavailable', async () => {
      vi.mocked(getActiveKeyIds).mockRejectedValueOnce(new Error('503 AI gateway unavailable'));
      expect((await provider.testConnection()).success).toBe(false);
      expect((await provider.testConnection()).success).toBe(true);
      expect(getActiveKeyIds).toHaveBeenCalledTimes(2);
    });

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
    it.each([
      ['401', '401 Authentication failed'],
      ['403', '403 Forbidden'],
      ['429', '429 quota exhausted'],
    ])('rotates parseChunk after a %s key error', async (_status, failure) => {
      const parsed = { passages: [], questions: [], answerKey: {}, confidence: 90 };
      const suffix = `${Date.now()}-${Math.random()}`;
      const clientsByKey = new Map<string, { chat: { completions: { create: ReturnType<typeof vi.fn> } } }>();
      const failedKey = `parse-rotation-failed-${suffix}`;
      const healthyKey = `parse-rotation-healthy-${suffix}`;
      clientsByKey.set(healthyKey, { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(parsed) } }] }) } } });
      clientsByKey.set(failedKey, { chat: { completions: { create: vi.fn().mockRejectedValue(new Error(failure)) } } });
      vi.mocked(getActiveKeyIds).mockResolvedValue([healthyKey, failedKey]);
      const Groq = (await import('./browser-provider-clients')).default;
      vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => clientsByKey.get(options.apiKey) as any);
      provider = new GroqProvider();

      const result = await provider.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(clientsByKey.get(failedKey)?.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(clientsByKey.get(healthyKey)?.chat.completions.create).toHaveBeenCalledTimes(1);
    });

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

      const Groq = (await import('./browser-provider-clients')).default;
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
      const Groq = (await import('./browser-provider-clients')).default;
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

      const Groq = (await import('./browser-provider-clients')).default;
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

      const Groq = (await import('./browser-provider-clients')).default;
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
      vi.mocked(getActiveKeyIds).mockResolvedValue([]);

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

      const Groq = (await import('./browser-provider-clients')).default;
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

      const Groq = (await import('./browser-provider-clients')).default;
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
      const Groq = (await import('./browser-provider-clients')).default;
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
    it.each([
      ['401', '401 Authentication failed'],
      ['403', '403 Forbidden'],
      ['429', '429 quota exhausted'],
    ])('rotates structured generation after a %s key error', async (_status, failure) => {
      const suffix = `${Date.now()}-${Math.random()}`;
      const failedKey = `rotation-failed-${suffix}`;
      const healthyKey = `rotation-healthy-${suffix}`;
      const clientsByKey = new Map<string, { chat: { completions: { create: ReturnType<typeof vi.fn> } } }>();
      clientsByKey.set(failedKey, { chat: { completions: { create: vi.fn().mockRejectedValue(new Error(failure)) } } });
      clientsByKey.set(healthyKey, { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] }) } } });
      vi.mocked(getActiveKeyIds).mockResolvedValue([failedKey, healthyKey]);
      const Groq = (await import('./browser-provider-clients')).default;
      vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => clientsByKey.get(options.apiKey) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', { preferredKeyIndex: 0 });
      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(result).toEqual({ success: true, data: { ok: true } });
      expect(clientsByKey.get(failedKey)?.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(clientsByKey.get(healthyKey)?.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(slots.map(({ available }) => available)).toEqual([false, true]);
    });

    it.each([
      '429 user_rate_limited',
      '401 user_unauthorized',
      '403 user_account_disabled',
    ])('does not bench a healthy key for Worker access failure %s', async (failure) => {
      vi.mocked(getActiveKeyIds).mockResolvedValue(['user-throttled-slot-key']);
      const create = vi.fn().mockRejectedValue(new Error(failure));
      const Groq = (await import('./browser-provider-clients')).default;
      vi.mocked(Groq).mockImplementation(() => ({ chat: { completions: { create } } }) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', { preferredKeyIndex: 0 });
      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(result.success).toBe(false);
      expect(slots[0]?.available).toBe(true);
    });

    it('uses only the Worker key inventory', async () => {
      vi.mocked(getActiveKeyIds).mockResolvedValue(['admin-slot-key', 'shared-slot-key']);
      const Groq = (await import('./browser-provider-clients')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: { completions: { create: vi.fn() } },
      }) as any);
      provider = new GroqProvider();

      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(slots).toHaveLength(2);
      expect(vi.mocked(Groq).mock.calls.map(([options]) => (options as { apiKey: string }).apiKey)).toEqual([
        'admin-slot-key',
        'shared-slot-key',
      ]);
    });

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
      vi.mocked(getActiveKeyIds).mockResolvedValue(['slot-key-1', 'slot-key-2', 'slot-key-3']);

      const Groq = (await import('./browser-provider-clients')).default;
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
      vi.mocked(getActiveKeyIds).mockResolvedValue(['benched-groq-slot-key', 'fresh-groq-slot-key']);

      const Groq = (await import('./browser-provider-clients')).default;
      vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => clientsByKey.get(options.apiKey) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', { preferredKeyIndex: 0 });

      expect(result.success).toBe(true);
      expect(clientsByKey.get('benched-groq-slot-key')?.chat.completions.create).not.toHaveBeenCalled();
      expect(clientsByKey.get('fresh-groq-slot-key')?.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('reports available structured-generation key slots with fingerprints only', async () => {
      vi.mocked(getActiveKeyIds).mockResolvedValue(['fingerprint-slot-key-1', 'fingerprint-slot-key-2']);
      const Groq = (await import('./browser-provider-clients')).default;
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
      vi.mocked(getActiveKeyIds).mockResolvedValue(['model-selection-slot-key']);
      const create = vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"ok":true}' } }],
      });
      const Groq = (await import('./browser-provider-clients')).default;
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
      vi.mocked(getActiveKeyIds).mockResolvedValue(['response-format-slot-key']);
      const create = vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"ok":true}' } }],
      });
      const Groq = (await import('./browser-provider-clients')).default;
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
      vi.mocked(getActiveKeyIds).mockResolvedValue(['tpm-retry-slot-key']);
      const create = vi.fn()
        .mockRejectedValueOnce(new Error('413 Request too large for model on tokens per minute (TPM)'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"ok":true}' } }],
        });
      const Groq = (await import('./browser-provider-clients')).default;
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

    it('retries structured generation with smaller max tokens after request-size TPD errors', async () => {
      vi.mocked(getActiveKeyIds).mockResolvedValue(['tpd-retry-slot-key']);
      const create = vi.fn()
        .mockRejectedValueOnce(new Error('429 Rate limit reached on tokens per day (TPD): Requested 19146. Please try again in 48m4.896s.'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"ok":true}' } }],
        });
      const Groq = (await import('./browser-provider-clients')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: { completions: { create } },
      }) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', {
        preferredKeyIndex: 0,
        maxOutputTokens: 4096,
      });

      expect(result.success).toBe(true);
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls.map(([payload]) => payload.max_tokens)).toEqual([4096, 3072]);
    });

    it('waits and retries temporary structured-generation TPM rate limits before benching the key', async () => {
      vi.mocked(getActiveKeyIds).mockResolvedValue(['tpm-wait-retry-slot-key']);
      const create = vi.fn()
        .mockRejectedValueOnce(new Error('429 Rate limit reached on tokens per minute (TPM). Please try again in 0.001s.'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"ok":true}' } }],
        });
      const Groq = (await import('./browser-provider-clients')).default;
      vi.mocked(Groq).mockImplementation(() => ({
        chat: { completions: { create } },
      }) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', {
        preferredKeyIndex: 0,
        maxOutputTokens: 4096,
      });
      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(result.success).toBe(true);
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls.map(([payload]) => payload.max_tokens)).toEqual([4096, 4096]);
      expect(slots[0]?.available).toBe(true);
    });

    it('honors repeated Groq retry-after windows during one structured-generation call', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(getActiveKeyIds).mockResolvedValue(['tpm-repeat-wait-retry-slot-key']);
        const create = vi.fn()
          .mockRejectedValueOnce(new Error('429 Rate limit reached on tokens per minute (TPM). Please try again in 0.001s.'))
          .mockRejectedValueOnce(new Error('429 Rate limit reached on tokens per minute (TPM). Please try again in 0.001s.'))
          .mockResolvedValueOnce({
            choices: [{ message: { content: '{"ok":true}' } }],
          });
        const Groq = (await import('./browser-provider-clients')).default;
        vi.mocked(Groq).mockImplementation(() => ({
          chat: { completions: { create } },
        }) as any);
        provider = new GroqProvider();

        const pending = provider.generateStructuredJson('{"request":true}', {
          preferredKeyIndex: 0,
          maxOutputTokens: 4096,
        });
        await vi.advanceTimersByTimeAsync(1001);
        await vi.advanceTimersByTimeAsync(1001);
        const result = await pending;
        const slots = await provider.getAvailableStructuredJsonKeySlots();

        expect(result.success).toBe(true);
        expect(create).toHaveBeenCalledTimes(3);
        expect(slots[0]?.available).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('benches structured generation slots when request-size retries still fail', async () => {
      vi.mocked(getActiveKeyIds).mockResolvedValue(['tpm-failing-slot-key']);
      const create = vi.fn().mockRejectedValue(new Error('413 Request too large for model on tokens per minute (TPM)'));
      const Groq = (await import('./browser-provider-clients')).default;
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
      vi.mocked(getActiveKeyIds).mockResolvedValue(['race-slot-key-1', 'race-slot-key-2']);

      const Groq = (await import('./browser-provider-clients')).default;
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

    it('rotates past hard preferred-slot key errors for structured generation', async () => {
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
      vi.mocked(getActiveKeyIds).mockResolvedValue(['hard-error-slot-key-1', 'hard-error-slot-key-2']);

      const Groq = (await import('./browser-provider-clients')).default;
      vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => clientsByKey.get(options.apiKey) as any);
      provider = new GroqProvider();

      const result = await provider.generateStructuredJson('{"request":true}', { preferredKeyIndex: 0 });
      const slots = await provider.getAvailableStructuredJsonKeySlots();

      expect(result.success).toBe(true);
      expect(slots[0]?.available).toBe(false);
      expect(slots[1]?.available).toBe(true);
    });
  });

  it('continues writing grading on the next Groq key after a rejected key', async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const healthyKey = `grading-healthy-${suffix}`;
    const rejectedKey = `grading-rejected-${suffix}`;
    const healthyCreate = vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"score":85,"confidence":90,"feedback":"Good"}' } }] });
    const rejectedCreate = vi.fn().mockRejectedValue(new Error('401 Authentication failed'));
    vi.mocked(getActiveKeyIds).mockResolvedValue([healthyKey, rejectedKey]);
    const Groq = (await import('./browser-provider-clients')).default;
    vi.mocked(Groq).mockImplementation((options: { apiKey: string }) => ({
      chat: { completions: { create: options.apiKey === healthyKey ? healthyCreate : rejectedCreate } },
    }) as any);
    provider = new GroqProvider();

    const result = await provider.gradeWritingAnswer('I have gone', ['I have gone'], 'I went');

    expect(result).toEqual({ success: true, data: { score: 85, confidence: 90, feedback: 'Good' } });
    expect(rejectedCreate).toHaveBeenCalledTimes(1);
    expect(healthyCreate).toHaveBeenCalledTimes(1);
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

      const Groq = (await import('./browser-provider-clients')).default;
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
      const Groq = (await import('./browser-provider-clients')).default;
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
      const Groq = (await import('./browser-provider-clients')).default;
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
