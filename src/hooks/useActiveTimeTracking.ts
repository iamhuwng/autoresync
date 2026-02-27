/**
 * useActiveTimeTracking — PRD-0030 Task 3.4
 * Tracks active writing time per task using useRef for all state.
 * [GAP-10] taskCount is CONSTANT for session lifetime.
 * Pauses after 5-minute gap (300s) of no keystrokes.
 */

import { useRef, useCallback, useEffect } from 'react';

interface ActiveTimeResult {
    getActiveTime: (taskNumber: number) => number;
    onKeystroke: (taskNumber: number) => void;
    switchTask: (taskNumber: number) => void;
}

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

    const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    const startTracking = useCallback(() => {
        if (trackingActiveRef.current) return;
        trackingActiveRef.current = true;
        trackingStartRef.current = Date.now();

        // Clear any existing interval
        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
            const now = Date.now();
            const lastKeystroke = lastKeystrokeRef.current;

            // Check if idle for too long
            if (lastKeystroke && now - lastKeystroke > IDLE_TIMEOUT_MS) {
                // Pause tracking — add accumulated time
                const task = currentTaskRef.current;
                const elapsed = Math.round((lastKeystroke - trackingStartRef.current) / 1000);
                if (elapsed > 0) {
                    activeTimesRef.current[task] = (activeTimesRef.current[task] || 0) + elapsed;
                }
                trackingActiveRef.current = false;
                if (intervalRef.current) clearInterval(intervalRef.current);
                intervalRef.current = undefined;
            }
        }, 5000); // Check every 5 seconds
    }, [IDLE_TIMEOUT_MS]);

    const onKeystroke = useCallback((taskNumber: number) => {
        lastKeystrokeRef.current = Date.now();
        currentTaskRef.current = taskNumber;

        if (!trackingActiveRef.current) {
            startTracking();
        }
    }, [startTracking]);

    const switchTask = useCallback((taskNumber: number) => {
        // Save previous task's time
        if (trackingActiveRef.current) {
            const prevTask = currentTaskRef.current;
            const now = Date.now();
            const elapsed = Math.round((now - trackingStartRef.current) / 1000);
            if (elapsed > 0) {
                activeTimesRef.current[prevTask] = (activeTimesRef.current[prevTask] || 0) + elapsed;
            }
            trackingStartRef.current = now;
        }

        currentTaskRef.current = taskNumber;
    }, []);

    const getActiveTime = useCallback((taskNumber: number): number => {
        let time = activeTimesRef.current[taskNumber] || 0;

        // Add current session time if tracking is active for this task
        if (trackingActiveRef.current && currentTaskRef.current === taskNumber) {
            const now = Date.now();
            const current = Math.round((now - trackingStartRef.current) / 1000);
            time += current;
        }

        return time;
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    return { getActiveTime, onKeystroke, switchTask };
}
