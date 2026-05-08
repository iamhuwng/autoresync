import type { Chunk } from '../../types/document.types';

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 50;

/**
 * Basic Chunking Service (AI-Only)
 * Simple word-count based chunking without pattern detection
 * AI will handle semantic boundaries during parsing
 */
class BasicChunkingService {
  private readonly chunkSize: number;
  private readonly overlap: number;

  constructor() {
    this.chunkSize = DEFAULT_CHUNK_SIZE;
    this.overlap = DEFAULT_CHUNK_OVERLAP;
  }

  /**
   * Chunk text by word count (no pattern detection)
   * AI will intelligently handle boundaries during parsing
   */
  chunk(text: string): Chunk[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    if (words.length === 0) {
      return [];
    }

    // If document is small enough, return as single chunk
    if (words.length <= this.chunkSize) {
      return [{
        id: 'chunk-1',
        number: 1,
        text: words.join(' '),
        wordCount: words.length,
        startIndex: 0,
        endIndex: words.length,
        isLast: true,
      }];
    }

    const chunks: Chunk[] = [];
    let startIndex = 0;
    let chunkNumber = 1;

    while (startIndex < words.length) {
      // Calculate end index
      const endIndex = Math.min(startIndex + this.chunkSize, words.length);
      
      // Extract chunk text
      const chunkWords = words.slice(startIndex, endIndex);
      const chunkText = chunkWords.join(' ');

      chunks.push({
        id: `chunk-${chunkNumber}`,
        number: chunkNumber,
        text: chunkText,
        wordCount: chunkWords.length,
        startIndex,
        endIndex,
        isLast: endIndex >= words.length,
      });
      
      // Move to next chunk with overlap
      startIndex = endIndex - this.overlap;
      
      // Safety: ensure forward progress
      if (startIndex >= endIndex) {
        startIndex = endIndex;
      }
      
      chunkNumber++;

      // Safety: prevent infinite loop
      if (chunkNumber > 500) {
        console.error('⚠️ Exceeded max chunk count (500), stopping');
        break;
      }
    }

    return chunks;
  }

  /**
   * Check if text needs chunking
   */
  needsChunking(text: string): boolean {
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    return wordCount > this.chunkSize;
  }

  /**
   * Estimate token count
   */
  estimateTokens(text: string): number {
    const words = text.split(/\s+/).filter((w) => w.length > 0).length;
    return Math.ceil(words * 1.3);
  }

  /**
   * Get chunk summary
   */
  getSummary(text: string): { chunkCount: number; totalWords: number; estimatedTokens: number } {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const totalWords = words.length;
    
    if (totalWords <= this.chunkSize) {
      return {
        chunkCount: 1,
        totalWords,
        estimatedTokens: this.estimateTokens(text),
      };
    }

    // Estimate chunk count
    const effectiveChunkSize = this.chunkSize - this.overlap;
    const chunkCount = Math.ceil((totalWords - this.chunkSize) / effectiveChunkSize) + 1;

    return {
      chunkCount,
      totalWords,
      estimatedTokens: this.estimateTokens(text),
    };
  }
}

/**
 * Singleton instance
 */
export const basicChunkingService = new BasicChunkingService();
