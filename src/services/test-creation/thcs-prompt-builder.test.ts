/**
 * Unit tests for thcs-prompt-builder.ts
 */
import { describe, it, expect } from 'vitest';
import {
    REPAIR_FRAGMENTS,
    COMPROMISE_TEMPLATES,
    buildRepairPrompt,
    buildCompromisePrompt,
    parseAIRepairResponse,
    parseCompromiseResponse,
    computeFragmentHash,
    createAuditEntry,
} from './thcs-prompt-builder';
import type { IssueCode } from './thcs-text-validator';

// ── Fragment Registry ─────────────────────────────────────────

describe('REPAIR_FRAGMENTS', () => {
    it('includes the core repair fragment registry', () => {
        const fragmentKeys = Object.keys(REPAIR_FRAGMENTS);
        expect(fragmentKeys.length).toBeGreaterThanOrEqual(16);
        expect(fragmentKeys).toEqual(expect.arrayContaining([
            'MERGED_QUESTIONS',
            'MISSING_ANSWER_KEY',
            'MISSING_TYPE_TAG',
            'WORD_BANK_NOT_TAGGED',
        ]));
    });

    it('every fragment has required fields', () => {
        for (const [code, frag] of Object.entries(REPAIR_FRAGMENTS)) {
            expect(frag.issueCode).toBe(code);
            expect(frag.priority).toBeGreaterThanOrEqual(1);
            expect(frag.priority).toBeLessThanOrEqual(5);
            expect(frag.instruction.length).toBeGreaterThan(10);
            expect(frag.example.length).toBeGreaterThan(5);
            expect(frag.constraint.length).toBeGreaterThan(5);
        }
    });
});

describe('COMPROMISE_TEMPLATES', () => {
    it('includes the baseline compromise routes', () => {
        const templateKeys = Object.keys(COMPROMISE_TEMPLATES);
        expect(templateKeys.length).toBeGreaterThanOrEqual(8);
        expect(templateKeys).toEqual(expect.arrayContaining([
            'matching',
            'true-false',
            'translation',
            'picture-description-open',
        ]));
    });

    it('every template has required fields', () => {
        for (const [route, tmpl] of Object.entries(COMPROMISE_TEMPLATES)) {
            expect(tmpl.sourceType).toBe(route);
            expect(tmpl.targetType.length).toBeGreaterThan(0);
            expect(tmpl.instruction.length).toBeGreaterThan(5);
        }
    });

    it('picture-description-open maps to skip', () => {
        expect(COMPROMISE_TEMPLATES['picture-description-open'].targetType).toBe('skip');
    });
});

// ── buildRepairPrompt ─────────────────────────────────────────

describe('buildRepairPrompt', () => {
    it('includes both original and processed text', () => {
        const prompt = buildRepairPrompt(
            ['MERGED_QUESTIONS'],
            'original text here',
            'processed text here',
        );
        expect(prompt).toContain('original text here');
        expect(prompt).toContain('processed text here');
    });

    it('includes selected issue instructions', () => {
        const prompt = buildRepairPrompt(
            ['MERGED_QUESTIONS', 'MISSING_ANSWER_KEY'],
            'orig', 'proc',
        );
        expect(prompt).toContain('[MERGED_QUESTIONS]');
        expect(prompt).toContain('[MISSING_ANSWER_KEY]');
        expect(prompt).not.toContain('[OPTIONS_INLINE]');
    });

    it('sorts by priority (structure before format)', () => {
        const prompt = buildRepairPrompt(
            ['WORD_BANK_NOT_TAGGED', 'MERGED_QUESTIONS'],
            'o', 'p',
        );
        const mergedPos = prompt.indexOf('[MERGED_QUESTIONS]');
        const wbPos = prompt.indexOf('[WORD_BANK_NOT_TAGGED]');
        expect(mergedPos).toBeLessThan(wbPos); // P1 before P5
    });

    it('returns empty string for empty issue list', () => {
        expect(buildRepairPrompt([], 'o', 'p')).toBe('');
    });

    it('includes output format instructions', () => {
        const prompt = buildRepairPrompt(['NUMBERING_GAP'], 'o', 'p');
        expect(prompt).toContain('--- FIXED TEXT ---');
        expect(prompt).toContain('--- REASONING LOG ---');
    });
});

// ── buildCompromisePrompt ─────────────────────────────────────

describe('buildCompromisePrompt', () => {
    it('includes section text and original input', () => {
        const prompt = buildCompromisePrompt('matching', 'match section', 'orig input');
        expect(prompt).toContain('match section');
        expect(prompt).toContain('orig input');
    });

    it('includes compromise tag format', () => {
        const prompt = buildCompromisePrompt('true-false', 'tf section', 'orig');
        expect(prompt).toContain('[COMPROMISED: true-false →');
    });

    it('returns empty for skip types', () => {
        expect(buildCompromisePrompt('picture-description-open', 'sec', 'orig')).toBe('');
    });

    it('includes template instruction and example', () => {
        const prompt = buildCompromisePrompt('translation', 'sec', 'orig');
        expect(prompt).toContain(COMPROMISE_TEMPLATES['translation'].instruction);
    });
});

// ── parseAIRepairResponse ─────────────────────────────────────

