import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyManifestCandidate,
  BookSourceVersionAuthority,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import { analyzeBookAssemblyReconciliation } from './reconciliation.service';

const trustedProjection = (sourceVersionId: string): TrustedBookSourceVersionProjection => ({
  sourceKey: 'source',
  sourceVersionId,
  bookId: 'book-1',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  purpose: 'book-source',
  studentSafeStatus: 'ready',
  studentSafeDecision: {
    decidedBy: 'teacher-1',
    decidedAt: '2026-01-01T00:00:00.000Z',
    sourceVersionId,
    sha256Hex: 'a'.repeat(64),
    reasonCode: 'teacher-reviewed',
  },
  physicalPageCount: 10,
  verifiedUsable: true,
});
const authority = (): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => sourceVersionId === 'source-1'
    ? trustedProjection(sourceVersionId)
    : undefined,
});

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'source', sourceVersionId: 'source-1', sourceOrder: 1 }],
  },
  nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'activity-1',
      order: 1,
      contextRequirement: 'optional',
      pageGroupKeys: ['pages-1'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-1',
      sourceKey: 'source',
      pages: [1, 2],
      activityKeys: ['activity-1'],
      mode: 'activity',
      defaultPhysicalPageNumber: 1,
    }],
  }],
});

describe('analyzeBookAssemblyReconciliation', () => {
  it('leaves a valid, reciprocal candidate untouched', () => {
    const result = analyzeBookAssemblyReconciliation({ manifest: manifest(), sourceVersionAuthority: authority() });

    expect(result).toMatchObject({ issues: [], releaseBlocking: false, requiresTeacherChoice: false, canApplyExactRepair: false });
    expect(result.repairedManifest).toBeNull();
  });

  it('repairs only reciprocal mapping and page ordering deterministically', () => {
    const input = manifest();
    const unit = input.units[0];
    const altered: BookAssemblyManifestCandidate = {
      ...input,
      units: [{
        ...unit,
        activitySlots: [{ ...unit.activitySlots[0], pageGroupKeys: [] }],
        pageGroups: [{ ...unit.pageGroups[0], pages: [2, 1, 1] }],
      }],
    };

    const result = analyzeBookAssemblyReconciliation({ manifest: altered, sourceVersionAuthority: authority() });

    expect(result).toMatchObject({ releaseBlocking: false, requiresTeacherChoice: false, canApplyExactRepair: true });
    expect(result.repairedManifest?.units[0]?.activitySlots[0]?.pageGroupKeys).toEqual(['pages-1']);
    expect(result.repairedManifest?.units[0]?.pageGroups[0]?.pages).toEqual([1, 2]);
    expect(result.issues.map((entry) => entry.repair)).toEqual(['exact', 'exact']);
  });

  it('requires teacher choice for gaps and overlapping Page Groups', () => {
    const input = manifest();
    const unit = input.units[0];
    const altered: BookAssemblyManifestCandidate = {
      ...input,
      units: [{
        ...unit,
        pageGroups: [
          { ...unit.pageGroups[0], pages: [1, 3] },
          { ...unit.pageGroups[0], pageGroupKey: 'pages-2', pages: [3], activityKeys: [] },
        ],
      }],
    };

    const result = analyzeBookAssemblyReconciliation({ manifest: altered, sourceVersionAuthority: authority() });

    expect(result.releaseBlocking).toBe(true);
    expect(result.requiresTeacherChoice).toBe(true);
    expect(result.repairedManifest).toBeNull();
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(['page-gap', 'page-overlap']));
  });

  it('blocks unknown sources, local-range faults, and stale revisions without a write candidate', () => {
    const input = manifest();
    const unit = input.units[0];
    const altered: BookAssemblyManifestCandidate = {
      ...input,
      units: [{ ...unit, pageGroups: [{ ...unit.pageGroups[0], sourceKey: 'missing', pages: [99] }] }],
    };

    const result = analyzeBookAssemblyReconciliation({
      manifest: altered,
      sourceVersionAuthority: authority(),
      expectedBookRevision: 2,
      bookRevision: 3,
      expectedSourceSetRevision: 4,
      sourceSetRevision: 5,
      expectedCandidateRevision: 6,
      candidateRevision: 7,
    });

    expect(result.releaseBlocking).toBe(true);
    expect(result.repairedManifest).toBeNull();
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'candidate-stale', 'source-stale', 'unknown-source-key',
    ]));
  });

  it('rejects component sources outside the Unit branch', () => {
    const input = manifest();
    const altered: BookAssemblyManifestCandidate = {
      ...input,
      sourceSet: {
        sourceStrategy: 'component_pdfs',
        sources: [{ sourceKey: 'source', sourceVersionId: 'source-1', sourceOrder: 1, ownerNodeKey: 'section-1' }],
      },
      nodes: [...input.nodes, { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 2 }],
    };

    const result = analyzeBookAssemblyReconciliation({ manifest: altered, sourceVersionAuthority: authority() });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-component-owner', severity: 'blocker' }),
    ]));
    expect(result.repairedManifest).toBeNull();
  });

  it('uses canonical Activity validation instead of a private declaration vocabulary', () => {
    const result = analyzeBookAssemblyReconciliation({
      manifest: manifest(),
      sourceVersionAuthority: authority(),
      activities: {
        'activity-1': {
          schemaVersion: 1, title: 'Activity', taskProfile: null,
          presentationMode: 'unsupported', contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
          instructions: [{ text: 'Choose.' }], interaction: { family: 'invented', variant: 'auto' },
          answerRule: { defaultPoints: 1, normalization: 'exact' }, stimulus: null, assetRefs: [],
          interactions: [], scoring: { mode: 'auto-where-possible' },
        },
      },
    });

    expect(result.releaseBlocking).toBe(true);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported-activity-declaration' }),
      expect.objectContaining({ code: 'presentation-context-contradiction', repair: 'none' }),
    ]));
  });

  it('classifies stable-key changes and keeps cross-Unit/source decisions explicit', () => {
    const current = manifest();
    const proposed: BookAssemblyManifestCandidate = {
      ...current,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'source', sourceVersionId: 'source-2', sourceOrder: 1 }] },
      nodes: [{ ...current.nodes[0], order: 2 }],
      units: [{ ...current.units[0], activitySlots: [{ ...current.units[0].activitySlots[0], pageGroupKeys: [] }] }],
    };
    const result = analyzeBookAssemblyReconciliation({
      manifest: proposed,
      currentManifest: current,
      sourceVersionAuthority: { getSourceVersion: (id) => trustedProjection(id) },
      currentLabels: { 'unit-1': 'Old unit' },
      proposedLabels: { 'unit-1': 'New unit' },
    });

    expect(result.changes.filter((change) => change.changeClass !== 'unresolved').map((change) => change.changeClass)).toEqual([
      'page-mapping-changed', 'renamed', 'reordered', 'source-replaced',
    ]);
    expect(result.changes.filter((change) => change.resolution === 'teacher-choice').map((change) => change.changeClass))
      .toEqual(['page-mapping-changed', 'source-replaced']);
    expect(result.releaseBlocking).toBe(true);

    const pageMappingId = result.changes.find((change) => change.changeClass === 'page-mapping-changed')!.id;
    const sourceId = result.changes.find((change) => change.changeClass === 'source-replaced')!.id;
    const oneResolved = analyzeBookAssemblyReconciliation({
      manifest: proposed,
      currentManifest: current,
      sourceVersionAuthority: { getSourceVersion: (id) => trustedProjection(id) },
      resolvedChangeIds: new Set([pageMappingId]),
    });
    expect(oneResolved.changes.find((change) => change.id === pageMappingId)?.resolution).toBe('automatic');
    expect(oneResolved.changes.find((change) => change.id === sourceId)?.resolution).toBe('teacher-choice');
    expect(oneResolved.releaseBlocking).toBe(true);

    const bothResolved = analyzeBookAssemblyReconciliation({
      manifest: proposed,
      currentManifest: current,
      sourceVersionAuthority: { getSourceVersion: (id) => trustedProjection(id) },
      resolvedChangeIds: new Set([pageMappingId, sourceId]),
    });
    expect(bothResolved.changes.filter((change) => change.resolution === 'teacher-choice')).toHaveLength(0);
    expect(bothResolved.releaseBlocking).toBe(false);

    const changedAgain = analyzeBookAssemblyReconciliation({
      manifest: { ...proposed, sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'source', sourceVersionId: 'source-3', sourceOrder: 1 }] } },
      currentManifest: current,
      sourceVersionAuthority: { getSourceVersion: (id) => trustedProjection(id) },
      resolvedChangeIds: new Set([sourceId]),
    });
    expect(changedAgain.changes.find((change) => change.changeClass === 'source-replaced')?.resolution).toBe('teacher-choice');
    expect(changedAgain.releaseBlocking).toBe(true);
  });

  it('is idempotent and produces stable issue order', () => {
    const input = manifest();
    const unit = input.units[0];
    const altered: BookAssemblyManifestCandidate = {
      ...input,
      units: [{ ...unit, activitySlots: [{ ...unit.activitySlots[0], pageGroupKeys: [] }], pageGroups: [{ ...unit.pageGroups[0], pages: [2, 1] }] }],
    };

    const first = analyzeBookAssemblyReconciliation({ manifest: altered, sourceVersionAuthority: authority() });
    const second = analyzeBookAssemblyReconciliation({ manifest: altered, sourceVersionAuthority: authority() });

    expect(second).toEqual(first);
    expect(analyzeBookAssemblyReconciliation({ manifest: first.repairedManifest!, sourceVersionAuthority: authority() }).issues).toEqual([]);
  });
});
