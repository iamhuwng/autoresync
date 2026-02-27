import type { Chunk } from '../../types/document.types';
import type { Result } from '../../types/result.types';

/**
 * AI-detected passage
 */
export interface AIPassage {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'image' | 'both';
  imageUrl?: string | null;
  questionStart: number | null;
  questionEnd: number | null;
  wordCount: number | null;
}

/**
 * AI-parsed question
 */
export interface AIQuestion {
  questionNumber: number;
  questionText: string;
  type: string;
  options?: string[] | null;
  answer: string | string[];
  passageId?: string | null;
  confidence: number;

  // Section instruction text for question groups (e.g., "Do the following statements agree with the information given in Reading Passage 1?")
  // Critical for accurate type classification by the rule-based classifier
  sectionInstruction?: string | null;

  // IELTS context structure (nullable to handle AI responses)
  // Can be: string (e.g., "Questions 1-6"), object, null, or undefined
  context?: string | {
    sectionHeading?: string | null;
    subsectionLabel?: string | null;
    contextLines?: string[] | null;
    currentLineIndex?: number | null;
  } | null;

  // Original AI answer (before answer key override)
  originalAIAnswer?: string | string[] | null;
}

/**
 * AI parse result
 */
export interface AIParseResult {
  passages: AIPassage[];
  questions: AIQuestion[];
  answerKey: Record<number, string | string[]>;
  confidence: number;
}

/**
 * Provider status
 */
export interface ProviderStatus {
  name: 'gemini' | 'groq';
  available: boolean;
  lastError: string | null;
  requestCount: number;
  lastRequestTime: number | null;
}

/**
 * Passages-only result (2-call split parsing - Call 1)
 */
export interface AIPassagesOnlyResult {
  passages: AIPassage[];
  confidence: number;
}

/**
 * Questions+Answers result (2-call split parsing - Call 2)
 */
export interface AIQuestionsAndAnswersResult {
  questions: AIQuestion[];
  answerKey: Record<number, string | string[]>;
  confidence: number;
}

/**
 * AI Service interface
 * All providers must implement this
 */
export interface IAIService {
  /**
   * Parse a chunk of text (combined passages + questions + answers)
   */
  parseChunk(chunk: Chunk): Promise<Result<AIParseResult>>;

  /**
   * Parse passages only (2-call split parsing - Call 1)
   */
  parsePassagesOnly(text: string): Promise<Result<AIPassagesOnlyResult>>;

  /**
   * Parse questions and answers (2-call split parsing - Call 2)
   */
  parseQuestionsAndAnswers(text: string): Promise<Result<AIQuestionsAndAnswersResult>>;

  /**
   * Get provider status
   */
  getStatus(): ProviderStatus;

  /**
   * Test connection
   */
  testConnection(): Promise<Result>;

  /**
   * Reset error state
   */
  reset(): void;

  /**
   * Grade a writing answer (Phase 2 — Task 6.1)
   */
  gradeWritingAnswer(
    studentAnswer: string,
    modelAnswers: string[],
    originalSentence: string,
    context?: { sentenceStarter?: string; keyword?: string }
  ): Promise<Result<{ score: number; confidence: number; feedback: string }>>;

  /**
   * Suggest alternative correct answers for fill-in or writing questions (Phase 2 — Task 6.6)
   */
  suggestAlternativeAnswers(
    originalSentence: string,
    existingAnswers: string[],
    questionType: 'fill-in' | 'writing',
    context?: { sentenceStarter?: string; keyword?: string }
  ): Promise<Result<Array<{ answer: string; confidence: number }>>>;
}
