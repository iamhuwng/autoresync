/** Trusted-only capacity contract. No browser code receives this state. */
export const MAX_SOURCE_PDF_BYTES = 500 * 1024 * 1024;
export const BOOK_PDF_ACCOUNT_CAPACITY_BYTES = 9_000_000_000;
export const MAX_PROVIDER_RECONCILIATION_AGE_MS = 15 * 60 * 1_000;
export const MAX_CAPACITY_LEDGER_ENTRIES = 10_000;

export const CAPACITY_LEDGER_CATEGORIES = [
  'ready',
  'pending',
  'replacement',
  'temporary',
  'hidden',
  'retained',
  'delayed_deletion',
  'unfinished',
  'provider_reported',
] as const;

export type CapacityLedgerCategory = (typeof CAPACITY_LEDGER_CATEGORIES)[number];

export class CapacityLedgerError extends Error {
  constructor(public readonly code:
    | 'capacity_exceeded'
    | 'invalid_reservation'
    | 'provider_drift'
    | 'stale_revision',
  ) {
    super(`book_source_capacity_${code}`);
    this.name = 'CapacityLedgerError';
  }
}

export interface ReservedSourceVersionIdentity {
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly storageLocationId: string;
  readonly privateBucketId: string;
  readonly providerObjectKey: string;
  readonly expectedByteSize: number;
  readonly checksumSlot: 'unfilled';
  readonly providerIdentitySlot: 'unfilled';
  readonly expiresAt: string;
  readonly revision: number;
  readonly lifecycleState: 'reserved';
}

/**
 * A row is counted exactly once. Provider-reported rows are already included
 * in `providerReconciliation`; not-yet-reported rows reserve future bytes.
 */
export interface CapacityLedgerEntry {
  readonly reservation: ReservedSourceVersionIdentity;
  readonly category: CapacityLedgerCategory;
  readonly providerReported: boolean;
}

export interface ProviderReconciliationSnapshot {
  readonly status: 'healthy' | 'drift';
  readonly totalBytes: number;
  readonly objectCount: number;
  readonly completedAt: string;
}

export interface TrustedCapacityLedgerState {
  readonly revision: number;
  readonly storageLocationId: string;
  readonly privateBucketId: string;
  readonly providerReconciliation: ProviderReconciliationSnapshot;
  readonly entries: readonly CapacityLedgerEntry[];
}

/** Store implementation must make compareAndSet atomic at trusted boundary. */
export interface TrustedCapacityLedgerStore {
  read(input: {
    readonly storageLocationId: string;
    readonly privateBucketId: string;
  }): Promise<TrustedCapacityLedgerState>;
  compareAndSet(input: {
    readonly storageLocationId: string;
    readonly privateBucketId: string;
    readonly expectedRevision: number;
    readonly next: TrustedCapacityLedgerState;
  }): Promise<boolean>;
}

export interface ReserveSourceCapacityInput {
  readonly store: TrustedCapacityLedgerStore;
  readonly expectedLedgerRevision: number;
  /** Caller supplies trusted Worker time; stale snapshots never admit capacity. */
  readonly now: Date;
  readonly reservation: ReservedSourceVersionIdentity;
  /** Replacement always keeps prior provider bytes through exact deletion. */
  readonly category: 'pending' | 'replacement' | 'temporary' | 'unfinished';
}

const safeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const fail = (code: CapacityLedgerError['code']): never => { throw new CapacityLedgerError(code); };
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const RESERVATION_KEYS = [
  'sourceVersionId',
  'sourceKey',
  'ownerId',
  'bookId',
  'storageLocationId',
  'privateBucketId',
  'providerObjectKey',
  'expectedByteSize',
  'checksumSlot',
  'providerIdentitySlot',
  'expiresAt',
  'revision',
  'lifecycleState',
] as const;
const STATE_KEYS = [
  'revision',
  'storageLocationId',
  'privateBucketId',
  'providerReconciliation',
  'entries',
] as const;
const RECONCILIATION_KEYS = [
  'status',
  'totalBytes',
  'objectCount',
  'completedAt',
] as const;
const ENTRY_KEYS = ['reservation', 'category', 'providerReported'] as const;
const RESERVABLE_CATEGORIES = new Set<ReserveSourceCapacityInput['category']>([
  'pending',
  'replacement',
  'temporary',
  'unfinished',
]);
const LEDGER_CATEGORIES = new Set<CapacityLedgerCategory>(
  CAPACITY_LEDGER_CATEGORIES,
);

const plainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length &&
    actual.every((key) => typeof key === 'string' && keys.includes(key));
};
const safeIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_IDENTIFIER.test(value);
const safeObjectKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 1_024 &&
  !value.startsWith('/') &&
  !value.endsWith('/') &&
  !value.includes('\\') &&
  !/[\u0000-\u001F\u007F]/u.test(value) &&
  value.split('/').every((segment) =>
    segment.length > 0 && segment !== '.' && segment !== '..');
const canonicalIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const sameLocation = (state: TrustedCapacityLedgerState, reservation: ReservedSourceVersionIdentity): boolean =>
  state.storageLocationId === reservation.storageLocationId
  && state.privateBucketId === reservation.privateBucketId;

const validateReservation = (reservation: ReservedSourceVersionIdentity): void => {
  if (!plainRecord(reservation) ||
    !hasExactKeys(reservation, RESERVATION_KEYS) ||
    !safeIdentifier(reservation.sourceVersionId) ||
    !safeIdentifier(reservation.sourceKey) ||
    !safeIdentifier(reservation.ownerId) ||
    !safeIdentifier(reservation.bookId) ||
    !safeIdentifier(reservation.storageLocationId) ||
    !safeIdentifier(reservation.privateBucketId) ||
    !safeObjectKey(reservation.providerObjectKey)
    || reservation.checksumSlot !== 'unfilled' || reservation.providerIdentitySlot !== 'unfilled'
    || reservation.lifecycleState !== 'reserved' || !safeInteger(reservation.revision)
    || !safeInteger(reservation.expectedByteSize) || reservation.expectedByteSize < 1
    || reservation.expectedByteSize > MAX_SOURCE_PDF_BYTES
    || !canonicalIsoDate(reservation.expiresAt)) fail('invalid_reservation');
};

const validateLedgerState = (state: TrustedCapacityLedgerState): void => {
  if (!plainRecord(state) ||
    !hasExactKeys(state, STATE_KEYS) ||
    !safeInteger(state.revision) ||
    !safeIdentifier(state.storageLocationId) ||
    !safeIdentifier(state.privateBucketId) ||
    !plainRecord(state.providerReconciliation) ||
    !hasExactKeys(state.providerReconciliation, RECONCILIATION_KEYS) ||
    (state.providerReconciliation.status !== 'healthy' &&
      state.providerReconciliation.status !== 'drift') ||
    !safeInteger(state.providerReconciliation.totalBytes) ||
    !safeInteger(state.providerReconciliation.objectCount) ||
    !canonicalIsoDate(state.providerReconciliation.completedAt) ||
    !Array.isArray(state.entries) ||
    state.entries.length > MAX_CAPACITY_LEDGER_ENTRIES) {
    fail('invalid_reservation');
  }
  const sourceVersionIds = new Set<string>();
  const providerObjectKeys = new Set<string>();
  for (const entry of state.entries) {
    if (!plainRecord(entry) ||
      !hasExactKeys(entry, ENTRY_KEYS) ||
      !LEDGER_CATEGORIES.has(entry.category as CapacityLedgerCategory) ||
      typeof entry.providerReported !== 'boolean') {
      fail('invalid_reservation');
    }
    validateReservation(entry.reservation as ReservedSourceVersionIdentity);
    const reservation = entry.reservation as ReservedSourceVersionIdentity;
    if (!sameLocation(state, reservation) ||
      sourceVersionIds.has(reservation.sourceVersionId) ||
      providerObjectKeys.has(reservation.providerObjectKey)) {
      fail('invalid_reservation');
    }
    sourceVersionIds.add(reservation.sourceVersionId);
    providerObjectKeys.add(reservation.providerObjectKey);
  }
};

