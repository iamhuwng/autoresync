import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiService } from './router.service';
import type { Chunk } from '../../types/document.types';
import type { AIParseResult } from './ai.service';

// Mock the providers
vi.mock('./gemini.provider', () => ({
  geminiProvider: {
    parseChunk: vi.fn(),
    getStatus: vi.fn(() => ({ available: true, provider: 'gemini' })),
    testConnection: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('./groq.provider', () => ({
  groqProvider: {
    parseChunk: vi.fn(),
    getStatus: vi.fn(() => ({ available: true, provider: 'groq' })),
    testConnection: vi.fn(),
    reset: vi.fn(),
  },
}));

describe('AI Router Service', () => {
  const mockChunk: Chunk = {
    id: 'chunk-1',
    content: 'Test content',
    startIndex: 0,
    endIndex: 100,
    wordCount: 20,
    estimatedTokens: 25,
  };

  const mockParseResult: AIParseResult = {
    questions: [
      {
        id: 'q1',
        questionNumber: 1,
        type: 'multiple-choice',
        question: 'Test question?',
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        passageId: null,
      },
    ],
    confidence: 0.95,
    metadata: {
      model: 'gemini-2.0-flash',
      tokensUsed: 100,
      processingTime: 500,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    aiService.reset();
    // Reset to default config
    aiService.setConfig({
      strategy: 'gemini-first',
      enableFallback: true,
      retryAttempts: 2,
      retryDelay: 100,
    });
  });

  describe('Provider Selection', () => {
    it('should use Gemini as primary provider by default', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: true,
        data: mockParseResult,
      });

      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(geminiProvider.parseChunk).toHaveBeenCalledWith(mockChunk);
    });

    it('should fallback to Groq if Gemini fails', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'Gemini error',
      });
      vi.mocked(groqProvider.parseChunk).mockResolvedValue({
        success: true,
        data: mockParseResult,
      });

      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(geminiProvider.parseChunk).toHaveBeenCalled();
      expect(groqProvider.parseChunk).toHaveBeenCalled();
    });

    it('should use Groq first when strategy is groq-first', async () => {
      const { groqProvider } = await import('./groq.provider');
      vi.mocked(groqProvider.parseChunk).mockResolvedValue({
        success: true,
        data: mockParseResult,
      });

      aiService.setConfig({ strategy: 'groq-first' });
      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(groqProvider.parseChunk).toHaveBeenCalledWith(mockChunk);
    });

    it('should use only Gemini when strategy is gemini-only', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'Gemini error',
      });

      aiService.setConfig({ strategy: 'gemini-only' });
      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      expect(geminiProvider.parseChunk).toHaveBeenCalled();
      expect(groqProvider.parseChunk).not.toHaveBeenCalled();
    });

    it('should use only Groq when strategy is groq-only', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(groqProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'Groq error',
      });

      aiService.setConfig({ strategy: 'groq-only' });
      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      expect(groqProvider.parseChunk).toHaveBeenCalled();
      expect(geminiProvider.parseChunk).not.toHaveBeenCalled();
    });
  });

  describe('Fallback Behavior', () => {
    it('should not fallback when disabled', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'Gemini error',
      });

      aiService.setConfig({ enableFallback: false });
      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      expect(geminiProvider.parseChunk).toHaveBeenCalled();
      expect(groqProvider.parseChunk).not.toHaveBeenCalled();
    });

    it('should return error when all providers fail', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'Gemini error',
      });
      vi.mocked(groqProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'Groq error',
      });

      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      expect(result.error).toBe('All AI providers failed');
    });

    it('should skip unavailable providers', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.getStatus).mockReturnValue({
        available: false,
        provider: 'gemini',
      });
      vi.mocked(groqProvider.parseChunk).mockResolvedValue({
        success: true,
        data: mockParseResult,
      });

      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(geminiProvider.parseChunk).not.toHaveBeenCalled();
      expect(groqProvider.parseChunk).toHaveBeenCalled();
    });
  });

  describe('Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      const { geminiProvider } = await import('./gemini.provider');

      vi.mocked(geminiProvider.parseChunk)
        .mockResolvedValueOnce({
          success: false,
          error: 'Network timeout',
        })
        .mockResolvedValueOnce({
          success: true,
          data: mockParseResult,
        });

      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(geminiProvider.parseChunk).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'Invalid API key',
      });
      vi.mocked(groqProvider.parseChunk).mockResolvedValue({
        success: true,
        data: mockParseResult,
      });

      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      expect(geminiProvider.parseChunk).toHaveBeenCalledTimes(1);
      expect(groqProvider.parseChunk).toHaveBeenCalled();
    });

    it('should respect retry attempts configuration', async () => {
      const { geminiProvider } = await import('./gemini.provider');

      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'timeout',
      });

      aiService.setConfig({ retryAttempts: 3 });
      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      expect(geminiProvider.parseChunk).toHaveBeenCalledTimes(3);
    });

    it('should detect retryable error patterns', async () => {
      const { geminiProvider } = await import('./gemini.provider');

      const retryableErrors = [
        'timeout',
        'network error',
        'ECONNRESET',
        'ETIMEDOUT',
        'fetch failed',
      ];

      for (const error of retryableErrors) {
        vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
          success: false,
          error,
        });

        await aiService.parseChunk(mockChunk);

        expect(geminiProvider.parseChunk).toHaveBeenCalledTimes(2);
        vi.clearAllMocks();
      }
    });
  });

  describe('Status Management', () => {
    it('should get primary provider status', () => {
      const status = aiService.getStatus();

      expect(status).toBeTruthy();
      expect(status.provider).toBe('gemini');
    });

    it('should get all provider statuses', () => {
      const statuses = aiService.getAllStatuses();

      expect(statuses).toHaveProperty('gemini');
      expect(statuses).toHaveProperty('groq');
      expect(statuses.gemini.provider).toBe('gemini');
      expect(statuses.groq.provider).toBe('groq');
    });

    it('should test connection for all providers', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.testConnection).mockResolvedValue({
        success: true,
        data: 'Connected',
      });
      vi.mocked(groqProvider.testConnection).mockResolvedValue({
        success: true,
        data: 'Connected',
      });

      const result = await aiService.testConnection();

      expect(result.success).toBe(true);
      expect(result.data).toBe('All providers connected');
    });

    it('should handle partial connection', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.testConnection).mockResolvedValue({
        success: true,
        data: 'Connected',
      });
      vi.mocked(groqProvider.testConnection).mockResolvedValue({
        success: false,
        error: 'Connection failed',
      });

      const result = await aiService.testConnection();

      expect(result.success).toBe(true);
      expect(result.data).toContain('At least one provider connected');
    });

    it('should handle no connection', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.testConnection).mockResolvedValue({
        success: false,
        error: 'Failed',
      });
      vi.mocked(groqProvider.testConnection).mockResolvedValue({
        success: false,
        error: 'Failed',
      });

      const result = await aiService.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No providers available');
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      aiService.setConfig({
        strategy: 'groq-first',
        retryAttempts: 5,
      });

      const config = aiService.getConfig();

      expect(config.strategy).toBe('groq-first');
      expect(config.retryAttempts).toBe(5);
      expect(config.enableFallback).toBe(true); // Should keep existing values
    });

    it('should get current configuration', () => {
      const config = aiService.getConfig();

      expect(config).toHaveProperty('strategy');
      expect(config).toHaveProperty('enableFallback');
      expect(config).toHaveProperty('retryAttempts');
      expect(config).toHaveProperty('retryDelay');
    });

    it('should partially update configuration', () => {
      const originalConfig = aiService.getConfig();

      aiService.setConfig({ retryAttempts: 10 });
      const newConfig = aiService.getConfig();

      expect(newConfig.retryAttempts).toBe(10);
      expect(newConfig.strategy).toBe(originalConfig.strategy);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all providers', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      aiService.reset();

      expect(geminiProvider.reset).toHaveBeenCalled();
      expect(groqProvider.reset).toHaveBeenCalled();
    });
  });

  describe('Complex Workflows', () => {
    it('should handle complete parse workflow with fallback', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      // Gemini fails with timeout (retryable)
      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: false,
        error: 'timeout',
      });

      // Groq succeeds
      vi.mocked(groqProvider.parseChunk).mockResolvedValue({
        success: true,
        data: mockParseResult,
      });

      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(true);
      // Gemini should be tried retryAttempts times
      expect(geminiProvider.parseChunk).toHaveBeenCalledTimes(2);
      // Then Groq is tried once
      expect(groqProvider.parseChunk).toHaveBeenCalledTimes(1);
    });

    it('should handle strategy changes mid-workflow', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.parseChunk).mockResolvedValue({
        success: true,
        data: mockParseResult,
      });

      // First parse with gemini-first
      await aiService.parseChunk(mockChunk);
      expect(geminiProvider.parseChunk).toHaveBeenCalled();

      vi.clearAllMocks();

      // Change strategy
      aiService.setConfig({ strategy: 'groq-first' });
      vi.mocked(groqProvider.parseChunk).mockResolvedValue({
        success: true,
        data: mockParseResult,
      });

      // Second parse with groq-first
      await aiService.parseChunk(mockChunk);
      expect(groqProvider.parseChunk).toHaveBeenCalled();
    });

    it('should handle unavailable providers gracefully', async () => {
      const { geminiProvider } = await import('./gemini.provider');
      const { groqProvider } = await import('./groq.provider');

      vi.mocked(geminiProvider.getStatus).mockReturnValue({
        available: false,
        provider: 'gemini',
      });
      vi.mocked(groqProvider.getStatus).mockReturnValue({
        available: false,
        provider: 'groq',
      });

      const result = await aiService.parseChunk(mockChunk);

      expect(result.success).toBe(false);
      expect(result.error).toBe('All AI providers failed');
      expect(geminiProvider.parseChunk).not.toHaveBeenCalled();
      expect(groqProvider.parseChunk).not.toHaveBeenCalled();
    });
  });
});
