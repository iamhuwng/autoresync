// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

let environment: RulesTestEnvironment;
const resultId = '-WritingHomeworkProof';
const result = {
  resultId, studentId: 'student', testId: 'writing-test', testType: 'homework', testSkill: 'writing',
  isGuest: false, createdAt: 1000, submittedAt: 1000, writingData: { submissionId: resultId },
  context: { type: 'homework', source: { type: 'homework', id: 'homework', submissionId: resultId },
    assignment: { homeworkId: 'homework' } },
  visibility: { ownershipResolved: false, contextType: 'homework', sourceType: 'homework', sourceId: 'homework', homeworkId: 'homework' },
};
const authority = {
  schemaVersion: 2, resultId, studentId: 'student', ownerTeacherId: 'teacher', contextType: 'homework',
  homeworkId: 'homework', homeworkSubmissionId: 'attempt', testId: 'writing-test',
  writingSubmittedAt: 1000, homeworkSubmittedAt: 1001, submittedAt: 1000,
  sourceRulesetName: 'projects/temp-a1437/rulesets/observed', sourceRulesCutoff: '2026-10-02T02:22:09.862Z',
};

beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw Error('An isolated RTDB emulator namespace is required');
  const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({ projectId: 'demo-writing-homework-access',
    database: { host, port: Number(port), rules: readFileSync('database.rules.json', 'utf8') } });
  await environment.withSecurityRulesDisabled(async context => {
    await context.database().ref().set({ users: { student: { role: 'student' }, teacher: { role: 'teacher' }, foreign: { role: 'teacher' } },
      test_results: { [resultId]: result } });
  });
});

afterAll(async () => { await environment?.clearDatabase(); await environment?.cleanup(); });

it('denies the reported read before a protected receipt, permits its owner after issuance, and rejects tampering', async () => {
  const teacher = environment.authenticatedContext('teacher').database();
  const foreign = environment.authenticatedContext('foreign').database();
  await assertFails(teacher.ref(`test_results/${resultId}`).get());
  await assertFails(teacher.ref(`result_notification_authority/${resultId}`).set(authority));
  await assertFails(teacher.ref().update({ [`result_notification_authority/${resultId}`]: authority }));
  await environment.withSecurityRulesDisabled(async context => {
    await context.database().ref(`result_notification_authority/${resultId}`).set(authority);
  });
  expect((await assertSucceeds(teacher.ref(`test_results/${resultId}`).get())).val()).toEqual(result);
  await assertFails(foreign.ref(`test_results/${resultId}`).get());
  await assertFails(environment.unauthenticatedContext().database().ref(`test_results/${resultId}`).get());
  await assertSucceeds(teacher.ref(`test_results/${resultId}`).update({ visibility: { ...result.visibility,
    ownershipResolved: true, visibilityOwnerTeacherId: 'teacher', ownerResolutionSource: 'homework.createdBy' } }));
  await assertFails(teacher.ref(`test_results/${resultId}`).update({ studentId: 'victim' }));
  await assertFails(teacher.ref(`result_notification_authority/${resultId}`).remove());
  await environment.withSecurityRulesDisabled(async context => {
    await context.database().ref(`test_results/${resultId}/testId`).set('other-test');
  });
  await assertFails(teacher.ref(`test_results/${resultId}`).get());
});