export const getOutstandingReservedBytes = (entries: readonly CapacityLedgerEntry[]): number => {
  const total = entries.filter((entry) => !entry.providerReported).reduce((sum, entry) => {
    if (!safeInteger(entry.reservation.expectedByteSize)) fail('invalid_reservation');
    const next = sum + entry.reservation.expectedByteSize;
    if (!Number.isSafeInteger(next)) fail('invalid_reservation');
    return next;
  }, 0);
  return total;
};

export const getLedgerProviderTotals = (entries: readonly CapacityLedgerEntry[]): {
  readonly totalBytes: number;
  readonly objectCount: number;
} => {
  let totalBytes = 0;
  let objectCount = 0;
  for (const entry of entries) {
    if (!entry.providerReported) continue;
    if (!safeInteger(entry.reservation.expectedByteSize)) fail('invalid_reservation');
    totalBytes += entry.reservation.expectedByteSize;
    objectCount += 1;
    if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(objectCount)) fail('invalid_reservation');
  }
  return Object.freeze({ totalBytes, objectCount });
};

export const getAccountedCapacityBytes = (state: TrustedCapacityLedgerState): number => {
  if (!safeInteger(state.providerReconciliation.totalBytes)) fail('invalid_reservation');
  const total = state.providerReconciliation.totalBytes + getOutstandingReservedBytes(state.entries);
  if (!Number.isSafeInteger(total)) fail('invalid_reservation');
  return total;
};

const hasCurrentHealthyReconciliation = (snapshot: ProviderReconciliationSnapshot, now: Date): boolean => {
  const completedAt = new Date(snapshot.completedAt).getTime();
  const nowMs = now.getTime();
  return snapshot.status === 'healthy' && Number.isFinite(completedAt) && Number.isFinite(nowMs)
    && completedAt <= nowMs && nowMs - completedAt <= MAX_PROVIDER_RECONCILIATION_AGE_MS;
};

/**
 * One read and one CAS only. Caller retries a stale result explicitly; this
 * worker unit never loops or silently replaces a newer reservation.
 */
export const reserveSourceCapacity = async (input: ReserveSourceCapacityInput): Promise<TrustedCapacityLedgerState> => {
  validateReservation(input.reservation);
  if (!RESERVABLE_CATEGORIES.has(input.category) ||
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime()) ||
    Date.parse(input.reservation.expiresAt) <= input.now.getTime() ||
    !safeInteger(input.expectedLedgerRevision)) {
    fail('invalid_reservation');
  }
  const state = await input.store.read({
    storageLocationId: input.reservation.storageLocationId,
    privateBucketId: input.reservation.privateBucketId,
  });
  validateLedgerState(state);
  if (!sameLocation(state, input.reservation) || state.revision !== input.expectedLedgerRevision) fail('stale_revision');
  if (!hasCurrentHealthyReconciliation(state.providerReconciliation, input.now)) fail('provider_drift');
  if (state.entries.some((entry) => entry.reservation.sourceVersionId === input.reservation.sourceVersionId
    || entry.reservation.providerObjectKey === input.reservation.providerObjectKey
    || (input.category !== 'replacement' && entry.reservation.sourceKey === input.reservation.sourceKey))) {
    fail('stale_revision');
  }
  const accounted = getAccountedCapacityBytes(state);
  const nextAccounted = accounted + input.reservation.expectedByteSize;
  if (!Number.isSafeInteger(nextAccounted) ||
    nextAccounted > BOOK_PDF_ACCOUNT_CAPACITY_BYTES) fail('capacity_exceeded');
  if (state.entries.length >= MAX_CAPACITY_LEDGER_ENTRIES) fail('invalid_reservation');

  const next: TrustedCapacityLedgerState = Object.freeze({
    ...state,
    revision: state.revision + 1,
    entries: Object.freeze([...state.entries, Object.freeze({
      reservation: Object.freeze({ ...input.reservation }),
      category: input.category,
      providerReported: false,
    })]),
  });
  if (!await input.store.compareAndSet({
    storageLocationId: input.reservation.storageLocationId,
    privateBucketId: input.reservation.privateBucketId,
    expectedRevision: state.revision,
    next,
  })) fail('stale_revision');
  return next;
};
