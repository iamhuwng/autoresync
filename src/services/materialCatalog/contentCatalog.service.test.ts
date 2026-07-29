import { describe, expect, it } from 'vitest';
import { createBookContextAdapterRegistry } from '../book-delivery/bookContextAdapterRegistry.service';
import type {
  ContentCatalogBookRecord,
  ContentCatalogRepository,
} from './contentCatalog.service';
import { ContentCatalogError, createContentCatalog } from './contentCatalog.service';

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

const book = (
  overrides: Partial<ContentCatalogBookRecord> = {},
): ContentCatalogBookRecord => ({
  bookId: 'book-1',
  title: 'Public Book',
  publicTree: true,
  publication: 'trusted',
  source: 'ready',
  capabilities: { preview: true, launch: true, sourceAssisted: true },
  nodes: [
    {
      nodeId: 'section-1',
      parentNodeId: null,
      kind: 'section',
      title: 'Section',
      order: 1,
      activities: [],
    },
    {
      nodeId: 'chapter-1',
      parentNodeId: 'section-1',
      kind: 'chapter',
      title: 'Chapter',
      order: 1,
      activities: [],
    },
    {
      nodeId: 'unit-1',
      parentNodeId: 'chapter-1',
      kind: 'unit',
      title: 'Unit',
      order: 1,
      activities: [{
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-version-1',
        title: 'Activity',
        order: 1,
      }],
    },
  ],
  ...overrides,
});

const setup = (
  records: readonly ContentCatalogBookRecord[] = [book()],
  entitlement: 'active' | 'none' | 'revoked' = 'active',
) => {
  const repository: ContentCatalogRepository = {
    listPublicBooks: async () => records,
    readPublicBook: async (bookId) => records.find((entry) => entry.bookId === bookId) ?? null,
    resolveEntitlement: async () => entitlement,
  };
  return createContentCatalog({
    repository,
    adapterRegistry: createBookContextAdapterRegistry([declaration]),
    adapterId: declaration.adapterId,
  });
};

