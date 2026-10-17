const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const SAFE_HASH = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const MAX_METADATA_KEYS = 24;
const MAX_METADATA_ARRAY = 128;

export const BOOK_UPDATE_RECOVERY_SCHEMA_VERSION = 1 as const;

export type BookUpdateRecoveryRecordKind =
  | 'update-action'
  | 'review-checkpoint'
  | 'notification'
  | 'replacement'
  | 'revocation'
  | 'delete'
  | 'audit';

export type BookUpdateRecoveryPhase =
  | 'restoring_canonical_authority'
  | 'rebuilding'
  | 'reconciling';

export interface BookUpdateRecoveryContext {
  readonly recoveryOperationId: string;
  readonly phase: BookUpdateRecoveryPhase;
}

export interface BookUpdateRecoveryHold {
  readonly kind: 'book-update-recovery-hold';
  readonly schemaVersion: typeof BOOK_UPDATE_RECOVERY_SCHEMA_VERSION;
  readonly recoveryOperationId: string;
  readonly scopeKey: string;
  readonly recipientId: string | null;
  readonly deliveryState: 'unavailable';
  readonly readDenied: true;
  readonly activation: 'held-for-reconciliation';
}

export type BookUpdateRecoveryMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];

export interface BookUpdateRecoveryProjection {
  readonly kind: 'book-update-recovery-projection';
  readonly schemaVersion: typeof BOOK_UPDATE_RECOVERY_SCHEMA_VERSION;
  readonly projectionKey: string;
  readonly recoveryOperationId: string;
  readonly recordKind: BookUpdateRecoveryRecordKind;
  readonly recordId: string;
  readonly idempotencyKey: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly scopeKey: string;
  readonly recipientId: string | null;
  readonly contextId: string | null;
  readonly state: 'held';
  readonly deliveryState: 'unavailable';
  readonly readDenied: true;
  readonly activation: 'held-for-reconciliation';
  readonly metadata: Readonly<Record<string, BookUpdateRecoveryMetadataValue>>;
  readonly canonicalFingerprint: string;
}

export interface BookUpdateRecoveryRebuildResult {
  readonly projections: readonly BookUpdateRecoveryProjection[];
  readonly diagnostics: readonly BookUpdateRecoveryDiagnostic[];
  readonly report: {
    readonly rebuilt: number;
    readonly skippedIdempotent: number;
    readonly invalid: number;
    readonly externallyMissing: number;
    readonly retryable: number;
    readonly terminal: number;
  };
}

export interface BookUpdateRecoveryDiagnostic {
  readonly code:
    | 'invalid-record'
    | 'identity-mismatch'
    | 'owner-mismatch'
    | 'context-mismatch'
    | 'recipient-mismatch'
    | 'source-unavailable'
    | 'source-link-denied'
    | 'duplicate-record'
    | 'audit-order-invalid';
  readonly path: string;
  readonly message: string;
}

export interface BookUpdateRecoveryProjectionStore {
  putIfAbsent(input: {
    readonly projectionKey: string;
    readonly projection: BookUpdateRecoveryProjection;
  }): Promise<'created' | 'replayed' | 'conflict'>;
  readHold(input: { readonly scopeKey: string }): Promise<BookUpdateRecoveryHold | null>;
}

