import { describe, expect, it, vi } from 'vitest';
import {
  materialCatalogIds,
  type MaterialBookMetadata,
  type MaterialBookNode,
} from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from './testTypeConfig.service';
import {
  buildMaterialBookIndexCleanup,
  buildMaterialBookIndexWrites,
  createBookDraft,
  createMaterialBooksRepository,
  listTeacherBooks,
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
): MaterialBooksRepository & { writes: Record<string, unknown>[]; removals: string[] } => {
  const bookMap = new Map(books.map((book) => [book.bookId, book]));
  const nodeMap = new Map(Object.entries(nodesByBook));
  const writes: Record<string, unknown>[] = [];
  const removals: string[] = [];

  return {
    writes,
    removals,
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
    },
    async remove(path) {
      removals.push(path);
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
    expect(repo.writes.map((write) => write.path)).toEqual(
      expect.arrayContaining([
        'material_catalog/books/book-1',
        'material_catalog/book_indexes/by_owner/teacher-1/book-1',
        'material_catalog/book_indexes/by_visibility/private/book-1',
        'material_catalog/book_indexes/by_test_type/ielts/book-1',
      ]),
    );
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
    expect(repo.writes.map((write) => write.path)).toContain('material_catalog/book_nodes/book-1/node-1');
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
    expect(repo.removals).toEqual(
      expect.arrayContaining([
        'material_catalog/book_indexes/by_visibility/private/book-1',
        'material_catalog/book_indexes/by_test_type/ielts/book-1',
      ]),
    );
    expect(repo.writes.map((write) => write.path)).toEqual(
      expect.arrayContaining([
        'material_catalog/book_indexes/by_visibility/public-library-pending-review/book-1',
        'material_catalog/book_indexes/by_test_type/toeic/book-1',
      ]),
    );
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
    expect(repo.removals).toContain('material_catalog/book_nodes/book-1/node-1');
    expect(repo.writes.map((write) => write.path)).toContain('material_catalog/book_nodes/book-1/chapter-1');
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
});
