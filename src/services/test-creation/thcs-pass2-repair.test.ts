/**
 * Unit tests for thcs-pass2-repair.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { checkConfidenceDisagreement, executePass2Repair } from './thcs-pass2-repair';
import type { AICallFn } from './thcs-pass2-repair';
import type { ValidationReport, ValidationIssue } from './thcs-text-validator';
import { createRetrySession } from './thcs-retry-manager';

// ── Helpers ───────────────────────────────────────────────────

function makeReport(overrides: Partial<ValidationReport> = {}): ValidationReport {
    return {
        formatConfidence: 60,
        issues: [],
        sectionBoundaries: [],
        unsupportedTypes: [],
        originalInput: 'Original raw text',
        processedText: 'Processed text from Pass 1',
        ...overrides,
    };
}

function makeIssue(code: string, severity: 'error' | 'warning' = 'warning'): ValidationIssue {
    return {
        code,
        severity,
        message: `Issue: ${code}`,
        location: { line: 1, context: 'test' },
    };
}

// Mock response that matches the ACTUAL delimiter patterns used by parseAIRepairResponse
const MOCK_REPAIR_RESPONSE = `--- FIXED TEXT ---
Question 1. What is the answer?
A. go
B. goes
C. going
D. gone

--- REASONING LOG ---
ISSUE: MERGED_QUESTIONS
ACTION: Split merged questions
REASONING: Two questions were on one line
CONFIDENCE: high
ORIGINAL_REF: "Question 1. What? A. go Question 2."`;

// ── checkConfidenceDisagreement ───────────────────────────────

describe('checkConfidenceDisagreement', () => {
    it('returns null when gap ≤ 25', () => {
        expect(checkConfidenceDisagreement(70, 55)).toBeNull();
        expect(checkConfidenceDisagreement(80, 80)).toBeNull();
    });

    it('warns when AI overconfident (AI > code by >25)', () => {
        const result = checkConfidenceDisagreement(90, 50);
        expect(result).toContain('overconfident');
        expect(result).toContain('90');
        expect(result).toContain('50');
    });

    it('warns when AI underconfident (code > AI by >25)', () => {
        const result = checkConfidenceDisagreement(50, 85);
        expect(result).toContain('better than AI suggests');
    });

    it('returns null at exactly 25pt boundary', () => {
        expect(checkConfidenceDisagreement(75, 50)).toBeNull();
    });
});

// ── executePass2Repair ────────────────────────────────────────

describe('executePass2Repair', () => {
    it('skips repair if no issues', async () => {
        const report = makeReport({ issues: [] });
        const session = createRetrySession();
        const callAI: AICallFn = vi.fn();

        const result = await executePass2Repair(report, 85, session, callAI);

        expect(result.wasRepaired).toBe(false);
        expect(result.repairedText).toBe(report.processedText);
        expect(result.auditLog).toHaveLength(0);
        expect(callAI).not.toHaveBeenCalled();
    });

    it('calls AI and processes repair when issues exist', async () => {
        const report = makeReport({
            issues: [makeIssue('MERGED_QUESTIONS'), makeIssue('MISSING_ANSWER_KEY')],
        });
        const session = createRetrySession();
        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);

        const result = await executePass2Repair(report, 70, session, callAI);

        expect(callAI).toHaveBeenCalled();
        expect(result.auditLog.length).toBeGreaterThanOrEqual(1);
    });

    it('logs audit entry per AI call with fragment hash', async () => {
        const report = makeReport({
            issues: [makeIssue('MISSING_ANSWER_KEY')],
        });
        const session = createRetrySession();
        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);

        const result = await executePass2Repair(report, 70, session, callAI);
        expect(result.auditLog.length).toBeGreaterThanOrEqual(1);
        expect(result.auditLog[0]!.fragmentHash).toBeDefined();
        expect(typeof result.auditLog[0]!.fragmentHash).toBe('string');
    });

    it('sets confidenceWarning when gap > 25', async () => {
        const report = makeReport({
            issues: [],
            formatConfidence: 50,
        });
        const session = createRetrySession();
        const callAI: AICallFn = vi.fn();

        const result = await executePass2Repair(report, 90, session, callAI);
        expect(result.confidenceWarning).toContain('overconfident');
    });

    it('handles AI returning null (failure)', async () => {
        const report = makeReport({
            issues: [makeIssue('MERGED_QUESTIONS')],
        });
        const session = createRetrySession();
        const callAI: AICallFn = vi.fn().mockResolvedValue(null);

        const result = await executePass2Repair(report, 70, session, callAI);
        // All calls failed → wasRepaired false, original text returned
        expect(result.wasRepaired).toBe(false);
        expect(result.repairedText).toBe(report.processedText);
    });

    it('collects reasoning log across attempts', async () => {
        const report = makeReport({
            issues: [makeIssue('MERGED_QUESTIONS')],
        });
        const session = createRetrySession();
        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);

        const result = await executePass2Repair(report, 70, session, callAI);
        expect(result.reasoningLog.length).toBeGreaterThanOrEqual(1);
        expect(result.reasoningLog[0]!.issueCode).toBe('MERGED_QUESTIONS');
    });

    it('returns finalReport from best repair attempt', async () => {
        const report = makeReport({
            issues: [makeIssue('MERGED_QUESTIONS')],
            formatConfidence: 55,
        });
        const session = createRetrySession();
        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);

        const result = await executePass2Repair(report, 70, session, callAI);
        expect(result.finalReport).toBeDefined();
        expect(typeof result.finalReport.formatConfidence).toBe('number');
    });
});
