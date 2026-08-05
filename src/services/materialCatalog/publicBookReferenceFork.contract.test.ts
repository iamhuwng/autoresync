import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/44.json';
import { describe, expect, it } from 'vitest';
import { publicBookReferenceForkPaths } from './publicBookReferenceFork.paths';

describe('public Book reference/fork producer and rule contract', () => {
  it('keeps storage paths opaque and disjoint from provider/object authority', () => {
    expect(publicBookReferenceForkPaths.referenceRevision('reference-1', 1))
      .toBe('material_catalog/public_references/reference-1/revisions/1');
    expect(publicBookReferenceForkPaths.forkHistory('activity-1', 'fork-1'))
      .toBe('book_activity/fork_history/activity-1/fork-1');
    expect(JSON.stringify(publicBookReferenceForkPaths)).not.toMatch(/objectKey|provider|bucket|credential/i);
  });

  it('declares the #106 rule-fragment boundary without activating generated rules', () => {
    expect(fragment).toMatchObject({
      schemaVersion: 1,
      ticketId: '44',
      status: 'inactive',
      activation: 'deny-only-until-118-composition',
      owner: { issue: 106 },
    });
    const operations = fragment.operations as readonly {
      readonly path: string;
      readonly expression: string;
    }[];
    expect(operations.some((operation) => operation.path === 'material_catalog/public_references')).toBe(true);
    expect(operations.some((operation) => operation.path === 'book_activity/fork_history/$activityId')).toBe(true);
    expect(operations.every((operation) => !operation.path.includes('database.rules.json'))).toBe(true);
    const validationExpression = operations
      .map((operation) => operation.expression)
      .find((expression) => expression.includes('privateObjectKey'));
    expect(validationExpression).toContain("!newData.child('privateObjectKey').exists()");
    expect(validationExpression).toContain("!newData.child('answerKey').exists()");
    expect(validationExpression).toContain("!newData.child('teacherNotes').exists()");
  });
});
