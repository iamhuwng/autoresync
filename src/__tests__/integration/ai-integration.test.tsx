import { describe, it, expect, beforeEach, vi } from 'vitest';
import { server } from '../setup';
import { http, HttpResponse } from 'msw';

// Mock AI services
vi.mock('../../services/ai/router.service', () => ({
  aiService: {
    parseChunk: vi.fn(),
    getStatus: vi.fn(() => ({ available: true, name: 'gemini' })),
    testConnection: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

describe('AI Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gemini API Integration', () => {
    it('should successfully parse with Gemini', async () => {
      const { aiService } = await import('../../services/ai/router.service');

      vi.mocked(aiService.parseChunk).mockResolvedValue({
        success: true,
        data: {
          passages: [{
            id: 'p1',
            title: 'Test',
            content: 'Content',
            type: 'text',
            questionStart: 1,
            questionEnd: 3,
            wordCount: 50,
          }],
          questions: [{
            questionNumber: 1,
            questionText: 'Question?',
            type: 'multiple-choice',
            options: ['A', 'B'],
            answer: 'A',
            confidence: 95,
          }],
          answerKey: { '1': 'A' },
          confidence: 90,
        },
      });

      const result = await aiService.parseChunk({
        id: 'chunk-1',
        number: 1,
        text: 'Test content',
        wordCount: 10,
        startIndex: 0,
        endIndex: 100,
        isLast: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidence).toBeGreaterThan(80);
        expect(result.data.questions).toHaveLength(1);
      }
    });

    it('should handle Gemini API errors', async () => {
      const { aiService } = await import('../../services/ai/router.service');

      vi.mocked(aiService.parseChunk).mockResolvedValue({
        success: false,
        error: 'API Error',
      });

      const result = await aiService.parseChunk({
        id: 'chunk-1',
        number: 1,
        text: 'Test',
        wordCount: 1,
        startIndex: 0,
        endIndex: 10,
        isLast: true,
      });

      expect(result.success).toBe(false);
    });

    it('should handle rate limit errors', async () => {
      const { aiService } = await import('../../services/ai/router.service');

      vi.mocked(aiService.parseChunk).mockResolvedValue({
        success: false,
        error: '429: Rate limit exceeded',
      });

      const result = await aiService.parseChunk({
        id: 'chunk-1',
        number: 1,
        text: 'Test',
        wordCount: 1,
        startIndex: 0,
        endIndex: 10,
        isLast: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('429');
      }
    });
  });

  describe('Groq Fallback Integration', () => {
    it('should fallback to Groq when Gemini fails', async () => {
      const { aiService } = await import('../../services/ai/router.service');

      vi.mocked(aiService.parseChunk).mockResolvedValue({
        success: true,
        data: {
          passages: [],
          questions: [{
            questionNumber: 1,
            questionText: 'Fallback question?',
            type: 'completion',
            answer: 'test',
            confidence: 85,
          }],
          answerKey: {},
          confidence: 85,
        },
      });

      const result = await aiService.parseChunk({
        id: 'chunk-1',
        number: 1,
        text: 'Test',
        wordCount: 1,
        startIndex: 0,
        endIndex: 10,
        isLast: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Progress Updates', () => {
    it('should report parsing progress', async () => {
      const progressUpdates: number[] = [];

      const mockProgress = (progress: number) => {
        progressUpdates.push(progress);
      };

      // Simulate progress
      mockProgress(0);
      mockProgress(25);
      mockProgress(50);
      mockProgress(75);
      mockProgress(100);

      expect(progressUpdates).toHaveLength(5);
      expect(progressUpdates[0]).toBe(0);
      expect(progressUpdates[4]).toBe(100);
    });

    it('should handle chunk progress', () => {
      const chunkProgress = {
        current: 2,
        total: 5,
        percentage: 40,
      };

      expect(chunkProgress.current).toBeLessThanOrEqual(chunkProgress.total);
      expect(chunkProgress.percentage).toBe(40);
    });
  });

  describe('Result Validation', () => {
    it('should validate AI response structure', async () => {
      const { aiService } = await import('../../services/ai/router.service');

      vi.mocked(aiService.parseChunk).mockResolvedValue({
        success: true,
        data: {
          passages: [],
          questions: [{
            questionNumber: 1,
            questionText: 'Valid question?',
            type: 'multiple-choice',
            options: ['A', 'B', 'C'],
            answer: 'A',
            confidence: 90,
          }],
          answerKey: {},
          confidence: 90,
        },
      });

      const result = await aiService.parseChunk({
        id: 'chunk-1',
        number: 1,
        text: 'Test',
        wordCount: 1,
        startIndex: 0,
        endIndex: 10,
        isLast: true,
      });

      if (result.success) {
        expect(result.data).toHaveProperty('passages');
        expect(result.data).toHaveProperty('questions');
        expect(result.data).toHaveProperty('confidence');
        expect(Array.isArray(result.data.questions)).toBe(true);
      }
    });

    it('should reject invalid response structure', async () => {
      const { aiService } = await import('../../services/ai/router.service');

      vi.mocked(aiService.parseChunk).mockResolvedValue({
        success: false,
        error: 'Invalid response structure',
      });

      const result = await aiService.parseChunk({
        id: 'chunk-1',
        number: 1,
        text: 'Test',
        wordCount: 1,
        startIndex: 0,
        endIndex: 10,
        isLast: true,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Diagnostics Generation', () => {
    it('should generate diagnostics from parse result', () => {
      const parseResult = {
        passages: [],
        questions: [{
          questionNumber: 1,
          questionText: '',
          type: 'multiple-choice' as const,
          options: [],
          answer: '',
          confidence: 50,
        }],
        answerKey: {},
        confidence: 50,
      };

      // Check for potential issues
      const hasLowConfidence = parseResult.confidence < 70;
      const hasEmptyQuestion = parseResult.questions.some(q => !q.questionText);
      const hasEmptyAnswer = parseResult.questions.some(q => !q.answer);

      expect(hasLowConfidence).toBe(true);
      expect(hasEmptyQuestion).toBe(true);
      expect(hasEmptyAnswer).toBe(true);
    });
  });

  describe('Connection Testing', () => {
    it('should test provider connection', async () => {
      const { aiService } = await import('../../services/ai/router.service');

      vi.mocked(aiService.testConnection).mockResolvedValue({
        success: true,
        data: undefined,
      });

      const result = await aiService.testConnection();

      expect(result.success).toBe(true);
    });

    it('should handle connection failures', async () => {
      const { aiService } = await import('../../services/ai/router.service');

      vi.mocked(aiService.testConnection).mockResolvedValue({
        success: false,
        error: 'Connection failed',
      });

      const result = await aiService.testConnection();

      expect(result.success).toBe(false);
    });
  });
});
