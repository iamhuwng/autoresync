import { describe, expect, it, vi } from 'vitest';
import {
  materialCatalogIds,
  type MaterialBookMetadata,
  type MaterialBookNode,
} from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from './testTypeConfig.service';
import {
  approvePublicBook,
  buildMaterialBookIndexCleanup,
  buildMaterialBookIndexWrites,
  createBookDraft,
  createMaterialBooksRepository,
  listPublicBookReviewQueue,
  listTeacherBooks,
  rejectPublicBookReview,
  returnPublicBookToPrivate,
  updateBookMetadata,
  updateBookTree,
  type MaterialBooksRepository,
} from './materialBooks.service';

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

const createRepo = (
  books: readonly MaterialBookMetadata[] = [],
  nodesByBook: Readonly<Record<string, readonly MaterialBookNode[]>> = {},
): MaterialBooksRepository & {
  writes: Record<string, unknown>[];
  removals: string[];
  updates: Record<string, unknown | null>[];
  update: (payload: Record<string, unknown | null>) => Promise<void>;
  readPublicMaterialSummary: ReturnType<typeof vi.fn>;
} => {
  const bookMap = new Map(books.map((book) => [book.bookId, book]));
  const nodeMap = new Map(Object.entries(nodesByBook));
  const writes: Record<string, unknown>[] = [];
  const removals: string[] = [];
  const updates: Record<string, unknown | null>[] = [];
  const applyWrite = (path: string, value: unknown): void => {
    const bookMatch = path.match(/^material_catalog\/books\/(.+)$/);
    const nodeMatch = path.match(/^material_catalog\/book_nodes\/([^/]+)\/([^/]+)$/);

    if (bookMatch) {
      bookMap.set(bookMatch[1], value as MaterialBookMetadata);
    }

    if (nodeMatch) {
      const current = [...(nodeMap.get(nodeMatch[1]) ?? [])].filter(
        (entry) => entry.nodeId !== nodeMatch[2],
      );
      nodeMap.set(nodeMatch[1], [...current, value as MaterialBookNode]);
    }
  };

  return {
    writes,
    removals,
    updates,
    async readBook(bookId) {
      return bookMap.get(bookId) ?? null;
    },
    async listBookNodes(bookId) {
      return [...(nodeMap.get(bookId) ?? [])];
    },
    async listBooksByIndex(query) {
      const values = [...bookMap.values()];

      if (query.scope === 'private') {
        return values.filter((book) => book.ownerId === query.teacherId && book.visibility === 'private');
      }

      return values.filter((book) => book.visibility.startsWith('public-library-'));
    },
    async write(path, value) {
      writes.push({ path, value });
      applyWrite(path, value);
    },
    readPublicMaterialSummary: vi.fn(async () => null),
    async remove(path) {
      removals.push(path);
    },
    async update(payload) {
      updates.push(payload);
      Object.entries(payload).forEach(([path, value]) => {
        if (value === null) {
          removals.push(path);
          return;
        }

        applyWrite(path, value);
      });
    },
  };
};

