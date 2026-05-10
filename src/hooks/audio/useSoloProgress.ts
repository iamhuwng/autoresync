/**
 * useSoloProgress Hook
 *
 * Saves and restores audio progress for solo study/homework mode.
 * Uses the platform storage abstraction for portability across browser/mobile runtimes.
 *
 * @see PRD-0018: Unified Audio Architecture - Solo Mode Progress
 */

import { useState, useCallback, useEffect } from 'react';
import { storage } from '../../core/platform/storage';

// ============================================================
// TYPES
// ============================================================

interface SoloProgressData {
    /** Test/material ID for this progress */
    testId: string;
    /** Current section number */
    section: number;
    /** Current position within section (seconds) */
    position: number;
    /** Playback speed setting */
    speed: number;
    /** Volume setting */
    volume: number;
    /** Timestamp when progress was saved */
    savedAt: number;
}

export interface UseSoloProgressOptions {
    /** The test or material ID */
    testId: string | undefined;
    /** Whether solo mode is active */
    enabled?: boolean;
    /** Key prefix for persistent storage */
    storageKeyPrefix?: string;
}

export interface UseSoloProgressReturn {
    /** Saved progress data (if exists) */
    savedProgress: SoloProgressData | null;
    /** Whether we have resumable progress */
    hasResumeableProgress: boolean;
    /** Save current progress */
    saveProgress: (section: number, position: number, speed?: number, volume?: number) => void;
    /** Resume from saved progress */
    resumeProgress: () => SoloProgressData | null;
    /** Clear saved progress (on completion or user choice) */
    clearProgress: () => void;
    /** Dismiss resume prompt without clearing */
    dismissResume: () => void;
}

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_STORAGE_PREFIX = 'audio_progress_';
const LEGACY_STORAGE_PREFIX = 'solo_progress_';
const PROGRESS_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================================
// HELPERS
// ============================================================

function isSoloProgressData(value: unknown): value is SoloProgressData {
    return Boolean(
        value
        && typeof value === 'object'
        && 'testId' in value
        && 'section' in value
        && 'position' in value
        && 'savedAt' in value,
    );
}

// ============================================================
// HOOK IMPLEMENTATION
// ============================================================

export function useSoloProgress({
    testId,
    enabled = true,
    storageKeyPrefix = DEFAULT_STORAGE_PREFIX,
}: UseSoloProgressOptions): UseSoloProgressReturn {
    const [savedProgress, setSavedProgress] = useState<SoloProgressData | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const storageKey = testId ? `${storageKeyPrefix}${testId}` : null;
    const legacyStorageKey = testId ? `${LEGACY_STORAGE_PREFIX}${testId}` : null;

    // Load saved progress on mount
    useEffect(() => {
        if (!enabled || !storageKey) {
            setSavedProgress(null);
            return;
        }

        let cancelled = false;

        void (async () => {
            try {
                const candidateKeys = [storageKey];
                if (legacyStorageKey && legacyStorageKey !== storageKey) {
                    candidateKeys.push(legacyStorageKey);
                }

                for (const candidateKey of candidateKeys) {
                    const parsed = await storage.get<SoloProgressData>(candidateKey);
                    if (!isSoloProgressData(parsed)) {
                        continue;
                    }

                    if (Date.now() - parsed.savedAt > PROGRESS_EXPIRY_MS) {
                        await storage.remove(candidateKey);
                        console.log('[SoloProgress] Expired progress cleared');
                        continue;
                    }

                    if (candidateKey !== storageKey) {
                        await storage.set(storageKey, parsed);
                        await storage.remove(candidateKey);
                    }

                    if (!cancelled) {
                        setSavedProgress(parsed);
                        console.log(`[SoloProgress] Loaded saved progress: Section ${parsed.section}, ${parsed.position.toFixed(1)}s`);
                    }
                    return;
                }

                if (!cancelled) {
                    setSavedProgress(null);
                }
            } catch (error) {
                console.error('Failed to load solo progress:', error);
                if (!cancelled) {
                    setSavedProgress(null);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled, legacyStorageKey, storageKey]);

    /**
     * Save current progress to persistent storage
     */
    const saveProgress = useCallback((
        section: number,
        position: number,
        speed: number = 1.0,
        volume: number = 0.8,
    ) => {
        if (!enabled || !storageKey || !testId) return;

        const progressData: SoloProgressData = {
            testId,
            section,
            position,
            speed,
            volume,
            savedAt: Date.now(),
        };

        void storage.set(storageKey, progressData).catch((error) => {
            console.error('Failed to save solo progress:', error);
        });
        setSavedProgress(progressData);
        console.log(`[SoloProgress] Saved: Section ${section}, ${position.toFixed(1)}s`);
    }, [enabled, storageKey, testId]);

    /**
     * Get saved progress for resuming
     */
    const resumeProgress = useCallback((): SoloProgressData | null => {
        setDismissed(true);
        return savedProgress;
    }, [savedProgress]);

    /**
     * Clear saved progress (on completion or user choice)
     */
    const clearProgress = useCallback(() => {
        if (!storageKey) return;

        void storage.remove(storageKey);
        if (legacyStorageKey && legacyStorageKey !== storageKey) {
            void storage.remove(legacyStorageKey);
        }
        setSavedProgress(null);
        setDismissed(false);
        console.log('[SoloProgress] Progress cleared');
    }, [legacyStorageKey, storageKey]);

    /**
     * Dismiss resume prompt without clearing saved data
     */
    const dismissResume = useCallback(() => {
        setDismissed(true);
    }, []);

    // Calculate if we should show resume option
    const hasResumeableProgress = !!(
        savedProgress
        && !dismissed
        && savedProgress.position > 5 // Only show if more than 5 seconds in
    );

    return {
        savedProgress,
        hasResumeableProgress,
        saveProgress,
        resumeProgress,
        clearProgress,
        dismissResume,
    };
}
