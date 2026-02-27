/**
 * useTimerExpiry Hook
 * 
 * Manages timer expiry states for both student (grace period) and teacher (countdown warning).
 * Handles the transition logic when test timers reach zero or warning thresholds.
 * 
 * PRD-0019: Test Duration End Flow
 * Requirements: FR-S1, FR-S2, FR-T1, FR-T2, FR-T3
 * 
 * @module hooks/test/useTimerExpiry
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface UseTimerExpiryOptions {
    /** Duration of grace period in seconds (default: 5) - for students */
    gracePeriodDuration?: number;
    /** Warning threshold in seconds before expiry (default: 10) - for teachers */
    warningThreshold?: number;
    /** Callback when grace period starts */
    onGracePeriodStart?: () => void;
    /** Callback when grace period ends (after countdown completes) */
    onGracePeriodEnd?: () => void;
    /** Callback when warning threshold is reached (teacher) */
    onWarningStart?: () => void;
    /** Callback when warning countdown is cancelled */
    onWarningCancel?: () => void;
    /** Callback when "End Now" is triggered during warning */
    onEndNow?: () => void;
}

export interface UseTimerExpiryReturn {
    // Student-side grace period
    /** Whether the grace period overlay should be shown */
    isGracePeriodActive: boolean;
    /** Remaining seconds in grace period */
    gracePeriodRemaining: number;
    /** Trigger the grace period countdown */
    triggerGracePeriod: () => void;

    // Teacher-side warning countdown
    /** Whether the countdown warning modal should be shown */
    isCountdownWarningActive: boolean;
    /** Remaining seconds in warning countdown */
    countdownWarningRemaining: number;
    /** Trigger the countdown warning (usually called when timer hits threshold) */
    triggerCountdownWarning: (initialSeconds?: number) => void;
    /** Cancel the countdown warning and pause the test */
    cancelCountdown: () => void;
    /** End the test immediately during countdown */
    endNow: () => void;

    // Utility
    /** Reset all states */
    reset: () => void;
}

// Session storage keys for persistence across refresh
const GRACE_PERIOD_KEY = 'prd0019_gracePeriod';
const GRACE_PERIOD_START_KEY = 'prd0019_gracePeriodStart';

// ============================================================================
// Hook Implementation
// ============================================================================

