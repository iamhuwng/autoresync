import { describe, it, expect, beforeEach } from 'vitest';
import { 
  readAsText, 
  readAsArrayBuffer, 
  readAsDataURL, 
  getFileMetadata, 
  formatFileSize 
} from './fileHelpers';

describe('fileHelpers', () => {
  let mockTextFile;
  let mockBinaryFile;

  beforeEach(() => {
    // Create mock text file
    mockTextFile = new File(['Hello, World!'], 'test.txt', { type: 'text/plain' });
    
    // Create mock binary file
    const binaryData = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello" in bytes
    mockBinaryFile = new File([binaryData], 'test.bin', { type: 'application/octet-stream' });
  });

  describe('readAsText', () => {
    it('should read a text file correctly', async () => {
      const content = await readAsText(mockTextFile);
      expect(content).toBe('Hello, World!');
    });

    it('should handle empty files', async () => {
      const emptyFile = new File([''], 'empty.txt', { type: 'text/plain' });
      const content = await readAsText(emptyFile);
      expect(content).toBe('');
    });

    it('should reject on error', async () => {
      // Create a file that will cause an error (null file)
      const invalidFile = null;
      await expect(readAsText(invalidFile)).rejects.toThrow();
    });
  });

  describe('readAsArrayBuffer', () => {
    it('should read a file as ArrayBuffer', async () => {
      const buffer = await readAsArrayBuffer(mockBinaryFile);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(5);
    });

    it('should handle text files as ArrayBuffer', async () => {
      const buffer = await readAsArrayBuffer(mockTextFile);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(13); // "Hello, World!" is 13 bytes
    });

    it('should reject on error', async () => {
      const invalidFile = null;
      await expect(readAsArrayBuffer(invalidFile)).rejects.toThrow();
    });
  });

  describe('readAsDataURL', () => {
    it('should read a file as Data URL', async () => {
      const dataURL = await readAsDataURL(mockTextFile);
      expect(dataURL).toMatch(/^data:text\/plain;base64,/);
    });

    it('should handle binary files as Data URL', async () => {
      const dataURL = await readAsDataURL(mockBinaryFile);
      expect(dataURL).toMatch(/^data:application\/octet-stream;base64,/);
    });

    it('should reject on error', async () => {
      const invalidFile = null;
      await expect(readAsDataURL(invalidFile)).rejects.toThrow();
    });
  });

  describe('getFileMetadata', () => {
    it('should return correct file metadata', () => {
      const metadata = getFileMetadata(mockTextFile);
      
      expect(metadata.name).toBe('test.txt');
      expect(metadata.type).toBe('text/plain');
      expect(metadata.size).toBe(13);
      expect(metadata.sizeInKB).toBe('0.01');
      expect(metadata.sizeInMB).toBe('0.00');
      expect(metadata.lastModified).toBeDefined();
      expect(metadata.lastModifiedDate).toBeInstanceOf(Date);
    });

    it('should handle files with no type', () => {
      const fileNoType = new File(['test'], 'test.unknown');
      const metadata = getFileMetadata(fileNoType);
      
      expect(metadata.name).toBe('test.unknown');
      expect(metadata.type).toBe('');
    });

    it('should calculate size correctly for larger files', () => {
      // Create a 1MB file
      const largeData = new Uint8Array(1024 * 1024); // 1MB
      const largeFile = new File([largeData], 'large.bin');
      const metadata = getFileMetadata(largeFile);
      
      expect(metadata.sizeInMB).toBe('1.00');
      expect(metadata.sizeInKB).toBe('1024.00');
    });
  });

  describe('formatFileSize', () => {
    it('should format 0 bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 Bytes');
      expect(formatFileSize(1023)).toBe('1023 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should round to 2 decimal places', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1234567)).toBe('1.18 MB');
    });
  });
});
