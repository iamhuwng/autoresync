import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getMock,
  refMock,
  setMock,
  updateMock,
  deliverSessionNotificationNowMock,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  refMock: vi.fn((_database?: unknown, path = '') => ({ path })),
  setMock: vi.fn(),
  updateMock: vi.fn(),
  deliverSessionNotificationNowMock: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  get: getMock,
  onValue: vi.fn(),
  ref: refMock,
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
  set: setMock,
  update: updateMock,
}));
vi.mock('./firebase', () => ({ database: {} }));
vi.mock('./sessionCodeService', () => ({
  generateUniqueCode: vi.fn(async () => 'ABC123'),
  normalizeCode: vi.fn((code: string) => code),
  validateCode: vi.fn(() => true),
}));
vi.mock('./sessionHelpers', () => ({
  addCompatibilityFields: vi.fn((session: unknown) => session),
  getStudentAssignment: vi.fn(),
  isOldFormat: vi.fn(() => false),
  normalizeSessionData: vi.fn((session: unknown) => session),
}));
vi.mock('../types/releaseState.types', () => ({
  getSessionEndReleaseState: vi.fn(() => 'review-released'),
}));
vi.mock('./sessionNotificationActionClient', async () => {
  const actual = await vi.importActual<typeof import('./sessionNotificationActionClient')>('./sessionNotificationActionClient');
  return { ...actual, deliverSessionNotificationNow: (...args: unknown[]) => deliverSessionNotificationNowMock(...args) };
});

import {
  createSession,
  deleteSession,
  extendSession,
  updateSessionStatus,
  validateSessionForJoin,
} from './sessionManager.js';
import { SESSION_EXPIRED_MESSAGE } from './sessionActionError';

const snap = (value: unknown) => ({
  exists: () => value !== null,
  val: () => value,
});

describe('sessionManager lifecycle index writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    sessionStorage.clear();
    updateMock.mockResolvedValue(undefined);
    setMock.mockResolvedValue(undefined);
    deliverSessionNotificationNowMock.mockResolvedValue(undefined);
  });

  it('creates canonical session and owner index in one root update', async () => {
    const result = await createSession({
      testId: 'pending',
      createdBy: 'teacher-1',
    });

    expect(result.sessionCode).toBe('ABC123');
    expect(updateMock).toHaveBeenCalledWith({ path: '' }, expect.objectContaining({
      'game_sessions/ABC123': expect.objectContaining({
        sessionCode: 'ABC123',
        status: 'waiting',
        createdByUserId: 'teacher-1',
        expiresAt: 86_401_000,
      }),
      'owner_session_index/teacher-1/ABC123': {
        sessionCode: 'ABC123',
        ownerId: 'teacher-1',
        expiresAt: 86_401_000,
        status: 'waiting',
        sourceUpdatedAt: 1_000,
        mode: 'test',
        createdAt: 1_000,
      },
    }));
  });

  it('commits the session event and roster intent atomically', async () => {
    getMock.mockImplementation(async (reference: { path: string }) => {
      if (reference.path === 'classes/class-1') return snap({
        name: 'Class 1', students: { 'student-1': { uid: 'student-1' }, 'student-2': { uid: 'student-2' } },
      });
      if (reference.path === 'tests/test-1') return snap({ title: 'Test 1' });
      return snap(null);
    });

    await createSession({ testId: 'test-1', classId: 'class-1', createdBy: 'teacher-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const patch = updateMock.mock.calls[0][1];
    const session = patch['game_sessions/ABC123'];
    const [eventId, event] = Object.entries(session.notificationEvents)[0] as [string, any];
    expect(event).toMatchObject({ kind: 'session-opened', classId: 'class-1', recipientCount: 2 });
    expect(Object.keys(event.recipients).sort()).toEqual(['student-1', 'student-2']);
    expect(patch[`session_notification_intents/${eventId}`]).toMatchObject({ event, recipientCount: 2, state: 'initial_due' });
    expect(deliverSessionNotificationNowMock).toHaveBeenCalledWith(eventId);
  });

  it('fails class session creation if a durable roster snapshot cannot be read', async () => {
    getMock.mockRejectedValue(new Error('class data unavailable'));
    await expect(createSession({ testId: 'pending', classId: 'class-1', createdBy: 'teacher-1' }))
      .rejects.toThrow('Failed to create session');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('extension reactivates stored expired sessions and refreshes owner index atomically', async () => {
    getMock.mockResolvedValueOnce(snap({
      sessionCode: 'ABC123',
      createdByUserId: 'teacher-1',
      status: 'expired',
      expiresAt: 500,
      createdAt: 100,
      updatedAt: 500,
      mode: 'test',
    }));

    await extendSession('ABC123', 1);

    expect(updateMock).toHaveBeenCalledWith({ path: '' }, {
      'game_sessions/ABC123/status': 'waiting',
      'game_sessions/ABC123/expiresAt': 3_601_000,
      'game_sessions/ABC123/extendedAt': 1_000,
      'game_sessions/ABC123/updatedAt': 1_000,
      'owner_session_index/teacher-1/ABC123': {
        sessionCode: 'ABC123',
        ownerId: 'teacher-1',
        expiresAt: 3_601_000,
        status: 'waiting',
        sourceUpdatedAt: 1_000,
        mode: 'test',
        createdAt: 100,
      },
    });
  });

  it('terminal status and delete remove owner index entries', async () => {
    getMock
      .mockResolvedValueOnce(snap({
        sessionCode: 'ABC123',
        createdByUserId: 'teacher-1',
        status: 'waiting',
        expiresAt: 5_000,
        createdAt: 100,
      }))
      .mockResolvedValueOnce(snap({
        sessionCode: 'ABC123',
        createdByUserId: 'teacher-1',
        linkedClassId: 'class-1',
      }));

    await updateSessionStatus('ABC123', 'completed');
    await deleteSession('ABC123');

    expect(updateMock).toHaveBeenNthCalledWith(1, { path: '' }, {
      'game_sessions/ABC123/status': 'completed',
      'game_sessions/ABC123/updatedAt': 1_000,
      'owner_session_index/teacher-1/ABC123': null,
    });
    expect(updateMock).toHaveBeenNthCalledWith(2, { path: '' }, {
      'game_sessions/ABC123': null,
      'classes/class-1/activeSessions/ABC123': null,
      'owner_session_index/teacher-1/ABC123': null,
    });
  });

  it('keeps legacy records readable but fails student join validation without numeric expiresAt', async () => {
    getMock.mockResolvedValueOnce(snap({
      sessionCode: 'ABC123',
      createdByUserId: 'teacher-1',
      status: 'waiting',
      settings: { allowLateJoin: true },
    }));

    await expect(validateSessionForJoin('ABC123')).resolves.toEqual({
      valid: false,
      message: SESSION_EXPIRED_MESSAGE,
    });
  });
});
