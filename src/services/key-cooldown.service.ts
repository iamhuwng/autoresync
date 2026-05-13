/**
 * API Key Cooldown Service
 *
 * Centralized in-memory registry that tracks rate-limited API keys.
 * When a key hits a 429/rate-limit error, it gets "benched" for a
 * provider-specific cooldown period. During that time, the key is
 * skipped by all AI callers. When the cooldown expires, the key
 * automatically becomes available again.
 *
 * Recovery times:
 *   - Groq RPM (requests/min):  60 seconds
 *   - Groq RPD (requests/day):  1 hour
 *   - Gemini (parsed retryDelay): retryDelay + 5s buffer
 *   - Gemini (daily quota = 0): 1 hour
 *   - Default fallback:         60 seconds
 *
 * @module key-cooldown.service
 */

// ── Types ──────────────────────────────────────────────────────

interface CooldownEntry {
    benchedAt: number;
    cooldownMs: number;
    reason: string;
    provider: 'groq' | 'gemini';
    keyPreview: string;
}

// ── Constants ──────────────────────────────────────────────────

/** Default cooldown per provider (milliseconds) */
const DEFAULT_COOLDOWN: Record<string, number> = {
    groq: 60_000,     // 60 seconds — Groq RPM limit
    gemini: 60_000,   // 60 seconds — Gemini RPM limit
};

/** Cooldown when daily/per-day quota is exhausted */
const DAILY_EXHAUSTED_COOLDOWN = 3_600_000; // 1 hour

/** Cooldown for Groq per-day rate limit */
const GROQ_RPD_COOLDOWN = 3_600_000; // 1 hour

/** Cooldown for disabled or forbidden keys */
const KEY_DISABLED_COOLDOWN = 86_400_000; // 24 hours

// ── Registry (in-memory, per session) ──────────────────────────

const cooldownRegistry = new Map<string, CooldownEntry>();

// ── Helpers ────────────────────────────────────────────────────

function makePreview(key: string): string {
    if (!key || key.length < 12) return '***';
    return `...${key.slice(-8)}`;
}

function normalizeErrorMessage(errorMessage: string): string {
    return String(errorMessage || '').toLowerCase();
}

export function shouldBenchGeminiKeyError(errorMessage: string): boolean {
    const normalized = normalizeErrorMessage(errorMessage);

    if (!normalized) {
        return false;
    }

    return (
        normalized.includes('403')
        || normalized.includes('forbidden')
        || normalized.includes('permission denied')
        || normalized.includes('permission_denied')
        || normalized.includes('blocked')
        || normalized.includes('invalid api key')
        || normalized.includes('api_key_invalid')
        || normalized.includes('api key invalid')
        || normalized.includes('api key not valid')
        || normalized.includes('api key expired')
        || normalized.includes('key expired')
        || normalized.includes('429')
        || normalized.includes('rate limit')
        || normalized.includes('quota')
    );
}

/**
 * Parse the optimal cooldown duration from an error message.
 *
 * Gemini errors include things like:
 *   - `"retryDelay":"49s"`  → use 49 + 5 = 54 seconds
 *   - `limit: 0`           → daily quota exhausted → 1 hour
 *   - `PerDay`             → daily limit → 1 hour
 *
 * Groq errors include:
 *   - `tokens_per_minute`  → RPM limit → 60 seconds
 *   - `requests_per_day`, `per day` → daily limit → 1 hour
 */
