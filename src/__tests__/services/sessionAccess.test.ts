/**
 * Session Access Control Tests
 * Contract tests for guest access, authenticated access, and access control enforcement
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSession,
  validateGuestJoin,
  validateSessionForJoin,
  SessionMode,
} from '../../services/sessionManager';
import { database } from '../../services/firebase';
import { ref, set, get, remove } from 'firebase/database';

const {
  mockGenerateUniqueCode,
  mockDatabaseStore,
  mockRef,
  mockGet,
  mockSet,
  mockRemove,
  mockUpdate,
  resetMockDatabase,
} = vi.hoisted(() => {
  const store: Record<string, any> = {};

  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const pathParts = (path?: string) => (path || '').split('/').filter(Boolean);

  const readAtPath = (path?: string) => {
    const parts = pathParts(path);
    let current: any = store;

    for (const part of parts) {
      if (current == null || typeof current !== 'object' || !(part in current)) {
        return undefined;
      }

      current = current[part];
    }

    return current;
  };

  const writeAtPath = (path: string | undefined, value: any) => {
    const parts = pathParts(path);

    if (parts.length === 0) {
      Object.keys(store).forEach(key => delete store[key]);
      if (value && typeof value === 'object') {
        Object.assign(store, clone(value));
      }
      return;
    }

    let current: any = store;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value === undefined ? null : clone(value);
  };

  const updateAtPath = (path: string | undefined, updates: Record<string, any>) => {
    const basePath = pathParts(path).join('/');

    if (!basePath) {
      for (const [key, value] of Object.entries(updates)) {
        writeAtPath(key, value);
      }
      return;
    }

    const currentValue = readAtPath(basePath);
    const merged =
      currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
        ? { ...currentValue, ...clone(updates) }
        : clone(updates);

    writeAtPath(basePath, merged);
  };

  const snapshot = (value: any) => ({
    exists: () => value !== undefined && value !== null,
    val: () => clone(value),
  });

  let sequence = 1;

  return {
    mockGenerateUniqueCode: vi.fn(async () => `S${String(sequence++).padStart(5, '0')}`),
    mockDatabaseStore: store,
    mockRef: vi.fn((_db, path = '') => ({ __path: path })),
    mockGet: vi.fn(async (refObj) => snapshot(readAtPath(refObj?.__path))),
    mockSet: vi.fn(async (refObj, value) => {
      writeAtPath(refObj?.__path, value);
    }),
    mockRemove: vi.fn(async (refObj) => {
      writeAtPath(refObj?.__path, undefined);
    }),
    mockUpdate: vi.fn(async (refObj, updates) => {
      updateAtPath(refObj?.__path, updates);
    }),
    resetMockDatabase: () => {
      Object.keys(store).forEach(key => delete store[key]);
      sequence = 1;
    },
  };
});

vi.mock('firebase/database', () => ({
  ref: mockRef,
  set: mockSet,
  get: mockGet,
  remove: mockRemove,
  update: mockUpdate,
  onValue: vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => Date.now()),
}));

vi.mock('../../services/sessionCodeService', async () => {
  const actual = await vi.importActual<typeof import('../../services/sessionCodeService')>(
    '../../services/sessionCodeService'
  );

  return {
    ...actual,
    generateUniqueCode: mockGenerateUniqueCode,
  };
});

vi.mock('../../services/firebase', () => ({
  database: mockDatabaseStore,
}));

const cleanupTestData = async () => {
  resetMockDatabase();
  vi.clearAllMocks();
  sessionStorage.clear();
  await remove(ref(database, 'game_sessions'));
  await remove(ref(database, 'teacher_sessions'));
  await remove(ref(database, 'classes'));
};

describe('Session Creation - Retired Quiz Contracts', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('defaults omitted mode to a Test session without Quiz compatibility writes', async () => {
    const result = await createSession({
      settings: {
        allowAnonymous: true,
      },
    });

    expect(result.success).toBe(true);

    const snapshot = await get(ref(database, `game_sessions/${result.sessionCode!}`));
    const session = snapshot.val();

    expect(session.mode).toBe(SessionMode.TEST);
    expect(session.activeTests).toEqual({});
    expect(session).not.toHaveProperty('activeQuizzes');
    expect(session).not.toHaveProperty('quizId');
    expect(JSON.stringify(mockUpdate.mock.calls)).not.toContain('activeQuizzes');
    expect(JSON.stringify(mockUpdate.mock.calls)).not.toContain('assignedQuizId');
    expect(JSON.stringify(mockUpdate.mock.calls)).not.toContain('quizId');
  });

  it('rejects explicit retired Quiz mode before writing a session', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(createSession({
      mode: 'quiz',
      settings: {
        allowAnonymous: true,
      },
    })).rejects.toThrow('Invalid session mode: quiz');

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDatabaseStore.game_sessions).toBeNull();

    consoleErrorSpy.mockRestore();
  });
});

describe('Session Access Control - Guest Access', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('allows guests when allowAnonymous is true', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: true,
        allowLateJoin: true,
      },
    });

    expect(result.success).toBe(true);

    const validation = await validateGuestJoin(result.sessionCode!);
    expect(validation.valid).toBe(true);
    expect(validation.session).toBeDefined();
  });

  it('blocks guests when allowAnonymous is false', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: false,
        allowLateJoin: true,
      },
    });

    const validation = await validateGuestJoin(result.sessionCode!);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('requires authentication');
  });

  it('defaults to allowing guests when allowAnonymous is undefined', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowLateJoin: true,
      },
    });

    const validation = await validateGuestJoin(result.sessionCode!);
    expect(validation.valid).toBe(true);
  });

  it('still blocks guests for expired sessions', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: true,
      },
    });

    const sessionCode = result.sessionCode!;
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();

    await set(sessionRef, {
      ...sessionData,
      status: 'expired',
    });

    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('expired');
  });
});

describe('Session Access Control - Authenticated Student Access', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('allows authenticated students to join public sessions', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        accessControl: 'public',
        allowAnonymous: true,
      },
    });

    const validation = await validateSessionForJoin(result.sessionCode!);
    expect(validation.valid).toBe(true);
  });

  it('allows authenticated students when guests are blocked', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: false,
        allowLateJoin: true,
      },
    });

    const validation = await validateSessionForJoin(result.sessionCode!);
    expect(validation.valid).toBe(true);

    const guestValidation = await validateGuestJoin(result.sessionCode!);
    expect(guestValidation.valid).toBe(false);
  });
});

describe('Session Access Control - Access Control Settings', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('persists public access control settings', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        accessControl: 'public',
        allowAnonymous: true,
      },
    });

    const snapshot = await get(ref(database, `game_sessions/${result.sessionCode!}`));
    const session = snapshot.val();

    expect(session.settings.accessControl).toBe('public');
    expect(session.settings.allowAnonymous).toBe(true);
  });

  it('persists class-only access control settings', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        accessControl: 'class-only',
        allowAnonymous: false,
      },
    });

    const snapshot = await get(ref(database, `game_sessions/${result.sessionCode!}`));
    const session = snapshot.val();

    expect(session.settings.accessControl).toBe('class-only');
    expect(session.settings.allowAnonymous).toBe(false);
  });
});

describe('Session Access Control - Late Join with Guest Access', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('blocks guest late join when allowLateJoin is false', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: true,
        allowLateJoin: false,
      },
    });

    const sessionCode = result.sessionCode!;
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();

    await set(sessionRef, {
      ...sessionData,
      status: 'in-progress',
    });

    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('already started');
  });

  it('allows guest late join when both toggles are true', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: true,
        allowLateJoin: true,
      },
    });

    const sessionCode = result.sessionCode!;
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();

    await set(sessionRef, {
      ...sessionData,
      status: 'in-progress',
    });

    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(true);
  });
});

describe('Session Access Control - Combined Scenarios', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('handles a strict session', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        accessControl: 'class-only',
        allowAnonymous: false,
        allowLateJoin: false,
      },
    });

    const snapshot = await get(ref(database, `game_sessions/${result.sessionCode!}`));
    const session = snapshot.val();

    expect(session.settings.accessControl).toBe('class-only');
    expect(session.settings.allowAnonymous).toBe(false);
    expect(session.settings.allowLateJoin).toBe(false);

    const guestValidation = await validateGuestJoin(result.sessionCode!);
    expect(guestValidation.valid).toBe(false);
  });

  it('handles an open session', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        accessControl: 'public',
        allowAnonymous: true,
        allowLateJoin: true,
      },
    });

    const sessionCode = result.sessionCode!;
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);
    const session = snapshot.val();

    expect(session.settings.accessControl).toBe('public');
    expect(session.settings.allowAnonymous).toBe(true);
    expect(session.settings.allowLateJoin).toBe(true);

    const guestValidation = await validateGuestJoin(sessionCode);
    expect(guestValidation.valid).toBe(true);

    await set(sessionRef, {
      ...session,
      status: 'in-progress',
    });

    const lateJoinValidation = await validateGuestJoin(sessionCode);
    expect(lateJoinValidation.valid).toBe(true);
  });
});

describe('Session Access Control - Error Messages', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('returns a clear message for guest blocks', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: false,
      },
    });

    const validation = await validateGuestJoin(result.sessionCode!);

    expect(validation.valid).toBe(false);
    expect(validation.message).toBe('This session requires authentication. Please log in to join.');
  });

  it('returns not-found for a valid but missing session code', async () => {
    const validation = await validateGuestJoin('ABC123');

    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('not found');
  });

  it('returns expired for expired sessions', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: true,
      },
    });

    const sessionCode = result.sessionCode!;
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();

    await set(sessionRef, {
      ...sessionData,
      status: 'expired',
    });

    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('expired');
  });
});
