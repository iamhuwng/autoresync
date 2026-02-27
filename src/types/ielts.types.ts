/**
 * IELTS-Specific Types
 * 
 * Core type definitions for IELTS test formats.
 * Migrated from deprecated `src/services/parser/types/ielts.types.ts`
 * 
 * This file contains ONLY the types needed for:
 * - listening.parser.ts (preserved)
 * - Future IELTS-related services
 * 
 * @module ielts.types
 * @version 2.0.0
 * @date 2026-02-05
 * @see PRD-0020 Task 0.10
 */

// ═══════════════════════════════════════════════════════════════
// IELTS TASK TYPES (ALL 16)
// ═══════════════════════════════════════════════════════════════

/**
 * All 16 IELTS task types
 * Covers both Listening and Reading skills
 * 
 * @example
 * // Completion types (7)
 * const completionTypes: IELTSTaskType[] = [
 *   'sentence-completion',
 *   'summary-completion-text',
 *   'summary-completion-list',
 *   'note-completion',
 *   'table-completion',
 *   'flowchart-completion',
 *   'diagram-labeling'
 * ];
 * 
 * @example
 * // Matching types (4)
 * const matchingTypes: IELTSTaskType[] = [
 *   'matching-headings',
 *   'matching-information',
 *   'matching-features',
 *   'matching-sentence-endings'
 * ];
 */
export type IELTSTaskType =
    // Completion types (7)
    | 'sentence-completion'
    | 'summary-completion-text'   // Write words from text
    | 'summary-completion-list'   // Choose from list
    | 'note-completion'
    | 'table-completion'
    | 'flowchart-completion'
    | 'diagram-labeling'

    // True/False/Yes/No types (2)
    | 'true-false-not-given'
    | 'yes-no-not-given'

    // Matching types (4)
    | 'matching-headings'
    | 'matching-information'
    | 'matching-features'
    | 'matching-sentence-endings'

    // Choice types (2)
    | 'multiple-choice'
    | 'multiple-select'           // Choose multiple answers

    // Short answer (1)
    | 'short-answer';

// ═══════════════════════════════════════════════════════════════
// TASK TYPE CATEGORIES
// ═══════════════════════════════════════════════════════════════

/**
 * Task type categories for grouping
 */
export type IELTSTaskCategory =
    | 'completion'
    | 'true-false'
    | 'matching'
    | 'choice'
    | 'short-answer';

/**
 * Map task types to categories
 */
export const TASK_TYPE_CATEGORIES: Record<IELTSTaskType, IELTSTaskCategory> = {
    'sentence-completion': 'completion',
    'summary-completion-text': 'completion',
    'summary-completion-list': 'completion',
    'note-completion': 'completion',
    'table-completion': 'completion',
    'flowchart-completion': 'completion',
    'diagram-labeling': 'completion',
    'true-false-not-given': 'true-false',
    'yes-no-not-given': 'true-false',
    'matching-headings': 'matching',
    'matching-information': 'matching',
    'matching-features': 'matching',
    'matching-sentence-endings': 'matching',
    'multiple-choice': 'choice',
    'multiple-select': 'choice',
    'short-answer': 'short-answer',
};

// ═══════════════════════════════════════════════════════════════
// SKILL & FORMAT TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * IELTS skill types
 */
export type IELTSSkill = 'listening' | 'reading' | 'writing' | 'speaking';

/**
 * IELTS test format
 */
export type IELTSTestFormat = 'Academic' | 'General Training';
