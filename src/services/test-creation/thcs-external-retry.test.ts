/**
 * Unit tests for thcs-external-retry.ts
 */
import { describe, it, expect, vi } from 'vitest';
import {
    buildAuditSummary,
    buildExternalPrompt,
    executeExternalRetry,
} from './thcs-external-retry';
import type { ExternalAICallFn, PipelineCallback } from './thcs-external-retry';
import type { ValidationReport } from './thcs-text-validator';
import type { RepairAuditEntry } from './thcs-prompt-builder';

// ── Helpers ───────────────────────────────────────────────────

function makeReport(overrides: Partial<ValidationReport> = {}): ValidationReport {
    return {
        formatConfidence: 30,
        issues: [
            { code: 'MERGED_QUESTIONS', severity: 'critical', sectionIndex: -1, lineRange: [0, 0] as [number, number], sectionText: 'test', message: 'Merged questions on line 5' },
        ],
        unsupportedTypes: [],
        stats: { sectionCount: 3, questionCount: 10, answerCount: 8, typeTagCount: 2 },
        originalInput: 'Original teacher text that is long enough to estimate questions',
        processedText: 'Processed text from Pass 1',
        aiConfidence: 40,
        confidenceDisagreement: true,
        ...overrides,
    };
}

function makeAuditLog(): RepairAuditEntry[] {
    return [{
        timestamp: Date.now(),
        model: 'groq/llama-3.3-70b-versatile',
        temperature: 0.1,
        fragmentHash: 'abc12345',
        issueCodes: ['MERGED_QUESTIONS'],
        resultConfidence: 35,
        reasoningLog: [],
        hadUncertain: false,
    }];
}

// ── buildAuditSummary ─────────────────────────────────────────

describe('buildAuditSummary', () => {
    it('includes format confidence and issues', () => {
        const summary = buildAuditSummary(makeAuditLog(), makeReport());
        expect(summary).toContain('30%');
        expect(summary).toContain('MERGED_QUESTIONS');
        expect(summary).toContain('threshold: 50%');
    });

    it('includes question count and answer coverage', () => {
        const summary = buildAuditSummary([], makeReport());
        expect(summary).toContain('parsed 10');
        expect(summary).toContain('8/10');
    });

    it('includes internal attempt count', () => {
        const summary = buildAuditSummary(makeAuditLog(), makeReport());
        expect(summary).toContain('Internal repair attempts: 1');
    });

    it('includes unsupported types when present', () => {
        const report = makeReport({
            unsupportedTypes: [{ type: 'listening', sectionIndex: 0, canCompromise: false }],
        });
        const summary = buildAuditSummary([], report);
        expect(summary).toContain('listening');
    });
});

// ── buildExternalPrompt ───────────────────────────────────────

describe('buildExternalPrompt', () => {
    it('includes original text and audit summary', () => {
        const prompt = buildExternalPrompt('My test text', 'audit info here');
        expect(prompt).toContain('My test text');
        expect(prompt).toContain('audit info here');
    });

    it('includes formatting instructions', () => {
        const prompt = buildExternalPrompt('text', 'audit');
        expect(prompt).toContain('[TYPE: xxx]');
        expect(prompt).toContain('Question N.');
        expect(prompt).toContain('PASSAGE:');
    });
});

// ── executeExternalRetry ──────────────────────────────────────

