// File: src/hooks/solo/useSoloAutoSave.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { storage } from '@/core/platform/storage';
import type { SavedMobileState, SoloSessionProgress } from '../../types/practice.types';
import type { AutoSaveStatus } from '../useTestAutoSave';

interface UseSoloAutoSaveOptions {
    materialId: string | undefined;
    studentId: string | undefined;
    answers: Record<number, any>;
    currentQuestion: number;
    timeElapsed: number;
    mobileState?: SavedMobileState;
    enabled: boolean;  // false when test is submitted
}

const SAVE_INTERVAL_MS = 30_000; // 30 seconds
const EXPIRY_DAYS = 7;

function getStorageKey(materialId: string, studentId: string): string {
    return `solo_progress_${materialId}_${studentId}`;
}

export const useSoloAutoSave = ({
    materialId,
    studentId,
    answers,
    currentQuestion,
    timeElapsed,
    mobileState,
    enabled,
}: UseSoloAutoSaveOptions): AutoSaveStatus => {
    const [status, setStatus] = useState<AutoSaveStatus['status']>('idle');
    const [lastSaved, setLastSaved] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lastSaveRef = useRef<number>(Date.now());
    const isSavingRef = useRef(false);
    const statusResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Use refs for values that change frequently to avoid interval reset on every keystroke
    const answersRef = useRef(answers);
    const currentQuestionRef = useRef(currentQuestion);
    const timeElapsedRef = useRef(timeElapsed);
    const mobileStateRef = useRef(mobileState);

    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
    useEffect(() => { timeElapsedRef.current = timeElapsed; }, [timeElapsed]);
    useEffect(() => { mobileStateRef.current = mobileState; }, [mobileState]);

    const clearStatusResetTimer = useCallback(() => {
        if (statusResetTimeoutRef.current) {
            clearTimeout(statusResetTimeoutRef.current);
            statusResetTimeoutRef.current = null;
        }
    }, []);

    const scheduleStatusReset = useCallback((delayMs: number, clearError = false) => {
        clearStatusResetTimer();
        statusResetTimeoutRef.current = setTimeout(() => {
            setStatus('idle');
            if (clearError) {
                setError(null);
            }
            statusResetTimeoutRef.current = null;
        }, delayMs);
    }, [clearStatusResetTimer]);

    const saveProgress = useCallback(async () => {
        if (!materialId || !studentId || !enabled || isSavingRef.current) {
            return;
        }

        const now = Date.now();
        if (now - lastSaveRef.current < SAVE_INTERVAL_MS - 1000) {
            return;
        }

        try {
            isSavingRef.current = true;
            clearStatusResetTimer();
            setStatus('saving');
            setError(null);

            const key = getStorageKey(materialId, studentId);
            const existing = await storage.get<SoloSessionProgress>(key);
            const startedAt = existing && typeof existing === 'object' && 'startedAt' in existing
                ? Number((existing as SoloSessionProgress).startedAt) || now
                : now;

            const progress: SoloSessionProgress = {
                materialId,
                studentId,
                answers: answersRef.current,
                currentQuestion: currentQuestionRef.current,
                timeElapsed: timeElapsedRef.current,
                startedAt,
                lastSavedAt: now,
                mobileState: mobileStateRef.current,
            };

            await storage.set(key, progress);
            lastSaveRef.current = now;
            setLastSaved(now);
            setStatus('saved');
            scheduleStatusReset(2000);
            console.log('💾 [SoloAutoSave] Progress saved');
        } catch (err) {
            console.warn('Failed to save solo progress:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            setStatus('error');
            scheduleStatusReset(5000, true);
        } finally {
            isSavingRef.current = false;
        }
    }, [clearStatusResetTimer, enabled, materialId, scheduleStatusReset, studentId]);

    useEffect(() => {
        if (!materialId || !studentId || !enabled) return;

        const timer = setInterval(() => {
            void saveProgress();
        }, SAVE_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [enabled, materialId, saveProgress, studentId]);

    useEffect(() => {
        return () => {
            clearStatusResetTimer();
        };
    }, [clearStatusResetTimer]);

    return {
        status,
        lastSaved,
        error,
    };
};

/**
 * Utility: Clear saved progress for a material (called on submit or "Start New").
 */
export async function clearSoloProgress(materialId: string, studentId: string): Promise<void> {
    await storage.remove(getStorageKey(materialId, studentId));
}

/**
 * Utility: Cleanup expired progress entries (older than EXPIRY_DAYS).
 * Call this on app startup or dashboard load.
 */
export async function cleanupExpiredProgress(): Promise<void> {
    const now = Date.now();
    const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    const keys = await storage.keys('solo_progress_');

    for (const key of keys) {
        try {
            const data = await storage.get<SoloSessionProgress>(key);
            if (
                !data
                || typeof data !== 'object'
                || !('lastSavedAt' in data)
                || typeof (data as SoloSessionProgress).lastSavedAt !== 'number'
                || now - (data as SoloSessionProgress).lastSavedAt > expiryMs
            ) {
                await storage.remove(key);
            }
        } catch {
            await storage.remove(key);
        }
    }
}
