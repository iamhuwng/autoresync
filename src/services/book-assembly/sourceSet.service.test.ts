import { describe, expect, it } from 'vitest';
import type { BookContentTreeNodeCandidate, BookSourceVersionAuthority, SourceSetCandidate } from '../../types/bookAssembly.types';
import { sourceMayBeUsedByNode, validateSourceSetCandidate } from './sourceSet.service';

const authority = (overrides: Record<string, { bookId: string; physicalPageCount: number; verifiedUsable: boolean }> = {}): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => {
    const value = overrides[sourceVersionId] ?? {
      bookId: 'book-1', physicalPageCount: 10, verifiedUsable: true,
    };
    return { sourceVersionId, ...value };
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
