import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getMock,
  queryMock,
  refMock,
  runTransactionMock,
  transactionValues,
} = vi.hoisted(() => {
  const transactionValues = new Map<string, unknown>();
  const refMock = vi.fn((_database: unknown, path: string) => ({ path }));
  const getMock = vi.fn();
  const queryMock = vi.fn((base: unknown, ...constraints: unknown[]) => ({
    base,
    constraints,
  }));
  const runTransactionMock = vi.fn(async (pathRef: { path: string }, updater: (value: unknown) => unknown) => {
    const current = transactionValues.get(pathRef.path) ?? null;
    const next = updater(current);
    if (next !== undefined) {
      transactionValues.set(pathRef.path, next);
    }
    return { committed: next !== undefined };
  });

  return {
    getMock,
    queryMock,
    refMock,
    runTransactionMock,
    transactionValues,
  };
});

vi.mock('firebase/database', () => ({
  endAt: vi.fn((value: unknown) => ({ type: 'endAt', value })),
  get: getMock,
  limitToFirst: vi.fn((limit: number) => ({ type: 'limitToFirst', limit })),
  orderByChild: vi.fn((field: string) => ({ type: 'orderByChild', field })),
  query: queryMock,
  ref: refMock,
  runTransaction: runTransactionMock,
  startAt: vi.fn((value: unknown, key?: string) => ({ type: 'startAt', value, key })),
}));
vi.mock('./firebase', () => ({ database: {} }));

import {
  migrateLegacyOwnerSessionIndexPage,
} from './sessionOwnerIndexMigration';

const snap = (value: unknown) => ({ val: () => value });

describe('migrateLegacyOwnerSessionIndexPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionValues.clear();
  });

  it('indexes only active owner sessions and never overwrites newer index data', async () => {
    getMock.mockResolvedValueOnce(snap({
      ACTIVE1: {
        createdByUserId: 'teacher-1',
        status: 'waiting',
        expiresAt: 5_000,
        updatedAt: 100,
        createdAt: 50,
        mode: 'test',
      },
      ACTIVE2: {
        createdByUserId: 'teacher-1',
        status: 'in-progress',
        expiresAt: 6_000,
        updatedAt: 900,
      },
      EXPIRED1: {
        createdByUserId: 'teacher-1',
        status: 'waiting',
        expiresAt: 1_000,
        updatedAt: 300,
      },
      FOREIGN1: {
        createdByUserId: 'other-teacher',
        createdBy: 'teacher-1',
        status: 'waiting',
        expiresAt: 7_000,
        updatedAt: 400,
      },
    }));
    transactionValues.set('owner_session_index/teacher-1/ACTIVE1', {
      sessionCode: 'ACTIVE1',
      ownerId: 'teacher-1',
      expiresAt: 9_000,
      status: 'waiting',
      sourceUpdatedAt: 500,
    });
    transactionValues.set('owner_session_index/teacher-1/EXPIRED1', {
      sessionCode: 'EXPIRED1',
      ownerId: 'teacher-1',
      expiresAt: 2_000,
      status: 'waiting',
      sourceUpdatedAt: 200,
    });

    const result = await migrateLegacyOwnerSessionIndexPage({
      ownerId: 'teacher-1',
      field: 'createdByUserId',
      now: 2_000,
    });

    expect(result).toEqual({
      completed: true,
      migrated: 4,
      nextCursor: 'FOREIGN1',
    });
    expect(transactionValues.get('owner_session_index/teacher-1/ACTIVE1')).toEqual({
      sessionCode: 'ACTIVE1',
      ownerId: 'teacher-1',
      expiresAt: 9_000,
      status: 'waiting',
      sourceUpdatedAt: 500,
    });
    expect(transactionValues.get('owner_session_index/teacher-1/ACTIVE2')).toEqual({
      sessionCode: 'ACTIVE2',
      ownerId: 'teacher-1',
      expiresAt: 6_000,
      status: 'in-progress',
      sourceUpdatedAt: 900,
    });
    expect(transactionValues.get('owner_session_index/teacher-1/EXPIRED1')).toBeNull();
    expect(transactionValues.has('owner_session_index/teacher-1/FOREIGN1')).toBe(false);
  });

  it('resumes after the cursor with one duplicate row allowance', async () => {
    getMock.mockResolvedValueOnce(snap({
      SESSION1: {
        createdByUserId: 'teacher-1',
        status: 'waiting',
        expiresAt: 5_000,
        updatedAt: 100,
      },
      SESSION2: {
        createdByUserId: 'teacher-1',
        status: 'waiting',
        expiresAt: 5_000,
        updatedAt: 200,
      },
      SESSION3: {
        createdByUserId: 'teacher-1',
        status: 'waiting',
        expiresAt: 5_000,
        updatedAt: 300,
      },
    }));

    const result = await migrateLegacyOwnerSessionIndexPage({
      ownerId: 'teacher-1',
      field: 'createdByUserId',
      cursor: 'SESSION1',
      now: 2_000,
    });

    expect(result).toEqual({
      completed: true,
      migrated: 2,
      nextCursor: 'SESSION3',
    });
    expect(transactionValues.has('owner_session_index/teacher-1/SESSION1')).toBe(false);
    expect(transactionValues.get('owner_session_index/teacher-1/SESSION2')).toEqual(expect.objectContaining({
      sessionCode: 'SESSION2',
      sourceUpdatedAt: 200,
    }));
    expect(transactionValues.get('owner_session_index/teacher-1/SESSION3')).toEqual(expect.objectContaining({
      sessionCode: 'SESSION3',
      sourceUpdatedAt: 300,
    }));
    expect(queryMock).toHaveBeenCalledWith(
      { path: 'game_sessions' },
      { type: 'orderByChild', field: 'createdByUserId' },
      { type: 'startAt', value: 'teacher-1', key: 'SESSION1' },
      { type: 'endAt', value: 'teacher-1' },
      { type: 'limitToFirst', limit: 26 },
    );
  });
});
