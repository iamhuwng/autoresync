import {
  equalTo,
  limitToFirst,
  onValue,
  orderByChild,
  query,
  ref,
  startAt,
  type DataSnapshot,
  type Query,
  type Unsubscribe,
} from 'firebase/database';
import { database } from './firebase';
import { effectiveNow, normalizeServerTimeOffset } from './serverClock';
import { isSessionActiveAt } from './sessionLifecycle';
import {
  LEGACY_OWNER_FIELDS,
  OWNER_SESSION_INDEX_ROOT,
  OWNER_SESSION_PAGE_SIZE,
  resolveSessionOwnerId,
  type OwnerSessionSource,
  type OwnerSessionIndexRecord,
} from './sessionOwnerIndex';
import { migrateLegacyOwnerSessionIndex } from './sessionOwnerIndexMigration';

export interface TeacherSession {
  sessionCode: string;
  status?: string;
  createdAt?: number;
  expiresAt?: number;
  [key: string]: unknown;
}

export interface SessionQueryCursor {
  expiresAt: number;
  sessionCode: string;
}

export interface SessionQueryContext {
  serverTimeOffsetMs: number;
  isServerTimeSynchronized: boolean;
}

interface SubscribeTeacherSessionsInput {
  teacherId: string;
  canReadAll: boolean;
  onSessions: (sessions: TeacherSession[], context: SessionQueryContext) => void;
  onError: (error: Error) => void;
  pageSize?: number;
  cursor?: SessionQueryCursor;
}

const asRecord = <T>(value: unknown): Record<string, T> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, T>
    : {}
);

const snapshotValue = <T>(snapshot: DataSnapshot): Record<string, T> =>
  asRecord<T>(snapshot.val());

const subscribe = (
  target: Query,
  onData: (snapshot: DataSnapshot) => void,
  onError: (error: Error) => void,
): Unsubscribe => onValue(target, onData, onError);

const sessionQueryDiagnostic = (
  event: string,
  details: Record<string, unknown>,
): void => {
  console.warn('[SessionQuery]', event, details);
};

const assertPageSize = (pageSize: number): void => {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > OWNER_SESSION_PAGE_SIZE) {
    throw new Error(`pageSize must be between 1 and ${OWNER_SESSION_PAGE_SIZE}.`);
  }
};

const toTeacherSession = (
  sessionCode: string,
  session: OwnerSessionSource,
): TeacherSession => {
  const teacherSession = {
    ...asRecord<unknown>(session),
    sessionCode,
  } as TeacherSession;

  teacherSession.status = typeof session.status === 'string' ? session.status : undefined;
  teacherSession.createdAt = typeof session.createdAt === 'number' && Number.isFinite(session.createdAt)
    ? session.createdAt
    : undefined;
  teacherSession.expiresAt = typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt)
    ? session.expiresAt
    : undefined;

  return teacherSession;
};

