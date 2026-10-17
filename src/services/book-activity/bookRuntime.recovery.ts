import type { ActivityFeedbackVisibility } from '../../types/bookActivity.types';

export const BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION = 1 as const;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@~-]{0,511}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const FORBIDDEN_KEYS = /^(?:answer|answerKey|answers|prompt|response|teacherNotes|pdfBytes|pdfBody|provider|providerAuthority|credentials|privateObjectKey|viewerLink|url|token|secret)$/iu;

export type BookRuntimeRecoveryRecordKind =
  | 'autosave'
  | 'submission'
  | 'attempt'
  | 'result'
  | 'grading-history'
  | 'feedback-release'
  | 'completion'
  | 'completion-projection'
  | 'operation';

export type BookRuntimeRecoveryContextKind = 'solo' | 'homework' | 'course' | 'class';

export interface BookRuntimeRecoverySourceMetadata {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly pages: readonly number[];
}

export interface BookRuntimeRecoveryRecordMetadata {
  readonly revision?: number;
  readonly updatedAt?: string;
  readonly attemptId?: string;
  readonly resultId?: string;
  readonly completionId?: string;
  readonly attemptNumber?: number;
  readonly status?: 'pending_review' | 'submitted' | 'completed' | 'denied' | 'replayed';
  readonly feedbackRelease?: 'pending' | 'released' | 'withheld' | 'not-applicable';
  readonly evaluationRevision?: number;
  readonly historyCount?: number;
  readonly submittedCount?: number;
  readonly requiredCount?: number;
  readonly completionStatus?: 'not_started' | 'in_progress' | 'completed';
  readonly operationId?: string;
  readonly fingerprint?: string;
}

export interface BookRuntimeRecoveryProjection {
  readonly kind: 'book-runtime-recovery-projection';
  readonly schemaVersion: typeof BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION;
  readonly projectionKey: string;
  readonly recoveryOperationId: string;
  readonly recordKind: BookRuntimeRecoveryRecordKind;
  readonly recordId: string;
  /** The canonical terminal/idempotency key. It is never regenerated on replay. */
  readonly idempotencyKey: string;
  readonly recipientId: string;
  readonly contextId: string;
  readonly contextKind: BookRuntimeRecoveryContextKind;
  readonly ownerId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly activityVersionId: string;
  readonly interactionId: string;
  readonly feedbackPolicy: ActivityFeedbackVisibility;
  readonly sourceProvenance: readonly BookRuntimeRecoverySourceMetadata[];
  readonly metadata: BookRuntimeRecoveryRecordMetadata;
  readonly canonicalFingerprint: string;
  readonly deliveryState: 'unavailable';
  readonly readDenied: true;
  readonly activation: 'held-for-reconciliation';
}

export interface BookRuntimeRecoveryHold {
  readonly kind: 'book-runtime-recovery-hold';
  readonly schemaVersion: typeof BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION;
  readonly recoveryOperationId: string;
  readonly recipientId: string;
  readonly contextId: string;
  readonly deliveryState: 'unavailable';
  readonly readDenied: true;
  readonly activation: 'held-for-reconciliation';
}

export interface BookRuntimeRecoveryContext {
  readonly recoveryOperationId: string;
  readonly phase: 'rebuilding' | 'reconciling';
}

export type BookRuntimeRecoveryDiagnosticCode =
  | 'invalid-record'
  | 'invalid-scope'
  | 'invalid-operation'
  | 'context-mismatch'
  | 'binding-mismatch'
  | 'activity-mismatch'
  | 'source-unavailable'
  | 'feedback-policy-invalid'
  | 'terminal-mismatch'
  | 'duplicate-conflict'
  | 'sensitive-field';

