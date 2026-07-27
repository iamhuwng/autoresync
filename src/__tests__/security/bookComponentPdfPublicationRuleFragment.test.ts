import { describe, expect, it } from 'vitest';

import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/17.json';

describe('Book Assembly component-PDF publication 17 rule fragment', () => {
  it('declares component-PDF publication owner and command ledger locations', () => {
    expect(fragment).toMatchObject({
      schemaVersion: 1,
      ticketId: '17',
      owner: {
        ticketId: '17',
        issue: 66,
        serviceIdentity: 'book_assembly_component_pdfs_publication_service',
      },
    });
    expect(fragment.owner.generatedRuleLocations).toEqual([
      'book_assembly_component_pdfs_publications/.read',
      'book_assembly_component_pdfs_publications/.write',
      'book_assembly_component_pdfs_publications/books/$bookId/.read',
      'book_assembly_component_pdfs_publications/books/$bookId/.write',
      'book_assembly_component_pdfs_publications/books/$bookId/commands/$operationId/.read',
      'book_assembly_component_pdfs_publications/books/$bookId/commands/$operationId/.write',
    ]);
  });

  it('denies browser ancestor access and keeps mutation capability fail-closed', () => {
    const rootRead = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_component_pdfs_publications' && operation.rule === '.read');
    const rootWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_component_pdfs_publications' && operation.rule === '.write');
    const bookWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_component_pdfs_publications/books/$bookId'
      && operation.rule === '.write');

    expect(rootRead?.expression).toBe('false');
    expect(rootWrite?.expression).toBe('false');
    expect(bookWrite?.expression).toContain('auth.token.book_assembly_component_pdfs_publication_service == true');
    expect(bookWrite?.expression).toContain("root.child('book_activity_capabilities/component_pdfs_publication_enabled').val() == true");
    expect(bookWrite?.expression).not.toContain('auth.uid');
  });

  it('creates operation receipts only through scoped service identity without private payloads', () => {
    const commandWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_component_pdfs_publications/books/$bookId/commands/$operationId'
      && operation.rule === '.write');

    expect(commandWrite?.expression).toContain('auth.token.book_assembly_component_pdfs_publication_service == true');
    expect(commandWrite?.expression).toContain("newData.child('operationId').val() == $operationId");
    expect(commandWrite?.expression).toContain("newData.child('publicationId').isString()");
    expect(commandWrite?.expression).toContain("!newData.child('answerKey').exists()");
    expect(commandWrite?.expression).toContain("!newData.child('pdfBytes').exists()");
    expect(commandWrite?.expression).toContain("!newData.child('providerAuthority').exists()");
    expect(commandWrite?.expression).not.toContain('auth.uid');
  });
});
