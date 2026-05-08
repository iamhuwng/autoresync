import type { Chunk } from '../../types/document.types';

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 50;

/**
 * Smart boundary detection result
 */
interface BoundaryInfo {
  type: 'passage' | 'question-group' | 'answer-key' | 'section' | 'sentence';
  position: number;
  confidence: number;
  context?: string;
}

/**
 * Smart Chunking Service
 * Understands document structure and splits intelligently
 * Prevents splitting:
 * - Questions from their text
 * - Passages from their questions
 * - Answer keys from question numbers
 * - Section headers from their content
 */
class SmartChunkingService {
  private readonly chunkSize: number;
  private readonly overlap: number;
  private readonly minChunkSize: number;

  constructor() {
    this.chunkSize = DEFAULT_CHUNK_SIZE;
    this.overlap = DEFAULT_CHUNK_OVERLAP;
    this.minChunkSize = Math.floor(this.chunkSize * 0.3); // 30% minimum
  }

  /**
   * Chunk text with structural awareness
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
      // Calculate target end index
      const targetEndIndex = Math.min(startIndex + this.chunkSize, words.length);
      
      // Find smart boundary near target
      const smartEndIndex = this.findSmartBoundary(
        words,
        startIndex,
        targetEndIndex
      );
      
      // Extract chunk text
      const chunkWords = words.slice(startIndex, smartEndIndex);
      const chunkText = chunkWords.join(' ');
      const actualWordCount = chunkWords.length;

      // Safety: ensure minimum progress
      if (actualWordCount < this.minChunkSize && smartEndIndex < words.length) {
        console.warn(`⚠️ Chunk ${chunkNumber} too small (${actualWordCount} words), extending...`);
        const extendedEndIndex = Math.min(startIndex + this.minChunkSize, words.length);
        const extendedWords = words.slice(startIndex, extendedEndIndex);
        
        chunks.push({
          id: `chunk-${chunkNumber}`,
          number: chunkNumber,
          text: extendedWords.join(' '),
          wordCount: extendedWords.length,
          startIndex,
          endIndex: extendedEndIndex,
          isLast: extendedEndIndex >= words.length,
        });
        
        startIndex = extendedEndIndex - this.overlap;
      } else {
        chunks.push({
          id: `chunk-${chunkNumber}`,
          number: chunkNumber,
          text: chunkText,
          wordCount: actualWordCount,
          startIndex,
          endIndex: smartEndIndex,
          isLast: smartEndIndex >= words.length,
        });
        
        // Calculate next start with overlap
        startIndex = smartEndIndex - this.overlap;
      }
      
      // Safety: ensure forward progress
      if (startIndex >= smartEndIndex) {
        console.warn(`⚠️ No progress at chunk ${chunkNumber}, forcing advance`);
        startIndex = smartEndIndex;
      }
      
      chunkNumber++;

      // Safety: prevent infinite loop
      if (chunkNumber > 500) {
        console.error('⚠️ Exceeded max chunk count (500), stopping');
        break;
      }
    }

    return this.deduplicateQuestions(chunks);
  }

  /**
   * Find smart boundary that respects document structure
   */
  private findSmartBoundary(
    words: string[],
    startIndex: number,
    targetEndIndex: number
  ): number {
    // Search window: ±10% of chunk size around target
    const searchWindow = Math.floor(this.chunkSize * 0.1);
    const searchStart = Math.max(startIndex, targetEndIndex - searchWindow);
    const searchEnd = Math.min(words.length, targetEndIndex + searchWindow);
    
    const boundaries: BoundaryInfo[] = [];
    
    // Reconstruct text in search window
    const searchText = words.slice(searchStart, searchEnd).join(' ');
    
    // Detect boundaries (ordered by priority)
    this.detectPassageBoundaries(searchText, searchStart, boundaries);
    this.detectQuestionGroupBoundaries(searchText, searchStart, boundaries);
    this.detectSectionBoundaries(searchText, searchStart, boundaries);
    this.detectSentenceBoundaries(searchText, searchStart, boundaries);
    
    // Find best boundary closest to target
    if (boundaries.length > 0) {
      boundaries.sort((a, b) => {
        // First sort by confidence (higher is better)
        if (Math.abs(b.confidence - a.confidence) > 0.1) {
          return b.confidence - a.confidence;
        }
        // Then by distance to target (closer is better)
        const distA = Math.abs(a.position - targetEndIndex);
        const distB = Math.abs(b.position - targetEndIndex);
        return distA - distB;
      });
      
      const bestBoundary = boundaries[0];
      if (bestBoundary) {
        return Math.min(bestBoundary.position, words.length);
      }
    }
    
    // Fallback: use target index
    return targetEndIndex;
  }

