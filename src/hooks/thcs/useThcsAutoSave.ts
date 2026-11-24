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
    manualOnly?: boolean;
    validate?: (draftId: string, draft: Partial<THCSDraft>) => Promise<void>;
}

interface UseThcsAutoSaveReturn {
    isSaving: boolean;
    lastSavedAt: Date | null;
    error: string | null;
    saveNow: (targetDraftId?: string, updates?: Partial<THCSDraft>) => Promise<{ success: boolean; error?: string }>;
}

export function useThcsAutoSave({ draftId, data, isDirty, manualOnly = false, validate }: UseThcsAutoSaveInput): UseThcsAutoSaveReturn {
    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dataRef = useRef(data);
    dataRef.current = data;
    const inflight = useRef<Promise<unknown> | null>(null);

    const performSave = useCallback(async (targetDraftId = draftId, updates?: Partial<THCSDraft>): Promise<{ success: boolean; error?: string }> => {
        if (!targetDraftId) return { success: false, error: 'Draft ID is missing' };

        const snapshot = updates ?? dataRef.current;
        const prior = inflight.current;
        setIsSaving(true);
        setError(null);

        const save = (async () => {
            await prior?.catch(() => {});
            await validate?.(targetDraftId, snapshot);
            return updateThcsDraft(targetDraftId, snapshot);
        })();
        inflight.current = save;
        try {
            const result = await save;
            if (result.success) {
                setLastSavedAt(new Date());
                // Clear any offline backup on success
                try { localStorage.removeItem(OFFLINE_KEY_PREFIX + targetDraftId); } catch { /* noop */ }
                return { success: true };
            } else {
                throw new Error(result.error || 'Save failed');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Save failed';
            setError(msg);
            if (manualOnly) return { success: false, error: msg };
            console.warn('⚠️ Auto-save failed, saving offline backup:', msg);
            // Offline fallback — save to localStorage
            try {
                localStorage.setItem(
                    OFFLINE_KEY_PREFIX + targetDraftId,
                    JSON.stringify(snapshot)
                );
            } catch { /* localStorage might be full */ }
            return { success: false, error: msg };
        } finally {
            if (inflight.current === save) {
                inflight.current = null;
                setIsSaving(false);
            }
        }
    }, [draftId, manualOnly, validate]);

    // Debounced auto-save on data change
    useEffect(() => {
        if (!isDirty || !draftId || manualOnly) return;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            performSave();
        }, DEBOUNCE_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isDirty, draftId, data, manualOnly, performSave]);

    // On mount: check for offline backups and sync
    useEffect(() => {
        if (!draftId || manualOnly) return;

        const offlineData = localStorage.getItem(OFFLINE_KEY_PREFIX + draftId);
        if (offlineData) {
            let backup: Partial<THCSDraft>;
            try { backup = JSON.parse(offlineData); } catch { return; }
            if (backup.sections?.some((section) => section.externalAudio || section.externalAudioRequired)) return;
            console.log('📦 Found offline backup for draft:', draftId);
            // Attempt to sync the offline data
            updateThcsDraft(draftId, backup)
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
    }, [draftId, manualOnly]);

    const saveNow = useCallback(async (targetDraftId?: string, updates?: Partial<THCSDraft>) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        return performSave(targetDraftId, updates);
    }, [performSave]);

    return { isSaving, lastSavedAt, error, saveNow };
}