describe('executeExternalRetry', () => {
    it('returns success when first attempt reaches confidence ≥ 50', async () => {
        const callAI: ExternalAICallFn = vi.fn().mockResolvedValue('Extracted test content');
        const runPipeline: PipelineCallback = vi.fn().mockResolvedValue({
            processedText: 'Clean text',
            report: makeReport({ formatConfidence: 75 }),
        });

        const result = await executeExternalRetry(
            'original text', makeAuditLog(), makeReport(),
            callAI, runPipeline,
        );

        expect(result.outcome).toBe('success');
        expect(result.attemptsUsed).toBe(1);
        expect(result.bestConfidence).toBe(75);
        expect(result.teacherMessage).toBeNull();
    });

    it('tries multiple providers before succeeding', async () => {
        const callAI: ExternalAICallFn = vi.fn()
            .mockResolvedValueOnce('First attempt')
            .mockResolvedValueOnce('Second attempt');

        const runPipeline: PipelineCallback = vi.fn()
            .mockResolvedValueOnce({
                processedText: 'attempt 1',
                report: makeReport({ formatConfidence: 35 }),
            })
            .mockResolvedValueOnce({
                processedText: 'attempt 2',
                report: makeReport({ formatConfidence: 65 }),
            });

        const result = await executeExternalRetry(
            'original', makeAuditLog(), makeReport(),
            callAI, runPipeline,
        );

        expect(result.outcome).toBe('success');
        expect(result.attemptsUsed).toBe(2);
        expect(result.bestConfidence).toBe(65);
    });

    it('escalates to teacher when all configured attempts fail', async () => {
        const callAI: ExternalAICallFn = vi.fn().mockResolvedValue('poor content');
        const runPipeline: PipelineCallback = vi.fn().mockResolvedValue({
            processedText: 'still bad',
            report: makeReport({ formatConfidence: 25 }),
        });

        const result = await executeExternalRetry(
            'original', makeAuditLog(), makeReport(),
            callAI, runPipeline,
        );

        expect(result.outcome).toBe('teacher-escalation');
        expect(result.attemptsUsed).toBe(2);
        expect(result.teacherMessage).toContain('could not reliably extract');
        expect(result.auditLog).toHaveLength(2);
    });

    it('handles AI returning null gracefully', async () => {
        const callAI: ExternalAICallFn = vi.fn().mockResolvedValue(null);
        const runPipeline: PipelineCallback = vi.fn();

        const result = await executeExternalRetry(
            'original', [], makeReport(),
            callAI, runPipeline,
        );

        expect(result.outcome).toBe('teacher-escalation');
        expect(runPipeline).not.toHaveBeenCalled();
        expect(result.auditLog).toHaveLength(2);
    });

    it('handles pipeline returning null gracefully', async () => {
        const callAI: ExternalAICallFn = vi.fn().mockResolvedValue('some text');
        const runPipeline: PipelineCallback = vi.fn().mockResolvedValue(null);

        const result = await executeExternalRetry(
            'original', [], makeReport(),
            callAI, runPipeline,
        );

        expect(result.outcome).toBe('teacher-escalation');
        expect(result.auditLog.some(e => e.issueCodes.includes('PIPELINE_FAILURE'))).toBe(true);
    });

    it('enforces the configured provider-chain retry limit', async () => {
        const callAI: ExternalAICallFn = vi.fn().mockResolvedValue('text');
        const runPipeline: PipelineCallback = vi.fn().mockResolvedValue({
            processedText: 'bad',
            report: makeReport({ formatConfidence: 20 }),
        });

        const result = await executeExternalRetry(
            'original', [], makeReport(),
            callAI, runPipeline,
        );

        expect(callAI).toHaveBeenCalledTimes(2);
        expect(result.attemptsUsed).toBe(2);
    });

    it('tracks best confidence even on failure', async () => {
        const callAI: ExternalAICallFn = vi.fn().mockResolvedValue('text');
        const runPipeline: PipelineCallback = vi.fn()
            .mockResolvedValueOnce({ processedText: 'a1', report: makeReport({ formatConfidence: 35 }) })
            .mockResolvedValueOnce({ processedText: 'a2', report: makeReport({ formatConfidence: 45 }) })
            .mockResolvedValueOnce({ processedText: 'a3', report: makeReport({ formatConfidence: 40 }) });

        const result = await executeExternalRetry(
            'original', [], makeReport({ formatConfidence: 25 }),
            callAI, runPipeline,
        );

        expect(result.outcome).toBe('teacher-escalation');
        expect(result.bestConfidence).toBe(45);
        expect(result.bestText).toBe('a2');
    });

    it('teacher message includes issue summary', async () => {
        const callAI: ExternalAICallFn = vi.fn().mockResolvedValue('text');
        const runPipeline: PipelineCallback = vi.fn().mockResolvedValue({
            processedText: 'bad',
            report: makeReport({
                formatConfidence: 20,
                issues: [
                    { code: 'MERGED_QUESTIONS', severity: 'critical', sectionIndex: -1, lineRange: [0, 0] as [number, number], sectionText: '', message: '' },
                    { code: 'MISSING_ANSWER_KEY', severity: 'critical', sectionIndex: -1, lineRange: [0, 0] as [number, number], sectionText: '', message: '' },
                ],
            }),
        });

        const result = await executeExternalRetry(
            'original', [], makeReport(),
            callAI, runPipeline,
        );

        expect(result.teacherMessage).toContain('MERGED_QUESTIONS');
        expect(result.teacherMessage).toContain('MISSING_ANSWER_KEY');
    });

    it('uses different providers for each attempt', async () => {
        const providers: string[] = [];
        const callAI: ExternalAICallFn = vi.fn().mockImplementation(
            (provider: string, model: string) => {
                providers.push(`${provider}/${model}`);
                return Promise.resolve('text');
            },
        );
        const runPipeline: PipelineCallback = vi.fn().mockResolvedValue({
            processedText: 'bad',
            report: makeReport({ formatConfidence: 20 }),
        });

        await executeExternalRetry(
            'original', [], makeReport(),
            callAI, runPipeline,
        );

        expect(providers).toEqual([
            'groq/llama-3.3-70b-versatile',
            'gemini/gemini-2.5-flash',
        ]);
    });
});
