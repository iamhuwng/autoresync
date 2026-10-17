import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const fragment = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'cloudflare/src/upload-worker/book-rules/fragments/04.json'),
    'utf8',
  ),
);

describe('Ticket 04 Book source-capacity RTDB rule fragment', () => {
  it('declares one versioned, disjoint composition contract', () => {
    expect(fragment).toEqual({
      schemaVersion: 1,
      ticketId: '04',
      owner: {
        ticketId: '04',
        issue: 29,
        generatedRuleLocations: [
          'book_source_upload_accounts/.read',
          'book_source_upload_accounts/.write',
        ],
      },
      operations: [
        {
          path: 'book_source_upload_accounts',
          rule: '.read',
          merge: 'replace-exact-deny',
          requiresExistingRule: false,
          expression: 'false',
        },
        {
          path: 'book_source_upload_accounts',
          rule: '.write',
          merge: 'replace-exact-deny',
          requiresExistingRule: false,
          expression: 'false',
        },
      ],
    });
  });

  it('denies browser reads and writes at real source-capacity account boundary', () => {
    expect(fragment.operations).toHaveLength(2);
    expect(fragment.operations.map((operation: { path: string; rule: string }) => (
      `${operation.path}/${operation.rule}`
    ))).toEqual([
      'book_source_upload_accounts/.read',
      'book_source_upload_accounts/.write',
    ]);
    expect(fragment.operations.every((operation: { expression: string }) => (
      operation.expression === 'false'
    ))).toBe(true);
    expect(fragment.operations.every((operation: { merge: string; requiresExistingRule: boolean }) => (
      operation.merge === 'replace-exact-deny' && operation.requiresExistingRule === false
    ))).toBe(true);
  });

  it('does not claim broad Book Source root owned by later fragments', () => {
    expect(fragment.owner.generatedRuleLocations).not.toContain('book_source/.read');
    expect(fragment.operations).not.toContainEqual(expect.objectContaining({ path: 'book_source' }));
  });
});
