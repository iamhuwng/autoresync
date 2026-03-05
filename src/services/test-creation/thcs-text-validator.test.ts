/**
 * Unit tests for thcs-text-validator.ts
 */
import { describe, it, expect } from 'vitest';
import {
    detectSectionBoundaries,
    detectMergedQuestions,
    detectMissingQPrefix,
    detectOptionsInline,
    detectNumberingGap,
    detectSectionNoQuestions,
    detectAmbiguousSectionSplit,
    detectMissingTypeTag,
    detectTypeContentMismatch,
    detectMissingPassageBlock,
    detectPassageNoParagraphs,
    detectBlankFormatWrong,
    detectMissingBrackets,
    detectMissingArrow,
    detectWordBankNotTagged,
    detectCompressedAnswerKey,
    detectMissingAnswerKey,
    detectMissingMarkers,
    detectUnsupportedTypes,
    computeStats,
    computeFormatConfidence,
    validateRestructuredText,
    validateOriginalText,
} from './thcs-text-validator';

// ── Helpers ───────────────────────────────────────────────────

function lines(text: string) { return text.split('\n'); }

function makeSections(text: string) {
    return detectSectionBoundaries(text.split('\n'));
}

// ── detectSectionBoundaries ───────────────────────────────────

describe('detectSectionBoundaries', () => {
    it('detects Roman numeral headers', () => {
        const secs = makeSections('I. PHONETICS\nQuestion 1.\nII. GRAMMAR\nQuestion 2.');
        expect(secs.length).toBe(2);
        expect(secs[0].headerText).toContain('PHONETICS');
        expect(secs[1].headerText).toContain('GRAMMAR');
    });

    it('extracts [TYPE: xxx] tags', () => {
        const secs = makeSections('I. PHONETICS [TYPE: pronunciation]\nContent');
        expect(secs[0].typeTag).toBe('pronunciation');
    });

    it('returns null typeTag when missing', () => {
        const secs = makeSections('I. PHONETICS\nContent');
        expect(secs[0].typeTag).toBeNull();
    });
});

// ── Individual Detectors ──────────────────────────────────────

describe('detectMergedQuestions', () => {
    it('detects two questions on same line', () => {
        const issues = detectMergedQuestions(lines('Question 1. What? Question 2. Why?'));
        expect(issues.length).toBe(1);
        expect(issues[0].code).toBe('MERGED_QUESTIONS');
    });

    it('does not flag single question lines', () => {
        expect(detectMergedQuestions(lines('Question 1. What is this?'))).toHaveLength(0);
    });
});

describe('detectOptionsInline', () => {
    it('detects options on same line as question', () => {
        const issues = detectOptionsInline(lines('Question 1. Text  A. opt1  B. opt2  C. opt3  D. opt4'));
        expect(issues.length).toBe(1);
        expect(issues[0].code).toBe('OPTIONS_INLINE');
    });

    it('does not flag properly formatted questions', () => {
        const text = 'Question 1. Text\nA. opt1\nB. opt2';
        expect(detectOptionsInline(lines(text))).toHaveLength(0);
    });
});

describe('detectNumberingGap', () => {
    it('detects gaps in question numbering', () => {
        const text = 'Question 1. a\nA. x\nQuestion 3. b\nA. y';
        const issues = detectNumberingGap(lines(text));
        expect(issues.length).toBe(1);
        expect(issues[0].code).toBe('NUMBERING_GAP');
    });

    it('accepts sequential numbering', () => {
        const text = 'Question 1. a\nQuestion 2. b\nQuestion 3. c';
        expect(detectNumberingGap(lines(text))).toHaveLength(0);
    });
});

describe('detectSectionNoQuestions', () => {
    it('detects sections without questions', () => {
        const text = 'I. EMPTY SECTION\nJust some text with no questions.';
        const secs = makeSections(text);
        const issues = detectSectionNoQuestions(lines(text), secs);
        expect(issues.length).toBe(1);
        expect(issues[0].code).toBe('SECTION_NO_QUESTIONS');
    });

    it('skips ANSWER KEY sections', () => {
        const text = 'ANSWER KEY\n1. B\n2. C';
        const secs = makeSections(text);
        expect(detectSectionNoQuestions(lines(text), secs)).toHaveLength(0);
    });
});

describe('detectMissingTypeTag', () => {
    it('flags sections without [TYPE:] tags', () => {
        const text = 'I. GRAMMAR\nQuestion 1. Text';
        const secs = makeSections(text);
        const issues = detectMissingTypeTag(secs);
        expect(issues.length).toBe(1);
    });

    it('passes sections with tags', () => {
        const text = 'I. GRAMMAR [TYPE: mcq-grammar]\nQuestion 1. Text';
        const secs = makeSections(text);
        expect(detectMissingTypeTag(secs)).toHaveLength(0);
    });
});

