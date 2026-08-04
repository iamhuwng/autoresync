import type { MaterialBookMode } from '../../../../../src/types/materialCatalog.types.ts';
import {
  FirebaseRestBookSuccessorRepository,
  type BookSuccessorRepository,
  type BookSuccessorRepositoryEnv,
  type BookSuccessorRoot,
  type PersistedBookSuccessorOperation,
} from './repository.ts';

const MAX_BODY_BYTES = 256 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const RESERVED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MODES = new Set<MaterialBookMode>(['materials', 'pdf']);
const ARCHIVABLE_SUCCESSOR_STATUSES = new Set([
  'draft-empty',
  'draft-in-progress',
  'needs-repair',
]);
const SAFE_METADATA_KEYS = [
  'title', 'subtitle', 'authors', 'publisher', 'edition', 'series', 'isbn',
  'coverUrl', 'primaryTestTypeId', 'testTypeIds', 'tags', 'description',
] as const;
const PROFILE_BLOCKED = new Set(['blocked', 'inactive', 'suspended']);

export class BookSuccessorWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookSuccessorWorkerError';
  }
}

interface ActivityRef {
  readonly activityId: string;
  readonly versionId: string;
}

interface CreateCommand {
  readonly predecessorBookId: string;
  readonly expectedUpdatedAt: string;
  readonly targetMode: MaterialBookMode;
  readonly reason: string;
  readonly activityRefs?: readonly ActivityRef[];
  readonly operationId: string;
}

interface ArchiveCommand {
  readonly successorBookId: string;
  readonly expectedUpdatedAt: string;
  readonly operationId: string;
}

type BookRecord = Record<string, unknown>;

const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};
const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new BookSuccessorWorkerError('invalid_request');
  }
  return value;
};
const isSafeId = (value: unknown): value is string => (
  typeof value === 'string'
  && SAFE_ID.test(value)
  && !RESERVED_OBJECT_KEYS.has(value)
);
const id = (value: unknown, code: string): string => {
  if (!isSafeId(value)) {
    throw new BookSuccessorWorkerError(code);
  }
  return value;
};
const uuid = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BookSuccessorWorkerError('invalid_operation_id');
  }
  return value;
};
const timestamp = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BookSuccessorWorkerError(code);
  }
  return value;
};
const mode = (value: unknown): MaterialBookMode => {
  if (typeof value !== 'string' || !MODES.has(value as MaterialBookMode)) {
    throw new BookSuccessorWorkerError('invalid_target_mode');
  }
  return value as MaterialBookMode;
};
const reason = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 1000) {
    throw new BookSuccessorWorkerError('invalid_reason');
  }
  return value.trim();
};
const persistedString = (
  value: unknown,
  options: { readonly required?: boolean; readonly max: number },
): string | undefined => {
  if (value === undefined && !options.required) return undefined;
  if (typeof value !== 'string' || (options.required && value.trim().length === 0) || value.length > options.max) {
    throw new Error('invalid_persisted_book_metadata');
  }
  return value;
};
const persistedStringList = (
  value: unknown,
  options: { readonly idValues?: boolean; readonly maxItems?: number; readonly maxLength?: number } = {},
): string[] | undefined => {
  if (value === undefined) return undefined;
  const maxItems = options.maxItems ?? 128;
  const maxLength = options.maxLength ?? 300;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error('invalid_persisted_book_metadata');
  }
  return value.map((entry) => {
    if (
      typeof entry !== 'string'
      || entry.trim().length === 0
      || entry.length > maxLength
      || (options.idValues === true && !SAFE_ID.test(entry))
    ) {
      throw new Error('invalid_persisted_book_metadata');
    }
    return entry;
  });
};
const validatePersistedBookMetadata = (book: BookRecord): void => {
  persistedString(book.title, { required: true, max: 500 });
  persistedString(book.subtitle, { max: 500 });
  persistedStringList(book.authors);
  persistedString(book.publisher, { max: 300 });
  persistedString(book.edition, { max: 160 });
  persistedString(book.series, { max: 300 });
  persistedString(book.isbn, { max: 64 });
  persistedString(book.coverUrl, { max: 2048 });
  if (book.primaryTestTypeId !== undefined) id(book.primaryTestTypeId, 'invalid_persisted_book_metadata');
  persistedStringList(book.testTypeIds, { idValues: true, maxLength: 160 });
  persistedStringList(book.tags, { maxLength: 160 });
  persistedString(book.description, { max: 10_000 });
};
const activityRefs = (value: unknown): ActivityRef[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 256) {
    throw new BookSuccessorWorkerError('invalid_activity_refs');
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    const ref = exact(entry, ['activityId', 'versionId']);
    const activityId = id(ref.activityId, 'invalid_activity_ref');
    const versionId = id(ref.versionId, 'invalid_activity_ref');
    const key = `${activityId}\u0000${versionId}`;
    if (seen.has(key)) throw new BookSuccessorWorkerError('invalid_activity_refs');
    seen.add(key);
    return { activityId, versionId };
  });
};
const parseCreate = (value: unknown): CreateCommand => {
  const input = exact(value, [
    'predecessorBookId', 'expectedUpdatedAt', 'targetMode', 'reason', 'activityRefs', 'operationId',
  ]);
  return {
    predecessorBookId: id(input.predecessorBookId, 'invalid_predecessor_book_id'),
    expectedUpdatedAt: timestamp(input.expectedUpdatedAt, 'invalid_expected_updated_at'),
    targetMode: mode(input.targetMode),
    reason: reason(input.reason),
    activityRefs: activityRefs(input.activityRefs),
    operationId: uuid(input.operationId),
  };
};
const parseArchive = (value: unknown): ArchiveCommand => {
  const input = exact(value, ['successorBookId', 'expectedUpdatedAt', 'operationId']);
  return {
    successorBookId: id(input.successorBookId, 'invalid_successor_book_id'),
    expectedUpdatedAt: timestamp(input.expectedUpdatedAt, 'invalid_expected_updated_at'),
    operationId: uuid(input.operationId),
  };
};

