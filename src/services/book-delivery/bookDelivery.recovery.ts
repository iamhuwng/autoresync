import {
  validateBookDeliveryBinding,
} from './bookDelivery.schema';
import type {
  BookDeliveryCurrentPointer,
  BookDeliveryRecord,
} from './bookDelivery.entitlement';
import type { BookDeliveryBinding } from './bookDelivery.types';
import type {
  BookSourceRecoveryAuthority,
} from '../book-source-delivery/sourceRecovery.adapter';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type BookDeliveryRecoveryPhase =
  | 'restoring_canonical_authority'
  | 'rebuilding'
  | 'reconciling';

/** Recovery Delivery context never grants read, entitlement, or provider authority. */
export interface BookDeliveryRecoveryContext {
  readonly recoveryOperationId: string;
  readonly phase: BookDeliveryRecoveryPhase;
}

export type BookDeliveryRecoveryErrorCode =
  | 'invalid-record'
  | 'invalid-current-pointer'
  | 'unauthorized-owner'
  | 'unpublished'
  | 'source-unavailable'
  | 'source-binding-mismatch'
  | 'current-binding-mismatch';

export interface BookDeliveryRecoveryDiagnostic {
  readonly code: BookDeliveryRecoveryErrorCode;
  readonly path: string;
  readonly message: string;
}

export interface BookDeliveryRecoverySourceStatus {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly available: boolean;
  readonly reason: 'available' | 'missing' | 'deleted' | 'mismatched' | 'unauthorized';
}

/** Internal staging projection. It intentionally has no URL, viewer link, or entitlement. */
export interface BookDeliveryRecoveryProjection {
  readonly kind: 'book-delivery-recovery-projection';
  readonly schemaVersion: 1;
  readonly projectionKey: string;
  readonly recoveryOperationId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly recordRevision: number;
  readonly recipientId: string;
  readonly contextId: string;
  readonly ownerId: string;
  readonly publicationStatus: 'published' | 'unpublished';
  readonly deliveryState: 'unavailable';
  readonly readDenied: true;
  readonly activation: 'held-for-reconciliation';
  readonly sourceStatuses: readonly BookDeliveryRecoverySourceStatus[];
}

export interface BookDeliveryRecoveryValidationResult {
  readonly valid: boolean;
  readonly sourceAvailable: boolean;
  readonly diagnostics: readonly BookDeliveryRecoveryDiagnostic[];
  readonly projection: BookDeliveryRecoveryProjection | null;
}

export interface BookDeliveryRecoveryRebuildResult {
  readonly projections: readonly BookDeliveryRecoveryProjection[];
  readonly diagnostics: readonly BookDeliveryRecoveryDiagnostic[];
  readonly report: {
    readonly rebuilt: number;
    readonly skippedIdempotent: number;
    readonly invalid: number;
    readonly externallyMissing: number;
    readonly retryable: number;
    readonly terminal: number;
  };
}

export interface BookDeliveryRecoveryProjectionStore {
  putIfAbsent(input: {
    readonly projectionKey: string;
    readonly projection: BookDeliveryRecoveryProjection;
  }): Promise<'created' | 'replayed' | 'conflict'>;
}

