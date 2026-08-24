// @ts-nocheck
import {
  materialCatalogIds,
  isMaterialBookMode,
  resolveMaterialBookMode,
  type BookListScope,
  type MaterialBookId,
  type MaterialBookMetadata,
  type MaterialBookMode,
  type MaterialBookNode,
  type MaterialBookPublicProjection,
  type MaterialBookPublicProjectionNode,
  type MaterialBookPublicProjectionRef,
  type MaterialBookVisibility,
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';
import type { SourceSetCandidate } from '../../types/bookAssembly.types';
import type { MaterialCatalogIndexRow } from './materialCatalogIndexes.service';
import { createMaterialBookSummary } from './materialSummaryAdapters.service';
import {
  buildMaterialSummaryUpdatePayload,
  listActiveMaterialSummaries,
  type MaterialSummary,
} from './materialSummaryPort.service';
import { materialCatalogPaths } from './materialCatalogPaths';
import {
  deriveMaterialBookStatus,
  validateMaterialBook,
  validateMaterialBookModerationTransition,
  type MaterialBookValidationContext,
} from './bookValidation.service';

export interface MaterialBooksIndexRow {
  readonly bookId: MaterialBookId;
  readonly bookMode: MaterialBookMode;
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
  readonly hasBrokenRefs?: boolean;
  readonly brokenRefCount?: number;
  readonly brokenRefReasons?: readonly string[];
  readonly updatedAt: string;
}

export interface MaterialBookIndexWrite {
  readonly path: string;
  readonly value: MaterialBooksIndexRow;
}

export interface MaterialBooksRepository {
  readonly readBook: (bookId: string) => Promise<MaterialBookMetadata | null>;
  readonly readPublicBookProjection?: (bookId: string) => Promise<MaterialBookPublicProjection | null>;
  readonly listBookNodes: (bookId: string) => Promise<readonly MaterialBookNode[]>;
  readonly listBookSummaries: (query: {
    readonly teacherId: string;
    readonly scope: BookListScope;
  }) => Promise<readonly MaterialSummary[]>;
  readonly listBooksByIndex: (query: {
    readonly teacherId: string;
    readonly scope: 'public-review-pending';
  }) => Promise<readonly MaterialBookMetadata[]>;
  readonly readPublicMaterialSummary?: (materialId: string) => Promise<MaterialCatalogIndexRow | null>;
  readonly write: (path: string, value: unknown) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
  readonly update: (payload: Record<string, unknown | null>) => Promise<void>;
}

/**
 * The complete trusted authority needed by PDF assembly. Source attach and
 * replacement are deliberately outside this service; this adapter only reads
 * a complete, eligible canonical row.
 */
export interface MaterialBookPdfAuthority {
  readonly bookId: MaterialBookId;
  readonly ownerId: string;
  readonly bookMode: 'pdf';
  readonly status: 'ready';
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
}

export interface PublicBookReviewDecisionInput {
  readonly reason: string;
}

export interface MaterialBookListRow {
  readonly id: string;
  readonly bookId: string;
  readonly bookMode: MaterialBookMode;
  readonly ownerId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly publisher?: string;
  readonly series?: string;
  readonly coverUrl?: string;
  readonly visibility: MaterialBookVisibility;
  readonly status: MaterialBookMetadata['status'];
  readonly publicReview?: MaterialBookMetadata['publicReview'];
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly testTypes: readonly {
    readonly testTypeId: MaterialTestTypeId;
    readonly label: string;
    readonly shortLabel: string;
    readonly active: boolean;
  }[];
  readonly tags: readonly string[];
  readonly hasBrokenRefs?: boolean;
  readonly brokenRefCount?: number;
  readonly brokenRefReasons?: readonly string[];
  readonly updatedAt: string;
  readonly isOwner: boolean;
}

export interface MaterialBooksAdapter {
  readonly read: (path: string) => Promise<unknown>;
  readonly write: (path: string, value: unknown) => Promise<void>;
  readonly remove?: (path: string) => Promise<void>;
  readonly update?: (payload: Record<string, unknown | null>) => Promise<void>;
}

export interface CreateBookDraftInput {
  readonly bookId?: MaterialBookId;
  readonly bookMode: MaterialBookMode;
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

const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (value && typeof value === 'object') {
    return Object.values(value).filter((entry): entry is string => typeof entry === 'string');
  }

  return [];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isSafeRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
};

const isBoundedId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u.test(value);

/** Runtime guard for the existing discriminated SourceSetCandidate contract. */
const isSourceSetCandidate = (value: unknown): value is SourceSetCandidate => {
  if (!isRecord(value) || !hasExactKeys(value, ['sourceStrategy', 'sources'])) {
    return false;
  }

  const strategy = value.sourceStrategy;
  const sources = value.sources;
  if ((strategy !== 'full_pdf' && strategy !== 'component_pdfs') || !Array.isArray(sources)) {
    return false;
  }
  if (sources.length === 0 || (strategy === 'full_pdf' && sources.length !== 1)) {
    return false;
  }

  const sourceKeys = new Set<string>();
  const sourceVersionIds = new Set<string>();
  const sourceOrders = new Set<number>();
  return sources.every((entry) => {
    if (!isRecord(entry)) return false;
    const expectedKeys = strategy === 'component_pdfs'
      ? ['ownerNodeKey', 'sourceKey', 'sourceOrder', 'sourceVersionId']
      : ['sourceKey', 'sourceOrder', 'sourceVersionId'];
    if (!hasExactKeys(entry, expectedKeys)
      || !isBoundedId(entry.sourceKey)
      || !isBoundedId(entry.sourceVersionId)
      || !Number.isSafeInteger(entry.sourceOrder)
      || entry.sourceOrder < 1
      || sourceKeys.has(entry.sourceKey)
      || sourceVersionIds.has(entry.sourceVersionId)
      || sourceOrders.has(entry.sourceOrder)) {
      return false;
    }
    if (strategy === 'component_pdfs' && !isBoundedId(entry.ownerNodeKey)) {
      return false;
    }
    sourceKeys.add(entry.sourceKey);
    sourceVersionIds.add(entry.sourceVersionId);
    sourceOrders.add(entry.sourceOrder);
    return true;
  });
};

const materialBookPdfAuthorityFromMetadata = (
  book: MaterialBookMetadata | null | undefined,
): MaterialBookPdfAuthority | null => {
  if (!book
    || book.bookMode !== 'pdf'
    || book.status !== 'ready'
    || typeof book.ownerId !== 'string'
    || !isSafeRevision(book.bookRevision)
    || !isSafeRevision(book.sourceSetRevision)
    || !isSourceSetCandidate(book.sourceSet)) {
    return null;
  }

  return {
    bookId: book.bookId,
    ownerId: book.ownerId,
    bookMode: 'pdf',
    status: 'ready',
    bookRevision: book.bookRevision,
    sourceSetRevision: book.sourceSetRevision,
    sourceSet: book.sourceSet,
  };
};

/** Pure, fail-closed adapter for one canonical Material Book row. */
export const readMaterialBookPdfAuthorityFromMetadata = (
  book: MaterialBookMetadata | null | undefined,
): MaterialBookPdfAuthority | null => materialBookPdfAuthorityFromMetadata(book);

const assertValid = (validation: ReturnType<typeof validateMaterialBook>): void => {
  if (!validation.valid) {
    throw new Error(`Material Book validation failed: ${validation.errors.map((entry) => entry.code).join(', ')}`);
  }
};

const LEGACY_BOOK_MODE_MISSING = Symbol('legacy-book-mode-missing');

type MaterialBookWithReadState = MaterialBookMetadata & {
  readonly [LEGACY_BOOK_MODE_MISSING]?: true;
};

const cloneBook = (value: MaterialBookMetadata): MaterialBookMetadata => {
  const cloned: MaterialBookWithReadState = {
    ...value,
    bookMode: resolveMaterialBookMode(value.bookMode),
    authors: normalizeStringList(value.authors),
    testTypeIds: normalizeStringList(value.testTypeIds) as MaterialBookMetadata['testTypeIds'],
    tags: normalizeStringList(value.tags),
  };

  if (value.bookMode === undefined) {
    Object.defineProperty(cloned, LEGACY_BOOK_MODE_MISSING, { value: true });
  }

  return cloned;
};

const canonicalBookWrite = (
  book: MaterialBookMetadata,
  previous?: MaterialBookMetadata | null,
): MaterialBookMetadata => {
  const previousWasLegacy = previous !== undefined && previous !== null && (
    previous.bookMode === undefined ||
    (previous as MaterialBookWithReadState)[LEGACY_BOOK_MODE_MISSING] === true
  );
  if (!previousWasLegacy) {
    return book;
  }

  const { bookMode: _resolvedLegacyMode, ...withoutBookMode } = book;
  return withoutBookMode as MaterialBookMetadata;
};

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

const normalizeBookNode = (value: MaterialBookNode): MaterialBookNode => ({
  ...value,
  parentNodeId: value.parentNodeId ?? null,
  materialRefs: Array.isArray(value.materialRefs) ? value.materialRefs : [],
});

const normalizePublicBookProjection = (
  value: MaterialBookPublicProjection,
): MaterialBookPublicProjection => ({
  ...value,
  bookMode: resolveMaterialBookMode(value.bookMode),
  authors: Array.isArray(value.authors) ? value.authors : [],
  testTypeIds: Array.isArray(value.testTypeIds) ? value.testTypeIds : [],
  tags: Array.isArray(value.tags) ? value.tags : [],
  nodes: value.nodes.map((node) => ({
    ...node,
    parentNodeId: node.parentNodeId ?? null,
    materialRefs: Array.isArray(node.materialRefs) ? node.materialRefs : [],
  })),
});

const withoutUndefined = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(withoutUndefined) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, withoutUndefined(entry)]),
    ) as T;
  }

  return value;
};

