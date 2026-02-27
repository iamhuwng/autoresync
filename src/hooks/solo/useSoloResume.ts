// File: src/hooks/solo/useSoloResume.ts
import { useState, useEffect } from 'react';
import type { SoloSessionProgress } from '../../types/practice.types';

interface UseSoloResumeOptions {
    materialId: string | undefined;
    studentId: string | undefined;
}

interface UseSoloResumeReturn {
    /** Saved progress, or null if none exists */
    savedProgress: SoloSessionProgress | null;
    /** Whether we're still checking */
    checking: boolean;
    /** Call to discard saved progress and start fresh */
    discardProgress: () => void;
}

export const useSoloResume = ({ materialId, studentId }: UseSoloResumeOptions): UseSoloResumeReturn => {
    const [savedProgress, setSavedProgress] = useState<SoloSessionProgress | null>(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        if (!materialId || !studentId) {
            setChecking(false);
            return;
        }

        const key = `solo_progress_${materialId}_${studentId}`;
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored) as SoloSessionProgress;
                // Check if expired (7 days)
                const expiryMs = 7 * 24 * 60 * 60 * 1000;
                if (Date.now() - parsed.lastSavedAt < expiryMs) {
                    setSavedProgress(parsed);
                } else {
                    localStorage.removeItem(key);
                }
            }
        } catch {
            // Corrupted — ignore
        }
        setChecking(false);
    }, [materialId, studentId]);

    const discardProgress = () => {
        if (materialId && studentId) {
            localStorage.removeItem(`solo_progress_${materialId}_${studentId}`);
        }
        setSavedProgress(null);
    };

    return { savedProgress, checking, discardProgress };
};