export interface BookUpdateRecoveryAdapter {
  rebuild(input: {
    readonly projections: readonly BookUpdateRecoveryProjection[];
  }): Promise<BookUpdateRecoveryRebuildResult>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('book_update_recovery_non_finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!isRecord(value)) throw new Error('book_update_recovery_non_json');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
};

const fnv1a64 = (value: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
};

export const bookUpdateRecoveryFingerprint = (value: unknown): string => `fnv1a64:${fnv1a64(stable(value))}`;

const forbiddenMetadataKey = /(?:answer|response|prompt|pdf|body|byte|provider|object|credential|secret|token|url|link|message|title|feedback|content|payload)/iu;

const validMetadataValue = (value: unknown): value is BookUpdateRecoveryMetadataValue => (
  value === null
  || typeof value === 'string' && value.length <= 256
  || typeof value === 'number' && Number.isFinite(value)
  || typeof value === 'boolean'
  || Array.isArray(value) && value.length <= MAX_METADATA_ARRAY && value.every((entry) => typeof entry === 'string' && entry.length <= 256)
);

const metadataKeysFor: Readonly<Record<BookUpdateRecoveryRecordKind, readonly string[]>> = Object.freeze({
  'update-action': ['actionState', 'actionId', 'snapshotId', 'snapshotFingerprint', 'requestFingerprint', 'selectedContextKeys', 'selectionCount', 'checkpointCount', 'notificationCount'],
  'review-checkpoint': ['checkpointId', 'actionId', 'contextKey', 'contextId', 'studentId', 'oldBindingId', 'oldBindingRevision', 'activityCount'],
  notification: ['notificationId', 'updateActionId', 'recipientId', 'contextId', 'case', 'checkpointAvailable', 'dispatch'],
  replacement: ['sagaId', 'contextKey', 'contextId', 'sourceVersionIds', 'state', 'choice', 'oldSourceAvailable', 'mutation'],
  revocation: ['sagaId', 'contextKey', 'contextId', 'bindingIds', 'status', 'mutation'],
  delete: ['deletionId', 'sagaId', 'state', 'deleteIdentityKind'],
  audit: ['auditId', 'actionId', 'sequence', 'eventKind', 'provenance', 'fanout'],
});

const validateMetadata = (
  kind: BookUpdateRecoveryRecordKind,
  metadata: Readonly<Record<string, unknown>>,
): boolean => {
  const allowed = metadataKeysFor[kind];
  const keys = Object.keys(metadata);
  return keys.length > 0
    && keys.length <= MAX_METADATA_KEYS
    && keys.every((key) => allowed.includes(key) && !forbiddenMetadataKey.test(key) && validMetadataValue(metadata[key]));
};

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => (
  Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000')
);

export const bookUpdateRecoveryProjectionKey = (
  recoveryOperationId: string,
  recordKind: BookUpdateRecoveryRecordKind,
  recordId: string,
): string => `${recoveryOperationId}~${recordKind}~${recordId}`;

export const createBookUpdateRecoveryHold = (input: {
  readonly recoveryOperationId: string;
  readonly scopeKey: string;
  readonly recipientId?: string | null;
}): BookUpdateRecoveryHold => {
  if (!SAFE_ID.test(input.recoveryOperationId) || !SAFE_ID.test(input.scopeKey)
    || (input.recipientId !== undefined && input.recipientId !== null && !SAFE_ID.test(input.recipientId))) {
    throw new Error('book_update_recovery_hold_invalid');
  }
  return Object.freeze({
    kind: 'book-update-recovery-hold',
    schemaVersion: BOOK_UPDATE_RECOVERY_SCHEMA_VERSION,
    recoveryOperationId: input.recoveryOperationId,
    scopeKey: input.scopeKey,
    recipientId: input.recipientId ?? null,
    deliveryState: 'unavailable',
    readDenied: true,
    activation: 'held-for-reconciliation',
  });
};

export const createBookUpdateRecoveryProjection = (input: {
  readonly recoveryOperationId: string;
  readonly recordKind: BookUpdateRecoveryRecordKind;
  readonly recordId: string;
  readonly idempotencyKey?: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly scopeKey: string;
  readonly recipientId?: string | null;
  readonly contextId?: string | null;
  readonly metadata: Readonly<Record<string, BookUpdateRecoveryMetadataValue>>;
  readonly canonicalFingerprint: string;
}): BookUpdateRecoveryProjection => {
  const recipientId = input.recipientId ?? null;
  const contextId = input.contextId ?? null;
  const idempotencyKey = input.idempotencyKey ?? input.recordId;
  if (!SAFE_ID.test(input.recoveryOperationId) || !SAFE_ID.test(input.recordId)
    || !SAFE_ID.test(idempotencyKey) || !SAFE_ID.test(input.ownerId) || !SAFE_ID.test(input.bookId)
    || !SAFE_ID.test(input.scopeKey) || (recipientId !== null && !SAFE_ID.test(recipientId))
    || (contextId !== null && !SAFE_ID.test(contextId)) || !SAFE_HASH.test(input.canonicalFingerprint)
    || !metadataKeysFor[input.recordKind] || !validateMetadata(input.recordKind, input.metadata)) {
    throw new Error('book_update_recovery_projection_invalid');
  }
  const projection = {
    kind: 'book-update-recovery-projection' as const,
    schemaVersion: BOOK_UPDATE_RECOVERY_SCHEMA_VERSION,
    projectionKey: bookUpdateRecoveryProjectionKey(input.recoveryOperationId, input.recordKind, input.recordId),
    recoveryOperationId: input.recoveryOperationId,
    recordKind: input.recordKind,
    recordId: input.recordId,
    idempotencyKey,
    ownerId: input.ownerId,
    bookId: input.bookId,
    scopeKey: input.scopeKey,
    recipientId,
    contextId,
    state: 'held' as const,
    deliveryState: 'unavailable' as const,
    readDenied: true as const,
    activation: 'held-for-reconciliation' as const,
    metadata: clone(input.metadata),
    canonicalFingerprint: input.canonicalFingerprint,
  } satisfies BookUpdateRecoveryProjection;
  return Object.freeze(projection);
};

export const isBookUpdateRecoveryHold = (value: unknown): value is BookUpdateRecoveryHold => (
  isRecord(value)
  && exactKeys(value, ['kind', 'schemaVersion', 'recoveryOperationId', 'scopeKey', 'recipientId', 'deliveryState', 'readDenied', 'activation'])
  && value.kind === 'book-update-recovery-hold'
  && value.schemaVersion === BOOK_UPDATE_RECOVERY_SCHEMA_VERSION
  && typeof value.recoveryOperationId === 'string' && SAFE_ID.test(value.recoveryOperationId)
  && typeof value.scopeKey === 'string' && SAFE_ID.test(value.scopeKey)
  && (value.recipientId === null || typeof value.recipientId === 'string' && SAFE_ID.test(value.recipientId))
  && value.deliveryState === 'unavailable'
  && value.readDenied === true
  && value.activation === 'held-for-reconciliation'
);

export const isBookUpdateRecoveryProjection = (value: unknown): value is BookUpdateRecoveryProjection => {
  if (!isRecord(value) || !exactKeys(value, [
    'kind', 'schemaVersion', 'projectionKey', 'recoveryOperationId', 'recordKind', 'recordId',
    'idempotencyKey', 'ownerId', 'bookId', 'scopeKey', 'recipientId', 'contextId', 'state',
    'deliveryState', 'readDenied', 'activation', 'metadata', 'canonicalFingerprint',
  ])) return false;
  if (value.kind !== 'book-update-recovery-projection'
    || value.schemaVersion !== BOOK_UPDATE_RECOVERY_SCHEMA_VERSION
    || typeof value.projectionKey !== 'string'
    || typeof value.recoveryOperationId !== 'string' || !SAFE_ID.test(value.recoveryOperationId)
    || typeof value.recordKind !== 'string' || !metadataKeysFor[value.recordKind as BookUpdateRecoveryRecordKind]
    || typeof value.recordId !== 'string' || !SAFE_ID.test(value.recordId)
    || typeof value.idempotencyKey !== 'string' || !SAFE_ID.test(value.idempotencyKey)
    || typeof value.ownerId !== 'string' || !SAFE_ID.test(value.ownerId)
    || typeof value.bookId !== 'string' || !SAFE_ID.test(value.bookId)
    || typeof value.scopeKey !== 'string' || !SAFE_ID.test(value.scopeKey)
    || (value.recipientId !== null && (typeof value.recipientId !== 'string' || !SAFE_ID.test(value.recipientId)))
    || (value.contextId !== null && (typeof value.contextId !== 'string' || !SAFE_ID.test(value.contextId)))
    || value.state !== 'held' || value.deliveryState !== 'unavailable' || value.readDenied !== true
    || value.activation !== 'held-for-reconciliation'
    || !isRecord(value.metadata) || !validateMetadata(value.recordKind as BookUpdateRecoveryRecordKind, value.metadata)
    || typeof value.canonicalFingerprint !== 'string' || !SAFE_HASH.test(value.canonicalFingerprint)) return false;
  return value.projectionKey === bookUpdateRecoveryProjectionKey(value.recoveryOperationId, value.recordKind as BookUpdateRecoveryRecordKind, value.recordId);
};

const isRecoveryContext = (value: unknown): value is BookUpdateRecoveryContext => (
  isRecord(value)
  && typeof value.recoveryOperationId === 'string'
  && SAFE_ID.test(value.recoveryOperationId)
  && ['restoring_canonical_authority', 'rebuilding', 'reconciling'].includes(String(value.phase))
);

export const rebuildBookUpdateRecoveryProjections = (input: {
  readonly recoveryContext: BookUpdateRecoveryContext;
  readonly projections: readonly BookUpdateRecoveryProjection[];
  readonly completedProjectionKeys?: ReadonlySet<string>;
}): BookUpdateRecoveryRebuildResult => {
  const diagnostics: BookUpdateRecoveryDiagnostic[] = [];
  const seen = new Set<string>();
  const projections: BookUpdateRecoveryProjection[] = [];
  let invalid = 0;
  let skippedIdempotent = 0;
  if (!isRecoveryContext(input.recoveryContext)) {
    return { projections: [], diagnostics: [{ code: 'invalid-record', path: '$.recoveryContext', message: 'Recovery context is invalid.' }], report: { rebuilt: 0, skippedIdempotent: 0, invalid: 1, externallyMissing: 0, retryable: 0, terminal: 0 } };
  }
  for (const projection of input.projections) {
    if (!isBookUpdateRecoveryProjection(projection)
      || projection.recoveryOperationId !== input.recoveryContext.recoveryOperationId) {
      invalid += 1;
      diagnostics.push({ code: 'invalid-record', path: '$.projections', message: 'Recovery projection identity or privacy contract is invalid.' });
      continue;
    }
    if (seen.has(projection.projectionKey)) {
      invalid += 1;
      diagnostics.push({ code: 'duplicate-record', path: projection.projectionKey, message: 'One recovery projection key may be staged only once.' });
      continue;
    }
    seen.add(projection.projectionKey);
    if (input.completedProjectionKeys?.has(projection.projectionKey)) {
      skippedIdempotent += 1;
      continue;
    }
    projections.push(clone(projection));
  }
  return Object.freeze({
    projections: Object.freeze(projections),
    diagnostics: Object.freeze(diagnostics),
    report: Object.freeze({ rebuilt: projections.length, skippedIdempotent, invalid, externallyMissing: 0, retryable: 0, terminal: 0 }),
  });
};

export const createBookUpdateRecoveryAdapter = (input: {
  readonly context: BookUpdateRecoveryContext;
  readonly store: BookUpdateRecoveryProjectionStore;
}): BookUpdateRecoveryAdapter => Object.freeze({
  async rebuild(rebuildInput: { readonly projections: readonly BookUpdateRecoveryProjection[] }) {
    if (input.context.phase !== 'rebuilding') throw new Error('book_update_recovery_phase_denied');
    const prepared = rebuildBookUpdateRecoveryProjections({ recoveryContext: input.context, projections: rebuildInput.projections });
    let rebuilt = 0;
    let skippedIdempotent = prepared.report.skippedIdempotent;
    for (const projection of prepared.projections) {
      const result = await input.store.putIfAbsent({ projectionKey: projection.projectionKey, projection: clone(projection) });
      if (result === 'created') rebuilt += 1;
      else if (result === 'replayed') skippedIdempotent += 1;
      else throw new Error('book_update_recovery_projection_conflict');
    }
    return Object.freeze({ ...prepared, report: Object.freeze({ ...prepared.report, rebuilt, skippedIdempotent }) });
  },
});

export class InMemoryBookUpdateRecoveryProjectionStore implements BookUpdateRecoveryProjectionStore {
  private readonly projections = new Map<string, BookUpdateRecoveryProjection>();
  private readonly holds = new Map<string, BookUpdateRecoveryHold>();

