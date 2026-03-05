/**
 * Unit tests for thcs-engine-enhancements.ts
 */
import { describe, it, expect } from 'vitest';
import type { THCSSection, THCSQuestion } from '../../types/thcs-test.types';
import {
    consumeAITags,
    extractPointAllocation,
    applyPointAllocation,
    replaceInstructions,
    sortSectionsByCurriculum,
    stripDisplayTags,
    validateParsedOutput,
    runEngineEnhancements,
    CURRICULUM_ORDER,
} from './thcs-engine-enhancements';

// ── Helpers ───────────────────────────────────────────────────

function makeQuestion(overrides: Partial<THCSQuestion> = {}): THCSQuestion {
    return {
        id: 'q-' + Math.random().toString(36).slice(2, 8),
        questionNumber: 1,
        type: 'mcq-grammar',
        questionText: 'Test question',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        ...overrides,
    };
}

function makeSection(overrides: Partial<THCSSection> & { defaultQuestionType?: string } = {}): THCSSection {
    const { defaultQuestionType, ...rest } = overrides;
    const sec: any = {
        id: 's-' + Math.random().toString(36).slice(2, 8),
        name: 'Test Section',
        order: 0,
        totalPoints: 0,
        pointMode: 'auto' as const,
        instructionText: 'Choose the correct answer.',
        isCustomInstruction: false,
        layout: 'single-column' as const,
        questions: [makeQuestion()],
        ...rest,
    };
    if (defaultQuestionType) sec.defaultQuestionType = defaultQuestionType;
    return sec;
}

// ── consumeAITags ─────────────────────────────────────────────

describe('consumeAITags', () => {
    it('consumes [AI-INFERRED] from correctAnswer', () => {
        const sec = makeSection({
            questions: [makeQuestion({ correctAnswer: 'B [AI-INFERRED]' as any })],
        });
        const stats = consumeAITags([sec]);
        expect(stats.inferredCount).toBe(1);
        expect((sec.questions[0] as any).answerSource).toBe('ai-inferred');
        expect(sec.questions[0]!.correctAnswer).toBe('B');
    });

    it('consumes [UNCERTAIN] from passage', () => {
        const sec = makeSection({
            passage: { id: 'p1', content: 'Some text [UNCERTAIN] here', wordCount: 5 },
        });
        const stats = consumeAITags([sec]);
        expect(stats.uncertainCount).toBe(1);
        expect(sec.passage!.content).not.toContain('[UNCERTAIN]');
    });

    it('consumes [COMPROMISED: x → y] from section name', () => {
        const sec = makeSection({
            name: 'READING [COMPROMISED: matching → mcq-vocabulary]',
        });
        const stats = consumeAITags([sec]);
        expect(stats.compromisedSections).toHaveLength(1);
        expect(stats.compromisedSections[0]!.originalType).toBe('matching');
        expect(sec.name).not.toContain('[COMPROMISED');
    });
});

// ── extractPointAllocation ────────────────────────────────────

describe('extractPointAllocation', () => {
    it('extracts integer points', () => {
        expect(extractPointAllocation('Phần A (2 điểm)')).toBe(2);
    });

    it('extracts decimal points', () => {
        expect(extractPointAllocation('Section (2.5 điểm)')).toBe(2.5);
    });

    it('returns null when no pattern', () => {
        expect(extractPointAllocation('Section A')).toBeNull();
    });
});

// ── applyPointAllocation ──────────────────────────────────────

describe('applyPointAllocation', () => {
    it('applies explicit points from section name', () => {
        const sec = makeSection({
            name: 'Phần A (3 điểm)',
            questions: [makeQuestion({ questionNumber: 1 }), makeQuestion({ questionNumber: 2 }), makeQuestion({ questionNumber: 3 })],
        });
        applyPointAllocation([sec], 3);
        expect(sec.totalPoints).toBe(3);
        expect(sec.questions[0]!.points).toBe(1);
    });

    it('falls back to 10/totalQuestions', () => {
        const sec = makeSection({
            name: 'Section A',
            questions: [makeQuestion()],
        });
        applyPointAllocation([sec], 10);
        expect(sec.questions[0]!.points).toBe(1); // 10/10
    });
});

// ── replaceInstructions ───────────────────────────────────────

describe('replaceInstructions', () => {
    it('replaces instruction from template', () => {
        const sec = makeSection({
            defaultQuestionType: 'pronunciation',
            isCustomInstruction: false,
            instructionText: 'Original instruction',
        });
        replaceInstructions([sec]);
        expect(sec.instructionText).not.toBe('Original instruction');
        expect(sec.instructionText.length).toBeGreaterThan(0);
    });

    it('skips if isCustomInstruction is true', () => {
        const sec = makeSection({
            defaultQuestionType: 'pronunciation',
            isCustomInstruction: true,
            instructionText: 'Custom teacher instruction',
        });
        replaceInstructions([sec]);
        expect(sec.instructionText).toBe('Custom teacher instruction');
    });
});

// ── sortSectionsByCurriculum ──────────────────────────────────

