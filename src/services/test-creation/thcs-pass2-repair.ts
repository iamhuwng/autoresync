/**
 * THCS Pass 2 — Crossfix Loop (FR-5/7/9/13)
 *
 * 3-round iterative repair loop that cross-references AI output
 * against the code validator. Each round escalates temperature
 * and may switch provider.
 *
 * Flow:
 *   validate → build repair prompt → AI fix → re-validate
 *   → better? keep: discard → next round
 *   → repeat until confidence ≥ 70 + zero issues, or 3 rounds
 */

import type { ValidationReport } from './thcs-text-validator';
import { validateRestructuredText } from './thcs-text-validator';
import { buildRepairPrompt, parseAIRepairResponse, createAuditEntry } from './thcs-prompt-builder';
import type { RepairAuditEntry, ReasoningEntry } from './thcs-prompt-builder';
import { executeRetryChain, REPAIR_CHAIN } from './thcs-retry-manager';
import type { RetrySession, RetryStep, AICallOutcome } from './thcs-retry-manager';

// ── Types ─────────────────────────────────────────────────────

export interface RepairAttemptResult {
    fixedText: string;
    report: ValidationReport;
}

/** @deprecated Use CrossfixResult instead. Kept for backward compatibility. */
export interface Pass2Result {
    repairedText: string;
    wasRepaired: boolean;
    finalReport: ValidationReport;
    auditLog: RepairAuditEntry[];
    confidenceWarning: string | null;
    reasoningLog: ReasoningEntry[];
}

export interface CrossfixResult {
    bestText: string;
    wasRepaired: boolean;
    finalReport: ValidationReport;
    auditLog: RepairAuditEntry[];
    reasoningLog: ReasoningEntry[];
    roundsExecuted: number;
    confidenceWarning: string | null;
}

export type AICallFn = (system: string, prompt: string, step: RetryStep) => Promise<string | null>;

// ── Crossfix Steps (escalating model/temperature) ─────────────

const CROSSFIX_STEPS: RetryStep[] = [
    { provider: 'groq', model: 'llama-3.3-70b-versatile', temperature: 0.1 },
    { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
    { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 },
];

// ── Confidence Warning (FR-13) ────────────────────────────────

export function checkConfidenceDisagreement(
    aiConfidence: number,
    codeConfidence: number,
): string | null {
    const gap = Math.abs(aiConfidence - codeConfidence);
    if (gap > 25) {
        if (aiConfidence > codeConfidence) {
            return `AI reports ${aiConfidence}% confidence but code validation found ${codeConfidence}% — AI may be overconfident. Review flagged issues.`;
        } else {
            return `AI reports ${aiConfidence}% confidence but code validation found ${codeConfidence}% — the text may be better than AI suggests.`;
        }
    }
    return null;
}

// ── Crossfix Loop (FR-5) ──────────────────────────────────────

/**
 * Execute the crossfix loop — iterative AI repair with escalating models.
 * Runs up to 3 rounds, keeping the best result (fewest issues).
 */
export async function executeCrossfixLoop(
    initialText: string,
    originalText: string,
    aiConfidence: number,
    callAI: AICallFn,
): Promise<CrossfixResult> {
    const MAX_ROUNDS = 3;
    let bestText = initialText;
    let bestIssueCount = Infinity;
    let bestReport: ValidationReport | null = null;
    const auditLog: RepairAuditEntry[] = [];
    const allReasoning: ReasoningEntry[] = [];
    let roundsExecuted = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
        roundsExecuted = round + 1;

        // 1. Validate current bestText
        const report = validateRestructuredText(bestText, originalText, aiConfidence);
        if (bestReport === null) {
            bestReport = report;
            bestIssueCount = report.issues.length;
        }

        // 2. Exit if good enough
        if (report.formatConfidence >= 70 && report.issues.length === 0) {
            bestReport = report;
            break;
        }

        // 3. Build targeted repair prompt
        const issueCodes = report.issues.map(i => i.code);
        const repairPrompt = buildRepairPrompt(issueCodes, originalText, bestText);

        // 4. AI fixes (escalating config per round)
        const step = CROSSFIX_STEPS[round]!;
        const rawResponse = await callAI(
            'You are an expert at fixing Vietnamese THCS English test formatting.',
            repairPrompt,
            step,
        );
        if (!rawResponse) break; // AI failed, use bestText

        // 5. Parse response
        const parsed = parseAIRepairResponse(rawResponse);
        allReasoning.push(...parsed.reasoningLog);

        // 6. Re-validate fixed text
        const newReport = validateRestructuredText(parsed.fixedText, originalText, aiConfidence);

        // 7. Better or worse?
        if (newReport.issues.length < bestIssueCount) {
            bestText = parsed.fixedText;
            bestIssueCount = newReport.issues.length;
            bestReport = newReport;
        }
        // If worse: keep previous best, continue to next round

        // 8. Log audit
        auditLog.push(createAuditEntry(
            `crossfix-round-${round}`,
            step.temperature,
            issueCodes,
            newReport.formatConfidence,
            parsed.reasoningLog,
        ));
    }

    // Ensure bestReport is never null (covers edge case of empty input)
    if (!bestReport) {
        bestReport = validateRestructuredText(bestText, originalText, aiConfidence);
    }

    const confidenceWarning = checkConfidenceDisagreement(aiConfidence, bestReport.formatConfidence);

    return {
        bestText,
        wasRepaired: bestText !== initialText,
        finalReport: bestReport,
        auditLog,
        reasoningLog: allReasoning,
        roundsExecuted,
        confidenceWarning,
    };
}

