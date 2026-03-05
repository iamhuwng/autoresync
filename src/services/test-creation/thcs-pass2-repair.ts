/**
 * THCS Pass 2 — Adaptive Repair (FR-5/7/9/13)
 *
 * Glue module connecting code validator → prompt builder → retry manager.
 * Runs when: 50 ≤ formatConfidence < 80 AND issues exist.
 *
 * Flow:
 *   ValidationReport → filter repairable issues → buildRepairPrompt
 *   → AI call via retry chain → parseAIRepairResponse → re-validate
 *   → better/worse decision → log audit → check confidence gap
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

export interface Pass2Result {
    repairedText: string;
    wasRepaired: boolean;
    finalReport: ValidationReport;
    auditLog: RepairAuditEntry[];
    confidenceWarning: string | null;
    reasoningLog: ReasoningEntry[];
}

export type AICallFn = (system: string, prompt: string, step: RetryStep) => Promise<string | null>;

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

// ── Main Orchestrator ─────────────────────────────────────────

/**
 * Execute Pass 2 adaptive repair.
 */
export async function executePass2Repair(
    validationReport: ValidationReport,
    aiConfidence: number,
    retrySession: RetrySession,
    callAI: AICallFn,
    // When the Compromise Step has already modified bestText, pass it here so
    // Pass 2 repairs the post-compromise version, not the pre-compromise snapshot
    // stored in validationReport.processedText.
    currentText?: string,
): Promise<Pass2Result> {
    const auditLog: RepairAuditEntry[] = [];
    const allReasoning: ReasoningEntry[] = [];

    // 1. Filter repairable issues (exclude unsupported type issues — those go to Compromise)
    const repairableIssues = validationReport.issues;

    // Early return if nothing to repair
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

    // 2. Build repair prompt — use currentText if provided (post-compromise best text).
    const issueCodes = repairableIssues.map(i => i.code);
    const repairPrompt = buildRepairPrompt(
        issueCodes,
        validationReport.originalInput,
        currentText ?? validationReport.processedText,
    );


    // 3. Execute retry chain with repair callback
    // The retry manager handles comparison (fewer issues = better) internally.
    const chainResult = await executeRetryChain<RepairAttemptResult>(
        retrySession,
        REPAIR_CHAIN,
        // callFn: execute one repair attempt → returns AICallOutcome or null
        async (step: RetryStep): Promise<AICallOutcome<RepairAttemptResult> | null> => {
            const rawResponse = await callAI(
                'You are an expert at fixing Vietnamese THCS English test formatting.',
                repairPrompt,
                step,
            );
            if (!rawResponse) return null;

            // Parse AI response
            const parsed = parseAIRepairResponse(rawResponse);
            allReasoning.push(...parsed.reasoningLog);

            // Re-validate fixed text
            const newReport = validateRestructuredText(
                parsed.fixedText,
                validationReport.originalInput,
                aiConfidence,
            );

            // Log audit entry
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

    // 4. Determine best result
    let finalText = validationReport.processedText;
    let finalReport = validationReport;
    let wasRepaired = false;

    if (chainResult.bestResult) {
        finalText = chainResult.bestResult.fixedText;
        finalReport = chainResult.bestResult.report;
        wasRepaired = finalReport.issues.length < validationReport.issues.length;
    }

    // 5. Check confidence disagreement (FR-13)
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