const parseBody = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new BookSuccessorWorkerError('content_type_required');
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new BookSuccessorWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BookSuccessorWorkerError('body_too_large', 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BookSuccessorWorkerError('invalid_json');
  }
};

const authorizeProfile = (uid: unknown, profile: unknown): string => {
  if (!isSafeId(uid) || !isRecord(profile)) {
    throw new BookSuccessorWorkerError('forbidden', 403);
  }
  if (typeof profile.uid === 'string' && profile.uid !== uid) {
    throw new BookSuccessorWorkerError('forbidden', 403);
  }
  if ((profile.role !== 'teacher' && profile.role !== 'super_admin')
    || PROFILE_BLOCKED.has(String(profile.status ?? ''))) {
    throw new BookSuccessorWorkerError('forbidden', 403);
  }
  return uid;
};
const persistedBook = (root: BookSuccessorRoot, bookId: string): BookRecord | null => {
  const value = root.books?.[bookId];
  if (!isRecord(value) || value.bookId !== bookId || typeof value.ownerId !== 'string') return null;
  if (typeof value.title !== 'string' || typeof value.updatedAt !== 'string') {
    throw new Error('invalid_persisted_book');
  }
  if (value.bookMode !== undefined && !MODES.has(value.bookMode as MaterialBookMode)) {
    throw new Error('invalid_persisted_book_mode');
  }
  validatePersistedBookMetadata(value);
  return value;
};
const resolvedMode = (book: BookRecord): MaterialBookMode => (book.bookMode === undefined ? 'materials' : book.bookMode as MaterialBookMode);
const reusableActivityRefs = (
  root: BookSuccessorRoot,
  predecessorBookId: string,
  refs: readonly ActivityRef[] | undefined,
): ActivityRef[] | undefined => {
  if (!refs || refs.length === 0) return undefined;

  const bookNodesRoot = isRecord(root.book_nodes) ? root.book_nodes : null;
  const predecessorNodes = bookNodesRoot && isRecord(bookNodesRoot[predecessorBookId])
    ? bookNodesRoot[predecessorBookId]
    : null;
  const summaryIndexes = isRecord(root.material_summary_indexes) ? root.material_summary_indexes : null;
  const summaryV1 = summaryIndexes && isRecord(summaryIndexes.v1) ? summaryIndexes.v1 : null;
  const summariesById = summaryV1 && isRecord(summaryV1.by_id) ? summaryV1.by_id : null;

  return refs.map((ref) => {
    const summary = summariesById && isRecord(summariesById[ref.activityId])
      ? summariesById[ref.activityId]
      : null;
    if (
      !summary
      || summary.materialId !== ref.activityId
      || summary.activityId !== ref.activityId
      || summary.materialKind !== 'interactive-activity'
      || !isSafeId(summary.ownerId)
      || summary.lifecycleState !== 'published'
      || summary.publishedVersionId !== ref.versionId
    ) {
      throw new BookSuccessorWorkerError('activity_ref_not_reusable', 409);
    }

    const placedOnPredecessor = Object.values(predecessorNodes ?? {}).some((node) => (
      isRecord(node)
      && Array.isArray(node.materialRefs)
      && node.materialRefs.some((candidate) => (
        isRecord(candidate)
        && candidate.materialKind === 'interactive-activity'
        && candidate.materialId === ref.activityId
        && candidate.snapshotVersionId === ref.versionId
        && candidate.availability === 'available'
        && (
          candidate.ownerIdSnapshot === undefined
          || candidate.ownerIdSnapshot === summary.ownerId
        )
      ))
    ));
    if (!placedOnPredecessor) {
      throw new BookSuccessorWorkerError('activity_ref_not_reusable', 409);
    }
    return { ...ref };
  });
};
const lineage = (book: BookRecord): Record<string, unknown> | null => {
  const value = book.modeSuccessorLineage;
  if (!isRecord(value) || value.kind !== 'mode-successor') return null;
  if (
    !isSafeId(value.predecessorBookId)
    || !MODES.has(value.fromMode as MaterialBookMode)
    || !MODES.has(value.toMode as MaterialBookMode)
    || value.fromMode === value.toMode
    || value.toMode !== resolvedMode(book)
    || !isSafeId(value.actorId)
    || value.actorId !== book.ownerId
  ) {
    return null;
  }
  try {
    reason(value.reason);
    timestamp(value.createdAt, 'invalid_lineage_timestamp');
  } catch {
    return null;
  }
  return value;
};
const operation = (
  root: BookSuccessorRoot,
  ownerId: string,
  operationId: string,
): PersistedBookSuccessorOperation | null => {
  const ownerOperations = root.book_successor_operations?.[ownerId];
  if (ownerOperations !== undefined && !isRecord(ownerOperations)) {
    throw new Error('invalid_persisted_book_successor_owner_operations');
  }
  const value = ownerOperations?.[operationId];
  if (value === undefined) return null;
  if (!isRecord(value) || typeof value.ownerId !== 'string' || typeof value.fingerprint !== 'string' || !isRecord(value.result)) {
    throw new Error('invalid_persisted_book_successor_operation');
  }
  return value as unknown as PersistedBookSuccessorOperation;
};
const withOperation = (
  root: BookSuccessorRoot,
  ownerId: string,
  operationId: string,
  value: PersistedBookSuccessorOperation,
): void => {
  const ownerOperations = root.book_successor_operations?.[ownerId];
  if (ownerOperations !== undefined && !isRecord(ownerOperations)) {
    throw new Error('invalid_persisted_book_successor_owner_operations');
  }
  root.book_successor_operations = {
    ...(root.book_successor_operations ?? {}),
    [ownerId]: {
      ...(ownerOperations ?? {}),
      [operationId]: clone(value),
    },
  };
};
const copySafeMetadata = (book: BookRecord): BookRecord => Object.fromEntries(
  SAFE_METADATA_KEYS
    .filter((key) => book[key] !== undefined)
    .map((key) => [key, clone(book[key])]),
);

