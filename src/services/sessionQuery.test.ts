import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  limitToFirstMock,
  equalToMock,
  migrateMock,
  onValueMock,
  orderByChildMock,
  queryMock,
  refMock,
  startAtMock,
  subscriptions,
} = vi.hoisted(() => {
  const activeSubscriptions: Array<{
    target: Record<string, unknown>;
    onData: (snapshot: { val: () => unknown }) => void;
    onError: (error: Error) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    limitToFirstMock: vi.fn((value: number) => ({ kind: 'limitToFirst', value })),
    equalToMock: vi.fn((value: unknown) => ({ kind: 'equalTo', value })),
    migrateMock: vi.fn().mockResolvedValue(undefined),
    onValueMock: vi.fn((
      target: Record<string, unknown>,
      onData: (snapshot: { val: () => unknown }) => void,
      onError: (error: Error) => void,
    ) => {
      const unsubscribe = vi.fn();
      activeSubscriptions.push({ target, onData, onError, unsubscribe });
      return unsubscribe;
    }),
    orderByChildMock: vi.fn((field: string) => ({ field, kind: 'orderByChild' })),
    queryMock: vi.fn((
      target: Record<string, unknown>,
      ...constraints: Array<Record<string, unknown>>
    ) => ({
      ...target,
      constraints,
    })),
    refMock: vi.fn((_database: unknown, path: string) => ({ path })),
    startAtMock: vi.fn((value: unknown, key?: string) => ({ key, kind: 'startAt', value })),
    subscriptions: activeSubscriptions,
  };
});

vi.mock('firebase/database', () => ({
  equalTo: equalToMock,
  limitToFirst: limitToFirstMock,
  onValue: onValueMock,
  orderByChild: orderByChildMock,
  query: queryMock,
  ref: refMock,
  startAt: startAtMock,
}));

vi.mock('./firebase', () => ({
  database: { name: 'test-database' },
}));

vi.mock('./sessionOwnerIndexMigration', () => ({
  migrateLegacyOwnerSessionIndex: migrateMock,
}));

import { subscribeTeacherSessions } from './sessionQuery';

const snapshot = (value: unknown) => ({ val: () => value });

