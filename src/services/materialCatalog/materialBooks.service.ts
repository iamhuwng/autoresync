import {
  materialCatalogIds,
  type BookListScope,
  type MaterialBookId,
  type MaterialBookMetadata,
  type MaterialBookNode,
  type MaterialBookVisibility,
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';
import { materialCatalogPaths } from './materialCatalogPaths';
import {
  deriveMaterialBookStatus,
  validateMaterialBook,
  validateMaterialBookModerationTransition,
  type MaterialBookValidationContext,
} from './bookValidation.service';

export interface MaterialBooksIndexRow {
  readonly bookId: MaterialBookId;
  readonly ownerId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly publisher?: string;
  readonly series?: string;
  readonly coverUrl?: string;
  readonly visibility: MaterialBookVisibility;
  readonly status: MaterialBookMetadata['status'];
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly testTypeMembership: Readonly<Record<string, true>>;
  readonly tags: readonly string[];
  readonly updatedAt: string;
}

export interface MaterialBookIndexWrite {
  readonly path: string;
  readonly value: MaterialBooksIndexRow;
}

export interface MaterialBooksRepository {
  readonly readBook: (bookId: string) => Promise<MaterialBookMetadata | null>;
  readonly listBookNodes: (bookId: string) => Promise<readonly MaterialBookNode[]>;
  readonly listBooksByIndex: (query: {
    readonly teacherId: string;
    readonly scope: BookListScope;
  }) => Promise<readonly MaterialBookMetadata[]>;
  readonly write: (path: string, value: unknown) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
}

export interface MaterialBookListRow {
  readonly id: string;
  readonly bookId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly publisher?: string;
  readonly series?: string;
  readonly coverUrl?: string;
  readonly visibility: MaterialBookVisibility;
  readonly status: MaterialBookMetadata['status'];
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly testTypes: readonly {
    readonly testTypeId: MaterialTestTypeId;
    readonly label: string;
    readonly shortLabel: string;
    readonly active: boolean;
  }[];
  readonly tags: readonly string[];
  readonly updatedAt: string;
  readonly isOwner: boolean;
}

export interface MaterialBooksAdapter {
  readonly read: (path: string) => Promise<unknown>;
  readonly write: (path: string, value: unknown) => Promise<void>;
  readonly remove?: (path: string) => Promise<void>;
}

export interface CreateBookDraftInput {
  readonly bookId?: MaterialBookId;
  readonly ownerId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly authors?: readonly string[];
  readonly publisher?: string;
  readonly edition?: string;
  readonly series?: string;
  readonly isbn?: string;
  readonly coverUrl?: string;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly tags?: readonly string[];
  readonly description?: string;
  readonly visibility?: MaterialBookVisibility;
  readonly initialNodes?: readonly MaterialBookNode[];
  readonly now?: () => string;
}

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

const assertValid = (validation: ReturnType<typeof validateMaterialBook>): void => {
  if (!validation.valid) {
    throw new Error(`Material Book validation failed: ${validation.errors.map((entry) => entry.code).join(', ')}`);
  }
};

const cloneBook = (value: MaterialBookMetadata): MaterialBookMetadata => ({
  ...value,
  authors: [...value.authors],
  testTypeIds: [...value.testTypeIds],
  tags: [...value.tags],
});

const isBook = (value: unknown): value is MaterialBookMetadata =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as MaterialBookMetadata).bookId === 'string' &&
  typeof (value as MaterialBookMetadata).ownerId === 'string';

const isBookNode = (value: unknown): value is MaterialBookNode =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as MaterialBookNode).nodeId === 'string' &&
  typeof (value as MaterialBookNode).bookId === 'string';

const toIndexRow = (book: MaterialBookMetadata): MaterialBooksIndexRow => {
  const testTypeIds = unique(book.testTypeIds);

  return {
    bookId: book.bookId,
    ownerId: book.ownerId,
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors,
    publisher: book.publisher,
    series: book.series,
    coverUrl: book.coverUrl,
    visibility: book.visibility,
    status: book.status,
    testTypeIds,
    testTypeMembership: Object.fromEntries(testTypeIds.map((testTypeId) => [testTypeId, true])),
    tags: book.tags,
    updatedAt: book.updatedAt,
  };
};

const indexPaths = (book: MaterialBookMetadata): string[] => [
  materialCatalogPaths.bookIndexesByOwner(book.ownerId, book.bookId),
  materialCatalogPaths.bookIndexesByVisibility(book.visibility, book.bookId),
  ...unique(book.testTypeIds).map((testTypeId) =>
    materialCatalogPaths.bookIndexesByTestType(testTypeId, book.bookId),
  ),
];