export interface BookDeliveryRecoveryAdapter {
  rebuild(input: {
    readonly records: Readonly<Record<string, unknown>>;
    readonly current: Readonly<Record<string, unknown>>;
    readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
    readonly expectedOwnerId?: string;
  }): Promise<BookDeliveryRecoveryRebuildResult>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const clone = <T>(value: T): T => structuredClone(value);

const add = (
  diagnostics: BookDeliveryRecoveryDiagnostic[],
  diagnostic: BookDeliveryRecoveryDiagnostic,
): void => {
  if (!diagnostics.some((entry) => entry.code === diagnostic.code && entry.path === diagnostic.path)) {
    diagnostics.push(diagnostic);
  }
};

const projectionKey = (context: BookDeliveryRecoveryContext, binding: BookDeliveryBinding): string => (
  `${context.recoveryOperationId}:${binding.bindingId}:${binding.revision}`
);

const validDate = (value: unknown): value is string => (
  typeof value === 'string' && ISO_DATE.test(value) && Number.isFinite(Date.parse(value))
);

const samePointer = (
  pointer: BookDeliveryCurrentPointer,
  record: BookDeliveryRecord,
): boolean => (
  pointer.bindingId === record.binding.bindingId
  && pointer.bindingRevision === record.binding.revision
  && pointer.recipientId === record.binding.recipient.recipientId
  && pointer.contextId === record.binding.context.contextId
  && pointer.contextKind === record.binding.context.kind
  && pointer.status === 'active'
);

const validateRecordShape = (
  value: unknown,
  path: string,
  diagnostics: BookDeliveryRecoveryDiagnostic[],
): value is BookDeliveryRecord => {
  if (!isRecord(value)) {
    add(diagnostics, { code: 'invalid-record', path, message: 'Delivery record must be a plain object.' });
    return false;
  }
  const expected = ['binding', 'recordRevision', 'status', 'createdAt', 'updatedAt'];
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !expected.includes(key))) {
    add(diagnostics, { code: 'invalid-record', path, message: 'Delivery record contains an unsupported field.' });
  }
  if (!Number.isSafeInteger(value.recordRevision) || Number(value.recordRevision) < 0) {
    add(diagnostics, { code: 'invalid-record', path: `${path}.recordRevision`, message: 'Delivery record revision is invalid.' });
  }
  if (!['draft', 'active', 'revoked'].includes(String(value.status))) {
    add(diagnostics, { code: 'invalid-record', path: `${path}.status`, message: 'Delivery record status is invalid.' });
  }
  if (!validDate(value.createdAt) || !validDate(value.updatedAt)) {
    add(diagnostics, { code: 'invalid-record', path, message: 'Delivery record timestamps are invalid.' });
  }
  const bindingValidation = validateBookDeliveryBinding(value.binding);
  if (!bindingValidation.valid) {
    add(diagnostics, {
      code: 'invalid-record',
      path: `${path}.binding`,
      message: bindingValidation.errors[0]?.message ?? 'Delivery binding is invalid.',
    });
  }
  if (bindingValidation.valid && value.status !== (value.binding as BookDeliveryBinding).status) {
    add(diagnostics, { code: 'invalid-record', path: `${path}.status`, message: 'Record and binding status must match.' });
  }
  return diagnostics.length === 0;
};

const validatePointerShape = (
  value: unknown,
  path: string,
  diagnostics: BookDeliveryRecoveryDiagnostic[],
): value is BookDeliveryCurrentPointer => {
  if (!isRecord(value)
    || !SAFE_ID.test(String(value.bindingId))
    || !Number.isSafeInteger(value.bindingRevision)
    || !SAFE_ID.test(String(value.recipientId))
    || !SAFE_ID.test(String(value.contextId))
    || typeof value.contextKind !== 'string'
    || value.status !== 'active'
    || !validDate(value.updatedAt)) {
    add(diagnostics, { code: 'invalid-current-pointer', path, message: 'Current Delivery pointer is invalid.' });
    return false;
  }
  return true;
};

