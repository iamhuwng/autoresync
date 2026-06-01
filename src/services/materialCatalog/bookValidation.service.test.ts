import { describe, expect, it } from 'vitest';
import {
  materialCatalogIds,
  type MaterialBookMaterialRef,
  type MaterialBookMetadata,
  type MaterialBookNode,
} from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from './testTypeConfig.service';
import {
  deriveMaterialBookStatus,
  validateMaterialBook,
  validateMaterialBookModerationTransition,
  validateMaterialBookNodes,
  type MaterialBookValidationContext,
} from './bookValidation.service';

const NOW = '2026-06-01T00:00:00.000Z';

const metadata = (overrides: Partial<MaterialBookMetadata> = {}): MaterialBookMetadata => ({
  bookId: materialCatalogIds.bookId('book-1'),
  ownerId: 'teacher-1',
  title: 'Cambridge IELTS 18',
  subtitle: 'Academic Reading',
  authors: ['Cambridge University Press'],
  publisher: 'Cambridge',
  edition: '18',
  series: 'Cambridge IELTS',
  isbn: '9780000000000',
  coverUrl: '',
  primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
  testTypeIds: [materialCatalogIds.testTypeId('ielts')],
  tags: ['reading'],
  description: 'Practice book',
  visibility: 'private',
  status: 'draft-empty',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  ...overrides,
});

const materialRef = (overrides: Partial<MaterialBookMaterialRef> = {}): MaterialBookMaterialRef => ({
  refId: materialCatalogIds.refId('ref-1'),
  materialId: 'passage-1',
  materialKind: 'reading-passage',
  snapshotVersionId: 'snapshot-1',
  titleSnapshot: 'Passage 1',
  testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
  visibilitySnapshot: 'private',
  availability: 'available',
  updateState: 'current',
  order: 1,
  addedAt: NOW,
  addedBy: 'teacher-1',
  ...overrides,
});

