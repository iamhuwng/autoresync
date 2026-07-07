import { isSessionActiveAt, type SessionLifecycleData } from './sessionLifecycle';

export const OWNER_SESSION_INDEX_ROOT = 'owner_session_index';
export const OWNER_SESSION_MIGRATION_ROOT = 'owner_session_migrations';
export const OWNER_SESSION_PAGE_SIZE = 25;
export const LEGACY_OWNER_FIELDS = ['createdByUserId', 'createdBy', 'teacherId'] as const;

export interface OwnerSessionSource extends SessionLifecycleData {
  createdByUserId?: unknown;
  createdBy?: unknown;
  teacherId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  mode?: unknown;
}

export interface OwnerSessionIndexRecord {
  sessionCode: string;
  ownerId: string;
  expiresAt: number;
  status: 'waiting' | 'in-progress';
  sourceUpdatedAt: number;
  mode?: string;
  createdAt?: number;
}

const nonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value : null
);

export const resolveSessionOwnerId = (session: OwnerSessionSource): string | null => (
  nonEmptyString(session.createdByUserId)
  ?? nonEmptyString(session.createdBy)
  ?? nonEmptyString(session.teacherId)
);

export const buildOwnerSessionIndexRecord = (
  sessionCode: string,
  session: OwnerSessionSource,
  now = Date.now(),
): OwnerSessionIndexRecord | null => {
  const ownerId = resolveSessionOwnerId(session);
  if (
    !ownerId
    || !sessionCode
    || !isSessionActiveAt(session, now)
    || typeof session.expiresAt !== 'number'
    || !Number.isFinite(session.expiresAt)
  ) {
    return null;
  }

  const status = session.status as OwnerSessionIndexRecord['status'];
  const sourceUpdatedAt = typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt)
    ? session.updatedAt
    : typeof session.createdAt === 'number' && Number.isFinite(session.createdAt)
      ? session.createdAt
      : 0;

  return {
    sessionCode,
    ownerId,
    expiresAt: session.expiresAt,
    status,
    sourceUpdatedAt,
    ...(typeof session.mode === 'string' && { mode: session.mode }),
    ...(typeof session.createdAt === 'number' && Number.isFinite(session.createdAt)
      && { createdAt: session.createdAt }),
  };
};

export const shouldReplaceOwnerIndexRecord = (
  current: Pick<OwnerSessionIndexRecord, 'sourceUpdatedAt'> | null,
  candidate: Pick<OwnerSessionIndexRecord, 'sourceUpdatedAt'>,
): boolean => !current || candidate.sourceUpdatedAt >= current.sourceUpdatedAt;

export const ownerSessionIndexPath = (ownerId: string, sessionCode: string): string =>
  `${OWNER_SESSION_INDEX_ROOT}/${ownerId}/${sessionCode}`;
