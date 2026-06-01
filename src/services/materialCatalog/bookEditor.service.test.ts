import { describe, expect, it } from 'vitest';
import { materialCatalogIds, type MaterialBookNode } from '../../types/materialCatalog.types';
import {
  attachMaterialRefToNode,
  createBookEditorNode,
  filterPublishedMaterialSummaries,
  getBookNodeDepth,
  moveBookNode,
  reorderBookNode,
} from './bookEditor.service';

const NOW = '2026-06-01T00:00:00.000Z';

const makeNode = (overrides: Partial<MaterialBookNode> = {}): MaterialBookNode => ({
  nodeId: materialCatalogIds.nodeId('node-1'),
  bookId: materialCatalogIds.bookId('book-1'),
  parentNodeId: null,
  type: 'section',
  title: 'Section 1',
  order: 1,
  materialRefs: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('bookEditor.service', () => {
  it('creates stable Book nodes and tracks placeholder-only draft readiness separately', () => {
    const intro = createBookEditorNode({
      bookId: 'book-1',
      nodeId: 'intro-1',
      type: 'intro-placeholder',
      title: 'Intro',
      parentNodeId: null,
      order: 1,
      now: () => NOW,
    });

    expect(intro).toMatchObject({
      nodeId: 'intro-1',
      bookId: 'book-1',
      parentNodeId: null,
      type: 'intro-placeholder',
      title: 'Intro',
      order: 1,
      materialRefs: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('computes depth, rejects depth 6 moves, self-parenting, and move-under-descendant', () => {
    const nodes = [
      makeNode({ nodeId: materialCatalogIds.nodeId('n1'), parentNodeId: null, order: 1 }),
      makeNode({ nodeId: materialCatalogIds.nodeId('n2'), parentNodeId: materialCatalogIds.nodeId('n1'), order: 1 }),
      makeNode({ nodeId: materialCatalogIds.nodeId('n3'), parentNodeId: materialCatalogIds.nodeId('n2'), order: 1 }),
      makeNode({ nodeId: materialCatalogIds.nodeId('n4'), parentNodeId: materialCatalogIds.nodeId('n3'), order: 1 }),
      makeNode({ nodeId: materialCatalogIds.nodeId('n5'), parentNodeId: materialCatalogIds.nodeId('n4'), order: 1 }),
    ];

    expect(getBookNodeDepth(nodes, 'n5')).toBe(5);
    expect(() => moveBookNode(nodes, 'n1', 'n3')).toThrow(/descendant/i);
    expect(() => moveBookNode(nodes, 'n3', 'n3')).toThrow(/self/i);
    expect(() => moveBookNode(nodes, 'n1', 'n5')).toThrow(/depth/i);
  });

  it('reorders nodes only within siblings', () => {
    const nodes = [
      makeNode({ nodeId: materialCatalogIds.nodeId('a'), title: 'A', order: 1 }),
      makeNode({ nodeId: materialCatalogIds.nodeId('b'), title: 'B', order: 2 }),
      makeNode({ nodeId: materialCatalogIds.nodeId('c'), title: 'C', parentNodeId: materialCatalogIds.nodeId('a'), order: 1 }),
    ];

    const reordered = reorderBookNode(nodes, 'b', 'up');

    expect(reordered.find((node) => node.nodeId === 'b')?.order).toBe(1);
    expect(reordered.find((node) => node.nodeId === 'a')?.order).toBe(2);
    expect(reordered.find((node) => node.nodeId === 'c')?.order).toBe(1);
  });

  it('filters published picker summaries and allows duplicate material placement with unique refIds', () => {
    const materials = filterPublishedMaterialSummaries([
      { materialId: 'draft-1', title: 'Draft', materialKind: 'full-test', status: 'draft', testTypeIds: ['ielts'] },
      { materialId: 'published-1', title: 'Published', materialKind: 'full-test', status: 'published', testTypeIds: ['ielts'] },
      { materialId: 'passage-1', title: 'Passage', materialKind: 'reading-passage', publishedSnapshotVersionId: 'snapshot-1', testTypeIds: ['ielts'] },
    ]);

    expect(materials.map((material) => material.materialId)).toEqual(['published-1', 'passage-1']);

    const node = makeNode();
    const first = attachMaterialRefToNode(node, materials[1], {
      actorId: 'teacher-1',
      refId: 'ref-1',
      now: () => NOW,
    });
    const second = attachMaterialRefToNode(first, materials[1], {
      actorId: 'teacher-1',
      refId: 'ref-2',
      now: () => NOW,
    });

    expect(second.materialRefs.map((ref) => ref.refId)).toEqual(['ref-1', 'ref-2']);
    expect(second.materialRefs.every((ref) => ref.materialId === 'passage-1')).toBe(true);
  });
});