const node = (overrides: Partial<MaterialBookNode> = {}): MaterialBookNode => ({
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

const context = (overrides: Partial<MaterialBookValidationContext> = {}): MaterialBookValidationContext => ({
  actorId: 'teacher-1',
  actorRole: 'teacher',
  testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
  ...overrides,
});

describe('bookValidation.service', () => {
  it('allows an empty draft Book when title, owner, visibility, status, and Test Type ids are valid', () => {
    const result = validateMaterialBook({
      metadata: metadata(),
      nodes: [],
      context: context(),
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(deriveMaterialBookStatus([])).toBe('draft-empty');
  });

  it('requires core Book fields and at least one Test Type id', () => {
    const result = validateMaterialBook({
      metadata: metadata({
        title: '',
        ownerId: '',
        testTypeIds: [],
        visibility: 'bad' as any,
        status: 'bad' as any,
      }),
      nodes: [],
      context: context(),
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-title' }),
        expect.objectContaining({ code: 'missing-owner' }),
        expect.objectContaining({ code: 'missing-test-type' }),
        expect.objectContaining({ code: 'invalid-visibility' }),
        expect.objectContaining({ code: 'invalid-status' }),
      ]),
    );
  });

  it('keeps placeholder-only Books in draft status and marks structural nodes ready-capable', () => {
    expect(deriveMaterialBookStatus([
      node({ type: 'intro-placeholder', materialRefs: [materialRef()] }),
      node({ nodeId: materialCatalogIds.nodeId('toc'), type: 'toc-placeholder', order: 2 }),
    ])).toBe('draft-in-progress');
    expect(deriveMaterialBookStatus([node({ type: 'chapter' })])).toBe('ready');
  });

  it('allows all node types to contain child nodes and material refs', () => {
    const parent = node({
      nodeId: materialCatalogIds.nodeId('intro'),
      type: 'intro-placeholder',
      materialRefs: [materialRef()],
    });
    const child = node({
      nodeId: materialCatalogIds.nodeId('intro-child'),
      parentNodeId: parent.nodeId,
      type: 'test',
      order: 1,
      materialRefs: [materialRef({ refId: materialCatalogIds.refId('ref-2') })],
    });

    expect(validateMaterialBookNodes(metadata(), [parent, child], context()).valid).toBe(true);
  });

  it('rejects invalid node types, self-parenting, cycles, duplicate sibling order, orphan children, descendant moves, and depth 6', () => {
    const tooDeep = [
      node({ nodeId: materialCatalogIds.nodeId('d1'), parentNodeId: null, order: 1 }),
      node({ nodeId: materialCatalogIds.nodeId('d2'), parentNodeId: materialCatalogIds.nodeId('d1'), order: 1 }),
      node({ nodeId: materialCatalogIds.nodeId('d3'), parentNodeId: materialCatalogIds.nodeId('d2'), order: 1 }),
      node({ nodeId: materialCatalogIds.nodeId('d4'), parentNodeId: materialCatalogIds.nodeId('d3'), order: 1 }),
      node({ nodeId: materialCatalogIds.nodeId('d5'), parentNodeId: materialCatalogIds.nodeId('d4'), order: 1 }),
      node({ nodeId: materialCatalogIds.nodeId('d6'), parentNodeId: materialCatalogIds.nodeId('d5'), order: 1 }),
    ];
    const result = validateMaterialBookNodes(
      metadata(),
      [
        node({ nodeId: materialCatalogIds.nodeId('bad-type'), type: 'unit' as any, order: 1 }),
        node({ nodeId: materialCatalogIds.nodeId('self'), parentNodeId: materialCatalogIds.nodeId('self'), order: 2 }),
        node({ nodeId: materialCatalogIds.nodeId('a'), parentNodeId: materialCatalogIds.nodeId('b'), order: 1 }),
        node({ nodeId: materialCatalogIds.nodeId('b'), parentNodeId: materialCatalogIds.nodeId('a'), order: 1 }),
        node({ nodeId: materialCatalogIds.nodeId('dup-1'), parentNodeId: null, order: 3 }),
        node({ nodeId: materialCatalogIds.nodeId('dup-2'), parentNodeId: null, order: 3 }),
        node({ nodeId: materialCatalogIds.nodeId('orphan'), parentNodeId: materialCatalogIds.nodeId('missing'), order: 1 }),
        ...tooDeep,
      ],
      context(),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-node-type' }),
        expect.objectContaining({ code: 'self-parent' }),
        expect.objectContaining({ code: 'cycle' }),
        expect.objectContaining({ code: 'duplicate-sibling-order' }),
        expect.objectContaining({ code: 'orphan-node' }),
        expect.objectContaining({ code: 'depth-exceeded' }),
      ]),
    );
  });

  it('rejects draft refs, duplicate ref ids, and public Books with private refs', () => {
    const publicBook = metadata({ visibility: 'public-library-pending-review' });
    const result = validateMaterialBookNodes(
      publicBook,
      [
        node({
          materialRefs: [
            materialRef({ refId: materialCatalogIds.refId('draft-ref'), materialKind: 'draft', snapshotVersionId: undefined }),
            materialRef({ refId: materialCatalogIds.refId('dup-ref'), visibilitySnapshot: 'private' }),
            materialRef({ refId: materialCatalogIds.refId('dup-ref'), order: 2 }),
          ],
        }),
      ],
      context(),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'draft-ref-not-allowed' }),
        expect.objectContaining({ code: 'duplicate-ref-id' }),
        expect.objectContaining({ code: 'public-book-private-ref' }),
      ]),
    );
  });

  it('warns but preserves inactive configured Test Types for render-only history', () => {
    const inactiveConfigs = DEFAULT_MATERIAL_TEST_TYPES.map((configItem) =>
      configItem.testTypeId === 'ielts' ? { ...configItem, active: false } : configItem,
    );
    const result = validateMaterialBook({
      metadata: metadata(),
      nodes: [],
      context: context({ testTypeConfigs: inactiveConfigs }),
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'inactive-test-type' })]),
    );
  });

  it('requires super_admin for public-library-published transition', () => {
    const current = metadata({ visibility: 'public-library-pending-review' });
    const next = metadata({ visibility: 'public-library-published' });

    expect(validateMaterialBookModerationTransition(current, next, context()).valid).toBe(false);
    expect(validateMaterialBookModerationTransition(current, next, context({ actorRole: 'super_admin' })).valid)
      .toBe(true);
  });
});
