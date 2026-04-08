// File: src/hooks/solo/useSoloResume.ts
import { useState, useEffect } from 'react';
import { storage } from '@/core/platform/storage';
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

        let cancelled = false;

        void (async () => {
            const key = `solo_progress_${materialId}_${studentId}`;
            try {
                const stored = await storage.get<SoloSessionProgress>(key);
                if (stored && typeof stored === 'object' && 'lastSavedAt' in stored) {
                    const parsed = stored as SoloSessionProgress;
                    const expiryMs = 7 * 24 * 60 * 60 * 1000;
                    if (Date.now() - parsed.lastSavedAt < expiryMs) {
                        if (!cancelled) {
                            setSavedProgress(parsed);
                        }
                    } else {
                        await storage.remove(key);
                    }
                }
            } catch {
                // Corrupted — ignore
            } finally {
                if (!cancelled) {
                    setChecking(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [materialId, studentId]);

    const discardProgress = () => {
        if (materialId && studentId) {
            void storage.remove(`solo_progress_${materialId}_${studentId}`);
        }
        setSavedProgress(null);
    };

    return { savedProgress, checking, discardProgress };
};
