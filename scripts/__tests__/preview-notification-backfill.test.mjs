import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preview } from '../preview-notification-backfill.mjs';

test('intent-bearing homework requires matching canonical authority', () => {
  const intent = {
    schemaVersion: 1, eventId: 'homework-submitted:result-1', resultId: 'result-1',
    homeworkId: 'homework-1', studentId: 'student-1', teacherId: 'teacher-1', submittedAt: 1000,
  };
  const result = {
    resultId: intent.resultId, studentId: intent.studentId, submittedAt: intent.submittedAt,
    context: { type: 'homework' },
    visibility: { ownershipResolved: true, homeworkId: intent.homeworkId, visibilityOwnerTeacherId: intent.teacherId },
  };
  const data = {
    classIntents: [], legacyClassActions: [], notifications: {},
    homeworkSubmissions: [{ ...intent, status: 'submitted', notificationIntent: intent, notificationDelivery: { state: 'retry_due' } }],
    canonicalResults: { [intent.resultId]: result },
  };
  assert.equal(preview(data, 900, 1100).eligible.recipients, 1);
  result.visibility.visibilityOwnerTeacherId = 'teacher-2';
  const summary = preview(data, 900, 1100);
  assert.equal(summary.eligible.recipients, 0);
  assert.equal(summary.omitted.byReason.homework_intent_canonical_result_mismatch, 1);
});
