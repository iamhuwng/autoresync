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

    it('falls back to raw-text-fallback when AI returns null for all retries', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(null);

        const result = await executeCompromiseStep(
            [makeEntry('matching', true)],
            'Match column A with B', 'original', session, callAI,
        );

        // Both primary and alternate fail → raw-text-fallback (NOT skipped)
        expect(result.compromisedSections).toHaveLength(1);
        expect(result.compromisedSections[0]!.convertedType).toBe('raw-text-fallback');
        expect(result.compromisedSections[0]!.reasoning.teacherNotes).toContain('could not be auto-converted');
        expect(result.skippedSections).toHaveLength(0);
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

    // ── Alternate Strategy (FR-11 Task 5.2) ───────────────

    it('matching → primary fails → alternate (verb-form) succeeds', async () => {
        const session = createRetrySession();
        // First call sequence (primary) → null. Second call sequence (alternate) → success.
        let callCount = 0;
        const callAI: CompromiseAICallFn = vi.fn().mockImplementation(async () => {
            callCount++;
            // Primary chain uses COMPROMISE_CHAIN (3 steps) → all return null
            // Alternate chain uses COMPROMISE_CHAIN (3 steps) → first returns result
            if (callCount <= 3) return null; // primary fails (3 retries)
            return MOCK_COMPROMISE_RESPONSE;  // alternate succeeds
        });

        const result = await executeCompromiseStep(
            [makeEntry('matching', true)],
            'Match: 1. library - A. a place to borrow books',
            'original', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(1);
        // Alternate route for matching → verb-form
        expect(result.compromisedSections[0]!.convertedType).toBe('verb-form');
        expect(result.skippedSections).toHaveLength(0);
    });

    it('true-false → both strategies fail → raw-text-fallback created', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(null);

        const result = await executeCompromiseStep(
            [makeEntry('true-false', true)],
            'Question 1. The earth is round.\nTrue / False',
            'original', session, callAI,
        );

        // Both primary and alternate failed → raw-text-fallback
        expect(result.compromisedSections).toHaveLength(1);
        expect(result.compromisedSections[0]!.convertedType).toBe('raw-text-fallback');
        expect(result.compromisedSections[0]!.extractedQuestions).toBeDefined();
        expect(result.compromisedSections[0]!.extractedQuestions!.length).toBeGreaterThanOrEqual(1);
        expect(result.skippedSections).toHaveLength(0);
    });

    it('listening → skipped (no fallback, just warning)', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn();

        const result = await executeCompromiseStep(
            [makeEntry('listening', false)],
            'Listen to the audio clip.',
            'original', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(0);
        expect(result.skippedSections).toHaveLength(1);
        expect(result.skippedSections[0]!.reason).toContain('audio');
    });

    it('raw-text-fallback preserves original section text', async () => {
        const session = createRetrySession();
        const callAI: CompromiseAICallFn = vi.fn().mockResolvedValue(null);
        const sectionText = 'Question 1. What is your name?\nQuestion 2. How old are you?';

        const result = await executeCompromiseStep(
            [makeEntry('gap-fill-open', true)],
            sectionText, 'original', session, callAI,
        );

        expect(result.compromisedSections).toHaveLength(1);
        const section = result.compromisedSections[0]!;
        expect(section.convertedType).toBe('raw-text-fallback');
        expect(section.convertedText).toBe(sectionText);
        expect(section.extractedQuestions).toBeDefined();
        expect(section.extractedQuestions!.length).toBe(2);
    });
});
