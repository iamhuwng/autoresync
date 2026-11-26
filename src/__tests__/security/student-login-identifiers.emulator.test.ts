// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;

describeEmulator('student login identifier RTDB security rules', () => {
  let environment: RulesTestEnvironment;
  const studentUid = 'student-login-owner';
  const otherStudentUid = 'student-login-other';
  const adminUid = 'student-login-admin';
  const studentId = 'STU-ABCD2345';
  const lookupHash = 'a'.repeat(64);

  beforeAll(async () => {
    const emulatorAddress = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    if (!emulatorAddress) throw new Error('Realtime Database emulator is required.');
    const [host, portText] = emulatorAddress.split(':');
    environment = await initializeTestEnvironment({
      projectId: 'demo-student-login-identifiers',
      database: {
        host,
        port: Number(portText),
        rules: readFileSync('database.rules.json', 'utf8'),
      },
    });
    await environment.clearDatabase();
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('users').set({
        [studentUid]: { uid: studentUid, role: 'student', status: 'active' },
        [otherStudentUid]: { uid: otherStudentUid, role: 'student', status: 'active' },
        [adminUid]: { uid: adminUid, role: 'super_admin', status: 'active' },
      });
      await context.database().ref(`student_login_ids/${lookupHash}`).set({ uid: studentUid });
      await context.database().ref(`student_identifiers/${studentUid}`).set({ uid: studentUid, studentId });
    });
  });

  afterAll(async () => {
    await environment?.cleanup();
  });

  it('keeps the hashed student-ID lookup index private and immutable to clients', async () => {
    const studentDb = environment.authenticatedContext(studentUid).database();
    const otherStudentDb = environment.authenticatedContext(otherStudentUid).database();
    const anonymousDb = environment.unauthenticatedContext().database();

    await assertFails(studentDb.ref(`student_login_ids/${lookupHash}`).get());
    await assertFails(otherStudentDb.ref('student_login_ids').get());
    await assertFails(anonymousDb.ref(`student_login_ids/${lookupHash}`).get());
    await assertFails(studentDb.ref(`student_login_ids/${lookupHash}`).set({ uid: otherStudentUid }));
    await assertFails(studentDb.ref('student_login_ids').set({ forged: { uid: studentUid } }));
  });

  it('allows a student to read their own ID but not another student\'s ID or write either private node', async () => {
    const studentDb = environment.authenticatedContext(studentUid).database();
    const otherStudentDb = environment.authenticatedContext(otherStudentUid).database();
    expect((await assertSucceeds(studentDb.ref(`student_identifiers/${studentUid}`).get())).val().studentId).toBe(studentId);
    await assertFails(otherStudentDb.ref(`student_identifiers/${studentUid}`).get());
    await assertFails(studentDb.ref(`student_identifiers/${studentUid}`).set({ studentId: 'forged-id' }));
  });

  it('does not allow a public registration to assign its own private student identifier', async () => {
    const newStudentDb = environment.authenticatedContext('new-student').database();
    await assertFails(newStudentDb.ref('users/new-student').set({
      uid: 'new-student',
      email: 'new@student.example',
      role: 'student',
      status: 'active',
      roles: ['teacher', 'super_admin'],
    }));
    await assertSucceeds(newStudentDb.ref('users/new-student').set({
      uid: 'new-student',
      email: 'new@student.example',
      role: 'student',
      status: 'active',
    }));
    await assertFails(newStudentDb.ref('student_identifiers/new-student').set({
      uid: 'new-student',
      studentId: 'forged-student-id',
    }));
  });

  it('does not allow a student to grant themselves a privileged primary or secondary role', async () => {
    const studentDb = environment.authenticatedContext(studentUid).database();

    await assertFails(studentDb.ref(`users/${studentUid}/role`).set('teacher'));
    await assertFails(studentDb.ref(`users/${studentUid}/role`).set('super_admin'));
    await assertFails(studentDb.ref(`users/${studentUid}/roles`).set(['teacher']));
    await assertFails(studentDb.ref(`users/${studentUid}/roles`).set(['super_admin']));
    await assertFails(studentDb.ref(`users/${studentUid}`).update({
      role: 'teacher',
      roles: ['teacher', 'super_admin'],
    }));

    await assertSucceeds(studentDb.ref(`users/${studentUid}/displayName`).set('Updated Student'));
    expect((await studentDb.ref(`users/${studentUid}`).get()).val()).toMatchObject({
      uid: studentUid,
      role: 'student',
      status: 'active',
    });
  });
});
