import { describe, expect, it } from 'vitest';
import type {
  BookSourceVersionAuthority,
  ComponentPdfPreparationInput,
  SourceSetCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import { prepareComponentPdfArtifact } from './componentPdfPreparation.service';

const sourceSet: SourceSetCandidate = {
  sourceStrategy: 'component_pdfs',
  sources: [
    { sourceKey: 'part-a', sourceVersionId: 'version-a', sourceOrder: 1, ownerNodeKey: 'unit-a' },
    { sourceKey: 'part-b', sourceVersionId: 'version-b', sourceOrder: 2, ownerNodeKey: 'unit-b' },
  ],
};

const authority: BookSourceVersionAuthority = {
  getSourceVersion: (sourceVersionId) => ({
    sourceKey: sourceVersionId === 'version-a' ? 'part-a' : 'part-b',
    sourceVersionId,
    bookId: 'book-1',
    checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
    purpose: 'book-source',
    studentSafeStatus: 'unreviewed',
    physicalPageCount: 10,
    verifiedUsable: true,
  } as TrustedBookSourceVersionProjection),
};

const input = (): ComponentPdfPreparationInput => ({
  bookId: 'book-1',
  ownerId: 'owner-1',
  sourceSet,
  sourceVersionAuthority: authority,
  components: [
    {
      sourceKey: 'part-a',
      displayFilename: '  Part A 2026.PDF ',
      printedLabel: '  Part A  ',
      rotation: 90,
      presentationMode: 'source-assisted',
    },
    {
      sourceKey: 'part-b',
      displayFilename: 'Part B.pdf',
      printedLabel: 'Part B',
      rotation: 0,
      presentationMode: 'structured',
    },
  ],
  pageGroups: [
    {
      pageGroupKey: 'group-b',
      sourceKey: 'part-b',
      pages: [3],
      activityKeys: [],
      mode: 'reference_only',
      defaultPhysicalPageNumber: 3,
    },
    {
      pageGroupKey: 'group-a',
      sourceKey: 'part-a',
      pages: [2, 4],
      activityKeys: ['activity-a'],
      mode: 'activity',
      defaultPhysicalPageNumber: 2,
    },
  ],
  provenance: ['trusted-source-completion', 'teacher-page-map-v1'],
});

describe('prepareComponentPdfArtifact', () => {
  it('returns a pure source-qualified artifact with normalized display and citation fields', () => {
    const artifact = prepareComponentPdfArtifact(input());

    expect(artifact).toMatchObject({
      schemaVersion: 1,
      kind: 'component-pdf-preparation',
      bookId: 'book-1',
      ownerId: 'owner-1',
      sourceStrategy: 'component_pdfs',
      provenance: ['trusted-source-completion', 'teacher-page-map-v1'],
    });
    expect(artifact.components).toEqual([
      expect.objectContaining({
        sourceKey: 'part-a', sourceVersionId: 'version-a', sourceOrder: 1,
        ownerNodeKey: 'unit-a', displayFilename: 'Part A 2026.pdf',
        rotation: 90, presentationMode: 'source-assisted',
      }),
      expect.objectContaining({
        sourceKey: 'part-b', sourceVersionId: 'version-b', sourceOrder: 2,
        ownerNodeKey: 'unit-b', displayFilename: 'Part B.pdf',
        rotation: 0, presentationMode: 'structured',
      }),
    ]);
    expect(artifact.pageGroups.map((group) => group.pageGroupKey)).toEqual(['group-a', 'group-b']);
    expect(artifact.mappings[0]?.pages).toEqual([
      { sourceKey: 'part-a', sourceVersionId: 'version-a', physicalPageNumber: 2 },
      { sourceKey: 'part-a', sourceVersionId: 'version-a', physicalPageNumber: 4 },
    ]);
    expect(artifact.citations).toEqual([
      { sourceKey: 'part-a', sourceVersionId: 'version-a', physicalPageNumber: 2, printedLabel: 'Part A' },
      { sourceKey: 'part-a', sourceVersionId: 'version-a', physicalPageNumber: 4, printedLabel: 'Part A' },
      { sourceKey: 'part-b', sourceVersionId: 'version-b', physicalPageNumber: 3, printedLabel: 'Part B' },
    ]);
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.components)).toBe(true);
  });

  it('replaces mapping input deterministically without retaining deleted Page Groups', () => {
    const candidate = input();
    const replacement = { ...candidate, pageGroups: [candidate.pageGroups[0]!] };

    const artifact = prepareComponentPdfArtifact(replacement);

    expect(artifact.pageGroups).toHaveLength(1);
    expect(artifact.pageGroups[0]?.pageGroupKey).toBe('group-b');
    expect(artifact.mappings.map((mapping) => mapping.pageGroupKey)).toEqual(['group-b']);
    expect(artifact.citations).toEqual([{
      sourceKey: 'part-b', sourceVersionId: 'version-b', physicalPageNumber: 3, printedLabel: 'Part B',
    }]);
  });

  it.each([
    ['source', (candidate: ComponentPdfPreparationInput): ComponentPdfPreparationInput => ({
      ...candidate,
      sourceSet: {
        ...candidate.sourceSet,
        sources: candidate.sourceSet.sources.map((source) => source.sourceKey === 'part-a'
          ? { ...source, sourceVersionId: 'missing-version' }
          : source),
      },
      sourceVersionAuthority: {
        getSourceVersion: (sourceVersionId) => sourceVersionId === 'missing-version'
          ? undefined
          : authority.getSourceVersion(sourceVersionId),
      },
    }), /invalid-source-set:unknown-source-version/],
    ['owner', (candidate: ComponentPdfPreparationInput): ComponentPdfPreparationInput => ({
      ...candidate,
      sourceSet: {
        ...candidate.sourceSet,
        sources: candidate.sourceSet.sources.map((source) => source.sourceKey === 'part-a'
          ? { ...source, ownerNodeKey: '' }
          : source),
      },
    }), /invalid-source-set:invalid-owner/],
    ['page', (candidate: ComponentPdfPreparationInput): ComponentPdfPreparationInput => ({
      ...candidate,
      pageGroups: candidate.pageGroups.map((group) => group.pageGroupKey === 'group-a'
        ? { ...group, pages: [99] }
        : group),
    }), /out-of-range-page/],
    ['label', (candidate: ComponentPdfPreparationInput): ComponentPdfPreparationInput => ({
      ...candidate,
      components: candidate.components.map((component) => component.sourceKey === 'part-a'
        ? { ...component, printedLabel: '  ' }
        : component),
    }), /invalid-printed-label/],
    ['rotation', (candidate: ComponentPdfPreparationInput): ComponentPdfPreparationInput => ({
      ...candidate,
      components: candidate.components.map((component) => component.sourceKey === 'part-a'
        ? { ...component, rotation: 45 as never }
        : component),
    }), /invalid-presentation-or-rotation/],
    ['presentationMode', (candidate: ComponentPdfPreparationInput): ComponentPdfPreparationInput => ({
      ...candidate,
      components: candidate.components.map((component) => component.sourceKey === 'part-a'
        ? { ...component, presentationMode: 'unsupported' as never }
        : component),
    }), /invalid-presentation-or-rotation/],
  ] as const)('fails closed for unresolved %s authority', (_label, mutate, expected) => {
    expect(() => prepareComponentPdfArtifact(mutate(input()))).toThrow(expected);
  });
});
