import { describe, expect, it } from 'vitest';
import fragment49C from '../../../cloudflare/src/upload-worker/book-rules/fragments/49C.json';

describe('Ticket 49C Book runtime recovery rules fragment', () => {
  it('keeps recovery staging inactive and denies broad runtime recovery access', () => {
    expect(fragment49C.owner).toMatchObject({ ticketId: '49C', issue: 123, serviceIdentity: 'book_recovery_service' });
    expect(fragment49C.status).toBe('inactive');
    expect(fragment49C.activation).toBe('deny-only-until-125-reconciliation');
    expect(fragment49C.operations.find((operation) => operation.path.endsWith('/recovery') && operation.rule === '.read')?.expression).toBe('false');
    expect(fragment49C.operations.find((operation) => operation.path.endsWith('/recovery') && operation.rule === '.write')?.expression).toBe('false');
  });

  it('binds every durable write to the operator recovery envelope and exact context', () => {
    const holdWrite = fragment49C.operations.find((operation) => operation.path.endsWith('/recovery/hold') && operation.rule === '.write');
    const projectionWrite = fragment49C.operations.find((operation) => operation.path.includes('/recovery/projections/') && operation.rule === '.write');
    for (const expression of [holdWrite?.expression, projectionWrite?.expression]) {
      expect(expression).toContain("auth.token.bkr.s == true");
      expect(expression).toContain("auth.token.bkr.si == 'book_recovery_service'");
      expect(expression).toContain("auth.token.bkr.o == newData.child('recoveryOperationId').val()");
      expect(expression).toContain("auth.token.bkr.r == $recipientId");
      expect(expression).toContain("auth.token.bkr.c == $contextId");
      expect(expression).toContain("newData.child('deliveryState').val() == 'unavailable'");
      expect(expression).toContain("newData.child('readDenied').val() == true");
      expect(expression).toContain("newData.child('activation').val() == 'held-for-reconciliation'");
      expect(expression).toContain("!newData.child('response').exists()");
      expect(expression).toContain("!newData.child('answerKey').exists()");
      expect(expression).toContain("!newData.child('providerAuthority').exists()");
    }
  });

  it('does not grant browser or ordinary-service projection reads', () => {
    const projectionRead = fragment49C.operations.find((operation) => operation.path.includes('/recovery/projections/') && operation.rule === '.read');
    expect(projectionRead?.expression).toContain("auth.token.bkr.si == 'book_recovery_service'");
    expect(projectionRead?.expression).not.toContain('auth.uid');
  });
});