export interface BookRuntimeRecoveryDiagnostic {
  readonly code: BookRuntimeRecoveryDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export interface BookRuntimeRecoveryReport {
  readonly restored: number;
  readonly rebuilt: number;
  readonly skippedIdempotent: number;
  readonly invalid: number;
  readonly unavailable: number;
  readonly retryable: number;
  readonly terminal: number;
}

export interface BookRuntimeRecoveryProjectionStore {
  putIfAbsent(input: {
    readonly projectionKey: string;
    readonly projection: BookRuntimeRecoveryProjection;
  }): Promise<'created' | 'replayed' | 'conflict'>;
  readHold(input: {
    readonly recipientId: string;
    readonly contextId: string;
  }): Promise<BookRuntimeRecoveryHold | null>;
}

export interface BookRuntimeRecoveryAdapter {
  rebuild(input: {
    readonly projections: readonly BookRuntimeRecoveryProjection[];
  }): Promise<{
    readonly projections: readonly BookRuntimeRecoveryProjection[];
    readonly report: BookRuntimeRecoveryReport;
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const clone = <T>(value: T): T => structuredClone(value);

const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => freeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const safeDate = (value: unknown): value is string => (
  typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value))
);

const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const allowed = new Set([...required, ...optional]);
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.has(key))
    && required.every((key) => Object.hasOwn(value, key));
};

const validSource = (value: unknown): value is BookRuntimeRecoverySourceMetadata => (
  isRecord(value)
  && exactKeys(value, ['pages', 'sourceKey', 'sourceVersionId'])
  && SAFE_ID.test(String(value.sourceKey))
  && SAFE_ID.test(String(value.sourceVersionId))
  && Array.isArray(value.pages)
  && value.pages.length > 0
  && value.pages.every((page) => Number.isSafeInteger(page) && (page as number) > 0)
  && new Set(value.pages).size === value.pages.length
);

const validMetadata = (value: unknown): value is BookRuntimeRecoveryRecordMetadata => {
  if (!isRecord(value)) return false;
  const allowed = [
    'revision', 'updatedAt', 'attemptId', 'resultId', 'completionId', 'attemptNumber',
    'status', 'feedbackRelease', 'evaluationRevision', 'historyCount', 'submittedCount',
    'requiredCount', 'completionStatus', 'operationId', 'fingerprint',
  ];
  if (!exactKeys(value, [], allowed) || Reflect.ownKeys(value).some((key) => typeof key === 'string' && FORBIDDEN_KEYS.test(key))) return false;
  for (const key of ['revision', 'attemptNumber', 'evaluationRevision', 'historyCount', 'submittedCount', 'requiredCount']) {
    if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0)) return false;
  }
  for (const key of ['updatedAt']) {
    if (value[key] !== undefined && !safeDate(value[key])) return false;
  }
  for (const key of ['attemptId', 'resultId', 'completionId', 'operationId']) {
    if (value[key] !== undefined && !SAFE_ID.test(String(value[key]))) return false;
  }
  if (value.fingerprint !== undefined && (typeof value.fingerprint !== 'string' || value.fingerprint.length > 512)) return false;
  return (value.status === undefined || ['pending_review', 'submitted', 'completed', 'denied', 'replayed'].includes(String(value.status)))
    && (value.feedbackRelease === undefined || ['pending', 'released', 'withheld', 'not-applicable'].includes(String(value.feedbackRelease)))
    && (value.completionStatus === undefined || ['not_started', 'in_progress', 'completed'].includes(String(value.completionStatus)));
};

export const isBookRuntimeRecoveryHold = (value: unknown): value is BookRuntimeRecoveryHold => (
  isRecord(value)
  && exactKeys(value, [
    'activation', 'contextId', 'deliveryState', 'kind', 'readDenied',
    'recoveryOperationId', 'recipientId', 'schemaVersion',
  ])
  && value.kind === 'book-runtime-recovery-hold'
  && value.schemaVersion === BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION
  && SAFE_ID.test(String(value.recoveryOperationId))
  && SAFE_ID.test(String(value.recipientId))
  && SAFE_ID.test(String(value.contextId))
  && value.deliveryState === 'unavailable'
  && value.readDenied === true
  && value.activation === 'held-for-reconciliation'
);

