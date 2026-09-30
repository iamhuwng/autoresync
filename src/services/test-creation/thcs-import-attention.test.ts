import { describe, expect, it } from 'vitest';
import type { ParsedTest } from './thcsDocumentParser.service';
import { classifyThcsImportAttention, resolveThcsImportAttention } from './thcs-import-attention';

const parsed = (): ParsedTest => ({
    metadata: {}, answerKey: {}, overallConfidence: 0,
    warnings: [{ type: 'missing-answer', message: 'No answers.' },
        { type: 'confidence-mismatch', message: 'Low confidence.' },
        { type: 'skipped-content', message: 'Using fallback regex parser. Results may be less accurate.' }],
    sections: [{ name: 'Grammar', instructionText: '', startLine: 0, endLine: 2,
        detectedType: 'mcq-grammar', typeConfidence: 0,
        questions: [{ questionNumber: 1, text: 'Choose an answer.', type: 'mcq-grammar', options: ['A', 'B', 'C', 'D'] }] }],
});

describe('THCS mechanical import attention', () => {
    it('does not gate confidence, missing answers, or regex fallback information', () => {
        expect(classifyThcsImportAttention(parsed(), 'Question 1. Choose an answer.')).toEqual([]);
    });

    it('gates lost source questions and preserves exact input without mutating the parse', () => {
        const input = 'Question 1. Choose an answer.\r\nQuestion 2. Missing task.\n  untouched source  ';
        const test = parsed();
        expect(classifyThcsImportAttention(test, input)[0]?.kind).toBe('skipped-content');
        const kept = resolveThcsImportAttention(test, input, 'keep-source');
        expect(kept.sections).toHaveLength(2);
        expect(kept.sections[1]).toMatchObject({ rawText: input, isRawTextFallback: true, importSourceNeedsReview: true });
        expect(kept.sections[1]?.questions[0]).toMatchObject({ type: 'raw-text-fallback', questionText: input, questionNumber: 2 });
        expect(resolveThcsImportAttention(test, input, 'discard').sections).toHaveLength(1);
        expect(test.sections).toHaveLength(1);
    });

    it('gates explicit skipped content and unusable or truncated sections', () => {
        const test = parsed();
        test.warnings.push({ type: 'skipped-section', message: 'Listening skipped.' });
        test.sections[0]!.questions[0]!.options!.push('E');
        expect(classifyThcsImportAttention(test, '').map(issue => issue.kind)).toEqual(['skipped-content', 'unusable-structure']);
        expect(resolveThcsImportAttention(test, 'Original text', 'discard').sections).toEqual([]);
        test.sections[0]!.questions = [];
        expect(classifyThcsImportAttention(test, '').some(issue => issue.sectionIndex === 0)).toBe(true);
        test.sections = [];
        expect(classifyThcsImportAttention(test, '').some(issue => issue.kind === 'unusable-structure')).toBe(true);
    });

    it('gates raw fallback even with questions so its original source is retained', () => {
        const test = parsed();
        test.sections[0]!.detectedType = 'raw-text-fallback';
        expect(resolveThcsImportAttention(test, 'Full original text', 'keep-source').sections).toHaveLength(1);
        expect(resolveThcsImportAttention(test, 'Full original text', 'keep-source').sections[0]).toMatchObject({ rawText: 'Full original text' });
    });
});