describe('materialBooks.service', () => {
  it('writes an empty draft Book and indexes through material_catalog paths', async () => {
    const repo = createRepo();

    const book = await createBookDraft(
      {
        bookId: materialCatalogIds.bookId('book-1'),
        ownerId: 'teacher-1',
        title: 'Cambridge IELTS 18',
        authors: ['Cambridge'],
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        now: () => NOW,
      },
      repo,
      { actorId: 'teacher-1', actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES },
    );

    expect(book.status).toBe('draft-empty');
    expect(repo.writes).toEqual([]);
    expect(repo.removals).toEqual([]);
    expect(repo.updates).toHaveLength(1);
    expect(Object.keys(repo.updates[0])).toEqual(expect.arrayContaining([
      'material_catalog/books/book-1',
      'material_catalog/book_indexes/by_owner/teacher-1/book-1',
      'material_catalog/book_indexes/by_visibility/private/book-1',
      'material_catalog/book_indexes/by_test_type/ielts/book-1',
    ]));
  });

  it('writes initial nodes and marks structural Books ready', async () => {
    const repo = createRepo();

    const book = await createBookDraft(
      {
        bookId: materialCatalogIds.bookId('book-1'),
        ownerId: 'teacher-1',
        title: 'Book with section',
        authors: [],
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        initialNodes: [node()],
        now: () => NOW,
      },
      repo,
      { actorId: 'teacher-1', actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES },
    );

    expect(book.status).toBe('ready');
    expect(repo.writes).toEqual([]);
    expect(Object.keys(repo.updates[0])).toContain('material_catalog/book_nodes/book-1/node-1');
  });

  it('updates metadata and cleans stale visibility/Test Type indexes', async () => {
    const repo = createRepo([metadata({
      visibility: 'private',
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      updatedAt: 'old',
    })]);

    const updated = await updateBookMetadata(
      'book-1',
      {
        visibility: 'public-library-pending-review',
        testTypeIds: [materialCatalogIds.testTypeId('toeic')],
        title: 'Updated Book',
      },
      repo,
      { actorId: 'teacher-1', actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
    );

    expect(updated.visibility).toBe('public-library-pending-review');
    expect(updated.updatedAt).toBe(NOW);
    expect(repo.writes).toEqual([]);
    expect(repo.removals).toEqual([
      'material_catalog/book_indexes/by_visibility/private/book-1',
      'material_catalog/book_indexes/by_test_type/ielts/book-1',
    ]);
    expect(repo.updates).toHaveLength(1);
    expect(repo.updates[0]).toMatchObject({
      'material_catalog/book_indexes/by_visibility/private/book-1': null,
      'material_catalog/book_indexes/by_test_type/ielts/book-1': null,
      'material_catalog/book_indexes/by_visibility/public-library-pending-review/book-1': expect.any(Object),
      'material_catalog/book_indexes/by_test_type/toeic/book-1': expect.any(Object),
    });
  });

  it('updates Book tree with conflict check and rejects invalid depth', async () => {
    const repo = createRepo([metadata({ updatedAt: 'base' })], {
      'book-1': [node()],
    });
    const nextNode = node({
      nodeId: materialCatalogIds.nodeId('chapter-1'),
      type: 'chapter',
      order: 1,
    });

    await expect(
      updateBookTree(
        'book-1',
        [nextNode],
        { expectedUpdatedAt: 'stale' },
        repo,
        { actorId: 'teacher-1', actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
      ),
    ).rejects.toThrow(/changed since it was loaded/);

    const result = await updateBookTree(
      'book-1',
      [nextNode],
      { expectedUpdatedAt: 'base' },
      repo,
      { actorId: 'teacher-1', actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
    );

    expect(result.metadata.status).toBe('ready');
    expect(repo.writes).toEqual([]);
    expect(repo.removals).toContain('material_catalog/book_nodes/book-1/node-1');
    expect(repo.updates.at(-1)).toMatchObject({
      'material_catalog/book_nodes/book-1/node-1': null,
      'material_catalog/book_nodes/book-1/chapter-1': expect.any(Object),
      'material_catalog/books/book-1': expect.objectContaining({ status: 'ready' }),
    });
  });

  it('does not perform partial Book writes when an atomic metadata update fails', async () => {
    const repo = {
      ...createRepo([metadata({
        visibility: 'private',
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      })]),
      update: vi.fn(async () => {
        throw new Error('atomic update failed');
      }),
      write: vi.fn(async () => {
        throw new Error('sequential write should not run');
      }),
      remove: vi.fn(async () => {
        throw new Error('sequential remove should not run');
      }),
    };

    await expect(updateBookMetadata(
      'book-1',
      {
        visibility: 'public-library-pending-review',
        testTypeIds: [materialCatalogIds.testTypeId('toeic')],
      },
      repo,
      { actorId: 'teacher-1', actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
    )).rejects.toThrow(/atomic update failed/);

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.write).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('lists private and public Books with search and Test Type filters', async () => {
    const repo = createRepo([
      metadata({ bookId: materialCatalogIds.bookId('ielts-book'), title: 'IELTS Trainer', testTypeIds: [materialCatalogIds.testTypeId('ielts')] }),
      metadata({ bookId: materialCatalogIds.bookId('toeic-book'), title: 'TOEIC Economy', testTypeIds: [materialCatalogIds.testTypeId('toeic')] }),
      metadata({ bookId: materialCatalogIds.bookId('public-book'), ownerId: 'teacher-2', title: 'Public IELTS', visibility: 'public-library-published', testTypeIds: [materialCatalogIds.testTypeId('ielts')] }),
    ]);

    const privateRows = await listTeacherBooks({
      teacherId: 'teacher-1',
      scope: 'private',
      searchTerm: 'trainer',
      testTypeId: materialCatalogIds.testTypeId('ielts'),
      repository: repo,
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });
    const publicRows = await listTeacherBooks({
      teacherId: 'teacher-1',
      scope: 'public',
      repository: repo,
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(privateRows.map((row) => row.bookId)).toEqual(['ielts-book']);
    expect(publicRows.map((row) => row.bookId)).toEqual(['public-book']);
    expect(publicRows[0]?.visibility).toBe('public-library-published');
  });

  it('lists Book grid rows from indexes without loading underlying Book nodes', async () => {
    const repo = {
      ...createRepo([
        metadata({ bookId: materialCatalogIds.bookId('book-index-only'), title: 'Index Only Book' }),
      ]),
      listBookNodes: vi.fn(async () => {
        throw new Error('Book grid must not hydrate Book nodes.');
      }),
    };

    const rows = await listTeacherBooks({
      teacherId: 'teacher-1',
      scope: 'private',
      repository: repo,
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(rows.map((row) => row.bookId)).toEqual(['book-index-only']);
    expect(repo.listBookNodes).not.toHaveBeenCalled();
  });

  it('lists pending public Book review queue from the pending-review visibility index', async () => {
    const read = vi.fn(async (path: string) => {
      if (path === 'material_catalog/book_indexes/by_visibility/public-library-pending-review') {
        return {
          'pending-book': metadata({
            bookId: materialCatalogIds.bookId('pending-book'),
            title: 'Pending Public Book',
            visibility: 'public-library-pending-review',
            status: 'ready',
            publicReview: {
              status: 'pending-review',
              reason: 'Ready for public library review.',
              requestedAt: NOW,
              requestedBy: 'teacher-1',
            },
          }),
          'published-book': metadata({
            bookId: materialCatalogIds.bookId('published-book'),
            title: 'Published Book',
            visibility: 'public-library-published',
            status: 'ready',
          }),
        };
      }

      return {};
    });
    const repository = createMaterialBooksRepository({ read, write: vi.fn(), remove: vi.fn() });

    const rows = await listPublicBookReviewQueue({
      repository,
      searchTerm: 'pending',
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(read).toHaveBeenCalledWith('material_catalog/book_indexes/by_visibility/public-library-pending-review');
    expect(rows.map((row) => row.bookId)).toEqual(['pending-book']);
    expect(rows[0]?.publicReview).toMatchObject({
      status: 'pending-review',
      reason: 'Ready for public library review.',
    });
  });

  it('builds and cleans Book indexes by owner, visibility, and each Test Type', () => {
    expect(buildMaterialBookIndexWrites(metadata({ testTypeIds: [materialCatalogIds.testTypeId('ielts'), materialCatalogIds.testTypeId('toeic')] })).map((write) => write.path))
      .toEqual(expect.arrayContaining([
        'material_catalog/book_indexes/by_owner/teacher-1/book-1',
        'material_catalog/book_indexes/by_visibility/private/book-1',
        'material_catalog/book_indexes/by_test_type/ielts/book-1',
        'material_catalog/book_indexes/by_test_type/toeic/book-1',
      ]));

    expect(buildMaterialBookIndexCleanup(
      metadata({ visibility: 'private', testTypeIds: [materialCatalogIds.testTypeId('ielts')] }),
      metadata({ visibility: 'public-library-pending-review', testTypeIds: [materialCatalogIds.testTypeId('toeic')] }),
    )).toEqual(
      expect.arrayContaining([
        'material_catalog/book_indexes/by_visibility/private/book-1',
        'material_catalog/book_indexes/by_test_type/ielts/book-1',
      ]),
    );
  });

  it('creates a repository adapter over read/write/remove functions', async () => {
    const read = vi.fn(async (path: string) => path.endsWith('/book-1') ? metadata() : null);
    const write = vi.fn();
    const remove = vi.fn();
    const repo = createMaterialBooksRepository({ read, write, remove });

    await expect(repo.readBook('book-1')).resolves.toMatchObject({ bookId: 'book-1' });
    await repo.write('material_catalog/books/book-1', metadata());
    await repo.remove('material_catalog/books/book-1');

    expect(read).toHaveBeenCalledWith('material_catalog/books/book-1');
    expect(write).toHaveBeenCalledWith('material_catalog/books/book-1', expect.objectContaining({ bookId: 'book-1' }));
    expect(remove).toHaveBeenCalledWith('material_catalog/books/book-1');
  });

  it('approves pending public Books by writing a public-safe projection after unsafe-ref checks', async () => {
    const publicRefNode = node({
      materialRefs: [
        {
          refId: materialCatalogIds.refId('ref-1'),
          materialId: 'passage-1',
          materialKind: 'reading-passage',
          snapshotVersionId: 'snapshot-1',
          titleSnapshot: 'Owner title must not be trusted',
          testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
          visibilitySnapshot: 'public',
          availability: 'available',
          updateState: 'current',
          order: 1,
          addedAt: NOW,
          addedBy: 'teacher-1',
        },
      ],
    });
    const repo = createRepo([
      metadata({
        visibility: 'public-library-pending-review',
        status: 'ready',
      }),
    ], {
      'book-1': [publicRefNode],
    });
    repo.readPublicMaterialSummary.mockResolvedValue({
      materialId: 'passage-1',
      ownerId: 'teacher-2',
      title: 'Public Passage Summary',
      visibility: 'public',
      materialKind: 'reading-passage',
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      testTypeMembership: { ielts: true },
      updatedAt: NOW,
    });

    const approved = await approvePublicBook(
      'book-1',
      repo,
      { actorId: 'admin-1', actorRole: 'super_admin', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
      { reason: 'Reviewed for public library.' },
    );

    expect(approved.visibility).toBe('public-library-published');
    expect(repo.writes).toEqual([]);
    expect(repo.updates).toHaveLength(1);
    const projectionWrite = repo.updates[0]['material_catalog/public_book_projections/book-1'];

    expect(projectionWrite).toMatchObject({
      bookId: 'book-1',
      title: 'Cambridge IELTS 18',
      approvedAt: NOW,
      approvedBy: 'admin-1',
      nodes: [
        {
          nodeId: 'node-1',
          parentNodeId: null,
          type: 'section',
          title: 'Section 1',
          order: 1,
          materialRefs: [
            {
              refId: 'ref-1',
              materialId: 'passage-1',
              materialKind: 'reading-passage',
              snapshotVersionId: 'snapshot-1',
              title: 'Public Passage Summary',
              testTypeIds: ['ielts'],
              order: 1,
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(projectionWrite)).not.toContain('visibilitySnapshot');
    expect(JSON.stringify(projectionWrite)).not.toContain('addedBy');
    expect(repo.updates[0]).toMatchObject({
      'material_catalog/books/book-1': expect.objectContaining({ visibility: 'public-library-published' }),
      'material_catalog/book_indexes/by_visibility/public-library-published/book-1': expect.any(Object),
    });
  });

  it('approves ready Books when RTDB omits empty node fields', async () => {
    const assertNoUndefined = (value: unknown, path = 'value'): void => {
      if (value === undefined) {
        throw new Error(`undefined write at ${path}`);
      }

      if (!value || typeof value !== 'object') {
        return;
      }

      Object.entries(value).forEach(([key, entry]) => {
        assertNoUndefined(entry, `${path}.${key}`);
      });
    };
    const read = vi.fn(async (path: string) => {
      if (path === 'material_catalog/books/book-1') {
        return metadata({
          visibility: 'public-library-pending-review',
          status: 'ready',
          subtitle: undefined,
          publisher: undefined,
          series: undefined,
          coverUrl: undefined,
        });
      }

      if (path === 'material_catalog/book_nodes/book-1') {
        return {
          'node-1': {
            nodeId: 'node-1',
            bookId: 'book-1',
            type: 'section',
            title: 'Section 1',
            order: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
        };
      }

      return null;
    });
    const write = vi.fn(async (_path: string, value: unknown) => {
      assertNoUndefined(value);
    });
    const remove = vi.fn();
    const repo = createMaterialBooksRepository({ read, write, remove });

    await expect(approvePublicBook(
      'book-1',
      repo,
      { actorId: 'admin-1', actorRole: 'super_admin', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
      { reason: 'Reviewed for public library.' },
    )).resolves.toMatchObject({ visibility: 'public-library-published' });

    expect(write).toHaveBeenCalledWith(
      'material_catalog/public_book_projections/book-1',
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            nodeId: 'node-1',
            parentNodeId: null,
            materialRefs: [],
          }),
        ],
      }),
    );
  });

  it('normalizes RTDB-omitted empty public projection arrays on read', async () => {
    const read = vi.fn(async (path: string) => {
      if (path === 'material_catalog/public_book_projections/book-1') {
        return {
          bookId: 'book-1',
          title: 'Public Book',
          testTypeIds: ['ielts'],
          visibility: 'public-library-published',
          status: 'ready',
          updatedAt: NOW,
          approvedAt: NOW,
          approvedBy: 'admin-1',
          nodes: [
            {
              nodeId: 'node-1',
              type: 'section',
              title: 'Section 1',
              order: 1,
            },
          ],
        };
      }

      return null;
    });
    const repo = createMaterialBooksRepository({
      read,
      write: vi.fn(),
      remove: vi.fn(),
    });

    await expect(repo.readPublicBookProjection?.('book-1')).resolves.toMatchObject({
      authors: [],
      tags: [],
      nodes: [
        {
          nodeId: 'node-1',
          parentNodeId: null,
          materialRefs: [],
        },
      ],
    });
  });

  it('blocks public Book approval for non-admin actors and unsafe refs', async () => {
    const unsafeNode = node({
      materialRefs: [
        {
          refId: materialCatalogIds.refId('ref-private'),
          materialId: 'private-passage',
          materialKind: 'reading-passage',
          snapshotVersionId: 'snapshot-private',
          titleSnapshot: 'Private Passage',
          testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
          visibilitySnapshot: 'private',
          availability: 'available',
          updateState: 'current',
          order: 1,
          addedAt: NOW,
          addedBy: 'teacher-1',
        },
      ],
    });
    const repo = createRepo([
      metadata({
        visibility: 'public-library-pending-review',
        status: 'ready',
      }),
    ], {
      'book-1': [unsafeNode],
    });

    await expect(
      approvePublicBook(
        'book-1',
        repo,
        { actorId: 'teacher-1', actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
        { reason: 'Not allowed.' },
      ),
    ).rejects.toThrow(/super_admin/i);

    await expect(
      approvePublicBook(
        'book-1',
        repo,
        { actorId: 'admin-1', actorRole: 'super_admin', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
        { reason: 'Unsafe.' },
      ),
    ).rejects.toThrow(/public-safe/i);
    expect(repo.writes.some((write) => write.path === 'material_catalog/public_book_projections/book-1')).toBe(false);
  });

  it('records reject and return-to-private public review decisions and removes public projection', async () => {
    const repo = createRepo([
      metadata({
        visibility: 'public-library-published',
        status: 'ready',
      }),
    ]);

    const rejected = await rejectPublicBookReview(
      'book-1',
      'Contains outdated material refs.',
      repo,
      { actorId: 'admin-1', actorRole: 'super_admin', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
    );

    expect(rejected.visibility).toBe('public-library-rejected');
    expect(rejected.publicReview).toMatchObject({
      status: 'rejected',
      reason: 'Contains outdated material refs.',
      reviewedBy: 'admin-1',
      reviewedAt: NOW,
    });
    expect(repo.removals).toContain('material_catalog/public_book_projections/book-1');

    const returned = await returnPublicBookToPrivate(
      'book-1',
      'Owner should revise metadata.',
      repo,
      { actorId: 'admin-1', actorRole: 'super_admin', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES, now: () => NOW },
    );

    expect(returned.visibility).toBe('private');
    expect(returned.publicReview).toMatchObject({
      status: 'returned-private',
      reason: 'Owner should revise metadata.',
      reviewedBy: 'admin-1',
      reviewedAt: NOW,
    });
    expect(repo.removals.filter((path) => path === 'material_catalog/public_book_projections/book-1')).toHaveLength(2);
  });
});
