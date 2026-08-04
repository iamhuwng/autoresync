import { describe, expect, it } from 'vitest';
import fragment28A from '../../../cloudflare/src/upload-worker/book-rules/fragments/28A.json';

describe('Ticket 28A Book Runtime rules fragment', () => {
  it('owns runtime canonical nodes and denies broad browser access', () => {
    expect(fragment28A.owner).toMatchObject({ ticketId: '28A', issue: 74 });
    expect(fragment28A.owner.generatedRuleLocations).toEqual([
      'book_runtime/.read',
      'book_runtime/.write',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/.read',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/.write',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/.read',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/draft/.read',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/draft/.write',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/attempts/$attemptId/.read',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/attempts/$attemptId/.write',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/results/$resultId/.read',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/results/$resultId/.write',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/completions/$completionId/.read',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/completions/$completionId/.write',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/operations/$operationId/.read',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/operations/$operationId/.write',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/indexes/$attemptId/.read',
      'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/indexes/$attemptId/.write',
    ]);
    expect(fragment28A.operations.find((operation) =>
      operation.path === 'book_runtime' && operation.rule === '.write')?.expression).toBe('false');
    expect(fragment28A.operations.find((operation) =>
      operation.path === 'book_runtime/scopes' && operation.rule === '.write')?.expression).toBe('false');
    expect(fragment28A.operations.find((operation) =>
      operation.path === 'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId'
      && operation.rule === '.write')?.expression).toContain('auth.token.book_runtime_service == true');
  });

  it('allows only scoped runtime service identity writes and blocks sensitive payload fields', () => {
    const draftWrite = fragment28A.operations.find((operation) =>
      operation.path === 'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/draft'
      && operation.rule === '.write');
    const attemptWrite = fragment28A.operations.find((operation) =>
      operation.path === 'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/attempts/$attemptId'
      && operation.rule === '.write');
    const operationWrite = fragment28A.operations.find((operation) =>
      operation.path === 'book_runtime/scopes/$recipientId/$contextId/$placementId/$interactionId/operations/$operationId'
      && operation.rule === '.write');

    expect(draftWrite?.expression).toContain('auth.token.book_runtime_service == true');
    expect(draftWrite?.expression).toContain("newData.child('recipientId').val() == $recipientId");
    expect(draftWrite?.expression).toContain("!newData.child('answerKey').exists()");
    expect(draftWrite?.expression).toContain("!newData.child('pdfBytes').exists()");
    expect(draftWrite?.expression).toContain("!newData.child('providerAuthority').exists()");
    expect(attemptWrite?.expression).toContain('!data.exists()');
    expect(attemptWrite?.expression).toContain('auth.token.book_runtime_recipientId');
    expect(operationWrite?.expression).toContain("newData.child('operationId').val() == $operationId");
    expect(operationWrite?.expression).toContain("!newData.child('response').exists()");
  });
});
