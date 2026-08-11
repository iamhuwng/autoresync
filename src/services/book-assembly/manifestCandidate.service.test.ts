import { describe, expect, it } from 'vitest';
import type { BookAssemblyManifestCandidate, BookSourceVersionAuthority } from '../../types/bookAssembly.types';
import { validateBookAssemblyManifestCandidate } from './manifestCandidate.service';

const authority = (verifiedUsable = true): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => ({
    sourceVersionId,
    bookId: 'book-1',
    physicalPageCount: 10,
    verifiedUsable,
  }),
});

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }],
  },
  nodes: [
    { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
    pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [2, 3], activityKeys: ['activity-1'], mode: 'activity', defaultPhysicalPageNumber: 2 }],
  }],
});

describe('validateBookAssemblyManifestCandidate', () => {
  it('accepts a normal full-PDF manifest with reciprocal bounded mappings', () => {
    expect(validateBookAssemblyManifestCandidate(manifest(), authority())).toMatchObject({ valid: true, errors: [] });
  });

  it('enforces exact source authority, structural ownership, and page boundaries', () => {
    const wrongBook = manifest();
    wrongBook.bookId = 'book-2';
    expect(validateBookAssemblyManifestCandidate(wrongBook, authority()).errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'source-book-mismatch' })]));

    const unusable = validateBookAssemblyManifestCandidate(manifest(), authority(false));
    expect(unusable.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unverified-source-version' })]));

    const invalidPage = manifest();
    invalidPage.units[0]!.pageGroups[0]!.pages = [11];
    expect(validateBookAssemblyManifestCandidate(invalidPage, authority()).errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'out-of-range-page' })]));

    const cycle = manifest();
    cycle.nodes[0]!.parentNodeKey = 'unit-1';
    expect(validateBookAssemblyManifestCandidate(cycle, authority()).errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'cycle' })]));
  });

  it('requires component owners to exist in the Unit branch and rejects unmapped fields', () => {
    const component = manifest();
    component.sourceSet = {
      sourceStrategy: 'component_pdfs',
      sources: [{ sourceKey: 'component', sourceVersionId: 'component-v1', sourceOrder: 1, ownerNodeKey: 'other-branch' }],
    };
    component.units[0]!.pageGroups[0]!.sourceKey = 'component';
    const result = validateBookAssemblyManifestCandidate(component, authority());
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-owner' })]));

    const extra = { ...manifest(), unexpected: true };
    expect(validateBookAssemblyManifestCandidate(extra, authority()).errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unknown-field', path: '$' })]));
  });
});
