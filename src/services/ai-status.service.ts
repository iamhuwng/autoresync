/**
 * AI Status Service
 *
 * Centralized service to check whether AI features are available.
 * Aggregates key availability across all providers (Gemini + Groq)
 * and exposes both point-in-time checks and a shared subscription store.
 *
 * Used by `useAIStatus` hook to surface maintenance banners.
 *
 * @module ai-status.service
 * @version 1.1.0
 * @date 2026-03-22
 */

import { getEnv, loadAllGeminiApiKeys } from '../config/env.config';
import { getDecryptedKeys } from './api-keys.service';
import { filterBenchedKeys, getCooldownStatus } from './key-cooldown.service';

export interface AIAvailability {
    /** Whether at least one AI provider has usable keys */
    available: boolean;
    /** Whether Gemini has usable (non-benched) keys */
    geminiAvailable: boolean;
    /** Whether Groq has usable (non-benched) keys */
    groqAvailable: boolean;
    /** Total configured keys (env + Firestore) across all providers */
    totalKeys: number;
    /** Number of keys currently benched (cooling down) */
    benchedKeys: number;
    /** Shortest remaining cooldown across benched keys, in seconds */
    shortestCooldownRemaining?: number;
    /** Human-readable reason when unavailable */
    reason?: string;
    /** Timestamp of the check */
    checkedAt: number;
}

export interface AIStatusSnapshot {
    loaded: boolean;
    details: AIAvailability | null;
}

const CACHE_TTL_MS = 15_000;
const POLL_INTERVAL_MS = 30_000;
const INITIAL_DELAY_MS = 1_000;

const listeners = new Set<() => void>();

let cachedStatus: AIAvailability | null = null;
let cacheTimestamp = 0;
let inFlightAvailabilityPromise: Promise<AIAvailability> | null = null;
let inFlightForceFresh = false;

let snapshot: AIStatusSnapshot = {
    loaded: false,
    details: null,
};

let initialTimeoutId: ReturnType<typeof setTimeout> | null = null;
let pollingIntervalId: ReturnType<typeof setInterval> | null = null;
let visibilityListenerBound = false;

function emitChange(): void {
    listeners.forEach((listener) => listener());
}

function isDocumentHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function clearPollingTimers(): void {
    if (initialTimeoutId !== null) {
        clearTimeout(initialTimeoutId);
        initialTimeoutId = null;
    }

    if (pollingIntervalId !== null) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
}

