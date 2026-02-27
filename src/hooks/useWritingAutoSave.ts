/**
 * useWritingAutoSave — PRD-0030 Task 3.5
 * Debounced 3-second RTDB sync for writing essays.
 * RTDB paths: game_sessions/{sessionCode}/students/{studentUid}/writing/
 */

import { useRef, useCallback, useEffect } from 'react';
import { ref, set, get } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../services/firebase';

interface WritingAutoSaveResult {
    saveTask: (taskNumber: number, text: string) => void;
    saveActiveTab: (taskNumber: number) => void;
    addTabSwitch: () => void;
    loadSavedState: () => Promise<{
        task1Text: string;
        task2Text: string;
        activeTask: number;
        tabSwitches: number;
    } | null>;
    flushPendingSave: () => void;
}

export function useWritingAutoSave(
    sessionCode: string,
    studentUid: string
): WritingAutoSaveResult {
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const tabSwitchCountRef = useRef(0);
    const pendingSaveRef = useRef<{ taskNumber: number; text: string } | null>(null);

    const basePath = `game_sessions/${sessionCode}/students/${studentUid}/writing`;

    // Save a task text to RTDB (debounced 3s)
    const saveTask = useCallback((taskNumber: number, text: string) => {
        pendingSaveRef.current = { taskNumber, text };

        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                const taskPath = `${basePath}/task${taskNumber}`;
                await set(ref(database, taskPath), {
                    text,
                    lastSavedAt: Date.now(),
                });
                pendingSaveRef.current = null;
            } catch (err) {
                console.error('❌ Writing auto-save failed:', err);
            }
        }, 3000);
    }, [basePath]);

    // Save active tab immediately
    const saveActiveTab = useCallback((taskNumber: number) => {
        try {
            // Flush pending save first
            if (pendingSaveRef.current) {
                clearTimeout(saveTimerRef.current);
                const { taskNumber: pTask, text } = pendingSaveRef.current;
                set(ref(database, `${basePath}/task${pTask}`), {
                    text,
                    lastSavedAt: Date.now(),
                }).catch(console.error);
                pendingSaveRef.current = null;
            }

            set(ref(database, `${basePath}/activeTask`), taskNumber).catch(console.error);
        } catch (err) {
            console.error('❌ Failed to save active tab:', err);
        }
    }, [basePath]);

    // Track tab switches
    const addTabSwitch = useCallback(() => {
        tabSwitchCountRef.current += 1;
        set(ref(database, `${basePath}/tabSwitches`), tabSwitchCountRef.current).catch(console.error);
    }, [basePath]);

    // Load saved state on reconnect
    const loadSavedState = useCallback(async () => {
        try {
            const snap = await get(ref(database, basePath));
            if (!snap.exists()) return null;

            const data = snap.val();
            tabSwitchCountRef.current = data.tabSwitches || 0;

            return {
                task1Text: data.task1?.text || '',
                task2Text: data.task2?.text || '',
                activeTask: data.activeTask || 1,
                tabSwitches: data.tabSwitches || 0,
            };
        } catch (err) {
            console.error('❌ Failed to load saved state:', err);
            return null;
        }
    }, [basePath]);

    // Flush pending save immediately (on tab switch or submit)
    const flushPendingSave = useCallback(() => {
        if (pendingSaveRef.current) {
            clearTimeout(saveTimerRef.current);
            const { taskNumber, text } = pendingSaveRef.current;
            set(ref(database, `${basePath}/task${taskNumber}`), {
                text,
                lastSavedAt: Date.now(),
            }).catch(console.error);
            pendingSaveRef.current = null;
        }
    }, [basePath]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearTimeout(saveTimerRef.current);
        };
    }, []);

    return { saveTask, saveActiveTab, addTabSwitch, loadSavedState, flushPendingSave };
}
