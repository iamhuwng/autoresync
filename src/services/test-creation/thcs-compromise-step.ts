/**
 * THCS Compromise Step — FR-6/10
 *
 * Routes unsupported question types to either:
 *   1. Compromise conversion (AI transforms to supported type)
 *   2. Skip with teacher warning (truly unrepresentable types)
 *
 * Uses: buildCompromisePrompt + parseCompromiseResponse from prompt builder,
 *       executeRetryChain + COMPROMISE_CHAIN from retry manager.
 */

import type { UnsupportedTypeEntry, UnsupportedType } from './thcs-text-validator';
import { buildCompromisePrompt, parseCompromiseResponse, COMPROMISE_TEMPLATES } from './thcs-prompt-builder';
import type { CompromiseRoute, RepairAuditEntry } from './thcs-prompt-builder';
import { executeRetryChain, COMPROMISE_CHAIN } from './thcs-retry-manager';
import type { RetrySession, RetryStep, AICallOutcome } from './thcs-retry-manager';

// ── Types ─────────────────────────────────────────────────────

export interface CompromisedSection {
    sectionIndex: number;
    originalType: string;
    convertedType: string;
    convertedText: string;
    reasoning: {
        originalType: string;
        convertedType: string;
        preserved: string;
        lost: string;
        confidence: string;
        teacherNotes: string;
    };
}

export interface SkippedSection {
    sectionIndex: number;
    type: string;
    reason: string;
}

export interface CompromiseResult {
    compromisedSections: CompromisedSection[];
    skippedSections: SkippedSection[];
    auditLog: RepairAuditEntry[];
}

export type CompromiseAICallFn = (system: string, prompt: string, step: RetryStep) => Promise<string | null>;

// ── Skip Reasons (teacher-readable) ───────────────────────────

const SKIP_REASONS: Record<string, string> = {
    'listening': 'Listening comprehension requires audio files — cannot be digitized. Section skipped.',
    'speaking': 'Speaking tasks require oral interaction — cannot be digitized. Section skipped.',
    'essay': 'Extended essay writing needs manual grading setup — section skipped.',
    'composition': 'Composition tasks need manual grading — section skipped.',
    'picture-description-open': 'Open-ended picture description cannot be auto-graded. Section skipped.',
};

// ── Route Mapping ─────────────────────────────────────────────

/**
 * Map UnsupportedType → CompromiseRoute.
 * picture-description requires options check to split into mcq vs open.
 */
function toCompromiseRoute(type: UnsupportedType, hasOptions: boolean): CompromiseRoute | null {
    switch (type) {
        case 'matching': return 'matching';
        case 'true-false': return 'true-false';
        case 'translation': return 'translation';
        case 'matching-headings': return 'matching-headings';
        case 'gap-fill-open': return 'gap-fill-open';
        case 'word-ordering': return 'word-ordering';
        case 'picture-description':
            return hasOptions ? 'picture-description-mcq' : 'picture-description-open';
        default: return null; // uncompromisable
    }
}

// ── Main Orchestrator ─────────────────────────────────────────

/**
 * Process all unsupported types: compromise or skip.
 */
export async function executeCompromiseStep(
    unsupportedTypes: UnsupportedTypeEntry[],
    processedText: string,
    originalInput: string,
    retrySession: RetrySession,
    callAI: CompromiseAICallFn,
    // Map of sectionIndex → section-scoped text (header + content lines).
    // When provided, each compromise prompt receives only the relevant section
    // instead of the full document, preventing token waste and cross-section mutations.
    sectionTexts?: Map<number, string>,
): Promise<CompromiseResult> {
    const compromisedSections: CompromisedSection[] = [];
    const skippedSections: SkippedSection[] = [];
    const auditLog: RepairAuditEntry[] = [];

    for (const entry of unsupportedTypes) {
        // Determine if this type can be compromised
        if (!entry.canCompromise) {
            skippedSections.push({
                sectionIndex: entry.sectionIndex,
                type: entry.type,
                reason: SKIP_REASONS[entry.type] || `Type "${entry.type}" cannot be converted. Section skipped.`,
            });
            continue;
        }

        // Map to compromise route
        // For picture-description, check if section has MCQ options
        const hasOptions = /^[A-D]\.\s/m.test(processedText);
        const route = toCompromiseRoute(entry.type, hasOptions);

        if (!route) {
            skippedSections.push({
                sectionIndex: entry.sectionIndex,
                type: entry.type,
                reason: SKIP_REASONS[entry.type] || `No compromise route for "${entry.type}".`,
            });
            continue;
        }

        // Check if target is 'skip'
        const template = COMPROMISE_TEMPLATES[route];
        if (template?.targetType === 'skip') {
            skippedSections.push({
                sectionIndex: entry.sectionIndex,
                type: entry.type,
                reason: SKIP_REASONS[route] || `Type "${entry.type}" cannot be auto-graded. Section skipped.`,
            });
            continue;
        }

        // Build compromise prompt — use section-scoped text if available,
        // otherwise fall back to full processedText (legacy behaviour).
        const targetText = sectionTexts?.get(entry.sectionIndex) ?? processedText;
        const prompt = buildCompromisePrompt(route, targetText, originalInput);
        if (!prompt) {
            skippedSections.push({
                sectionIndex: entry.sectionIndex,
                type: entry.type,
                reason: `Failed to build compromise prompt for "${entry.type}".`,
            });
            continue;
        }

        // Execute via retry chain
        const chainResult = await executeRetryChain<{ text: string; reasoning: CompromisedSection['reasoning'] }>(
            retrySession,
            COMPROMISE_CHAIN,
            async (step: RetryStep): Promise<AICallOutcome<{ text: string; reasoning: CompromisedSection['reasoning'] }> | null> => {
                const rawResponse = await callAI(
                    `You are an expert at converting Vietnamese THCS English test question types.`,
                    prompt,
                    step,
                );
                if (!rawResponse) return null;

                const parsed = parseCompromiseResponse(rawResponse);

                return {
                    result: {
                        text: parsed.convertedText,
                        reasoning: parsed.reasoning,
                    },
                    issueCount: parsed.convertedText.trim() ? 0 : 1, // empty = failed
                };
            },
        );

        if (chainResult.bestResult) {
            compromisedSections.push({
                sectionIndex: entry.sectionIndex,
                originalType: entry.type,
                convertedType: template?.targetType || 'unknown',
                convertedText: chainResult.bestResult.text,
                reasoning: chainResult.bestResult.reasoning,
            });
        } else {
            skippedSections.push({
                sectionIndex: entry.sectionIndex,
                type: entry.type,
                reason: `AI compromise failed after all retries for "${entry.type}".`,
            });
        }
    }

    return { compromisedSections, skippedSections, auditLog };
}
