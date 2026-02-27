/**
 * useDraftBeforeUnload Hook
 * 
 * Warns users before leaving the review page with unsaved draft changes.
 * Part of PRD-0022 Test Creation Modal with Draft Management.
 * 
 * Features:
 * - Browser warning on page close/refresh
 * - Attempts to save pending changes before unload
 * - Integration with useDraftAutoSave hook
 * 
 * @security Prevents accidental data loss
 */

import { useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// HOOK OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

interface UseDraftBeforeUnloadOptions {
    /** Whether the warning is enabled */
    enabled: boolean;

    /** Whether there are unsaved changes */
    hasUnsavedChanges: boolean;

    /** Function to save immediately (from useDraftAutoSave) */
    saveImmediately?: () => Promise<void>;

    /** Custom warning message */
    message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook to warn users before leaving the page with unsaved draft changes.
 * 
 * @param options - Configuration options
 * 
 * @example
 * ```tsx
 * const { hasUnsavedChanges } = useDraftAutoSave({ draftId });
 * 
 * useDraftBeforeUnload({
 *   enabled: true,
 *   hasUnsavedChanges,
 *   saveImmediately,
 *   message: 'You have unsaved changes to your draft.',
 * });
 * ```
 */
export const useDraftBeforeUnload = ({
    enabled,
    hasUnsavedChanges,
    saveImmediately,
    message = 'You have unsaved changes. Are you sure you want to leave?',
}: UseDraftBeforeUnloadOptions): void => {
    // Track latest values in refs to avoid stale closures
    const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
    const saveImmediatelyRef = useRef(saveImmediately);

    useEffect(() => {
        hasUnsavedChangesRef.current = hasUnsavedChanges;
    }, [hasUnsavedChanges]);

    useEffect(() => {
        saveImmediatelyRef.current = saveImmediately;
    }, [saveImmediately]);

    // Handle beforeunload event
    const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
        if (!hasUnsavedChangesRef.current) {
            return;
        }

        // Standard way to trigger browser warning
        e.preventDefault();
        e.returnValue = message;

        // Attempt to save (best effort, may not complete)
        if (saveImmediatelyRef.current) {
            saveImmediatelyRef.current().catch((err) => {
                console.warn('[DraftBeforeUnload] Failed to save before unload:', err);
            });
        }

        return message;
    }, [message]);

    useEffect(() => {
        if (!enabled) return;

        window.addEventListener('beforeunload', handleBeforeUnload);
        console.log('📝 [DraftBeforeUnload] Warning enabled');

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            console.log('📝 [DraftBeforeUnload] Warning disabled');
        };
    }, [enabled, handleBeforeUnload]);
};

export default useDraftBeforeUnload;