describe('parseAIRepairResponse', () => {
    it('parses standard delimiter format', () => {
        const raw = `--- FIXED TEXT ---
Fixed content here

--- REASONING LOG ---
ISSUE: MERGED_QUESTIONS
ACTION: Split line 5
REASONING: Two questions were on one line
CONFIDENCE: high
ORIGINAL_REF: "Question 1. What? Question 2. Why?"`;

        const result = parseAIRepairResponse(raw);
        expect(result.fixedText).toContain('Fixed content');
        expect(result.reasoningLog).toHaveLength(1);
        expect(result.reasoningLog[0].issueCode).toBe('MERGED_QUESTIONS');
        expect(result.reasoningLog[0].confidence).toBe('high');
    });

    it('handles === delimiter variant', () => {
        const raw = `=== FIXED TEXT ===
Content

=== REASONING LOG ===
ISSUE: OPTIONS_INLINE
ACTION: split options
REASONING: needed
CONFIDENCE: medium
ORIGINAL_REF: line 3`;

        const result = parseAIRepairResponse(raw);
        expect(result.fixedText).toContain('Content');
        expect(result.reasoningLog[0].issueCode).toBe('OPTIONS_INLINE');
    });

    it('falls back to entire response as fixedText when no delimiters', () => {
        const raw = 'Just the fixed text with no delimiters at all';
        const result = parseAIRepairResponse(raw);
        expect(result.fixedText).toBe(raw);
        expect(result.reasoningLog).toHaveLength(0);
    });

    it('handles multiple reasoning entries', () => {
        const raw = `--- FIXED TEXT ---
Fixed

--- REASONING LOG ---
ISSUE: MERGED_QUESTIONS
ACTION: split
REASONING: done
CONFIDENCE: high
ORIGINAL_REF: q1

ISSUE: MISSING_Q_PREFIX
ACTION: added
REASONING: needed
CONFIDENCE: medium
ORIGINAL_REF: line 7`;

        const result = parseAIRepairResponse(raw);
        expect(result.reasoningLog.length).toBe(2);
    });

    it('normalizes confidence values', () => {
        const raw = `--- FIXED TEXT ---
x
--- REASONING LOG ---
ISSUE: A
ACTION: b
REASONING: c
CONFIDENCE: Med
ORIGINAL_REF: d`;

        const result = parseAIRepairResponse(raw);
        expect(result.reasoningLog[0].confidence).toBe('medium');
    });
});

// ── parseCompromiseResponse ───────────────────────────────────

describe('parseCompromiseResponse', () => {
    it('extracts converted text and reasoning', () => {
        const raw = `[COMPROMISED: matching → mcq-vocabulary]
Question 1. Choose the closest meaning.
A. Option A
B. Option B

--- REASONING ---
ORIGINAL_TYPE: matching
CONVERTED_TYPE: mcq-vocabulary
PRESERVED: question content
LOST: column layout
CONFIDENCE: high
TEACHER_NOTES: Review distractors`;

        const result = parseCompromiseResponse(raw);
        expect(result.convertedText).toContain('[COMPROMISED:');
        expect(result.convertedText).toContain('Question 1.');
        expect(result.reasoning.originalType).toBe('matching');
        expect(result.reasoning.convertedType).toBe('mcq-vocabulary');
        expect(result.reasoning.confidence).toBe('high');
    });

    it('handles missing reasoning gracefully', () => {
        const raw = 'Just converted text without reasoning section';
        const result = parseCompromiseResponse(raw);
        expect(result.convertedText).toBe(raw);
        expect(result.reasoning.originalType).toBe('');
    });
});

// ── Fragment Hashing ──────────────────────────────────────────

describe('computeFragmentHash', () => {
    it('returns consistent hex string', () => {
        const hash1 = computeFragmentHash(['MERGED_QUESTIONS', 'OPTIONS_INLINE']);
        const hash2 = computeFragmentHash(['MERGED_QUESTIONS', 'OPTIONS_INLINE']);
        expect(hash1).toBe(hash2);
        expect(hash1.length).toBe(8);
    });

    it('is order-independent (sorted internally)', () => {
        const hash1 = computeFragmentHash(['OPTIONS_INLINE', 'MERGED_QUESTIONS']);
        const hash2 = computeFragmentHash(['MERGED_QUESTIONS', 'OPTIONS_INLINE']);
        expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different inputs', () => {
        const hash1 = computeFragmentHash(['MERGED_QUESTIONS']);
        const hash2 = computeFragmentHash(['OPTIONS_INLINE']);
        expect(hash1).not.toBe(hash2);
    });
});

// ── Audit Entry ───────────────────────────────────────────────

describe('createAuditEntry', () => {
    it('creates a complete audit entry', () => {
        const entry = createAuditEntry(
            'llama-3.3-70b', 0.1,
            ['MERGED_QUESTIONS'],
            85,
            [{ issueCode: 'MERGED_QUESTIONS', action: 'split', reasoning: 'done', confidence: 'high', originalRef: 'q1' }],
        );
        expect(entry.model).toBe('llama-3.3-70b');
        expect(entry.temperature).toBe(0.1);
        expect(entry.fragmentHash.length).toBe(8);
        expect(entry.issueCodes).toEqual(['MERGED_QUESTIONS']);
        expect(entry.resultConfidence).toBe(85);
        expect(entry.hadUncertain).toBe(false);
    });

    it('detects uncertain reasoning entries', () => {
        const entry = createAuditEntry(
            'model', 0.1, ['NUMBERING_GAP'], 60,
            [{ issueCode: 'NUMBERING_GAP', action: 'checked', reasoning: 'unclear', confidence: 'low', originalRef: '' }],
        );
        expect(entry.hadUncertain).toBe(true);
    });
});