export const isBookRuntimeRecoveryProjection = (value: unknown): value is BookRuntimeRecoveryProjection => {
  if (!isRecord(value) || !exactKeys(value, [
    'activation', 'activityId', 'activityVersion', 'activityVersionId', 'bindingId',
    'bindingRevision', 'canonicalFingerprint', 'contextId', 'contextKind', 'deliveryState',
    'feedbackPolicy', 'idempotencyKey', 'interactionId', 'kind', 'metadata', 'ownerId',
    'placementId', 'projectionKey', 'readDenied', 'recordId', 'recordKind',
    'recipientId', 'recoveryOperationId', 'schemaVersion', 'sourceProvenance',
  ])) return false;
  if (Reflect.ownKeys(value).some((key) => typeof key === 'string' && FORBIDDEN_KEYS.test(key))) return false;
  if (value.kind !== 'book-runtime-recovery-projection' || value.schemaVersion !== BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION
    || !SAFE_KEY.test(String(value.projectionKey)) || !SAFE_ID.test(String(value.recoveryOperationId))
    || !SAFE_ID.test(String(value.recordId)) || !SAFE_ID.test(String(value.idempotencyKey))
    || !SAFE_ID.test(String(value.recipientId)) || !SAFE_ID.test(String(value.contextId))
    || !SAFE_ID.test(String(value.ownerId)) || !SAFE_ID.test(String(value.bindingId))
    || !SAFE_ID.test(String(value.placementId)) || !SAFE_ID.test(String(value.activityId))
    || !SAFE_ID.test(String(value.activityVersionId)) || !SAFE_ID.test(String(value.interactionId))
    || !Number.isSafeInteger(value.bindingRevision) || (value.bindingRevision as number) <= 0
    || !Number.isSafeInteger(value.activityVersion) || (value.activityVersion as number) <= 0
    || !['solo', 'homework', 'course', 'class'].includes(String(value.contextKind))
    || !['none', 'after-submit', 'after-review'].includes(String(value.feedbackPolicy))
    || !['autosave', 'submission', 'attempt', 'result', 'grading-history', 'feedback-release', 'completion', 'completion-projection', 'operation'].includes(String(value.recordKind))
    || typeof value.canonicalFingerprint !== 'string' || value.canonicalFingerprint.length > 1024
    || !Array.isArray(value.sourceProvenance) || value.sourceProvenance.some((source) => !validSource(source))
    || !validMetadata(value.metadata)
    || value.deliveryState !== 'unavailable' || value.readDenied !== true
    || value.activation !== 'held-for-reconciliation') return false;
  return true;
};

export const createBookRuntimeRecoveryHold = (input: {
  readonly recoveryOperationId: string;
  readonly recipientId: string;
  readonly contextId: string;
}): BookRuntimeRecoveryHold => {
  if (!SAFE_ID.test(input.recoveryOperationId) || !SAFE_ID.test(input.recipientId) || !SAFE_ID.test(input.contextId)) {
    throw new Error('book_runtime_recovery_hold_identity_invalid');
  }
  return freeze({
    kind: 'book-runtime-recovery-hold' as const,
    schemaVersion: BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION,
    recoveryOperationId: input.recoveryOperationId,
    recipientId: input.recipientId,
    contextId: input.contextId,
    deliveryState: 'unavailable' as const,
    readDenied: true as const,
    activation: 'held-for-reconciliation' as const,
  });
};

export const runtimeRecoveryProjectionKey = (input: {
  readonly recoveryOperationId: string;
  readonly recordKind: BookRuntimeRecoveryRecordKind;
  readonly recordId: string;
}): string => {
  const key = `${input.recoveryOperationId}~${input.recordKind}~${input.recordId}`;
  if (!SAFE_KEY.test(key)) throw new Error('book_runtime_recovery_projection_key_invalid');
  return key;
};

export const createBookRuntimeRecoveryProjection = (input: Omit<BookRuntimeRecoveryProjection, 'kind' | 'schemaVersion' | 'projectionKey' | 'deliveryState' | 'readDenied' | 'activation'> & {
  readonly projectionKey?: string;
}): BookRuntimeRecoveryProjection => {
  const projection = {
    kind: 'book-runtime-recovery-projection' as const,
    schemaVersion: BOOK_RUNTIME_RECOVERY_SCHEMA_VERSION,
    projectionKey: input.projectionKey ?? runtimeRecoveryProjectionKey(input),
    recoveryOperationId: input.recoveryOperationId,
    recordKind: input.recordKind,
    recordId: input.recordId,
    idempotencyKey: input.idempotencyKey,
    recipientId: input.recipientId,
    contextId: input.contextId,
    contextKind: input.contextKind,
    ownerId: input.ownerId,
    bindingId: input.bindingId,
    bindingRevision: input.bindingRevision,
    placementId: input.placementId,
    activityId: input.activityId,
    activityVersion: input.activityVersion,
    activityVersionId: input.activityVersionId,
    interactionId: input.interactionId,
    feedbackPolicy: input.feedbackPolicy,
    sourceProvenance: input.sourceProvenance.map((source) => ({ ...source, pages: [...source.pages] })),
    metadata: { ...input.metadata },
    canonicalFingerprint: input.canonicalFingerprint,
    deliveryState: 'unavailable' as const,
    readDenied: true as const,
    activation: 'held-for-reconciliation' as const,
  } satisfies BookRuntimeRecoveryProjection;
  if (!isBookRuntimeRecoveryProjection(projection)) throw new Error('book_runtime_recovery_projection_invalid');
  return freeze(projection);
};