describe('sortSectionsByCurriculum', () => {
    it('sorts pronunciation before grammar before reading', () => {
        const reading = makeSection({ order: 0, defaultQuestionType: 'reading-comprehension' });
        const grammar = makeSection({ order: 1, defaultQuestionType: 'mcq-grammar' });
        const pron = makeSection({ order: 2, defaultQuestionType: 'pronunciation' });

        const sorted = sortSectionsByCurriculum([reading, grammar, pron]);
        expect((sorted[0] as any).defaultQuestionType).toBe('pronunciation');
        expect((sorted[1] as any).defaultQuestionType).toBe('mcq-grammar');
        expect((sorted[2] as any).defaultQuestionType).toBe('reading-comprehension');
    });

    it('preserves relative order for same-priority types', () => {
        const vocab = makeSection({ order: 0, defaultQuestionType: 'mcq-vocabulary' });
        const grammar = makeSection({ order: 1, defaultQuestionType: 'mcq-grammar' });

        const sorted = sortSectionsByCurriculum([vocab, grammar]);
        // Both are priority 3 — original order preserved
        expect((sorted[0] as any).defaultQuestionType).toBe('mcq-vocabulary');
        expect((sorted[1] as any).defaultQuestionType).toBe('mcq-grammar');
    });

    it('has all 20 types in curriculum order', () => {
        expect(Object.keys(CURRICULUM_ORDER).length).toBe(20);
    });
});

// ── stripDisplayTags ──────────────────────────────────────────

describe('stripDisplayTags', () => {
    it('strips [TYPE:] tags from section name', () => {
        const sec = makeSection({ name: 'Grammar [TYPE: mcq-grammar]' });
        stripDisplayTags([sec]);
        expect(sec.name).toBe('Grammar');
    });

    it('strips (N điểm) from section name', () => {
        const sec = makeSection({ name: 'Phần A (2 điểm)' });
        stripDisplayTags([sec]);
        expect(sec.name).toBe('Phần A');
    });

    it('strips [AI-INFERRED] from question text', () => {
        const sec = makeSection({
            questions: [makeQuestion({ questionText: 'He [AI-INFERRED] goes' })],
        });
        stripDisplayTags([sec]);
        expect(sec.questions[0]!.questionText).toBe('He goes');
    });

    it('strips [STATS:] from instruction text', () => {
        const sec = makeSection({ instructionText: 'Choose. [STATS: 10 questions]' });
        stripDisplayTags([sec]);
        expect(sec.instructionText).toBe('Choose.');
    });
});

// ── validateParsedOutput ──────────────────────────────────────

describe('validateParsedOutput', () => {
    it('warns on ZERO_QUESTIONS', () => {
        const sec = makeSection({ questions: [] });
        const warnings = validateParsedOutput([sec]);
        expect(warnings.some(w => w.code === 'ZERO_QUESTIONS')).toBe(true);
    });

    it('warns on MISSING_ANSWER', () => {
        const sec = makeSection({
            questions: [makeQuestion({ correctAnswer: '' as any, questionNumber: 1 })],
        });
        const warnings = validateParsedOutput([sec]);
        expect(warnings.some(w => w.code === 'MISSING_ANSWER')).toBe(true);
    });

    it('warns on READING_NO_PASSAGE', () => {
        const sec = makeSection({
            defaultQuestionType: 'reading-comprehension',
        });
        const warnings = validateParsedOutput([sec]);
        expect(warnings.some(w => w.code === 'READING_NO_PASSAGE')).toBe(true);
    });

    it('warns on NUMBERING_GAP', () => {
        const sec = makeSection({
            questions: [
                makeQuestion({ questionNumber: 1 }),
                makeQuestion({ questionNumber: 3 }),
            ],
        });
        const warnings = validateParsedOutput([sec]);
        expect(warnings.some(w => w.code === 'NUMBERING_GAP')).toBe(true);
    });

    it('no warnings for clean input', () => {
        const sec = makeSection({
            questions: [
                makeQuestion({ questionNumber: 1, correctAnswer: 'A' }),
                makeQuestion({ questionNumber: 2, correctAnswer: 'B' }),
            ],
        });
        const warnings = validateParsedOutput([sec]);
        expect(warnings).toHaveLength(0);
    });
});

// ── runEngineEnhancements (orchestrator) ──────────────────────

describe('runEngineEnhancements', () => {
    it('returns complete result with sorted sections and warnings', () => {
        const sec = makeSection({
            name: 'Grammar [TYPE: mcq-grammar] (2 điểm)',
            defaultQuestionType: 'mcq-grammar',
            questions: [makeQuestion({ questionNumber: 1, correctAnswer: 'A' })],
        });

        const result = runEngineEnhancements([sec], 1);
        expect(result.sections).toHaveLength(1);
        expect(result.sections[0]!.name).not.toContain('[TYPE:');
        expect(result.sections[0]!.name).not.toContain('điểm');
        expect(result.tagStats).toBeDefined();
        expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('updates order indices after sort', () => {
        const writing = makeSection({ order: 0, defaultQuestionType: 'sentence-rewrite', questions: [makeQuestion({ questionNumber: 1, correctAnswer: 'A', originalSentence: 'test', sentenceStarter: 'test' })] });
        const pron = makeSection({ order: 1, defaultQuestionType: 'pronunciation', questions: [makeQuestion({ questionNumber: 2, correctAnswer: 'B' })] });

        const result = runEngineEnhancements([writing, pron], 2);
        expect(result.sections[0]!.order).toBe(0);
        expect((result.sections[0] as any).defaultQuestionType).toBe('pronunciation');
    });
});
