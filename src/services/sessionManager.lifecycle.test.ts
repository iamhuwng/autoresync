import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getMock,
  refMock,
  setMock,
  updateMock,
  createTrustedBulkNotificationsMock,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  refMock: vi.fn((_database?: unknown, path = '') => ({ path })),
  setMock: vi.fn(),
  updateMock: vi.fn(),
  createTrustedBulkNotificationsMock: vi.fn(),
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
vi.mock('./notificationProducerClient', () => ({
  createTrustedBulkNotifications: (...args: unknown[]) => createTrustedBulkNotificationsMock(...args),
}));

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
    createTrustedBulkNotificationsMock.mockResolvedValue({ success: true });
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

  it('notifies enrolled students through the session producer with stable authority and retry identity', async () => {
    getMock.mockImplementation(async (reference: { path: string }) => {
      if (reference.path === 'classes/class-1/name') return snap('Class 1');
      if (reference.path === 'classes/class-1/students') {
        return snap({ 'student-1': { uid: 'student-1' }, 'student-2': { uid: 'student-2' } });
      }
      return snap(null);
    });

    await createSession({ testId: 'test-1', classId: 'class-1', createdBy: 'teacher-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createTrustedBulkNotificationsMock).toHaveBeenCalledWith(
      ['student-1', 'student-2'],
      {
        producerFamily: 'session',
        authorityRecordId: 'ABC123',
        operationKey: 'session-opened:ABC123',
        type: 'info',
        title: '📚 New Session Available',
        message: 'Class 1 has a new test session ready. Join with code ABC123.',
        link: '/student-wait/ABC123',
      },
    );
  });

  it('keeps roster notification delivery when optional class-name read fails', async () => {
    getMock.mockImplementation(async (reference: { path: string }) => {
      if (reference.path === 'classes/class-1/name') throw new Error('class name unavailable');
      if (reference.path === 'classes/class-1/students') {
        return snap({ 'student-1': { uid: 'student-1' } });
      }
      return snap(null);
    });

    await createSession({ testId: 'test-1', classId: 'class-1', createdBy: 'teacher-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createTrustedBulkNotificationsMock).toHaveBeenCalledWith(
      ['student-1'],
      expect.objectContaining({
        message: 'Your class has a new test session ready. Join with code ABC123.',
      }),
    );
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
