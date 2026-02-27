import { describe, it, expect, vi } from 'vitest';
import { parseDocxFile, validateDocxFile } from './docxParser';

// Mock mammoth
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn()
  }
}));

// Mock textParser
vi.mock('../utils/parsers/textParser.js', () => ({
  parseTextToQuiz: vi.fn()
}));

// Mock aiParser
vi.mock('../utils/parsers/aiParser.js', () => ({
  parseWithAIFallback: vi.fn(),
  shouldTriggerAI: vi.fn(() => false) // Default to not trigger AI
}));

/**
 * Helper to create a mock File with working arrayBuffer method
 * JSDOM's File/Blob doesn't properly implement arrayBuffer() in some environments
 */
function createMockFile(content, name, options = {}) {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(content);
  const arrayBuffer = uint8Array.buffer;
  
  const file = new File([content], name, options);
  
  // Override arrayBuffer to return a proper Promise<ArrayBuffer>
  file.arrayBuffer = () => Promise.resolve(arrayBuffer);
  
  return file;
}

describe('docxParser', () => {
  describe('validateDocxFile', () => {
    it('should validate correct DOCX file', () => {
      const file = new File(['content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const result = validateDocxFile(file);
      expect(result.valid).toBe(true);
    });

    it('should reject null file', () => {
      const result = validateDocxFile(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No file provided');
    });

    it('should reject non-DOCX file', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const result = validateDocxFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.docx');
    });

    it('should reject file larger than 10MB', () => {
      const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
      const file = new File([largeContent], 'large.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const result = validateDocxFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10MB');
    });

    it('should reject empty file', () => {
      const file = new File([], 'empty.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const result = validateDocxFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });
  });

  describe('parseDocxFile', () => {
    it('should parse DOCX file successfully', async () => {
      const mammoth = await import('mammoth');
      const { parseTextToQuiz } = await import('../utils/parsers/textParser.js');
      
      // Mock mammoth to return text
      mammoth.default.extractRawText.mockResolvedValue({
        value: 'Question 1: What is 2+2?\nA) 3\nB) 4\nC) 5\nAnswer: B'
      });
      
      // Mock text parser to return quiz data
      parseTextToQuiz.mockReturnValue({
        success: true,
        quiz: {
          title: 'Test Quiz',
          questions: [
            {
              question: 'What is 2+2?',
              type: 'multiple-choice',
              options: ['3', '4', '5'],
              answer: '4'
            }
          ]
        },
        confidence: 85
      });
      
      const file = createMockFile('docx content', 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      const result = await parseDocxFile(file);
      
      expect(result.success).toBe(true);
      expect(result.sourceFormat).toBe('docx');
      expect(result.originalFileName).toBe('test.docx');
      expect(mammoth.default.extractRawText).toHaveBeenCalled();
      expect(parseTextToQuiz).toHaveBeenCalled();
    });

    it('should handle empty DOCX file', async () => {
      const mammoth = await import('mammoth');
      
      mammoth.default.extractRawText.mockResolvedValue({
        value: ''
      });
      
      const file = createMockFile('docx content', 'empty.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      const result = await parseDocxFile(file);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
      expect(result.confidence).toBe(0);
    });

    it('should handle mammoth extraction error', async () => {
      const mammoth = await import('mammoth');
      
      mammoth.default.extractRawText.mockRejectedValue(
        new Error('Invalid DOCX format')
      );
      
      const file = createMockFile('invalid', 'corrupt.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      const result = await parseDocxFile(file);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse DOCX');
      expect(result.confidence).toBe(0);
    });

    it('should include extracted text length in metadata', async () => {
      const mammoth = await import('mammoth');
      const { parseTextToQuiz } = await import('../utils/parsers/textParser.js');
      
      const extractedText = 'This is a test quiz with some content';
      mammoth.default.extractRawText.mockResolvedValue({
        value: extractedText
      });
      
      parseTextToQuiz.mockReturnValue({
        success: true,
        quiz: { title: 'Test', questions: [] },
        confidence: 80
      });
      
      const file = createMockFile('docx', 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      const result = await parseDocxFile(file);
      
      expect(result.extractedTextLength).toBe(extractedText.length);
    });
  });
});
