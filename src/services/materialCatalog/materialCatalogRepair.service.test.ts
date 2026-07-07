import { describe, expect, it } from 'vitest';
import type {
  MaterialBookMetadata,
  MaterialBookNode,
} from '../../types/materialCatalog.types';
import type { ReadingV2FullTestComposition } from '../../types/readingV2.types';
import {
  buildMaterialCatalogRepairUpdatePayload,
  createMaterialCatalogRepairWritePlan,
  planMaterialCatalogRepairOperations,
} from './materialCatalogRepair.service';

const book = (overrides: Partial<MaterialBookMetadata> = {}): MaterialBookMetadata => ({
  bookId: 'book-1' as MaterialBookMetadata['bookId'],
  ownerId: 'teacher-1',
  title: 'Current Book',
  authors: [],
  primaryTestTypeId: 'ielts' as MaterialBookMetadata['primaryTestTypeId'],
  testTypeIds: ['ielts' as MaterialBookMetadata['testTypeIds'][number]],
  tags: [],
  visibility: 'private',
  status: 'ready',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  ...overrides,
});

const node = (overrides: Partial<MaterialBookNode> = {}): MaterialBookNode => ({
  nodeId: 'node-1' as MaterialBookNode['nodeId'],
  bookId: 'book-1' as MaterialBookNode['bookId'],
  parentNodeId: null,
  type: 'chapter',
  title: 'Chapter',
  order: 1,
  materialRefs: [],
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  ...overrides,
});

const composition = (overrides: Partial<ReadingV2FullTestComposition> = {}): ReadingV2FullTestComposition => ({
  deliveryEngine: 'reading-v2',
  plane: 'packaging',
  schemaVersion: 1,
  compositionId: 'composition-1' as ReadingV2FullTestComposition['compositionId'],
  testMaterialId: 'material-1' as ReadingV2FullTestComposition['testMaterialId'],
  title: 'Composed Test',
  testTypeIds: ['ielts' as ReadingV2FullTestComposition['testTypeIds'][number]],
  skill: 'reading',
  passageRefs: [],
  questionCount: 0,
  numbering: {
    interactionDisplayNumbers: {},
    passageRanges: [],
    totalQuestionCount: 0,
  },
  visibility: 'private',
  ownerId: 'teacher-1',
  publishedVersionId: 'snapshot-1' as ReadingV2FullTestComposition['publishedVersionId'],
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  ...overrides,
});

