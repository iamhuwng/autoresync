import {
  endAt,
  get,
  limitToFirst,
  orderByChild,
  query,
  ref,
  runTransaction,
  startAt,
} from 'firebase/database';
import { database } from './firebase';
import {
  buildOwnerSessionIndexRecord,
  LEGACY_OWNER_FIELDS,
  OWNER_SESSION_MIGRATION_ROOT,
  ownerSessionIndexPath,
  resolveSessionOwnerId,
  shouldReplaceOwnerIndexRecord,
  type OwnerSessionIndexRecord,
  type OwnerSessionSource,
} from './sessionOwnerIndex';

const MIGRATION_PAGE_SIZE = 25;
const MAX_PAGES_PER_RUN = 2;

interface MigrationState {
  completed?: boolean;
  cursor?: string;
  updatedAt?: number;
}

interface MigrationPageResult {
  completed: boolean;
  migrated: number;
  nextCursor?: string;
}

const asRecord = <T>(value: unknown): Record<string, T> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, T>
    : {}
);

const sourceVersion = (session: OwnerSessionSource): number => (
  typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt)
    ? session.updatedAt
    : typeof session.createdAt === 'number' && Number.isFinite(session.createdAt)
      ? session.createdAt
      : 0
);

const runWithConcurrency = async (
  tasks: Array<() => Promise<void>>,
  concurrency: number,
): Promise<void> => {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    async () => {
      while (nextIndex < tasks.length) {
        const task = tasks[nextIndex];
        nextIndex += 1;
        await task();
      }
    },
  );
  await Promise.all(workers);
};

const migrationStatePath = (ownerId: string, field: string): string =>
  `${OWNER_SESSION_MIGRATION_ROOT}/${ownerId}/${field}`;

const advanceMigrationState = async (
  ownerId: string,
  field: string,
  result: MigrationPageResult,
  now: number,
): Promise<void> => {
  await runTransaction(ref(database, migrationStatePath(ownerId, field)), (currentValue) => {
    const current = (currentValue ?? {}) as MigrationState;
    if (current.completed) {
      return current;
    }
    if (
      current.cursor
      && result.nextCursor
      && current.cursor.localeCompare(result.nextCursor) > 0
    ) {
      return current;
    }

    return {
      completed: result.completed,
      ...(result.nextCursor && { cursor: result.nextCursor }),
      updatedAt: now,
    };
  });
};

export const migrateLegacyOwnerSessionIndexPage = async ({
  ownerId,
  field,
  cursor,
  now,
}: {
  ownerId: string;
  field: typeof LEGACY_OWNER_FIELDS[number];
  cursor?: string;
  now: number;
}): Promise<MigrationPageResult> => {
  const pageQuery = query(
    ref(database, 'game_sessions'),
    orderByChild(field),
    cursor ? startAt(ownerId, cursor) : startAt(ownerId),
    endAt(ownerId),
    limitToFirst(MIGRATION_PAGE_SIZE + (cursor ? 1 : 0)),
  );
  const snapshot = await get(pageQuery);
  const rows = Object.entries(asRecord<OwnerSessionSource>(snapshot.val()))
    .sort(([left], [right]) => left.localeCompare(right))
    .filter(([sessionCode]) => !cursor || sessionCode > cursor)
    .slice(0, MIGRATION_PAGE_SIZE);

  const tasks = rows.map(([sessionCode, session]) => async () => {
    if (resolveSessionOwnerId(session) !== ownerId) {
      return;
    }

    const candidate = buildOwnerSessionIndexRecord(sessionCode, session, now);
    const candidateVersion = sourceVersion(session);
    await runTransaction(
      ref(database, ownerSessionIndexPath(ownerId, sessionCode)),
      (currentValue) => {
        const current = currentValue as OwnerSessionIndexRecord | null;
        if (candidate) {
          return shouldReplaceOwnerIndexRecord(current, candidate) ? candidate : undefined;
        }
        if (!current || current.sourceUpdatedAt <= candidateVersion) {
          return null;
        }
        return undefined;
      },
    );
  });
  await runWithConcurrency(tasks, 4);

  const nextCursor = rows.at(-1)?.[0] ?? cursor;
  return {
    completed: rows.length < MIGRATION_PAGE_SIZE,
    migrated: rows.length,
    ...(nextCursor && { nextCursor }),
  };
};

export const migrateLegacyOwnerSessionIndex = async (
  ownerId: string,
  now = Date.now(),
): Promise<void> => {
  if (!ownerId) {
    throw new Error('migrateLegacyOwnerSessionIndex requires ownerId.');
  }

  for (const field of LEGACY_OWNER_FIELDS) {
    const stateSnapshot = await get(ref(database, migrationStatePath(ownerId, field)));
    let state = (stateSnapshot.val() ?? {}) as MigrationState;

    for (let page = 0; page < MAX_PAGES_PER_RUN && !state.completed; page += 1) {
      const result = await migrateLegacyOwnerSessionIndexPage({
        ownerId,
        field,
        cursor: state.cursor,
        now,
      });
      await advanceMigrationState(ownerId, field, result, now);
      state = {
        completed: result.completed,
        cursor: result.nextCursor,
        updatedAt: now,
      };
    }
  }
};
