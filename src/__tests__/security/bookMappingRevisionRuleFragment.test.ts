import { describe, expect, it } from 'vitest';

import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/18.json';

describe('Ticket 18 mapping-revision rules fragment', () => {
  it('keeps the mapping-revision root browser-denied and service-owned', () => {
    expect(fragment).toMatchObject({
      schemaVersion: 1,
      ticketId: '18',
      owner: {
        ticketId: '18',
        issue: 67,
        serviceIdentity: 'book_assembly_publication_service',
        leastPrivilegePaths: ['book_assembly_publications/books/$bookId'],
      },
    });
    expect(fragment.owner.generatedRuleLocations).toEqual([
      'book_assembly_mapping_revisions/.read',
      'book_assembly_mapping_revisions/.write',
    ]);
    expect(fragment.operations).toEqual([
      expect.objectContaining({
        path: 'book_assembly_mapping_revisions',
        rule: '.read',
        expression: 'false',
        merge: 'replace-exact-deny',
        requiresExistingRule: false,
      }),
      expect.objectContaining({
        path: 'book_assembly_mapping_revisions',
        rule: '.write',
        expression: 'false',
        merge: 'replace-exact-deny',
        requiresExistingRule: false,
      }),
    ]);
  });

  it('does not claim the common publication paths or pointer boundary', () => {
    expect(fragment.operations.some((operation) => (
      operation.path === 'book_assembly_publications'
      || operation.path.startsWith('book_assembly_publications/')
    ))).toBe(false);
  });
});
