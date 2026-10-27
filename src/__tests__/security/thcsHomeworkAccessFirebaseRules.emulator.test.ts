import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

let environment: RulesTestEnvironment;

describe('private THCS homework access', () => {
  beforeAll(async () => {
    if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Database emulator required');
    environment = await initializeTestEnvironment({
      projectId: 'demo-thcs-homework-access',
      database: { rules: readFileSync(process.env.THCS_RULES_FILE || 'database.rules.json', 'utf8') },
    });
    await environment.withSecurityRulesDisabled(context => context.database().ref().update({
      'users/teacher-1': { role: 'teacher' },
      'users/student-1': { role: 'student' },
      'users/student-2': { role: 'student' },
      'tests/private-thcs': {
        testType: 'THCS-THPT', publishedAt: 1700000000000,
        ownerId: 'teacher-1', isPublic: false,
        sections: [{ questions: [{ correctAnswer: 'A' }] }],
      },
      'tests/private-ielts': { testType: 'IELTS', ownerId: 'teacher-1', isPublic: false },
      'homework_test_access/private-thcs/student-1/homework-1': true,
      'homework_test_access/private-ielts/student-1/homework-1': true,
      'homework_test_access/native-listening/student-1/homework-native': {
        contentKind: 'ielts_listening', versionId: 'version-1', teacherId: 'teacher-1',
        assetIds: ['asset-1'], createdAt: 1700000000000,
      },
    }));
  });

  afterAll(async () => { await environment?.cleanup(); });

  it('denies browser native grant create, change, delete, and ancestor-shaped writes', async () => {
    const path = 'homework_test_access/native-listening/student-1/homework-native';
    const forged = { contentKind: 'ielts_listening', versionId: 'forged-version', teacherId: 'teacher-1', assetIds: ['asset-1'], createdAt: 1700000000000 };
    for (const uid of ['teacher-1', 'student-1', 'student-2']) {
      const browser = environment.authenticatedContext(uid).database();
      await assertFails(browser.ref(path + '-forged').set(forged));
      await assertFails(browser.ref(path).set(forged));
      await assertFails(browser.ref(path).remove());
      await assertFails(browser.ref('homework_test_access/native-listening').update({ 'student-1/homework-native': forged }));
      await assertFails(browser.ref().update({ [path]: forged }));
    }
  });

  it('allows only assigned THCS reads and denies browser-created grants', async () => {
    const assigned = environment.authenticatedContext('student-1').database();
    const test = await assertSucceeds(assigned.ref('tests/private-thcs').once('value'));
    expect(test.val().sections[0].questions[0].correctAnswer).toBe('A');
    await assertFails(assigned.ref('tests/private-ielts').once('value'));
    await assertFails(environment.authenticatedContext('student-2').database().ref('tests/private-thcs').once('value'));
    await assertFails(environment.unauthenticatedContext().database().ref('tests/private-thcs').once('value'));
    for (const uid of ['teacher-1', 'student-1']) {
      const browser = environment.authenticatedContext(uid).database();
      await assertFails(browser.ref('homework_test_access/private-thcs/student-2/forged').set(true));
      await assertFails(browser.ref().update({ 'homework_test_access/private-thcs/student-2/forged': true }));
    }
    await environment.withSecurityRulesDisabled(context => context.database().ref('homework_test_access/private-thcs/student-1/homework-1').remove());
    await assertFails(assigned.ref('tests/private-thcs').once('value'));
  });
});
