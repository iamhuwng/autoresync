/**
 * Unified Question Schema
 * 
 * Comprehensive type definitions for all 16 IELTS Reading question types.
 * This is the single source of truth for question structures in the new system.
 * 
 * @module QuestionSchema
 * @version 1.0.0
 * @date 2026-02-05
 * @see PRD-0020 Phase 1
 */

// ═══════════════════════════════════════════════════════════════
// QUESTION TYPES (ALL 16 IELTS TYPES)
// ═══════════════════════════════════════════════════════════════

/**
 * All 16 IELTS question types
 * This union type is the canonical definition used throughout the system.
 */
export type QuestionType =
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
    | 'multiple-choice'          // Single answer
    | 'multiple-select'          // Multiple answers
    // Short answer (1)
    | 'short-answer';

/**
 * Question type categories for grouping and display logic
 */
export type QuestionCategory =
    | 'completion'
    | 'true-false'
    | 'matching'
    | 'choice'
    | 'short-answer';

/**
 * Map question types to categories
 */
export const QUESTION_TYPE_TO_CATEGORY: Record<QuestionType, QuestionCategory> = {
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

/**
 * Array of all question types for validation and iteration
 */
export const QUESTION_TYPES = [
    'sentence-completion',
    'summary-completion-text',
    'summary-completion-list',
    'note-completion',
    'table-completion',
    'flowchart-completion',
    'diagram-labeling',
    'true-false-not-given',
    'yes-no-not-given',
    'matching-headings',
    'matching-information',
    'matching-features',
    'matching-sentence-endings',
    'multiple-choice',
    'multiple-select',
    'short-answer',
] as const;

// ═══════════════════════════════════════════════════════════════
// DISPLAY HINTS (Task 1.10)
// ═══════════════════════════════════════════════════════════════

/**
 * Option label format for matching and choice questions
 */
export type OptionLabelFormat = 'letter' | 'roman' | 'number';

/**
 * Input type hints for question rendering
 */
export type InputType =
    | 'text'           // Free text input
    | 'dropdown'       // Select from list
    | 'radio'          // Single choice
    | 'checkbox'       // Multiple choice
    | 'drag-drop';     // Matching/ordering

/**
 * Display hints for rendering questions in the UI
 */
export interface DisplayHints {
    /** Input type to render */
    inputType: InputType;
    /** Format for option labels (A,B,C or i,ii,iii or 1,2,3) */
    optionLabelFormat: OptionLabelFormat;
    /** Whether to show word limit indicator */
    showWordLimit: boolean;
    /** Word limit if applicable */
    wordLimit?: number;
    /** Layout hint for grouped questions */
    layout?: 'inline' | 'stacked' | 'table' | 'grid';
}

// ═══════════════════════════════════════════════════════════════
// BASE QUESTION INTERFACE (Task 1.1)
// ═══════════════════════════════════════════════════════════════

/**
 * Answer source tracking for parity checking
 */
export type AnswerSource = 'answer-key' | 'ai-suggestion' | 'manual';

/**
 * Base interface for all question types
 */
export interface BaseQuestion {
    /** Unique identifier */
    id: string;
    /** Question number (1-indexed) */
    questionNumber: number;
    /** Question type */
    type: QuestionType;
    /** Question text/prompt */
    questionText: string;
    /** Correct answer(s) */
    answer: string | string[];
    /** Source of the answer */
    answerSource: AnswerSource;
    /** Original AI-suggested answer before teacher correction */
    originalAIAnswer?: string | string[];
    /** Confidence score from AI (0-100) */
    confidence: number;
    /** Flag for teacher review when classification is uncertain (Task 1.9) */
    uncertain: boolean;
    /** Instructions specific to this question/section */
    instructions?: string;
    /** Display hints for UI rendering (Task 1.10) */
    displayHints: DisplayHints;
    /** Associated passage ID */
    passageId?: string;
    /** Compatibility link to grouped section instructions */
    sectionInstructionId?: string;
    /** Points for this question */
    points: number;
    /** Time limit in seconds (optional) */
    timer?: number;
    /** Creation timestamp */
    createdAt: Date;
    /** Last update timestamp */
    updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// COMPLETION QUESTION TYPES (Task 1.2)
// ═══════════════════════════════════════════════════════════════

/**
 * Completion question subtypes
 */
export type CompletionSubtype =
    | 'sentence-completion'
    | 'summary-completion-text'
    | 'summary-completion-list'
    | 'note-completion'
    | 'table-completion'
    | 'flowchart-completion'
    | 'diagram-labeling';

/**
 * Completion question interface
 * Covers: sentence, summary-text, summary-list, note, table, flowchart, diagram
 */
export interface CompletionQuestion extends BaseQuestion {
    type: CompletionSubtype;
    /** Word limit for answers (e.g., "NO MORE THAN THREE WORDS") */
    wordLimit?: number;
    /** Whether answer must come from the passage */
    answerFromPassage: boolean;
    /** For summary-completion-list: available options to choose from */
    optionsList?: string[];
    /** Context (surrounding text with blanks) */
    context?: {
        /** Text before the blank */
        prefix?: string;
        /** Text after the blank */
        suffix?: string;
        /** Full context line */
        fullLine?: string;
    };
    /** For diagram-labeling: image URL */
    imageUrl?: string;
    /** For diagram-labeling: label positions */
    labels?: Array<{
        id: string;
        answer: string;
        x?: number;
        y?: number;
    }>;
    /** For table/flowchart: structured data */
    structuredData?: {
        rows?: string[][];
        columns?: string[];
        headers?: string[];
    };
}

export interface DerivedTableBlankQuestionRecord extends CompletionQuestion {
    type: 'table-completion';
    groupId: string;
    blankId: string;
    anchorId: string;
    groupTaskType: 'table-completion';
    sectionInstructionId: string;
    acceptableAnswers?: string[];
    tableGroupSchemaVersion: number;
}

// ═══════════════════════════════════════════════════════════════
// TRUE/FALSE QUESTION TYPES (Task 1.3)
// ═══════════════════════════════════════════════════════════════

/**
 * True/False question subtypes
 */
export type TrueFalseSubtype =
    | 'true-false-not-given'
    | 'yes-no-not-given';

/**
 * True/False/Not Given and Yes/No/Not Given question interface
 */
export interface TrueFalseQuestion extends BaseQuestion {
    type: TrueFalseSubtype;
    /** Answer must be exactly one of these */
    answer: 'True' | 'False' | 'Not Given' | 'Yes' | 'No';
    /** The valid options for this question type */
    validOptions: ['True', 'False', 'Not Given'] | ['Yes', 'No', 'Not Given'];
    /** Statement to evaluate */
    statement: string;
}

// ═══════════════════════════════════════════════════════════════
// MATCHING QUESTION TYPES (Task 1.4)
// ═══════════════════════════════════════════════════════════════

/**
 * Matching question subtypes
 */
export type MatchingSubtype =
    | 'matching-headings'
    | 'matching-information'
    | 'matching-features'
    | 'matching-sentence-endings';

/**
 * Matching item (left side)
 */
export interface MatchingItem {
    id: string;
    /** Item number or identifier (e.g., "14", "Section A") */
    identifier: string;
    /** Item text (e.g., paragraph content, sentence start) */
    text: string;
    /** Correct answer from options */
    answer: string;
}

/**
 * Matching option (right side)
 */
export interface MatchingOption {
    /** Option label (e.g., "A", "i", "1") */
    label: string;
    /** Option text (e.g., heading, name, sentence ending) */
    text: string;
    /** Whether this option can be used multiple times */
    reusable: boolean;
}

/**
 * Matching question interface
 * Covers: headings, information, features, sentence-endings
 */
export interface MatchingQuestion extends BaseQuestion {
    type: MatchingSubtype;
    /** Option label format (Task 1.8) */
    optionLabelFormat: OptionLabelFormat;
    /** Items to match (left side) */
    items: MatchingItem[];
    /** Available options (right side) */
    options: MatchingOption[];
    /** Section context for matching-information */
    sectionContext?: {
        sections: Array<{
            label: string;
            title?: string;
            paragraph?: string;
        }>;
    };
}

// ═══════════════════════════════════════════════════════════════
// CHOICE QUESTION TYPES (Task 1.5)
// ═══════════════════════════════════════════════════════════════

/**
 * Choice question subtypes
 */
export type ChoiceSubtype =
    | 'multiple-choice'
    | 'multiple-select';

/**
 * Choice option
 */
export interface ChoiceOption {
    /** Option label (e.g., "A", "B", "C") */
    label: string;
    /** Option text */
    text: string;
    /** Whether this is a correct answer */
    isCorrect: boolean;
}

/**
 * Multiple Choice / Multiple Select question interface
 */
export interface ChoiceQuestion extends BaseQuestion {
    type: ChoiceSubtype;
    /** Option label format (Task 1.8) */
    optionLabelFormat: OptionLabelFormat;
    /** Available options */
    options: ChoiceOption[];
    /** For multiple-select: how many answers to choose */
    selectCount?: number;
    /** Hint about answer count (e.g., "Choose TWO letters") */
    selectionHint?: string;
}

// ═══════════════════════════════════════════════════════════════
// SHORT ANSWER QUESTION TYPE (Task 1.6)
// ═══════════════════════════════════════════════════════════════

/**
 * Short Answer question interface
 */
export interface ShortAnswerQuestion extends BaseQuestion {
    type: 'short-answer';
    /** Word limit for answer */
    wordLimit?: number;
    /** Whether answer must come from the passage */
    answerFromPassage: boolean;
    /** Alternative acceptable answers */
    alternativeAnswers?: string[];
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED QUESTION TYPE (Task 1.7)
// ═══════════════════════════════════════════════════════════════

/**
 * Union type of all question interfaces
 * Use this when handling any question type
 */
export type Question =
    | CompletionQuestion
    | TrueFalseQuestion
    | MatchingQuestion
    | ChoiceQuestion
    | ShortAnswerQuestion;

// ═══════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS (Task 1.11)
// ═══════════════════════════════════════════════════════════════

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate a question object
 */
export function validateQuestion(question: Partial<Question>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!question.id) errors.push('Missing required field: id');
    if (question.questionNumber === undefined) errors.push('Missing required field: questionNumber');
    if (!question.type) errors.push('Missing required field: type');
    if (!question.questionText) errors.push('Missing required field: questionText');
    if (question.answer === undefined) errors.push('Missing required field: answer');

    // Type-specific validation
    if (question.type && !QUESTION_TYPES.includes(question.type as any)) {
        errors.push(`Invalid question type: ${question.type}`);
    }

    // Confidence range
    if (question.confidence !== undefined) {
        if (question.confidence < 0 || question.confidence > 100) {
            errors.push('Confidence must be between 0 and 100');
        }
    }

    // Question number must be positive
    if (question.questionNumber !== undefined && question.questionNumber < 1) {
        errors.push('Question number must be positive');
    }

    // Warnings for optional but recommended fields
    if (!question.passageId) {
        warnings.push('Question is not associated with a passage');
    }

    if (question.uncertain) {
        warnings.push('Question is marked for teacher review');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Check if a question is complete and ready for use
 */
export function isQuestionComplete(question: Question): boolean {
    const validation = validateQuestion(question);
    if (!validation.valid) return false;

    // Type-specific completeness checks
    switch (question.type) {
        case 'multiple-choice':
        case 'multiple-select':
            return (question as ChoiceQuestion).options?.length >= 2;

        case 'matching-headings':
        case 'matching-information':
        case 'matching-features':
        case 'matching-sentence-endings':
            const matchQ = question as MatchingQuestion;
            return matchQ.items?.length > 0 && matchQ.options?.length > 0;

        case 'true-false-not-given':
        case 'yes-no-not-given':
            const tfQ = question as TrueFalseQuestion;
            return Boolean(tfQ.statement);

        default:
            return Boolean(question.answer);
    }
}

/**
 * Type guard to check if question is a completion type
 */
export function isCompletionQuestion(question: Question): question is CompletionQuestion {
    const completionTypes: QuestionType[] = [
        'sentence-completion',
        'summary-completion-text',
        'summary-completion-list',
        'note-completion',
        'table-completion',
        'flowchart-completion',
        'diagram-labeling',
    ];
    return completionTypes.includes(question.type);
}

/**
 * Type guard to check if question is a matching type
 */
export function isMatchingQuestion(question: Question): question is MatchingQuestion {
    const matchingTypes: QuestionType[] = [
        'matching-headings',
        'matching-information',
        'matching-features',
        'matching-sentence-endings',
    ];
    return matchingTypes.includes(question.type);
}

/**
 * Type guard to check if question is a choice type
 */
export function isChoiceQuestion(question: Question): question is ChoiceQuestion {
    return question.type === 'multiple-choice' || question.type === 'multiple-select';
}

/**
 * Type guard to check if question is true/false type
 */
export function isTrueFalseQuestion(question: Question): question is TrueFalseQuestion {
    return question.type === 'true-false-not-given' || question.type === 'yes-no-not-given';
}

// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create default display hints for a question type
 */
export function getDefaultDisplayHints(type: QuestionType): DisplayHints {
    const category = QUESTION_TYPE_TO_CATEGORY[type];

    switch (category) {
        case 'completion':
            return {
                inputType: type === 'summary-completion-list' ? 'dropdown' : 'text',
                optionLabelFormat: 'letter',
                showWordLimit: true,
                layout: type === 'table-completion' ? 'table' : 'stacked',
            };
        case 'true-false':
            return {
                inputType: 'radio',
                optionLabelFormat: 'letter',
                showWordLimit: false,
                layout: 'stacked',
            };
        case 'matching':
            return {
                inputType: 'dropdown',
                optionLabelFormat: type === 'matching-headings' ? 'roman' : 'letter',
                showWordLimit: false,
                layout: 'table',
            };
        case 'choice':
            return {
                inputType: type === 'multiple-select' ? 'checkbox' : 'radio',
                optionLabelFormat: 'letter',
                showWordLimit: false,
                layout: 'stacked',
            };
        case 'short-answer':
            return {
                inputType: 'text',
                optionLabelFormat: 'number',
                showWordLimit: true,
                layout: 'inline',
            };
        default:
            return {
                inputType: 'text',
                optionLabelFormat: 'letter',
                showWordLimit: false,
                layout: 'stacked',
            };
    }
}

/**
 * Generate unique question ID
 */
export function generateQuestionId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
