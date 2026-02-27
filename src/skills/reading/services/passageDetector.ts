/**
 * Passage Detector Service
 * Reading-specific service for identifying and extracting passages from quiz text
 * 
 * Converted from passageDetector.js to TypeScript (Phase 2 Step 2.5)
 * Moved from src/utils/parsers/ to src/skills/reading/services/
 */

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export interface DetectedPassage {
  title: string;
  content: string;
  wordCount: number;
  type: 'marked' | 'unmarked';
  startLine?: number;
  endLine?: number;
  confidence?: number;
  id?: string;
}

export interface Question {
  number: number;
  passageId?: number;
  [key: string]: any;
}

// ═══════════════════════════════════════════════════════════════
// MAIN DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Detect passages in text by length and markers
 * @param text - The full quiz text
 * @returns Array of detected passages with metadata
 */
export const detectPassages = (text: string): DetectedPassage[] => {
  const passages: DetectedPassage[] = [];
  const lines = text.split('\n');
  
  // Look for explicit passage markers
  const passageMarkers = [
    /^Passage:\s*(.+)$/i,
    /^Reading:\s*(.+)$/i,
    /^Text:\s*(.+)$/i,
    /^Passage\s+\d+:\s*(.+)$/i,
    /^Reading\s+\d+:\s*(.+)$/i
  ];

  let currentPassage: Partial<DetectedPassage> | null = null;
  let passageLines: string[] = [];
  let inPassage = false;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || '').trim();
    
    // Check for passage markers
    for (const marker of passageMarkers) {
      const match = line.match(marker);
      if (match) {
        // Save previous passage if exists
        if (currentPassage && passageLines.length > 0) {
          passages.push({
            title: currentPassage.title || `Passage ${passages.length + 1}`,
            content: passageLines.join('\n').trim(),
            wordCount: countWords(passageLines.join(' ')),
            type: 'marked',
            startLine: currentPassage.startLine,
          });
        }
        
        // Start new passage
        currentPassage = {
          title: match[1] || `Passage ${passages.length + 1}`,
          startLine: i,
          type: 'marked'
        };
        passageLines = [];
        inPassage = true;
        continue;
      }
    }

    // Check if line starts a question (end of passage)
    const questionPattern = /^(\d+[\.\):]|Question\s+\d+|Q\d+)/i;
    if (questionPattern.test(line) && inPassage) {
      // Save current passage
      if (currentPassage && passageLines.length > 0) {
        passages.push({
          title: currentPassage.title || `Passage ${passages.length + 1}`,
          content: passageLines.join('\n').trim(),
          wordCount: countWords(passageLines.join(' ')),
          type: 'marked',
          startLine: currentPassage.startLine || 0,
          endLine: i - 1
        });
      }
      inPassage = false;
      currentPassage = null;
      passageLines = [];
      continue;
    }

    // Add line to current passage
    if (inPassage && line.length > 0) {
      passageLines.push(line);
    }
  }

  // Save last passage if exists
  if (currentPassage && passageLines.length > 0) {
    passages.push({
      title: currentPassage.title || `Passage ${passages.length + 1}`,
      content: passageLines.join('\n').trim(),
      wordCount: countWords(passageLines.join(' ')),
      type: 'marked',
      startLine: currentPassage.startLine,
      endLine: lines.length - 1
    });
  }

  // Detect unmarked passages by length (>100 words)
  const unmarkedPassages = detectUnmarkedPassages(text);
  passages.push(...unmarkedPassages);

  return passages;
};

/**
 * Detect unmarked passages by analyzing text blocks
 * @param text - The full quiz text
 * @returns Array of detected unmarked passages
 */
const detectUnmarkedPassages = (text: string): DetectedPassage[] => {
  const passages: DetectedPassage[] = [];
  const paragraphs = text.split(/\n\n+/);
  
  const questionPattern = /^(\d+[\.\):]|Question\s+\d+|Q\d+)/i;
  const titlePattern = /^(Title|Quiz):/i;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = (paragraphs[i] || '').trim();
    
    // Skip if it's a question or title
    if (questionPattern.test(paragraph) || titlePattern.test(paragraph)) {
      continue;
    }

    const wordCount = countWords(paragraph);
    
    // Consider it a passage if it has more than 100 words
    if (wordCount > 100) {
      passages.push({
        title: `Passage ${passages.length + 1}`,
        content: paragraph,
        wordCount: wordCount,
        type: 'unmarked',
        confidence: wordCount > 200 ? 90 : 70
      });
    }
  }

  return passages;
};

/**
 * Count words in a text string
 * @param text - Text to count words in
 * @returns Number of words
 */
const countWords = (text: string): number => {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

/**
 * Associate passages with questions based on proximity
 * @param passages - Array of detected passages
 * @param questions - Array of parsed questions
 * @returns Questions with associated passage IDs
 */
export const associatePassagesWithQuestions = <T extends Question>(
  passages: DetectedPassage[],
  questions: T[]
): T[] => {
  if (!passages || passages.length === 0) {
    return questions;
  }

  return questions.map((question, index) => {
    // Simple heuristic: associate with the most recent passage
    // In a real implementation, this would be more sophisticated
    const associatedPassage = passages.find(p => 
      p.endLine !== undefined && p.endLine !== null && index >= p.endLine
    ) || null;

    if (associatedPassage) {
      return {
        ...question,
        passageId: passages.indexOf(associatedPassage)
      };
    }

    return question;
  });
};

/**
 * Extract passage by ID
 * @param passages - Array of passages
 * @param passageId - ID of passage to extract
 * @returns Passage object or null if not found
 */
export const getPassageById = (
  passages: DetectedPassage[],
  passageId: number
): DetectedPassage | null => {
  if (!passages || passageId < 0 || passageId >= passages.length) {
    return null;
  }
  return passages[passageId] || null;
};

/**
 * Passage Detector Service Class
 * Provides a singleton interface for passage detection
 */
export class PassageDetectorService {
  private static instance: PassageDetectorService;

  private constructor() {}

  static getInstance(): PassageDetectorService {
    if (!PassageDetectorService.instance) {
      PassageDetectorService.instance = new PassageDetectorService();
    }
    return PassageDetectorService.instance;
  }

  /**
   * Detect all passages in text
   */
  detect(text: string): DetectedPassage[] {
    return detectPassages(text);
  }

  /**
   * Associate passages with questions
   */
  associate<T extends Question>(passages: DetectedPassage[], questions: T[]): T[] {
    return associatePassagesWithQuestions(passages, questions);
  }

  /**
   * Get passage by ID
   */
  getById(passages: DetectedPassage[], passageId: number): DetectedPassage | null {
    return getPassageById(passages, passageId);
  }

  /**
   * Count words in text
   */
  countWords(text: string): number {
    return countWords(text);
  }
}

// Export singleton instance
export const passageDetectorService = PassageDetectorService.getInstance();