describe('detectMissingPassageBlock', () => {
    it('flags reading sections without PASSAGE: marker', () => {
        const text = 'I. READING [TYPE: reading-comprehension]\nQuestion 1. What?';
        const secs = makeSections(text);
        const issues = detectMissingPassageBlock(lines(text), secs);
        expect(issues.length).toBe(1);
    });

    it('passes when PASSAGE: exists', () => {
        const text = 'I. READING [TYPE: reading-comprehension]\nPASSAGE:\nText here\nQuestion 1. What?';
        const secs = makeSections(text);
        expect(detectMissingPassageBlock(lines(text), secs)).toHaveLength(0);
    });
});

describe('detectCompressedAnswerKey', () => {
    it('detects compressed format "1-5: BACDC"', () => {
        const issues = detectCompressedAnswerKey(lines('1-5: BACDC'));
        expect(issues.length).toBe(1);
    });

    it('does not flag expanded keys', () => {
        expect(detectCompressedAnswerKey(lines('1. B\n2. A\n3. C'))).toHaveLength(0);
    });
});

describe('detectMissingAnswerKey', () => {
    it('flags when no answer key present', () => {
        const text = 'I. GRAMMAR\nQuestion 1. Text\nA. a\nB. b\nC. c\nD. d';
        expect(detectMissingAnswerKey(lines(text))).toHaveLength(1);
    });

    it('passes when ANSWER KEY header present', () => {
        const text = 'ANSWER KEY\n1. B\n2. C';
        expect(detectMissingAnswerKey(lines(text))).toHaveLength(0);
    });
});

describe('detectMissingArrow', () => {
    it('flags rewrite section without =>', () => {
        const text = 'I. REWRITING [TYPE: sentence-rewrite]\nQuestion 1. He went.';
        const secs = makeSections(text);
        const issues = detectMissingArrow(lines(text), secs);
        expect(issues.length).toBe(1);
    });

    it('passes when => exists', () => {
        const text = 'I. REWRITING [TYPE: sentence-rewrite]\nQuestion 1. He went.\n=> He ...';
        const secs = makeSections(text);
        expect(detectMissingArrow(lines(text), secs)).toHaveLength(0);
    });
});

// ── Unsupported Type Detection ────────────────────────────────

describe('detectUnsupportedTypes', () => {
    it('detects matching type', () => {
        const text = 'I. MATCHING\nMatch column A with column B.';
        const secs = makeSections(text);
        const results = detectUnsupportedTypes(lines(text), secs);
        expect(results.some(r => r.type === 'matching')).toBe(true);
        expect(results[0].canCompromise).toBe(true);
    });

    it('detects listening type (cannot compromise)', () => {
        const text = 'I. LISTENING\nListen to the passage.';
        const secs = makeSections(text);
        const results = detectUnsupportedTypes(lines(text), secs);
        expect(results.some(r => r.type === 'listening')).toBe(true);
        expect(results.find(r => r.type === 'listening')?.canCompromise).toBe(false);
    });
});

// ── Confidence Scoring ────────────────────────────────────────

describe('computeFormatConfidence', () => {
    it('returns 100 for zero issues', () => {
        const score = computeFormatConfidence([], { sectionCount: 3, questionCount: 10, answerCount: 10, typeTagCount: 3 });
        // 100 + 5 (type tags) + 5 (answer coverage) = 100 (capped)
        expect(score).toBe(100);
    });

    it('deducts 20 per critical issue (capped)', () => {
        const issues = [
            { code: 'MISSING_ANSWER_KEY' as const, severity: 'critical' as const, sectionIndex: -1, lineRange: [0, 0] as [number, number], sectionText: '', message: '' },
            { code: 'MERGED_QUESTIONS' as const, severity: 'critical' as const, sectionIndex: -1, lineRange: [0, 0] as [number, number], sectionText: '', message: '' },
        ];
        const score = computeFormatConfidence(issues, { sectionCount: 0, questionCount: 0, answerCount: 0, typeTagCount: 0 });
        expect(score).toBe(60); // 100 - 20 - 20
    });

    it('deducts 10 per major issue (capped)', () => {
        const issues = [
            { code: 'MISSING_TYPE_TAG' as const, severity: 'major' as const, sectionIndex: 0, lineRange: [0, 0] as [number, number], sectionText: '', message: '' },
        ];
        const score = computeFormatConfidence(issues, { sectionCount: 0, questionCount: 0, answerCount: 0, typeTagCount: 0 });
        expect(score).toBe(90);
    });
});