  async putIfAbsent(input: { readonly projectionKey: string; readonly projection: BookUpdateRecoveryProjection }): Promise<'created' | 'replayed' | 'conflict'> {
    if (!isBookUpdateRecoveryProjection(input.projection) || input.projection.projectionKey !== input.projectionKey) return 'conflict';
    const hold = createBookUpdateRecoveryHold({ recoveryOperationId: input.projection.recoveryOperationId, scopeKey: input.projection.scopeKey, recipientId: input.projection.recipientId });
    const existingHold = this.holds.get(input.projection.scopeKey);
    if (existingHold && stable(existingHold) !== stable(hold)) return 'conflict';
    const existing = this.projections.get(input.projectionKey);
    if (existing && stable(existing) !== stable(input.projection)) return 'conflict';
    if (existing) return 'replayed';
    this.holds.set(input.projection.scopeKey, clone(hold));
    this.projections.set(input.projectionKey, clone(input.projection));
    return 'created';
  }

  async readHold(input: { readonly scopeKey: string }): Promise<BookUpdateRecoveryHold | null> {
    return clone(this.holds.get(input.scopeKey) ?? null);
  }

  read(projectionKey: string): BookUpdateRecoveryProjection | null {
    return clone(this.projections.get(projectionKey) ?? null);
  }
}

export const isBookUpdateRecoveryContext = isRecoveryContext;
