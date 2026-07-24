import type {
  BookSourceChecksum,
  BookSourceUploadAccountState,
  BookSourceUploadKind,
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import {
  assertBookSourceCapacityAvailable,
  assertBookSourcePdfByteSize,
  calculateBookSourceCapacityUsage,
} from './sourceCapacity.service';
import { normalizeBookSourceDisplayFilename } from './sourceDisplayFilename.service';
import type { SourceUploadRtdbTransaction } from './sourceUpload.firebaseRtdbTransaction';
import { createBookSourceVersionStorageIdentity, SourceVersionError } from './sourceVersion.service';

export class SourceUploadConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceUploadConflictError';
  }
}

const MAX_SOURCE_UPLOAD_OPERATIONS = 10_000;
const OPERATION_KEYS = [
  'reservationId',
  'bookId',
  'sourceVersionId',
  'sourceKey',
  'ownerId',
  'storageLocationId',
  'providerKind',
  'privateBucketId',
  'providerObjectKey',
  'kind',
  'byteSize',
  'originalFilename',
  'expectedChecksum',
  'createdAt',
  'expiresAt',
  'status',
  'verifiedStorage',
  'completedAt',
] as const;

export interface ReserveSourceUploadInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly ownerId: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  readonly providerObjectKey: string;
  readonly kind: BookSourceUploadKind;
  readonly byteSize: number;
  readonly originalFilename: unknown;
  readonly expectedChecksum: BookSourceChecksum;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CompleteSourceUploadInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  /** Trusted completion inspection, never a browser assertion. */
  readonly verifiedStorage: BookSourceVersionStorageIdentity;
  readonly verifiedAt: string;
}

export interface SourceUploadRtdbRepositoryOptions {
  readonly now?: () => Date;
}

export class SourceUploadRtdbRepository {
  private readonly now: () => Date;

  constructor(
    private readonly transaction: SourceUploadRtdbTransaction,
    private readonly options: SourceUploadRtdbRepositoryOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async reserve(input: ReserveSourceUploadInput): Promise<BookSourceUploadAccountState> {
    const now = this.now();
    assertReservationInput(input, now);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        assertReservationInput(input, this.now());
        if (!current) {
          throw new SourceUploadConflictError(
            'upload account state must be provisioned from trusted provider reconciliation.',
          );
        }
        const state = normalizePersistedState(current);
        assertState(state);
        const previous = state.operations[input.reservationId];
        if (previous) {
          if (!sameReservation(previous, input)) throw new SourceUploadConflictError('reservation identity is immutable.');
          return state;
        }
        if (Object.keys(state.operations).length >= MAX_SOURCE_UPLOAD_OPERATIONS) {
          throw new SourceUploadConflictError('upload account operation bound exceeded.');
        }
        for (const operation of Object.values(state.operations)) {
          if (operation.sourceVersionId === input.sourceVersionId) {
            throw new SourceUploadConflictError('sourceVersionId is already reserved.');
          }
          if (operation.providerObjectKey === input.providerObjectKey) {
            throw new SourceUploadConflictError('providerObjectKey is already reserved.');
          }
          if (input.kind !== 'replacement' && operation.sourceKey === input.sourceKey) {
            throw new SourceUploadConflictError('sourceKey is already reserved.');
          }
        }
        const operation: BookSourceUploadOperation = Object.freeze({
          reservationId: input.reservationId,
          bookId: input.bookId,
          sourceVersionId: input.sourceVersionId,
          sourceKey: input.sourceKey,
          ownerId: input.ownerId,
          storageLocationId: input.storageLocationId,
          providerKind: input.providerKind,
          privateBucketId: input.privateBucketId,
          providerObjectKey: input.providerObjectKey,
          kind: input.kind,
          byteSize: input.byteSize,
          originalFilename: normalizeBookSourceDisplayFilename(input.originalFilename),
          expectedChecksum: Object.freeze({ algorithm: 'sha-256', value: input.expectedChecksum.value.toLowerCase() }),
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
          status: 'reserved',
        });
        const next = nextState(state, { ...state.operations, [input.reservationId]: operation });
        assertBookSourceCapacityAvailable(calculateBookSourceCapacityUsage({ ...next.capacity, operations: next.operations }));
        return next;
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async completeVerified(input: CompleteSourceUploadInput): Promise<BookSourceUploadAccountState> {
    if (!isIsoDate(input.verifiedAt)) throw new SourceVersionError('verifiedAt must be a UTC ISO date.');
    const verifiedStorage = createBookSourceVersionStorageIdentity(input.verifiedStorage);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation) throw new SourceUploadConflictError('upload reservation does not exist.');
        if (operation.status === 'verified_completed') {
          if (!sameVerifiedStorage(operation.verifiedStorage, verifiedStorage)
            || operation.completedAt !== input.verifiedAt) {
            throw new SourceUploadConflictError('verified completion identity is immutable.');
          }
          return state;
        }
        if (operation.status !== 'reserved') throw new SourceUploadConflictError('only a reserved upload can complete.');
        const commitNow = this.now().getTime();
        const verifiedAt = Date.parse(input.verifiedAt);
        if (!Number.isFinite(commitNow)
          || Date.parse(operation.expiresAt) <= commitNow
          || verifiedAt < Date.parse(operation.createdAt)
          || verifiedAt > commitNow) {
          throw new SourceUploadConflictError('trusted completion must occur within the reservation window.');
        }
        assertTrustedCompletionMatchesReservation(operation, verifiedStorage);
        const completed = Object.freeze({ ...operation, status: 'verified_completed' as const, verifiedStorage, completedAt: input.verifiedAt });
        const next = nextState(state, { ...state.operations, [input.reservationId]: completed }, state.capacity.trackedAccountBytes + operation.byteSize);
        assertBookSourceCapacityAvailable(calculateBookSourceCapacityUsage({ ...next.capacity, operations: next.operations }));
        return next;
      },
    });
    return requireCommitted(result.committed, result.value);
  }
}