export const useTimerExpiry = (options: UseTimerExpiryOptions = {}): UseTimerExpiryReturn => {
    const {
        gracePeriodDuration = 5,
        warningThreshold = 10,
        onGracePeriodStart,
        onGracePeriodEnd,
        onWarningStart,
        onWarningCancel,
        onEndNow,
    } = options;

    // State for student grace period
    const [isGracePeriodActive, setIsGracePeriodActive] = useState(false);
    const [gracePeriodRemaining, setGracePeriodRemaining] = useState(gracePeriodDuration);

    // State for teacher countdown warning
    const [isCountdownWarningActive, setIsCountdownWarningActive] = useState(false);
    const [countdownWarningRemaining, setCountdownWarningRemaining] = useState(warningThreshold);

    // Refs for interval management
    const gracePeriodIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const countdownWarningIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const hasGracePeriodEndedRef = useRef(false);
    const hasCountdownEndedRef = useRef(false);

    // ============================================================================
    // Grace Period (Student-side)
    // ============================================================================

    /**
     * Check for persisted grace period state on mount (handles browser refresh)
     */
    useEffect(() => {
        try {
            const savedStart = sessionStorage.getItem(GRACE_PERIOD_START_KEY);
            const savedDuration = sessionStorage.getItem(GRACE_PERIOD_KEY);

            if (savedStart && savedDuration) {
                const startTime = parseInt(savedStart, 10);
                const duration = parseInt(savedDuration, 10);
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const remaining = Math.max(0, duration - elapsed);

                if (remaining > 0) {
                    // Resume the grace period
                    setGracePeriodRemaining(remaining);
                    setIsGracePeriodActive(true);
                    startGracePeriodCountdown(remaining);
                } else {
                    // Grace period expired during refresh - trigger end immediately
                    clearGracePeriodStorage();
                    onGracePeriodEnd?.();
                }
            }
        } catch (e) {
            console.warn('[useTimerExpiry] Failed to restore grace period state:', e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Start the grace period countdown
     */
    const startGracePeriodCountdown = useCallback((initialSeconds: number) => {
        // Clear any existing interval
        if (gracePeriodIntervalRef.current) {
            clearInterval(gracePeriodIntervalRef.current);
        }

        const startTime = Date.now();
        hasGracePeriodEndedRef.current = false;

        gracePeriodIntervalRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.max(0, initialSeconds - elapsed);

            setGracePeriodRemaining(remaining);

            if (remaining <= 0 && !hasGracePeriodEndedRef.current) {
                hasGracePeriodEndedRef.current = true;
                clearInterval(gracePeriodIntervalRef.current!);
                gracePeriodIntervalRef.current = null;
                setIsGracePeriodActive(false);
                clearGracePeriodStorage();
                onGracePeriodEnd?.();
            }
        }, 100);
    }, [onGracePeriodEnd]);

    /**
     * Trigger the grace period (called when student timer hits 0)
     */
    const triggerGracePeriod = useCallback(() => {
        if (isGracePeriodActive) return; // Already active

        console.log('[useTimerExpiry] Starting grace period:', gracePeriodDuration, 'seconds');

        // Persist to sessionStorage for refresh handling
        try {
            sessionStorage.setItem(GRACE_PERIOD_START_KEY, Date.now().toString());
            sessionStorage.setItem(GRACE_PERIOD_KEY, gracePeriodDuration.toString());
        } catch (e) {
            console.warn('[useTimerExpiry] Failed to persist grace period state:', e);
        }

        setIsGracePeriodActive(true);
        setGracePeriodRemaining(gracePeriodDuration);
        onGracePeriodStart?.();
        startGracePeriodCountdown(gracePeriodDuration);
    }, [isGracePeriodActive, gracePeriodDuration, onGracePeriodStart, startGracePeriodCountdown]);

    /**
     * Clear grace period storage
     */
    const clearGracePeriodStorage = () => {
        try {
            sessionStorage.removeItem(GRACE_PERIOD_KEY);
            sessionStorage.removeItem(GRACE_PERIOD_START_KEY);
        } catch (e) {
            // Ignore
        }
    };

    // ============================================================================
    // Countdown Warning (Teacher-side)
    // ============================================================================

    /**
     * Start the countdown warning countdown
     */
    const startCountdownWarningCountdown = useCallback((initialSeconds: number) => {
        // Clear any existing interval
        if (countdownWarningIntervalRef.current) {
            clearInterval(countdownWarningIntervalRef.current);
        }

        const startTime = Date.now();
        hasCountdownEndedRef.current = false;

        countdownWarningIntervalRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.max(0, initialSeconds - elapsed);

            setCountdownWarningRemaining(remaining);

            if (remaining <= 0 && !hasCountdownEndedRef.current) {
                hasCountdownEndedRef.current = true;
                clearInterval(countdownWarningIntervalRef.current!);
                countdownWarningIntervalRef.current = null;
                setIsCountdownWarningActive(false);
                // Note: The parent component should handle what happens when countdown completes
                // This is typically calling completeBaseTest()
            }
        }, 100);
    }, []);

    /**
     * Trigger the countdown warning (called when teacher timer hits threshold)
     */
    const triggerCountdownWarning = useCallback((initialSeconds?: number) => {
        if (isCountdownWarningActive) return; // Already active

        const duration = initialSeconds ?? warningThreshold;
        console.log('[useTimerExpiry] Starting countdown warning:', duration, 'seconds');

        setIsCountdownWarningActive(true);
        setCountdownWarningRemaining(duration);
        onWarningStart?.();
        startCountdownWarningCountdown(duration);
    }, [isCountdownWarningActive, warningThreshold, onWarningStart, startCountdownWarningCountdown]);

    /**
     * Cancel the countdown warning (teacher clicked "Cancel")
     */
    const cancelCountdown = useCallback(() => {
        console.log('[useTimerExpiry] Countdown warning cancelled');

        if (countdownWarningIntervalRef.current) {
            clearInterval(countdownWarningIntervalRef.current);
            countdownWarningIntervalRef.current = null;
        }

        setIsCountdownWarningActive(false);
        setCountdownWarningRemaining(warningThreshold);
        hasCountdownEndedRef.current = false;
        onWarningCancel?.();
    }, [warningThreshold, onWarningCancel]);

    /**
     * End the test immediately (teacher clicked "End Now")
     */
    const endNow = useCallback(() => {
        console.log('[useTimerExpiry] End Now triggered');

        if (countdownWarningIntervalRef.current) {
            clearInterval(countdownWarningIntervalRef.current);
            countdownWarningIntervalRef.current = null;
        }

        setIsCountdownWarningActive(false);
        setCountdownWarningRemaining(0);
        hasCountdownEndedRef.current = true;
        onEndNow?.();
    }, [onEndNow]);

    // ============================================================================
    // Utility
    // ============================================================================

    /**
     * Reset all states
     */
    const reset = useCallback(() => {
        // Clear intervals
        if (gracePeriodIntervalRef.current) {
            clearInterval(gracePeriodIntervalRef.current);
            gracePeriodIntervalRef.current = null;
        }
        if (countdownWarningIntervalRef.current) {
            clearInterval(countdownWarningIntervalRef.current);
            countdownWarningIntervalRef.current = null;
        }

        // Reset states
        setIsGracePeriodActive(false);
        setGracePeriodRemaining(gracePeriodDuration);
        setIsCountdownWarningActive(false);
        setCountdownWarningRemaining(warningThreshold);
        hasGracePeriodEndedRef.current = false;
        hasCountdownEndedRef.current = false;

        // Clear storage
        clearGracePeriodStorage();
    }, [gracePeriodDuration, warningThreshold]);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
        return () => {
            if (gracePeriodIntervalRef.current) {
                clearInterval(gracePeriodIntervalRef.current);
            }
            if (countdownWarningIntervalRef.current) {
                clearInterval(countdownWarningIntervalRef.current);
            }
        };
    }, []);

    return {
        // Student-side
        isGracePeriodActive,
        gracePeriodRemaining,
        triggerGracePeriod,

        // Teacher-side
        isCountdownWarningActive,
        countdownWarningRemaining,
        triggerCountdownWarning,
        cancelCountdown,
        endNow,

        // Utility
        reset,
    };
};

export default useTimerExpiry;
