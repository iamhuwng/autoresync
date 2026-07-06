import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;
const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
let testEnv: RulesTestEnvironment;

const restrictedLiveSession = {
  sessionCode: 'LIVE123',
  status: 'in-progress',
  expiresAt: Date.now() + 60 * 60 * 1000,
  testId: 'listening-test-1',
  createdAt: 1_700_000_000_000,
  createdByUserId: 'teacher-1',
  linkedClassId: 'class-1',
  settings: {
    restrictToClassMembers: true,
    allowLateJoin: true,
  },
  players: {
    'student-1': {
      joinedAt: 1_700_000_000_001,
      isConnected: true,
    },
  },
  students: {
    'student-3': {
      joinedAt: 1_700_000_000_002,
      isConnected: true,
    },
  },
};

const openLiveSession = {
  sessionCode: 'OPEN123',
  status: 'waiting',
  expiresAt: Date.now() + 60 * 60 * 1000,
  testId: 'listening-test-2',
  createdAt: 1_700_000_010_000,
  createdBy: 'teacher-1',
  settings: {
    restrictToClassMembers: false,
    allowLateJoin: true,
  },
  players: {},
};

describe('PRD-0055 live game-session RTDB rules', () => {
  it('removes blanket authenticated access from game_sessions', () => {
    const rules = JSON.parse(DATABASE_RULES) as { rules: Record<string, any> };
    const gameSessions = rules.rules.game_sessions as Record<string, any> | undefined;

    expect(gameSessions).toBeDefined();
    expect(gameSessions?.['.read']).not.toBe('auth != null');
    expect(gameSessions?.['.write']).toBeUndefined();
    expect(gameSessions?.$sessionCode?.['.read']).toContain("data.child('players').child(auth.uid).exists()");
    expect(gameSessions?.$sessionCode?.['.read']).toContain("data.child('createdByUserId').val() === auth.uid");
    expect(gameSessions?.$sessionCode?.players?.$playerId?.['.write']).toContain('$playerId === auth.uid');
    expect(gameSessions?.$sessionCode?.players?.$playerId?.['.write']).toContain('expiresAt');
    expect(gameSessions?.$sessionCode?.players?.$playerId?.['.write']).toContain('now');
    expect(gameSessions?.['.read']).toContain('query.limitToFirst <= 26');
    expect(gameSessions?.['.indexOn']).toEqual([
      'status',
      'teacherId',
      'createdByUserId',
      'createdBy',
      'createdAt',
    ]);
    expect(rules.rules.owner_session_index?.$ownerId?.['.indexOn']).toEqual(['expiresAt']);
    expect(rules.rules.owner_session_index?.$ownerId?.['.read']).toContain('auth.uid === $ownerId');
    expect(rules.rules.owner_session_migrations?.$ownerId?.['.write']).toContain('auth.uid === $ownerId');
  });

  describeEmulator('emulator enforcement', () => {
    beforeEach(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0055-live-sessions',
        database: { rules: DATABASE_RULES },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('users/teacher-1/role').set('teacher');
        await db.ref('users/teacher-2/role').set('teacher');
        await db.ref('users/student-1/role').set('student');
        await db.ref('users/student-2/role').set('student');
        await db.ref('users/student-3/role').set('student');
        await db.ref('users/student-4/role').set('student');
        await db.ref('users/admin-1/role').set('super_admin');
        await db.ref('classes/class-1').set({
          createdBy: 'teacher-1',
          students: {
            'student-1': true,
            'student-3': true,
            'student-4': true,
          },
        });
        await db.ref('game_sessions/LIVE123').set(restrictedLiveSession);
        await db.ref('game_sessions/OPEN123').set(openLiveSession);
      });
    });

    it('allows only the owner, rostered live participants, class members, and super-admin to read a restricted session', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const player = testEnv.authenticatedContext('student-1').database();
      const studentNodeParticipant = testEnv.authenticatedContext('student-3').database();
      const classMember = testEnv.authenticatedContext('student-4').database();
      const unrelatedStudent = testEnv.authenticatedContext('student-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();
      const guest = testEnv.unauthenticatedContext().database();

      await assertSucceeds(owner.ref('game_sessions/LIVE123').once('value'));
      await assertSucceeds(player.ref('game_sessions/LIVE123').once('value'));
      await assertSucceeds(studentNodeParticipant.ref('game_sessions/LIVE123').once('value'));
      await assertSucceeds(classMember.ref('game_sessions/LIVE123/testId').once('value'));
      await assertSucceeds(admin.ref('game_sessions/LIVE123').once('value'));
      await assertFails(otherTeacher.ref('game_sessions/LIVE123').once('value'));
      await assertFails(unrelatedStudent.ref('game_sessions/LIVE123').once('value'));
      await assertFails(guest.ref('game_sessions/LIVE123').once('value'));
    });

    it('allows owner-scoped list queries but denies unbounded and cross-owner listing', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertSucceeds(
        owner.ref('game_sessions').orderByChild('createdByUserId').equalTo('teacher-1').limitToFirst(26).once('value'),
      );
      await assertSucceeds(
        owner.ref('game_sessions').orderByChild('createdBy').equalTo('teacher-1').limitToFirst(26).once('value'),
      );
      await assertSucceeds(
        owner.ref('game_sessions').orderByChild('teacherId').equalTo('teacher-1').limitToFirst(26).once('value'),
      );
      await assertSucceeds(admin.ref('game_sessions').once('value'));
      await assertFails(owner.ref('game_sessions').once('value'));
      await assertFails(
        owner.ref('game_sessions').orderByChild('createdByUserId').equalTo('teacher-2').limitToFirst(26).once('value'),
      );
      await assertFails(
        otherTeacher.ref('game_sessions').orderByChild('createdByUserId').equalTo('teacher-1').limitToFirst(26).once('value'),
      );
      await assertFails(
        otherTeacher.ref('game_sessions').orderByChild('teacherId').equalTo('teacher-1').limitToFirst(26).once('value'),
      );
      await assertFails(
        owner.ref('game_sessions').orderByChild('createdByUserId').equalTo('teacher-1').once('value'),
      );
      await assertSucceeds(
        owner.ref('game_sessions')
          .orderByChild('createdByUserId')
          .startAt('teacher-1')
          .endAt('teacher-1')
          .limitToFirst(26)
          .once('value'),
      );
      await assertFails(
        owner.ref('game_sessions')
          .orderByChild('createdByUserId')
          .startAt('teacher-1')
          .endAt('teacher-1')
          .limitToFirst(27)
          .once('value'),
      );
    });

    it('allows owner session writes while denying cross-owner root mutation', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const player = testEnv.authenticatedContext('student-1').database();

      await assertSucceeds(owner.ref('game_sessions/NEW123').set({
        ...restrictedLiveSession,
        sessionCode: 'NEW123',
        players: {},
        students: {},
      }));
      await assertSucceeds(owner.ref('game_sessions/LIVE123').update({
        status: 'paused',
      }));
      await assertFails(otherTeacher.ref('game_sessions/LIVE123').update({
        status: 'completed',
      }));
      await assertFails(player.ref('game_sessions/LIVE123').update({
        status: 'completed',
      }));
    });

    it('allows only eligible self participant writes for private sessions while preserving open-code joins', async () => {
      const classMember = testEnv.authenticatedContext('student-4').database();
      const unrelatedStudent = testEnv.authenticatedContext('student-2').database();
      const owner = testEnv.authenticatedContext('teacher-1').database();

      await assertSucceeds(classMember.ref('game_sessions/LIVE123/players/student-4').set({
        joinedAt: 1_700_000_000_003,
        isConnected: true,
      }));
      await assertFails(unrelatedStudent.ref('game_sessions/LIVE123/players/student-2').set({
        joinedAt: 1_700_000_000_004,
        isConnected: true,
      }));
      await assertFails(unrelatedStudent.ref('game_sessions/LIVE123/players/student-1').update({
        isConnected: false,
      }));
      await assertFails(unrelatedStudent.ref('game_sessions/BOGUS/players/student-2').set({
        joinedAt: 1_700_000_000_005,
        isConnected: true,
      }));
      await assertSucceeds(unrelatedStudent.ref('game_sessions/OPEN123/players/student-2').set({
        joinedAt: 1_700_000_000_006,
        isConnected: true,
      }));
      await assertSucceeds(owner.ref('game_sessions/LIVE123/players/student-2').set({
        joinedAt: 1_700_000_000_007,
        isConnected: true,
      }));
    });

    it('uses server time to block participant writes after expiry while preserving owner control', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const player = testEnv.authenticatedContext('student-1').database();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('game_sessions/LIVE123/expiresAt').set(Date.now() - 1_000);
      });

      await assertFails(player.ref('game_sessions/LIVE123/players/student-1').update({
        isConnected: false,
      }));
      await assertFails(player.ref('game_sessions/LIVE123/students/student-1').set({
        joinedAt: Date.now(),
      }));
      await assertSucceeds(owner.ref('game_sessions/LIVE123').update({
        expiresAt: Date.now() + 60 * 60 * 1000,
      }));
    });

    it('fails closed for missing or malformed expiry and at the exact expiry boundary', async () => {
      const player = testEnv.authenticatedContext('student-1').database();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('game_sessions/LIVE123/expiresAt').remove();
      });
      await assertFails(player.ref('game_sessions/LIVE123/players/student-1').update({
        isConnected: false,
      }));

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('game_sessions/LIVE123/expiresAt').set('not-a-number');
      });
      await assertFails(player.ref('game_sessions/LIVE123/players/student-1').update({
        isConnected: false,
      }));

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.database().ref('game_sessions/LIVE123/expiresAt').set(Date.now());
      });
      await assertFails(player.ref('game_sessions/LIVE123/players/student-1').update({
        isConnected: false,
      }));
    });

    it('keeps owner index discovery bounded, owner-only, and independent from authorization', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const expiresAt = Date.now() + 60 * 60 * 1000;
      const record = {
        sessionCode: 'LIVE123',
        ownerId: 'teacher-1',
        expiresAt,
        status: 'in-progress',
        sourceUpdatedAt: Date.now(),
      };

      await assertSucceeds(owner.ref('owner_session_index/teacher-1/LIVE123').set(record));
      await assertSucceeds(
        owner.ref('owner_session_index/teacher-1')
          .orderByChild('expiresAt')
          .startAt(Date.now())
          .limitToFirst(25)
          .once('value'),
      );
      await assertFails(otherTeacher.ref('owner_session_index/teacher-1').once('value'));
      await assertFails(owner.ref('owner_session_index/teacher-2/LIVE123').set({
        ...record,
        ownerId: 'teacher-2',
      }));
      await assertFails(owner.ref('owner_session_index/teacher-1/TAMPERED').set({
        ...record,
        sessionCode: 'TAMPERED',
        ownerId: 'teacher-2',
      }));
      await assertFails(owner.ref('owner_session_index/teacher-1/MALFORMED').set({
        sessionCode: 'MALFORMED',
        ownerId: 'teacher-1',
        status: 'waiting',
        sourceUpdatedAt: Date.now(),
      }));
    });

    it('allows one atomic canonical/index create and terminal removal by the owner', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const now = Date.now();
      const expiresAt = now + 60 * 60 * 1000;

      await assertSucceeds(owner.ref().update({
        'game_sessions/ATOMIC1': {
          sessionCode: 'ATOMIC1',
          createdByUserId: 'teacher-1',
          createdAt: now,
          updatedAt: now,
          expiresAt,
          status: 'waiting',
          mode: 'test',
        },
        'owner_session_index/teacher-1/ATOMIC1': {
          sessionCode: 'ATOMIC1',
          ownerId: 'teacher-1',
          createdAt: now,
          sourceUpdatedAt: now,
          expiresAt,
          status: 'waiting',
          mode: 'test',
        },
      }));
      await assertSucceeds(owner.ref().update({
        'game_sessions/ATOMIC1/status': 'completed',
        'game_sessions/ATOMIC1/updatedAt': Date.now(),
        'owner_session_index/teacher-1/ATOMIC1': null,
      }));
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