const sanitizeUpdatePayload = (
  payload: Record<string, unknown | null>,
): Record<string, unknown | null> =>
  Object.fromEntries(
    Object.entries(payload).map(([path, value]) => [
      path,
      value === null ? null : withoutUndefined(value),
    ]),
  );

const commitMaterialBookUpdate = async (
  repository: MaterialBooksRepository,
  payload: Record<string, unknown | null>,
): Promise<void> => {
  await repository.update(sanitizeUpdatePayload(payload));
};

const isPublicBookProjection = (value: unknown): value is MaterialBookPublicProjection =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as MaterialBookPublicProjection).bookId === 'string' &&
  (value as MaterialBookPublicProjection).visibility === 'public-library-published' &&
  Array.isArray((value as MaterialBookPublicProjection).nodes);

const toIndexRow = (book: MaterialBookMetadata): MaterialBooksIndexRow => {
  const testTypeIds = unique(book.testTypeIds);
  const hasBrokenRefs = book.hasBrokenRefs === true || book.status === 'needs-repair' || (book.brokenRefCount ?? 0) > 0;

  return {
    bookId: book.bookId,
    bookMode: resolveMaterialBookMode(book.bookMode),
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
    hasBrokenRefs: hasBrokenRefs ? true : undefined,
    brokenRefCount: hasBrokenRefs ? book.brokenRefCount ?? 0 : undefined,
    brokenRefReasons: hasBrokenRefs ? book.brokenRefReasons ?? [] : undefined,
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
  async readPublicBookProjection(bookId) {
    const value = await adapter.read(materialCatalogPaths.publicBookProjections(bookId));
    return isPublicBookProjection(value) ? normalizePublicBookProjection(value) : null;
  },
  async listBookNodes(bookId) {
    const value = await adapter.read(`material_catalog/book_nodes/${bookId}`);
    return Object.values(value ?? {}).filter(isBookNode).map(normalizeBookNode);
  },
  async listBookSummaries(query) {
    if (query.scope === 'public-review-pending') {
      return [];
    }

    const summaries = await listActiveMaterialSummaries(
      query.scope === 'private'
        ? { scope: 'owned', ownerId: query.teacherId }
        : { scope: 'public' },
      { read: adapter.read },
    );

    return summaries.filter((summary) => summary.materialKind === 'book');
  },
  async listBooksByIndex(query) {
    const path = 'material_catalog/book_indexes/by_visibility/public-library-pending-review';
    const value = await adapter.read(path);
    return Object.values(value ?? {}).filter(isBook).map(cloneBook);
  },
  async readPublicMaterialSummary(materialId) {
    const value = await adapter.read(`material_catalog/material_indexes/by_visibility/public/${materialId}`);

    return value && typeof value === 'object' && (value as MaterialCatalogIndexRow).materialId === materialId
      ? value as MaterialCatalogIndexRow
      : null;
  },
  write: adapter.write,
  remove: adapter.remove ?? (async () => undefined),
  update: adapter.update ?? (async (payload) => {
    const remove = adapter.remove ?? (async () => undefined);
    for (const [path, value] of Object.entries(payload)) {
      if (value === null) {
        await remove(path);
      } else {
        await adapter.write(path, value);
      }
    }
  }),
});

