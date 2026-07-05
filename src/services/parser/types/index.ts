// @ts-nocheck
/**
 * Parser Types - Barrel Export
 * 
 * Single entry point for all parser type definitions.
 * 
 * Usage:
 * ```typescript
 * import { ParserType, IELTSTaskType, UnifiedParseResult } from '../types';
 * ```
 * 
 * @module parser/types
 * @version 1.0.0
 * @date November 27, 2025
 */

// ═══════════════════════════════════════════════════════════════
// SHARED PARSER TYPES
// ═══════════════════════════════════════════════════════════════

export {
  // Parser identification
  type ParserType,
  type SkillType,
  type TestFormat,
  
  // Progress tracking
  type ProgressCallback,
  type ParserProgress,
  
  // Parse results
  type BaseParseResult,
  type ParserDiagnostics,
  type UnifiedParseResult,
  type ParsedSection,
  type ValidationResult,
  
  // Parse options
  type BaseParseOptions,
  type ParseOptions,
  
  // Parser interface
  type IParser,
  type CanHandleResult,
  
  // Question types
  QUESTION_TYPES,
  type StandardQuestionType,
  
  // Parser chain
  type ParserPriority,
  DEFAULT_PARSER_PRIORITIES,
} from './parser.types';

// ═══════════════════════════════════════════════════════════════
// IELTS-SPECIFIC TYPES
// ═══════════════════════════════════════════════════════════════

export {
  // Skills & formats
  type IELTSSkill,
  type IELTSTestFormat,
  type IELTSModule,
  
  // Section structures
  type IELTSListeningSection,
  type IELTSListeningContext,
  type IELTSReadingPassage,
  
  // Task types (all 16)
  type IELTSTaskType,
  type IELTSTaskCategory,
  TASK_TYPE_CATEGORIES,
  TASK_TYPE_PATTERNS,
  
  // Validation
  type IELTSValidationConfig,
  type IELTSReadingValidation,
  type IELTSListeningValidation,
  
  // Word limits
  type IELTSWordLimit,
  WORD_LIMIT_PATTERNS,
  
  // Question metadata
  type IELTSQuestionMetadata,
  
  // Answer key
  type IELTSAnswer,
  type IELTSAnswerKey,
} from './ielts.types';