export const sourceUploadAccountPath = (accountId: string): string =>
  `book_source_upload_accounts/${assertRtdbKey(accountId, 'accountId')}`;

/**
 * Derives provider totals only from canonical verified rows. Any aggregate
 * mismatch or temporary provider state fails closed before reconciliation.
 */
export function getBookSourceUploadProviderTotals(
  value: unknown,
): { readonly totalBytes: number; readonly objectCount: number } {
  const state = normalizePersistedState(value as BookSourceUploadAccountState);
  assertState(state);
  if (state.capacity.temporaryBytes !== 0) {
    throw new SourceUploadConflictError('temporary provider bytes require reconciliation.');
  }
  const completed = Object.values(state.operations).filter(
    (operation) => operation.status === 'verified_completed',
  );
  const totalBytes = completed.reduce((sum, operation) => sum + operation.byteSize, 0);
  if (!Number.isSafeInteger(totalBytes)
    || totalBytes !== state.capacity.trackedAccountBytes) {
    throw new SourceUploadConflictError('tracked provider bytes do not match verified operations.');
  }
  return Object.freeze({ totalBytes, objectCount: completed.length });
}

function nextState(
  state: BookSourceUploadAccountState,
  operations: Readonly<Record<string, BookSourceUploadOperation>>,
  trackedAccountBytes = state.capacity.trackedAccountBytes,
): BookSourceUploadAccountState {
  return Object.freeze({
    revision: state.revision + 1,
    capacity: Object.freeze({ trackedAccountBytes, temporaryBytes: state.capacity.temporaryBytes }),
    operations: Object.freeze(operations),
  });
}

function normalizePersistedState(value: BookSourceUploadAccountState): BookSourceUploadAccountState {
  if (value.operations !== undefined) return value;
  return { ...value, operations: {} };
}

function requireCommitted<T>(committed: boolean, value: T | null): T {
  if (!committed || value === null) throw new SourceUploadConflictError('source upload compare-and-set conflict.');
  return value;
}

