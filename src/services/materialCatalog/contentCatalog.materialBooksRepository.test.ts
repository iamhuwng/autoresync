import { describe, expect, it, vi } from 'vitest';
import {
  materialCatalogIds,
  type MaterialBookMetadata,
  type MaterialBookPublicProjection,
} from '../../types/materialCatalog.types';
import { createBookContextAdapterRegistry } from '../book-delivery/bookContextAdapterRegistry.service';
import { createMaterialBookSummary } from './materialSummaryAdapters.service';
import {
  createMaterialBooksRepository,
  returnPublicBookToPrivate,
} from './materialBooks.service';
import { createContentCatalog } from './contentCatalog.service';
import { createMaterialBooksContentCatalogRepository } from './contentCatalog.materialBooksRepository';
import { DEFAULT_MATERIAL_TEST_TYPES } from './testTypeConfig.service';

const NOW = '2026-07-29T00:00:00.000Z';
const metadata: MaterialBookMetadata = {
  bookId: 'book-1',
  bookMode: 'pdf',
  ownerId: 'teacher-1',
  title: 'Public Book',
  authors: [],
  primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
  testTypeIds: [materialCatalogIds.testTypeId('ielts')],
  tags: [],
  visibility: 'public-library-published',
  status: 'ready',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  publicReview: {
    status: 'approved',
    reviewedAt: NOW,
    reviewedBy: 'admin-1',
  },
};
const projection: MaterialBookPublicProjection = {
  bookId: 'book-1',
  bookMode: 'pdf',
  title: 'Public Book',
  authors: [],
  testTypeIds: [materialCatalogIds.testTypeId('ielts')],
  tags: [],
  visibility: 'public-library-published',
  status: 'ready',
  updatedAt: NOW,
  approvedAt: NOW,
  approvedBy: 'admin-1',
  nodes: [
    {
      nodeId: 'intro-1',
      parentNodeId: null,
      type: 'intro-placeholder',
      title: 'Intro',
      order: 0,
      materialRefs: [],
    },
    {
      nodeId: 'unit-1',
      parentNodeId: 'intro-1',
      type: 'unit',
      title: 'Unit 1',
      order: 1,
      materialRefs: [{
        refId: 'placement-1',
        materialId: 'activity-1',
        materialKind: 'interactive-activity',
        snapshotVersionId: 'activity-version-1',
        title: 'Structured Activity',
        testTypeIds: [],
        order: 2,
      }],
    },
  ],
};
const declaration = {
  adapterId: 'public-reference-v1',
  adapterVersion: 1,
  contextKind: 'public-reference',
  contractVersion: 1,
  input: {
    version: 1,
    immutable: true,
    requiredFields: ['frozen-placement-binding', 'book-impact-classification'],
  },
  classification: {
    version: 1,
    supportedEffects: ['unchanged', 'invalidation', 'successor'],
  },
  sourceReplacement: {
    version: 1,
    mode: 'invalidation-only',
    automaticUpdate: false,
  },
  output: { version: 1, fields: ['impact-summary'] },
  conformance: {
    status: 'verified',
    contractVersion: 1,
    verifiedAdapterVersion: 1,
  },
} as const;

const createStore = () => {
  const values = new Map<string, unknown>([
    ['material_catalog/books/book-1', metadata],
    ['material_catalog/public_book_projections/book-1', projection],
    [
      'material_catalog/material_summary_indexes/v1/by_visibility/public/book-1',
      createMaterialBookSummary(metadata),
    ],
  ]);
  return {
    values,
    read: vi.fn(async (path: string) => {
      if (values.has(path)) return values.get(path);
      const prefix = `${path}/`;
      const children = [...values.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, value]) => [key.slice(prefix.length), value]);
      return children.length > 0 ? Object.fromEntries(children) : null;
    }),
    write: vi.fn(async (path: string, value: unknown) => {
      values.set(path, value);
    }),
    remove: vi.fn(async (path: string) => {
      values.delete(path);
    }),
  };
};

describe('MaterialBooks ContentCatalog adapter', () => {
  it('maps safe public projection identity and filters unsupported public nodes', async () => {
    const store = createStore();
    const books = createMaterialBooksRepository(store);
    const resolveReadiness = vi.fn(async () => ({
      publication: 'trusted' as const,
      source: 'ready' as const,
      capabilities: { preview: true, launch: true, sourceAssisted: true },
    }));
    const repository = createMaterialBooksContentCatalogRepository({
      books,
      resolveReadiness,
      resolveEntitlement: async () => 'active',
    });

    const record = await repository.readPublicBook('book-1', 'teacher-1');
    expect(record).toMatchObject({
      nodes: [{
        nodeId: 'unit-1',
        parentNodeId: null,
        activities: [{
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersionId: 'activity-version-1',
          order: 2,
        }],
      }],
    });
    expect(resolveReadiness).toHaveBeenCalledWith('book-1', 'teacher-1');
    expect(JSON.stringify(record))
      .not.toMatch(/provider|objectKey|sourceVersionId|credentials|private/u);
  });

  it('uses real repository rollback: projection disappears, owner survives, prior safe result stays frozen', async () => {
    const store = createStore();
    const books = createMaterialBooksRepository(store);
    const sourceBytes = vi.fn();
    const repository = createMaterialBooksContentCatalogRepository({
      books,
      resolveReadiness: async () => ({
        publication: 'trusted',
        source: 'ready',
        capabilities: { preview: true, launch: true, sourceAssisted: true },
      }),
      resolveEntitlement: async () => 'active',
    });
    const catalog = createContentCatalog({
      repository,
      adapterRegistry: createBookContextAdapterRegistry([declaration]),
      adapterId: declaration.adapterId,
    });
    const before = await catalog.resolveSelection(
      { kind: 'book', bookId: 'book-1' },
      { actorId: 'teacher-1' },
    );

    await returnPublicBookToPrivate(
      'book-1',
      'Catalog rollback.',
      books,
      {
        actorId: 'admin-1',
        actorRole: 'super_admin',
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        now: () => NOW,
      },
    );

    await expect(books.readPublicBookProjection?.('book-1')).resolves.toBeNull();
    await expect(catalog.browseChildren(
      { kind: 'catalog' },
      { actorId: 'teacher-1' },
    )).resolves.toEqual([]);
    await expect(catalog.resolveSelection(
      { kind: 'book', bookId: 'book-1' },
      { actorId: 'teacher-1' },
    )).rejects.toMatchObject({ code: 'selection_not_found' });
    const launchDocument = async () => {
      await catalog.resolveSelection(
        { kind: 'book', bookId: 'book-1' },
        { actorId: 'teacher-1', intent: 'launch' },
      );
      return sourceBytes();
    };
    await expect(launchDocument()).rejects.toMatchObject({ code: 'selection_not_found' });
    await expect(books.readBook('book-1')).resolves.toMatchObject({
      ownerId: 'teacher-1',
      visibility: 'private',
    });
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.provenance)).toBe(true);
    expect(JSON.stringify(before)).not.toMatch(
      /document|url|provider|objectKey|sourceVersionId|authorization|token/u,
    );
    expect(sourceBytes).not.toHaveBeenCalled();
  });
});
