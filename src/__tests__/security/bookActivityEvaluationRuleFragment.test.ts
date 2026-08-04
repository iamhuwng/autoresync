import { describe, expect, it } from 'vitest';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/36.json';

type Operation = {
  path: string;
  rule: '.read' | '.write' | '.validate' | '.indexOn';
  expression: string;
};

describe('Ticket #89 Book Activity evaluation rule fragment', () => {
  const operations = fragment.operations as Operation[];
  const scope = 'book_activity_evaluations/scopes/$recipientId/$contextId/$placementId/$activityId/$attemptId';

  it('keeps root and ancestor browser writes denied', () => {
    expect(fragment.owner).toMatchObject({
      ticketId: '36',
      issue: 89,
      serviceIdentity: 'book_activity_evaluation_service',
    });
    for (const path of ['book_activity_evaluations', 'book_activity_evaluations/scopes']) {
      expect(operations.find((entry) => entry.path === path && entry.rule === '.read')?.expression).toBe('false');
      expect(operations.find((entry) => entry.path === path && entry.rule === '.write')?.expression).toBe('false');
    }
  });

  it('requires exact service identity and path claims at the only writable scope', () => {
    const write = operations.find((entry) => entry.path === scope && entry.rule === '.write');
    expect(write?.expression).toContain('auth.token.book_activity_evaluation_service == true');
    for (const claim of ['recipientId', 'contextId', 'placementId', 'activityId', 'attemptId']) {
      expect(write?.expression).toContain(`book_activity_evaluation_${claim}`);
    }
    expect(write?.expression).toContain("!newData.child('visibility').exists()");
    expect(write?.expression).toContain("!newData.child('releasePolicy').exists()");
    expect(write?.expression).toContain("!newData.child('response').exists()");
  });

  it('makes history, correction, aggregate-score, and operation rows append-only', () => {
    for (const child of [
      'history/$revisionKey',
      'corrections/$revisionKey',
      'aggregateScores/$revisionKey',
      'operations/$operationId',
    ]) {
      const validate = operations.find((entry) =>
        entry.path === `${scope}/${child}` && entry.rule === '.validate');
      expect(validate?.expression).toContain('!data.exists()');
      expect(validate?.expression).toContain('newData.exists()');
    }
    const current = operations.find((entry) =>
      entry.path === `${scope}/current` && entry.rule === '.validate');
    expect(current?.expression).toContain("newData.child('revision').val() == data.child('revision').val() + 1");
  });

  it('allows only bounded key-ordered service history reads', () => {
    const read = operations.find((entry) =>
      entry.path === `${scope}/history` && entry.rule === '.read');
    expect(read?.expression).toContain('auth.token.book_activity_evaluation_service == true');
    for (const claim of ['recipientId', 'contextId', 'placementId', 'activityId', 'attemptId']) {
      expect(read?.expression).toContain(`book_activity_evaluation_${claim}`);
    }
    expect(read?.expression).toContain('query.orderByKey');
    expect(read?.expression).toContain('query.limitToLast <= 100');
    expect(operations.find((entry) =>
      entry.path === `${scope}/history` && entry.rule === '.indexOn')).toBeUndefined();
  });
});