export const validateBookDeliveryRecoveryRecord = (input: {
  readonly record: unknown;
  readonly current?: unknown;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly recoveryContext: BookDeliveryRecoveryContext;
  readonly expectedOwnerId?: string;
}): BookDeliveryRecoveryValidationResult => {
  const diagnostics: BookDeliveryRecoveryDiagnostic[] = [];
  if (!isRecord(input.record)) {
    return { valid: false, sourceAvailable: false, diagnostics: [{ code: 'invalid-record', path: '$.record', message: 'Delivery record is required.' }], projection: null };
  }
  const record = input.record as unknown as BookDeliveryRecord;
  const validRecord = validateRecordShape(input.record, '$.record', diagnostics);
  if (!validRecord) return { valid: false, sourceAvailable: false, diagnostics: Object.freeze(diagnostics), projection: null };
  const binding = record.binding;
  if (!SAFE_ID.test(binding.bindingId)
    || !SAFE_ID.test(binding.recipient.recipientId)
    || !SAFE_ID.test(binding.context.contextId)
    || !SAFE_ID.test(binding.issuer.ownerId)) {
    add(diagnostics, { code: 'invalid-record', path: '$.record.binding', message: 'Delivery binding identity is unsafe.' });
  }
  if (input.expectedOwnerId !== undefined && binding.issuer.ownerId !== input.expectedOwnerId) {
    add(diagnostics, { code: 'unauthorized-owner', path: '$.record.binding.issuer.ownerId', message: 'Delivery owner is outside the recovery owner scope.' });
  }
  if (record.status === 'active') {
    if (!validatePointerShape(input.current, '$.current', diagnostics)
      || !samePointer(input.current as BookDeliveryCurrentPointer, record)) {
      add(diagnostics, { code: 'current-binding-mismatch', path: '$.current', message: 'Active Delivery record is not bound to its current pointer.' });
    }
  }

  const sourceStatuses: BookDeliveryRecoverySourceStatus[] = [];
  let sourceAvailable = true;
  for (const source of binding.sourceSet.sources) {
    const authority = input.sourceAuthorities.get(source.sourceVersionId);
    let available = authority?.available === true;
    let reason: BookDeliveryRecoverySourceStatus['reason'] = available ? 'available' : 'missing';
    if (!authority) {
      reason = 'missing';
      add(diagnostics, { code: 'source-unavailable', path: `$.record.binding.sourceSet/${source.sourceVersionId}`, message: 'Delivery references a Source Version without canonical authority.' });
    } else if (authority.bookId !== binding.book.bookId || authority.sourceKey !== source.sourceKey) {
      available = false;
      reason = 'mismatched';
      add(diagnostics, { code: 'source-binding-mismatch', path: `$.record.binding.sourceSet/${source.sourceKey}`, message: 'Delivery Source binding does not match canonical Source authority.' });
    } else if (authority.ownerId !== binding.issuer.ownerId) {
      available = false;
      reason = 'unauthorized';
      add(diagnostics, { code: 'unauthorized-owner', path: `$.record.binding.sourceSet/${source.sourceKey}`, message: 'Delivery Source owner does not match the binding owner.' });
    } else if (!authority.available) {
      reason = 'deleted';
      add(diagnostics, { code: 'source-unavailable', path: `$.record.binding.sourceSet/${source.sourceKey}`, message: 'Pinned Source Version is externally unavailable or approved for deletion.' });
    }
    if (!available) sourceAvailable = false;
    sourceStatuses.push({ sourceKey: source.sourceKey, sourceVersionId: source.sourceVersionId, available, reason });
  }
  if (binding.book.publicationStatus !== 'published') {
    sourceAvailable = false;
    add(diagnostics, { code: 'unpublished', path: '$.record.binding.book.publicationStatus', message: 'Unpublished Delivery must remain unavailable during recovery.' });
  }

  const structurallyValid = !diagnostics.some((entry) => (
    entry.code === 'invalid-record'
    || entry.code === 'invalid-current-pointer'
    || entry.code === 'current-binding-mismatch'
    || entry.code === 'unauthorized-owner'
    || entry.code === 'source-binding-mismatch'
  ));
  const projection = structurallyValid
    ? Object.freeze({
      kind: 'book-delivery-recovery-projection' as const,
      schemaVersion: 1 as const,
      projectionKey: projectionKey(input.recoveryContext, binding),
      recoveryOperationId: input.recoveryContext.recoveryOperationId,
      bindingId: binding.bindingId,
      bindingRevision: binding.revision,
      recordRevision: record.recordRevision,
      recipientId: binding.recipient.recipientId,
      contextId: binding.context.contextId,
      ownerId: binding.issuer.ownerId,
      publicationStatus: binding.book.publicationStatus === 'published' ? 'published' as const : 'unpublished' as const,
      deliveryState: 'unavailable' as const,
      readDenied: true as const,
      activation: 'held-for-reconciliation' as const,
      sourceStatuses: Object.freeze(sourceStatuses),
    })
    : null;
  return {
    valid: structurallyValid,
    sourceAvailable,
    diagnostics: Object.freeze(diagnostics),
    projection,
  };
};

