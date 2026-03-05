/**
 * THCS External Retry — FR-15 (Last Resort External API)
 *
 * Completely different from internal retry chain (Pass 2 Repair).
 * When formatConfidence < 50 after ALL internal passes, calls an
 * EXTERNAL AI API with the ORIGINAL teacher text + structured audit log.
 *
 * Flow: originalInput + auditLog → external AI → preClean → revalidate
 *       → if confidence ≥ 50: success
 *       → exhausts chain → teacher escalation
 *
 * Provider chain: Groq llama-3.3-70b-versatile → Gemini gemini-2.5-flash
 * (MAX_ATTEMPTS matches chain length — update both together)
 */

import type { ValidationReport } from './thcs-text-validator';
import type { RepairAuditEntry } from './thcs-prompt-builder';

// ── Types ─────────────────────────────────────────────────────

export interface ExternalRetryAuditEntry {
    attempt: number;
    timestamp: number;
    provider: string;
    issueCodes: string[];
    formatConfidence: number;
    sectionsMissing: string[];
    questionCountMismatch: { expected: number; got: number } | null;
}

export interface ExternalRetryResult {
    outcome: 'success' | 'teacher-escalation';
    bestText: string | null;
    bestConfidence: number;
    attemptsUsed: number;
    auditLog: ExternalRetryAuditEntry[];
    teacherMessage: string | null;
}

/** Callback for the full re-extraction pipeline (preClean → Pass 1 → validate). */
export type PipelineCallback = (rawText: string) => Promise<{
    processedText: string;
    report: ValidationReport;
} | null>;

/** Callback for external AI calls. */
export type ExternalAICallFn = (provider: string, model: string, prompt: string) => Promise<string | null>;

// ── Provider Chain ────────────────────────────────────────────

