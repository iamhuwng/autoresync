/**
 * Unit Tests for QuestionSchema
 * 
 * Tests validation functions, type guards, and factory functions
 * for the unified question schema.
 * 
 * @module QuestionSchema.test
 * @date 2026-02-05
 * @see PRD-0020 Task 1.12
 */

import { describe, it, expect } from 'vitest';
import {
    // Types
    type QuestionType,
    type Question,
    type CompletionQuestion,
    type TrueFalseQuestion,
    type MatchingQuestion,
    type ChoiceQuestion,
    type ShortAnswerQuestion,
    // Constants
    QUESTION_TYPES,
    QUESTION_TYPE_TO_CATEGORY,
    // Validation
    validateQuestion,
    isQuestionComplete,
    // Type Guards
    isCompletionQuestion,
    isMatchingQuestion,
    isChoiceQuestion,
    isTrueFalseQuestion,
    // Factory
    getDefaultDisplayHints,
    generateQuestionId,
} from './QuestionSchema';

// ═══════════════════════════════════════════════════════════════
// TEST DATA FACTORIES
// ═══════════════════════════════════════════════════════════════

function createBaseQuestion(overrides: Partial<Question> = {}): Question {
    return {
        id: 'q_test_123',
        questionNumber: 1,
        type: 'multiple-choice',
        questionText: 'What is the main idea of the passage?',
        answer: 'A',
        answerSource: 'answer-key',
        confidence: 85,
        uncertain: false,
        displayHints: {
            inputType: 'radio',
            optionLabelFormat: 'letter',
            showWordLimit: false,
        },
        points: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        options: [
            { label: 'A', text: 'First option', isCorrect: true },
            { label: 'B', text: 'Second option', isCorrect: false },
            { label: 'C', text: 'Third option', isCorrect: false },
        ],
        optionLabelFormat: 'letter',
        ...overrides,
    } as ChoiceQuestion;
}

function createCompletionQuestion(overrides: Partial<CompletionQuestion> = {}): CompletionQuestion {
    return {
        id: 'q_completion_123',
        questionNumber: 5,
        type: 'sentence-completion',
        questionText: 'Complete the sentence: The study found that _____ was the main cause.',
        answer: 'pollution',
        answerSource: 'answer-key',
        confidence: 90,
        uncertain: false,
        displayHints: {
            inputType: 'text',
            optionLabelFormat: 'letter',
            showWordLimit: true,
            wordLimit: 3,
        },
        points: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        wordLimit: 3,
        answerFromPassage: true,
        ...overrides,
    };
}

function createTrueFalseQuestion(overrides: Partial<TrueFalseQuestion> = {}): TrueFalseQuestion {
    return {
        id: 'q_tf_123',
        questionNumber: 10,
        type: 'true-false-not-given',
        questionText: 'The author believes climate change is reversible.',
        answer: 'False',
        answerSource: 'answer-key',
        confidence: 95,
        uncertain: false,
        displayHints: {
            inputType: 'radio',
            optionLabelFormat: 'letter',
            showWordLimit: false,
        },
        points: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        validOptions: ['True', 'False', 'Not Given'],
        statement: 'The author believes climate change is reversible.',
        ...overrides,
    };
}

