/**
 * useWritingAutoSave — PRD-0030 Task 3.5
 * Debounced 3-second RTDB sync for writing essays.
 * RTDB paths: game_sessions/{sessionCode}/students/{studentUid}/writing/
 *
 * The returned object is referentially stable for a given session/student so
 * consumers can safely list it in effect dependencies.
 */

import { useRef, useCallback, useEffect, useMemo } from 'react';
import { ref, set, get, update } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../services/firebase';

export type WritingAutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface WritingSavedState {
    task1Text: string;
    task2Text: string;
    activeTask: number;
    tabSwitches: number;
    pasteAttemptCount: number;
    activeTimeSeconds: { 1: number; 2: number };
    submitted: boolean;
    reopened: boolean;
}

export interface UseWritingAutoSaveOptions {
    onSaveStatusChange?: (status: WritingAutoSaveStatus) => void;
}

export interface WritingAutoSaveResult {
    saveTask: (taskNumber: number, text: string) => void;
    saveActiveTab: (taskNumber: number) => void;
    addTabSwitch: () => void;
    loadSavedState: () => Promise<WritingSavedState | null>;
    /** Writes any debounced essay text now and waits for any in-flight write to settle. */
    flushPendingSave: () => Promise<void>;
    /** Persists per-task active writing seconds used by submission. */
    saveActiveTimes: (activeTimeSeconds: Partial<Record<1 | 2, number>>) => Promise<void>;
}

const SAVE_DEBOUNCE_MS = 3000;