// ── Legacy Pass 2 (bridge — used until orchestrator is fully migrated) ──

/**
 * @deprecated Use executeCrossfixLoop instead. Kept for backward compatibility.
 */
export async function executePass2Repair(
    validationReport: ValidationReport,
    aiConfidence: number,
    retrySession: RetrySession,
    callAI: AICallFn,
    currentText?: string,
): Promise<Pass2Result> {
    const auditLog: RepairAuditEntry[] = [];
    const allReasoning: ReasoningEntry[] = [];

    const repairableIssues = validationReport.issues;

    if (repairableIssues.length === 0) {
        return {
            repairedText: currentText ?? validationReport.processedText,
            wasRepaired: false,
            finalReport: validationReport,
            auditLog: [],
            confidenceWarning: checkConfidenceDisagreement(aiConfidence, validationReport.formatConfidence),
            reasoningLog: [],
        };
    }

    const issueCodes = repairableIssues.map(i => i.code);
    const repairPrompt = buildRepairPrompt(
        issueCodes,
        validationReport.originalInput,
        currentText ?? validationReport.processedText,
    );

    const chainResult = await executeRetryChain<RepairAttemptResult>(
        retrySession,
        REPAIR_CHAIN,
        async (step: RetryStep): Promise<AICallOutcome<RepairAttemptResult> | null> => {
            const rawResponse = await callAI(
                'You are an expert at fixing Vietnamese THCS English test formatting.',
                repairPrompt,
                step,
            );
            if (!rawResponse) return null;

            const parsed = parseAIRepairResponse(rawResponse);
            allReasoning.push(...parsed.reasoningLog);

            const newReport = validateRestructuredText(
                parsed.fixedText,
                validationReport.originalInput,
                aiConfidence,
            );

            auditLog.push(createAuditEntry(
                `${step.provider}/${step.model}`,
                step.temperature,
                issueCodes,
                newReport.formatConfidence,
                parsed.reasoningLog,
            ));

            return {
                result: {
                    fixedText: parsed.fixedText,
                    report: newReport,
                },
                issueCount: newReport.issues.length,
            };
        },
    );

    let finalText = validationReport.processedText;
    let finalReport = validationReport;
    let wasRepaired = false;

    if (chainResult.bestResult) {
        finalText = chainResult.bestResult.fixedText;
        finalReport = chainResult.bestResult.report;
        wasRepaired = finalReport.issues.length < validationReport.issues.length;
    }

    const confidenceWarning = checkConfidenceDisagreement(aiConfidence, finalReport.formatConfidence);

    return {
        repairedText: finalText,
        wasRepaired,
        finalReport,
        auditLog,
        confidenceWarning,
        reasoningLog: allReasoning,
    };
}
