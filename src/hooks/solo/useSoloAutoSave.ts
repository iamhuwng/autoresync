import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppLifecycle } from '@/core/platform/hooks/useAppLifecycle';
import { storage } from '@/core/platform/storage';
import type { SavedMobileState, SoloProgressScopeContext, SoloSessionProgress } from '../../types/practice.types';
import type { AutoSaveStatus } from '../useTestAutoSave';
import { buildSoloProgressStorageKey, removeSoloProgress } from '../../services/soloProgress.service';

interface UseSoloAutoSaveOptions {
    materialId: string | undefined;
    studentId: string | undefined;
    scopeContext?: SoloProgressScopeContext;
    attemptId?: string;
    submissionOperationId?: string;
    acceptedResultId?: string;
    submitPhase?: SoloSessionProgress['submitPhase'];
    answers: Record<number, any>;
    currentQuestion: number;
    timeElapsed: number;
    mobileState?: SavedMobileState;
    enabled: boolean;  // false when test is submitted
}

export interface SoloAutoSaveFlushOutcome {
    outcome: 'saved' | 'skipped' | 'failed';
    savedAt: number | null;
    error: string | null;
}

export interface SoloAutoSaveStatus extends AutoSaveStatus {
    flushNow: () => Promise<SoloAutoSaveFlushOutcome>;
    waitForAcceptedSave: () => Promise<SoloAutoSaveFlushOutcome | undefined>;
}

const SAVE_INTERVAL_MS = 30_000; // 30 seconds
const EXPIRY_DAYS = 7;

