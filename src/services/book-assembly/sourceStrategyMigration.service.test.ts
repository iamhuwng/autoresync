import { describe, expect, it } from 'vitest';
import type { BookAssemblyManifestCandidate, BookSourceVersionAuthority, SourceSetCandidate } from '../../types/bookAssembly.types';
import { planSourceStrategyMigration } from './sourceStrategyMigration.service';

const authority: BookSourceVersionAuthority = { getSourceVersion: (id) => ({ sourceVersionId: id, bookId: 'book-1', physicalPageCount: 10, verifiedUsable: true }) };
const manifest = (sourceSet: SourceSetCandidate): BookAssemblyManifestCandidate => ({ bookId: 'book-1', sourceSet, nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }], units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'optional', pageGroupKeys: ['group-1'] }], pageGroups: [{ pageGroupKey: 'group-1', sourceKey: sourceSet.sources[0].sourceKey, pages: [1, 2], activityKeys: ['activity-1'], mode: 'activity', defaultPhysicalPageNumber: 1 }] }] });
const input = (from: SourceSetCandidate, to: SourceSetCandidate, remaps = undefined as any) => ({ bookId: 'book-1', bookMode: 'pdf', bookRevision: 2, sourceSetRevision: 3, sourceSet: from, candidate: { revision: 4, bookRevision: 2, sourceSetRevision: 3, manifest: manifest(from) }, target: { sourceSetRevision: 4, sourceSet: to }, remaps, sourceVersionAuthority: authority });

describe('planSourceStrategyMigration', () => {
  it('plans unchanged strategy and preserves identities', () => {
    const sourceSet: SourceSetCandidate = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] };
    const result = planSourceStrategyMigration(input(sourceSet, sourceSet));
    expect(result.valid).toBe(true); expect(result.impact.preservedPageGroupCount).toBe(1); expect(result.targetManifest.units[0].pageGroups[0].sourceKey).toBe('full');
  });

  it('requires explicit source-qualified remap full_pdf to components and honors owners/order', () => {
    const from: SourceSetCandidate = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] };
    const to: SourceSetCandidate = { sourceStrategy: 'component_pdfs', sources: [{ sourceKey: 'component', sourceVersionId: 'component-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' }] };
    const missing = planSourceStrategyMigration(input(from, to));
    expect(missing.errors.map((entry) => entry.code)).toContain('missing-remap');
    const result = planSourceStrategyMigration(input(from, to, [{ pageGroupKey: 'group-1', pages: [{ from: { sourceKey: 'full', physicalPageNumber: 1 }, to: { sourceKey: 'component', physicalPageNumber: 1 } }, { from: { sourceKey: 'full', physicalPageNumber: 2 }, to: { sourceKey: 'component', physicalPageNumber: 2 } }] }]));
    expect(result.valid).toBe(true); expect(result.targetManifest.sourceSet.sources[0]).toMatchObject({ sourceOrder: 2, ownerNodeKey: 'unit-1' });
  });

  it('requires every group to resolve when components migrate to one full source', () => {
    const from: SourceSetCandidate = { sourceStrategy: 'component_pdfs', sources: [{ sourceKey: 'component', sourceVersionId: 'component-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' }] };
    const to: SourceSetCandidate = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 9 }] };
    const result = planSourceStrategyMigration(input(from, to));
    expect(result.errors.map((entry) => entry.code)).toContain('missing-remap');
    const valid = planSourceStrategyMigration(input(from, to, [{ pageGroupKey: 'group-1', pages: [{ from: { sourceKey: 'component', physicalPageNumber: 1 }, to: { sourceKey: 'full', physicalPageNumber: 4 } }, { from: { sourceKey: 'component', physicalPageNumber: 2 }, to: { sourceKey: 'full', physicalPageNumber: 5 } }] }]));
    expect(valid.valid).toBe(true); expect(valid.targetManifest.units[0].pageGroups[0].sourceKey).toBe('full');
  });

  it('rejects a candidate whose source identity differs from the trusted current Source Set', () => {
    const trusted: SourceSetCandidate = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] };
    const staleCandidateSource: SourceSetCandidate = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v2', sourceOrder: 1 }] };
    const result = planSourceStrategyMigration({
      ...input(trusted, trusted),
      candidate: { ...input(trusted, trusted).candidate, manifest: manifest(staleCandidateSource) },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-identity-mismatch', path: '$.candidate.manifest.sourceSet' }),
    ]));
  });

  it('rejects guessed offsets, duplicate pages, bad owners, stale revisions, publication, and malformed remaps', () => {
    const from: SourceSetCandidate = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] };
    const to: SourceSetCandidate = { sourceStrategy: 'component_pdfs', sources: [{ sourceKey: 'component', sourceVersionId: 'component-v1', sourceOrder: 1, ownerNodeKey: 'missing-owner' }] };
    const result = planSourceStrategyMigration({ ...input(from, to, [{ pageGroupKey: 'group-1', pages: [{ from: { sourceKey: 'full', physicalPageNumber: 99 }, to: { sourceKey: 'component', physicalPageNumber: 1 } }, { from: { sourceKey: 'full', physicalPageNumber: 99 }, to: { sourceKey: 'component', physicalPageNumber: 1 } }] }]), published: true, expectedBookRevision: 9, expectedSourceSetRevision: 8, expectedCandidateRevision: 8 });
    expect(result.valid).toBe(false); expect(result.errors.map((entry) => entry.code)).toEqual(expect.arrayContaining(['published-state', 'stale-book-revision', 'stale-source-set-revision', 'stale-candidate-revision', 'source-identity-mismatch', 'ambiguous-remap', 'invalid-component-owner', 'duplicate-page']));
  });

  it('does not mutate input and returns frozen plan', () => {
    const sourceSet: SourceSetCandidate = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] };
    const original = input(sourceSet, sourceSet); const before = JSON.stringify(original);
    const result = planSourceStrategyMigration(original);
    expect(JSON.stringify(original)).toBe(before); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.targetManifest)).toBe(true);
  });
});
