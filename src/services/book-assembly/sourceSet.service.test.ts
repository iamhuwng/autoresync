import { describe, expect, it } from 'vitest';
import type {
  BookContentTreeNodeCandidate,
  BookSourceVersionAuthority,
  SourceSetCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import { sourceMayBeUsedByNode, validateSourceSetCandidate } from './sourceSet.service';

const authority = (overrides: Record<string, Record<string, unknown>> = {}): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => {
    const sourceKey = sourceVersionId === 'full-v1' || sourceVersionId === 'source-v1'
      ? 'full'
      : sourceVersionId.replace(/-v1$/u, '');
    const value = overrides[sourceVersionId] ?? {};
    const status = value.studentSafeStatus ?? 'ready';
    return {
      sourceKey,
      sourceVersionId,
      bookId: 'book-1',
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      purpose: 'book-source',
      studentSafeStatus: status,
      ...(status === 'unreviewed' ? {} : {
        studentSafeDecision: {
          decidedBy: 'teacher-1',
          decidedAt: '2026-01-01T00:00:00.000Z',
          sourceVersionId,
          sha256Hex: 'a'.repeat(64),
          reasonCode: 'teacher-reviewed',
        },
      }),
      physicalPageCount: 10,
      verifiedUsable: true,
      ...value,
    } as unknown as TrustedBookSourceVersionProjection;
  },
});

describe('validateSourceSetCandidate', () => {
  it('accepts normal full-PDF and component-PDF Source Sets only through trusted authority', () => {
    const full: SourceSetCandidate = {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }],
    };
    const components: SourceSetCandidate = {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'component-a', sourceVersionId: 'component-a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
        { sourceKey: 'component-b', sourceVersionId: 'component-b-v1', sourceOrder: 2, ownerNodeKey: 'section-1' },
      ],
    };
    expect(validateSourceSetCandidate(full, { bookId: 'book-1', sourceVersionAuthority: authority() }).valid).toBe(true);
    expect(validateSourceSetCandidate(components, { bookId: 'book-1', sourceVersionAuthority: authority() }).valid).toBe(true);
  });

  it('fails closed for identity, usability, uniqueness, strategy shape, and forbidden owners', () => {
    const result = validateSourceSetCandidate({
      sourceStrategy: 'full_pdf',
      sources: [
        { sourceKey: 'full', sourceVersionId: 'same-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
        { sourceKey: 'full', sourceVersionId: 'same-v1', sourceOrder: 1 },
      ],
    }, {
      bookId: 'book-1',
      sourceVersionAuthority: authority({
        'same-v1': { bookId: 'book-2', physicalPageCount: 10, verifiedUsable: false },
      }),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'invalid-value', 'forbidden-field', 'duplicate-key', 'duplicate-order',
      'source-book-mismatch', 'unverified-source-version',
    ]));
    expect(validateSourceSetCandidate({ sourceStrategy: 'component_pdfs', sources: [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1 }] }, {
      bookId: 'book-1', sourceVersionAuthority: authority(),
    }).errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-owner' })]));
  });

  it('rejects a candidate source key that differs from the trusted version projection', () => {
    const result = validateSourceSetCandidate({
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'alias', sourceVersionId: 'source-v1', sourceOrder: 1 }],
    }, { bookId: 'book-1', sourceVersionAuthority: authority() });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-identity-mismatch', path: '$.sourceSet.sources[0].sourceKey' }),
    ]));
  });

  it('allows an unreviewed private book-source projection', () => {
    const result = validateSourceSetCandidate({
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
    }, {
      bookId: 'book-1',
      sourceVersionAuthority: authority({ 'source-v1': { studentSafeStatus: 'unreviewed' } }),
    });

    expect(result.valid).toBe(true);
  });

  it.each([
    ['student-document', 'unverified-source-version', { purpose: 'student-document' }],
    ['rejected', 'unverified-source-version', { studentSafeStatus: 'rejected' }],
    ['unusable', 'unverified-source-version', { verifiedUsable: false }],
    ['malformed checksum', 'invalid-value', { checksum: { algorithm: 'sha-256', value: 'not-a-hash' } }],
    ['malformed safety decision', 'invalid-value', { studentSafeDecision: { sourceVersionId: 'other-version' } }],
  ] as const)('rejects %s trusted source projections', (_label, code, override) => {
    const result = validateSourceSetCandidate({
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
    }, {
      bookId: 'book-1',
      sourceVersionAuthority: authority({ 'source-v1': override }),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code }),
    ]));
  });

  it.each([
    ['component count 1', {
      sourceStrategy: 'component_pdfs',
      sources: [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' }],
    }],
    ['component count 21', {
      sourceStrategy: 'component_pdfs',
      sources: Array.from({ length: 21 }, (_, index) => ({
        sourceKey: `source-${index + 1}`,
        sourceVersionId: `version-${index + 1}`,
        sourceOrder: index + 1,
        ownerNodeKey: 'section-1',
      })),
    }],
    ['component order gap', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 3, ownerNodeKey: 'section-1' },
      ],
    }],
    ['component duplicate source key', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
        { sourceKey: 'a', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'section-1' },
      ],
    }],
    ['component duplicate source version', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
        { sourceKey: 'b', sourceVersionId: 'a-v1', sourceOrder: 2, ownerNodeKey: 'section-1' },
      ],
    }],
    ['component reordered orders', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 2, ownerNodeKey: 'section-1' },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
      ],
    }],
    ['full PDF with zero sources', { sourceStrategy: 'full_pdf', sources: [] }],
    ['full PDF with two sources', {
      sourceStrategy: 'full_pdf',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1 },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2 },
      ],
    }],
    ['full PDF with non-one order', {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 2 }],
    }],
  ])('rejects %s', (_label, sourceSet) => {
    expect(validateSourceSetCandidate(sourceSet, {
      bookId: 'book-1',
      sourceVersionAuthority: authority(),
    }).valid).toBe(false);
  });
});

