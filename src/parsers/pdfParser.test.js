import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePdfFile, validatePdfFile } from './pdfParser';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {
    workerSrc: ''
  },
  getDocument: vi.fn()
}));

// Mock textParser
vi.mock('../utils/parsers/textParser.js', () => ({
  parseTextToQuiz: vi.fn()
}));

vi.mock('../utils/parsers/aiParser.js', () => ({
  parseWithAIFallback: vi.fn(),
  shouldTriggerAI: vi.fn()
}));

describe('pdfParser', () => {
  const createPdfFile = (name = 'test.pdf', content = 'pdf content') => ({
    name,
    size: content.length,
    type: 'application/pdf',
    arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(content).buffer)
  });

  describe('validatePdfFile', () => {
    it('should validate correct PDF file', () => {
      const file = new File(['content'], 'test.pdf', {
        type: 'application/pdf'
      });
      const result = validatePdfFile(file);
      expect(result.valid).toBe(true);
    });

    it('should reject null file', () => {
      const result = validatePdfFile(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No file provided');
    });

    it('should reject non-PDF file', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const result = validatePdfFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.pdf');
    });

    it('should reject file larger than 10MB', () => {
      const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
      const file = new File([largeContent], 'large.pdf', {
        type: 'application/pdf'
      });
      const result = validatePdfFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10MB');
    });

    it('should reject empty file', () => {
      const file = new File([], 'empty.pdf', {
        type: 'application/pdf'
      });
      const result = validatePdfFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });
  });

  describe('parsePdfFile', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should parse PDF file successfully', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const { parseTextToQuiz } = await import('../utils/parsers/textParser.js');
      const { shouldTriggerAI } = await import('../utils/parsers/aiParser.js');
      
      // Mock PDF document
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'Question 1: What is 2+2?' },
            { str: 'A) 3 B) 4 C) 5' },
            { str: 'Answer: B' }
          ]
        })
      };
      
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage)
      };
      
      const mockLoadingTask = {
        promise: Promise.resolve(mockPdf)
      };
      
      pdfjsLib.getDocument.mockReturnValue(mockLoadingTask);
      
      // Mock text parser
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
      shouldTriggerAI.mockReturnValue(false);
      
      const file = createPdfFile();
      
      const result = await parsePdfFile(file);
      
      expect(result.success).toBe(true);
      expect(result.sourceFormat).toBe('pdf');
      expect(result.originalFileName).toBe('test.pdf');
      expect(result.numPages).toBe(1);
      expect(pdfjsLib.getDocument).toHaveBeenCalled();
      expect(parseTextToQuiz).toHaveBeenCalled();
    });

    it('should handle multi-page PDF', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const { parseTextToQuiz } = await import('../utils/parsers/textParser.js');
      const { shouldTriggerAI } = await import('../utils/parsers/aiParser.js');
      
      const mockPage1 = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: 'Page 1 content' }]
        })
      };
      
      const mockPage2 = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: 'Page 2 content' }]
        })
      };
      
      const mockPdf = {
        numPages: 2,
        getPage: vi.fn()
          .mockResolvedValueOnce(mockPage1)
          .mockResolvedValueOnce(mockPage2)
      };
      
      const mockLoadingTask = {
        promise: Promise.resolve(mockPdf)
      };
      
      pdfjsLib.getDocument.mockReturnValue(mockLoadingTask);
      
      parseTextToQuiz.mockReturnValue({
        success: true,
        quiz: { title: 'Test', questions: [] },
        confidence: 80
      });
      shouldTriggerAI.mockReturnValue(false);
      
      const file = createPdfFile('multi.pdf', 'pdf');
      
      const result = await parsePdfFile(file);
      
      expect(result.numPages).toBe(2);
      expect(mockPdf.getPage).toHaveBeenCalledTimes(2);
    });

    it('should handle empty PDF', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: []
        })
      };
      
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage)
      };
      
      const mockLoadingTask = {
        promise: Promise.resolve(mockPdf)
      };
      
      pdfjsLib.getDocument.mockReturnValue(mockLoadingTask);
      
      const file = createPdfFile('empty.pdf', 'pdf');
      
      const result = await parsePdfFile(file);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('no readable text');
      expect(result.confidence).toBe(0);
    });

    it('should handle corrupted PDF', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      
      const mockLoadingTask = {
        promise: Promise.reject(new Error('Invalid PDF structure'))
      };
      
      pdfjsLib.getDocument.mockReturnValue(mockLoadingTask);
      
      const file = createPdfFile('corrupt.pdf', 'corrupt');
      
      const result = await parsePdfFile(file);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid PDF');
      expect(result.confidence).toBe(0);
    });

    it('should handle password-protected PDF', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      
      const mockLoadingTask = {
        promise: Promise.reject(new Error('password required'))
      };
      
      pdfjsLib.getDocument.mockReturnValue(mockLoadingTask);
      
      const file = createPdfFile('protected.pdf', 'protected');
      
      const result = await parsePdfFile(file);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('password-protected');
    });

    it('should include extracted text length in metadata', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const { parseTextToQuiz } = await import('../utils/parsers/textParser.js');
      const { shouldTriggerAI } = await import('../utils/parsers/aiParser.js');
      
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'This is test content' },
            { str: 'with multiple items' }
          ]
        })
      };
      
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage)
      };
      
      const mockLoadingTask = {
        promise: Promise.resolve(mockPdf)
      };
      
      pdfjsLib.getDocument.mockReturnValue(mockLoadingTask);
      
      parseTextToQuiz.mockReturnValue({
        success: true,
        quiz: { title: 'Test', questions: [] },
        confidence: 80
      });
      shouldTriggerAI.mockReturnValue(false);
      
      const file = createPdfFile();
      
      const result = await parsePdfFile(file);
      
      expect(result.extractedTextLength).toBeGreaterThan(0);
    });
  });
});