/**
 * Read the canonical PDF authority without exposing partial or ineligible
 * records to downstream trusted consumers. `null` is the only failure result.
 */
export const readMaterialBookPdfAuthority = async (
  repository: Pick<MaterialBooksRepository, 'readBook'>,
  bookId: string,
): Promise<MaterialBookPdfAuthority | null> =>
  materialBookPdfAuthorityFromMetadata(await repository.readBook(bookId));

const buildBookWithIndexesUpdate = (
  book: MaterialBookMetadata,
  previous?: MaterialBookMetadata | null,
): Record<string, unknown | null> => ({
  [materialCatalogPaths.books(book.bookId)]: canonicalBookWrite(book, previous),
  ...Object.fromEntries(buildMaterialBookIndexCleanup(previous, book).map((path) => [path, null])),
  ...Object.fromEntries(buildMaterialBookIndexWrites(book).map((write) => [write.path, write.value])),
  ...buildMaterialSummaryUpdatePayload(
    createMaterialBookSummary(book),
    previous ? createMaterialBookSummary(previous) : null,
  ),
});

export interface MaterialBookTreeUpdatePlan {
  readonly metadata: MaterialBookMetadata;
  readonly nodes: readonly MaterialBookNode[];
  readonly updates: Readonly<Record<string, unknown | null>>;
}

