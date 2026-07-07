import { get, ref } from 'firebase/database';

import { database } from './firebase';
import { effectiveNow, normalizeServerTimeOffset } from './serverClock';
import {
  ACTIVE_SESSION_STATUSES,
  getEffectiveSessionStatus,
} from './sessionLifecycle';

export const SESSION_EXPIRED_MESSAGE = 'Session expired. Ask your teacher to extend it.';

export interface ResolvedSessionMutationFailure {
  code: 'session-expired';
  message: typeof SESSION_EXPIRED_MESSAGE;
}

const isPermissionDeniedError = (error: unknown): boolean => {
  const maybeError = error as { code?: unknown; message?: unknown };
  const code = String(maybeError?.code ?? '').toLowerCase();
  const message = String(maybeError?.message ?? error ?? '').toLowerCase();

  return (
    code.includes('permission_denied')
    || code.includes('permission-denied')
    || message.includes('permission_denied')
    || message.includes('permission denied')
    || message.includes('permission-denied')
  );
};

const hasFiniteExpiry = (session: unknown): session is { expiresAt: number; status?: string } => (
  typeof session === 'object'
  && session !== null
  && typeof (session as { expiresAt?: unknown }).expiresAt === 'number'
  && Number.isFinite((session as { expiresAt: number }).expiresAt)
);

const isActiveSessionWithoutFiniteExpiry = (session: unknown): boolean => (
  typeof session === 'object'
  && session !== null
  && ACTIVE_SESSION_STATUSES.has(String((session as { status?: unknown }).status))
  && !hasFiniteExpiry(session)
);

export async function resolveSessionMutationFailure(
  error: unknown,
  sessionCode: string | null | undefined,
  localNow = Date.now(),
): Promise<ResolvedSessionMutationFailure | null> {
  if (!isPermissionDeniedError(error) || !sessionCode) {
    return null;
  }

  try {
    const [sessionSnapshot, offsetSnapshot] = await Promise.all([
      get(ref(database, `game_sessions/${sessionCode}`)),
      get(ref(database, '.info/serverTimeOffset')),
    ]);
    const session = sessionSnapshot.val();
    const offsetValue = offsetSnapshot.val();
    const hasServerOffset = typeof offsetValue === 'number' && Number.isFinite(offsetValue);
    const now = effectiveNow(localNow, normalizeServerTimeOffset(offsetValue));

    if (getEffectiveSessionStatus(session ?? {}, now) === 'expired') {
      return {
        code: 'session-expired',
        message: SESSION_EXPIRED_MESSAGE,
      };
    }

    if (isActiveSessionWithoutFiniteExpiry(session)) {
      return {
        code: 'session-expired',
        message: SESSION_EXPIRED_MESSAGE,
      };
    }

    if (!hasServerOffset && hasFiniteExpiry(session)) {
      return {
        code: 'session-expired',
        message: SESSION_EXPIRED_MESSAGE,
      };
    }
  } catch {
    return null;
  }

  return null;
}
