import { describe, expect, it } from 'vitest';
import type { BookSourceVersionAuthority, SourceSetCandidate } from '../../types/bookAssembly.types';
import { resolveSourceQualifiedPage } from './sourcePageAuthority.service';

const sourceSet: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
};

const authority = (overrides: Record<string, unknown> = {}): BookSourceVersionAuthority => ({
  getSourceVersion: () => ({
    sourceVersionId: 'source-v1',
    bookId: 'book-1',
    physicalPageCount: 10,
    verifiedUsable: true,
    ...overrides,
  }),
});

describe('sourcePageAuthority', () => {
  it('resolves an in-range page through the exact Book/source authority', () => {
    expect(resolveSourceQualifiedPage(
      sourceSet,
      { bookId: 'book-1', sourceVersionAuthority: authority() },
      { sourceKey: 'full', physicalPageNumber: 3 },
      'pages[0]',
    )).toEqual({ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 3 });
  });

  it.each([
    ['unknown-source-key', sourceSet, authority(), { sourceKey: 'missing', physicalPageNumber: 1 }],
    ['unknown-source-version', sourceSet, { getSourceVersion: () => undefined }, { sourceKey: 'full', physicalPageNumber: 1 }],
    ['source-book-mismatch', sourceSet, authority({ bookId: 'other-book' }), { sourceKey: 'full', physicalPageNumber: 1 }],
    ['unverified-source-version', sourceSet, authority({ verifiedUsable: false }), { sourceKey: 'full', physicalPageNumber: 1 }],
    ['out-of-range-page', sourceSet, authority(), { sourceKey: 'full', physicalPageNumber: 11 }],
  ] as const)('fails closed for %s', (reason, candidate, sourceVersionAuthority, page) => {
    expect(() => resolveSourceQualifiedPage(
      candidate,
      { bookId: 'book-1', sourceVersionAuthority },
      page,
      'pages[0]',
    )).toThrow(`pages[0]:${reason}`);
  });
});