export const rebuildBookDeliveryRecoveryProjections = (input: {
  readonly records: Readonly<Record<string, unknown>>;
  readonly current: Readonly<Record<string, unknown>>;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly recoveryContext: BookDeliveryRecoveryContext;
  readonly expectedOwnerId?: string;
  readonly completedProjectionKeys?: ReadonlySet<string>;
}): BookDeliveryRecoveryRebuildResult => {
  const projections: BookDeliveryRecoveryProjection[] = [];
  const diagnostics: BookDeliveryRecoveryDiagnostic[] = [];
  let skippedIdempotent = 0;
  let invalid = 0;
  let externallyMissing = 0;
  for (const [bindingId, candidate] of Object.entries(input.records).sort(([left], [right]) => left.localeCompare(right))) {
    const record = isRecord(candidate) ? candidate : null;
    const binding = record && isRecord(record.binding) ? record.binding : null;
    const recipient = binding && isRecord(binding.recipient) ? binding.recipient : null;
    const context = binding && isRecord(binding.context) ? binding.context : null;
    const current = recipient && context
      ? input.current[`${String(recipient.recipientId)}/${String(context.contextId)}`]
      : undefined;
    const result = validateBookDeliveryRecoveryRecord({
      record: candidate,
      current,
      sourceAuthorities: input.sourceAuthorities,
      recoveryContext: input.recoveryContext,
      expectedOwnerId: input.expectedOwnerId,
    });
    diagnostics.push(...result.diagnostics.map((entry) => ({ ...entry, path: `book_delivery/records/${bindingId}/${entry.path}` })));
    if (!result.projection) {
      invalid += 1;
      continue;
    }
    if (result.projection.bindingId !== bindingId) {
      invalid += 1;
      diagnostics.push({ code: 'invalid-record', path: `book_delivery/records/${bindingId}/bindingId`, message: 'Delivery record key must equal bindingId.' });
      continue;
    }
    if (!result.sourceAvailable) externallyMissing += 1;
    if (input.completedProjectionKeys?.has(result.projection.projectionKey)) {
      skippedIdempotent += 1;
      continue;
    }
    projections.push(result.projection);
  }
  return Object.freeze({
    projections: Object.freeze(projections),
    diagnostics: Object.freeze(diagnostics),
    report: Object.freeze({
      rebuilt: projections.length,
      skippedIdempotent,
      invalid,
      externallyMissing,
      retryable: 0,
      terminal: 0,
    }),
  });
};

export const createBookDeliveryRecoveryAdapter = (input: {
  readonly context: BookDeliveryRecoveryContext;
  readonly store: BookDeliveryRecoveryProjectionStore;
}): BookDeliveryRecoveryAdapter => Object.freeze({
  async rebuild(rebuildInput: Parameters<BookDeliveryRecoveryAdapter['rebuild']>[0]) {
    if (input.context.phase !== 'rebuilding') {
      throw new Error('book_delivery_recovery_phase_denied');
    }
    const prepared = rebuildBookDeliveryRecoveryProjections({
      ...rebuildInput,
      recoveryContext: input.context,
    });
    let rebuilt = 0;
    let skippedIdempotent = prepared.report.skippedIdempotent;
    for (const projection of prepared.projections) {
      const result = await input.store.putIfAbsent({ projectionKey: projection.projectionKey, projection: clone(projection) });
      if (result === 'created') rebuilt += 1;
      else if (result === 'replayed') skippedIdempotent += 1;
      else throw new Error('book_delivery_recovery_projection_conflict');
    }
    return {
      ...prepared,
      report: {
        ...prepared.report,
        rebuilt,
        skippedIdempotent,
      },
    };
  },
});

export class InMemoryBookDeliveryRecoveryProjectionStore implements BookDeliveryRecoveryProjectionStore {
  private readonly projections = new Map<string, BookDeliveryRecoveryProjection>();

  async putIfAbsent(input: { readonly projectionKey: string; readonly projection: BookDeliveryRecoveryProjection }): Promise<'created' | 'replayed' | 'conflict'> {
    const existing = this.projections.get(input.projectionKey);
    if (!existing) {
      this.projections.set(input.projectionKey, clone(input.projection));
      return 'created';
    }
    return JSON.stringify(existing) === JSON.stringify(input.projection) ? 'replayed' : 'conflict';
  }

  read(projectionKey: string): BookDeliveryRecoveryProjection | null {
    const value = this.projections.get(projectionKey);
    return value ? clone(value) : null;
  }
}

/** Normal Delivery producers must fail closed while a recovery context exists. */
export const isBookDeliveryRecoveryContext = (
  value: unknown,
): value is BookDeliveryRecoveryContext => (
  isRecord(value)
  && typeof value.recoveryOperationId === 'string'
  && SAFE_ID.test(value.recoveryOperationId)
  && (value.phase === 'restoring_canonical_authority'
    || value.phase === 'rebuilding'
    || value.phase === 'reconciling')
);
