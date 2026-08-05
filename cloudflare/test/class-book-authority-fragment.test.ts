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
    const operations = fragment.operations as readonly { path: string; expression: string; merge: string }[];
    expect(operations).toHaveLength(7);
    expect(operations.every((operation) => operation.expression.includes('restore_in_progress'))).toBe(true);
    expect(operations.every((operation) => operation.expression.includes('rollback'))).toBe(true);
    expect(operations.map((operation) => operation.path)).toEqual([
      'class_book_authority/copies/$classId/$copyId',
      'class_book_authority/placements/current/$contextId',
      'class_book_authority/placements/versions/$contextId/$placementRevision',
      'book_delivery/bindings/class-course/$bindingId',
      'class_book_authority/progress/$progressKey',
      'class_book_authority/results/$resultKey',
      'classes/$classId/book_locks/$classPlacementId',
    ]);
  });

  it('does not grant a browser-shaped write path', () => {
    const serialized = JSON.stringify(fragment);
    expect(serialized).toContain('classBookAuthority103');
    expect(serialized).toContain("context').child('surface').val() === 'class-course'");
    expect(serialized).not.toContain("child('materialId')");
  });
});
