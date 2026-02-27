// File: src/hooks/solo/useSoloTimer.ts
import { useState, useEffect, useRef, useCallback, createElement } from 'react';
import { notifications } from '@mantine/notifications';
import { IconClock } from '@tabler/icons-react';
import { useTimerExpiry } from '../test/useTimerExpiry';

interface UseSoloTimerOptions {
    /** Duration in minutes. null = no timer (timeRemaining stays at Infinity) */
    durationMinutes: number | null;
    /** Whether pause is allowed */
    allowPause: boolean;
    /** Whether test has been submitted */
    testSubmitted: boolean;
    /** Called when time runs out (after grace period) */
    onTimeUp: () => void;
    /** Seconds already elapsed (for resume). Default: 0 */
    initialElapsed?: number;
    /** Called when grace period starts (to lock inputs) */
    onGracePeriodStart?: () => void;
}

interface UseSoloTimerReturn {
    timeRemaining: number;
    formatTime: (seconds: number) => string;
    isPaused: boolean;
    togglePause: () => void;
    showTimeUpOverlay: boolean;
    gracePeriodRemaining: number;
    /** Whether timer is active (has a duration set) */
    hasTimer: boolean;
}

export const useSoloTimer = ({
    durationMinutes,
    allowPause,
    testSubmitted,
    onTimeUp,
    initialElapsed = 0,
    onGracePeriodStart,
}: UseSoloTimerOptions): UseSoloTimerReturn => {
    const hasTimer = durationMinutes !== null && durationMinutes > 0;
    const totalSeconds = hasTimer ? durationMinutes! * 60 : 0;

    const [elapsedSeconds, setElapsedSeconds] = useState(initialElapsed);
    const [isPaused, setIsPaused] = useState(false);
    const hasAutoSubmittedRef = useRef(false);
    const hasShownWarningRef = useRef(false);
    const hasTriggeredGracePeriodRef = useRef(false);

    // Grace period handling (reuse existing useTimerExpiry hook)
    const handleGracePeriodEnd = useCallback(() => {
        hasAutoSubmittedRef.current = true;
        onTimeUp();
    }, [onTimeUp]);

    const handleGracePeriodStart = useCallback(() => {
        onGracePeriodStart?.();
    }, [onGracePeriodStart]);

    const {
        isGracePeriodActive: showTimeUpOverlay,
        gracePeriodRemaining,
        triggerGracePeriod,
    } = useTimerExpiry({
        gracePeriodDuration: 5,
        onGracePeriodStart: handleGracePeriodStart,
        onGracePeriodEnd: handleGracePeriodEnd,
    });

    // Timer countdown
    useEffect(() => {
        if (!hasTimer || testSubmitted || isPaused) return;

        const timer = setInterval(() => {
            setElapsedSeconds(prev => {
                const next = prev + 1;
                const remaining = Math.max(0, totalSeconds - next);

                // 5-minute warning
                if (remaining === 300 && !hasShownWarningRef.current) {
                    hasShownWarningRef.current = true;
                    notifications.show({
                        title: 'Time Warning',
                        message: '⏰ 5 minutes remaining!',
                        color: 'orange',
                        icon: createElement(IconClock, { size: 20 }),
                        autoClose: 10000,
                    });
                }

                // Time up → grace period
                if (remaining <= 0 && !hasAutoSubmittedRef.current && !hasTriggeredGracePeriodRef.current) {
                    hasTriggeredGracePeriodRef.current = true;
                    clearInterval(timer);
                    triggerGracePeriod();
                }

                return next;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [hasTimer, testSubmitted, isPaused, totalSeconds, triggerGracePeriod]);

    const timeRemaining = hasTimer ? Math.max(0, totalSeconds - elapsedSeconds) : Infinity;

    const togglePause = useCallback(() => {
        if (!allowPause) return;
        setIsPaused(prev => !prev);
    }, [allowPause]);

    const formatTime = (seconds: number): string => {
        if (!isFinite(seconds)) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return {
        timeRemaining,
        formatTime,
        isPaused,
        togglePause,
        showTimeUpOverlay,
        gracePeriodRemaining,
        hasTimer,
    };
};
