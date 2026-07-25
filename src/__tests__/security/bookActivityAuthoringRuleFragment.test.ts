import { describe, expect, it } from 'vitest';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/12C.json';

describe('Book Activity authoring RTDB rule fragment', () => {
  it('denies browser reads/writes at authoring root, including ancestor-shaped direct writes', () => {
    expect(fragment.owner).toMatchObject({ ticketId: '12C', issue: 35 });
    expect(fragment.owner.generatedRuleLocations).toEqual([
      'book_activity_authoring/.read',
      'book_activity_authoring/.write',
      'book_activity_authoring/owners/$ownerId/.read',
      'book_activity_authoring/owners/$ownerId/.write',
    ]);
    expect(fragment.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'book_activity_authoring', rule: '.read', expression: 'false', merge: 'replace-exact-deny' }),
      expect.objectContaining({ path: 'book_activity_authoring', rule: '.write', expression: 'false', merge: 'replace-exact-deny' }),
    ]));
  });

  it('declares only owner-scoped trusted service access and no browser/cross-owner access', () => {
    expect(fragment.owner.serviceIdentity).toBe('book_activity_authoring_service');
    expect(fragment.owner.leastPrivilegePaths).toEqual([
      'users/$ownerId',
      'book_activity_authoring/owners/$ownerId',
    ]);
    const scoped = fragment.operations.filter((operation) => operation.path === 'book_activity_authoring/owners/$ownerId');
    expect(scoped).toHaveLength(2);
    expect(scoped.every((operation) => (
      operation.expression.includes('book_activity_authoring_service')
      && operation.expression.includes('book_activity_authoring_ownerId')
      && operation.expression.includes('$ownerId')
    ))).toBe(true);
    expect(scoped.every((operation) => operation.expression.includes('auth != null'))).toBe(true);
  });
});
