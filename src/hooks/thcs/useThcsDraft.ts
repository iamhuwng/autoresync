/**
 * useThcsDraft — Hook for loading/managing a THCS-THPT draft (PRD-0027 Task 4.9)
 */
import { useState, useEffect, useCallback } from 'react';
import { loadThcsDraft, createThcsDraft, updateThcsDraft } from '../../services/thcsDraftService';
import type { THCSDraft, THCSTestMetadata } from '../../types/thcs-test.types';

interface UseThcsDraftReturn {
    draft: THCSDraft | null;
    loading: boolean;
    error: string | null;
    updateDraft: (updates: Partial<THCSDraft>) => Promise<void>;
    createNewDraft: (userId: string, metadata: THCSTestMetadata) => Promise<string | null>;
}

export function useThcsDraft(draftId?: string): UseThcsDraftReturn {
    const [draft, setDraft] = useState<THCSDraft | null>(null);
    const [loading, setLoading] = useState(!!draftId);
    const [error, setError] = useState<string | null>(null);

    // Load draft on mount or when draftId changes
    useEffect(() => {
        if (!draftId) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        loadThcsDraft(draftId).then((result) => {
            if (cancelled) return;
            if (result.success && result.data) {
                setDraft(result.data);
            } else {
                setError(result.error || 'Failed to load draft');
            }
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, [draftId]);

    const updateDraftFn = useCallback(async (updates: Partial<THCSDraft>) => {
        if (!draftId) return;
        const result = await updateThcsDraft(draftId, updates);
        if (!result.success) {
            console.error('Failed to update draft:', result.error);
        }
    }, [draftId]);

    const createNewDraft = useCallback(async (userId: string, metadata: THCSTestMetadata): Promise<string | null> => {
        const result = await createThcsDraft(userId, metadata);
        if (result.success && result.data) {
            return result.data.draftId;
        }
        setError(result.error || 'Failed to create draft');
        return null;
    }, []);

    return { draft, loading, error, updateDraft: updateDraftFn, createNewDraft };
}
