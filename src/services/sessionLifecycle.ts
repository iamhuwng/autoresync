export interface SessionLifecycleData {
  status?: string;
  expiresAt?: number;
}

export const ACTIVE_SESSION_STATUSES = new Set(['waiting', 'in-progress']);

export const isSessionTimeExpired = (
  session: SessionLifecycleData,
  now = Date.now(),
): boolean => (
  typeof session.expiresAt === 'number'
  && Number.isFinite(session.expiresAt)
  && session.expiresAt <= now
);

export const getEffectiveSessionStatus = (
  session: SessionLifecycleData,
  now = Date.now(),
): string | undefined => (
  ACTIVE_SESSION_STATUSES.has(String(session.status)) && isSessionTimeExpired(session, now)
    ? 'expired'
    : session.status
);

export const isSessionActiveAt = (
  session: SessionLifecycleData,
  now = Date.now(),
): boolean => (
  ACTIVE_SESSION_STATUSES.has(String(session.status))
  && typeof session.expiresAt === 'number'
  && Number.isFinite(session.expiresAt)
  && !isSessionTimeExpired(session, now)
);
