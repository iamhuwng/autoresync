import { describe, expect, it } from 'vitest';
import fragment from '../src/upload-worker/book-rules/fragments/42B.json';

describe('#103 Class Book authority rules fragment', () => {
  it('is present but cannot activate itself', () => {
    expect(fragment.ticketId).toBe('42B');
    expect(fragment.owner.issue).toBe(103);
    expect(fragment.status).toBe('inactive');
    expect(fragment.activation).toBe('deny-only-until-118-composition');
  });

  it('keeps every write exact, scoped, and restore/rollback deny-only', () => {
    const operations = fragment.operations as readonly { path: string; rule: string; expression: string; merge: string }[];
    expect(operations).toHaveLength(29);
    expect(operations.slice(0, 7).every((operation) => operation.expression.includes('restore_in_progress'))).toBe(true);
    expect(operations.slice(0, 7).every((operation) => operation.expression.includes('rollback'))).toBe(true);
    expect(operations.slice(0, 7).map((operation) => operation.path)).toEqual([
      'class_book_authority/copies/$classId/$copyId',
      'class_book_authority/placements/current/$contextId',
      'class_book_authority/placements/versions/$contextId/$placementRevision',
      'book_delivery/bindings/class-course/$bindingId',
      'class_book_authority/progress/$progressKey',
      'class_book_authority/results/$resultKey',
      'classes/$classId/book_locks/$classPlacementId',
    ]);
    expect(operations.slice(0, 7).every((operation) => operation.rule === '.write')).toBe(true);
    expect(operations[7]).toMatchObject({
      path: 'class_book_authority/operations/$operationId',
      rule: '.write',
      merge: 'replace-exact-deny',
    });
    expect(operations[8]).toMatchObject({
      path: '',
      rule: '.validate',
      merge: 'root-post-write-coupling',
    });
    expect(operations.slice(9).every((operation) => operation.rule === '.validate' && operation.merge === 'replace-exact-deny')).toBe(true);
    expect(operations.slice(9).every((operation) => operation.path.startsWith('class_book_authority/') || operation.path.startsWith('classes/'))).toBe(true);
  });

  it('does not grant a browser-shaped write path', () => {
    const serialized = JSON.stringify(fragment);
    expect(serialized).toContain('classBookAuthority103');
    expect(serialized).toContain("context').child('surface').val() === 'class-course'");
    expect(serialized).not.toContain("child('materialId')");
  });
});
