import { describe, expect, it } from 'vitest';
import type {
  BookSourceVersionAuthority,
  SourceSetCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import { resolveSourceQualifiedPage } from './sourcePageAuthority.service';

const sourceSet: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
};

const authority = (overrides: Record<string, unknown> = {}): BookSourceVersionAuthority => ({
  getSourceVersion: () => ({
    sourceKey: 'full',
    sourceVersionId: 'source-v1',
    bookId: 'book-1',
    checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
    purpose: 'book-source',
    studentSafeStatus: overrides.studentSafeStatus ?? 'ready',
    ...((overrides.studentSafeStatus ?? 'ready') === 'unreviewed' ? {} : {
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        decidedAt: '2026-01-01T00:00:00.000Z',
        sourceVersionId: 'source-v1',
        sha256Hex: 'a'.repeat(64),
        reasonCode: 'teacher-reviewed',
      },
    }),
    physicalPageCount: 10,
    verifiedUsable: true,
    ...overrides,
  } as unknown as TrustedBookSourceVersionProjection),
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

  it('allows an unreviewed private book-source page', () => {
    expect(resolveSourceQualifiedPage(
      sourceSet,
      { bookId: 'book-1', sourceVersionAuthority: authority({ studentSafeStatus: 'unreviewed' }) },
      { sourceKey: 'full', physicalPageNumber: 3 },
      'pages[0]',
    )).toEqual({ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 3 });
  });

  it.each([
    ['unknown-source-key', 'unknown-source-key', sourceSet, authority(), { sourceKey: 'missing', physicalPageNumber: 1 }],
    ['unknown-source-version', 'unknown-source-version', sourceSet, { getSourceVersion: () => undefined }, { sourceKey: 'full', physicalPageNumber: 1 }],
    ['source-identity-mismatch', 'source-identity-mismatch', sourceSet, authority({ sourceKey: 'alias' }), { sourceKey: 'full', physicalPageNumber: 1 }],
    ['source-book-mismatch', 'source-book-mismatch', sourceSet, authority({ bookId: 'other-book' }), { sourceKey: 'full', physicalPageNumber: 1 }],
    ['unverified-source-version', 'unverified-source-version', sourceSet, authority({ verifiedUsable: false }), { sourceKey: 'full', physicalPageNumber: 1 }],
    ['student-document-source', 'unverified-source-version', sourceSet, authority({ purpose: 'student-document' }), { sourceKey: 'full', physicalPageNumber: 1 }],
    ['rejected-source', 'unverified-source-version', sourceSet, authority({ studentSafeStatus: 'rejected' }), { sourceKey: 'full', physicalPageNumber: 1 }],
    ['malformed-source-projection', 'unverified-source-version', sourceSet, authority({ checksum: { algorithm: 'sha-256', value: 'bad' } }), { sourceKey: 'full', physicalPageNumber: 1 }],
    ['out-of-range-page', 'out-of-range-page', sourceSet, authority(), { sourceKey: 'full', physicalPageNumber: 11 }],
  ] as const)('fails closed for %s', (_label, reason, candidate, sourceVersionAuthority, page) => {
    expect(() => resolveSourceQualifiedPage(
      candidate,
      { bookId: 'book-1', sourceVersionAuthority },
      page,
      'pages[0]',
    )).toThrow(`pages[0]:${reason}`);
  });
});