const setCatalogPath = (
  root: BookSuccessorRoot,
  absolutePath: string,
  value: unknown,
): void => {
  const prefix = 'material_catalog/';
  if (!absolutePath.startsWith(prefix)) {
    throw new Error('book_successor_catalog_path_forbidden');
  }
  const parts = absolutePath.slice(prefix.length).split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !isSafeId(part))) {
    throw new Error('book_successor_catalog_path_forbidden');
  }
  let cursor = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const current = Object.prototype.hasOwnProperty.call(cursor, part)
      ? cursor[part]
      : undefined;
    if (current === undefined) {
      cursor[part] = {};
    } else if (!isRecord(current)) {
      throw new Error('invalid_material_catalog_index_parent');
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts.at(-1) as string] = clone(value);
};

const deleteCatalogPath = (
  root: BookSuccessorRoot,
  absolutePath: string,
): void => {
  const prefix = 'material_catalog/';
  if (!absolutePath.startsWith(prefix)) {
    throw new Error('book_successor_catalog_path_forbidden');
  }
  const parts = absolutePath.slice(prefix.length).split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !isSafeId(part))) {
    throw new Error('book_successor_catalog_path_forbidden');
  }
  let cursor = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(cursor, part) || !isRecord(cursor[part])) return;
    cursor = cursor[part] as Record<string, unknown>;
  }
  delete cursor[parts.at(-1) as string];
};

