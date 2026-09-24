import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitorControls } from './useMonitorControls';

const {
  mockNavigateTo,
  getMock,
  updateMock,
  autoSubmitAllUnsubmittedStudentsMock,
  autoSubmitDisconnectedStudentsMock,
  identifyDisconnectedStudentsMock,
  identifyUnsubmittedStudentsMock,
  deliverSessionNotificationNowMock,
} = vi.hoisted(() => ({
  mockNavigateTo: vi.fn(),
  getMock: vi.fn(),
  updateMock: vi.fn(),
  autoSubmitAllUnsubmittedStudentsMock: vi.fn(),
  autoSubmitDisconnectedStudentsMock: vi.fn(),
  identifyDisconnectedStudentsMock: vi.fn(),
  identifyUnsubmittedStudentsMock: vi.fn(),
  deliverSessionNotificationNowMock: vi.fn(),
}));

vi.mock('../useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
  }),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_database: any, path: string) => ({ path })),
  get: (...args: any[]) => getMock(...args),
  update: (...args: any[]) => updateMock(...args),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
}));

vi.mock('../../utils/monitor', () => ({
  autoSubmitAllUnsubmittedStudents: (...args: any[]) => autoSubmitAllUnsubmittedStudentsMock(...args),
  autoSubmitDisconnectedStudents: (...args: any[]) => autoSubmitDisconnectedStudentsMock(...args),
  identifyDisconnectedStudents: (...args: any[]) => identifyDisconnectedStudentsMock(...args),
  identifyUnsubmittedStudents: (...args: any[]) => identifyUnsubmittedStudentsMock(...args),
}));
vi.mock('../../services/testStorage', () => ({
  cacheSessionStudentSafeTestData: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../services/sessionNotificationActionClient', async () => {
  const actual = await vi.importActual<typeof import('../../services/sessionNotificationActionClient')>('../../services/sessionNotificationActionClient');
  return { ...actual, deliverSessionNotificationNow: (...args: unknown[]) => deliverSessionNotificationNowMock(...args) };
});

const TEST_DATA = {
  title: 'Canonical Test',
  type: 'quiz',
  skill: 'Reading',
  duration: 45,
  questionCount: 3,
};

describe('useMonitorControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue({
      exists: () => false,
      val: () => null,
    });
    updateMock.mockResolvedValue(undefined);
    autoSubmitAllUnsubmittedStudentsMock.mockResolvedValue([]);
    autoSubmitDisconnectedStudentsMock.mockResolvedValue([]);
    identifyDisconnectedStudentsMock.mockReturnValue([]);
    identifyUnsubmittedStudentsMock.mockReturnValue([]);
    deliverSessionNotificationNowMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('writes review-released by default when ending a session', async () => {
    const { result } = renderHook(() =>
      useMonitorControls('SESSION123', null, null, null)
    );

    await act(async () => {
      await result.current.endFullSession(false, true);
    });

    expect(updateMock).toHaveBeenCalledWith(
      { path: undefined },
      expect.objectContaining({ 'game_sessions/SESSION123/reviewReleaseState': 'review-released' })
    );
  });

  it('uses monitor authority and stable retry identity for end-session notifications', async () => {
    getMock.mockImplementation(async (reference: { path: string }) => ({
      exists: () => true,
      val: () => reference.path === 'classes/class-1'
        ? { name: 'Class 1', students: { 'student-1': { uid: 'student-1' }, 'student-2': { uid: 'student-2' } } }
        : { title: 'Monitor Test' },
    }));

    const { result } = renderHook(() => useMonitorControls(
      'SESSION-END-1',
      { linkedClassId: 'class-1', testId: 'test-1', startTime: 1722220000000, createdByUserId: 'teacher-1' } as any,
      { ...TEST_DATA, title: 'Monitor Test' } as any,
      null,
    ));

    await act(async () => {
      await result.current.endFullSession(false, true);
    });

    const rootPatch = updateMock.mock.calls.find(([target]) => target.path === undefined)?.[1];
    const eventPath = Object.keys(rootPatch).find((path) => path.startsWith('game_sessions/SESSION-END-1/notificationEvents/'));
    expect(eventPath).toBeDefined();
    const eventId = eventPath!.split('/').at(-1)!;
    expect(rootPatch[eventPath!]).toMatchObject({ kind: 'test-ended', recipientCount: 2, classId: 'class-1' });
    expect(Object.keys(rootPatch[`session_notification_intents/${eventId}`].event.recipients).sort())
      .toEqual(['student-1', 'student-2']);
    expect(deliverSessionNotificationNowMock).toHaveBeenCalledWith(eventId);
  });

  it('preserves feedback-released when the session is already fully released', async () => {
    const { result } = renderHook(() =>
      useMonitorControls(
        'SESSION456',
        {
          reviewReleaseState: 'feedback-released',
          players: {},
          testId: 'test-1',
          baseTimeExpired: false,
        } as any,
        null,
        null
      )
    );

    await act(async () => {
      await result.current.endFullSession(false, true);
    });

    expect(updateMock).toHaveBeenCalledWith(
      { path: undefined },
      expect.objectContaining({ 'game_sessions/SESSION456/reviewReleaseState': 'feedback-released' })
    );
  });

  it('commits test start and its trusted roster intent together', async () => {
    getMock.mockImplementation(async (reference: { path: string }) => ({
      exists: () => true,
      val: () => reference.path === 'classes/class-start'
        ? { name: 'Class Start', students: { 'student-1': { uid: 'student-1' } } }
        : { title: 'Started Test' },
    }));
    const { result } = renderHook(() => useMonitorControls('SESSION-START-1', {
      linkedClassId: 'class-start', testId: 'test-start', createdByUserId: 'teacher-1',
    } as any, null, null));

    await act(async () => { await result.current.startTest(); });

    const rootPatch = updateMock.mock.calls.find(([target]) => target.path === undefined)?.[1];
    expect(rootPatch['game_sessions/SESSION-START-1/status']).toBe('in-progress');
    const eventPath = Object.keys(rootPatch).find((path) => path.startsWith('game_sessions/SESSION-START-1/notificationEvents/'));
    expect(rootPatch[eventPath!]).toMatchObject({ kind: 'test-started', recipientCount: 1, testName: 'Started Test' });
    const eventId = eventPath!.split('/').at(-1)!;
    expect(rootPatch[`session_notification_intents/${eventId}`].event.recipients).toEqual({ 'student-1': true });
    expect(deliverSessionNotificationNowMock).toHaveBeenCalledWith(eventId);
  });

  it('routes disconnected base-student auto-submit through canonical result saving after fetching test data', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ questions: [{ id: 'q1' }] }),
    });
    identifyDisconnectedStudentsMock.mockImplementation((players: Record<string, any>) => (
      players['student-1']
        ? [{
            studentId: 'student-1',
            name: 'Student One',
            answers: { 1: { answer: 'A' } },
            lastActivity: 1,
            disconnectedAt: 2,
          }]
        : []
    ));
    identifyUnsubmittedStudentsMock.mockImplementation((players: Record<string, any>) => (
      players['student-1']
        ? [{
            studentId: 'student-1',
            name: 'Student One',
            answers: { 1: { answer: 'A' } },
            isConnected: false,
            lastActivity: 1,
          }]
        : []
    ));

    const session = {
      testId: 'test-1',
      startTime: 1234,
      createdByUserId: 'teacher-canonical',
      teacherId: 'teacher-synthetic',
      academicContext: { classId: 'class-1', className: 'Class 1' },
      players: {
        'student-1': {
          name: 'Student One',
          answers: { 1: { answer: 'A' } },
          lastActivity: 1,
        },
      },
    } as any;

    const { result } = renderHook(() =>
      useMonitorControls('SESSION789', session, TEST_DATA as any, null)
    );

    await act(async () => {
      await result.current.completeBaseTest();
    });

    expect(getMock).toHaveBeenCalledWith({ path: 'tests/test-1' });
    expect(autoSubmitAllUnsubmittedStudentsMock).toHaveBeenCalledWith(
      'SESSION789',
      'test-1',
      expect.arrayContaining([
        expect.objectContaining({ studentId: 'student-1' }),
      ]),
      [{ id: 'q1' }],
      {
        title: 'Canonical Test',
        type: 'quiz',
        skill: 'Reading',
        duration: 45,
      },
      'teacher-canonical',
      1234,
      { classId: 'class-1', className: 'Class 1' }
    );
    expect(autoSubmitDisconnectedStudentsMock).not.toHaveBeenCalled();
  });

  it('fetches missing test payloads before end-session auto-submit instead of falling back to legacy disconnected writes', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ questions: [{ id: 'q1' }, { id: 'q2' }] }),
    });
    identifyUnsubmittedStudentsMock.mockImplementation((players: Record<string, any>) => (
      players['student-1']
        ? [{
            studentId: 'student-1',
            name: 'Student One',
            answers: { 1: { answer: 'A' } },
            isConnected: true,
            lastActivity: 10,
          }]
        : []
    ));

    const session = {
      testId: 'test-2',
      startTime: 2222,
      createdByUserId: 'teacher-canonical',
      teacherId: 'teacher-synthetic',
      reviewReleaseState: 'locked-review',
      players: {
        'student-1': {
          name: 'Student One',
          answers: { 1: { answer: 'A' } },
          lastActivity: 10,
        },
      },
    } as any;

    const { result } = renderHook(() =>
      useMonitorControls('SESSION999', session, TEST_DATA as any, null)
    );

    await act(async () => {
      await result.current.endFullSession(false, true);
    });

    expect(getMock).toHaveBeenCalledWith({ path: 'tests/test-2' });
    expect(autoSubmitAllUnsubmittedStudentsMock).toHaveBeenCalledWith(
      'SESSION999',
      'test-2',
      expect.arrayContaining([
        expect.objectContaining({ studentId: 'student-1' }),
      ]),
      [{ id: 'q1' }, { id: 'q2' }],
      {
        title: 'Canonical Test',
        type: 'quiz',
        skill: 'Reading',
        duration: 45,
      },
      'teacher-canonical',
      2222,
      undefined
    );
    expect(autoSubmitDisconnectedStudentsMock).not.toHaveBeenCalled();
  });

  it('derives end-session auto-submit metadata from the persisted test when monitor testData is missing', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        title: 'Fetched Reading Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 30,
        questionCount: 2,
        questions: [{ id: 'q1' }, { id: 'q2' }],
      }),
    });
    identifyUnsubmittedStudentsMock.mockReturnValue([
      {
        studentId: 'student-1',
        name: 'Student One',
        answers: { 1: { answer: 'A' } },
        isConnected: true,
        lastActivity: 10,
      },
    ]);

    const session = {
      testId: 'test-3',
      startTime: 3333,
      createdByUserId: 'teacher-canonical',
      reviewReleaseState: 'locked-review',
      players: {
        'student-1': {
          name: 'Student One',
          answers: { 1: { answer: 'A' } },
          lastActivity: 10,
        },
      },
    } as any;

    const { result } = renderHook(() =>
      useMonitorControls('SESSION1000', session, null, null)
    );

    await act(async () => {
      await result.current.endFullSession(false, true);
    });

    expect(getMock).toHaveBeenCalledWith({ path: 'tests/test-3' });
    expect(autoSubmitAllUnsubmittedStudentsMock).toHaveBeenCalledWith(
      'SESSION1000',
      'test-3',
      expect.arrayContaining([
        expect.objectContaining({ studentId: 'student-1' }),
      ]),
      [{ id: 'q1' }, { id: 'q2' }],
      {
        title: 'Fetched Reading Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 30,
      },
      'teacher-canonical',
      3333,
      undefined
    );
    expect(autoSubmitDisconnectedStudentsMock).not.toHaveBeenCalled();
  });

  it('derives academic context from the live session when academicContext is absent', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        title: 'Fetched Reading Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 30,
        questionCount: 2,
        questions: [{ id: 'q1' }, { id: 'q2' }],
      }),
    });
    identifyUnsubmittedStudentsMock.mockReturnValue([
      {
        studentId: 'student-1',
        name: 'Student One',
        answers: {},
        isConnected: true,
        lastActivity: 10,
      },
    ]);

    const session = {
      testId: 'test-4',
      startTime: 4444,
      createdByUserId: 'teacher-canonical',
      linkedClassId: 'class-linked',
      courseId: 'course-1',
      moduleId: 'module-1',
      reviewReleaseState: 'locked-review',
      players: {
        'student-1': {
          name: 'Student One',
          answers: {},
          lastActivity: 10,
        },
      },
    } as any;

    const { result } = renderHook(() =>
      useMonitorControls('SESSION1001', session, null, null)
    );

    await act(async () => {
      await result.current.endFullSession(false, true);
    });

    expect(autoSubmitAllUnsubmittedStudentsMock).toHaveBeenCalledWith(
      'SESSION1001',
      'test-4',
      expect.arrayContaining([
        expect.objectContaining({ studentId: 'student-1' }),
      ]),
      [{ id: 'q1' }, { id: 'q2' }],
      {
        title: 'Fetched Reading Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 30,
      },
      'teacher-canonical',
      4444,
      {
        classId: 'class-linked',
        courseId: 'course-1',
        moduleId: 'module-1',
      }
    );
  });

  it('pauses listening audio through one canonical root transaction without defaulting section or speed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const session = {
      createdByUserId: 'teacher-1',
      masterAudioState: {
        schemaVersion: 2,
        revision: 4,
        section: 3,
        position: 127.5,
        isPlaying: true,
        speed: 1.25,
        timestamp: 1_699_999_998_000,
        updateKind: 'command',
        lastAction: 'resume',
        lastActionRevision: 4,
        lastActionTimestamp: 1_699_999_998_000,
        actionId: 'resume-4',
        writerUid: 'teacher-1',
        writerClientId: 'teacher-tab-1',
      },
    } as any;

    const { result } = renderHook(() =>
      useMonitorControls('LIVE123', session, { ...TEST_DATA, skill: 'Listening', audioSections: [{ number: 1 }, { number: 2 }, { number: 3 }] } as any, null)
    );

    await act(async () => {
      await result.current.pauseAllAudio();
    });

    const rootWrite = updateMock.mock.calls.find(([target]) => target?.path === undefined);
    expect(rootWrite).toBeTruthy();
    const updates = rootWrite?.[1];
    expect(updates[`game_sessions/LIVE123/masterAudioState`]).toEqual(expect.objectContaining({
      schemaVersion: 2,
      revision: 5,
      section: 3,
      position: 127.5,
      isPlaying: false,
      speed: 1.25,
      lastAction: 'pause',
      lastActionRevision: 5,
      writerUid: 'teacher-1',
      updateKind: 'command',
      writerClientId: 'teacher-monitor-LIVE123',
      timestamp: { '.sv': 'timestamp' },
      lastActionTimestamp: { '.sv': 'timestamp' },
    }));
    expect(updates[`game_sessions/LIVE123/audioCommand`]).toEqual(expect.objectContaining({
      schemaVersion: 2,
      canonicalRevision: 5,
      type: 'pause',
      sectionNumber: 3,
      position: 127.5,
      speed: 1.25,
      isPlaying: false,
      writerUid: 'teacher-1',
    }));
  });

  it('does not reset the session to waiting when end-session result persistence fails', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);

    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        title: 'Fetched Reading Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 30,
        questionCount: 2,
        questions: [{ id: 'q1' }, { id: 'q2' }],
      }),
    });
    identifyUnsubmittedStudentsMock.mockReturnValue([
      {
        studentId: 'student-1',
        name: 'Student One',
        answers: {},
        isConnected: true,
        lastActivity: 10,
      },
    ]);
    autoSubmitAllUnsubmittedStudentsMock.mockResolvedValue([
      {
        success: false,
        studentId: 'student-1',
        studentName: 'Student One',
        answeredCount: 0,
        error: 'Invalid result payload',
      },
    ]);

    const session = {
      testId: 'test-5',
      startTime: 5555,
      createdByUserId: 'teacher-canonical',
      reviewReleaseState: 'locked-review',
      players: {
        'student-1': {
          name: 'Student One',
          answers: {},
          lastActivity: 10,
        },
      },
    } as any;

    const { result } = renderHook(() =>
      useMonitorControls('SESSION1002', session, null, null)
    );

    await act(async () => {
      await result.current.endFullSession(false, true);
    });

    expect(updateMock).not.toHaveBeenCalledWith(
      { path: 'game_sessions/SESSION1002' },
      expect.objectContaining({
        status: 'waiting',
      })
    );
    expect(alertMock).toHaveBeenCalledWith(
      expect.stringContaining('Session was not closed')
    );

  });
});