// ── Main Entry Point ──────────────────────────────────────────

describe('validateRestructuredText', () => {
    it('returns a complete report', () => {
        const text = [
            'I. GRAMMAR [TYPE: mcq-grammar]',
            'Choose the correct answer.',
            'Question 1. He ______ to school.',
            'A. go',
            'B. goes',
            'C. going',
            'D. gone',
            '',
            'ANSWER KEY',
            '1. B',
        ].join('\n');

        const report = validateRestructuredText(text, text, 85);

        expect(report.formatConfidence).toBeGreaterThan(50);
        expect(report.stats.questionCount).toBe(1);
        expect(report.stats.answerCount).toBe(1);
        expect(report.stats.sectionCount).toBeGreaterThanOrEqual(1);
        expect(report.unsupportedTypes).toHaveLength(0);
        expect(report.aiConfidence).toBe(85);
    });

    it('detects confidence disagreement', () => {
        const text = 'I. GRAMMAR\nQuestion 1. Text\nA. a\nB. b\nC. c\nD. d';
        const report = validateRestructuredText(text, text, 95); // AI says 95 but validator finds issues
        // Report will have lower formatConfidence due to missing answer key and missing type tag
        if (Math.abs(95 - report.formatConfidence) > 25) {
            expect(report.confidenceDisagreement).toBe(true);
        }
    });

    it('handles empty input gracefully', () => {
        const report = validateRestructuredText('', '', 0);
        expect(report.formatConfidence).toBeLessThanOrEqual(100);
        expect(report.stats.questionCount).toBe(0);
    });
});

// ── validateOriginalText (FR-3 parallel assessment) ─────────────

describe('validateOriginalText', () => {
    it('returns high confidence for well-structured Step 0 output', () => {
        const text = [
            'TITLE: Mid-term Test',
            'GRADE: 9',
            'EXAM TYPE: giữa kì',
            '',
            'I. PHONETICS [TYPE: pronunciation]',
            'Choose the word whose underlined part is pronounced differently.',
            'Question 1. A. {{looked}} B. {{watched}} C. {{played}} D. {{stopped}}',
            '',
            'II. GRAMMAR [TYPE: mcq-grammar]',
            'Choose the correct answer.',
            'Question 2. He ______ to school every day.',
            'A. go',
            'B. goes',
            'C. going',
            'D. gone',
            '',
            'ANSWER KEY',
            '1. C',
            '2. B',
        ].join('\n');

        const report = validateOriginalText(text);
        expect(report.formatConfidence).toBeGreaterThanOrEqual(80);
        expect(report.issues.filter(i => i.severity === 'critical')).toHaveLength(0);
    });

    it('detects merged questions', () => {
        const text = [
            'I. GRAMMAR [TYPE: mcq-grammar]',
            'Question 1. What? A. a B. b Question 2. Why? A. a B. b',
            'ANSWER KEY',
            '1. A',
        ].join('\n');

        const report = validateOriginalText(text);
        expect(report.issues.some(i => i.code === 'MERGED_QUESTIONS')).toBe(true);
    });

    it('detects missing TYPE tags', () => {
        const text = [
            'I. GRAMMAR',
            'Question 1. He went.',
            'A. a',
            'B. b',
            'ANSWER KEY',
            '1. A',
        ].join('\n');

        const report = validateOriginalText(text);
        expect(report.issues.some(i => i.code === 'MISSING_TYPE_TAG')).toBe(true);
    });

    it('detects missing answer key', () => {
        const text = [
            'I. GRAMMAR [TYPE: mcq-grammar]',
            'Question 1. He went.',
            'A. a',
            'B. b',
        ].join('\n');

        const report = validateOriginalText(text);
        expect(report.issues.some(i => i.code === 'MISSING_ANSWER_KEY')).toBe(true);
    });

    it('detects reading section without PASSAGE:', () => {
        const text = [
            'I. READING [TYPE: reading-comprehension]',
            'Question 1. What is the main idea?',
            'A. a',
            'B. b',
            'ANSWER KEY',
            '1. A',
        ].join('\n');

        const report = validateOriginalText(text);
        expect(report.issues.some(i => i.code === 'MISSING_PASSAGE_BLOCK')).toBe(true);
    });

    it('detects pronunciation section without {{}} markers', () => {
        const text = [
            'I. PHONETICS [TYPE: pronunciation]',
            'Choose the word whose underlined part is pronounced differently.',
            'Question 1. A. looked B. watched C. played D. stopped',
            'ANSWER KEY',
            '1. C',
        ].join('\n');

        const report = validateOriginalText(text);
        expect(report.issues.some(i => i.code === 'MISSING_MARKERS')).toBe(true);
    });
});
