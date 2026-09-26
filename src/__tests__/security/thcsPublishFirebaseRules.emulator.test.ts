import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { Database } from 'firebase/database';
import type { THCSQuestion, THCSTest } from '../../types/thcs-test.types';
import { publishTestUpdate, saveThcsTestToFirebase, updateThcsTestInFirebase } from '../../services/thcsTestStorage';

const client = vi.hoisted(() => ({ database: undefined as Database | undefined }));
vi.mock('../../services/firebase', () => ({ get database() { return client.database; } }));

let environment: RulesTestEnvironment;

describe('THCS publish database authorization', () => {
  beforeEach(async () => {
    if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Database emulator required');
    environment ??= await initializeTestEnvironment({
      projectId: 'demo-thcs-publish-rules',
      database: { rules: readFileSync(process.env.THCS_RULES_FILE || 'database.rules.json', 'utf8') },
    });
    await environment.clearDatabase();
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref('users').set({
        'teacher-1': { role: 'teacher' },
        'teacher-2': { role: 'teacher' },
        'student-1': { role: 'student' },
      });
    });
  });

  afterAll(async () => { await environment?.cleanup(); });

  it.each([false, true])('publishes a new THCS test with isPublic=%s through the real storage service', async isPublic => {
    const database = environment.authenticatedContext('teacher-1').database();
    client.database = database as unknown as Database;
    const test: THCSTest = {
      id: 'thcs-new', testType: 'THCS-THPT',
      metadata: { title: 'Publish regression', duration: 45, gradeLevel: 9, examType: 'entrance' },
      sections: [{
        id: 'section-1', name: 'Grammar', order: 0, totalPoints: 1, pointMode: 'auto',
        instructionText: 'Choose the answer', isCustomInstruction: false, layout: 'single-column',
        questions: [{
          id: 'question-1', questionNumber: 1, type: 'mcq-grammar', questionText: 'QA question',
          options: ['One', 'Two', 'Three', 'Four'], correctAnswer: 'A',
          blankCount: undefined, blankAnswers: undefined,
        } as THCSQuestion],
      }], questionCount: 1, totalPoints: 1,
      createdBy: 'teacher-1', ownerId: 'teacher-1', isPublic, isComplete: true,
      createdAt: 1700000000000, updatedAt: 1700000000000,
    };
    expect(await saveThcsTestToFirebase(test)).toEqual({ success: true, testId: test.id });
    expect((await database.ref(`tests/${test.id}`).once('value')).val().publishedAt).toBeTypeOf('number');
    expect((await database.ref(`tests/${test.id}/sections/0/questions/0`).once('value')).val()).not.toHaveProperty('blankCount');
    expect((await database.ref(`material_catalog/material_summary_indexes/v1/by_owner/teacher-1/${test.id}`).once('value')).val().producerId).toBe('thcs-thpt');
    expect(await saveThcsTestToFirebase({ ...test, metadata: { ...test.metadata, title: 'Republished' } })).toEqual({ success: true, testId: test.id });
    expect(await updateThcsTestInFirebase(test.id, { sections: test.sections })).toEqual({ success: true });
    await publishTestUpdate(test.id, { ...test, metadata: { ...test.metadata, title: 'Direct republish' } }, 'teacher-1');
    expect((await database.ref(`tests/${test.id}/metadata/title`).once('value')).val()).toBe('Direct republish');
  });

  it('keeps private existing tests and absent-row reads protected from other roles', async () => {
    await environment.withSecurityRulesDisabled(context => context.database().ref('tests/private-test').set({
      ownerId: 'teacher-1', createdBy: 'teacher-1', isPublic: false,
    }));
    const otherTeacher = environment.authenticatedContext('teacher-2').database();
    await assertFails(otherTeacher.ref('tests/private-test').once('value'));
    await assertFails(otherTeacher.ref().update({ 'tests/private-test/ownerId': 'teacher-2' }));
    await assertFails(environment.authenticatedContext('student-1').database().ref('tests/missing').once('value'));
    await assertFails(environment.unauthenticatedContext().database().ref('tests/missing').once('value'));
    await assertSucceeds(environment.authenticatedContext('teacher-1').database().ref('tests/private-test').once('value'));
  });
});