export const subscribeTeacherSessions = ({
  teacherId,
  canReadAll,
  onSessions,
  onError,
  pageSize = OWNER_SESSION_PAGE_SIZE,
  cursor,
}: SubscribeTeacherSessionsInput): Unsubscribe => {
  if (!teacherId) {
    throw new Error('subscribeTeacherSessions requires teacherId.');
  }
  assertPageSize(pageSize);

  let serverTimeOffsetMs = 0;
  let isServerTimeSynchronized = false;
  let expirationTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const queryContext = (): SessionQueryContext => ({
    serverTimeOffsetMs,
    isServerTimeSynchronized,
  });
  const now = () => effectiveNow(Date.now(), serverTimeOffsetMs);
  const stopExpirationTimer = () => {
    if (expirationTimer !== undefined) {
      clearTimeout(expirationTimer);
      expirationTimer = undefined;
    }
  };

  if (canReadAll) {
    let sessions: TeacherSession[] = [];

    const emitAdminSessions = () => {
      stopExpirationTimer();
      const currentNow = now();
      const activeSessions = sessions
        .filter((session) => isSessionActiveAt(session, currentNow))
        .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));
      onSessions(activeSessions, queryContext());

      const nextExpiry = activeSessions.reduce<number | undefined>((nearest, session) => (
        typeof session.expiresAt !== 'number'
          ? nearest
          : nearest === undefined || session.expiresAt < nearest
            ? session.expiresAt
            : nearest
      ), undefined);
      if (nextExpiry !== undefined) {
        expirationTimer = setTimeout(
          emitAdminSessions,
          Math.min(Math.max(nextExpiry - currentNow + 1, 1), 2_147_483_647),
        );
      }
    };

    const stopSessions = subscribe(
      ref(database, 'game_sessions'),
      (snapshot) => {
        sessions = Object.entries(snapshotValue<Omit<TeacherSession, 'sessionCode'>>(snapshot))
          .map(([sessionCode, session]) => ({ ...session, sessionCode }));
        emitAdminSessions();
      },
      onError,
    );
    const stopClock = subscribe(
      ref(database, '.info/serverTimeOffset'),
      (snapshot) => {
        serverTimeOffsetMs = normalizeServerTimeOffset(snapshot.val());
        isServerTimeSynchronized = typeof snapshot.val() === 'number';
        emitAdminSessions();
      },
      (error) => {
        isServerTimeSynchronized = false;
        onError(error);
      },
    );

    return () => {
      stopped = true;
      stopExpirationTimer();
      stopSessions();
      stopClock();
    };
  }

  let stopIndex: Unsubscribe | undefined;
  let legacyFallbackStops: Unsubscribe[] = [];
  let canonicalStops = new Map<string, Unsubscribe>();
  let canonicalSessions = new Map<string, TeacherSession | null>();
  let initializedCodes = new Set<string>();
  let currentIndexRecords = new Map<string, OwnerSessionIndexRecord>();
  let usingLegacyFallback = false;

  const stopCanonicalListeners = () => {
    canonicalStops.forEach((unsubscribe) => unsubscribe());
    canonicalStops = new Map();
    canonicalSessions = new Map();
    initializedCodes = new Set();
  };
  const stopLegacyFallback = () => {
    legacyFallbackStops.forEach((unsubscribe) => unsubscribe());
    legacyFallbackStops = [];
  };

  const startLegacyOwnerFallback = (cause: Error) => {
    if (stopped || usingLegacyFallback) return;
    usingLegacyFallback = true;
    stopExpirationTimer();
    stopIndex?.();
    stopIndex = undefined;
    stopCanonicalListeners();
    stopLegacyFallback();

    sessionQueryDiagnostic('owner index unavailable; using bounded owner-field fallback', {
      teacherId,
      message: cause.message,
    });

    const byField = new Map<string, Record<string, OwnerSessionSource>>();
    const emitLegacySessions = () => {
      stopExpirationTimer();
      const currentNow = now();
      const merged = new Map<string, TeacherSession>();
      byField.forEach((sessionsByCode) => {
        Object.entries(sessionsByCode).forEach(([sessionCode, session]) => {
          if (resolveSessionOwnerId(session) === teacherId) {
            merged.set(sessionCode, toTeacherSession(sessionCode, session));
          }
        });
      });

      const activeSessions = [...merged.values()]
        .filter((session) => isSessionActiveAt(session, currentNow))
        .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));
      onSessions(activeSessions, queryContext());

      const nextExpiry = activeSessions.reduce<number | undefined>((nearest, session) => (
        typeof session.expiresAt !== 'number'
          ? nearest
          : nearest === undefined || session.expiresAt < nearest
            ? session.expiresAt
            : nearest
      ), undefined);
      if (nextExpiry !== undefined) {
        expirationTimer = setTimeout(
          emitLegacySessions,
          Math.min(Math.max(nextExpiry - currentNow + 1, 1), 2_147_483_647),
        );
      }
    };

    legacyFallbackStops = LEGACY_OWNER_FIELDS.map((field) => subscribe(
      query(
        ref(database, 'game_sessions'),
        orderByChild(field),
        equalTo(teacherId),
        limitToFirst(pageSize),
      ),
      (snapshot) => {
        byField.set(field, snapshotValue<OwnerSessionSource>(snapshot));
        emitLegacySessions();
      },
      (error) => {
        sessionQueryDiagnostic('owner-field fallback failed', {
          field,
          teacherId,
          message: error.message,
        });
        onError(error);
      },
    ));
  };

  const restartIndexSubscription = () => {
    if (stopped) return;
    if (usingLegacyFallback) return;
    stopExpirationTimer();
    stopIndex?.();
    stopCanonicalListeners();

    const currentNow = now();
    const lowerBound = cursor && cursor.expiresAt >= currentNow
      ? startAt(cursor.expiresAt, cursor.sessionCode)
      : startAt(currentNow);
    const indexQuery = query(
      ref(database, `${OWNER_SESSION_INDEX_ROOT}/${teacherId}`),
      orderByChild('expiresAt'),
      lowerBound,
      limitToFirst(pageSize),
    );

    const emitCanonicalSessions = () => {
      if (initializedCodes.size < currentIndexRecords.size) return;

      const currentEffectiveNow = now();
      const activeSessions = [...canonicalSessions.values()]
        .filter((session): session is TeacherSession => Boolean(session))
        .filter((session) => isSessionActiveAt(session, currentEffectiveNow))
        .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));
      onSessions(activeSessions, queryContext());

      const nextExpiry = activeSessions.reduce<number | undefined>((nearest, session) => (
        typeof session.expiresAt !== 'number'
          ? nearest
          : nearest === undefined || session.expiresAt < nearest
            ? session.expiresAt
            : nearest
      ), undefined);
      if (nextExpiry !== undefined) {
        expirationTimer = setTimeout(
          restartIndexSubscription,
          Math.min(Math.max(nextExpiry - currentEffectiveNow + 1, 1), 2_147_483_647),
        );
      }
    };

    stopIndex = subscribe(indexQuery, (snapshot) => {
      const records = snapshotValue<OwnerSessionIndexRecord>(snapshot);
      currentIndexRecords = new Map(
        Object.entries(records)
          .filter(([sessionCode, record]) => (
            record?.sessionCode === sessionCode
            && record.ownerId === teacherId
            && typeof record.expiresAt === 'number'
            && Number.isFinite(record.expiresAt)
          )),
      );

      canonicalStops.forEach((unsubscribe, sessionCode) => {
        if (!currentIndexRecords.has(sessionCode)) {
          unsubscribe();
          canonicalStops.delete(sessionCode);
          canonicalSessions.delete(sessionCode);
          initializedCodes.delete(sessionCode);
        }
      });

      currentIndexRecords.forEach((indexRecord, sessionCode) => {
        if (canonicalStops.has(sessionCode)) return;

        const stopCanonical = subscribe(
          ref(database, `game_sessions/${sessionCode}`),
          (canonicalSnapshot) => {
            const value = canonicalSnapshot.val();
            const session: TeacherSession | null = value && typeof value === 'object' && !Array.isArray(value)
              ? { ...(value as Omit<TeacherSession, 'sessionCode'>), sessionCode }
              : null;
            const isCanonicalMatch = session
              && resolveSessionOwnerId(session) === teacherId
              && session.expiresAt === indexRecord.expiresAt
              && isSessionActiveAt(session, now());
            canonicalSessions.set(sessionCode, isCanonicalMatch ? session : null);
            initializedCodes.add(sessionCode);
            emitCanonicalSessions();
          },
          () => {
            canonicalSessions.set(sessionCode, null);
            initializedCodes.add(sessionCode);
            emitCanonicalSessions();
          },
        );
        canonicalStops.set(sessionCode, stopCanonical);
      });

      if (currentIndexRecords.size === 0) {
        onSessions([], queryContext());
      } else {
        emitCanonicalSessions();
      }
    }, startLegacyOwnerFallback);
  };

  let clockInitialized = false;
  const migrateLegacyIndexBestEffort = () => {
    if (cursor) return;
    void migrateLegacyOwnerSessionIndex(teacherId, now()).catch((error) => {
      sessionQueryDiagnostic('legacy owner-index migration skipped', {
        teacherId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  };
  const stopClock = subscribe(
    ref(database, '.info/serverTimeOffset'),
    (snapshot) => {
      serverTimeOffsetMs = normalizeServerTimeOffset(snapshot.val());
      isServerTimeSynchronized = typeof snapshot.val() === 'number';
      restartIndexSubscription();

      if (!clockInitialized && !cursor) {
        clockInitialized = true;
        migrateLegacyIndexBestEffort();
      }
    },
    (error) => {
      if (!clockInitialized) {
        clockInitialized = true;
        restartIndexSubscription();
        migrateLegacyIndexBestEffort();
      }
      onError(error);
    },
  );

  return () => {
    stopped = true;
    stopExpirationTimer();
    stopIndex?.();
    stopLegacyFallback();
    stopCanonicalListeners();
    stopClock();
  };
};
