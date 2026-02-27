// File: src/hooks/solo/useSoloAutoSave.ts
import { useEffect, useRef } from 'react';
import type { SoloSessionProgress } from '../../types/practice.types';

interface UseSoloAutoSaveOptions {
    materialId: string | undefined;
    studentId: string | undefined;
    answers: Record<number, any>;
    currentQuestion: number;
    timeElapsed: number;
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
    enabled,
}: UseSoloAutoSaveOptions): void => {
    const lastSaveRef = useRef<number>(Date.now());

    // Use refs for values that change frequently to avoid interval reset on every keystroke
    const answersRef = useRef(answers);
    const currentQuestionRef = useRef(currentQuestion);
    const timeElapsedRef = useRef(timeElapsed);

    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
    useEffect(() => { timeElapsedRef.current = timeElapsed; }, [timeElapsed]);

    useEffect(() => {
        if (!materialId || !studentId || !enabled) return;

        const timer = setInterval(() => {
            const now = Date.now();
            if (now - lastSaveRef.current < SAVE_INTERVAL_MS - 1000) return;

            const progress: SoloSessionProgress = {
                materialId,
                studentId,
                answers: answersRef.current,
                currentQuestion: currentQuestionRef.current,
                timeElapsed: timeElapsedRef.current,
                startedAt: 0, // Will be set on first save only
                lastSavedAt: now,
            };

            // Preserve original startedAt if exists
            const key = getStorageKey(materialId, studentId);
            try {
                const existing = localStorage.getItem(key);
                if (existing) {
                    const parsed = JSON.parse(existing) as SoloSessionProgress;
                    progress.startedAt = parsed.startedAt;
                } else {
                    progress.startedAt = now;
                }
                localStorage.setItem(key, JSON.stringify(progress));
                lastSaveRef.current = now;
                console.log('💾 [SoloAutoSave] Progress saved');
            } catch (err) {
                console.warn('Failed to save solo progress:', err);
            }
        }, SAVE_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [materialId, studentId, enabled]);
};

/**
 * Utility: Clear saved progress for a material (called on submit or "Start New").
 */
export function clearSoloProgress(materialId: string, studentId: string): void {
    localStorage.removeItem(getStorageKey(materialId, studentId));
}

/**
 * Utility: Cleanup expired progress entries (older than EXPIRY_DAYS).
 * Call this on app startup or dashboard load.
 */
export function cleanupExpiredProgress(): void {
    const now = Date.now();
    const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith('solo_progress_')) continue;

        try {
            const data = JSON.parse(localStorage.getItem(key) || '');
            if (now - data.lastSavedAt > expiryMs) {
                localStorage.removeItem(key);
            }
        } catch {
            // Corrupted entry — remove it
            if (key) localStorage.removeItem(key);
        }
    }
}
