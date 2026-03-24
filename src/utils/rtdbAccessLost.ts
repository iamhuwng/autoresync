/**
 * rtdbAccessLost.ts — PRD-0040 Task 3.3 (FR-035)
 *
 * Utility to detect RTDB PERMISSION_DENIED errors, which indicate
 * that access to a result has been revoked while the shell is open.
 *
 * Used by: ResultSlidePanel, ResultDetailModal
 */

/**
 * Returns true if the RTDB error is a PERMISSION_DENIED error,
 * indicating that the user's access has been revoked.
 */
export function isPermissionDeniedError(error: unknown): boolean {
  if (!error) return false;

  const msg = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: string }).message)
    : String(error);

  // Firebase RTDB permission denied errors contain this string
  return msg.includes('PERMISSION_DENIED') || msg.includes('permission_denied');
}

/** Access-lost state type used by shell components */
export interface AccessLostState {
  isAccessLost: boolean;
  reason: 'permission_denied' | 'deleted' | null;
}

export const ACCESS_LOST_INITIAL: AccessLostState = {
  isAccessLost: false,
  reason: null,
};
