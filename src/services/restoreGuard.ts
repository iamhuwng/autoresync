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

function isPermissionDeniedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('permission_denied');
}

// Cache the flag check result for 5 seconds to avoid hammering RTDB
let cachedResult: { active: boolean; checkedAt: number } | null = null;
const CACHE_TTL_MS = 5000;

/** #121 side-effect families are intentionally duplicated here as a small
 * client/domain seam so adapters do not need to import Worker modules. */
export const RECOVERY_SIDE_EFFECT_FAMILIES = Object.freeze([
    'source-cleanup-provider-delete',
    'submission-result-scoring',
    'completion',
    'checkpoint',
    'notification',
    'update-replacement-revocation',
    'audit-fan-out',
] as const);

export type RecoverySideEffectFamily = typeof RECOVERY_SIDE_EFFECT_FAMILIES[number];

export interface RecoverySideEffectContext {
    readonly recoveryOperationId?: string;
    readonly operationId?: string;
    readonly operationState?: string;
    readonly finalReconciliation?: 'pending' | 'approved';
    readonly releasedFamilies?: readonly string[];
}

export type RecoverySideEffectSuppressionCode =
    | 'missing-operation-id'
    | 'missing-operation-state'
    | 'unknown-family'
    | 'operation-mismatch'
    | 'operation-not-completed'
    | 'reconciliation-pending'
    | 'family-not-released'
    | 'released';

export interface RecoverySideEffectDecision {
    readonly suppressed: boolean;
    readonly code: RecoverySideEffectSuppressionCode;
}

/** Fail closed for absent or malformed recovery state. */
export function isRecoverySideEffectSuppressed(
    family: unknown,
    context: RecoverySideEffectContext | null | undefined,
): RecoverySideEffectDecision {
    if (typeof family !== 'string' || !RECOVERY_SIDE_EFFECT_FAMILIES.includes(family as RecoverySideEffectFamily)) {
        return { suppressed: true, code: 'unknown-family' };
    }
    if (!context?.recoveryOperationId) return { suppressed: true, code: 'missing-operation-id' };
    if (!context.operationId || !context.operationState) return { suppressed: true, code: 'missing-operation-state' };
    if (context.recoveryOperationId !== context.operationId) return { suppressed: true, code: 'operation-mismatch' };
    if (context.operationState !== 'completed') return { suppressed: true, code: 'operation-not-completed' };
    if (context.finalReconciliation !== 'approved') return { suppressed: true, code: 'reconciliation-pending' };
    if (!context.releasedFamilies?.includes(family)) return { suppressed: true, code: 'family-not-released' };
    return { suppressed: false, code: 'released' };
}

/**
 * Guard the irreversible side-effect boundary. This is separate from the
 * legacy restore flag wrapper because #121 must not turn an unknown recovery
 * operation into an allow decision.
 */
export function withRecoverySideEffectGuard<TReturn>(
    family: RecoverySideEffectFamily,
    safeReturn: TReturn,
    context: RecoverySideEffectContext | null | undefined | (() => RecoverySideEffectContext | null | undefined | Promise<RecoverySideEffectContext | null | undefined>),
) {
    return function <TArgs extends unknown[]>(
        fn: (...args: TArgs) => Promise<TReturn>,
    ): (...args: TArgs) => Promise<TReturn> {
        return async (...args: TArgs): Promise<TReturn> => {
            const resolved = typeof context === 'function' ? await context() : context;
            if (isRecoverySideEffectSuppressed(family, resolved).suppressed) return safeReturn;
            return fn(...args);
        };
    };
}

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
        if (!isPermissionDeniedError(error)) {
            console.warn('[RestoreGuard] Failed to check restore flag, allowing operation:', error);
        }
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
