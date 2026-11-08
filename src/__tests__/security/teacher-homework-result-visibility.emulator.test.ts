// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

let environment: RulesTestEnvironment;
const resultId = 'reading-v2-result-homework';
const result = {
  resultId,
  studentId: 'student',
  teacherId: 'teacher',
  testId: 'reading-passage-set:homework-1',
  testType: 'ielts-reading-v2',
  testSkill: 'reading',
  deliveryEngine: 'reading-v2',
  sessionCode: 'reading-v2',
  createdAt: 1000,
  submittedAt: 1000,
  context: {
    type: 'homework',
    source: { type: 'homework', id: 'homework-1' },
    assignment: { homeworkId: 'homework-1' },
  },
  visibility: {
    contextType: 'homework',
    sourceType: 'homework',
    sourceId: 'homework-1',
    homeworkId: 'homework-1',
    ownershipResolved: true,
    visibilityOwnerTeacherId: 'teacher',
  },
};

beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    throw Error('An isolated RTDB emulator namespace is required');
  }

  const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-teacher-homework-result-visibility',
    database: {
      host,
      port: Number(port),
      rules: readFileSync('database.rules.json', 'utf8'),
    },
  });

  await environment.withSecurityRulesDisabled(async (context) => {
    await context.database().ref().set({
      users: {
        student: { role: 'student' },
        teacher: { role: 'teacher' },
        foreign: { role: 'teacher' },
      },
      test_results: { [resultId]: result },
      teacher_result_keys: { teacher: { [resultId]: true } },
    });
  });
});

afterAll(async () => {
  await environment?.clearDatabase();
  await environment?.cleanup();
});

it('allows the assigning teacher to read resolved homework results for non-Writing tests', async () => {
  const teacher = environment.authenticatedContext('teacher').database();
  const foreign = environment.authenticatedContext('foreign').database();

  expect((await assertSucceeds(teacher.ref(`test_results/${resultId}`).get())).val()).toEqual(result);
  await assertFails(foreign.ref(`test_results/${resultId}`).get());
});

it('keeps unresolved homework results private', async () => {
  const unresolvedId = `${resultId}-unresolved`;
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.database().ref(`test_results/${unresolvedId}`).set({
      ...result,
      resultId: unresolvedId,
      visibility: { ...result.visibility, ownershipResolved: false, visibilityOwnerTeacherId: null },
    });
  });

  await assertFails(
    environment.authenticatedContext('teacher').database().ref(`test_results/${unresolvedId}`).get(),
  );
});
