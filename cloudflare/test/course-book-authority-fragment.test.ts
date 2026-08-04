import { describe, expect, it } from 'vitest';
import fragment from '../src/upload-worker/book-rules/fragments/42A.json';

describe('#102 Course Book authority rules fragment', () => {
  const operations = fragment.operations as readonly { path: string; rule: string; expression: string }[];
  const coupling = operations.find((operation) => operation.path === '' && operation.rule === '.validate');

  it('contributes a root post-write validator, never a root write grant', () => {
    expect(coupling).toBeDefined();
    expect(fragment.owner.generatedRuleLocations).toContain('/.validate');
    expect(fragment.owner.generatedRuleLocations).not.toContain('/.write');
    expect(coupling?.expression).toContain("newData.child('system_flags').child('restore_in_progress').val() !== true");
  });

  it('requires legacy enrollment, exact authority projection, and immutable receipt to move together', () => {
    const expression = coupling?.expression ?? '';
    for (const required of [
      "course_enrollments').child(auth.token.legacyEnrollmentId)",
      "course_book_authority').child('enrollments').child(auth.token.courseId).child(auth.token.studentId)",
      "course_book_authority').child('operations').child(auth.token.operationId)",
      "auth.token.operation === 'enrollment-transition'",
      "auth.token.legacyEnrollmentId",
      "auth.token.courseId",
      "auth.token.studentId",
      "auth.token.operationId",
      "child('revision').val() === data",
    ]) expect(expression).toContain(required);
  });

  it('leaves unrelated writes compatible while ancestor writes remain outside leaf grants', () => {
    const leafWrites = operations.filter((operation) => operation.rule === '.write');
    expect(leafWrites.map((operation) => operation.path)).toEqual([
      'course_enrollments/$legacyEnrollmentId',
      'course_book_authority/enrollments/$courseId/$studentId',
      'course_book_authority/operations/$operationId',
    ]);
    expect(coupling?.expression).toContain('=== data.child');
  });
});
