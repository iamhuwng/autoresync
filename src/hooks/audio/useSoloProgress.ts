/**
 * useSoloProgress Hook
 * 
 * Saves and restores audio progress for solo study/homework mode.
 * Uses localStorage for persistence across browser sessions.
 * 
 * @see PRD-0018: Unified Audio Architecture - Solo Mode Progress
 */

import { useState, useCallback, useEffect } from 'react';

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
    /** Key prefix for localStorage */
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

const DEFAULT_STORAGE_PREFIX = 'solo_progress_';
const PROGRESS_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

    // Load saved progress on mount
    useEffect(() => {
        if (!enabled || !storageKey) {
            setSavedProgress(null);
            return;
        }

        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const parsed: SoloProgressData = JSON.parse(stored);

                // Check if progress is expired
                const now = Date.now();
                if (now - parsed.savedAt > PROGRESS_EXPIRY_MS) {
                    localStorage.removeItem(storageKey);
                    setSavedProgress(null);
                    console.log('🗑️ [SoloProgress] Expired progress cleared');
                } else {
                    setSavedProgress(parsed);
                    console.log(`📖 [SoloProgress] Loaded saved progress: Section ${parsed.section}, ${parsed.position.toFixed(1)}s`);
                }
            }
        } catch (error) {
            console.error('Failed to load solo progress:', error);
            setSavedProgress(null);
        }
    }, [enabled, storageKey]);

    /**
     * Save current progress to localStorage
     */
    const saveProgress = useCallback((
        section: number,
        position: number,
        speed: number = 1.0,
        volume: number = 0.8
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

        try {
            localStorage.setItem(storageKey, JSON.stringify(progressData));
            setSavedProgress(progressData);
            console.log(`💾 [SoloProgress] Saved: Section ${section}, ${position.toFixed(1)}s`);
        } catch (error) {
            console.error('Failed to save solo progress:', error);
        }
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

        try {
            localStorage.removeItem(storageKey);
            setSavedProgress(null);
            setDismissed(false);
            console.log('🗑️ [SoloProgress] Progress cleared');
        } catch (error) {
            console.error('Failed to clear solo progress:', error);
        }
    }, [storageKey]);

    /**
     * Dismiss resume prompt without clearing saved data
     */
    const dismissResume = useCallback(() => {
        setDismissed(true);
    }, []);

    // Calculate if we should show resume option
    const hasResumeableProgress = !!(
        savedProgress &&
        !dismissed &&
        savedProgress.position > 5 // Only show if more than 5 seconds in
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