function bindVisibilityListener(): void {
    if (visibilityListenerBound || typeof document === 'undefined') {
        return;
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerBound = true;
}

function unbindVisibilityListener(): void {
    if (!visibilityListenerBound || typeof document === 'undefined') {
        return;
    }

    document.removeEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerBound = false;
}

function startPolling(): void {
    if (listeners.size === 0 || isDocumentHidden()) {
        return;
    }

    bindVisibilityListener();

    if (!snapshot.loaded && initialTimeoutId === null) {
        initialTimeoutId = setTimeout(() => {
            initialTimeoutId = null;
            void refreshAIStatus({ force: true });
        }, INITIAL_DELAY_MS);
    }

    if (pollingIntervalId === null) {
        pollingIntervalId = setInterval(() => {
            void refreshAIStatus({ force: true });
        }, POLL_INTERVAL_MS);
    }
}

function stopPolling(): void {
    clearPollingTimers();

    if (listeners.size === 0) {
        unbindVisibilityListener();
    }
}

function handleVisibilityChange(): void {
    if (isDocumentHidden()) {
        clearPollingTimers();
        return;
    }

    if (listeners.size === 0) {
        return;
    }

    void refreshAIStatus({ force: true });
    startPolling();
}

async function loadGroqKeys(): Promise<string[]> {
    const env = getEnv();
    const allGroqKeys: string[] = [];

    try {
        const firestoreKeys = await getDecryptedKeys('groq');
        for (const key of firestoreKeys) {
            if (key && !allGroqKeys.includes(key)) {
                allGroqKeys.push(key);
            }
        }
    } catch {
        // Ignore Firestore read failures and continue with env keys.
    }

    const legacyKey = env.VITE_GROQ_API_KEY;
    if (
        legacyKey &&
        legacyKey.trim().length > 0 &&
        !legacyKey.includes('your_') &&
        !allGroqKeys.includes(legacyKey)
    ) {
        allGroqKeys.push(legacyKey);
    }

    for (let index = 1; index <= 5; index += 1) {
        const key = (env as Record<string, string | undefined>)[`VITE_GROQ_API_KEY_${index}`];
        if (
            key &&
            key.trim().length > 0 &&
            !key.includes('your_') &&
            !allGroqKeys.includes(key)
        ) {
            allGroqKeys.push(key);
        }
    }

    return allGroqKeys;
}

function buildDegradedAvailability(now: number): AIAvailability {
    return {
        available: false,
        geminiAvailable: false,
        groqAvailable: false,
        totalKeys: 0,
        benchedKeys: 0,
        shortestCooldownRemaining: undefined,
        reason:
            'AI availability could not be verified because the key registry is temporarily unavailable. ' +
            'AI features may fail until connectivity or authentication is restored.',
        checkedAt: now,
    };
}

async function computeAIAvailability(now: number): Promise<AIAvailability> {
    let allGeminiKeys: string[] = [];
    try {
        allGeminiKeys = await loadAllGeminiApiKeys();
    } catch {
        // env.config may throw if env vars are missing.
    }
    const availableGeminiKeys = filterBenchedKeys(allGeminiKeys, 'gemini');

    let allGroqKeys: string[] = [];
    try {
        allGroqKeys = await loadGroqKeys();
    } catch {
        // Ignore env/config failures and continue with empty Groq keys.
    }
    const availableGroqKeys = filterBenchedKeys(allGroqKeys, 'groq');

    const totalKeys = allGeminiKeys.length + allGroqKeys.length;
    const totalAvailable = availableGeminiKeys.length + availableGroqKeys.length;
    const benchedKeys = totalKeys - totalAvailable;
    const cooldownStatus = getCooldownStatus();
    const shortestCooldownRemaining = cooldownStatus.length > 0
        ? Math.min(...cooldownStatus.map((entry) => entry.remainingSeconds))
        : undefined;

    let reason: string | undefined;
    if (totalKeys === 0) {
        reason = 'No AI API keys configured. Please add keys in Settings.';
    } else if (totalAvailable === 0) {
        reason =
            'AI system is currently in maintenance because all configured AI API keys are exhausted or cooling down. ' +
            'The system will recover automatically when cooldowns expire. ' +
            'Please try again in a few minutes.';
    }

    return {
        available: totalAvailable > 0,
        geminiAvailable: availableGeminiKeys.length > 0,
        groqAvailable: availableGroqKeys.length > 0,
        totalKeys,
        benchedKeys,
        shortestCooldownRemaining,
        reason,
        checkedAt: now,
    };
}

async function fetchAIAvailability(forceFresh = false): Promise<AIAvailability> {
    const now = Date.now();

    if (!forceFresh && cachedStatus && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedStatus;
    }

    if (inFlightAvailabilityPromise && (!forceFresh || inFlightForceFresh)) {
        return inFlightAvailabilityPromise;
    }

    const request = (async () => {
        try {
            const availability = await computeAIAvailability(now);
            cachedStatus = availability;
            cacheTimestamp = Date.now();
            return availability;
        } catch (error) {
            console.warn('[AIStatus] Availability check failed:', error);
            return buildDegradedAvailability(now);
        }
    })();

    inFlightAvailabilityPromise = request;
    inFlightForceFresh = forceFresh;

    try {
        return await request;
    } finally {
        if (inFlightAvailabilityPromise === request) {
            inFlightAvailabilityPromise = null;
            inFlightForceFresh = false;
        }
    }
}

/**
 * Check if AI features are currently available.
 *
 * Loads all configured keys from .env + Firestore, filters out
 * benched (rate-limited) keys, and returns a summary.
 *
 * Results are cached for 15 seconds to avoid hammering Firestore.
 */
export async function getAIAvailability(): Promise<AIAvailability> {
    return fetchAIAvailability(false);
}

export async function refreshAIStatus(options: { force?: boolean } = {}): Promise<AIAvailability> {
    const details = await fetchAIAvailability(options.force ?? true);
    snapshot = {
        loaded: true,
        details,
    };
    emitChange();
    return details;
}

export function subscribeAIStatus(listener: () => void): () => void {
    listeners.add(listener);
    startPolling();

    return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
            stopPolling();
        }
    };
}

export function getAIStatusSnapshot(): AIStatusSnapshot {
    return snapshot;
}

/**
 * Invalidate the cached status.
 * Call this after a key is benched or un-benched to force a fresh check.
 */
export function invalidateAIStatusCache(): void {
    cachedStatus = null;
    cacheTimestamp = 0;

    if (listeners.size > 0 && !isDocumentHidden()) {
        void refreshAIStatus({ force: true });
    }
}
