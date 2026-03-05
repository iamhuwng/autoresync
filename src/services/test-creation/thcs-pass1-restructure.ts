/**
 * THCS Internal AI Pass 1 — "The Janitor"
 *
 * Always runs on every input. Receives near-raw text (post-preClean, before
 * any regex) and produces restructured plain text for the downstream pipeline.
 *
 * Responsibilities:
 *   - Confidence assessment of external AI output (0-100)
 *   - Text restructuring: split merged Qs, add prefixes, expand answer keys,
 *     insert line breaks, split ambiguous sections, produce stats, infer answers
 *   - Outputs PLAIN TEXT (not JSON) — goes back into pipeline for regex engine
 *
 * Does NOT:
 *   - Replace instruction text (Engine's job — task 4f54n5)
 *   - Classify types (Classifier's job)
 *   - Parse to structured data (Regex Engine's job)
 */

import type { RetrySession } from './thcs-retry-manager';

// ── Types ─────────────────────────────────────────────────────

export interface Pass1Result {
    /** 0-100 confidence in the external AI's extraction quality. */
    confidence: number;
    /** The restructured text (or original if AI failed). */
    restructuredText: string;
    /** Parsed from [STATS: X questions, Y answers, Z sections]. */
    stats: {
        questions: number;
        answers: number;
        sections: number;
    } | null;
    /** True if any [AI-INFERRED] tags were found in the output. */
    hasInferredAnswers: boolean;
}

// ── Static Prompt ─────────────────────────────────────────────

const PASS1_SYSTEM_MESSAGE = 'You are a text restructuring assistant for Vietnamese English tests. Output plain text only.';

const PASS1_PROMPT = `You are normalizing a Vietnamese THCS English test document that was extracted by another AI.
Your job is to RESTRUCTURE the text so a regex parser can process it reliably.

INPUT ASSESSMENT (do this first):
- Rate the quality of this AI extraction: [CONFIDENCE: N] (0-100)
- Consider: Are sections properly separated? Do question numbers exist? Are type tags present? Does structure make sense for a Vietnamese English test?

RESTRUCTURING TASKS (apply ALL that are needed):
1. SPLIT merged questions: If two questions appear on the same line, split them onto separate lines
2. ADD missing prefixes: Every question should start with "Question N." format
3. EXPAND compressed answer keys: Convert "1-5: BACDC" into "1. B\\n2. A\\n3. C\\n4. D\\n5. C"
4. INSERT line breaks: Ensure blank lines between sections, between questions, between options
5. SPLIT ambiguous sections: If one section header covers two DIFFERENT exercise types (detectable from content patterns like MCQ mixed with fill-in), split into two separate sections with appropriate headers
6. PRODUCE stats: At the very end, append: [STATS: X questions, Y answers, Z sections]

CRITICAL RULES:
- Output PLAIN TEXT only (not JSON, not markdown code blocks)
- PRESERVE all markers: **bold**, __underline__, {{braces}}, [TYPE: xxx], [WORD BANK: ...]
- PRESERVE all Vietnamese diacritics exactly
- Do NOT replace instruction texts — leave them as-is
- Do NOT change question text content — only structural formatting
- Do NOT reorder sections or questions
- Keep your [CONFIDENCE: N] assessment on the FIRST line of output`;

// ── Prompt Builder ────────────────────────────────────────────

/** Build the full Pass 1 prompt (static prompt + input text). */
export function buildPass1Prompt(nearRawText: string): string {
    return PASS1_PROMPT + '\n\n"""\n' + nearRawText + '\n"""';
}

/** Get the system message for the AI call. */
export function getPass1SystemMessage(): string {
    return PASS1_SYSTEM_MESSAGE;
}

// ── Response Parser ───────────────────────────────────────────

/** Parse the AI's plain-text response into structured Pass1Result. */
export function parsePass1Response(response: string): Pass1Result {
    const lines = response.trim().split('\n');

    // Extract [CONFIDENCE: N] from first 5 lines — Groq/Gemini sometimes emit
    // a blank line or metadata before the confidence tag, so checking only
    // lines[0] causes a spurious 0 that triggers confidenceDisagreement warnings.
    const confidence = extractConfidence(lines.slice(0, 5));

    // Extract [STATS: X questions, Y answers, Z sections] from last ~3 lines
    const stats = extractStats(lines);

    // Detect [AI-INFERRED] presence
    const hasInferredAnswers = response.includes('[AI-INFERRED]');

    // Strip any markdown code blocks that the AI included despite instructions
    let restructuredText = response.trim();
    if (restructuredText.startsWith('```')) {
        const firstNewline = restructuredText.indexOf('\n');
        if (firstNewline !== -1) {
            restructuredText = restructuredText.substring(firstNewline + 1);
        }
    }
    if (restructuredText.endsWith('```')) {
        restructuredText = restructuredText.substring(0, restructuredText.length - 3).trim();
    }

    return {
        confidence,
        restructuredText,
        stats,
        hasInferredAnswers,
    };
}

/** Extract confidence value from the first matching line in a set of lines. */
function extractConfidence(lines: string | string[]): number {
    const candidates = Array.isArray(lines) ? lines : [lines];
    for (const line of candidates) {
        const match = line.match(/\[?CONFIDENCE:\s*(\d+)\]?/i);
        if (match) {
            const val = parseInt(match[1] ?? '0', 10);
            return Math.max(0, Math.min(100, val));
        }
    }
    return 0; // If AI didn't include confidence, assume worst case
}

/** Extract stats from the last few lines. */
function extractStats(lines: string[]): Pass1Result['stats'] {
    // Search last 5 lines for [STATS: X questions, Y answers, Z sections]
    const tail = lines.slice(-5);
    for (const line of tail) {
        const match = line.match(
            /\[STATS:\s*(\d+)\s*questions?,\s*(\d+)\s*answers?,\s*(\d+)\s*sections?\s*\]/i
        );
        if (match) {
            return {
                questions: parseInt(match[1] ?? '0', 10),
                answers: parseInt(match[2] ?? '0', 10),
                sections: parseInt(match[3] ?? '0', 10),
            };
        }
    }
    return null;
}

// ── Main Orchestrator ─────────────────────────────────────────

/**
 * Execute Pass 1 on near-raw text.
 *
 * @param nearRawText  Output of preCleanText() — not yet touched by regex
 * @param session      Retry session for call counting
 * @param callAI       Callback to call AI — receives (systemMessage, prompt) → plain text or null
 * @returns Pass1Result — always succeeds (graceful degradation)
 */
export async function executePass1(
    nearRawText: string,
    session: RetrySession,
    callAI: (systemMessage: string, prompt: string) => Promise<string | null>,
): Promise<Pass1Result> {
    // Fallback result — used if AI call fails
    const fallback: Pass1Result = {
        confidence: 0,
        restructuredText: nearRawText,
        stats: null,
        hasInferredAnswers: false,
    };

    // Build prompt
    const prompt = buildPass1Prompt(nearRawText);
    const systemMessage = getPass1SystemMessage();

    // Call AI
    session.totalCalls++;
    try {
        const response = await callAI(systemMessage, prompt);
        if (!response || response.trim().length < 20) {
            console.warn('[Pass1] AI returned empty/short response — using raw text');
            return fallback;
        }
        return parsePass1Response(response);
    } catch (err) {
        console.warn('[Pass1] AI call failed:', err);
        return fallback;
    }
}
