/**
 * Restore Guard Middleware (PRD-0026 §4.13.6, Integration Safety Rule #11)
 *
 * Wraps side-effect functions to prevent them from executing during a
 * database restore operation. Checks the RTDB flag
 * `system_flags/restore_in_progress` before allowing execution.
 *
 * @example
 * ```ts
 * import { withRestoreGuard } from './restoreGuard';
 *
 * export const sendNotification = withRestoreGuard(
 *   'Notification',
 *   { success: true, notificationId: undefined }
 * )(async (userId, message) => {
 *   return await createNotification({ userId, message });
 * });
 * ```
 */

import { ref, get } from 'firebase/database';
// @ts-ignore - JS service file
import { database } from './firebase';

const RESTORE_FLAG_PATH = 'system_flags/restore_in_progress';

// Cache the flag check result for 5 seconds to avoid hammering RTDB
let cachedResult: { active: boolean; checkedAt: number } | null = null;
const CACHE_TTL_MS = 5000;

/**
 * Check if a restore is currently in progress.
 * Uses a 5-second cache to minimize RTDB reads.
 */
export async function isRestoreInProgress(): Promise<boolean> {
    const now = Date.now();

    // Return cached result if still valid
    if (cachedResult && now - cachedResult.checkedAt < CACHE_TTL_MS) {
        return cachedResult.active;
    }

    try {
        const flagRef = ref(database, RESTORE_FLAG_PATH);
        const snapshot = await get(flagRef);

        if (!snapshot.exists()) {
            cachedResult = { active: false, checkedAt: now };
            return false;
        }

        const flag = snapshot.val();
        const active = flag?.active === true;

        cachedResult = { active, checkedAt: now };
        return active;
    } catch (error) {
        // On error, assume NOT restoring (don't block normal operations)
        console.warn('[RestoreGuard] Failed to check restore flag, allowing operation:', error);
        cachedResult = { active: false, checkedAt: now };
        return false;
    }
}

/**
 * Higher-order function that wraps a service function with restore guard.
 *
 * @param serviceName - Name of the service (for logging)
 * @param safeReturn  - The safe return value when restore is in progress
 * @returns A wrapper function that takes the original function and returns a guarded version
 */
export function withRestoreGuard<TReturn>(
    serviceName: string,
    safeReturn: TReturn
) {
    return function <TArgs extends unknown[]>(
        fn: (...args: TArgs) => Promise<TReturn>
    ): (...args: TArgs) => Promise<TReturn> {
        return async (...args: TArgs): Promise<TReturn> => {
            const restoring = await isRestoreInProgress();

            if (restoring) {
                console.log(
                    `🛡️ [RestoreGuard] Blocked ${serviceName} — restore in progress`
                );
                return safeReturn;
            }

            return fn(...args);
        };
    };
}

/**
 * Clear the cached restore flag (useful when restore completes).
 */
export function clearRestoreGuardCache(): void {
    cachedResult = null;
}
