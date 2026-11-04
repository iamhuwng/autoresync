import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairScope as scope, validateRepairSnapshot } from '../repair-teacher-writing-homework-access.mjs';

function fixture() {
  const [resultId, studentId] = Object.entries(scope.results)[0];
  return {
    teacher: { role: 'teacher', email: scope.email }, studentRole: 'student', restore: false,
    ruleset: 'projects/temp-a1437/rulesets/observed',
    assignment: { id: scope.homeworkId, createdBy: scope.teacherId, materialId: scope.testId, materialSkill: 'writing',
      target: { type: 'students', studentIds: [studentId] }, contentRef: { contentKind: 'ielts_writing', contentId: scope.testId } },
    writing: { id: resultId, studentId, submittedAt: 1000, testMeta: { testId: scope.testId },
      context: { type: 'homework', homeworkId: scope.homeworkId, homeworkSubmissionId: 'attempt', assigningTeacherId: scope.teacherId } },
    attempt: { id: 'attempt', studentId, teacherId: scope.teacherId, homeworkId: scope.homeworkId,
      resultId, submittedAt: 1001, status: 'submitted' },
    result: { resultId, studentId, testId: scope.testId, testType: 'homework', testSkill: 'writing', isGuest: false,
      createdAt: 1000, submittedAt: 1000, writingData: { submissionId: resultId },
      context: { type: 'homework', source: { type: 'homework', id: scope.homeworkId, submissionId: resultId },
        assignment: { homeworkId: scope.homeworkId } } },
  };
}

test('prepares only the exact authorized owner and canonical result correspondence', () => {
  const snapshot = fixture();
  assert.deepEqual(validateRepairSnapshot(snapshot), {
    schemaVersion: 2, resultId: snapshot.result.resultId, studentId: snapshot.result.studentId,
    ownerTeacherId: scope.teacherId, contextType: 'homework', homeworkId: scope.homeworkId,
    homeworkSubmissionId: 'attempt', testId: scope.testId, writingSubmittedAt: 1000,
    homeworkSubmittedAt: 1001, submittedAt: 1000, sourceRulesetName: snapshot.ruleset,
    sourceRulesCutoff: '2026-10-02T02:22:09.862Z',
  });
});

test('rejects out-of-scope, mismatched, imported, unfinished and restore-active records', () => {
  for (const change of [
    s => { s.result.resultId = 'unapproved'; }, s => { s.teacher.email = 'foreign@example.test'; },
    s => { s.assignment.createdBy = 'foreign-teacher'; }, s => { s.assignment.target.studentIds = []; },
    s => { s.writing.context.externalImport = {}; }, s => { s.attempt.administrativeImport = {}; },
    s => { s.attempt.resultId = 'other'; }, s => { s.attempt.status = 'in_progress'; },
    s => { s.result.context.source.id = 'other-homework'; }, s => { s.result.studentId = 'victim'; },
    s => { s.result.classId = 'other-class'; }, s => { s.restore = true; },
  ]) {
    const snapshot = fixture();
    change(snapshot);
    assert.throws(() => validateRepairSnapshot(snapshot));
  }
});