const uniqueStrings = (value: unknown): string[] => (
  Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))]
    : []
);

const indexRow = (book: BookRecord): Record<string, unknown> => {
  const testTypeIds = uniqueStrings(book.testTypeIds);
  return {
    bookId: book.bookId,
    bookMode: book.bookMode,
    ownerId: book.ownerId,
    title: book.title,
    ...(book.subtitle === undefined ? {} : { subtitle: book.subtitle }),
    authors: uniqueStrings(book.authors),
    ...(book.publisher === undefined ? {} : { publisher: book.publisher }),
    ...(book.series === undefined ? {} : { series: book.series }),
    ...(book.coverUrl === undefined ? {} : { coverUrl: book.coverUrl }),
    visibility: book.visibility,
    status: book.status,
    testTypeIds,
    testTypeMembership: Object.fromEntries(testTypeIds.map((testTypeId) => [testTypeId, true])),
    tags: uniqueStrings(book.tags),
    updatedAt: book.updatedAt,
  };
};

const summary = (book: BookRecord): Record<string, unknown> => {
  const testTypeIds = [...new Set([
    ...(typeof book.primaryTestTypeId === 'string' ? [book.primaryTestTypeId] : []),
    ...uniqueStrings(book.testTypeIds),
  ])];
  const normalizedTestTypeIds = testTypeIds.length > 0 ? testTypeIds : ['custom'];
  const tags = uniqueStrings(book.tags);
  return {
    schemaVersion: 1,
    materialId: book.bookId,
    producerId: 'material-book',
    materialKind: 'book',
    surfaceFamily: 'book',
    ownerId: book.ownerId,
    title: book.title,
    ...(typeof book.description === 'string' && book.description
      ? { description: book.description }
      : {}),
    visibility: book.visibility === 'public-library-published' ? 'public' : 'private',
    lifecycleState: book.status === 'archived' ? 'archived' : 'active',
    ...(typeof book.primaryTestTypeId === 'string'
      ? { primaryTestTypeId: book.primaryTestTypeId }
      : {}),
    testTypeIds: normalizedTestTypeIds,
    testTypeMembership: Object.fromEntries(normalizedTestTypeIds.map((testTypeId) => [testTypeId, true])),
    tags: tags.length > 0 ? tags : ['book'],
    updatedAt: book.updatedAt,
  };
};

