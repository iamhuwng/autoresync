/**
 * Shared Parser Types
 * 
 * Central type definitions for all parsers in the system.
 * Ensures consistent interfaces across listening, reading, quiz, and fallback parsers.
 * 
 * @module parser.types
 * @version 1.0.0
 * @date November 27, 2025
 */

import type { ParsedQuestion, Passage } from '../../../types/document.types';

// ═══════════════════════════════════════════════════════════════
// PARSER IDENTIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Parser type identifier
 * Used to track which parser handled a request
 */
export type ParserType = 'listening' | 'reading' | 'quiz' | 'fallback';

/**
 * Skill type for routing decisions
 */
export type SkillType = 'listening' | 'reading' | 'writing' | 'speaking' | 'quiz' | 'unknown';

/**
 * Test format hints for parser selection
 */
export type TestFormat = 'IELTS' | 'TOEFL' | 'Cambridge' | 'Custom' | 'unknown';

// ═══════════════════════════════════════════════════════════════
// PROGRESS TRACKING
// ═══════════════════════════════════════════════════════════════

/**
 * Progress callback signature
 * Used by all parsers for progress reporting
 */
export type ProgressCallback = (stage: string, progress: number) => void;

/**
 * Detailed progress information
 */
export interface ParserProgress {
  /** Current stage description */
  stage: string;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Optional detailed message */
  message?: string;
  /** Timestamp */
  timestamp?: number;
}

// ═══════════════════════════════════════════════════════════════
// BASE PARSE RESULT
// ═══════════════════════════════════════════════════════════════

/**
 * Base parse result structure
 * All parser results extend this interface
 */
export interface BaseParseResult {
  /** Parsed questions */
  questions: ParsedQuestion[];
  /** Parsed passages */
  passages: Passage[];
  /** Confidence score (0-100) */
  confidence: number;
  /** Parser diagnostics */
  diagnostics: ParserDiagnostics;
  /** Which parser handled this request */
  parserUsed: ParserType;
}

/**
 * Diagnostics information for debugging
 */
export interface ParserDiagnostics {
  /** Extraction method used */
  extractionMethod: 'hybrid' | 'rule-based' | 'ai-only' | 'fallback';
  /** AI task complexity (low = better) */
  aiTaskComplexity?: 'low' | 'medium' | 'high';
  /** Type detection method */
  typeDetectionMethod: 'rule-based' | 'ai-assisted';
  /** Number of questions detected */
  questionsDetected: number;
  /** Number of passages detected */
  passagesDetected: number;
  /** Parse duration in milliseconds */
  parseDurationMs?: number;
  /** Any warnings during parsing */
  warnings?: string[];
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED PARSE RESULT
// ═══════════════════════════════════════════════════════════════

/**
 * Unified parse result for router
 * Includes optional sections for listening tests
 */
export interface UnifiedParseResult extends BaseParseResult {
  /** Sections (for listening tests) */
  sections?: ParsedSection[];
  /** Total question count */
  totalQuestions: number;
  /** Overall parse confidence */
  parseConfidence: number;
  /** Validation results (for IELTS tests) */
  validation?: ValidationResult;
}

/**
 * Parsed section structure (for listening tests)
 */
export interface ParsedSection {
  /** Section number (1-4 for IELTS) */
  sectionNumber: number;
  /** Question range */
  questionRange: { start: number; end: number };
  /** Section instructions */
  instructions: string;
  /** Section type */
  type: string;
  /** Word limit if applicable */
  wordLimit?: string;
  /** Raw text of section */
  rawText: string;
}

/**
 * Validation result structure
 */
export interface ValidationResult {
  /** Whether content is valid */
  isValid: boolean;
  /** Warnings (non-blocking) */
  warnings: string[];
  /** Errors (blocking) */
  errors: string[];
  /** Format detected */
  format?: string;
}

// ═══════════════════════════════════════════════════════════════
// PARSER OPTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Base parse options
 * All parser options extend this interface
 */
export interface BaseParseOptions {
  /** Progress callback */
  onProgress?: ProgressCallback;
}

/**
 * Router-level parse options
 */
export interface ParseOptions extends BaseParseOptions {
  /** Skill type for routing */
  skill: SkillType;
  /** Test format hint */
  format?: TestFormat;
  /** Force specific parser */
  forceParser?: ParserType | 'auto';
}

// ═══════════════════════════════════════════════════════════════
// PARSER INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Standard parser interface
 * All parsers should implement this interface
 */
export interface IParser<TOptions extends BaseParseOptions, TResult extends BaseParseResult> {
  /**
   * Parse text content
   * @param text - Raw text to parse
   * @param options - Parser-specific options
   * @returns Parse result wrapped in Result type
   */
  parse(text: string, options?: TOptions): Promise<import('../../../types/result.types').Result<TResult>>;
  
  /**
   * Check if this parser can handle the given text
   * @param text - Raw text to check
   * @returns Whether parser can handle and confidence level
   */
  canHandle(text: string): CanHandleResult;
}

/**
 * Result of canHandle check
 */
export interface CanHandleResult {
  /** Whether this parser can handle the content */
  canHandle: boolean;
  /** Confidence level (0-100) */
  confidence: number;
  /** Optional reason */
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════
// QUESTION TYPE CONSTANTS
// ═══════════════════════════════════════════════════════════════

/**
 * Standard question types supported by the system
 */
export const QUESTION_TYPES = [
  'multiple-choice',
  'multiple-select',
  'true-false-not-given',
  'yes-no-not-given',
  'matching',
  'completion',
  'short-answer',
  'diagram-labeling',
] as const;

/**
 * Standard question type
 */
export type StandardQuestionType = typeof QUESTION_TYPES[number];

// ═══════════════════════════════════════════════════════════════
// PARSER CHAIN
// ═══════════════════════════════════════════════════════════════

/**
 * Parser priority for routing
 */
export interface ParserPriority {
  /** Parser type */
  parser: ParserType;
  /** Priority (higher = try first) */
  priority: number;
  /** Skill types this parser handles */
  skills: SkillType[];
}

/**
 * Default parser priorities
 */
export const DEFAULT_PARSER_PRIORITIES: ParserPriority[] = [
  { parser: 'listening', priority: 100, skills: ['listening'] },
  { parser: 'reading', priority: 90, skills: ['reading'] },
  { parser: 'quiz', priority: 80, skills: ['quiz', 'unknown'] },
  { parser: 'fallback', priority: 0, skills: ['listening', 'reading', 'writing', 'speaking', 'quiz', 'unknown'] },
];
