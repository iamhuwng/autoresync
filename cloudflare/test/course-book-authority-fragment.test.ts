import { describe, expect, it } from 'vitest';
import fragment from '../src/upload-worker/book-rules/fragments/42A.json';

describe('#102 Course Book authority rules fragment', () => {
  const operations = fragment.operations as readonly { path: string; rule: string; expression: string }[];
  const coupling = operations.find((operation) => operation.path === '' && operation.rule === '.validate');

  it('contributes a root post-write validator and denies writes during restore', () => {
    expect(coupling).toBeDefined();
    expect(fragment.owner.generatedRuleLocations).toContain('/.validate');
    expect(fragment.owner.generatedRuleLocations).not.toContain('/.write');
    expect(coupling?.expression).toContain("newData.child('system_flags').child('restore_in_progress').val() !== true");
  });

  it('couples enrollment and release transitions to their immutable receipts', () => {
    const expression = coupling?.expression ?? '';
    for (const required of [
      "auth.token.operation === 'enrollment-transition'",
      "auth.token.operation === 'release-transition'",
      "course_enrollments').child(auth.token.legacyEnrollmentId)",
      "course_book_authority').child('enrollments').child(auth.token.courseId).child(auth.token.studentId)",
      "course_book_authority').child('releases').child(auth.token.courseId).child(auth.token.moduleId).child(auth.token.studentId)",
      "course_book_authority').child('operations').child(auth.token.operationId)",
      "auth.token.actorUid",
      "auth.token.expectedReleaseRevision",
      "child('revision').val() === data",
    ]) expect(expression).toContain(required);
  });

  it('keeps leaf grants scoped to both operation types', () => {
    const leafWrites = operations.filter((operation) => operation.rule === '.write');
    expect(leafWrites.map((operation) => operation.path)).toEqual([
      'course_enrollments/$legacyEnrollmentId',
      'course_book_authority/enrollments/$courseId/$studentId',
      'course_book_authority/releases/$courseId/$moduleId/$studentId',
      'course_book_authority/operations/$operationId',
    ]);
    const releaseLeaf = leafWrites.find((operation) => operation.path.includes('/releases/'))?.expression ?? '';
    const receiptLeaf = leafWrites.find((operation) => operation.path.includes('/operations/'))?.expression ?? '';
    expect(releaseLeaf).toContain("auth.token.operation === 'release-transition'");
    expect(releaseLeaf).toContain('auth.token.expectedReleaseRevision');
    expect(receiptLeaf).toContain("auth.token.operation === 'release-transition'");
    expect(receiptLeaf).toContain("auth.token.operation === 'enrollment-transition'");
  });
});
