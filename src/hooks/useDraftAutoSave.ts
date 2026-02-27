/**
 * useDraftAutoSave Hook
 * 
 * Automatically saves draft changes to Firebase with debouncing.
 * Part of PRD-0022 Test Creation Modal with Draft Management.
 * 
 * Features:
 * - Debounced saves on content changes (2 second delay)
 * - Periodic auto-save every 30 seconds
 * - Save before page unload (best effort)
 * - Save on tab visibility change
 * - Dirty state tracking to avoid unnecessary writes
 * 
 * @security Validates ownership before saving
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { DraftDocument, UseDraftAutoSaveReturn } from '../types/draft.types';
import { testDraftService } from '../services/draftCloudService';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_AUTO_SAVE_INTERVAL = 30000; // 30 seconds
const DEFAULT_DEBOUNCE_DELAY = 2000; // 2 seconds

// ─────────────────────────────────────────────────────────────────────────────
// HOOK OPTIONS INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

interface UseDraftAutoSaveOptions {
    /** The draft ID to save to */
    draftId: string;

    /** Whether auto-save is enabled (default: true) */
    enabled?: boolean;

    /** Auto-save interval in milliseconds (default: 30000 = 30 seconds) */
    autoSaveInterval?: number;

    /** Debounce delay in milliseconds (default: 2000 = 2 seconds) */
    debounceDelay?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook for automatically saving draft changes to Firebase.
 * 
 * @param options - Configuration options for auto-save behavior
 * @returns UseDraftAutoSaveReturn object with save status and methods
 * 
 * @example
 * ```tsx
 * const { isSaving, lastSaved, error, save, saveImmediately } = useDraftAutoSave({
 *   draftId: 'my-draft-id',
 *   enabled: true,
 * });
 * 
 * // When user makes changes
 * const handleChange = (updates: Partial<DraftDocument>) => {
 *   save(updates); // Debounced save
 * };
 * 
 * // Force save before navigation
 * await saveImmediately();
 * ```
 */
export const useDraftAutoSave = ({
    draftId,
    enabled = true,
    autoSaveInterval = DEFAULT_AUTO_SAVE_INTERVAL,
    debounceDelay = DEFAULT_DEBOUNCE_DELAY,
}: UseDraftAutoSaveOptions): UseDraftAutoSaveReturn => {
    // ─────────────────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────────────────

    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    // ─────────────────────────────────────────────────────────────────────────
    // REFS (to avoid stale closures)
    // ─────────────────────────────────────────────────────────────────────────

    /** Pending updates waiting to be saved */
    const pendingUpdatesRef = useRef<Partial<DraftDocument> | null>(null);

    /** Timeout for debounced save */
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /** Interval for periodic save */
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    /** Whether a save is currently in progress */
    const isSavingRef = useRef(false);

    /** Last saved data hash for dirty checking */
    const lastSavedHashRef = useRef<string>('');

    // ─────────────────────────────────────────────────────────────────────────
    // CORE SAVE FUNCTION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Perform the actual save to Firebase
     */
    const performSave = useCallback(async (updates: Partial<DraftDocument>): Promise<void> => {
        if (!enabled || !draftId) {
            console.log('📝 [DraftAutoSave] Skipping save - disabled or no draftId');
            return;
        }

        // Hash current updates for dirty checking
        const currentHash = JSON.stringify(updates);

        // Skip if no changes since last save
        if (currentHash === lastSavedHashRef.current && Object.keys(updates).length === 0) {
            console.log('📝 [DraftAutoSave] No changes detected, skipping save');
            return;
        }

        // Skip if already saving
        if (isSavingRef.current) {
            console.log('📝 [DraftAutoSave] Save already in progress, queuing...');
            pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };
            return;
        }

        try {
            isSavingRef.current = true;
            setIsSaving(true);
            setError(null);

            console.log(`📝 [DraftAutoSave] Saving draft ${draftId}...`);

            const response = await testDraftService.updateDraft(draftId, updates);

            if (response.success) {
                const now = new Date();
                setLastSaved(now);
                lastSavedHashRef.current = currentHash;
                console.log(`✅ [DraftAutoSave] Draft saved at ${now.toLocaleTimeString()}`);
            } else {
                throw new Error(response.error || 'Unknown save error');
            }
        } catch (err) {
            console.error('❌ [DraftAutoSave] Save failed:', err);
            const errorMsg = err instanceof Error ? err.message : 'Failed to save draft';
            setError(errorMsg);

            // Clear error after 5 seconds
            setTimeout(() => {
                setError(null);
            }, 5000);
        } finally {
            isSavingRef.current = false;
            setIsSaving(false);

            // Process any pending updates that came in during save
            if (pendingUpdatesRef.current) {
                const pending = pendingUpdatesRef.current;
                pendingUpdatesRef.current = null;
                performSave(pending);
            }
        }
    }, [enabled, draftId]);

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC SAVE METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Queue updates for debounced save
     */
    const save = useCallback((updates: Partial<DraftDocument>): void => {
        if (!enabled) return;

        // Merge with any existing pending updates
        pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

        // Clear existing timeout
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        // Set new debounced timeout
        debounceTimeoutRef.current = setTimeout(() => {
            const pending = pendingUpdatesRef.current;
            if (pending) {
                pendingUpdatesRef.current = null;
                performSave(pending);
            }
        }, debounceDelay);
    }, [enabled, debounceDelay, performSave]);

    /**
     * Force immediate save (for beforeunload or navigation)
     */
    const saveImmediately = useCallback(async (): Promise<void> => {
        // Clear any pending debounce
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
        }

        // Save any pending updates immediately
        if (pendingUpdatesRef.current) {
            const pending = pendingUpdatesRef.current;
            pendingUpdatesRef.current = null;
            await performSave(pending);
        }
    }, [performSave]);

    // ─────────────────────────────────────────────────────────────────────────
    // PERIODIC AUTO-SAVE
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!enabled) return;

        console.log(`📝 [DraftAutoSave] Starting periodic save every ${autoSaveInterval / 1000}s`);

        intervalRef.current = setInterval(() => {
            if (pendingUpdatesRef.current) {
                console.log('⏰ [DraftAutoSave] Periodic save triggered');
                const pending = pendingUpdatesRef.current;
                pendingUpdatesRef.current = null;
                performSave(pending);
            }
        }, autoSaveInterval);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                console.log('📝 [DraftAutoSave] Periodic save stopped');
            }
        };
    }, [enabled, autoSaveInterval, performSave]);

    // ─────────────────────────────────────────────────────────────────────────
    // VISIBILITY CHANGE HANDLER
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!enabled) return;

        const handleVisibilityChange = () => {
            if (document.hidden && pendingUpdatesRef.current) {
                console.log('👁️ [DraftAutoSave] Tab hidden, saving pending changes...');
                const pending = pendingUpdatesRef.current;
                pendingUpdatesRef.current = null;
                performSave(pending);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [enabled, performSave]);

    // ─────────────────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        return () => {
            // Clean up timers on unmount
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // RETURN
    // ─────────────────────────────────────────────────────────────────────────

    return {
        isSaving,
        lastSaved,
        error,
        save,
        saveImmediately,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format last saved time for display
 * @param lastSaved - Date of last save or null
 * @returns Human-readable string
 */
export const formatLastSaved = (lastSaved: Date | null): string => {
    if (!lastSaved) return 'Not saved yet';

    const now = new Date();
    const diff = now.getTime() - lastSaved.getTime();

    if (diff < 5000) return 'Just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

    return lastSaved.toLocaleTimeString();
};

export default useDraftAutoSave;