export interface MaterialBookTreeUpdatePlanInput {
  readonly current: MaterialBookMetadata;
  readonly previousNodes: readonly MaterialBookNode[];
  readonly nextNodes: readonly MaterialBookNode[];
  /**
   * When supplied, only these existing nodes are emitted and timestamped.
   * Validation and status derivation still use the complete next node set.
   */
  readonly touchedNodeIds?: readonly MaterialBookNode['nodeId'][];
  readonly expectedUpdatedAt?: string;
  /** Optional canonical PDF CAS token; legacy/material Books may omit it. */
  readonly expectedBookRevision?: number;
  readonly now: string;
  readonly context: MaterialBookValidationContext;
}

/**
 * Pure, mirror-complete Book update planning shared by normal tree saves and
 * server-side canonical Activity forks. It performs no repository I/O.
 */
export const planMaterialBookTreeUpdate = (
  input: MaterialBookTreeUpdatePlanInput,
): MaterialBookTreeUpdatePlan => {
  if (input.expectedUpdatedAt && input.current.updatedAt !== input.expectedUpdatedAt) {
    throw new Error('Material Book changed since it was loaded; reload before saving.');
  }
  if (input.expectedBookRevision !== undefined
    && input.current.bookRevision !== input.expectedBookRevision) {
    throw new Error('Material Book revision is stale; reload before saving.');
  }

  const nextNodeIds = new Set(input.nextNodes.map((entry) => entry.nodeId));
  const touchedNodeIds = new Set(input.touchedNodeIds ?? input.nextNodes.map((entry) => entry.nodeId));
  if (touchedNodeIds.size === 0 && input.nextNodes.length > 0) {
    throw new Error('Material Book tree planning requires a touched node.');
  }
  if ([...touchedNodeIds].some((nodeId) => !nextNodeIds.has(nodeId))) {
    throw new Error('Material Book tree planning touched an unknown node.');
  }
  if (input.touchedNodeIds !== undefined) {
    const previousNodeIds = new Set(input.previousNodes.map((entry) => entry.nodeId));
    if (previousNodeIds.size !== nextNodeIds.size
      || [...previousNodeIds].some((nodeId) => !nextNodeIds.has(nodeId))) {
      throw new Error('Scoped Material Book tree planning cannot remove or replace nodes.');
    }
  }
  const nodes = input.nextNodes.map((entry) => touchedNodeIds.has(entry.nodeId)
    ? { ...entry, updatedAt: input.now }
    : entry);
  const metadata: MaterialBookMetadata = withBookRevisionBump(input.current, {
    ...input.current,
    status: deriveMaterialBookStatus(nodes, input.current.status === 'archived'),
    updatedAt: input.now,
    updatedBy: input.context.actorId,
  });

  assertValid(validateMaterialBook({ metadata, nodes, context: input.context }));

  const updates: Record<string, unknown | null> = {
    ...Object.fromEntries(
      input.previousNodes
        .filter((previous) => !nextNodeIds.has(previous.nodeId))
        .map((previous) => [materialCatalogPaths.bookNodes(metadata.bookId, previous.nodeId), null]),
    ),
    ...Object.fromEntries(nodes.filter((entry) => touchedNodeIds.has(entry.nodeId)).map((entry) => [
      materialCatalogPaths.bookNodes(metadata.bookId, entry.nodeId),
      entry,
    ])),
    ...buildBookWithIndexesUpdate(metadata, input.current),
  };

  return { metadata, nodes, updates };
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

const nextBookRevision = (current: MaterialBookMetadata): number | undefined => {
  if (current.bookMode !== 'pdf') {
    return current.bookRevision;
  }

  return isSafeRevision(current.bookRevision) ? current.bookRevision + 1 : 1;
};

/**
 * Metadata/tree/moderation writes own the Book revision, while source fields
 * remain copied from the current row. Source attach/replace must use its own
 * trusted workflow and is intentionally not implemented here.
 */
const withBookRevisionBump = (
  current: MaterialBookMetadata,
  next: MaterialBookMetadata,
): MaterialBookMetadata => ({
  ...next,
  ...(current.bookMode === 'pdf' ? { bookRevision: nextBookRevision(current) } : {}),
});

export const createBookDraft = async (
  input: CreateBookDraftInput,
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<MaterialBookMetadata> => {
  if (!isMaterialBookMode(input.bookMode)) {
    throw new Error('Material Book creation requires a valid bookMode.');
  }

  const now = input.now?.() ?? contextNow(context);
  const bookId = input.bookId ?? materialCatalogIds.bookId(`book-${Date.now().toString(36)}`);
  const nodes = input.initialNodes ?? [];
  const testTypeIds = unique([
    ...(input.primaryTestTypeId ? [input.primaryTestTypeId] : []),
    ...input.testTypeIds,
  ]);
  const book: MaterialBookMetadata = {
    bookId,
    bookMode: input.bookMode,
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

  await commitMaterialBookUpdate(repository, {
    ...buildBookWithIndexesUpdate(book),
    ...Object.fromEntries(nodes.map((entry) => [
      materialCatalogPaths.bookNodes(book.bookId, entry.nodeId),
      entry,
    ])),
  });

  return book;
};

export const updateBookMetadata = async (
  bookId: string,
  updates: Partial<Omit<
    MaterialBookMetadata,
    'bookId' | 'bookMode' | 'modeSuccessorLineage' | 'reusedActivityRefs'
      | 'sourceStrategySuccessorLineage' | 'bookRevision' | 'sourceSetRevision' | 'sourceSet'
      | 'ownerId' | 'createdAt' | 'createdBy'
  >>,
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<MaterialBookMetadata> => {
  if ('bookMode' in updates) {
    throw new Error('Material Book mode is immutable. Create a successor Book instead.');
  }
  if ('modeSuccessorLineage' in updates) {
    throw new Error('Material Book successor lineage is immutable.');
  }
  if ('reusedActivityRefs' in updates) {
    throw new Error('Material Book successor Activity reuse is immutable.');
  }
  if ('sourceStrategySuccessorLineage' in updates) {
    throw new Error('Material Book source-strategy successor lineage is immutable.');
  }
  if ('bookRevision' in updates || 'sourceSetRevision' in updates || 'sourceSet' in updates) {
    throw new Error('Material Book PDF authority is immutable in metadata updates.');
  }

  const current = await requireBook(repository, bookId);
  const nodes = await repository.listBookNodes(bookId);
  const now = contextNow(context);
  const next: MaterialBookMetadata = withBookRevisionBump(current, {
    ...current,
    ...updates,
    bookId: current.bookId,
    modeSuccessorLineage: current.modeSuccessorLineage,
    reusedActivityRefs: current.reusedActivityRefs,
    sourceStrategySuccessorLineage: current.sourceStrategySuccessorLineage,
    ownerId: current.ownerId,
    createdAt: current.createdAt,
    createdBy: current.createdBy,
    testTypeIds: updates.testTypeIds ? unique(updates.testTypeIds) : current.testTypeIds,
    status: updates.status ?? deriveMaterialBookStatus(nodes, current.status === 'archived'),
    updatedAt: now,
    updatedBy: context.actorId,
  });

  assertValid(validateMaterialBook({ metadata: next, nodes, context }));
  assertValid(validateMaterialBookModerationTransition(current, next, context));
  await commitMaterialBookUpdate(repository, buildBookWithIndexesUpdate(next, current));
  return next;
};

export const updateBookTree = async (
  bookId: string,
  nodes: readonly MaterialBookNode[],
  options: { readonly expectedUpdatedAt?: string; readonly expectedBookRevision?: number },
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<{ readonly metadata: MaterialBookMetadata; readonly nodes: readonly MaterialBookNode[] }> => {
  const current = await requireBook(repository, bookId);
  const previousNodes = await repository.listBookNodes(bookId);
  const plan = planMaterialBookTreeUpdate({
    current,
    previousNodes,
    nextNodes: nodes,
    expectedUpdatedAt: options.expectedUpdatedAt,
    expectedBookRevision: options.expectedBookRevision,
    now: contextNow(context),
    context,
  });

  await commitMaterialBookUpdate(repository, plan.updates);
  return { metadata: plan.metadata, nodes: plan.nodes };
};

const requireSuperAdmin = (context: MaterialBookValidationContext): void => {
  if (context.actorRole !== 'super_admin') {
    throw new Error('Only super_admin can review public-library Books.');
  }
};

const reviewReason = (input: PublicBookReviewDecisionInput | string): string => {
  const reason = typeof input === 'string' ? input : input.reason;
  const trimmed = reason.trim();

  if (!trimmed) {
    throw new Error('Public Book review requires a visible reason.');
  }

  return trimmed;
};

const publicReviewState = (
  status: NonNullable<MaterialBookMetadata['publicReview']>['status'],
  reason: string,
  context: MaterialBookValidationContext,
) => ({
  status,
  reason,
  reviewedAt: contextNow(context),
  reviewedBy: context.actorId,
});

const requirePublicMaterialSummary = async (
  repository: MaterialBooksRepository,
  ref: MaterialBookNode['materialRefs'][number],
): Promise<MaterialCatalogIndexRow> => {
  if (!repository.readPublicMaterialSummary) {
    throw new Error('Public Book approval requires public material summary lookup.');
  }

  const summary = await repository.readPublicMaterialSummary(ref.materialId);

  if (!summary || summary.visibility !== 'public' || summary.materialKind !== ref.materialKind) {
    throw new Error(`Book ref ${ref.refId} is not public-safe for approval.`);
  }

  return summary;
};

const buildProjectionRef = async (
  repository: MaterialBooksRepository,
  ref: MaterialBookNode['materialRefs'][number],
): Promise<MaterialBookPublicProjectionRef> => {
  if (!ref.snapshotVersionId || ref.materialKind === 'draft' || ref.availability !== 'available') {
    throw new Error(`Book ref ${ref.refId} is not public-safe for approval.`);
  }

  if (ref.visibilitySnapshot !== 'public') {
    throw new Error(`Book ref ${ref.refId} is not public-safe for approval.`);
  }

  const summary = await requirePublicMaterialSummary(repository, ref);

  return {
    refId: ref.refId,
    materialId: ref.materialId,
    materialKind: ref.materialKind as MaterialBookPublicProjectionRef['materialKind'],
    snapshotVersionId: ref.snapshotVersionId,
    title: summary.title,
    testTypeIds: summary.testTypeIds,
    order: ref.order,
  };
};

const buildPublicBookProjection = async (
  book: MaterialBookMetadata,
  nodes: readonly MaterialBookNode[],
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<MaterialBookPublicProjection> => {
  const projectionNodes: MaterialBookPublicProjectionNode[] = [];

  for (const node of nodes) {
    const materialRefs = await Promise.all(
      [...node.materialRefs]
        .sort((left, right) => left.order - right.order)
        .map((ref) => buildProjectionRef(repository, ref)),
    );

    projectionNodes.push({
      nodeId: node.nodeId,
      parentNodeId: node.parentNodeId,
      type: node.type,
      title: node.title,
      order: node.order,
      materialRefs,
    });
  }

  return {
    bookId: book.bookId,
    bookMode: resolveMaterialBookMode(book.bookMode),
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors,
    publisher: book.publisher,
    series: book.series,
    coverUrl: book.coverUrl,
    testTypeIds: book.testTypeIds,
    tags: book.tags,
    visibility: 'public-library-published',
    status: 'ready',
    updatedAt: contextNow(context),
    approvedAt: contextNow(context),
    approvedBy: context.actorId,
    nodes: projectionNodes.sort((left, right) => left.order - right.order),
  };
};

export const approvePublicBook = async (
  bookId: string,
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
  decision: PublicBookReviewDecisionInput,
): Promise<MaterialBookMetadata> => {
  requireSuperAdmin(context);
  const reason = reviewReason(decision);
  const current = await requireBook(repository, bookId);
  const nodes = await repository.listBookNodes(bookId);
  const now = contextNow(context);

  if (current.visibility !== 'public-library-pending-review') {
    throw new Error('Only pending-review Books can be approved for the public library.');
  }

  if (current.status !== 'ready') {
    throw new Error('Only ready Books can be approved for the public library.');
  }

  const next: MaterialBookMetadata = withBookRevisionBump(current, {
    ...current,
    visibility: 'public-library-published',
    publicReview: {
      status: 'approved',
      reason,
      reviewedAt: now,
      reviewedBy: context.actorId,
    },
    updatedAt: now,
    updatedBy: context.actorId,
  });
  const projection = await buildPublicBookProjection(next, nodes, repository, context);
  assertValid(validateMaterialBook({ metadata: next, nodes, context }));
  assertValid(validateMaterialBookModerationTransition(current, next, context));

  await commitMaterialBookUpdate(repository, {
    ...buildBookWithIndexesUpdate(next, current),
    [materialCatalogPaths.publicBookProjections(bookId)]: projection,
  });
  return next;
};

export const rejectPublicBookReview = async (
  bookId: string,
  reasonInput: string,
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<MaterialBookMetadata> => {
  requireSuperAdmin(context);
  const current = await requireBook(repository, bookId);
  const nodes = await repository.listBookNodes(bookId);
  const now = contextNow(context);
  const next: MaterialBookMetadata = withBookRevisionBump(current, {
    ...current,
    visibility: 'public-library-rejected',
    publicReview: publicReviewState('rejected', reviewReason(reasonInput), context),
    status: deriveMaterialBookStatus(nodes, current.status === 'archived'),
    updatedAt: now,
    updatedBy: context.actorId,
  });

  assertValid(validateMaterialBook({ metadata: next, nodes, context }));
  assertValid(validateMaterialBookModerationTransition(current, next, context));
  await commitMaterialBookUpdate(repository, {
    ...buildBookWithIndexesUpdate(next, current),
    [materialCatalogPaths.publicBookProjections(bookId)]: null,
  });
  return next;
};

export const returnPublicBookToPrivate = async (
  bookId: string,
  reasonInput: string,
  repository: MaterialBooksRepository,
  context: MaterialBookValidationContext,
): Promise<MaterialBookMetadata> => {
  requireSuperAdmin(context);
  const current = await requireBook(repository, bookId);
  const nodes = await repository.listBookNodes(bookId);
  const now = contextNow(context);
  const next: MaterialBookMetadata = withBookRevisionBump(current, {
    ...current,
    visibility: 'private',
    publicReview: publicReviewState('returned-private', reviewReason(reasonInput), context),
    status: deriveMaterialBookStatus(nodes, current.status === 'archived'),
    updatedAt: now,
    updatedBy: context.actorId,
  });

  assertValid(validateMaterialBook({ metadata: next, nodes, context }));
  assertValid(validateMaterialBookModerationTransition(current, next, context));
  await commitMaterialBookUpdate(repository, {
    ...buildBookWithIndexesUpdate(next, current),
    [materialCatalogPaths.publicBookProjections(bookId)]: null,
  });
  return next;
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
  book: Pick<
    MaterialBookListRow,
    'title' | 'subtitle' | 'authors' | 'publisher' | 'series' | 'tags'
  >,
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

  const summaries = await input.repository.listBookSummaries({
    teacherId: input.teacherId,
    scope: input.scope,
  });

  const rows = await Promise.all(
    summaries
      .filter((summary) =>
        input.scope === 'private'
          ? summary.ownerId === input.teacherId
          : summary.visibility === 'public',
      )
      .filter((summary) =>
        !input.testTypeId || summary.testTypeIds.includes(input.testTypeId))
      .map(async (summary) => {
        if (input.scope === 'private') {
          const book = await input.repository.readBook(summary.materialId);
          if (
            !book ||
            book.ownerId !== input.teacherId
          ) {
            throw new Error(
              `Material Book summary is missing its owned canonical record: ${summary.materialId}`,
            );
          }

          const testTypes = book.testTypeIds.map((testTypeId) =>
            testTypeSummary(testTypeId, input.testTypeConfigs),
          );

          return {
            id: book.bookId,
            bookId: book.bookId,
            bookMode: resolveMaterialBookMode(book.bookMode),
            ownerId: book.ownerId,
            title: book.title,
            subtitle: book.subtitle,
            authors: book.authors,
            publisher: book.publisher,
            series: book.series,
            coverUrl: book.coverUrl,
            visibility: book.visibility,
            status: book.status,
            publicReview: book.publicReview,
            testTypeIds: book.testTypeIds,
            testTypes,
            tags: book.tags,
            hasBrokenRefs: book.hasBrokenRefs,
            brokenRefCount: book.brokenRefCount,
            brokenRefReasons: book.brokenRefReasons,
            updatedAt: book.updatedAt,
            isOwner: true,
          } satisfies MaterialBookListRow;
        }

        const projection = await input.repository.readPublicBookProjection?.(summary.materialId);
        if (!projection) {
          throw new Error(
            `Material Book public summary is missing its public projection: ${summary.materialId}`,
          );
        }

        const testTypes = projection.testTypeIds.map((testTypeId) =>
          testTypeSummary(testTypeId, input.testTypeConfigs),
        );

        return {
          id: projection.bookId,
          bookId: projection.bookId,
          bookMode: resolveMaterialBookMode(projection.bookMode),
          ownerId: summary.ownerId,
          title: projection.title,
          subtitle: projection.subtitle,
          authors: projection.authors,
          publisher: projection.publisher,
          series: projection.series,
          coverUrl: projection.coverUrl,
          visibility: projection.visibility,
          status: projection.status,
          testTypeIds: projection.testTypeIds,
          testTypes,
          tags: projection.tags,
          hasBrokenRefs: summary.hasBrokenRefs,
          brokenRefCount: summary.brokenRefCount,
          updatedAt: projection.updatedAt,
          isOwner: summary.ownerId === input.teacherId,
        } satisfies MaterialBookListRow;
      }),
  );

  return rows
    .filter((row): row is MaterialBookListRow => row !== null)
    .filter((row) => matchesSearch(row, input.searchTerm, row.testTypes))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const listPublicBookReviewQueue = async (input: {
  readonly repository: MaterialBooksRepository;
  readonly searchTerm?: string;
  readonly testTypeId?: MaterialTestTypeId | null;
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
}): Promise<MaterialBookListRow[]> => {
  const books = await input.repository.listBooksByIndex({
    teacherId: '__super_admin__',
    scope: 'public-review-pending',
  });

  return books
    .filter((book) => book.visibility === 'public-library-pending-review')
    .filter((book) => !input.testTypeId || book.testTypeIds.includes(input.testTypeId))
    .map((book) => {
      const testTypes = book.testTypeIds.map((testTypeId) =>
        testTypeSummary(testTypeId, input.testTypeConfigs),
      );

      return {
        id: book.bookId,
        bookId: book.bookId,
        bookMode: resolveMaterialBookMode(book.bookMode),
        ownerId: book.ownerId,
        title: book.title,
        subtitle: book.subtitle,
        authors: book.authors,
        publisher: book.publisher,
        series: book.series,
        coverUrl: book.coverUrl,
        visibility: book.visibility,
        status: book.status,
        publicReview: book.publicReview,
        testTypeIds: book.testTypeIds,
        testTypes,
        tags: book.tags,
        hasBrokenRefs: book.hasBrokenRefs,
        brokenRefCount: book.brokenRefCount,
        brokenRefReasons: book.brokenRefReasons,
        updatedAt: book.updatedAt,
        isOwner: false,
      };
    })
    .filter((row) => matchesSearch(row as unknown as MaterialBookMetadata, input.searchTerm, row.testTypes))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};
