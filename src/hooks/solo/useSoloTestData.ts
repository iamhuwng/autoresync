// File: src/hooks/solo/useSoloTestData.ts
import { useState, useEffect, useRef } from 'react';
import type { TestData } from '../../services/testStorage';
import { getTestFromFirebase } from '../../services/testStorage';

interface UseSoloTestDataOptions {
    materialId: string | undefined;
}

interface UseSoloTestDataReturn {
    testData: TestData | null;
    loading: boolean;
    error: string | null;
    activePassageId: string | null;
    setActivePassageId: (id: string | null) => void;
}

/**
 * Loads test data directly from tests/{materialId}.
 * Unlike useTestData (which subscribes to game_sessions), this is a one-shot load.
 * No real-time listener, no sessionService dependency.
 */
export const useSoloTestData = ({ materialId }: UseSoloTestDataOptions): UseSoloTestDataReturn => {
    const [testData, setTestData] = useState<TestData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activePassageId, setActivePassageId] = useState<string | null>(null);
    const loadedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!materialId || loadedRef.current === materialId) return;
        loadedRef.current = materialId;

        const loadTest = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getTestFromFirebase(materialId);

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
                setError('Failed to load test');
                console.error('❌ [SoloTestData] Exception:', err);
            } finally {
                setLoading(false);
            }
        };

        loadTest();
    }, [materialId]);

    return { testData, loading, error, activePassageId, setActivePassageId };
};