export const buildMaterialBookIndexWrites = (
  book: MaterialBookMetadata,
): MaterialBookIndexWrite[] => {
  const row = toIndexRow(book);

  return indexPaths(book).map((path) => ({ path, value: row }));
};

export const buildMaterialBookIndexCleanup = (
  previous: MaterialBookMetadata | null | undefined,
  next: MaterialBookMetadata,
): string[] => {
  if (!previous) {
    return [];
  }

  const nextPaths = new Set(indexPaths(next));
  return indexPaths(previous).filter((path) => !nextPaths.has(path));
};

export const createMaterialBooksRepository = (
  adapter: MaterialBooksAdapter,
): MaterialBooksRepository => ({
  async readBook(bookId) {
    const value = await adapter.read(materialCatalogPaths.books(bookId));
    return isBook(value) ? cloneBook(value) : null;
  },
  async listBookNodes(bookId) {
    const value = await adapter.read(`material_catalog/book_nodes/${bookId}`);
    return Object.values(value ?? {}).filter(isBookNode);
  },
  async listBooksByIndex(query) {
    const path = query.scope === 'private'
      ? `material_catalog/book_indexes/by_owner/${query.teacherId}`
      : 'material_catalog/book_indexes/by_visibility/public-library-published';
    const value = await adapter.read(path);
    return Object.values(value ?? {}).filter(isBook);
  },
  write: adapter.write,
  remove: adapter.remove ?? (async () => undefined),
});

const writeBookWithIndexes = async (
  repository: MaterialBooksRepository,
  book: MaterialBookMetadata,
  previous?: MaterialBookMetadata | null,
): Promise<void> => {
  await repository.write(materialCatalogPaths.books(book.bookId), book);

  for (const stalePath of buildMaterialBookIndexCleanup(previous, book)) {
    await repository.remove(stalePath);
  }

  for (const write of buildMaterialBookIndexWrites(book)) {
    await repository.write(write.path, write.value);
  }
};

const requireBook = async (
  repository: MaterialBooksRepository,
  bookId: string,
): Promise<MaterialBookMetadata> => {
  const book = await repository.readBook(bookId);

  if (!book) {
    throw new Error(`Material Book not found: ${bookId}`);
  }

  return book;
};

const contextNow = (context: MaterialBookValidationContext, fallback?: () => string): string =>
  context.now?.() ?? fallback?.() ?? new Date().toISOString();

