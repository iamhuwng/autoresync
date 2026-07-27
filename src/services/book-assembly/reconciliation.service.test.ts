import { describe, expect, it } from 'vitest';
import type { BookAssemblyManifestCandidate, BookSourceVersionAuthority } from '../../types/bookAssembly.types';
import { analyzeBookAssemblyReconciliation } from './reconciliation.service';

const authority = (): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => sourceVersionId === 'source-1'
    ? { sourceVersionId, bookId: 'book-1', physicalPageCount: 10, verifiedUsable: true }
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

  it('never selects presentation or accepts unsupported declarations', () => {
    const result = analyzeBookAssemblyReconciliation({
      manifest: manifest(),
      sourceVersionAuthority: authority(),
      activityDeclarations: {
        'activity-1': {
          activityKey: 'activity-1',
          family: 'invented',
          variant: 'auto',
          profile: null,
          presentationMode: 'structured',
          contextRequirement: 'required',
        },
      },
    });

    expect(result.releaseBlocking).toBe(true);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported-activity-declaration' }),
      expect.objectContaining({ code: 'presentation-context-contradiction', repair: 'teacher-choice' }),
    ]));
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
