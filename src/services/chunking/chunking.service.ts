import type { Chunk } from '../../types/document.types';
import { getChunkConfig } from '../../config/env.config';

/**
 * Chunking service interface
 */
export interface IChunkingService {
  chunk(text: string): Chunk[];
  needsChunking(text: string): boolean;
  estimateTokens(text: string): number;
  getSummary(text: string): ChunkSummary;
}

/**
 * Chunk summary metadata
 */
export interface ChunkSummary {
  totalWords: number;
  estimatedTokens: number;
  chunkCount: number;
  needsChunking: boolean;
  chunks: Array<{
    id: string;
    wordCount: number;
    estimatedTokens: number;
  }>;
}

/**
 * Chunking service implementation
 * Splits large documents at sentence boundaries with overlap for context
 */
class ChunkingService implements IChunkingService {
  private readonly chunkSize: number;
  private readonly overlap: number;
  private readonly maxDocumentSize: number;

  constructor() {
    const config = getChunkConfig();
    this.chunkSize = config.chunkSize;
    this.overlap = config.chunkOverlap;
    this.maxDocumentSize = config.maxDocumentSize;
  }

  /**
   * Split text into processable chunks
   * Preserves sentence boundaries and adds overlap for context
   */
  chunk(text: string): Chunk[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    if (words.length === 0) {
      return [];
    }

    const chunks: Chunk[] = [];
    let startIndex = 0;
    let chunkNumber = 1;

    while (startIndex < words.length) {
      const endIndex = Math.min(startIndex + this.chunkSize, words.length);
      const chunkWords = words.slice(startIndex, endIndex);
      const chunkText = chunkWords.join(' ');

      // Find natural break point (sentence boundary)
      const finalText = this.findSentenceBoundary(chunkText) || chunkText;
      const actualWordCount = finalText.split(/\s+/).length;

      // Safety check: Ensure we're making forward progress
      // If actualWordCount is 0 or very small, force minimum progress
      if (actualWordCount === 0) {
        console.error('⚠️ Zero word chunk detected, skipping');
        startIndex += Math.max(1, Math.floor(this.chunkSize / 10)); // Skip ahead
        continue;
      }

      // Move forward with overlap for context
      const actualEndIndex = startIndex + actualWordCount;
      let nextStartIndex = actualEndIndex - this.overlap;
      
      // Safety: Ensure next start is actually moving forward
      // If we're not advancing past the current position, skip overlap
      if (nextStartIndex <= startIndex) {
        console.warn('⚠️ Chunking not making progress, forcing advance');
        nextStartIndex = actualEndIndex; // Skip overlap to force progress
      }

      chunks.push({
        id: `chunk-${chunkNumber}`,
        number: chunkNumber,
        text: finalText,
        wordCount: actualWordCount,
        startIndex,
        endIndex: actualEndIndex,
        isLast: false, // Will be set correctly after loop
      });

      startIndex = nextStartIndex;
      chunkNumber++;

      // Safety: prevent infinite loop (increased to 500 for very large documents)
      if (chunkNumber > 500) {
        console.error('⚠️ Exceeded max chunk count (500), stopping');
        console.error(`Document too large: ${words.length} words would require ${Math.ceil(words.length / this.chunkSize)} chunks`);
        break;
      }
    }

    // Set isLast flag on only the actual last chunk
    if (chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk) {
        lastChunk.isLast = true;
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
   * Estimate token count (rough approximation: 1.3 tokens per word)
   */
  estimateTokens(text: string): number {
    const words = text.split(/\s+/).filter((w) => w.length > 0).length;
    return Math.ceil(words * 1.3);
  }

  /**
   * Get chunk summary for display
   */
  getSummary(text: string): ChunkSummary {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const totalWords = words.length;
    const estimatedTokens = this.estimateTokens(text);
    const chunks = this.chunk(text);

    return {
      totalWords,
      estimatedTokens,
      chunkCount: chunks.length,
      needsChunking: this.needsChunking(text),
      chunks: chunks.map((c) => ({
        id: c.id,
        wordCount: c.wordCount,
        estimatedTokens: this.estimateTokens(c.text),
      })),
    };
  }

  /**
   * Find natural sentence boundary
   * Returns text up to last complete sentence
   */
  private findSentenceBoundary(text: string): string | null {
    // Match sentence endings: . ! ? followed by space or end of string
    const sentencePattern = /[.!?]\s+/g;
    const matches = [...text.matchAll(sentencePattern)];

    if (matches.length === 0) {
      return null;
    }

    // Use last sentence boundary
    const lastMatch = matches[matches.length - 1];
    if (!lastMatch || lastMatch.index === undefined) {
      return null;
    }

    const breakPoint = lastMatch.index + lastMatch[0].length;
    return text.substring(0, breakPoint).trim();
  }
}

/**
 * Singleton instance
 */
export const chunkingService: IChunkingService = new ChunkingService();

/**
 * Export smart chunking service as well
 */
export { smartChunkingService } from './smart-chunking.service';