function createMatchingQuestion(overrides: Partial<MatchingQuestion> = {}): MatchingQuestion {
    return {
        id: 'q_matching_123',
        questionNumber: 15,
        type: 'matching-headings',
        questionText: 'Match the headings to the paragraphs.',
        answer: ['i', 'iii', 'ii'],
        answerSource: 'answer-key',
        confidence: 80,
        uncertain: false,
        displayHints: {
            inputType: 'dropdown',
            optionLabelFormat: 'roman',
            showWordLimit: false,
            layout: 'table',
        },
        points: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        optionLabelFormat: 'roman',
        items: [
            { id: 'item1', identifier: 'Section A', text: 'First paragraph content', answer: 'i' },
            { id: 'item2', identifier: 'Section B', text: 'Second paragraph content', answer: 'iii' },
        ],
        options: [
            { label: 'i', text: 'Introduction to the topic', reusable: false },
            { label: 'ii', text: 'Methodology used', reusable: false },
            { label: 'iii', text: 'Conclusion and findings', reusable: false },
        ],
        ...overrides,
    };
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS TESTS
// ═══════════════════════════════════════════════════════════════

describe('QuestionSchema Constants', () => {
    describe('QUESTION_TYPES', () => {
        it('should contain exactly 16 question types', () => {
            expect(QUESTION_TYPES).toHaveLength(16);
        });

        it('should contain all completion types', () => {
            expect(QUESTION_TYPES).toContain('sentence-completion');
            expect(QUESTION_TYPES).toContain('summary-completion-text');
            expect(QUESTION_TYPES).toContain('summary-completion-list');
            expect(QUESTION_TYPES).toContain('note-completion');
            expect(QUESTION_TYPES).toContain('table-completion');
            expect(QUESTION_TYPES).toContain('flowchart-completion');
            expect(QUESTION_TYPES).toContain('diagram-labeling');
        });

        it('should contain true/false types', () => {
            expect(QUESTION_TYPES).toContain('true-false-not-given');
            expect(QUESTION_TYPES).toContain('yes-no-not-given');
        });

        it('should contain matching types', () => {
            expect(QUESTION_TYPES).toContain('matching-headings');
            expect(QUESTION_TYPES).toContain('matching-information');
            expect(QUESTION_TYPES).toContain('matching-features');
            expect(QUESTION_TYPES).toContain('matching-sentence-endings');
        });

        it('should contain choice types', () => {
            expect(QUESTION_TYPES).toContain('multiple-choice');
            expect(QUESTION_TYPES).toContain('multiple-select');
        });

        it('should contain short-answer type', () => {
            expect(QUESTION_TYPES).toContain('short-answer');
        });
    });

    describe('QUESTION_TYPE_TO_CATEGORY', () => {
        it('should map all 16 types to categories', () => {
            expect(Object.keys(QUESTION_TYPE_TO_CATEGORY)).toHaveLength(16);
        });

        it('should categorize completion types correctly', () => {
            expect(QUESTION_TYPE_TO_CATEGORY['sentence-completion']).toBe('completion');
            expect(QUESTION_TYPE_TO_CATEGORY['summary-completion-text']).toBe('completion');
            expect(QUESTION_TYPE_TO_CATEGORY['diagram-labeling']).toBe('completion');
        });

        it('should categorize true-false types correctly', () => {
            expect(QUESTION_TYPE_TO_CATEGORY['true-false-not-given']).toBe('true-false');
            expect(QUESTION_TYPE_TO_CATEGORY['yes-no-not-given']).toBe('true-false');
        });

        it('should categorize matching types correctly', () => {
            expect(QUESTION_TYPE_TO_CATEGORY['matching-headings']).toBe('matching');
            expect(QUESTION_TYPE_TO_CATEGORY['matching-features']).toBe('matching');
        });

        it('should categorize choice types correctly', () => {
            expect(QUESTION_TYPE_TO_CATEGORY['multiple-choice']).toBe('choice');
            expect(QUESTION_TYPE_TO_CATEGORY['multiple-select']).toBe('choice');
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════

describe('validateQuestion', () => {
    it('should pass validation for a complete question', () => {
        const question = createBaseQuestion();
        const result = validateQuestion(question);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing id', () => {
        const question = createBaseQuestion({ id: undefined as any });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: id');
    });

    it('should fail validation for missing questionNumber', () => {
        const question = createBaseQuestion({ questionNumber: undefined as any });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: questionNumber');
    });

    it('should fail validation for missing type', () => {
        const question = createBaseQuestion({ type: undefined as any });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: type');
    });

    it('should fail validation for missing questionText', () => {
        const question = createBaseQuestion({ questionText: undefined as any });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: questionText');
    });

    it('should fail validation for missing answer', () => {
        const question = createBaseQuestion({ answer: undefined as any });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: answer');
    });

    it('should fail validation for invalid question type', () => {
        const question = createBaseQuestion({ type: 'invalid-type' as any });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid question type: invalid-type');
    });

    it('should fail validation for out-of-range confidence', () => {
        const question = createBaseQuestion({ confidence: 150 });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Confidence must be between 0 and 100');
    });

    it('should fail validation for negative confidence', () => {
        const question = createBaseQuestion({ confidence: -10 });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Confidence must be between 0 and 100');
    });

    it('should fail validation for non-positive question number', () => {
        const question = createBaseQuestion({ questionNumber: 0 });
        const result = validateQuestion(question);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Question number must be positive');
    });

    it('should add warning for missing passageId', () => {
        const question = createBaseQuestion({ passageId: undefined });
        const result = validateQuestion(question);

        expect(result.warnings).toContain('Question is not associated with a passage');
    });

    it('should add warning for uncertain questions', () => {
        const question = createBaseQuestion({ uncertain: true });
        const result = validateQuestion(question);

        expect(result.warnings).toContain('Question is marked for teacher review');
    });
});

// ═══════════════════════════════════════════════════════════════
// COMPLETENESS TESTS
// ═══════════════════════════════════════════════════════════════

describe('isQuestionComplete', () => {
    describe('Choice Questions', () => {
        it('should return true for choice question with 2+ options', () => {
            const question = createBaseQuestion();
            expect(isQuestionComplete(question)).toBe(true);
        });

        it('should return false for choice question with less than 2 options', () => {
            const question = createBaseQuestion({
                options: [{ label: 'A', text: 'Only option', isCorrect: true }],
            } as any);
            expect(isQuestionComplete(question)).toBe(false);
        });
    });

    describe('Matching Questions', () => {
        it('should return true for matching question with items and options', () => {
            const question = createMatchingQuestion();
            expect(isQuestionComplete(question)).toBe(true);
        });

        it('should return false for matching question without items', () => {
            const question = createMatchingQuestion({ items: [] });
            expect(isQuestionComplete(question)).toBe(false);
        });

        it('should return false for matching question without options', () => {
            const question = createMatchingQuestion({ options: [] });
            expect(isQuestionComplete(question)).toBe(false);
        });
    });

    describe('True/False Questions', () => {
        it('should return true for TF question with statement', () => {
            const question = createTrueFalseQuestion();
            expect(isQuestionComplete(question)).toBe(true);
        });

        it('should return false for TF question without statement', () => {
            const question = createTrueFalseQuestion({ statement: '' });
            expect(isQuestionComplete(question)).toBe(false);
        });
    });

    describe('Completion Questions', () => {
        it('should return true for completion question with answer', () => {
            const question = createCompletionQuestion();
            expect(isQuestionComplete(question)).toBe(true);
        });

        it('should return false for completion question without answer', () => {
            const question = createCompletionQuestion({ answer: '' });
            expect(isQuestionComplete(question)).toBe(false);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// TYPE GUARD TESTS
// ═══════════════════════════════════════════════════════════════

describe('Type Guards', () => {
    describe('isCompletionQuestion', () => {
        it('should return true for sentence-completion', () => {
            const question = createCompletionQuestion({ type: 'sentence-completion' });
            expect(isCompletionQuestion(question)).toBe(true);
        });

        it('should return true for summary-completion-text', () => {
            const question = createCompletionQuestion({ type: 'summary-completion-text' });
            expect(isCompletionQuestion(question)).toBe(true);
        });

        it('should return true for diagram-labeling', () => {
            const question = createCompletionQuestion({ type: 'diagram-labeling' });
            expect(isCompletionQuestion(question)).toBe(true);
        });

        it('should return false for multiple-choice', () => {
            const question = createBaseQuestion({ type: 'multiple-choice' });
            expect(isCompletionQuestion(question)).toBe(false);
        });

        it('should return false for matching-headings', () => {
            const question = createMatchingQuestion({ type: 'matching-headings' });
            expect(isCompletionQuestion(question)).toBe(false);
        });
    });

    describe('isMatchingQuestion', () => {
        it('should return true for matching-headings', () => {
            const question = createMatchingQuestion({ type: 'matching-headings' });
            expect(isMatchingQuestion(question)).toBe(true);
        });

        it('should return true for matching-features', () => {
            const question = createMatchingQuestion({ type: 'matching-features' });
            expect(isMatchingQuestion(question)).toBe(true);
        });

        it('should return false for multiple-choice', () => {
            const question = createBaseQuestion({ type: 'multiple-choice' });
            expect(isMatchingQuestion(question)).toBe(false);
        });
    });

    describe('isChoiceQuestion', () => {
        it('should return true for multiple-choice', () => {
            const question = createBaseQuestion({ type: 'multiple-choice' });
            expect(isChoiceQuestion(question)).toBe(true);
        });

        it('should return true for multiple-select', () => {
            const question = createBaseQuestion({ type: 'multiple-select' });
            expect(isChoiceQuestion(question)).toBe(true);
        });

        it('should return false for sentence-completion', () => {
            const question = createCompletionQuestion({ type: 'sentence-completion' });
            expect(isChoiceQuestion(question)).toBe(false);
        });
    });

    describe('isTrueFalseQuestion', () => {
        it('should return true for true-false-not-given', () => {
            const question = createTrueFalseQuestion({ type: 'true-false-not-given' });
            expect(isTrueFalseQuestion(question)).toBe(true);
        });

        it('should return true for yes-no-not-given', () => {
            const question = createTrueFalseQuestion({ type: 'yes-no-not-given' });
            expect(isTrueFalseQuestion(question)).toBe(true);
        });

        it('should return false for multiple-choice', () => {
            const question = createBaseQuestion({ type: 'multiple-choice' });
            expect(isTrueFalseQuestion(question)).toBe(false);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════

describe('Factory Functions', () => {
    describe('getDefaultDisplayHints', () => {
        it('should return text input for sentence-completion', () => {
            const hints = getDefaultDisplayHints('sentence-completion');
            expect(hints.inputType).toBe('text');
            expect(hints.showWordLimit).toBe(true);
        });

        it('should return dropdown for summary-completion-list', () => {
            const hints = getDefaultDisplayHints('summary-completion-list');
            expect(hints.inputType).toBe('dropdown');
        });

        it('should return radio for true-false-not-given', () => {
            const hints = getDefaultDisplayHints('true-false-not-given');
            expect(hints.inputType).toBe('radio');
            expect(hints.showWordLimit).toBe(false);
        });

        it('should return dropdown for matching-headings', () => {
            const hints = getDefaultDisplayHints('matching-headings');
            expect(hints.inputType).toBe('dropdown');
            expect(hints.optionLabelFormat).toBe('roman');
        });

        it('should return letter format for matching-features', () => {
            const hints = getDefaultDisplayHints('matching-features');
            expect(hints.optionLabelFormat).toBe('letter');
        });

        it('should return radio for multiple-choice', () => {
            const hints = getDefaultDisplayHints('multiple-choice');
            expect(hints.inputType).toBe('radio');
        });

        it('should return checkbox for multiple-select', () => {
            const hints = getDefaultDisplayHints('multiple-select');
            expect(hints.inputType).toBe('checkbox');
        });

        it('should return text input for short-answer', () => {
            const hints = getDefaultDisplayHints('short-answer');
            expect(hints.inputType).toBe('text');
            expect(hints.showWordLimit).toBe(true);
        });

        it('should return table layout for table-completion', () => {
            const hints = getDefaultDisplayHints('table-completion');
            expect(hints.layout).toBe('table');
        });
    });

    describe('generateQuestionId', () => {
        it('should generate unique IDs', () => {
            const id1 = generateQuestionId();
            const id2 = generateQuestionId();

            expect(id1).not.toBe(id2);
        });

        it('should start with q_ prefix', () => {
            const id = generateQuestionId();
            expect(id).toMatch(/^q_/);
        });

        it('should contain timestamp-like number', () => {
            const id = generateQuestionId();
            expect(id).toMatch(/^q_\d+_/);
        });

        it('should contain random suffix', () => {
            const id = generateQuestionId();
            expect(id).toMatch(/^q_\d+_[a-z0-9]+$/);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
    it('should handle empty partial question', () => {
        const result = validateQuestion({});

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle null values gracefully', () => {
        const result = validateQuestion({
            id: null as any,
            questionNumber: null as any,
        });

        expect(result.valid).toBe(false);
    });

    it('should handle array answer for matching questions', () => {
        const question = createMatchingQuestion({
            answer: ['i', 'ii', 'iii'],
        });
        const validation = validateQuestion(question);

        expect(validation.valid).toBe(true);
    });

    it('should handle string answer for choice questions', () => {
        const question = createBaseQuestion({
            answer: 'A',
        });
        const validation = validateQuestion(question);

        expect(validation.valid).toBe(true);
    });
});
