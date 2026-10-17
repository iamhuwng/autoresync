import { describe, expect, it } from 'vitest';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/49D.json';

describe('#124 49D held Book update recovery rules', () => {
  it('is inactive deny-only with exact service-owned recovery locations', () => {
    expect(fragment).toMatchObject({
      ticketId: '49D',
      issue: 124,
      status: 'inactive',
      activation: 'deny-only-until-125-reconciliation',
      owner: { serviceIdentity: 'book_recovery_service' },
    });
    expect(fragment.owner.generatedRuleLocations).toEqual(
      fragment.operations.map((operation) => `${operation.path}/${operation.rule}`),
    );
    expect(fragment.operations.filter((operation) => operation.expression === 'false').length).toBeGreaterThan(0);
  });

  it('denies browser reads, writes, sensitive fields, and unscoped notification recipients', () => {
    const expressions = fragment.operations.map((operation) => operation.expression).join('\n');
    expect(expressions).toContain("auth.token.bkr.si == 'book_recovery_service'");
    expect(expressions).toContain('auth.token.bkr.o == newData.child(\'recoveryOperationId\').val()');
    expect(expressions).toContain('newData.child(\'readDenied\').val() == true');
    for (const field of ['answer', 'pdfBytes', 'providerObject', 'credentials', 'message', 'title', 'link']) {
      expect(expressions).toContain(`!newData.child('${field}').exists()`);
    }
    const notificationWrite = fragment.operations.find((operation) => (
      operation.path.includes('/notifications/$recipientId/') && operation.rule === '.write'
    ));
    expect(notificationWrite?.expression).toContain("newData.child('recipientId').val() == $recipientId");
  });
});