function parseCooldownMs(provider: 'groq' | 'gemini', errorMessage: string): number {
    const base = DEFAULT_COOLDOWN[provider] ?? 60_000;
    const normalized = normalizeErrorMessage(errorMessage);

    if (!errorMessage) return base;

    // ── Gemini: parse retryDelay ────────────────────────────
    if (provider === 'gemini') {
        if (
            normalized.includes('403') ||
            normalized.includes('forbidden') ||
            normalized.includes('invalid api key') ||
            normalized.includes('api_key_invalid') ||
            normalized.includes('api key invalid') ||
            normalized.includes('api key not valid') ||
            normalized.includes('api key expired') ||
            normalized.includes('key expired') ||
            normalized.includes('permission denied') ||
            normalized.includes('permission_denied') ||
            normalized.includes('blocked')
        ) {
            return KEY_DISABLED_COOLDOWN;
        }

        // Check for daily quota exhaustion first (trumps retryDelay)
        if (normalized.includes('limit: 0') || normalized.includes('perday')) {
            return DAILY_EXHAUSTED_COOLDOWN;
        }

        // Parse retryDelay like "retryDelay":"49s" or "retryDelay":"49.13s"
        const retryMatch = errorMessage.match(/retryDelay["\s:]*"?(\d+(?:\.\d+)?)s/i);
        if (retryMatch) {
            const seconds = Math.ceil(parseFloat(retryMatch[1]!));
            return (seconds + 5) * 1000; // Add 5s safety buffer
        }

        // Generic quota exceeded
        if (normalized.includes('quota') || normalized.includes('429')) {
            return base;
        }
    }

    // ── Groq: distinguish RPM vs RPD ────────────────────────
    if (provider === 'groq') {
        if (
            normalized.includes('per day') ||
            normalized.includes('per_day') ||
            normalized.includes('perday') ||
            normalized.includes('requests_per_day')
        ) {
            return GROQ_RPD_COOLDOWN;
        }
        // RPM or generic 429
        return base;
    }

    return base;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Bench a key after it received a 429/rate-limit error.
 * The key will be skipped by `isKeyBenched()` / `filterBenchedKeys()`
 * until the cooldown expires.
 *
 * @param key          The raw API key string
 * @param provider     'groq' | 'gemini'
 * @param errorMessage Optional error message — used to parse retry delay
 */
export function benchKey(
    key: string,
    provider: 'groq' | 'gemini',
    errorMessage?: string,
): void {
    const cooldownMs = parseCooldownMs(provider, errorMessage || '');
    const preview = makePreview(key);

    cooldownRegistry.set(key, {
        benchedAt: Date.now(),
        cooldownMs,
        reason: (errorMessage || '429 rate limit').slice(0, 120),
        provider,
        keyPreview: preview,
    });

    const secs = Math.round(cooldownMs / 1000);
    const unit = secs >= 3600 ? `${Math.round(secs / 60)}m` : `${secs}s`;
    console.warn(`🪑 [KeyCooldown] Benched ${provider} key ${preview} for ${unit}`);

    // Invalidate AI status cache so maintenance banner updates promptly
    try {
        import('./ai-status.service').then(m => m.invalidateAIStatusCache()).catch(() => {});
    } catch { /* ignore */ }
}

/**
 * Check whether a key is currently benched (cooldown not expired).
 * Automatically cleans up expired entries.
 */
export function isKeyBenched(key: string): boolean {
    const entry = cooldownRegistry.get(key);
    if (!entry) return false;

    const elapsed = Date.now() - entry.benchedAt;
    if (elapsed >= entry.cooldownMs) {
        // Cooldown expired — key is available again
        cooldownRegistry.delete(key);
        console.log(
            `✅ [KeyCooldown] ${entry.provider} key ${entry.keyPreview} cooldown expired — available again`,
        );
        return false;
    }

    return true;
}

/**
 * Filter out any benched keys from a list, returning only available keys.
 * Also logs how many were filtered.
 */
export function filterBenchedKeys(
    keys: string[],
    provider: 'groq' | 'gemini',
): string[] {
    const available = keys.filter((k) => !isKeyBenched(k));
    const benched = keys.length - available.length;

    if (benched > 0) {
        console.warn(
            `🪑 [KeyCooldown] ${benched}/${keys.length} ${provider} key(s) currently benched, ${available.length} available`,
        );
    }

    return available;
}

/**
 * Get a summary of all currently benched keys (for debugging).
 */
export function getCooldownStatus(): {
    provider: string;
    keyPreview: string;
    remainingSeconds: number;
    reason: string;
}[] {
    const results: {
        provider: string;
        keyPreview: string;
        remainingSeconds: number;
        reason: string;
    }[] = [];

    for (const [, entry] of cooldownRegistry) {
        const remaining = Math.max(
            0,
            entry.cooldownMs - (Date.now() - entry.benchedAt),
        );
        results.push({
            provider: entry.provider,
            keyPreview: entry.keyPreview,
            remainingSeconds: Math.round(remaining / 1000),
            reason: entry.reason,
        });
    }

    return results;
}