describe('sourceMayBeUsedByNode', () => {
  const nodes: readonly BookContentTreeNodeCandidate[] = [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'section-a', parentNodeKey: 'root', nodeType: 'section', order: 1 },
    { nodeKey: 'unit-a', parentNodeKey: 'section-a', nodeType: 'unit', order: 1 },
    { nodeKey: 'section-b', parentNodeKey: 'root', nodeType: 'section', order: 2 },
    { nodeKey: 'unit-b', parentNodeKey: 'section-b', nodeType: 'unit', order: 1 },
  ];

  it('allows full-PDF sources everywhere and component sources only in their branch', () => {
    const full: SourceSetCandidate['sources'][number] = {
      sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1,
    };
    const component: SourceSetCandidate['sources'][number] = {
      sourceKey: 'component', sourceVersionId: 'component-v1', sourceOrder: 1, ownerNodeKey: 'section-a',
    };

    expect(sourceMayBeUsedByNode(full, nodes, 'unit-b')).toBe(true);
    expect(sourceMayBeUsedByNode(component, nodes, 'section-a')).toBe(true);
    expect(sourceMayBeUsedByNode(component, nodes, 'unit-a')).toBe(true);
    expect(sourceMayBeUsedByNode(component, nodes, 'unit-b')).toBe(false);
  });

  it('fails closed for missing nodes, owners, and cyclic parent chains', () => {
    const component: SourceSetCandidate['sources'][number] = {
      sourceKey: 'component', sourceVersionId: 'component-v1', sourceOrder: 1, ownerNodeKey: 'section-a',
    };
    expect(sourceMayBeUsedByNode(component, nodes, 'missing-unit')).toBe(false);
    expect(sourceMayBeUsedByNode(component, nodes, 'unit-a')).toBe(true);
    expect(sourceMayBeUsedByNode({ ...component, ownerNodeKey: 'other-owner' }, [
      { nodeKey: 'section-a', parentNodeKey: 'unit-a', nodeType: 'section', order: 1 },
      { nodeKey: 'unit-a', parentNodeKey: 'section-a', nodeType: 'unit', order: 1 },
      { nodeKey: 'other-owner', parentNodeKey: null, nodeType: 'section', order: 2 },
    ], 'unit-a')).toBe(false);
    expect(sourceMayBeUsedByNode({ ...component, ownerNodeKey: 'missing-owner' }, nodes, 'unit-a')).toBe(false);
    expect(sourceMayBeUsedByNode({ ...component, ownerNodeKey: undefined } as unknown as SourceSetCandidate['sources'][number], nodes, 'unit-a')).toBe(false);
  });
});
