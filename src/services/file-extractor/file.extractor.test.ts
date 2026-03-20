import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractTextFromFile,
  getFileInputAccept,
  getMaxFileSize,
  getSupportedExtensions,
  isFileTypeSupported,
} from './file.extractor';

vi.mock('mammoth', () => ({
  extractRawText: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  version: '5.4.296',
}));

function createTextFile(content: string, name = 'test.txt', type = 'text/plain') {
  const file = new File([content], name, { type }) as File & {
    text: () => Promise<string>;
    arrayBuffer: () => Promise<ArrayBuffer>;
  };
  const encoder = new TextEncoder();
  const buffer = encoder.encode(content).buffer as ArrayBuffer;

  file.text = vi.fn().mockResolvedValue(content);
  file.arrayBuffer = vi.fn().mockResolvedValue(buffer);

  return file;
}

function createPdfTextItem(str: string, x: number, y: number, width = 24, fontSize = 12) {
  return {
    str,
    width,
    transform: [1, 0, 0, fontSize, x, y],
  };
}

describe('File Extractor Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TXT and Markdown extraction', () => {
    it('extracts text from TXT files', async () => {
      const file = createTextFile('Sample text content');

      await expect(extractTextFromFile(file)).resolves.toEqual({
        success: true,
        data: 'Sample text content',
      });
    });

    it('rejects empty TXT files as empty or corrupted', async () => {
      const file = createTextFile('', 'empty.txt');

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('empty or corrupted');
      }
    });

    it('preserves special characters in TXT files', async () => {
      const content = 'Text with emojis 😀 and special chars: @#$%^&*()';
      const file = createTextFile(content, 'special.txt');

      await expect(extractTextFromFile(file)).resolves.toEqual({
        success: true,
        data: content,
      });
    });

    it('extracts markdown files as plain text', async () => {
      const content = '# Title\n\n- Bullet';
      const file = createTextFile(content, 'notes.md', 'text/markdown');

      await expect(extractTextFromFile(file)).resolves.toEqual({
        success: true,
        data: content,
      });
    });

    it('rejects empty markdown files as empty or corrupted', async () => {
      const file = createTextFile('', 'empty.md', 'text/markdown');

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('empty or corrupted');
      }
    });
  });

  describe('DOCX extraction', () => {
    it('extracts text from DOCX files', async () => {
      const mammoth = await import('mammoth');
      vi.mocked(mammoth.extractRawText).mockResolvedValue({
        value: 'Sample DOCX content',
        messages: [],
      });

      const file = createTextFile(
        'mock docx data',
        'test.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      const result = await extractTextFromFile(file);

      expect(result).toEqual({
        success: true,
        data: 'Sample DOCX content',
      });
      const [[docxArg]] = vi.mocked(mammoth.extractRawText).mock.calls;
      expect(docxArg).toHaveProperty('arrayBuffer');
      expect(typeof docxArg.arrayBuffer.byteLength).toBe('number');
    });

    it('returns a no-text error when DOCX extraction is empty', async () => {
      const mammoth = await import('mammoth');
      vi.mocked(mammoth.extractRawText).mockResolvedValue({
        value: '',
        messages: [],
      });

      const file = createTextFile(
        'mock docx data',
        'empty.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      await expect(extractTextFromFile(file)).resolves.toEqual({
        success: false,
        error: 'No text content found in DOCX file',
      });
    });

    it('fails gracefully when DOCX parsing throws', async () => {
      const mammoth = await import('mammoth');
      vi.mocked(mammoth.extractRawText).mockRejectedValue(new Error('DOCX parsing failed'));

      const file = createTextFile(
        'corrupt docx',
        'corrupt.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to extract DOCX');
      }
    });
  });

  describe('PDF extraction', () => {
    it('extracts text from PDF files', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            createPdfTextItem('Page', 0, 500),
            createPdfTextItem('1', 32, 500),
            createPdfTextItem('content', 68, 500),
          ],
        }),
      };
      const mockPDF = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      };
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockPDF),
      } as any);

      const file = createTextFile('mock pdf data', 'test.pdf', 'application/pdf');
      const result = await extractTextFromFile(file);

      expect(result).toEqual({
        success: true,
        data: 'Page 1 content',
      });
    });

    it('extracts text from multi-page PDFs with page breaks', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const mockPage1 = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [createPdfTextItem('Page 1', 0, 500)],
        }),
      };
      const mockPage2 = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            createPdfTextItem('Page 2', 0, 500),
            createPdfTextItem('Next paragraph', 0, 460),
          ],
        }),
      };
      const mockPDF = {
        numPages: 2,
        getPage: vi
          .fn()
          .mockResolvedValueOnce(mockPage1)
          .mockResolvedValueOnce(mockPage2),
      };
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockPDF),
      } as any);

      const file = createTextFile('mock pdf data', 'multi.pdf', 'application/pdf');
      const result = await extractTextFromFile(file);

      expect(result).toEqual({
        success: true,
        data: 'Page 1\n\nPage 2\n\nNext paragraph',
      });
    });

    it('fails gracefully when PDF parsing throws', async () => {
      const pdfjsLib = await import('pdfjs-dist');
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.reject(new Error('PDF parsing failed')),
      } as any);

      const file = createTextFile('corrupt pdf', 'corrupt.pdf', 'application/pdf');
      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to extract PDF');
      }
    });
  });

  describe('Validation and helper methods', () => {
    it('rejects unsupported file types', async () => {
      const file = createTextFile('image data', 'image.png', 'image/png');

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unsupported file type: .png');
      }
    });

    it('rejects files larger than 10MB', async () => {
      const file = new File([new Uint8Array(getMaxFileSize() + 1)], 'large.txt', {
        type: 'text/plain',
      });

      const result = await extractTextFromFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('exceeds maximum allowed size (10MB)');
      }
    });

    it('accepts files exactly 10MB', async () => {
      const content = 'a'.repeat(getMaxFileSize());
      const file = createTextFile(content, 'exact10mb.txt');

      await expect(extractTextFromFile(file)).resolves.toEqual({
        success: true,
        data: content,
      });
    });

    it('returns the current legacy DOC guidance for .doc files', async () => {
      const file = createTextFile('legacy doc data', 'legacy.doc', 'application/msword');

      await expect(extractTextFromFile(file)).resolves.toEqual({
        success: false,
        error:
          'Legacy .doc files are not supported. Please convert to .docx format using Microsoft Word or Google Docs, then try again.',
      });
    });

    it('returns the current supported extensions list', () => {
      expect(getSupportedExtensions()).toEqual(['txt', 'docx', 'pdf', 'md', 'markdown']);
    });

    it('returns the current file input accept string', () => {
      expect(getFileInputAccept()).toBe('.txt,.docx,.pdf,.md,.markdown');
    });

    it('supports current extensions case-insensitively and rejects unsupported ones', () => {
      expect(isFileTypeSupported(createTextFile('content', 'test.TXT'))).toBe(true);
      expect(isFileTypeSupported(createTextFile('content', 'notes.Markdown'))).toBe(true);
      expect(isFileTypeSupported(createTextFile('content', 'test.pdf', 'application/pdf'))).toBe(
        true
      );
      expect(isFileTypeSupported(createTextFile('content', 'test.png', 'image/png'))).toBe(false);
    });

    it('uses extension-based routing for no-extension and wrong-extension files', async () => {
      const noExtension = createTextFile('content', 'noextension');
      const wrongExtension = createTextFile('content', 'file.wrong');

      expect(isFileTypeSupported(noExtension)).toBe(false);
      expect(isFileTypeSupported(wrongExtension)).toBe(false);

      const noExtensionResult = await extractTextFromFile(noExtension);
      const wrongExtensionResult = await extractTextFromFile(wrongExtension);

      expect(noExtensionResult.success).toBe(false);
      expect(wrongExtensionResult.success).toBe(false);
      if (!noExtensionResult.success) {
        expect(noExtensionResult.error).toContain('Unsupported file type: .noextension');
      }
      if (!wrongExtensionResult.success) {
        expect(wrongExtensionResult.error).toContain('Unsupported file type: .wrong');
      }
    });

    it('returns a stable error when no file is provided', async () => {
      await expect(extractTextFromFile(null as any)).resolves.toEqual({
        success: false,
        error: 'No file provided',
      });
    });
  });
});