const EXTERNAL_CHAIN = [
    { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    { provider: 'gemini', model: 'gemini-2.5-flash' },
] as const;

const MAX_ATTEMPTS = EXTERNAL_CHAIN.length; // Must equal EXTERNAL_CHAIN.length — they are coupled

// ── Audit Summary Builder ─────────────────────────────────────

/**
 * Build a human-readable audit summary for the external AI prompt.
 */
export function buildAuditSummary(
    internalAuditLog: RepairAuditEntry[],
    report: ValidationReport,
): string {
    const issueList = report.issues
        .map(i => `- ${i.code}: ${i.message}`)
        .join('\n');

    const internalAttempts = internalAuditLog.length;
    const questionCountEstimate = Math.round(report.originalInput.length / 80); // rough heuristic

    const lines = [
        `=== PARSING AUDIT LOG ===`,
        `Format confidence: ${report.formatConfidence}% (threshold: 50%)`,
        `Issues found (${report.issues.length}):`,
        issueList || '  (none)',
        ``,
        `Question count: Estimated ~${questionCountEstimate} from text length, parsed ${report.stats.questionCount}`,
        `Answer coverage: ${report.stats.answerCount}/${report.stats.questionCount}`,
        `Sections with type tags: ${report.stats.typeTagCount}/${report.stats.sectionCount}`,
        `Internal repair attempts: ${internalAttempts} (all produced insufficient results)`,
    ];

    if (report.unsupportedTypes.length > 0) {
        lines.push(`Unsupported types: ${report.unsupportedTypes.map(t => t.type).join(', ')}`);
    }

    return lines.join('\n');
}

// ── External Prompt Builder ───────────────────────────────────

/**
 * Build the external re-extraction prompt.
 */
export function buildExternalPrompt(originalInput: string, auditSummary: string): string {
    return `A Vietnamese THCS English test was automatically parsed but the results were poor (format confidence below 50%).
Below is the original teacher text and an audit log of what went wrong.
Please re-extract the test content, paying special attention to the flagged issues.

${auditSummary}

=== ORIGINAL TEXT ===
${originalInput}

Please extract and structure the test content. Output as clean, well-formatted text with:
- Clear section headers with [TYPE: xxx] tags (use standard THCS type slugs)
- One question per line with "Question N." prefix
- Options on separate lines (A. / B. / C. / D.)
- Blanks as 6 underscores (______)
- Verb/word forms in brackets: (verb)
- Sentence rewrites with => separator
- PASSAGE: delimiter before reading passages
- Answer key section at the end with one answer per line

RULES:
- PRESERVE all Vietnamese diacritics exactly
- Do NOT invent questions or answers — extract only what exists
- If unsure about something, include it with [UNCERTAIN] tag
- Output plain text only (no JSON, no markdown code blocks)`;
}

// ── Teacher Escalation Message ────────────────────────────────

function buildTeacherMessage(auditLog: ExternalRetryAuditEntry[]): string {
    const issues = new Set<string>();
    let bestConfidence = 0;
    for (const entry of auditLog) {
        for (const code of entry.issueCodes) issues.add(code);
        if (entry.formatConfidence > bestConfidence) bestConfidence = entry.formatConfidence;
    }

    const issueStr = issues.size > 0
        ? `Issues found: ${Array.from(issues).join(', ')}.`
        : 'Multiple formatting problems detected.';

    return `Automatic parsing could not reliably extract this test after ${auditLog.length} attempts (best confidence: ${bestConfidence}%). ${issueStr} Please review the text format and try again, or create the test manually using the editor.`;
}

// ── Main Orchestrator ─────────────────────────────────────────

/**
 * Execute external retry — last resort when internal passes fail.
 * Separate from the internal 5-call circuit breaker.
 */
export async function executeExternalRetry(
    originalInput: string,
    internalAuditLog: RepairAuditEntry[],
    validationReport: ValidationReport,
    callExternalAI: ExternalAICallFn,
    runPipeline: PipelineCallback,
): Promise<ExternalRetryResult> {
    const auditLog: ExternalRetryAuditEntry[] = [];
    let bestText: string | null = null;
    let bestConfidence = validationReport.formatConfidence;

    const auditSummary = buildAuditSummary(internalAuditLog, validationReport);
    const prompt = buildExternalPrompt(originalInput, auditSummary);

    for (let attempt = 0; attempt < Math.min(MAX_ATTEMPTS, EXTERNAL_CHAIN.length); attempt++) {
        const step = EXTERNAL_CHAIN[attempt]!;

        // 1. Call external AI
        let rawResponse: string | null = null;
        try {
            rawResponse = await callExternalAI(step.provider, step.model, prompt);
        } catch (err) {
            console.warn(`[ExternalRetry] Attempt ${attempt + 1} threw:`, err);
        }

        if (!rawResponse) {
            auditLog.push({
                attempt: attempt + 1,
                timestamp: Date.now(),
                provider: `${step.provider}/${step.model}`,
                issueCodes: [],
                formatConfidence: 0,
                sectionsMissing: [],
                questionCountMismatch: null,
            });
            continue;
        }

        // 2. Re-enter pipeline at preClean → Pass 1 → validate
        const pipelineResult = await runPipeline(rawResponse);

        if (!pipelineResult) {
            auditLog.push({
                attempt: attempt + 1,
                timestamp: Date.now(),
                provider: `${step.provider}/${step.model}`,
                issueCodes: ['PIPELINE_FAILURE'],
                formatConfidence: 0,
                sectionsMissing: [],
                questionCountMismatch: null,
            });
            continue;
        }

        const { report } = pipelineResult;

        // 3. Log audit entry
        const questionEstimate = Math.round(originalInput.length / 80);
        auditLog.push({
            attempt: attempt + 1,
            timestamp: Date.now(),
            provider: `${step.provider}/${step.model}`,
            issueCodes: report.issues.map(i => i.code),
            formatConfidence: report.formatConfidence,
            sectionsMissing: report.unsupportedTypes.map(t => t.type),
            questionCountMismatch: questionEstimate !== report.stats.questionCount
                ? { expected: questionEstimate, got: report.stats.questionCount }
                : null,
        });

        // 4. Track best result
        if (report.formatConfidence > bestConfidence) {
            bestConfidence = report.formatConfidence;
            bestText = pipelineResult.processedText;
        }

        // 5. Check success threshold
        if (report.formatConfidence >= 50) {
            return {
                outcome: 'success',
                bestText: pipelineResult.processedText,
                bestConfidence: report.formatConfidence,
                attemptsUsed: attempt + 1,
                auditLog,
                teacherMessage: null,
            };
        }
    }

    // All attempts failed → teacher escalation
    return {
        outcome: 'teacher-escalation',
        bestText,
        bestConfidence,
        attemptsUsed: auditLog.length,
        auditLog,
        teacherMessage: buildTeacherMessage(auditLog),
    };
}