describe('ContentCatalog', () => {
  it('browses the Book hierarchy and resolves a structure-preserving Activity selection', async () => {
    const catalog = setup();
    const books = await catalog.browseChildren({ kind: 'catalog' }, { actorId: 'teacher-1' });
    const sections = await catalog.browseChildren(
      { kind: 'book', bookId: 'book-1' },
      { actorId: 'teacher-1' },
    );
    const chapters = await catalog.browseChildren(
      { kind: 'section', bookId: 'book-1', nodeId: 'section-1' },
      { actorId: 'teacher-1' },
    );
    const units = await catalog.browseChildren(
      { kind: 'chapter', bookId: 'book-1', nodeId: 'chapter-1' },
      { actorId: 'teacher-1' },
    );
    const activities = await catalog.browseChildren(
      { kind: 'unit', bookId: 'book-1', nodeId: 'unit-1' },
      { actorId: 'teacher-1' },
    );

    expect(books[0]?.selection.kind).toBe('book');
    expect(sections[0]?.selection.kind).toBe('section');
    expect(chapters[0]?.selection.kind).toBe('chapter');
    expect(units[0]?.selection.kind).toBe('unit');
    expect(activities[0]).toMatchObject({
      selection: {
        kind: 'activity',
        bookId: 'book-1',
        nodeId: 'unit-1',
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-version-1',
      },
      parent: { kind: 'unit', bookId: 'book-1', nodeId: 'unit-1' },
      state: 'playable',
      provenance: { adapterId: 'public-reference-v1', adapterVersion: 1 },
    });
  });

  it.each([
    [book({ publicTree: false }), 'active', 'metadata-only'],
    [book(), 'none', 'tree-public-runtime-blocked'],
    [book({ publication: 'revoked' }), 'active', 'tree-public-runtime-blocked'],
    [book({ publication: 'replaced' }), 'active', 'tree-public-runtime-blocked'],
    [book({ source: 'revoked' }), 'active', 'tree-public-runtime-blocked'],
    [book({ capabilities: { preview: true, launch: false, sourceAssisted: false } }), 'active', 'tree-public-runtime-blocked'],
  ] as const)('classifies safe public state without optimistic capability', async (
    record,
    entitlement,
    expected,
  ) => {
    const catalog = setup([record], entitlement);
    await expect(catalog.resolveSelection(
      { kind: 'book', bookId: 'book-1' },
      { actorId: 'teacher-1' },
    )).resolves.toMatchObject({ state: expected });
  });

  it('authorizes ready source-assisted preview but denies metadata-only preview and blocked launch', async () => {
    await expect(setup().resolveSelection(
      {
        kind: 'activity',
        bookId: 'book-1',
        nodeId: 'unit-1',
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-version-1',
      },
      { actorId: 'teacher-1', intent: 'preview' },
    )).resolves.toMatchObject({ state: 'playable' });

    await expect(setup([book({ publicTree: false })]).resolveSelection(
      { kind: 'book', bookId: 'book-1' },
      { actorId: 'teacher-1', intent: 'preview' },
    )).rejects.toMatchObject({ code: 'preview_not_authorized' });
    await expect(setup([book()], 'revoked').resolveSelection(
      { kind: 'book', bookId: 'book-1' },
      { actorId: 'teacher-1', intent: 'launch' },
    )).rejects.toMatchObject({ code: 'launch_not_authorized' });
  });

  it('rejects malformed, mismatched, and stale selections', async () => {
    const catalog = setup();
    await expect(catalog.resolveSelection(
      { kind: 'book', bookId: '../private', extra: true } as never,
      { actorId: 'teacher-1' },
    )).rejects.toBeInstanceOf(ContentCatalogError);
    await expect(catalog.resolveSelection(
      { kind: 'chapter', bookId: 'book-1', nodeId: 'unit-1' },
      { actorId: 'teacher-1' },
    )).rejects.toMatchObject({ code: 'selection_kind_mismatch' });
    await expect(catalog.resolveSelection(
      {
        kind: 'activity',
        bookId: 'book-1',
        nodeId: 'unit-1',
        placementId: 'placement-old',
        activityId: 'activity-1',
        activityVersionId: 'activity-version-1',
      },
      { actorId: 'teacher-1' },
    )).rejects.toMatchObject({ code: 'selection_not_found' });
  });

  it('returns only bounded safe fields', async () => {
    const resolved = await setup().resolveSelection(
      { kind: 'book', bookId: 'book-1' },
      { actorId: 'teacher-1' },
    );
    const json = JSON.stringify(resolved);
    for (const forbidden of [
      'provider', 'objectKey', 'answerKey', 'teacherNotes', 'candidate',
      'homework', 'credentials', 'private', 'sourceVersionId',
    ]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('requires a verified public-reference adapter and never auto-adopts replacement', () => {
    expect(() => createContentCatalog({
      repository: {
        listPublicBooks: async () => [],
        readPublicBook: async () => null,
        resolveEntitlement: async () => 'none',
      },
      adapterRegistry: createBookContextAdapterRegistry([declaration]),
      adapterId: 'missing-adapter',
    })).toThrow('public_reference_adapter_unavailable');
    expect(declaration.sourceReplacement).toMatchObject({
      mode: 'invalidation-only',
      automaticUpdate: false,
    });
  });

  it('rejects broken parent references and public-reference declarations missing invalidation proof', async () => {
    await expect(setup([book({
      nodes: [{
        nodeId: 'unit-1',
        parentNodeId: 'missing-parent',
        kind: 'unit',
        title: 'Broken Unit',
        order: 1,
        activities: [],
      }],
    })]).resolveSelection(
      { kind: 'book', bookId: 'book-1' },
      { actorId: 'teacher-1' },
    )).rejects.toMatchObject({ code: 'invalid_catalog_record' });

    expect(() => createContentCatalog({
      repository: {
        listPublicBooks: async () => [],
        readPublicBook: async () => null,
        resolveEntitlement: async () => 'none',
      },
      adapterRegistry: createBookContextAdapterRegistry([{
        ...declaration,
        classification: { ...declaration.classification, supportedEffects: ['unchanged'] },
      }]),
      adapterId: declaration.adapterId,
    })).toThrow('public_reference_adapter_unavailable');
  });

});
