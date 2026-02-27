import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroqProvider } from './groq.provider';
import type { Chunk } from '../../types/document.types';

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

// Mock response validator
vi.mock('./response.validator', () => ({
  validateAIResponse: vi.fn((data) => ({ success: true, data })),
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
    provider = new GroqProvider();
  });

  describe('Initialization', () => {
    it('should initialize with API key', () => {
      const status = provider.getStatus();
      
      expect(status.available).toBe(true);
      expect(status.name).toBe('groq');
    });

    it('should handle missing API key', () => {
      const { getEnv } = require('../../config/env.config');
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
      const { getEnv } = require('../../config/env.config');
      vi.mocked(getEnv).mockReturnValue({});

      const newProvider = new GroqProvider();
      const result = await newProvider.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not initialized');
      }
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