export const createBookRuntimeRecoveryAdapter = (input: {
  readonly context: BookRuntimeRecoveryContext;
  readonly store: BookRuntimeRecoveryProjectionStore;
}): BookRuntimeRecoveryAdapter => Object.freeze({
  async rebuild(rebuildInput) {
    if (input.context.phase !== 'rebuilding') throw new Error('book_runtime_recovery_phase_denied');
    let restored = 0;
    let skippedIdempotent = 0;
    for (const projection of rebuildInput.projections) {
      if (projection.recoveryOperationId !== input.context.recoveryOperationId) throw new Error('book_runtime_recovery_operation_mismatch');
      const result = await input.store.putIfAbsent({ projectionKey: projection.projectionKey, projection: clone(projection) });
      if (result === 'created') restored += 1;
      else if (result === 'replayed') skippedIdempotent += 1;
      else throw new Error('book_runtime_recovery_projection_conflict');
    }
    return {
      projections: rebuildInput.projections,
      report: {
        restored,
        rebuilt: rebuildInput.projections.length,
        skippedIdempotent,
        invalid: 0,
        unavailable: 0,
        retryable: 0,
        terminal: 0,
      },
    };
  },
});

export class InMemoryBookRuntimeRecoveryProjectionStore implements BookRuntimeRecoveryProjectionStore {
  private readonly holds = new Map<string, BookRuntimeRecoveryHold>();
  private readonly projections = new Map<string, BookRuntimeRecoveryProjection>();

  async readHold(input: { readonly recipientId: string; readonly contextId: string }): Promise<BookRuntimeRecoveryHold | null> {
    return clone(this.holds.get(`${input.recipientId}/${input.contextId}`) ?? null);
  }

  async putIfAbsent(input: { readonly projectionKey: string; readonly projection: BookRuntimeRecoveryProjection }): Promise<'created' | 'replayed' | 'conflict'> {
    if (!isBookRuntimeRecoveryProjection(input.projection) || input.projection.projectionKey !== input.projectionKey) return 'conflict';
    const scopeKey = `${input.projection.recipientId}/${input.projection.contextId}`;
    const hold = createBookRuntimeRecoveryHold({
      recoveryOperationId: input.projection.recoveryOperationId,
      recipientId: input.projection.recipientId,
      contextId: input.projection.contextId,
    });
    const existingHold = this.holds.get(scopeKey);
    if (existingHold && JSON.stringify(existingHold) !== JSON.stringify(hold)) return 'conflict';
    const scopedProjectionKey = `${scopeKey}/${input.projectionKey}`;
    const existing = this.projections.get(scopedProjectionKey);
    if (existing) return JSON.stringify(existing) === JSON.stringify(input.projection) ? 'replayed' : 'conflict';
    this.holds.set(scopeKey, hold);
    this.projections.set(scopedProjectionKey, clone(input.projection));
    return 'created';
  }

  read(input: { readonly recipientId: string; readonly contextId: string; readonly projectionKey: string }): BookRuntimeRecoveryProjection | null {
    return clone(this.projections.get(`${input.recipientId}/${input.contextId}/${input.projectionKey}`) ?? null);
  }
}

export const isBookRuntimeRecoveryContext = (value: unknown): value is BookRuntimeRecoveryContext => (
  isRecord(value)
  && typeof value.recoveryOperationId === 'string'
  && SAFE_ID.test(value.recoveryOperationId)
  && (value.phase === 'rebuilding' || value.phase === 'reconciling')
);