export const createBookDraft = async (
  input: CreateBookDraftInput,
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<MaterialBookMetadata> => {
  const now = input.now?.() ?? contextNow(context);
  const bookId = input.bookId ?? materialCatalogIds.bookId(`book-${Date.now().toString(36)}`);
  const nodes = input.initialNodes ?? [];
  const testTypeIds = unique([
    ...(input.primaryTestTypeId ? [input.primaryTestTypeId] : []),
    ...input.testTypeIds,
  ]);
  const book: MaterialBookMetadata = {
    bookId,
    ownerId: input.ownerId,
    title: input.title,
    subtitle: input.subtitle,
    authors: input.authors ?? [],
    publisher: input.publisher,
    edition: input.edition,
    series: input.series,
    isbn: input.isbn,
    coverUrl: input.coverUrl,
    primaryTestTypeId: input.primaryTestTypeId ?? testTypeIds[0],
    testTypeIds,
    tags: input.tags ?? [],
    description: input.description,
    visibility: input.visibility ?? 'private',
    status: deriveMaterialBookStatus(nodes),
    createdAt: now,
    updatedAt: now,
    createdBy: context.actorId,
    updatedBy: context.actorId,
  };

  assertValid(validateMaterialBook({ metadata: book, nodes, context }));
  assertValid(validateMaterialBookModerationTransition(null, book, context));

  await writeBookWithIndexes(repository, book);

  for (const entry of nodes) {
    await repository.write(materialCatalogPaths.bookNodes(book.bookId, entry.nodeId), entry);
  }

  return book;
};

export const updateBookMetadata = async (
  bookId: string,
  updates: Partial<Omit<MaterialBookMetadata, 'bookId' | 'ownerId' | 'createdAt' | 'createdBy'>>,
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<MaterialBookMetadata> => {
  const current = await requireBook(repository, bookId);
  const nodes = await repository.listBookNodes(bookId);
  const now = contextNow(context);
  const next: MaterialBookMetadata = {
    ...current,
    ...updates,
    bookId: current.bookId,
    ownerId: current.ownerId,
    createdAt: current.createdAt,
    createdBy: current.createdBy,
    testTypeIds: updates.testTypeIds ? unique(updates.testTypeIds) : current.testTypeIds,
    status: updates.status ?? deriveMaterialBookStatus(nodes, current.status === 'archived'),
    updatedAt: now,
    updatedBy: context.actorId,
  };

  assertValid(validateMaterialBook({ metadata: next, nodes, context }));
  assertValid(validateMaterialBookModerationTransition(current, next, context));
  await writeBookWithIndexes(repository, next, current);
  return next;
};

export const updateBookTree = async (
  bookId: string,
  nodes: readonly MaterialBookNode[],
  options: { readonly expectedUpdatedAt?: string },
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<{ readonly metadata: MaterialBookMetadata; readonly nodes: readonly MaterialBookNode[] }> => {
  const current = await requireBook(repository, bookId);

  if (options.expectedUpdatedAt && current.updatedAt !== options.expectedUpdatedAt) {
    throw new Error('Material Book changed since it was loaded; reload before saving.');
  }

  const now = contextNow(context);
  const nextMetadata: MaterialBookMetadata = {
    ...current,
    status: deriveMaterialBookStatus(nodes, current.status === 'archived'),
    updatedAt: now,
    updatedBy: context.actorId,
  };

  assertValid(validateMaterialBook({ metadata: nextMetadata, nodes, context }));

  const previousNodes = await repository.listBookNodes(bookId);
  const nextNodeIds = new Set(nodes.map((entry) => entry.nodeId));

  for (const previous of previousNodes) {
    if (!nextNodeIds.has(previous.nodeId)) {
      await repository.remove(materialCatalogPaths.bookNodes(bookId, previous.nodeId));
    }
  }

  for (const entry of nodes) {
    await repository.write(materialCatalogPaths.bookNodes(bookId, entry.nodeId), {
      ...entry,
      updatedAt: now,
    });
  }

  await writeBookWithIndexes(repository, nextMetadata, current);
  return { metadata: nextMetadata, nodes };
};

const testTypeSummary = (
  testTypeId: MaterialTestTypeId,
  configs: readonly MaterialTestTypeConfig[] | undefined,
) => {
  const config = configs?.find((entry) => entry.testTypeId === testTypeId);
  const fallback = String(testTypeId).toUpperCase();

  return {
    testTypeId,
    label: config?.label ?? fallback,
    shortLabel: config?.shortLabel ?? fallback,
    active: config?.active ?? false,
  };
};

const matchesSearch = (
  book: MaterialBookMetadata,
  searchTerm: string | undefined,
  testTypes: readonly ReturnType<typeof testTypeSummary>[],
): boolean => {
  const query = searchTerm?.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    book.title,
    book.subtitle,
    ...book.authors,
    book.publisher,
    book.series,
    ...book.tags,
    ...testTypes.flatMap((entry) => [entry.label, entry.shortLabel]),
  ]
    .filter((entry): entry is string => typeof entry === 'string')
    .join(' ')
    .toLowerCase()
    .includes(query);
};

export const listTeacherBooks = async (input: {
  readonly teacherId: string | undefined;
  readonly scope: BookListScope;
  readonly searchTerm?: string;
  readonly testTypeId?: MaterialTestTypeId | null;
  readonly repository: MaterialBooksRepository;
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
}): Promise<MaterialBookListRow[]> => {
  if (!input.teacherId) {
    return [];
  }

  const books = await input.repository.listBooksByIndex({
    teacherId: input.teacherId,
    scope: input.scope,
  });

  return books
    .filter((book) =>
      input.scope === 'private'
        ? book.ownerId === input.teacherId && book.visibility === 'private'
        : book.visibility.startsWith('public-library-') && book.visibility !== 'private',
    )
    .filter((book) => !input.testTypeId || book.testTypeIds.includes(input.testTypeId))
    .map((book) => {
      const testTypes = book.testTypeIds.map((testTypeId) =>
        testTypeSummary(testTypeId, input.testTypeConfigs),
      );

      return {
        id: book.bookId,
        bookId: book.bookId,
        ownerId: book.ownerId,
        title: book.title,
        subtitle: book.subtitle,
        authors: book.authors,
        publisher: book.publisher,
        series: book.series,
        coverUrl: book.coverUrl,
        visibility: book.visibility,
        status: book.status,
        testTypeIds: book.testTypeIds,
        testTypes,
        tags: book.tags,
        updatedAt: book.updatedAt,
        isOwner: book.ownerId === input.teacherId,
      };
    })
    .filter((row) => matchesSearch(row as unknown as MaterialBookMetadata, input.searchTerm, row.testTypes))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};