function assertReservationInput(input: ReserveSourceUploadInput, now: Date): void {
  assertRtdbKey(input.accountId, 'accountId');
  assertRtdbKey(input.reservationId, 'reservationId');
  assertSafeId(input.bookId, 'bookId');
  assertSafeId(input.sourceVersionId, 'sourceVersionId');
  assertSafeId(input.sourceKey, 'sourceKey');
  assertSafeId(input.ownerId, 'ownerId');
  assertSafeId(input.storageLocationId, 'storageLocationId');
  assertSafeId(input.providerKind, 'providerKind');
  assertSafeId(input.privateBucketId, 'privateBucketId');
  assertProviderObjectKey(input.providerObjectKey);
  if (input.kind !== 'initial' && input.kind !== 'replacement') throw new SourceVersionError('kind must be initial or replacement.');
  assertBookSourcePdfByteSize(input.byteSize);
  if (input.expectedChecksum.algorithm !== 'sha-256' || !/^[a-fA-F0-9]{64}$/u.test(input.expectedChecksum.value)) {
    throw new SourceVersionError('expectedChecksum must be a SHA-256 checksum.');
  }
  if (!(now instanceof Date)
    || !Number.isFinite(now.getTime())
    || !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision < 0
    || !isIsoDate(input.createdAt)
    || !isIsoDate(input.expiresAt)
    || Date.parse(input.expiresAt) <= Date.parse(input.createdAt)
    || Date.parse(input.expiresAt) <= now.getTime()) {
    throw new SourceVersionError('expectedRevision, createdAt, and expiresAt must be valid.');
  }
  normalizeBookSourceDisplayFilename(input.originalFilename);
}

function assertState(state: BookSourceUploadAccountState): void {
  const operations = state.operations ?? {};
  if (!isPlainRecord(state) ||
      (!hasOnlyKeys(state, ['revision', 'capacity', 'operations']) &&
        !hasOnlyKeys(state, ['revision', 'capacity'])) ||
      !Number.isSafeInteger(state.revision) ||
      (state.revision as number) < 0 ||
      !isPlainRecord(state.capacity) ||
      !hasOnlyKeys(state.capacity, ['trackedAccountBytes', 'temporaryBytes']) ||
      !isPlainRecord(operations)) {
    throw new SourceUploadConflictError('invalid upload account state.');
  }
  const entries = Object.entries(operations);
  if (entries.length > MAX_SOURCE_UPLOAD_OPERATIONS) {
    throw new SourceUploadConflictError('upload account operation bound exceeded.');
  }
  const sourceVersionIds = new Set<string>();
  const providerObjectKeys = new Set<string>();
  for (const [reservationId, operation] of entries) {
    assertRtdbKey(reservationId, 'reservationId');
    assertOperation(operation);
    if (reservationId !== operation.reservationId ||
        sourceVersionIds.has(operation.sourceVersionId) ||
        providerObjectKeys.has(operation.providerObjectKey)) {
      throw new SourceUploadConflictError('upload account operation identity is inconsistent.');
    }
    sourceVersionIds.add(operation.sourceVersionId);
    providerObjectKeys.add(operation.providerObjectKey);
  }
  calculateBookSourceCapacityUsage({ ...state.capacity, operations: state.operations });
}

function assertOperation(value: unknown): asserts value is BookSourceUploadOperation {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, OPERATION_KEYS)) {
    throw new SourceUploadConflictError('invalid upload operation.');
  }
  assertRtdbKey(value.reservationId, 'reservationId');
  for (const [field, label] of [
    ['bookId', 'bookId'],
    ['sourceVersionId', 'sourceVersionId'],
    ['sourceKey', 'sourceKey'],
    ['ownerId', 'ownerId'],
    ['storageLocationId', 'storageLocationId'],
    ['providerKind', 'providerKind'],
    ['privateBucketId', 'privateBucketId'],
  ] as const) {
    assertSafeId(value[field], label);
  }
  assertProviderObjectKey(value.providerObjectKey);
  if (value.kind !== 'initial' && value.kind !== 'replacement') {
    throw new SourceUploadConflictError('invalid upload operation kind.');
  }
  if (value.status !== 'reserved' &&
      value.status !== 'verified_completed' &&
      value.status !== 'released') {
    throw new SourceUploadConflictError('invalid upload operation status.');
  }
  assertBookSourcePdfByteSize(value.byteSize);
  if (normalizeBookSourceDisplayFilename(value.originalFilename) !== value.originalFilename ||
      !isPlainRecord(value.expectedChecksum) ||
      !hasOnlyKeys(value.expectedChecksum, ['algorithm', 'value']) ||
      value.expectedChecksum.algorithm !== 'sha-256' ||
      typeof value.expectedChecksum.value !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.expectedChecksum.value) ||
      typeof value.createdAt !== 'string' ||
      typeof value.expiresAt !== 'string' ||
      !isIsoDate(value.createdAt) ||
      !isIsoDate(value.expiresAt) ||
      Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    throw new SourceUploadConflictError('invalid upload operation metadata.');
  }
  if (value.status === 'reserved' &&
      (value.verifiedStorage !== undefined || value.completedAt !== undefined)) {
    throw new SourceUploadConflictError('reserved upload cannot contain completion identity.');
  }
  if (value.status === 'verified_completed') {
    if (value.verifiedStorage === undefined ||
        typeof value.completedAt !== 'string' ||
        !isIsoDate(value.completedAt)) {
      throw new SourceUploadConflictError('verified upload completion is incomplete.');
    }
    const completedAt = Date.parse(value.completedAt);
    if (completedAt < Date.parse(value.createdAt) || completedAt > Date.parse(value.expiresAt)) {
      throw new SourceUploadConflictError('verified upload completion is outside the reservation window.');
    }
    const storage = createBookSourceVersionStorageIdentity(value.verifiedStorage);
    assertTrustedCompletionMatchesReservation(
      value as unknown as BookSourceUploadOperation,
      storage,
    );
  }
}