  /**
   * Detect passage boundaries (highest priority)
   * Patterns: "Reading Passage 1", "PASSAGE A", "Text:", etc.
   */
  private detectPassageBoundaries(
    text: string,
    offset: number,
    boundaries: BoundaryInfo[]
  ): void {
    const patterns = [
      /\b(Reading\s+)?Passage\s+[A-Z0-9]+/gi,
      /\bPASSAGE\s+[A-Z0-9]+/g,
      /\bText\s+[A-Z0-9]+:/gi,
      /\n\s*\n[A-Z][A-Z\s]{10,}\n/g, // All-caps titles
    ];
    
    patterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        if (match.index !== undefined) {
          const wordOffset = text.substring(0, match.index).split(/\s+/).length;
          boundaries.push({
            type: 'passage',
            position: offset + wordOffset,
            confidence: 0.95,
            context: match[0],
          });
        }
      });
    });
  }

  /**
   * Detect question group boundaries (high priority)
   * Patterns: "Questions 1-5", "Q1-Q5", numbered lists
   */
  private detectQuestionGroupBoundaries(
    text: string,
    offset: number,
    boundaries: BoundaryInfo[]
  ): void {
    const patterns = [
      /\bQuestions?\s+\d+[-–]\d+/gi,
      /\bQ\d+[-–]Q?\d+/gi,
      /^\s*\d+\.\s+/gm, // Numbered questions at line start
    ];
    
    patterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        if (match.index !== undefined) {
          const wordOffset = text.substring(0, match.index).split(/\s+/).length;
          boundaries.push({
            type: 'question-group',
            position: offset + wordOffset,
            confidence: 0.85,
            context: match[0],
          });
        }
      });
    });
  }

  /**
   * Detect section boundaries (medium priority)
   * Patterns: "Answer Key", "SECTION A", markdown headers
   */
  private detectSectionBoundaries(
    text: string,
    offset: number,
    boundaries: BoundaryInfo[]
  ): void {
    const patterns = [
      /\bAnswer\s+Key/gi,
      /\bSECTION\s+[A-Z0-9]+/g,
      /^#{1,3}\s+.+$/gm, // Markdown headers
      /\n\s*\n[A-Z][^.!?\n]{5,50}\n/g, // Short capitalized lines (likely headers)
    ];
    
    patterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        if (match.index !== undefined) {
          const wordOffset = text.substring(0, match.index).split(/\s+/).length;
          boundaries.push({
            type: 'section',
            position: offset + wordOffset,
            confidence: 0.75,
            context: match[0],
          });
        }
      });
    });
  }

  /**
   * Detect sentence boundaries (low priority, fallback)
   */
  private detectSentenceBoundaries(
    text: string,
    offset: number,
    boundaries: BoundaryInfo[]
  ): void {
    const pattern = /[.!?]\s+/g;
    const matches = [...text.matchAll(pattern)];
    
    matches.forEach(match => {
      if (match.index !== undefined && match[0]) {
        const position = match.index + match[0].length;
        const wordOffset = text.substring(0, position).split(/\s+/).length;
        boundaries.push({
          type: 'sentence',
          position: offset + wordOffset,
          confidence: 0.5,
        });
      }
    });
  }

  /**
   * Remove duplicate questions from overlapping chunks
   * Questions are identified by number patterns: "1.", "Q1", etc.
   */
  private deduplicateQuestions(chunks: Chunk[]): Chunk[] {
    const seenQuestions = new Set<string>();
    
    return chunks.map(chunk => {
      const lines = chunk.text.split('\n');
      const dedupedLines: string[] = [];
      
      for (const line of lines) {
        // Extract question number if present
        const questionMatch = line.match(/^\s*(?:Q|Question)?\s*(\d+)[\.\):\s]/i);
        
        if (questionMatch) {
          const questionNum = questionMatch[1];
          const questionKey = `q${questionNum}`;
          
          if (seenQuestions.has(questionKey)) {
            // Skip duplicate question
            console.log(`Skipping duplicate Q${questionNum} in chunk ${chunk.id}`);
            continue;
          }
          
          seenQuestions.add(questionKey);
        }
        
        dedupedLines.push(line);
      }
      
      const dedupedText = dedupedLines.join('\n');
      const dedupedWordCount = dedupedText.split(/\s+/).filter(w => w.length > 0).length;
      
      return {
        ...chunk,
        text: dedupedText,
        wordCount: dedupedWordCount,
      };
    });
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
}

/**
 * Singleton instance
 */
export const smartChunkingService = new SmartChunkingService();