export const useSoloAutoSave = ({
    materialId,
    studentId,
    scopeContext,
    attemptId,
    submissionOperationId,
    acceptedResultId,
    submitPhase,
    answers,
    currentQuestion,
    timeElapsed,
    mobileState,
    enabled,
}: UseSoloAutoSaveOptions): SoloAutoSaveStatus => {
    const [status, setStatus] = useState<AutoSaveStatus['status']>('idle');
    const [lastSaved, setLastSaved] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lastSaveRef = useRef<number>(Date.now());
    const lastSavedValueRef = useRef<number | null>(null);
    const inFlightSaveRef = useRef<Promise<SoloAutoSaveFlushOutcome> | null>(null);
    const isMountedRef = useRef(true);
    const statusResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const saveProgressRef = useRef<(options?: { force?: boolean }) => Promise<SoloAutoSaveFlushOutcome>>(
        async () => ({ outcome: 'skipped', savedAt: null, error: null }),
    );

    // Use refs for values that change frequently to avoid interval reset on every keystroke.
    const answersRef = useRef(answers);
    const currentQuestionRef = useRef(currentQuestion);
    const timeElapsedRef = useRef(timeElapsed);
    const mobileStateRef = useRef(mobileState);
    const scopeContextRef = useRef(scopeContext);
    const attemptIdRef = useRef(attemptId);
    const submissionOperationIdRef = useRef(submissionOperationId);
    const acceptedResultIdRef = useRef(acceptedResultId);
    const submitPhaseRef = useRef(submitPhase);

    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
    useEffect(() => { timeElapsedRef.current = timeElapsed; }, [timeElapsed]);
    useEffect(() => { mobileStateRef.current = mobileState; }, [mobileState]);
    useEffect(() => { scopeContextRef.current = scopeContext; }, [scopeContext]);
    useEffect(() => { attemptIdRef.current = attemptId; }, [attemptId]);
    useEffect(() => { submissionOperationIdRef.current = submissionOperationId; }, [submissionOperationId]);
    useEffect(() => { acceptedResultIdRef.current = acceptedResultId; }, [acceptedResultId]);
    useEffect(() => { submitPhaseRef.current = submitPhase; }, [submitPhase]);

    const clearStatusResetTimer = useCallback(() => {
        if (statusResetTimeoutRef.current) {
            clearTimeout(statusResetTimeoutRef.current);
            statusResetTimeoutRef.current = null;
        }
    }, []);

    const scheduleStatusReset = useCallback((delayMs: number, clearError = false) => {
        clearStatusResetTimer();
        statusResetTimeoutRef.current = setTimeout(() => {
            if (!isMountedRef.current) {
                statusResetTimeoutRef.current = null;
                return;
            }
            setStatus('idle');
            if (clearError) {
                setError(null);
            }
            statusResetTimeoutRef.current = null;
        }, delayMs);
    }, [clearStatusResetTimer]);

    const saveProgress = useCallback((options?: { force?: boolean }): Promise<SoloAutoSaveFlushOutcome> => {
        if (!materialId || !studentId || !enabled) {
            return Promise.resolve({ outcome: 'skipped', savedAt: lastSavedValueRef.current, error: null });
        }

        if (inFlightSaveRef.current) {
            return inFlightSaveRef.current;
        }

        const now = Date.now();
        if (!options?.force && now - lastSaveRef.current < SAVE_INTERVAL_MS - 1000) {
            return Promise.resolve({ outcome: 'skipped', savedAt: lastSavedValueRef.current, error: null });
        }

        const operation = (async (): Promise<SoloAutoSaveFlushOutcome> => {
            try {
                clearStatusResetTimer();
                if (isMountedRef.current) {
                    setStatus('saving');
                    setError(null);
                }

                const key = buildSoloProgressStorageKey({
                    materialId,
                    studentId,
                    scopeContext: scopeContextRef.current,
                });
                const existing = await storage.get<SoloSessionProgress>(key);
                const startedAt = existing && typeof existing === 'object' && 'startedAt' in existing
                    ? Number((existing as SoloSessionProgress).startedAt) || now
                    : now;

                const progress: SoloSessionProgress = {
                    materialId,
                    studentId,
                    scopeContext: scopeContextRef.current,
                    answers: answersRef.current,
                    currentQuestion: currentQuestionRef.current,
                    timeElapsed: timeElapsedRef.current,
                    startedAt,
                    lastSavedAt: now,
                    mobileState: mobileStateRef.current,
                };

                if (attemptIdRef.current) progress.attemptId = attemptIdRef.current;
                if (submissionOperationIdRef.current) progress.submissionOperationId = submissionOperationIdRef.current;
                if (acceptedResultIdRef.current) progress.acceptedResultId = acceptedResultIdRef.current;
                if (submitPhaseRef.current) progress.submitPhase = submitPhaseRef.current;

                await storage.set(key, progress);
                lastSaveRef.current = now;
                lastSavedValueRef.current = now;
                if (isMountedRef.current) {
                    setLastSaved(now);
                    setStatus('saved');
                    scheduleStatusReset(2000);
                }
                console.log('[SoloAutoSave] Progress saved');

                return { outcome: 'saved', savedAt: now, error: null };
            } catch (err) {
                console.warn('Failed to save solo progress:', err);
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (isMountedRef.current) {
                    setError(message);
                    setStatus('error');
                    scheduleStatusReset(5000, true);
                }
                return { outcome: 'failed', savedAt: null, error: message };
            } finally {
                inFlightSaveRef.current = null;
            }
        })();

        inFlightSaveRef.current = operation;
        return operation;
    }, [clearStatusResetTimer, enabled, materialId, scheduleStatusReset, studentId]);

    useEffect(() => {
        saveProgressRef.current = saveProgress;
    }, [saveProgress]);

    useEffect(() => {
        if (!materialId || !studentId || !enabled) return;

        const timer = setInterval(() => {
            void saveProgressRef.current();
        }, SAVE_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [enabled, materialId, studentId]);

    const flushProgress = useCallback(() => {
        if (!enabled || !materialId || !studentId) {
            return;
        }

        void saveProgressRef.current({ force: true });
    }, [enabled, materialId, studentId]);

    const flushNow = useCallback(() => saveProgressRef.current({ force: true }), []);

    const waitForAcceptedSave = useCallback(() => (
        inFlightSaveRef.current ?? Promise.resolve(undefined)
    ), []);

    useAppLifecycle({
        onBackground: flushProgress,
        onBeforeUnload: flushProgress,
    });

    useEffect(() => {
        return () => {
            void saveProgressRef.current({ force: true });
        };
    }, []);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            clearStatusResetTimer();
        };
    }, [clearStatusResetTimer]);

    return {
        status,
        lastSaved,
        error,
        flushNow,
        waitForAcceptedSave,
    };
};

/**
 * Utility: Clear saved progress for a material (called on submit or "Start New").
 */
export async function clearSoloProgress(
    materialId: string,
    studentId: string,
    scopeContext?: SoloProgressScopeContext,
): Promise<void> {
    await removeSoloProgress({
        materialId,
        studentId,
        scopeContext,
    });
}

/**
 * Utility: Cleanup expired progress entries (older than EXPIRY_DAYS).
 * Call this on app startup or dashboard load.
 */
export async function cleanupExpiredProgress(): Promise<void> {
    const now = Date.now();
    const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const reservedKeys = await storage.keys('solo_progress_v2__');
    const legacyPracticeKeys = (await storage.keys('solo_progress_'))
        .filter((key) => !key.startsWith('solo_progress_v2__'));

    for (const key of reservedKeys) {
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

    for (const key of legacyPracticeKeys) {
        try {
            const data = await storage.get<SoloSessionProgress>(key);
            if (
                !data
                || typeof data !== 'object'
                || !('materialId' in data)
                || !('studentId' in data)
                || !('lastSavedAt' in data)
                || typeof (data as SoloSessionProgress).lastSavedAt !== 'number'
            ) {
                continue;
            }

            if (now - (data as SoloSessionProgress).lastSavedAt > expiryMs) {
                await storage.remove(key);
            }
        } catch {
            // Ignore unknown legacy payloads so unrelated namespaces are not deleted.
        }
    }
}