function assertTrustedCompletionMatchesReservation(operation: BookSourceUploadOperation, storage: BookSourceVersionStorageIdentity): void {
  if (
    storage.bookId !== operation.bookId
    || storage.sourceVersionId !== operation.sourceVersionId
    || storage.storageLocationId !== operation.storageLocationId
    || storage.providerKind !== operation.providerKind
    || storage.privateBucketId !== operation.privateBucketId
    || storage.providerObjectKey !== operation.providerObjectKey
    || storage.byteSize !== operation.byteSize
    || storage.checksum.algorithm !== operation.expectedChecksum.algorithm
    || storage.checksum.value !== operation.expectedChecksum.value
  ) throw new SourceUploadConflictError('trusted completion does not match immutable reservation identity.');
}

function sameReservation(operation: BookSourceUploadOperation, input: ReserveSourceUploadInput): boolean {
  return operation.bookId === input.bookId
    && operation.sourceVersionId === input.sourceVersionId
    && operation.sourceKey === input.sourceKey
    && operation.ownerId === input.ownerId
    && operation.storageLocationId === input.storageLocationId
    && operation.providerKind === input.providerKind
    && operation.privateBucketId === input.privateBucketId
    && operation.providerObjectKey === input.providerObjectKey
    && operation.kind === input.kind
    && operation.byteSize === input.byteSize
    && operation.originalFilename === normalizeBookSourceDisplayFilename(input.originalFilename)
    && operation.expectedChecksum.value === input.expectedChecksum.value.toLowerCase()
    && operation.createdAt === input.createdAt
    && operation.expiresAt === input.expiresAt;
}

function sameVerifiedStorage(left: BookSourceVersionStorageIdentity | undefined, right: BookSourceVersionStorageIdentity): boolean {
  return left !== undefined
    && left.bookId === right.bookId
    && left.sourceVersionId === right.sourceVersionId
    && left.storageLocationId === right.storageLocationId
    && left.providerKind === right.providerKind
    && left.privateBucketId === right.privateBucketId
    && left.providerFileId === right.providerFileId
    && left.providerFileVersionId === right.providerFileVersionId
    && left.providerObjectKey === right.providerObjectKey
    && left.byteSize === right.byteSize
    && left.checksum.algorithm === right.checksum.algorithm
    && left.checksum.value === right.checksum.value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Reflect.ownKeys(value).every((key) =>
    typeof key === 'string' && allowed.includes(key));
}

function assertSafeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(value)) {
    throw new SourceVersionError(`${label} must be a nonempty safe identifier.`);
  }
  return value;
}

function assertRtdbKey(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 256
    || /[\u0000-\u001F\u007F.#$\[\]\/]/u.test(value)) {
    throw new SourceVersionError(`${label} must be a nonempty RTDB-safe key.`);
  }
  return value;
}

function assertProviderObjectKey(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || value.startsWith('/') || value.endsWith('/') || value.includes('\\') || value.split('/').some((part) => part === '' || part === '.' || part === '..') || /[\u0000-\u001F\u007F]/u.test(value)) {
    throw new SourceVersionError('providerObjectKey must be a safe Worker-generated object key.');
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