const synchronizeBookIndexes = (
  root: BookSuccessorRoot,
  book: BookRecord,
  previous?: BookRecord,
): void => {
  const row = indexRow(book);
  const testTypeIds = uniqueStrings(book.testTypeIds);
  setCatalogPath(root, `material_catalog/book_indexes/by_owner/${book.ownerId}/${book.bookId}`, row);
  setCatalogPath(root, `material_catalog/book_indexes/by_visibility/${book.visibility}/${book.bookId}`, row);
  for (const testTypeId of testTypeIds) {
    setCatalogPath(root, `material_catalog/book_indexes/by_test_type/${testTypeId}/${book.bookId}`, row);
  }

  const materialSummary = summary(book);
  const summaryRoot = 'material_catalog/material_summary_indexes/v1';
  setCatalogPath(root, `${summaryRoot}/by_id/${book.bookId}`, materialSummary);
  if (previous) {
    const oldSummary = summary(previous);
    for (const path of [
      `${summaryRoot}/by_owner/${previous.ownerId}/${previous.bookId}`,
      `${summaryRoot}/by_visibility/${oldSummary.visibility}/${previous.bookId}`,
      `${summaryRoot}/by_material_kind/book/${previous.bookId}`,
      ...uniqueStrings(oldSummary.testTypeIds).map((testTypeId) =>
        `${summaryRoot}/by_test_type/${testTypeId}/${previous.bookId}`),
    ]) {
      deleteCatalogPath(root, path);
    }
  }
  if (materialSummary.lifecycleState === 'active') {
    for (const path of [
      `${summaryRoot}/by_owner/${book.ownerId}/${book.bookId}`,
      `${summaryRoot}/by_visibility/${materialSummary.visibility}/${book.bookId}`,
      `${summaryRoot}/by_material_kind/book/${book.bookId}`,
      ...uniqueStrings(materialSummary.testTypeIds).map((testTypeId) =>
        `${summaryRoot}/by_test_type/${testTypeId}/${book.bookId}`),
    ]) {
      setCatalogPath(root, path, materialSummary);
    }
  }
};

