import { describe, expect, it } from 'vitest';
import { classifyQuestionTypes, reclassifyByContent } from './thcs-type-classifier';
import type { ParsedSection } from './thcsDocumentParser.service';
import type { THCSQuestionType } from '../../types/thcs-test.types';

function createSection(overrides: Partial<ParsedSection> = {}): ParsedSection {
    return {
        name: 'Section 1',
        instructionText: '',
        startLine: 0,
        endLine: 10,
        detectedType: 'mcq-grammar',
        typeConfidence: 60,
        passageText: '',
        questions: [
            {
                questionNumber: 1,
                text: '',
                type: 'mcq-grammar',
                options: ['A', 'B', 'C', 'D'],
                correctAnswer: 'A',
            },
        ],
        ...overrides,
    };
}

function createQuestion(type: THCSQuestionType, text = '') {
    return {
        questionNumber: 1,
        text,
        type,
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
    };
}

describe('thcs-type-classifier', () => {
    it('classifies advertisement numbered-blank instruction as reading-cloze-mcq', () => {
        const sections = [
            createSection({
                instructionText: 'Read the following advertisement and mark the letter A, B, C or D to indicate the option that best fits each of the numbered blanks from 1 to 6.',
                questions: [createQuestion('mcq-grammar')],
            }),
        ];

        classifyQuestionTypes(sections);

        expect(sections[0]!.detectedType).toBe('reading-cloze-mcq');
    });

    it('keeps non-cloze advertisement instruction as reading-announcement', () => {
        const sections = [
            createSection({
                instructionText: 'Read the following advertisement and answer questions 1 to 4.',
                questions: [createQuestion('mcq-grammar')],
            }),
        ];

        classifyQuestionTypes(sections);

        expect(sections[0]!.detectedType).toBe('reading-announcement');
    });

    it('reclassifies reading-announcement to reading-cloze-mcq when cloze markers are present', () => {
        const sections = [
            createSection({
                detectedType: 'reading-announcement',
                typeConfidence: 80,
                instructionText: 'Read the following advertisement and choose the option that best fits each of the numbered blanks.',
                questions: [createQuestion('reading-announcement')],
            }),
        ];

        const events = reclassifyByContent(sections);

        expect(sections[0]!.detectedType).toBe('reading-cloze-mcq');
        expect(events).toHaveLength(1);
        expect(events[0]!.reason).toContain('announcement cloze markers');
    });

    it('does not reclassify visual reading-announcement prompts with sign/notice cues', () => {
        const sections = [
            createSection({
                detectedType: 'reading-announcement',
                typeConfidence: 80,
                instructionText: 'Look at the following sign and choose the correct answer for each question.',
                questions: [createQuestion('reading-announcement', 'According to the sign, what must students do?')],
            }),
        ];

        const events = reclassifyByContent(sections);

        expect(sections[0]!.detectedType).toBe('reading-announcement');
        expect(events).toHaveLength(0);
    });
});
