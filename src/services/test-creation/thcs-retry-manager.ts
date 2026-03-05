/**
 * THCS Retry Manager — FR-8 (Internal Retry Escalation)
 *
 * Pure orchestration module for AI call retry logic.
 * Zero dependencies — no Firebase, no SDK, no provider logic.
 * Receives a `callAI` callback and manages:
 *   - Model/temperature progression (configurable chains)
 *   - Better/worse comparison between retries
 *   - Escalation paths (teacher / skip)
 *   - Session-level call tracking
 */

// ── Types ─────────────────────────────────────────────────────

/** A single step in a retry chain (provider + model + temperature). */
export interface RetryStep {
    provider: 'groq' | 'gemini';
    model: string;
    temperature: number;
}

/** Configuration for a retry chain. */
export interface RetryChainConfig {
    steps: RetryStep[];
    fallback: 'teacher' | 'skip';
}

/** Mutable session state — created once per `parseThcsText()` call. */
export interface RetrySession {
    totalCalls: number;
    callLog: RetryCallEntry[];
}

/** Log entry for a single AI call within the session. */
export interface RetryCallEntry {
    timestamp: number;
    provider: string;
    model: string;
    temperature: number;
    issueCountBefore: number;
    issueCountAfter: number;
    verdict: 'better' | 'worse' | 'same' | 'failed';
}

/** Result returned by `executeRetryChain`. */
export interface RetryResult<T> {
    outcome: 'success' | 'escalated' | 'all-failed';
    bestResult: T | null;
    callLog: RetryCallEntry[];
    escalatedTo?: 'teacher' | 'skip';
}

/** What the `callAI` callback must return (or null on failure). */
export interface AICallOutcome<T> {
    result: T;
    issueCount: number;
}

// ── Built-in Chains (FR-8) ────────────────────────────────────

/** Repair chain: Groq llama (temp 0.1) → Gemini Flash (temp 0.2) → teacher. */
export const REPAIR_CHAIN: RetryChainConfig = {
    steps: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', temperature: 0.1 },
        { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
    ],
    fallback: 'teacher',
};

/** Compromise chain: Groq → Flash (temp 0.15) → Flash (temp 0.3) → skip. */
export const COMPROMISE_CHAIN: RetryChainConfig = {
    steps: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile', temperature: 0.15 },
        { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.15 },
        { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 },
    ],
    fallback: 'skip',
};

// ── Factory ───────────────────────────────────────────────────

/** Create a new retry session. Call once per `parseThcsText()` invocation. */
export function createRetrySession(): RetrySession {
    return {
        totalCalls: 0,
        callLog: [],
    };
}

// ── Core Orchestrator ─────────────────────────────────────────

/**
 * Execute a retry chain with model/temperature escalation.
 *
 * @param session   Shared session (call tracking persists across chains)
 * @param chain     The chain config (steps + fallback)
 * @param callAI    Callback: receives a step, returns result+issueCount or null
 * @returns         RetryResult with the best outcome
 */
export async function executeRetryChain<T>(
    session: RetrySession,
    chain: RetryChainConfig,
    callAI: (step: RetryStep) => Promise<AICallOutcome<T> | null>,
): Promise<RetryResult<T>> {
    const localLog: RetryCallEntry[] = [];
    let bestResult: T | null = null;
    let bestIssueCount = Infinity;

    for (const step of chain.steps) {
        // ── Call AI ──
        const issueCountBefore = bestIssueCount === Infinity ? -1 : bestIssueCount;
        session.totalCalls++;

        let outcome: AICallOutcome<T> | null = null;
        try {
            outcome = await callAI(step);
        } catch (err) {
            console.warn(`[RetryManager] callAI threw:`, err);
        }

        // ── Handle failure ──
        if (!outcome) {
            const entry: RetryCallEntry = {
                timestamp: Date.now(),
                provider: step.provider,
                model: step.model,
                temperature: step.temperature,
                issueCountBefore: issueCountBefore === -1 ? 0 : issueCountBefore,
                issueCountAfter: -1,
                verdict: 'failed',
            };
            localLog.push(entry);
            session.callLog.push(entry);
            continue; // try next step
        }

        // ── Compare with best ──
        const verdict = compareIssueCount(bestIssueCount, outcome.issueCount);
        const entry: RetryCallEntry = {
            timestamp: Date.now(),
            provider: step.provider,
            model: step.model,
            temperature: step.temperature,
            issueCountBefore: bestIssueCount === Infinity ? 0 : bestIssueCount,
            issueCountAfter: outcome.issueCount,
            verdict,
        };
        localLog.push(entry);
        session.callLog.push(entry);

        if (verdict === 'better' || bestResult === null) {
            // First success, or strictly better — adopt as new best
            bestResult = outcome.result;
            bestIssueCount = outcome.issueCount;
        }
        // If worse or same: keep previous best, continue to next step (escalate)

        // ── Early exit: zero issues = perfect ──
        if (outcome.issueCount === 0) {
            return {
                outcome: 'success',
                bestResult,
                callLog: localLog,
            };
        }
    }

    // ── All steps exhausted ──
    if (bestResult !== null) {
        // We got something, even if not perfect
        return {
            outcome: 'success',
            bestResult,
            callLog: localLog,
        };
    }

    // Nothing worked at all
    return {
        outcome: 'all-failed',
        bestResult: null,
        callLog: localLog,
        escalatedTo: chain.fallback,
    };
}

// ── Helpers ───────────────────────────────────────────────────

/** Compare issue counts: fewer = better. */
export function compareIssueCount(
    before: number,
    after: number,
): 'better' | 'worse' | 'same' {
    if (before === Infinity) return 'better'; // first result is always "better"
    if (after < before) return 'better';
    if (after > before) return 'worse';
    return 'same';
}

/** Get diagnostic stats for the session. */
export function getSessionStats(session: RetrySession): {
    totalCalls: number;
    callLog: RetryCallEntry[];
} {
    return {
        totalCalls: session.totalCalls,
        callLog: session.callLog,
    };
}