describe('subscribeTeacherSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptions.splice(0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queries a bounded owner index, revalidates canonical data, and refreshes at expiry', async () => {
    const onSessions = vi.fn();
    const onError = vi.fn();
    const localNow = Date.now();
    const serverOffset = 500;
    const expiresAt = localNow + serverOffset + 60_000;

    const unsubscribe = subscribeTeacherSessions({
      teacherId: 'teacher-1',
      canReadAll: false,
      onSessions,
      onError,
    });

    expect(subscriptions[0].target).toEqual({ path: '.info/serverTimeOffset' });
    subscriptions[0].onData(snapshot(serverOffset));
    await vi.waitFor(() => expect(migrateMock).toHaveBeenCalledWith(
      'teacher-1',
      localNow + serverOffset,
    ));

    const indexSubscription = subscriptions[1];
    expect(indexSubscription.target).toEqual({
      path: 'owner_session_index/teacher-1',
      constraints: [
        { field: 'expiresAt', kind: 'orderByChild' },
        { key: undefined, kind: 'startAt', value: localNow + serverOffset },
        { kind: 'limitToFirst', value: 25 },
      ],
    });

    indexSubscription.onData(snapshot({
      OWN123: {
        sessionCode: 'OWN123',
        ownerId: 'teacher-1',
        expiresAt,
        status: 'waiting',
        sourceUpdatedAt: 10,
      },
      TAMPERED: {
        sessionCode: 'TAMPERED',
        ownerId: 'teacher-2',
        expiresAt,
        status: 'waiting',
        sourceUpdatedAt: 10,
      },
    }));

    const canonicalSubscription = subscriptions[2];
    expect(canonicalSubscription.target).toEqual({ path: 'game_sessions/OWN123' });
    canonicalSubscription.onData(snapshot({
      createdAt: 10,
      createdByUserId: 'teacher-1',
      expiresAt,
      status: 'waiting',
    }));

    expect(onSessions).toHaveBeenLastCalledWith(
      [expect.objectContaining({ sessionCode: 'OWN123' })],
      { isServerTimeSynchronized: true, serverTimeOffsetMs: serverOffset },
    );

    vi.advanceTimersByTime(60_001);
    const refreshedIndexSubscription = subscriptions[3];
    expect(indexSubscription.unsubscribe).toHaveBeenCalledOnce();
    refreshedIndexSubscription.onData(snapshot({}));
    expect(onSessions).toHaveBeenLastCalledWith(
      [],
      { isServerTimeSynchronized: true, serverTimeOffsetMs: serverOffset },
    );

    unsubscribe();
    expect(subscriptions.every(({ unsubscribe: stop }) => stop.mock.calls.length === 1)).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores stale index expiry and keeps admin global access explicit', () => {
    const ownerSessions = vi.fn();
    const stopOwner = subscribeTeacherSessions({
      teacherId: 'teacher-1',
      canReadAll: false,
      onSessions: ownerSessions,
      onError: vi.fn(),
      pageSize: 5,
    });
    subscriptions[0].onData(snapshot(0));
    subscriptions[1].onData(snapshot({
      STALE: {
        sessionCode: 'STALE',
        ownerId: 'teacher-1',
        expiresAt: Date.now() + 10_000,
        status: 'waiting',
        sourceUpdatedAt: 1,
      },
    }));
    subscriptions[2].onData(snapshot({
      createdByUserId: 'teacher-1',
      expiresAt: Date.now() + 20_000,
      status: 'waiting',
    }));
    expect(ownerSessions).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ isServerTimeSynchronized: true }),
    );
    stopOwner();

    subscriptions.splice(0);
    const adminSessions = vi.fn();
    const stopAdmin = subscribeTeacherSessions({
      teacherId: 'admin-1',
      canReadAll: true,
      onSessions: adminSessions,
      onError: vi.fn(),
    });
    expect(subscriptions.map(({ target }) => target)).toEqual([
      { path: 'game_sessions' },
      { path: '.info/serverTimeOffset' },
    ]);
    stopAdmin();
  });

  it('falls back to bounded owner queries when owner index is unavailable', () => {
    const onSessions = vi.fn();
    const onError = vi.fn();
    const localNow = Date.now();
    const expiresAt = localNow + 60_000;

    const unsubscribe = subscribeTeacherSessions({
      teacherId: 'teacher-1',
      canReadAll: false,
      onSessions,
      onError,
    });

    subscriptions[0].onData(snapshot(0));
    subscriptions[1].onError(new Error('permission_denied at /owner_session_index/teacher-1'));

    expect(subscriptions.slice(2, 5).map(({ target }) => target)).toEqual([
      {
        path: 'game_sessions',
        constraints: [
          { field: 'createdByUserId', kind: 'orderByChild' },
          { kind: 'equalTo', value: 'teacher-1' },
          { kind: 'limitToFirst', value: 25 },
        ],
      },
      {
        path: 'game_sessions',
        constraints: [
          { field: 'createdBy', kind: 'orderByChild' },
          { kind: 'equalTo', value: 'teacher-1' },
          { kind: 'limitToFirst', value: 25 },
        ],
      },
      {
        path: 'game_sessions',
        constraints: [
          { field: 'teacherId', kind: 'orderByChild' },
          { kind: 'equalTo', value: 'teacher-1' },
          { kind: 'limitToFirst', value: 25 },
        ],
      },
    ]);

    subscriptions[2].onData(snapshot({
      OWN123: {
        createdAt: 10,
        createdByUserId: 'teacher-1',
        expiresAt,
        status: 'waiting',
      },
      FOREIGN: {
        createdAt: 20,
        createdByUserId: 'other-teacher',
        createdBy: 'teacher-1',
        expiresAt,
        status: 'waiting',
      },
    }));

    expect(onSessions).toHaveBeenLastCalledWith(
      [expect.objectContaining({ sessionCode: 'OWN123' })],
      { isServerTimeSynchronized: true, serverTimeOffsetMs: 0 },
    );
    expect(onError).not.toHaveBeenCalled();

    unsubscribe();
  });
});
