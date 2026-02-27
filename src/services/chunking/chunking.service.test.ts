import { describe, it, expect } from 'vitest';
import { chunkingService } from './chunking.service';

describe('Chunking Service', () => {
  describe('needsChunking', () => {
    it('should return false for short text', () => {
      const shortText = 'This is a short text with few words.';
      
      expect(chunkingService.needsChunking(shortText)).toBe(false);
    });

    it('should return true for long text', () => {
      const longText = 'word '.repeat(2000);
      
      expect(chunkingService.needsChunking(longText)).toBe(true);
    });

    it('should handle empty text', () => {
      expect(chunkingService.needsChunking('')).toBe(false);
    });
  });

  describe('chunkDocument', () => {
    it('should split long text into chunks', () => {
      const longText = 'word '.repeat(2000);
      
      const chunks = chunkingService.chunk(longText);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('id');
        expect(chunk).toHaveProperty('number');
        expect(chunk).toHaveProperty('text');
        expect(chunk).toHaveProperty('wordCount');
      });
    });

    it('should preserve paragraph boundaries', () => {
      const text = `
Paragraph 1 with some content.

Paragraph 2 with more content.

Paragraph 3 with even more content.
      `.repeat(50);

      const chunks = chunkingService.chunk(text);

      // Only check if we got chunks
      if (chunks.length > 0) {
        chunks.forEach(chunk => {
          const hasCompleteParagraphs = !chunk.text.startsWith(' ') || chunk.number === 1;
          expect(hasCompleteParagraphs).toBe(true);
        });
      }
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should set isLast flag correctly', () => {
      const longText = 'word '.repeat(2000);
      
      const chunks = chunkingService.chunk(longText);
      
      expect(chunks.length).toBeGreaterThan(0);
      
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk).toBeDefined();
      expect(lastChunk.isLast).toBe(true);

      // Only check non-last chunks if there are more than one
      if (chunks.length > 1) {
        chunks.slice(0, -1).forEach(chunk => {
          expect(chunk.isLast).toBe(false);
        });
      }
    });

    it('should number chunks sequentially', () => {
      const longText = 'word '.repeat(2000);
      
      const chunks = chunkingService.chunk(longText);

      chunks.forEach((chunk, index) => {
        expect(chunk.number).toBe(index + 1);
      });
    });

    it('should include word count', () => {
      const text = 'one two three four five';
      
      const chunks = chunkingService.chunk(text);

      expect(chunks[0].wordCount).toBe(5);
    });

    it('should handle single chunk for short text', () => {
      const shortText = 'This is short.';
      
      const chunks = chunkingService.chunk(shortText);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].isLast).toBe(true);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for text', () => {
      const text = 'This is a test sentence with some words.';
      
      const tokens = chunkingService.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(text.length);
    });

    it('should return 0 for empty text', () => {
      expect(chunkingService.estimateTokens('')).toBe(0);
    });

    it('should estimate more tokens for longer text', () => {
      const shortText = 'Short';
      const longText = 'This is a much longer text with many more words.';

      const shortTokens = chunkingService.estimateTokens(shortText);
      const longTokens = chunkingService.estimateTokens(longText);

      expect(longTokens).toBeGreaterThan(shortTokens);
    });
  });
});
