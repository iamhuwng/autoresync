// File: src/hooks/solo/useSoloTestData.ts
import { useState, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TestData } from '../../services/testStorage';
import { getStudentSafeTestFromFirebase } from '../../services/testStorage';
import type { SoloProgressScopeContext } from '../../types/practice.types';
import { readSoloProgress } from '../../services/soloProgress.service';
import { readListeningSoloVersionId } from '../../features/assessment/listening/runtime/solo/listeningSoloDeliveryAdapter';

interface UseSoloTestDataOptions {
    materialId: string | undefined;
    initialTestData?: TestData;
    studentId?: string;
    scopeContext?: SoloProgressScopeContext;
    resumeListeningProgress?: boolean;
}

interface UseSoloTestDataReturn {
    testData: TestData | null;
    loading: boolean;
    error: string | null;
    activePassageId: string | null;
    setActivePassageId: (id: string | null) => void;
    questionsWithAnswersRef: MutableRefObject<TestData['questions'] | null>;
    answerKeysRef: MutableRefObject<Record<string, string | string[]> | null>;
}

/**
 * Loads the pre-sanitized student-safe payload for solo/homework delivery.
 * Unlike useTestData (which subscribes to game_sessions), this is a one-shot load.
 * Full grading questions are loaded later by the submission hook only when needed.
 */
export const useSoloTestData = ({ materialId, initialTestData, studentId, scopeContext, resumeListeningProgress = true }: UseSoloTestDataOptions): UseSoloTestDataReturn => {
    const [testData, setTestData] = useState<TestData | null>(initialTestData ?? null);
    const [loading, setLoading] = useState(!initialTestData);
    const [error, setError] = useState<string | null>(null);
    const [activePassageId, setActivePassageId] = useState<string | null>(null);
    const questionsWithAnswersRef = useRef<TestData['questions'] | null>(null);
    const answerKeysRef = useRef<Record<string, string | string[]> | null>(null);

    useEffect(() => {
        if (!materialId) return;
        let cancelled = false;

        const loadTest = async () => {
            setLoading(true);
            setError(null);
            questionsWithAnswersRef.current = null;
            answerKeysRef.current = null;

            try {
                let result = initialTestData
                    ? { success: true, data: initialTestData }
                    : await getStudentSafeTestFromFirebase(materialId);
                if (result.data?.skill === 'Listening' && studentId && resumeListeningProgress && scopeContext?.mode !== 'homework') {
                    const { progress } = await readSoloProgress({ materialId, studentId, scopeContext });
                    if (progress?.listeningDocument?.id === materialId && progress.listeningDocument.skill === 'Listening'
                        && Array.isArray(progress.listeningDocument.questions) && readListeningSoloVersionId(progress.listeningDocument)) {
                        result = { success: true, data: progress.listeningDocument };
                    }
                }
                if (cancelled) return;

                if (result.success && result.data) {
                    setTestData(result.data);

                    // Set active passage to first passage (if any)
                    if (result.data.passages && result.data.passages.length > 0 && result.data.passages[0]) {
                        setActivePassageId(result.data.passages[0].id);
                    }

                    console.log('✅ [SoloTestData] Test loaded:', materialId);
                } else {
                    setError(result.error || 'Failed to load test');
                    console.error('❌ [SoloTestData] Load failed:', result.error);
                }
            } catch (err) {
                if (cancelled) return;
                setError('Failed to load test');
                console.error('❌ [SoloTestData] Exception:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadTest();
        return () => { cancelled = true; };
    }, [materialId, initialTestData, studentId, scopeContext, resumeListeningProgress]);

    return {
        testData,
        loading,
        error,
        activePassageId,
        setActivePassageId,
        questionsWithAnswersRef,
        answerKeysRef,
    };
};
