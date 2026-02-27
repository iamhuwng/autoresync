/**
 * useThcsAutoSave — Debounced auto-save hook for THCS-THPT editor (PRD-0027 Task 4.10)
 * Follows UseDraftAutoSaveReturn pattern from draft.types.ts
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { updateThcsDraft } from '../../services/thcsDraftService';
import type { THCSDraft } from '../../types/thcs-test.types';

const DEBOUNCE_MS = 2000;
const OFFLINE_KEY_PREFIX = 'thcs_draft_offline_';

interface UseThcsAutoSaveInput {
    draftId: string | null;
    data: Partial<THCSDraft>;
    isDirty: boolean;
}

interface UseThcsAutoSaveReturn {
    isSaving: boolean;
    lastSavedAt: Date | null;
    error: string | null;
    saveNow: () => Promise<void>;
}

export function useThcsAutoSave({ draftId, data, isDirty }: UseThcsAutoSaveInput): UseThcsAutoSaveReturn {
    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dataRef = useRef(data);
    dataRef.current = data;

    const performSave = useCallback(async () => {
        if (!draftId) return;

        setIsSaving(true);
        setError(null);

        try {
            const result = await updateThcsDraft(draftId, dataRef.current);
            if (result.success) {
                setLastSavedAt(new Date());
                // Clear any offline backup on success
                try { localStorage.removeItem(OFFLINE_KEY_PREFIX + draftId); } catch { /* noop */ }
            } else {
                throw new Error(result.error || 'Save failed');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Save failed';
            setError(msg);
            console.warn('⚠️ Auto-save failed, saving offline backup:', msg);
            // Offline fallback — save to localStorage
            try {
                localStorage.setItem(
                    OFFLINE_KEY_PREFIX + draftId,
                    JSON.stringify(dataRef.current)
                );
            } catch { /* localStorage might be full */ }
        } finally {
            setIsSaving(false);
        }
    }, [draftId]);

    // Debounced auto-save on data change
    useEffect(() => {
        if (!isDirty || !draftId) return;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            performSave();
        }, DEBOUNCE_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isDirty, draftId, data, performSave]);

    // On mount: check for offline backups and sync
    useEffect(() => {
        if (!draftId) return;

        const offlineData = localStorage.getItem(OFFLINE_KEY_PREFIX + draftId);
        if (offlineData) {
            console.log('📦 Found offline backup for draft:', draftId);
            // Attempt to sync the offline data
            updateThcsDraft(draftId, JSON.parse(offlineData))
                .then((result) => {
                    if (result.success) {
                        localStorage.removeItem(OFFLINE_KEY_PREFIX + draftId);
                        console.log('✅ Offline backup synced and cleared');
                        setLastSavedAt(new Date());
                    }
                })
                .catch(() => {
                    console.warn('⚠️ Could not sync offline backup yet');
                });
        }
    }, [draftId]);

    const saveNow = useCallback(async () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        await performSave();
    }, [performSave]);

    return { isSaving, lastSavedAt, error, saveNow };
}