describe('materialCatalogRepair.service', () => {
  it('plans stale material index repairs without touching canonical material records', () => {
    const operations = planMaterialCatalogRepairOperations({
      materialSummaries: [
        {
          materialId: 'passage-1',
          ownerId: 'teacher-1',
          title: 'Current Passage',
          visibility: 'private',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts' as any],
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
      materialIndexRowsByPath: {
        'material_catalog/material_indexes/by_owner/teacher-1/passage-1': {
          materialId: 'passage-1',
          ownerId: 'teacher-1',
          title: 'Stale Passage',
          visibility: 'private',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
        'material_catalog/material_indexes/by_visibility/public/passage-1': {
          materialId: 'passage-1',
          ownerId: 'teacher-1',
          title: 'Current Passage',
          visibility: 'public',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      },
    });

    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'material-index-write',
        path: 'material_catalog/material_indexes/by_owner/teacher-1/passage-1',
      }),
      {
        kind: 'material-index-remove',
        path: 'material_catalog/material_indexes/by_visibility/public/passage-1',
        value: null,
        reason: 'stale-material-index-path',
      },
    ]));
  });

  it('removes material index rows for ids no longer present in canonical summaries', () => {
    const operations = planMaterialCatalogRepairOperations({
      materialSummaries: [
        {
          materialId: 'current-passage',
          ownerId: 'teacher-1',
          title: 'Current Passage',
          visibility: 'private',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts' as any],
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
      materialIndexRowsByPath: {
        'material_catalog/material_indexes/by_owner/teacher-9/orphan-passage': {
          materialId: 'orphan-passage',
          ownerId: 'teacher-9',
          title: 'Orphan Passage',
          visibility: 'private',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      },
    });

    expect(operations).toContainEqual({
      kind: 'material-index-remove',
      path: 'material_catalog/material_indexes/by_owner/teacher-9/orphan-passage',
      value: null,
      reason: 'stale-material-index-path',
    });
    expect(operations).toContainEqual(expect.objectContaining({
      kind: 'material-index-write',
      path: 'material_catalog/material_indexes/by_owner/teacher-1/current-passage',
    }));
  });

  it('plans Book index and orphan-node cleanup from canonical Book metadata', () => {
    const operations = planMaterialCatalogRepairOperations({
      books: [book()],
      bookIndexRowsByPath: {
        'material_catalog/book_indexes/by_visibility/public-library-published/book-1': {
          bookId: 'book-1',
          ownerId: 'teacher-1',
          title: 'Old public Book',
          visibility: 'public-library-published',
          status: 'ready',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          tags: [],
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      },
      bookNodesByBookId: {
        'book-1': {
          'node-1': node(),
          'orphan-child': node({
            nodeId: 'orphan-child' as MaterialBookNode['nodeId'],
            parentNodeId: 'missing-parent' as MaterialBookNode['parentNodeId'],
          }),
          'orphan-grandchild': node({
            nodeId: 'orphan-grandchild' as MaterialBookNode['nodeId'],
            parentNodeId: 'orphan-child' as MaterialBookNode['parentNodeId'],
          }),
        },
        'missing-book': {
          'dangling-node': node({
            nodeId: 'dangling-node' as MaterialBookNode['nodeId'],
            bookId: 'missing-book' as MaterialBookNode['bookId'],
          }),
        },
      },
    });

    expect(operations).toEqual(expect.arrayContaining([
      {
        kind: 'book-index-remove',
        path: 'material_catalog/book_indexes/by_visibility/public-library-published/book-1',
        value: null,
        reason: 'stale-book-index-path',
      },
      {
        kind: 'book-node-remove',
        path: 'material_catalog/book_nodes/book-1/orphan-child',
        value: null,
        reason: 'orphan-book-node',
      },
      {
        kind: 'book-node-remove',
        path: 'material_catalog/book_nodes/book-1/orphan-grandchild',
        value: null,
        reason: 'orphan-book-node',
      },
      {
        kind: 'book-node-remove',
        path: 'material_catalog/book_nodes/missing-book/dangling-node',
        value: null,
        reason: 'orphan-book-node',
      },
    ]));
    expect(operations).not.toContainEqual(expect.objectContaining({
      path: 'material_catalog/book_nodes/book-1/node-1',
    }));
  });

  it('removes Book index rows for books no longer present in canonical metadata', () => {
    const operations = planMaterialCatalogRepairOperations({
      books: [book()],
      bookIndexRowsByPath: {
        'material_catalog/book_indexes/by_owner/teacher-9/orphan-book': {
          bookId: 'orphan-book',
          ownerId: 'teacher-9',
          title: 'Orphan Book',
          authors: [],
          visibility: 'private',
          status: 'ready',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          tags: [],
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      },
    });

    expect(operations).toContainEqual({
      kind: 'book-index-remove',
      path: 'material_catalog/book_indexes/by_owner/teacher-9/orphan-book',
      value: null,
      reason: 'stale-book-index-path',
    });
    expect(operations).toContainEqual(expect.objectContaining({
      kind: 'book-index-write',
      path: 'material_catalog/book_indexes/by_owner/teacher-1/book-1',
    }));
  });

  it('does not re-plan repaired rows when Firebase returns matching objects with different key order', () => {
    const firebaseReturnedRow = {
      materialId: 'passage-1',
      materialKind: 'reading-passage',
      ownerId: 'teacher-1',
      testTypeIds: ['ielts'],
      testTypeMembership: { ielts: true },
      title: 'Current Passage',
      updatedAt: '2026-06-02T00:00:00.000Z',
      visibility: 'private',
    };
    const operations = planMaterialCatalogRepairOperations({
      materialSummaries: [
        {
          materialId: 'passage-1',
          ownerId: 'teacher-1',
          title: 'Current Passage',
          visibility: 'private',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts' as any],
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
      materialIndexRowsByPath: {
        'material_catalog/material_indexes/by_owner/teacher-1/passage-1': firebaseReturnedRow,
        'material_catalog/material_indexes/by_visibility/private/passage-1': firebaseReturnedRow,
        'material_catalog/material_indexes/by_material_kind/reading-passage/passage-1': firebaseReturnedRow,
        'material_catalog/material_indexes/by_test_type/ielts/passage-1': firebaseReturnedRow,
      },
    });

    expect(operations).toEqual([]);
  });

  it('does not re-plan rows when Firebase omits empty arrays and objects', () => {
    const operations = planMaterialCatalogRepairOperations({
      materialSummaries: [
        {
          materialId: 'material-without-test-type',
          ownerId: 'teacher-1',
          title: 'No Test Type',
          visibility: 'private',
          materialKind: 'full-test',
          testTypeIds: [],
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
      materialIndexRowsByPath: {
        'material_catalog/material_indexes/by_owner/teacher-1/material-without-test-type': {
          materialId: 'material-without-test-type',
          ownerId: 'teacher-1',
          title: 'No Test Type',
          visibility: 'private',
          materialKind: 'full-test',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
        'material_catalog/material_indexes/by_visibility/private/material-without-test-type': {
          materialId: 'material-without-test-type',
          ownerId: 'teacher-1',
          title: 'No Test Type',
          visibility: 'private',
          materialKind: 'full-test',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
        'material_catalog/material_indexes/by_material_kind/full-test/material-without-test-type': {
          materialId: 'material-without-test-type',
          ownerId: 'teacher-1',
          title: 'No Test Type',
          visibility: 'private',
          materialKind: 'full-test',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      },
      books: [book({
        bookId: 'book-without-tags' as MaterialBookMetadata['bookId'],
        tags: [],
      })],
      bookIndexRowsByPath: {
        'material_catalog/book_indexes/by_owner/teacher-1/book-without-tags': {
          bookId: 'book-without-tags',
          ownerId: 'teacher-1',
          title: 'Current Book',
          authors: [],
          visibility: 'private',
          status: 'ready',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
        'material_catalog/book_indexes/by_visibility/private/book-without-tags': {
          bookId: 'book-without-tags',
          ownerId: 'teacher-1',
          title: 'Current Book',
          authors: [],
          visibility: 'private',
          status: 'ready',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
        'material_catalog/book_indexes/by_test_type/ielts/book-without-tags': {
          bookId: 'book-without-tags',
          ownerId: 'teacher-1',
          title: 'Current Book',
          authors: [],
          visibility: 'private',
          status: 'ready',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      },
    });

    expect(operations).toEqual([]);
  });

  it('plans malformed Book node cleanup by RTDB key instead of stored nodeId', () => {
    const operations = planMaterialCatalogRepairOperations({
      books: [book()],
      bookNodesByBookId: {
        'book-1': {
          'safe-node-key': node({
            nodeId: 'escaped/path' as MaterialBookNode['nodeId'],
          }),
        },
      },
    });

    expect(operations).toContainEqual({
      kind: 'book-node-remove',
      path: 'material_catalog/book_nodes/book-1/safe-node-key',
      value: null,
      reason: 'orphan-book-node',
    });
    expect(operations).not.toContainEqual(expect.objectContaining({
      path: 'material_catalog/book_nodes/book-1/escaped/path',
    }));
  });

  it('plans missing Reading V2 composition-version writes from composition records', () => {
    const existing = composition({
      compositionId: 'composition-existing' as ReadingV2FullTestComposition['compositionId'],
      publishedVersionId: 'snapshot-existing' as ReadingV2FullTestComposition['publishedVersionId'],
    });
    const missing = composition();

    const operations = planMaterialCatalogRepairOperations({
      readingV2FullTestCompositions: {
        [missing.compositionId]: missing,
        [existing.compositionId]: existing,
      },
      readingV2FullTestCompositionVersionsByPath: {
        'reading_v2/full_test_composition_versions/composition-existing/snapshot-existing': {
          ...existing,
          publishedAt: existing.updatedAt,
          publishedBy: existing.ownerId,
        },
      },
    });

    expect(operations).toContainEqual({
      kind: 'composition-version-write',
      path: 'reading_v2/full_test_composition_versions/composition-1/snapshot-1',
      value: {
        ...missing,
        publishedAt: missing.updatedAt,
        publishedBy: missing.ownerId,
      },
      reason: 'composition-without-version',
    });
    expect(operations).not.toContainEqual(expect.objectContaining({
      path: 'reading_v2/full_test_composition_versions/composition-existing/snapshot-existing',
    }));
  });

  it('requires approval before turning dry-run operations into write payloads', () => {
    const operations = planMaterialCatalogRepairOperations({
      materialSummaries: [
        {
          materialId: 'passage-1',
          ownerId: 'teacher-1',
          title: 'Current Passage',
          visibility: 'private',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts' as any],
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
      materialIndexRowsByPath: {
        'material_catalog/material_indexes/by_owner/teacher-1/passage-1': {
          materialId: 'passage-1',
          ownerId: 'teacher-1',
          title: 'Stale Passage',
          visibility: 'private',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts'],
          testTypeMembership: { ielts: true },
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      },
    });

    expect(() => createMaterialCatalogRepairWritePlan({ operations }))
      .toThrow(/approved/i);

    const writes = createMaterialCatalogRepairWritePlan({
      operations,
      approvedBy: 'lead-1',
    });

    expect(writes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        approvedBy: 'lead-1',
        path: 'material_catalog/material_indexes/by_owner/teacher-1/passage-1',
        kind: 'material-index-write',
      }),
    ]));
    const payload = buildMaterialCatalogRepairUpdatePayload(writes);

    expect(payload).toMatchObject({
      'material_catalog/material_indexes/by_owner/teacher-1/passage-1': {
        materialId: 'passage-1',
        title: 'Current Passage',
      },
    });
    expect(
      payload['material_catalog/material_indexes/by_owner/teacher-1/passage-1'],
    ).not.toHaveProperty('sourceFullTestId');
  });
});
