/**
 * useAIStatus Hook
 *
 * Provides shared AI availability status for UI components.
 * Subscribes to the centralized AI status store and exposes:
 * - Whether AI is available
 * - Whether the system is in "maintenance" mode (all keys exhausted)
 * - A human-readable reason string for banners
 *
 * @module useAIStatus
 * @version 1.1.0
 * @date 2026-03-22
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
    getAIStatusSnapshot,
    invalidateAIStatusCache,
    refreshAIStatus,
    subscribeAIStatus,
    type AIAvailability,
} from '../services/ai-status.service';

export interface AIStatusState {
    /** Whether at least one AI provider is available */
    available: boolean;
    /** True when all keys are exhausted (maintenance mode) */
    maintenance: boolean;
    /** Human-readable reason when unavailable */
    reason: string | undefined;
    /** Whether the initial check has completed */
    loaded: boolean;
    /** Full availability details */
    details: AIAvailability | null;
}

export interface AIStatusActions {
    /** Force a fresh availability check */
    refresh: () => Promise<void>;
}

export function useAIStatus(): [AIStatusState, AIStatusActions] {
    const snapshot = useSyncExternalStore(
        subscribeAIStatus,
        getAIStatusSnapshot,
        getAIStatusSnapshot,
    );

    const details = snapshot.details;
    const available = details?.available ?? true;
    const maintenance = Boolean(details && !details.available && details.totalKeys > 0);

    const refresh = useCallback(async () => {
        invalidateAIStatusCache();
        await refreshAIStatus({ force: true });
    }, []);

    return [
        {
            available,
            maintenance,
            reason: details?.reason,
            loaded: snapshot.loaded,
            details,
        },
        { refresh },
    ];
}

export default useAIStatus;