export const createBookSuccessorWorkerHandlers = (options: {
  repository?: BookSuccessorRepository;
  now?: () => string;
  createBookId?: () => string;
} = {}) => {
  const now = options.now ?? (() => new Date().toISOString());
  const createBookId = options.createBookId ?? (() => `book-${crypto.randomUUID()}`);
  const repositoryFor = (env: BookSuccessorRepositoryEnv): BookSuccessorRepository => (
    options.repository ?? new FirebaseRestBookSuccessorRepository({ env })
  );

  const respond = async (
    action: 'create' | 'archive',
    input: {
      request: Request;
      env: BookSuccessorRepositoryEnv;
      verifiedUid?: string;
    },
  ): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    try {
      const actorId = id(input.verifiedUid, 'invalid_verified_uid');
      const headerOperationId = input.request.headers.get('idempotency-key');
      if (!headerOperationId) {
        throw new BookSuccessorWorkerError('idempotency_key_required');
      }
      const value = await parseBody(input.request);
      const command = action === 'create' ? parseCreate(value) : parseArchive(value);
      if (headerOperationId !== command.operationId) {
        throw new BookSuccessorWorkerError('idempotency_key_mismatch');
      }
      const repository = repositoryFor(input.env);
      const authenticate = async (): Promise<void> => {
        authorizeProfile(actorId, await repository.readValue(`users/${actorId}`));
      };
      await authenticate();
      const fingerprint = stable({ action, actorId, command });
      const result = await repository.transaction((root) => {
        const stored = operation(root, actorId, command.operationId);
        if (stored) {
          if (stored.ownerId !== actorId || stored.fingerprint !== fingerprint) {
            throw new BookSuccessorWorkerError('idempotency-conflict', 409);
          }
          return { outcome: { ...clone(stored.result), status: 'replayed' }, next: root, write: false };
        }

        if (action === 'create') {
          const createCommand = command as CreateCommand;
          const predecessor = persistedBook(root, createCommand.predecessorBookId);
          if (!predecessor) throw new BookSuccessorWorkerError('not-found', 404);
          if (predecessor.ownerId !== actorId) throw new BookSuccessorWorkerError('forbidden', 403);
          const fromMode = resolvedMode(predecessor);
          if (fromMode === createCommand.targetMode) throw new BookSuccessorWorkerError('same_mode', 409);
          if (predecessor.updatedAt !== createCommand.expectedUpdatedAt) throw new BookSuccessorWorkerError('stale', 409);
          const retainedActivityRefs = reusableActivityRefs(
            root,
            createCommand.predecessorBookId,
            createCommand.activityRefs,
          );

          const successorBookId = id(createBookId(), 'invalid_successor_book_id');
          if (successorBookId === createCommand.predecessorBookId || root.books?.[successorBookId] !== undefined) {
            throw new BookSuccessorWorkerError('id-collision', 409);
          }
          const createdAt = timestamp(now(), 'invalid_clock');
          const successor: BookRecord = {
            ...copySafeMetadata(predecessor),
            bookId: successorBookId,
            bookMode: createCommand.targetMode,
            ownerId: actorId,
            visibility: 'private',
            status: 'draft-empty',
            createdAt,
            updatedAt: createdAt,
            createdBy: actorId,
            updatedBy: actorId,
            modeSuccessorLineage: {
              kind: 'mode-successor',
              predecessorBookId: createCommand.predecessorBookId,
              fromMode,
              toMode: createCommand.targetMode,
              reason: createCommand.reason,
              actorId,
              createdAt,
            },
          };
          if (retainedActivityRefs !== undefined) {
            successor.reusedActivityRefs = clone(retainedActivityRefs);
          }
          const created = {
            status: 'created',
            successor: clone(successor),
            predecessorUpdatedAt: predecessor.updatedAt,
          } satisfies Record<string, unknown>;
          root.books = { ...(root.books ?? {}), [successorBookId]: successor };
          synchronizeBookIndexes(root, successor);
          withOperation(root, actorId, createCommand.operationId, { ownerId: actorId, fingerprint, result: created });
          return { outcome: created, next: root, write: true };
        }

        const archiveCommand = command as ArchiveCommand;
        const successor = persistedBook(root, archiveCommand.successorBookId);
        if (!successor) throw new BookSuccessorWorkerError('not-found', 404);
        if (successor.ownerId !== actorId) throw new BookSuccessorWorkerError('forbidden', 403);
        if (
          !lineage(successor)
          || successor.visibility !== 'private'
          || typeof successor.status !== 'string'
          || !ARCHIVABLE_SUCCESSOR_STATUSES.has(successor.status)
        ) {
          throw new BookSuccessorWorkerError('successor-not-draft', 409);
        }
        if (successor.updatedAt !== archiveCommand.expectedUpdatedAt) throw new BookSuccessorWorkerError('stale', 409);
        const archived: BookRecord = { ...clone(successor), status: 'archived', updatedAt: timestamp(now(), 'invalid_clock'), updatedBy: actorId };
        const result = { status: 'archived', successorBookId: archiveCommand.successorBookId } satisfies Record<string, unknown>;
        root.books = { ...(root.books ?? {}), [archiveCommand.successorBookId]: archived };
        synchronizeBookIndexes(
          root,
          archived,
          successor,
        );
        withOperation(root, actorId, archiveCommand.operationId, { ownerId: actorId, fingerprint, result });
        return { outcome: result, next: root, write: true };
      }, { beforeWrite: authenticate });
      return { body: result, init: { status: 200 } };
    } catch (error) {
      if (error instanceof BookSuccessorWorkerError) return { body: { code: error.code }, init: { status: error.status } };
      console.error('Book successor mutation failed', error instanceof Error ? error.message : String(error));
      return { body: { code: 'book_successor_failed' }, init: { status: 500 } };
    }
  };

  return {
    create: (input: Parameters<typeof respond>[1]) => respond('create', input),
    archive: (input: Parameters<typeof respond>[1]) => respond('archive', input),
  };
};
