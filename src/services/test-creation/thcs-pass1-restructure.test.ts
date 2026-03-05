/**
 * Unit tests for thcs-pass1-restructure.ts
 */
import { describe, it, expect, vi } from 'vitest';
import {
    buildPass1Prompt,
    getPass1SystemMessage,
    parsePass1Response,
    executePass1,
} from './thcs-pass1-restructure';
import { createRetrySession } from './thcs-retry-manager';

describe('buildPass1Prompt', () => {
    it('wraps input text in triple-quote block', () => {
        const result = buildPass1Prompt('Hello test');
        expect(result).toContain('"""');
        expect(result).toContain('Hello test');
    });

    it('includes the static prompt instructions', () => {
        const result = buildPass1Prompt('input');
        expect(result).toContain('RESTRUCTURING TASKS');
        expect(result).toContain('[CONFIDENCE: N]');
        expect(result).toContain('PRODUCE stats');
    });
});

describe('getPass1SystemMessage', () => {
    it('returns a non-empty system message', () => {
        expect(getPass1SystemMessage().length).toBeGreaterThan(10);
        expect(getPass1SystemMessage()).toContain('plain text');
    });
});

describe('parsePass1Response', () => {
    it('extracts confidence from first line', () => {
        const response = '[CONFIDENCE: 85]\nSome text here\n[STATS: 10 questions, 8 answers, 3 sections]';
        const result = parsePass1Response(response);
        expect(result.confidence).toBe(85);
    });

    it('extracts confidence without brackets', () => {
        const response = 'CONFIDENCE: 72\nSome text';
        const result = parsePass1Response(response);
        expect(result.confidence).toBe(72);
    });

    it('returns 0 confidence when missing', () => {
        const response = 'Just some text without confidence';
        const result = parsePass1Response(response);
        expect(result.confidence).toBe(0);
    });

    it('clamps confidence to 0-100', () => {
        expect(parsePass1Response('[CONFIDENCE: 150]\ntext').confidence).toBe(100);
        expect(parsePass1Response('[CONFIDENCE: -5]\ntext').confidence).toBe(0);
    });

    it('extracts stats from last line', () => {
        const response = '[CONFIDENCE: 80]\nContent\n[STATS: 40 questions, 35 answers, 8 sections]';
        const result = parsePass1Response(response);
        expect(result.stats).toEqual({ questions: 40, answers: 35, sections: 8 });
    });

    it('handles singular nouns in stats', () => {
        const response = '[CONFIDENCE: 80]\nContent\n[STATS: 1 question, 1 answer, 1 section]';
        const result = parsePass1Response(response);
        expect(result.stats).toEqual({ questions: 1, answers: 1, sections: 1 });
    });

    it('returns null stats when missing', () => {
        const response = '[CONFIDENCE: 80]\nContent without stats';
        const result = parsePass1Response(response);
        expect(result.stats).toBeNull();
    });

    it('detects [AI-INFERRED] tags', () => {
        const withTag = '[CONFIDENCE: 60]\n1. B [AI-INFERRED]\n2. C';
        expect(parsePass1Response(withTag).hasInferredAnswers).toBe(true);

        const without = '[CONFIDENCE: 80]\n1. B\n2. C';
        expect(parsePass1Response(without).hasInferredAnswers).toBe(false);
    });

    it('returns full text as restructuredText', () => {
        const response = '[CONFIDENCE: 85]\nLine 1\nLine 2\n[STATS: 2 questions, 2 answers, 1 section]';
        const result = parsePass1Response(response);
        expect(result.restructuredText).toContain('Line 1');
        expect(result.restructuredText).toContain('Line 2');
    });
});

describe('executePass1', () => {
    it('returns parsed result on successful AI call', async () => {
        const session = createRetrySession();
        const mockResponse = '[CONFIDENCE: 90]\nRestructured content here\n[STATS: 10 questions, 8 answers, 3 sections]';
        const callAI = vi.fn().mockResolvedValue(mockResponse);

        const result = await executePass1('raw text', session, callAI);

        expect(result.confidence).toBe(90);
        expect(result.restructuredText).toContain('Restructured content');
        expect(result.stats).toEqual({ questions: 10, answers: 8, sections: 3 });
        expect(session.totalCalls).toBe(1);
    });

    it('returns fallback on AI failure', async () => {
        const session = createRetrySession();
        const callAI = vi.fn().mockRejectedValue(new Error('timeout'));

        const result = await executePass1('original text', session, callAI);

        expect(result.confidence).toBe(0);
        expect(result.restructuredText).toBe('original text');
        expect(result.stats).toBeNull();
        expect(result.hasInferredAnswers).toBe(false);
    });

    it('returns fallback on null AI response', async () => {
        const session = createRetrySession();
        const callAI = vi.fn().mockResolvedValue(null);

        const result = await executePass1('original text', session, callAI);

        expect(result.confidence).toBe(0);
        expect(result.restructuredText).toBe('original text');
    });

    it('returns fallback on too-short AI response', async () => {
        const session = createRetrySession();
        const callAI = vi.fn().mockResolvedValue('short');

        const result = await executePass1('original text', session, callAI);

        expect(result.confidence).toBe(0);
        expect(result.restructuredText).toBe('original text');
    });

    it('increments session totalCalls', async () => {
        const session = createRetrySession();
        const callAI = vi.fn().mockResolvedValue('[CONFIDENCE: 80]\nSome long enough response text here');

        await executePass1('input', session, callAI);

        expect(session.totalCalls).toBe(1);
    });

    it('passes system message and prompt to callAI', async () => {
        const session = createRetrySession();
        const callAI = vi.fn().mockResolvedValue('[CONFIDENCE: 80]\nSome long enough response text here');

        await executePass1('my test text', session, callAI);

        expect(callAI).toHaveBeenCalledTimes(1);
        const [sysMsg, prompt] = callAI.mock.calls[0];
        expect(sysMsg).toContain('plain text');
        expect(prompt).toContain('my test text');
        expect(prompt).toContain('RESTRUCTURING TASKS');
    });
});
