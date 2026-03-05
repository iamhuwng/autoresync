/**
 * Unit tests for thcs-compromise-step.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { executeCompromiseStep } from './thcs-compromise-step';
import type { CompromiseAICallFn } from './thcs-compromise-step';
import type { UnsupportedTypeEntry } from './thcs-text-validator';
import { createRetrySession } from './thcs-retry-manager';

// ── Helpers ───────────────────────────────────────────────────

const MOCK_COMPROMISE_RESPONSE = `[COMPROMISED: matching → mcq-vocabulary]
Question 1. The word "Happy" is closest in meaning to:
A. Sad
B. Large
C. Small
D. Angry

--- REASONING ---
ORIGINAL_TYPE: matching
CONVERTED_TYPE: mcq-vocabulary
PRESERVED: vocabulary pairs
LOST: column format
CONFIDENCE: high
TEACHER_NOTES: Review distractors for appropriateness`;

function makeEntry(type: string, canCompromise: boolean, sectionIndex = 0): UnsupportedTypeEntry {
    return { type: type as UnsupportedTypeEntry['type'], sectionIndex, canCompromise };
}

// ── Tests ─────────────────────────────────────────────────────

describe('executeCompromiseStep', () => {
    // ── Uncompromisable Skips ──────────────────────────────

    it('skips listening sections with teacher warning', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn();

        const result = await executeCompromiseStep(
            [makeEntry('listening', false)],
            'some text', 'original', session, callAI,
        );

        expect(result.skippedSections).toHaveLength(1);
        expect(result.skippedSections[0]!.type).toBe('listening');
        expect(result.skippedSections[0]!.reason).toContain('audio');
        expect(callAI).not.toHaveBeenCalled();
    });

    it('skips speaking sections with teacher warning', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn();

        const result = await executeCompromiseStep(
            [makeEntry('speaking', false)],
            'some text', 'original', session, callAI,
        );

        expect(result.skippedSections).toHaveLength(1);
        expect(result.skippedSections[0]!.reason).toContain('oral');
    });

    it('skips essay sections with teacher warning', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn();

        const result = await executeCompromiseStep(
            [makeEntry('essay', false)],
            'some text', 'original', session, callAI,
        );

        expect(result.skippedSections).toHaveLength(1);
        expect(result.skippedSections[0]!.reason).toContain('manual grading');
    });

    it('skips composition sections with teacher warning', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn();

        const result = await executeCompromiseStep(
            [makeEntry('composition', false)],
            'some text', 'original', session, callAI,
        );

        expect(result.skippedSections).toHaveLength(1);
        expect(result.skippedSections[0]!.reason).toContain('manual grading');
    });

    // ── Compromise Routes ─────────────────────────────────

    it('compromises matching → mcq-vocabulary', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(MOCK_COMPROMISE_RESPONSE);

        const result = await executeCompromiseStep(
            [makeEntry('matching', true)],
            'Match column A with B', 'original text', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(1);
        expect(result.compromisedSections[0]!.originalType).toBe('matching');
        expect(result.compromisedSections[0]!.convertedType).toBe('mcq-vocabulary');
        expect(callAI).toHaveBeenCalled();
    });

    it('compromises true-false → reading-comprehension', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(MOCK_COMPROMISE_RESPONSE);

        const result = await executeCompromiseStep(
            [makeEntry('true-false', true)],
            'Statement: True or False', 'original', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(1);
        expect(result.compromisedSections[0]!.convertedType).toBe('reading-comprehension');
    });

    it('compromises translation → sentence-rewrite', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(MOCK_COMPROMISE_RESPONSE);

        const result = await executeCompromiseStep(
            [makeEntry('translation', true)],
            'Dịch câu sau', 'original', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(1);
        expect(result.compromisedSections[0]!.convertedType).toBe('sentence-rewrite');
    });

    // ── Mixed Processing ──────────────────────────────────

    it('handles mix of compromisable and uncompromisable types', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(MOCK_COMPROMISE_RESPONSE);

        const result = await executeCompromiseStep(
            [
                makeEntry('listening', false, 0),
                makeEntry('matching', true, 1),
                makeEntry('speaking', false, 2),
            ],
            'Section text', 'original', session, callAI,
        );

        expect(result.skippedSections).toHaveLength(2);
        expect(result.compromisedSections).toHaveLength(1);
        expect(result.skippedSections.map(s => s.type)).toContain('listening');
        expect(result.skippedSections.map(s => s.type)).toContain('speaking');
    });

    // ── Failure Handling ──────────────────────────────────

    it('skips section when AI returns null for all retries', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(null);

        const result = await executeCompromiseStep(
            [makeEntry('matching', true)],
            'Match column A with B', 'original', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(0);
        expect(result.skippedSections).toHaveLength(1);
        expect(result.skippedSections[0]!.reason).toContain('failed');
    });

    // ── Empty Input ───────────────────────────────────────

    it('returns empty results when no unsupported types', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn();

        const result = await executeCompromiseStep(
            [], 'text', 'original', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(0);
        expect(result.skippedSections).toHaveLength(0);
        expect(callAI).not.toHaveBeenCalled();
    });

    // ── Picture Description Split ─────────────────────────

    it('routes picture-description-open (no options) to skip', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn();

        const result = await executeCompromiseStep(
            [makeEntry('picture-description', true)],
            'Describe the picture below.', // no A./B./C./D. options
            'original', session, callAI,
        );

        // picture-description-open → skip
        expect(result.skippedSections).toHaveLength(1);
        expect(result.skippedSections[0]!.reason).toContain('auto-graded');
    });

    it('routes picture-description with MCQ options to compromise', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(MOCK_COMPROMISE_RESPONSE);

        const result = await executeCompromiseStep(
            [makeEntry('picture-description', true)],
            'Look at the picture.\nA. Something\nB. Other', // has MCQ options
            'original', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(1);
        expect(result.compromisedSections[0]!.convertedType).toBe('mcq-sign-notice');
    });
});
