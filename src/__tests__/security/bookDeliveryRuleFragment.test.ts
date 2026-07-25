import { describe, expect, it } from 'vitest';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/08B.json';

describe('Ticket 08B Book Delivery rules fragment', () => {
  it('keeps generated-rule ownership with 08B and denies ancestor-shaped access', () => {
    expect(fragment.owner).toMatchObject({ ticketId: '08B', issue: 31 });
    const roots = fragment.operations.filter((operation) => (
      operation.path === 'book_delivery'
      || operation.path === 'book_delivery/current'
      || operation.path === 'book_delivery/indexes'
    ));
    expect(roots.length).toBeGreaterThanOrEqual(6);
    expect(roots.every((operation) => operation.expression === 'false')).toBe(true);
  });

  it('allows only scoped trusted service writes and recipient-specific reads', () => {
    const records = fragment.operations.find((operation) => operation.path === 'book_delivery/records/$bindingId' && operation.rule === '.write');
    const recordReads = fragment.operations.find((operation) => operation.path === 'book_delivery/records/$bindingId' && operation.rule === '.read');
    const currentWrites = fragment.operations.find((operation) => operation.path === 'book_delivery/current/$recipientId/$contextId' && operation.rule === '.write');
    expect(records?.expression).toContain('book_delivery_service');
    expect(records?.expression).toContain('book_delivery_ownerId');
    expect(recordReads?.expression).toContain('recipientId');
    expect(currentWrites?.expression).toContain('book_delivery_service');
  });

  it('does not grant browser writes to operations or indexes', () => {
    const operationsWrite = fragment.operations.find((operation) => operation.path === 'book_delivery/operations/$operationId' && operation.rule === '.write');
    const indexesWrite = fragment.operations.find((operation) => operation.path === 'book_delivery/indexes' && operation.rule === '.write');
    expect(operationsWrite?.expression).toContain('book_delivery_service');
    expect(indexesWrite?.expression).toBe('false');
  });
});