export function useWritingAutoSave(
    sessionCode: string,
    studentUid: string,
    options?: UseWritingAutoSaveOptions,
): WritingAutoSaveResult {
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const tabSwitchCountRef = useRef(0);
    const pendingSaveRef = useRef<{ taskNumber: number; text: string } | null>(null);
    const inFlightFlushRef = useRef<Promise<void> | null>(null);
    const lastStatusRef = useRef<WritingAutoSaveStatus>('idle');
    const onSaveStatusChangeRef = useRef(options?.onSaveStatusChange);
    onSaveStatusChangeRef.current = options?.onSaveStatusChange;

    const hasIdentity = Boolean(sessionCode && studentUid);
    const basePath = `game_sessions/${sessionCode}/students/${studentUid}/writing`;

    const notifyStatus = useCallback((status: WritingAutoSaveStatus) => {
        if (lastStatusRef.current === status) return;
        lastStatusRef.current = status;
        onSaveStatusChangeRef.current?.(status);
    }, []);

    const writeTask = useCallback(async (taskNumber: number, text: string) => {
        if (!hasIdentity) return;
        // Merge-update so per-task fields such as activeTimeSeconds survive.
        await update(ref(database, `${basePath}/task${taskNumber}`), {
            text,
            lastSavedAt: Date.now(),
        });
    }, [basePath, hasIdentity]);

    const flushPendingSave = useCallback(async () => {
        clearTimeout(saveTimerRef.current);

        // Wait for any already-running flush so callers (like submit) never race an in-flight write.
        if (inFlightFlushRef.current) {
            try {
                await inFlightFlushRef.current;
            } catch {
                // Re-attempt below if the failed payload was restored to pendingSaveRef.
            }
        }

        if (!hasIdentity) return;

        while (pendingSaveRef.current) {
            const pending = pendingSaveRef.current;
            pendingSaveRef.current = null;
            notifyStatus('saving');

            const writePromise = writeTask(pending.taskNumber, pending.text)
                .then(() => {
                    if (!pendingSaveRef.current) {
                        notifyStatus('saved');
                    }
                })
                .catch((err) => {
                    // Keep the newest unsaved text queued so a later flush can retry it.
                    if (!pendingSaveRef.current) {
                        pendingSaveRef.current = pending;
                    }
                    notifyStatus('error');
                    throw err;
                })
                .finally(() => {
                    if (inFlightFlushRef.current === writePromise) {
                        inFlightFlushRef.current = null;
                    }
                });

            inFlightFlushRef.current = writePromise;
            await writePromise;
        }
    }, [hasIdentity, notifyStatus, writeTask]);

    // Save a task text to RTDB (debounced 3s)
    const saveTask = useCallback((taskNumber: number, text: string) => {
        if (!hasIdentity) return;

        if (pendingSaveRef.current && pendingSaveRef.current.taskNumber !== taskNumber) {
            // Never drop another task's unsaved text when the active task changes.
            void flushPendingSave().catch((err) => console.error('❌ Writing auto-save failed:', err));
        }
        pendingSaveRef.current = { taskNumber, text };
        notifyStatus('saving');

        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            void flushPendingSave().catch((err) => console.error('❌ Writing auto-save failed:', err));
        }, SAVE_DEBOUNCE_MS);
    }, [flushPendingSave, hasIdentity, notifyStatus]);

    // Save active tab immediately (after flushing pending text)
    const saveActiveTab = useCallback((taskNumber: number) => {
        if (!hasIdentity) return;

        void flushPendingSave().catch((err) => console.error('❌ Writing auto-save failed:', err));
        set(ref(database, `${basePath}/activeTask`), taskNumber).catch((err) => {
            console.error('❌ Failed to save active tab:', err);
        });
    }, [basePath, flushPendingSave, hasIdentity]);

    // Track tab switches
    const addTabSwitch = useCallback(() => {
        if (!hasIdentity) return;

        tabSwitchCountRef.current += 1;
        set(ref(database, `${basePath}/tabSwitches`), tabSwitchCountRef.current).catch(console.error);
    }, [basePath, hasIdentity]);

    const saveActiveTimes = useCallback(async (activeTimeSeconds: Partial<Record<1 | 2, number>>) => {
        if (!hasIdentity) return;

        const updates: Record<string, number> = {};
        ([1, 2] as const).forEach((taskNumber) => {
            const seconds = activeTimeSeconds[taskNumber];
            if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
                updates[`task${taskNumber}/activeTimeSeconds`] = Math.round(seconds);
            }
        });
        if (Object.keys(updates).length === 0) return;
        await update(ref(database, basePath), updates);
    }, [basePath, hasIdentity]);

    // Load saved state on reconnect
    const loadSavedState = useCallback(async (): Promise<WritingSavedState | null> => {
        if (!hasIdentity) return null;

        try {
            const snap = await get(ref(database, basePath));
            if (!snap.exists()) return null;

            const data = snap.val() || {};
            tabSwitchCountRef.current = data.tabSwitches || 0;

            return {
                task1Text: data.task1?.text || '',
                task2Text: data.task2?.text || '',
                activeTask: data.activeTask || (data.task2 && !data.task1 ? 2 : 1),
                tabSwitches: data.tabSwitches || 0,
                pasteAttemptCount: data.pasteAttemptCount || 0,
                activeTimeSeconds: {
                    1: Number(data.task1?.activeTimeSeconds) || 0,
                    2: Number(data.task2?.activeTimeSeconds) || 0,
                },
                submitted: data.submitted === true,
                reopened: data.reopened === true,
            };
        } catch (err) {
            console.error('❌ Failed to load saved state:', err);
            return null;
        }
    }, [basePath, hasIdentity]);

    // Cleanup on unmount: write any debounced text instead of discarding it.
    useEffect(() => {
        return () => {
            void flushPendingSave().catch((err) => console.error('❌ Writing auto-save failed:', err));
        };
    }, [flushPendingSave]);

    return useMemo(() => ({
        saveTask,
        saveActiveTab,
        addTabSwitch,
        loadSavedState,
        flushPendingSave,
        saveActiveTimes,
    }), [saveTask, saveActiveTab, addTabSwitch, loadSavedState, flushPendingSave, saveActiveTimes]);
}
