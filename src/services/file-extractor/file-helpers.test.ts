import { describe, it, expect } from 'vitest';
import { 
  getSupportedExtensions,
  getFileInputAccept, 
  isFileTypeSupported,
  getMaxFileSize 
} from './file.extractor';

describe('File Helpers', () => {
  describe('getSupportedExtensions', () => {
    it('should return array of supported extensions', () => {
      const extensions = getSupportedExtensions();

      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions.length).toBeGreaterThan(0);
    });

    it('should include txt extension', () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain('txt');
    });

    it('should include docx extension', () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain('docx');
    });

    it('should include pdf extension', () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain('pdf');
    });
  });

  describe('getFileInputAccept', () => {
    it('should return valid accept string', () => {
      const accept = getFileInputAccept();

      expect(typeof accept).toBe('string');
      expect(accept.length).toBeGreaterThan(0);
    });

    it('should include .txt in accept string', () => {
      const accept = getFileInputAccept();

      expect(accept).toContain('.txt');
    });

    it('should include .docx in accept string', () => {
      const accept = getFileInputAccept();

      expect(accept).toContain('.docx');
    });

    it('should include .pdf in accept string', () => {
      const accept = getFileInputAccept();

      expect(accept).toContain('.pdf');
    });

    it('should use comma separator', () => {
      const accept = getFileInputAccept();

      if (accept.includes('.txt') && accept.includes('.docx')) {
        expect(accept).toContain(',');
      }
    });
  });

  describe('isFileTypeSupported', () => {
    it('should return true for supported extensions', () => {
      const supportedFiles = [
        new File(['content'], 'test.txt', { type: 'text/plain' }),
        new File(['content'], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        new File(['content'], 'test.pdf', { type: 'application/pdf' }),
      ];

      supportedFiles.forEach(file => {
        expect(isFileTypeSupported(file)).toBe(true);
      });
    });

    it('should return false for unsupported extensions', () => {
      const unsupportedFiles = [
        new File(['content'], 'test.jpg', { type: 'image/jpeg' }),
        new File(['content'], 'test.png', { type: 'image/png' }),
        new File(['content'], 'test.exe', { type: 'application/x-msdownload' }),
        new File(['content'], 'test.zip', { type: 'application/zip' }),
      ];

      unsupportedFiles.forEach(file => {
        expect(isFileTypeSupported(file)).toBe(false);
      });
    });

    it('should handle files without extension', () => {
      const file = new File(['content'], 'noextension', { type: 'text/plain' });

      const result = isFileTypeSupported(file);

      expect(typeof result).toBe('boolean');
    });

    it('should be case-insensitive', () => {
      const files = [
        new File(['content'], 'test.TXT', { type: 'text/plain' }),
        new File(['content'], 'test.Docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        new File(['content'], 'test.PDF', { type: 'application/pdf' }),
      ];

      files.forEach(file => {
        expect(isFileTypeSupported(file)).toBe(true);
      });
    });
  });

  describe('getMaxFileSize', () => {
    it('should return a number', () => {
      const maxSize = getMaxFileSize();

      expect(typeof maxSize).toBe('number');
    });

    it('should return positive value', () => {
      const maxSize = getMaxFileSize();

      expect(maxSize).toBeGreaterThan(0);
    });

    it('should be reasonable limit (10MB or similar)', () => {
      const maxSize = getMaxFileSize();
      const tenMB = 10 * 1024 * 1024;

      expect(maxSize).toBeLessThanOrEqual(tenMB);
      expect(maxSize).toBeGreaterThanOrEqual(1024 * 1024); // At least 1MB
    });
  });
});
