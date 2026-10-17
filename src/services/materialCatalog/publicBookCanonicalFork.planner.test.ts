import { describe, expect, it } from 'vitest';
import {
  materialCatalogIds,
  type MaterialBookMetadata,
  type MaterialBookNode,
} from '../../types/materialCatalog.types';
import { appendPublicBookCanonicalForkRef } from './publicBookCanonicalFork.planner';

const book = (): MaterialBookMetadata => ({
  bookId: materialCatalogIds.bookId('book-target'),
  bookMode: 'materials',
  ownerId: 'teacher-1',
  title: 'Target Book',
  authors: [],
  testTypeIds: [materialCatalogIds.testTypeId('test-type-1')],
  tags: [],
  visibility: 'private',
  status: 'ready',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
});

const nodes = (): MaterialBookNode[] => [{
  nodeId: materialCatalogIds.nodeId('node-1'),
  bookId: materialCatalogIds.bookId('book-target'),
  parentNodeId: null,
  type: 'unit',
  title: 'Unit 1',
  order: 1,
  materialRefs: [],
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
}];

const ref = () => ({
  refId: materialCatalogIds.refId('placement-1'),
  materialId: 'fork-activity-1',
  materialKind: 'interactive-activity' as const,
  snapshotVersionId: 'fork-version-1',
  titleSnapshot: 'Forked Activity',
  testTypeIdsSnapshot: [materialCatalogIds.testTypeId('test-type-1')],
  visibilitySnapshot: 'private',
  availability: 'available' as const,
  updateState: 'current' as const,
  ownerIdSnapshot: 'teacher-1',
  order: 2,
  addedAt: '2026-08-09T00:01:00.000Z',
  addedBy: 'teacher-1',
});

describe('publicBookCanonicalFork.planner', () => {
  it('appends a private canonical Activity ref without mutating the source node set', () => {
    const source = nodes();
    const next = appendPublicBookCanonicalForkRef({
      book: book(),
      nodes: source,
      targetNodeId: materialCatalogIds.nodeId('node-1'),
      ref: ref(),
    });

    expect(source[0]!.materialRefs).toHaveLength(0);
    expect(next[0]!.materialRefs).toEqual([ref()]);
    expect(next[0]).not.toBe(source[0]);
  });

  it('rejects an existing Book-wide ref id, missing node, and non-private target', () => {
    const existing = [{ ...nodes()[0]!, materialRefs: [ref()] }];
    expect(() => appendPublicBookCanonicalForkRef({
      book: book(), nodes: existing, targetNodeId: materialCatalogIds.nodeId('node-1'), ref: ref(),
    })).toThrow('public_book_fork_placement_conflict');
    expect(() => appendPublicBookCanonicalForkRef({
      book: book(), nodes: nodes(), targetNodeId: materialCatalogIds.nodeId('missing'), ref: ref(),
    })).toThrow('public_book_fork_target_node_not_found');
    expect(() => appendPublicBookCanonicalForkRef({
      book: { ...book(), visibility: 'public-library-published' },
      nodes: nodes(), targetNodeId: materialCatalogIds.nodeId('node-1'), ref: ref(),
    })).toThrow('public_book_fork_target_visibility_denied');
  });
});
