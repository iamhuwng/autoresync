import { describe, expect, it } from 'vitest';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/13A.json';

describe('Book Assembly RTDB rule fragment', () => {
  it('denies browser reads/writes at root and book ancestor paths', () => {
    expect(fragment.owner).toMatchObject({ ticketId: '13A', issue: 55 });
    expect(fragment.owner.generatedRuleLocations).toEqual([
      'book_assembly/.read',
      'book_assembly/.write',
      'book_assembly/books/$bookId/.read',
      'book_assembly/books/$bookId/.write',
      'book_assembly/books/$bookId/units/$unitKey/.read',
      'book_assembly/books/$bookId/units/$unitKey/.write',
    ]);
    expect(fragment.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'book_assembly', rule: '.read', expression: 'false', merge: 'replace-exact-deny' }),
      expect.objectContaining({ path: 'book_assembly', rule: '.write', expression: 'false', merge: 'replace-exact-deny' }),
      expect.objectContaining({ path: 'book_assembly/books/$bookId', rule: '.read', expression: 'false', merge: 'replace-exact-deny' }),
      expect.objectContaining({ path: 'book_assembly/books/$bookId', rule: '.write', expression: 'false', merge: 'replace-exact-deny' }),
    ]));
  });

  it('allows only scoped trusted service access', () => {
    expect(fragment.owner.serviceIdentity).toBe('book_assembly_service');
    expect(fragment.owner.leastPrivilegePaths).toEqual([
      'users/$ownerId',
      'book_assembly/books/$bookId/units/$unitKey',
    ]);
    const scoped = fragment.operations.filter((operation) => (
      operation.path === 'book_assembly/books/$bookId/units/$unitKey'
    ));
    expect(scoped).toHaveLength(2);
    expect(scoped.every((operation) => (
      operation.expression.includes('auth != null')
      && operation.expression.includes('book_assembly_service')
      && operation.expression.includes('$bookId')
      && operation.expression.includes('$unitKey')
      && operation.expression.includes('book_assembly_ownerId')
      && !operation.expression.includes('candidateId')
    ))).toBe(true);
  });
});
