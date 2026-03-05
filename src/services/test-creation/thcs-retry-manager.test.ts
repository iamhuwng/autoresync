/**
 * Unit tests for thcs-retry-manager.ts
 */
import { describe, it, expect, vi } from 'vitest';
import {
    createRetrySession,
    executeRetryChain,
    compareIssueCount,
    getSessionStats,
    REPAIR_CHAIN,
    COMPROMISE_CHAIN,
    type RetryStep,
    type AICallOutcome,
} from './thcs-retry-manager';

describe('createRetrySession', () => {
    it('creates session with empty state', () => {
        const s = createRetrySession();
        expect(s.totalCalls).toBe(0);
        expect(s.callLog).toEqual([]);
    });
});

describe('compareIssueCount', () => {
    it('returns better when after < before', () => {
        expect(compareIssueCount(5, 3)).toBe('better');
    });
    it('returns worse when after > before', () => {
        expect(compareIssueCount(3, 5)).toBe('worse');
    });
    it('returns same when equal', () => {
        expect(compareIssueCount(3, 3)).toBe('same');
    });
    it('returns better when before is Infinity (first result)', () => {
        expect(compareIssueCount(Infinity, 10)).toBe('better');
    });
});

describe('getSessionStats', () => {
    it('reports total calls correctly', () => {
        const s = createRetrySession();
        s.totalCalls = 2;
        const stats = getSessionStats(s);
        expect(stats.totalCalls).toBe(2);
    });
});

describe('executeRetryChain', () => {
    const makeStep = (provider: 'groq' | 'gemini', temp: number): RetryStep => ({
        provider,
        model: 'test-model',
        temperature: temp,
    });

    const twoStepChain = {
        steps: [makeStep('groq', 0.1), makeStep('gemini', 0.2)],
        fallback: 'teacher' as const,
    };

    it('returns success when first call succeeds with 0 issues', async () => {
        const session = createRetrySession();
        const callAI = vi.fn().mockResolvedValue({ result: 'fixed', issueCount: 0 });

        const result = await executeRetryChain(session, twoStepChain, callAI);

        expect(result.outcome).toBe('success');
        expect(result.bestResult).toBe('fixed');
        expect(callAI).toHaveBeenCalledTimes(1);
        expect(session.totalCalls).toBe(1);
    });

    it('tries second step when first fails', async () => {
        const session = createRetrySession();
        const callAI = vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ result: 'fixed-by-gemini', issueCount: 1 });

        const result = await executeRetryChain(session, twoStepChain, callAI);

        expect(result.outcome).toBe('success');
        expect(result.bestResult).toBe('fixed-by-gemini');
        expect(callAI).toHaveBeenCalledTimes(2);
        expect(session.totalCalls).toBe(2);
    });

    it('keeps better result when second is worse', async () => {
        const session = createRetrySession();
        const callAI = vi.fn()
            .mockResolvedValueOnce({ result: 'good', issueCount: 2 })
            .mockResolvedValueOnce({ result: 'bad', issueCount: 5 });

        const result = await executeRetryChain(session, twoStepChain, callAI);

        expect(result.outcome).toBe('success');
        expect(result.bestResult).toBe('good');
    });

    it('adopts better result from second step', async () => {
        const session = createRetrySession();
        const callAI = vi.fn()
            .mockResolvedValueOnce({ result: 'okay', issueCount: 5 })
            .mockResolvedValueOnce({ result: 'great', issueCount: 1 });

        const result = await executeRetryChain(session, twoStepChain, callAI);

        expect(result.outcome).toBe('success');
        expect(result.bestResult).toBe('great');
    });

    it('returns all-failed when every step fails', async () => {
        const session = createRetrySession();
        const callAI = vi.fn().mockResolvedValue(null);

        const result = await executeRetryChain(session, twoStepChain, callAI);

        expect(result.outcome).toBe('all-failed');
        expect(result.bestResult).toBeNull();
        expect(result.escalatedTo).toBe('teacher');
    });

    it('handles callAI throwing an error gracefully', async () => {
        const session = createRetrySession();
        const callAI = vi.fn()
            .mockRejectedValueOnce(new Error('API timeout'))
            .mockResolvedValueOnce({ result: 'recovered', issueCount: 0 });

        const result = await executeRetryChain(session, twoStepChain, callAI);

        expect(result.outcome).toBe('success');
        expect(result.bestResult).toBe('recovered');
        expect(result.callLog[0].verdict).toBe('failed');
    });

    it('logs entries to both local and session callLog', async () => {
        const session = createRetrySession();
        const callAI = vi.fn().mockResolvedValue({ result: 'ok', issueCount: 2 });

        const result = await executeRetryChain(session, twoStepChain, callAI);

        expect(result.callLog.length).toBe(2);
        expect(session.callLog.length).toBe(2);
        expect(result.callLog[0].provider).toBe('groq');
        expect(result.callLog[1].provider).toBe('gemini');
    });

    it('shares session state across multiple chain executions', async () => {
        const session = createRetrySession();

        const callAI1 = vi.fn().mockResolvedValue({ result: 'r1', issueCount: 1 });
        await executeRetryChain(session, twoStepChain, callAI1);
        expect(session.totalCalls).toBe(2);

        // Second chain — only 1 call remaining
        const callAI2 = vi.fn()
            .mockResolvedValueOnce({ result: 'r2', issueCount: 0 });
        const result2 = await executeRetryChain(session, twoStepChain, callAI2);
        expect(session.totalCalls).toBe(3);
        expect(result2.outcome).toBe('success');
    });
});

describe('Built-in chains', () => {
    it('REPAIR_CHAIN has 2 steps and teacher fallback', () => {
        expect(REPAIR_CHAIN.steps.length).toBe(2);
        expect(REPAIR_CHAIN.fallback).toBe('teacher');
        expect(REPAIR_CHAIN.steps[0].provider).toBe('groq');
        expect(REPAIR_CHAIN.steps[1].provider).toBe('gemini');
    });

    it('COMPROMISE_CHAIN has 2 steps and skip fallback', () => {
        expect(COMPROMISE_CHAIN.steps.length).toBe(3);
        expect(COMPROMISE_CHAIN.fallback).toBe('skip');
    });
});
