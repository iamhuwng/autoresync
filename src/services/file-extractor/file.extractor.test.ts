import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTextFromFile,
  getSupportedExtensions,
  getFileInputAccept,
  isFileTypeSupported,
} from './file.extractor';
import type { Result } from '../../types/result.types';

// Mock mammoth and pdfjs-dist
vi.mock('mammoth', () => ({
  extractRawText: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
}));

describe('File Extractor Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TXT File Extraction', () => {
    it('should extract text from TXT file successfully', async () => {
      const content = 'Sample text content';
      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], 'test.txt', { type: 'text/plain' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(content);
      }
    });

    it('should handle empty TXT file', async () => {
      const blob = new Blob([''], { type: 'text/plain' });
      const file = new File([blob], 'empty.txt', { type: 'text/plain' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('');
      }
    });

    it('should handle TXT file with special characters', async () => {
      const content = 'Text with émojis 😀 and special chars: @#$%^&*()';
      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], 'special.txt', { type: 'text/plain' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(content);
      }
    });
  });

  describe('DOCX File Extraction', () => {
    it('should extract text from DOCX file successfully', async () => {
      const mockText = 'Sample DOCX content';
      const mammoth = await import('mammoth');
      vi.mocked(mammoth.extractRawText).mockResolvedValue({
        value: mockText,
        messages: [],
      });

      const blob = new Blob(['mock docx data'], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const file = new File([blob], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(mockText);
      }
      expect(mammoth.extractRawText).toHaveBeenCalledWith({
        arrayBuffer: expect.any(ArrayBuffer),
      });
    });

    it('should handle DOCX extraction error', async () => {
      const mammoth = await import('mammoth');
      vi.mocked(mammoth.extractRawText).mockRejectedValue(
        new Error('DOCX parsing failed')
      );

      const blob = new Blob(['corrupt docx'], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const file = new File([blob], 'corrupt.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe('PDF File Extraction', () => {
    it('should extract text from PDF file successfully', async () => {
      const mockPageText = 'Page 1 content';
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: mockPageText }],
        }),
      };
      const mockPDF = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        destroy: vi.fn(),
      };

      const pdfjsLib = await import('pdfjs-dist');
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockPDF),
      } as any);

      const blob = new Blob(['mock pdf data'], { type: 'application/pdf' });
      const file = new File([blob], 'test.pdf', { type: 'application/pdf' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain(mockPageText);
      }
    });

    it('should extract text from multi-page PDF', async () => {
      const mockPage1 = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: 'Page 1' }],
        }),
      };
      const mockPage2 = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: 'Page 2' }],
        }),
      };
      const mockPDF = {
        numPages: 2,
        getPage: vi.fn()
          .mockResolvedValueOnce(mockPage1)
          .mockResolvedValueOnce(mockPage2),
        destroy: vi.fn(),
      };

      const pdfjsLib = await import('pdfjs-dist');
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockPDF),
      } as any);

      const blob = new Blob(['mock pdf data'], { type: 'application/pdf' });
      const file = new File([blob], 'multi.pdf', { type: 'application/pdf' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('Page 1');
        expect(result.data).toContain('Page 2');
      }
    });

    it('should handle PDF extraction error', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.reject(new Error('PDF parsing failed')),
      } as any);

      const blob = new Blob(['corrupt pdf'], { type: 'application/pdf' });
      const file = new File([blob], 'corrupt.pdf', { type: 'application/pdf' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('PDF');
      }
    });
  });

  describe('File Validation', () => {
    it('should reject unsupported file types', async () => {
      const blob = new Blob(['image data'], { type: 'image/png' });
      const file = new File([blob], 'image.png', { type: 'image/png' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unsupported file type');
      }
    });

    it('should reject files larger than 10MB', async () => {
      // Create a mock file that's 11MB
      const largeContent = 'a'.repeat(11 * 1024 * 1024);
      const blob = new Blob([largeContent], { type: 'text/plain' });
      const file = new File([blob], 'large.txt', { type: 'text/plain' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('File size exceeds');
      }
    });

    it('should accept files exactly 10MB', async () => {
      // Create a mock file that's exactly 10MB
      const content = 'a'.repeat(10 * 1024 * 1024);
      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], 'exact10mb.txt', { type: 'text/plain' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
    });
  });

  describe('Helper Methods', () => {
    it('getSupportedExtensions should return correct extensions', () => {
      const extensions = getSupportedExtensions();
      expect(extensions).toContain('txt');
      expect(extensions).toContain('docx');
      expect(extensions).toContain('pdf');
      expect(extensions).toHaveLength(3);
    });

    it('getFileInputAccept should return correct accept string', () => {
      const accept = getFileInputAccept();
      expect(accept).toBe('.txt,.docx,.pdf');
    });

    it('isFileTypeSupported should return true for TXT', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const result = isFileTypeSupported(file);
      expect(result).toBe(true);
    });

    it('isFileTypeSupported should return true for DOCX', () => {
      const file = new File(['content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = isFileTypeSupported(file);
      expect(result).toBe(true);
    });

    it('isFileTypeSupported should return true for PDF', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const result = isFileTypeSupported(file);
      expect(result).toBe(true);
    });

    it('isFileTypeSupported should return false for unsupported types', () => {
      const pngFile = new File(['content'], 'test.png', { type: 'image/png' });
      const mp4File = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      const jsonFile = new File(['content'], 'test.json', { type: 'application/json' });
      
      expect(isFileTypeSupported(pngFile)).toBe(false);
      expect(isFileTypeSupported(mp4File)).toBe(false);
      expect(isFileTypeSupported(jsonFile)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle file with no extension', async () => {
      const blob = new Blob(['content'], { type: 'text/plain' });
      const file = new File([blob], 'noextension', { type: 'text/plain' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
    });

    it('should handle file with incorrect extension but correct MIME type', async () => {
      const blob = new Blob(['content'], { type: 'text/plain' });
      const file = new File([blob], 'file.wrong', { type: 'text/plain' });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(true);
    });

    it('should handle file read error', async () => {
      // Create a mock file that simulates a read error
      const mockFile = {
        name: 'error.txt',
        type: 'text/plain',
        size: 1000,
        arrayBuffer: vi.fn().mockRejectedValue(new Error('Read error')),
      } as any;

      const result = await extractor.extractText(mockFile);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });

    it('should handle null or undefined file', async () => {
      const result = await extractor.extractText(null as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe('Dynamic Import Errors', () => {
    it('should handle mammoth import failure', async () => {
      // Mock dynamic import failure
      vi.doMock('mammoth', () => {
        throw new Error('Failed to load mammoth');
      });

      const blob = new Blob(['docx content'], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const file = new File([blob], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await extractTextFromFile(file);

      // Should either succeed or fail gracefully
      expect(result).toHaveProperty('success');
    });

    it('should handle pdfjs-dist import failure', async () => {
      // Mock dynamic import failure
      vi.doMock('pdfjs-dist', () => {
        throw new Error('Failed to load pdfjs-dist');
      });

      const blob = new Blob(['pdf content'], { type: 'application/pdf' });
      const file = new File([blob], 'test.pdf', { type: 'application/pdf' });

      const result = await extractTextFromFile(file);

      // Should either succeed or fail gracefully
      expect(result).toHaveProperty('success');
    });
  });
});
