import { describe, expect, it } from 'vitest';

import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/20C.json';

describe('Ticket 20C source-strategy successor rules fragment', () => {
  it('owns only the disabled successor root and keeps it browser-deny', () => {
    expect(fragment).toMatchObject({
      schemaVersion: 1,
      ticketId: '20C',
      owner: {
        ticketId: '20C',
        issue: 71,
        serviceIdentity: 'book_assembly_publication_service',
        leastPrivilegePaths: ['book_assembly_publications/books/$bookId'],
      },
    });
    expect(fragment.owner.generatedRuleLocations).toEqual([
      'book_assembly_publication_successors/.read',
      'book_assembly_publication_successors/.write',
    ]);
    expect(fragment.operations).toEqual([
      expect.objectContaining({
        path: 'book_assembly_publication_successors',
        rule: '.read',
        merge: 'replace-exact-deny',
        requiresExistingRule: false,
        expression: 'false',
      }),
      expect.objectContaining({
        path: 'book_assembly_publication_successors',
        rule: '.write',
        merge: 'replace-exact-deny',
        requiresExistingRule: false,
        expression: 'false',
      }),
    ]);
  });

  it('does not duplicate the common 16A publication boundary', () => {
    expect(fragment.operations.some((operation) => (
      operation.path === 'book_assembly_publications'
      || operation.path.startsWith('book_assembly_publications/')
    ))).toBe(false);
  });
});
