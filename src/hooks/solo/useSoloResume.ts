import { useEffect, useMemo, useState } from 'react';
import type { SoloProgressScopeContext, SoloSessionProgress } from '../../types/practice.types';
import { readSoloProgress, removeSoloProgress } from '../../services/soloProgress.service';
import { listeningDiagnostics } from '../../utils/listeningDiagnostics';

interface UseSoloResumeOptions {
    materialId: string | undefined;
    studentId: string | undefined;
    scopeContext?: SoloProgressScopeContext;
}

interface UseSoloResumeReturn {
    /** Saved progress, or null if none exists */
    savedProgress: SoloSessionProgress | null;
    /** Whether we're still checking */
    checking: boolean;
    /** Call to discard saved progress and start fresh */
    discardProgress: () => void;
}

function getScopeContextSignature(scopeContext?: SoloProgressScopeContext): string {
    if (!scopeContext || scopeContext.mode === 'self_study') {
        return 'self_study';
    }

    if (scopeContext.mode === 'course_material') {
        return `course_material:${scopeContext.courseId || ''}:${scopeContext.moduleId || ''}`;
    }

    return `homework:${scopeContext.homeworkId || ''}:${scopeContext.submissionId || ''}`;
}

export const useSoloResume = ({
    materialId,
    studentId,
    scopeContext,
}: UseSoloResumeOptions): UseSoloResumeReturn => {
    const [savedProgress, setSavedProgress] = useState<SoloSessionProgress | null>(null);
    const [checking, setChecking] = useState(true);
    const scopeContextSignature = useMemo(
        () => getScopeContextSignature(scopeContext),
        [
            scopeContext?.courseId,
            scopeContext?.homeworkId,
            scopeContext?.mode,
            scopeContext?.moduleId,
            scopeContext?.submissionId,
        ],
    );

    useEffect(() => {
        if (!materialId || !studentId) {
            setChecking(false);
            return;
        }

        let cancelled = false;

        void (async () => {
            try {
                listeningDiagnostics.info('[SoloResume] Checking saved progress', {
                    materialId,
                    scopeContextSignature,
                    studentId,
                });
                const { progress } = await readSoloProgress({
                    materialId,
                    studentId,
                    scopeContext,
                });
                if (!cancelled) {
                    setSavedProgress(progress);
                    listeningDiagnostics.info('[SoloResume] Resume lookup finished', {
                        currentQuestion: progress?.currentQuestion ?? null,
                        hasSavedProgress: Boolean(progress),
                        materialId,
                        scopeContextSignature,
                        studentId,
                    });
                }
            } catch (error) {
                listeningDiagnostics.warn('[SoloResume] Failed to read saved progress', {
                    error,
                    materialId,
                    scopeContextSignature,
                    studentId,
                });
            } finally {
                if (!cancelled) {
                    setChecking(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [materialId, scopeContextSignature, studentId]);

    const discardProgress = () => {
        if (materialId && studentId) {
            void removeSoloProgress({
                materialId,
                studentId,
                scopeContext,
            });
        }
        setSavedProgress(null);
    };

    return { savedProgress, checking, discardProgress };
};
