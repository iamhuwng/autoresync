/**
 * useActiveTimeTracking — PRD-0030 Task 3.4
 * Tracks active writing time per task using useRef for all state.
 * [GAP-10] taskCount is CONSTANT for session lifetime.
 * Pauses after 5-minute gap (300s) of no keystrokes.
 */

import { useRef, useCallback, useEffect, useMemo } from 'react';

export interface ActiveTimeResult {
    getActiveTime: (taskNumber: number) => number;
    onKeystroke: (taskNumber: number) => void;
    switchTask: (taskNumber: number) => void;
    pause: () => void;
    seedActiveTimes: (times: Partial<Record<1 | 2, number>>) => void;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function useActiveTimeTracking(_taskCount: 1 | 2): ActiveTimeResult {
    const activeTimesRef = useRef<Record<number, number>>({
        1: 0,
        2: 0,
    });
    const currentTaskRef = useRef<number>(1);
    const lastKeystrokeRef = useRef<number>(0);
    const trackingStartRef = useRef<number>(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const trackingActiveRef = useRef<boolean>(false);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = undefined;
        }
    }, []);

    const getEffectiveSegmentEnd = useCallback((now: number): number => {
        const lastKeystroke = lastKeystrokeRef.current;
        if (lastKeystroke && now - lastKeystroke > IDLE_TIMEOUT_MS) {
            return lastKeystroke;
        }
        return now;
    }, []);

    const commitCurrentSegment = useCallback((now: number) => {
        if (!trackingActiveRef.current) return;
        const task = currentTaskRef.current;
        const effectiveEnd = getEffectiveSegmentEnd(now);
        const elapsed = Math.round((effectiveEnd - trackingStartRef.current) / 1000);
        if (elapsed > 0) {
            activeTimesRef.current[task] = (activeTimesRef.current[task] || 0) + elapsed;
        }
    }, [getEffectiveSegmentEnd]);

    const pause = useCallback(() => {
        if (!trackingActiveRef.current) return;
        commitCurrentSegment(Date.now());
        trackingActiveRef.current = false;
        stopInterval();
    }, [commitCurrentSegment, stopInterval]);

    const startTracking = useCallback((now: number) => {
        if (trackingActiveRef.current) return;
        trackingActiveRef.current = true;
        trackingStartRef.current = now;

        stopInterval();
        intervalRef.current = setInterval(() => {
            const tickNow = Date.now();
            const lastKeystroke = lastKeystrokeRef.current;

            // Pause tracking once idle past IDLE_TIMEOUT_MS
            if (lastKeystroke && tickNow - lastKeystroke > IDLE_TIMEOUT_MS) {
                commitCurrentSegment(tickNow);
                trackingActiveRef.current = false;
                stopInterval();
            }
        }, 5000);
    }, [commitCurrentSegment, stopInterval]);

    const onKeystroke = useCallback((taskNumber: number) => {
        const now = Date.now();

        if (trackingActiveRef.current) {
            const isIdle = Boolean(lastKeystrokeRef.current && now - lastKeystrokeRef.current > IDLE_TIMEOUT_MS);
            if (isIdle || currentTaskRef.current !== taskNumber) {
                commitCurrentSegment(now);
                trackingStartRef.current = now;
            }
        }

        lastKeystrokeRef.current = now;
        currentTaskRef.current = taskNumber;

        if (!trackingActiveRef.current) {
            startTracking(now);
        }
    }, [commitCurrentSegment, startTracking]);

    const switchTask = useCallback((taskNumber: number) => {
        const now = Date.now();
        if (trackingActiveRef.current) {
            const isIdle = Boolean(lastKeystrokeRef.current && now - lastKeystrokeRef.current > IDLE_TIMEOUT_MS);
            commitCurrentSegment(now);
            if (isIdle) {
                trackingActiveRef.current = false;
                stopInterval();
            } else {
                trackingStartRef.current = now;
            }
        }

        currentTaskRef.current = taskNumber;
    }, [commitCurrentSegment, stopInterval]);

    const getActiveTime = useCallback((taskNumber: number): number => {
        let time = activeTimesRef.current[taskNumber] || 0;

        // Add current session time if tracking is active for this task (capped at idle timeout)
        if (trackingActiveRef.current && currentTaskRef.current === taskNumber) {
            const effectiveEnd = getEffectiveSegmentEnd(Date.now());
            const current = Math.round((effectiveEnd - trackingStartRef.current) / 1000);
            if (current > 0) {
                time += current;
            }
        }

        return time;
    }, [getEffectiveSegmentEnd]);

    const seedActiveTimes = useCallback((times: Partial<Record<1 | 2, number>>) => {
        ([1, 2] as const).forEach((taskNumber) => {
            const seeded = times[taskNumber];
            if (typeof seeded === 'number' && Number.isFinite(seeded) && seeded > 0) {
                activeTimesRef.current[taskNumber] = (activeTimesRef.current[taskNumber] || 0) + Math.round(seeded);
            }
        });
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopInterval();
        };
    }, [stopInterval]);

    return useMemo(() => ({
        getActiveTime,
        onKeystroke,
        switchTask,
        pause,
        seedActiveTimes,
    }), [getActiveTime, onKeystroke, switchTask, pause, seedActiveTimes]);
}
