/**
 * Unit tests for thcs-pass2-repair.ts
 * Tests both the new executeCrossfixLoop and the legacy executePass2Repair.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    checkConfidenceDisagreement,
    executePass2Repair,
    executeCrossfixLoop,
} from './thcs-pass2-repair';
import type { AICallFn } from './thcs-pass2-repair';
import type { ValidationReport, ValidationIssue } from './thcs-text-validator';
import { createRetrySession } from './thcs-retry-manager';

// ── Mock validateRestructuredText for crossfix tests ──────────
// The real validator is complex — we mock it so we can control issue counts.
const mockValidate = vi.fn<(text: string, original: string, aiConf: number) => ValidationReport>();
vi.mock('./thcs-text-validator', async () => {
    const actual = await vi.importActual<typeof import('./thcs-text-validator')>('./thcs-text-validator');
    return {
        ...actual,
        validateRestructuredText: (...args: [string, string, number]) => mockValidate(...args),
    };
});

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

// ── executeCrossfixLoop ───────────────────────────────────────

describe('executeCrossfixLoop', () => {
    beforeEach(() => {
        mockValidate.mockReset();
    });

    it('exits immediately if confidence ≥ 70 and 0 issues', async () => {
        mockValidate.mockReturnValue(makeReport({
            formatConfidence: 80,
            issues: [],
        }));

        const callAI: AICallFn = vi.fn();
        const result = await executeCrossfixLoop('good text', 'original', 80, callAI);

        expect(callAI).not.toHaveBeenCalled();
        expect(result.wasRepaired).toBe(false);
        expect(result.bestText).toBe('good text');
        expect(result.roundsExecuted).toBe(1); // entered round 0, validated, exited
    });

    it('calls AI when issues exist and updates bestText if improved', async () => {
        // Round 0: validate → 2 issues → call AI
        // Re-validate AI output → 0 issues (better)
        // Round 1: validate new text → 0 issues → exit
        let callCount = 0;
        mockValidate.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // Initial validation — 2 issues
                return makeReport({
                    formatConfidence: 55,
                    issues: [makeIssue('MERGED_QUESTIONS'), makeIssue('MISSING_ANSWER_KEY')],
                });
            }
            // AI fixed it — 0 issues
            return makeReport({ formatConfidence: 85, issues: [] });
        });

        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);
        const result = await executeCrossfixLoop('bad text', 'original', 70, callAI);

        expect(callAI).toHaveBeenCalledTimes(1);
        expect(result.wasRepaired).toBe(true);
        expect(result.auditLog.length).toBe(1);
    });

    it('keeps bestText unchanged if AI returns worse text', async () => {
        let callCount = 0;
        mockValidate.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // Initial: 2 issues
                return makeReport({
                    formatConfidence: 55,
                    issues: [makeIssue('A'), makeIssue('B')],
                });
            }
            // AI made it worse: 3 issues each time
            return makeReport({
                formatConfidence: 40,
                issues: [makeIssue('A'), makeIssue('B'), makeIssue('C')],
            });
        });

        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);
        const result = await executeCrossfixLoop('input text', 'original', 50, callAI);

        // bestText should stay as 'input text' since AI made it worse
        expect(result.bestText).toBe('input text');
        expect(result.wasRepaired).toBe(false);
    });

    it('handles AI returning null — exits loop early', async () => {
        mockValidate.mockReturnValue(makeReport({
            formatConfidence: 55,
            issues: [makeIssue('MERGED_QUESTIONS')],
        }));

        const callAI: AICallFn = vi.fn().mockResolvedValue(null);
        const result = await executeCrossfixLoop('input', 'original', 50, callAI);

        expect(result.bestText).toBe('input');
        expect(result.wasRepaired).toBe(false);
        expect(callAI).toHaveBeenCalledTimes(1);
    });

    it('runs up to 3 rounds maximum', async () => {
        // Always return issues so the loop doesn't exit early
        mockValidate.mockReturnValue(makeReport({
            formatConfidence: 55,
            issues: [makeIssue('PERSISTENT_ISSUE')],
        }));

        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);
        const result = await executeCrossfixLoop('input', 'original', 50, callAI);

        expect(result.roundsExecuted).toBe(3);
        expect(callAI).toHaveBeenCalledTimes(3);
        expect(result.auditLog).toHaveLength(3);
    });

    it('escalates provider/temperature across rounds', async () => {
        mockValidate.mockReturnValue(makeReport({
            formatConfidence: 55,
            issues: [makeIssue('ISSUE')],
        }));

        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);
        await executeCrossfixLoop('input', 'original', 50, callAI);

        // Round 0: groq, 0.1
        expect(callAI.mock.calls[0]![2].provider).toBe('groq');
        expect(callAI.mock.calls[0]![2].temperature).toBe(0.1);
        // Round 1: gemini, 0.2
        expect(callAI.mock.calls[1]![2].provider).toBe('gemini');
        expect(callAI.mock.calls[1]![2].temperature).toBe(0.2);
        // Round 2: gemini, 0.3
        expect(callAI.mock.calls[2]![2].provider).toBe('gemini');
        expect(callAI.mock.calls[2]![2].temperature).toBe(0.3);
    });

    it('collects reasoning log across rounds', async () => {
        mockValidate.mockReturnValue(makeReport({
            formatConfidence: 55,
            issues: [makeIssue('ISSUE')],
        }));

        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);
        const result = await executeCrossfixLoop('input', 'original', 50, callAI);

        expect(result.reasoningLog.length).toBeGreaterThanOrEqual(1);
    });

    it('returns confidenceWarning when AI/code gap > 25', async () => {
        mockValidate.mockReturnValue(makeReport({
            formatConfidence: 85,
            issues: [],
        }));

        const callAI: AICallFn = vi.fn();
        const result = await executeCrossfixLoop('text', 'original', 30, callAI);

        // Gap = |30 - 85| = 55 > 25
        expect(result.confidenceWarning).toContain('better than AI suggests');
    });
});

// ── executePass2Repair (legacy — kept for backward compat) ────

describe('executePass2Repair', () => {
    beforeEach(() => {
        mockValidate.mockReset();
    });

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

        // Mock the re-validation that happens inside executePass2Repair
        mockValidate.mockReturnValue(makeReport({ formatConfidence: 75, issues: [] }));

        const result = await executePass2Repair(report, 70, session, callAI);

        expect(callAI).toHaveBeenCalled();
        expect(result.auditLog.length).toBeGreaterThanOrEqual(1);
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
        expect(result.wasRepaired).toBe(false);
        expect(result.repairedText).toBe(report.processedText);
    });

    it('returns finalReport from best repair attempt', async () => {
        const report = makeReport({
            issues: [makeIssue('MERGED_QUESTIONS')],
            formatConfidence: 55,
        });
        const session = createRetrySession();
        const callAI: AICallFn = vi.fn().mockResolvedValue(MOCK_REPAIR_RESPONSE);

        // Mock re-validation
        mockValidate.mockReturnValue(makeReport({ formatConfidence: 78, issues: [] }));

        const result = await executePass2Repair(report, 70, session, callAI);
        expect(result.finalReport).toBeDefined();
        expect(typeof result.finalReport.formatConfidence).toBe('number');
    });
});
