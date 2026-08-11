import type { BookUpdateActionRecord } from '../../../../src/services/book-delivery/bookUpdateAction.types.ts';
import { advanceBookUpdateAction, type BookUpdateActionRepository } from './update-action.ts';
import {
  projectBookRemovalHistoricalProjection,
  type BookRemovalHistoricalProjection,
  type BookRemovalHistoricalProjectionInput,
  type BookRemovalHistoricalSource,
} from '../../../../src/services/book-activity/bookRemovalHistoricalProjection.service.ts';
import type {
  BookRemovalCompletionProjection,
  BookRemovalCompletionSelection,
} from '../../../../src/services/book-homework/bookRemovalCompletionProjection.service.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

export const BOOK_REMOVAL_PHASE_RECEIPTS_ROOT = 'book_update_action_recovery/removal_receipts';
export const BOOK_REMOVAL_PHASES = Object.freeze([
  'history',
  'exclusion',
  'completion',
  'audit',
] as const);
export type BookRemovalPhase = typeof BOOK_REMOVAL_PHASES[number];

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_FINGERPRINT_LENGTH = 4096;
const MAX_OPERATIONS_PER_PLAN = 512;

export type BookRemovalContextKind = 'solo' | 'homework' | 'course' | 'class' | 'public-reference';
export type BookRemovalLifecycle = 'not-started' | 'in-progress' | 'submitted' | 'completed';

export interface BookRemovalUpdateOperation extends BookRemovalCompletionSelection {
  readonly contextKind: BookRemovalContextKind;
  readonly lifecycle: BookRemovalLifecycle;
  readonly activityId: string;
  readonly oldActivityVersionId: string;
  readonly choice: 'remove-from-current';
  readonly feedbackRelease: 'hidden' | 'released';
  readonly source?: BookRemovalHistoricalSource;
}

export interface BookRemovalUpdatePlan {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly contextKind: BookRemovalContextKind;
  readonly studentId: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly operations: readonly BookRemovalUpdateOperation[];
}

export type BookRemovalPlanResolution =
  | { readonly status: 'ready'; readonly students: readonly BookRemovalUpdatePlan[] }
  | { readonly status: 'stale' | 'denied' | 'unavailable' };

export interface BookRemovalUpdateResolver {
  resolve(action: BookUpdateActionRecord): Promise<BookRemovalPlanResolution>;
}

export interface BookRemovalReceiptIdentity {
  readonly ownerId: string;
  readonly actionId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
}

export interface BookRemovalPhaseReference {
  readonly historicalRowCount?: number;
  readonly excludedPlacementIds?: readonly string[];
  readonly requiredCount?: number;
  readonly submittedCount?: number;
  readonly completionStatus?: 'not_started' | 'in_progress' | 'completed';
  readonly scoredCount?: number;
  readonly pendingReviewCount?: number;
  readonly ungradedSubmittedCount?: number;
}

export interface BookRemovalPhaseReceipt {
  readonly status: 'pending' | 'succeeded';
  readonly fingerprint: string | null;
  readonly reference?: BookRemovalPhaseReference;
  readonly completedAt?: string;
}

export interface BookRemovalRecipientReceipt extends BookRemovalReceiptIdentity {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly phases: Readonly<Record<BookRemovalPhase, BookRemovalPhaseReceipt>>;
  readonly updatedAt: string;
}

export interface BookRemovalPhaseReceiptRepository {
  read(identity: BookRemovalReceiptIdentity): Promise<BookRemovalRecipientReceipt | null>;
  compareAndSet(input: {
    readonly identity: BookRemovalReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookRemovalRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookRemovalRecipientReceipt }>;
}

export type BookRemovalPhaseAdvanceResult =
  | { readonly status: 'applied' | 'replayed'; readonly receipt: BookRemovalRecipientReceipt }
  | { readonly status: 'conflict'; readonly code: string };

export interface BookRemovalHistoricalProjectionPort {
  apply(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly plan: BookRemovalUpdatePlan;
    readonly projections: readonly BookRemovalHistoricalProjection[];
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'unchanged' | 'conflict'; readonly historicalRowCount: number }>;
}

export interface BookRemovalExclusionProjectionPort {
  apply(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly plan: BookRemovalUpdatePlan;
    readonly placementIds: readonly string[];
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'conflict'; readonly excludedPlacementIds: readonly string[] }>;
}

export interface BookRemovalCompletionProjectionPort {
  recalculate(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly plan: BookRemovalUpdatePlan;
  }): Promise<{
    readonly status: 'applied' | 'replayed' | 'conflict';
    readonly projection: BookRemovalCompletionProjection;
  }>;
}

export interface BookRemovalAuditPort {
  record(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly plan: BookRemovalUpdatePlan;
    readonly excludedPlacementIds: readonly string[];
    readonly historicalRowCount: number;
    readonly completion: Pick<BookRemovalCompletionProjection, 'completion' | 'grading'>;
  }): Promise<{ readonly status: 'recorded' | 'replayed' | 'conflict' }>;
}

export type BookRemovalUpdateResult =
  | { readonly status: 'committed' | 'replayed'; readonly action: BookUpdateActionRecord }
  | { readonly status: 'pending'; readonly action: BookUpdateActionRecord; readonly code: string; readonly completedStudentCount: number }
  | { readonly status: 'blocked'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(',')}}`;
};

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const validIso = (value: unknown): value is string => (
  typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
);

const identityValid = (identity: BookRemovalReceiptIdentity): boolean => (
  validId(identity.ownerId)
  && validId(identity.actionId)
  && validId(identity.bookId)
  && validId(identity.contextKey)
  && validId(identity.contextId)
  && validId(identity.studentId)
);

const validSource = (value: unknown): value is BookRemovalHistoricalSource => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as BookRemovalHistoricalSource;
  if (!['none', 'draft', 'submission'].includes(source.kind)) return false;
  const ids = [source.terminalId, source.attemptId, source.resultId, source.completionId, source.draftId];
  if (ids.some((id) => id !== undefined && !validId(id))) return false;
  if (source.kind === 'none' && ids.some((id) => id !== undefined)) return false;
  if (source.kind === 'draft' && source.draftId === undefined) return false;
  return source.kind !== 'submission' || source.draftId === undefined;
};

const sameIdentity = (left: BookRemovalReceiptIdentity, right: BookRemovalReceiptIdentity): boolean => (
  left.ownerId === right.ownerId
  && left.actionId === right.actionId
  && left.bookId === right.bookId
  && left.contextKey === right.contextKey
  && left.contextId === right.contextId
  && left.studentId === right.studentId
);

const phaseTemplate = (): Readonly<Record<BookRemovalPhase, BookRemovalPhaseReceipt>> => (
  Object.freeze(Object.fromEntries(BOOK_REMOVAL_PHASES.map((phase) => [phase, {
    status: 'pending' as const,
    fingerprint: null,
  }])) as Record<BookRemovalPhase, BookRemovalPhaseReceipt>)
);

export const createBookRemovalRecipientReceipt = (
  identity: BookRemovalReceiptIdentity,
  updatedAt: string,
): BookRemovalRecipientReceipt => ({
  schemaVersion: 1,
  ...clone(identity),
  revision: 0,
  phases: phaseTemplate(),
  updatedAt,
});

export const bookRemovalPhaseFingerprint = (value: unknown): string => {
  const fingerprint = stable(value);
  if (fingerprint.length === 0 || fingerprint.length > MAX_FINGERPRINT_LENGTH) {
    throw new Error('removal_phase_fingerprint_invalid');
  }
  return fingerprint;
};

const validReceipt = (value: unknown, identity: BookRemovalReceiptIdentity): value is BookRemovalRecipientReceipt => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  if (receipt.schemaVersion !== 1
    || !identityValid(identity)
    || !sameIdentity(receipt as unknown as BookRemovalReceiptIdentity, identity)
    || !Number.isSafeInteger(receipt.revision)
    || (receipt.revision as number) < 0
    || !validIso(receipt.updatedAt)
    || receipt.phases === null
    || typeof receipt.phases !== 'object'
    || Array.isArray(receipt.phases)) return false;
  const phases = receipt.phases as Record<string, unknown>;
  return BOOK_REMOVAL_PHASES.every((phase) => {
    const valueForPhase = phases[phase];
    if (valueForPhase === null || typeof valueForPhase !== 'object' || Array.isArray(valueForPhase)) return false;
    const phaseRecord = valueForPhase as Record<string, unknown>;
    return (phaseRecord.status === 'pending' || phaseRecord.status === 'succeeded')
      && (phaseRecord.fingerprint === null
        || (typeof phaseRecord.fingerprint === 'string' && phaseRecord.fingerprint.length <= MAX_FINGERPRINT_LENGTH));
  });
};

export const recordBookRemovalPhaseSuccess = async (input: {
  readonly repository: BookRemovalPhaseReceiptRepository;
  readonly identity: BookRemovalReceiptIdentity;
  readonly phase: BookRemovalPhase;
  readonly fingerprint: string;
  readonly reference?: BookRemovalPhaseReference;
  readonly at: string;
}): Promise<BookRemovalPhaseAdvanceResult> => {
  if (!BOOK_REMOVAL_PHASES.includes(input.phase)
    || !identityValid(input.identity)
    || input.fingerprint.length === 0
    || input.fingerprint.length > MAX_FINGERPRINT_LENGTH
    || !validIso(input.at)) {
    return { status: 'conflict', code: 'removal-phase-input-invalid' };
  }
  const current = await input.repository.read(input.identity);
  if (current) {
    if (!validReceipt(current, input.identity)) return { status: 'conflict', code: 'removal-receipt-invalid' };
    const phase = current.phases[input.phase];
    if (phase.status === 'succeeded') {
      return phase.fingerprint === input.fingerprint
        ? { status: 'replayed', receipt: clone(current) }
        : { status: 'conflict', code: 'removal-phase-fingerprint-conflict' };
    }
    const next: BookRemovalRecipientReceipt = {
      ...clone(current),
      revision: current.revision + 1,
      phases: {
        ...clone(current.phases),
        [input.phase]: {
          status: 'succeeded',
          fingerprint: input.fingerprint,
          ...(input.reference ? { reference: clone(input.reference) } : {}),
          completedAt: input.at,
        },
      },
      updatedAt: input.at,
    };
    const result = await input.repository.compareAndSet({
      identity: input.identity,
      expectedRevision: current.revision,
      receipt: next,
    });
    if (result.status === 'advanced' && result.receipt) return { status: 'applied', receipt: result.receipt };
    const raced = await input.repository.read(input.identity);
    const racedPhase = raced?.phases[input.phase];
    return raced && racedPhase?.status === 'succeeded' && racedPhase.fingerprint === input.fingerprint
      ? { status: 'replayed', receipt: raced }
      : { status: 'conflict', code: 'removal-receipt-cas-conflict' };
  }
  const base = createBookRemovalRecipientReceipt(input.identity, input.at);
  const first: BookRemovalRecipientReceipt = {
    ...base,
    revision: 1,
    phases: {
      ...base.phases,
      [input.phase]: {
        status: 'succeeded',
        fingerprint: input.fingerprint,
        ...(input.reference ? { reference: clone(input.reference) } : {}),
        completedAt: input.at,
      },
    },
  };
  const result = await input.repository.compareAndSet({
    identity: input.identity,
    expectedRevision: null,
    receipt: first,
  });
  if (result.status === 'advanced' && result.receipt) return { status: 'applied', receipt: result.receipt };
  const raced = await input.repository.read(input.identity);
  const racedPhase = raced?.phases[input.phase];
  return raced && racedPhase?.status === 'succeeded' && racedPhase.fingerprint === input.fingerprint
    ? { status: 'replayed', receipt: raced }
    : { status: 'conflict', code: 'removal-receipt-create-conflict' };
};

export class InMemoryBookRemovalPhaseReceiptRepository implements BookRemovalPhaseReceiptRepository {
  private readonly records = new Map<string, BookRemovalRecipientReceipt>();

  async read(identity: BookRemovalReceiptIdentity): Promise<BookRemovalRecipientReceipt | null> {
    if (!identityValid(identity)) return null;
    return clone(this.records.get(this.key(identity)) ?? null);
  }

  async compareAndSet(input: {
    readonly identity: BookRemovalReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookRemovalRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookRemovalRecipientReceipt }> {
    if (!identityValid(input.identity)
      || !validReceipt(input.receipt, input.identity)
      || input.receipt.revision !== (input.expectedRevision === null ? 1 : input.expectedRevision + 1)) {
      return { status: 'conflict' };
    }
    const key = this.key(input.identity);
    const existing = this.records.get(key);
    if ((input.expectedRevision === null && existing)
      || (input.expectedRevision !== null && (!existing || existing.revision !== input.expectedRevision))) {
      return { status: 'conflict' };
    }
    this.records.set(key, clone(input.receipt));
    return { status: 'advanced', receipt: clone(input.receipt) };
  }

  private key(identity: BookRemovalReceiptIdentity): string {
    return [identity.ownerId, identity.actionId, identity.bookId, identity.contextKey, identity.contextId, identity.studentId].join('\u0000');
  }
}

export interface BookRemovalPhaseReceiptRepositoryEnv extends RepositoryEnv {
  BOOK_UPDATE_REMOVAL_SERVICE_IDENTITY?: string;
  BOOK_UPDATE_REMOVAL_GOOGLE_SA_KEY?: string;
  /** The accepted action service identity is the shared scoped update identity. */
  BOOK_UPDATE_ACTION_SERVICE_IDENTITY?: string;
  BOOK_UPDATE_ACTION_GOOGLE_SA_KEY?: string;
}

interface ReceiptRoot {
  receipts?: Record<string, Record<string, Record<string, Record<string, Record<string, Record<string, BookRemovalRecipientReceipt>>>>>>;
  readonly [key: string]: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const rootFrom = (value: unknown): ReceiptRoot => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw new Error('invalid_book_removal_receipt_root');
  return clone(value) as ReceiptRoot;
};

const keyPart = (value: string): string => encodeURIComponent(value);

export class FirebaseRestBookRemovalPhaseReceiptRepository implements BookRemovalPhaseReceiptRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: BookRemovalPhaseReceiptRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = (
      options.env.BOOK_UPDATE_REMOVAL_SERVICE_IDENTITY
      ?? options.env.BOOK_UPDATE_ACTION_SERVICE_IDENTITY
    )?.trim();
    if (!identity) throw new Error('missing_book_removal_service_identity');
    const keyJson = (
      options.env.BOOK_UPDATE_REMOVAL_GOOGLE_SA_KEY
      ?? options.env.BOOK_UPDATE_ACTION_GOOGLE_SA_KEY
      ?? options.env.GOOGLE_SA_KEY
    )?.trim();
    if (!keyJson) throw new Error('missing_book_removal_google_sa_key');
    let clientEmail: unknown;
    try {
      clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
    } catch {
      throw new Error('invalid_book_removal_google_sa_key');
    }
    if (clientEmail !== identity) throw new Error('book_removal_service_identity_mismatch');
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async read(identity: BookRemovalReceiptIdentity): Promise<BookRemovalRecipientReceipt | null> {
    if (!identityValid(identity)) return null;
    const value = await this.rtdb.readValue(this.receiptPath(identity));
    return validReceipt(value, identity) ? clone(value) : null;
  }

  async compareAndSet(input: {
    readonly identity: BookRemovalReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookRemovalRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookRemovalRecipientReceipt }> {
    if (!identityValid(input.identity) || !validReceipt(input.receipt, input.identity)) return { status: 'conflict' };
    const maxRetries = inputSafeRetries(this.options.maxRetries);
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(BOOK_REMOVAL_PHASE_RECEIPTS_ROOT);
      const root = rootFrom(current.data);
      const existing = root.receipts?.[keyPart(input.identity.ownerId)]?.[keyPart(input.identity.actionId)]
        ?.[keyPart(input.identity.bookId)]?.[keyPart(input.identity.contextKey)]
        ?.[keyPart(input.identity.contextId)]?.[keyPart(input.identity.studentId)];
      if (input.expectedRevision === null
        ? existing !== undefined
        : !existing || existing.revision !== input.expectedRevision) return { status: 'conflict' };
      root.receipts ??= {};
      root.receipts[keyPart(input.identity.ownerId)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)]![keyPart(input.identity.bookId)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)]![keyPart(input.identity.bookId)]![keyPart(input.identity.contextKey)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)]![keyPart(input.identity.bookId)]![keyPart(input.identity.contextKey)]![keyPart(input.identity.contextId)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)]![keyPart(input.identity.bookId)]![keyPart(input.identity.contextKey)]![keyPart(input.identity.contextId)]![keyPart(input.identity.studentId)] = clone(input.receipt);
      if (await this.rtdb.writeIfMatch(BOOK_REMOVAL_PHASE_RECEIPTS_ROOT, root, current.etag)) {
        return { status: 'advanced', receipt: clone(input.receipt) };
      }
    }
    return { status: 'conflict' };
  }

  private receiptPath(identity: BookRemovalReceiptIdentity): string {
    return `${BOOK_REMOVAL_PHASE_RECEIPTS_ROOT}/${keyPart(identity.ownerId)}/${keyPart(identity.actionId)}/${keyPart(identity.bookId)}/${keyPart(identity.contextKey)}/${keyPart(identity.contextId)}/${keyPart(identity.studentId)}`;
  }
}

const inputSafeRetries = (value: number | undefined): number => (
  Number.isSafeInteger(value) && value !== undefined && value > 0 && value <= 20 ? value : 5
);

const selectionKey = (contextKey: string, placementId: string): string => `${contextKey}\u0000${placementId}`;
const planKey = (plan: Pick<BookRemovalUpdatePlan, 'contextKey' | 'contextId' | 'studentId'>): string => (
  `${plan.contextKey}\u0000${plan.contextId}\u0000${plan.studentId}`
);
const operationId = (actionId: string, operation: BookRemovalUpdateOperation): string => (
  `${actionId}:removal:${operation.contextKey}:${operation.contextId}:${operation.studentId}:${operation.placementId}`
);

const contextIdFromKey = (contextKey: string, contextKind: BookRemovalContextKind): string | null => {
  const prefix = `${contextKind}:`;
  return contextKey.startsWith(prefix) && contextKey.length > prefix.length
    ? contextKey.slice(prefix.length)
    : null;
};

const validOperation = (action: BookUpdateActionRecord, operation: BookRemovalUpdateOperation): boolean => {
  const selection = action.selections.find((candidate) => (
    candidate.contextKey === operation.contextKey
    && candidate.placementId === operation.placementId
    && candidate.choice === 'remove-from-current'
  ));
  return Boolean(selection)
    && !selection!.replacementDeadline
    && validId(operation.actionId)
    && operation.actionId === action.actionId
    && validId(operation.ownerId)
    && operation.ownerId === action.ownerId
    && validId(operation.bookId)
    && operation.bookId === action.bookId
    && validId(operation.contextKey)
    && validId(operation.contextId)
    && ['solo', 'homework', 'course', 'class', 'public-reference'].includes(operation.contextKind)
    && contextIdFromKey(operation.contextKey, operation.contextKind) === operation.contextId
    && validId(operation.studentId)
    && validId(operation.placementId)
    && validId(operation.activityId)
    && validId(operation.oldActivityVersionId)
    && ['not-started', 'in-progress', 'submitted', 'completed'].includes(operation.lifecycle)
    && (operation.feedbackRelease === 'hidden' || operation.feedbackRelease === 'released')
    && validSource(operation.source ?? { kind: 'none' });
};

const validPlan = (action: BookUpdateActionRecord, plan: BookRemovalUpdatePlan): boolean => {
  if (plan.schemaVersion !== 1
    || !validId(plan.actionId)
    || plan.actionId !== action.actionId
    || !validId(plan.ownerId)
    || plan.ownerId !== action.ownerId
    || !validId(plan.bookId)
    || plan.bookId !== action.bookId
    || !validId(plan.contextKey)
    || !validId(plan.contextId)
    || !validId(plan.studentId)
    || !['solo', 'homework', 'course', 'class', 'public-reference'].includes(plan.contextKind)
    || plan.contextId !== contextIdFromKey(plan.contextKey, plan.contextKind)
    || typeof plan.reason !== 'string'
    || plan.reason.trim() !== plan.reason
    || plan.reason.length === 0
    || plan.reason.length > 500
    || !validIso(plan.createdAt)
    || !Array.isArray(plan.operations)
    || plan.operations.length === 0
    || plan.operations.length > MAX_OPERATIONS_PER_PLAN) return false;
  const seen = new Set<string>();
  for (const operation of plan.operations) {
    const key = selectionKey(operation.contextKey, operation.placementId);
    if (operation.contextKey !== plan.contextKey
      || operation.contextId !== plan.contextId
      || operation.studentId !== plan.studentId
      || operation.choice !== 'remove-from-current'
      || seen.has(key)
      || !validOperation(action, operation)) return false;
    seen.add(key);
  }
  return true;
};

const actionIsRemovalOnly = (action: BookUpdateActionRecord): boolean => (
  action.selections.length > 0
  && action.selections.every((selection) => selection.choice === 'remove-from-current' && selection.replacementDeadline === undefined)
  && action.audit.classifications.length > 0
  && action.audit.classifications.every((classification) => classification === 'removed')
  && action.audit.checkpointCount === 0
  && action.audit.regradeCount === 0
);

const historyInputs = (
  action: BookUpdateActionRecord,
  plan: BookRemovalUpdatePlan,
  at: string,
): BookRemovalHistoricalProjection[] => plan.operations.flatMap((operation) => {
  const input: BookRemovalHistoricalProjectionInput = {
    actionId: action.actionId,
    ownerId: action.ownerId,
    bookId: action.bookId,
    contextKey: operation.contextKey,
    contextId: operation.contextId,
    studentId: operation.studentId,
    placementId: operation.placementId,
    activityId: operation.activityId,
    activityVersionId: operation.oldActivityVersionId,
    lifecycle: operation.lifecycle,
    feedbackRelease: operation.feedbackRelease,
    ...(operation.source ? { source: operation.source } : {}),
    reason: plan.reason,
    at,
  };
  const projected = projectBookRemovalHistoricalProjection(input);
  return projected.status === 'projected' ? [projected.projection] : [];
});

const applyPhase = async (input: {
  readonly receipts: BookRemovalPhaseReceiptRepository;
  readonly identity: BookRemovalReceiptIdentity;
  readonly phase: BookRemovalPhase;
  readonly fingerprint: string;
  readonly at: string;
  readonly effect: () => Promise<{
    readonly status: 'success' | 'conflict';
    readonly code?: string;
    readonly reference?: BookRemovalPhaseReference;
  }>;
}): Promise<{ readonly status: 'ok'; readonly reference?: BookRemovalPhaseReference } | { readonly status: 'conflict'; readonly code: string }> => {
  const current = await input.receipts.read(input.identity);
  const savedPhase = current?.phases[input.phase];
  if (savedPhase?.status === 'succeeded') {
    return savedPhase.fingerprint === input.fingerprint
      ? { status: 'ok', reference: savedPhase.reference }
      : { status: 'conflict', code: `${input.phase}-receipt-fingerprint-conflict` };
  }
  const effect = await input.effect();
  if (effect.status !== 'success') return { status: 'conflict', code: effect.code ?? `${input.phase}-failed` };
  const receipt = await recordBookRemovalPhaseSuccess({
    repository: input.receipts,
    identity: input.identity,
    phase: input.phase,
    fingerprint: input.fingerprint,
    reference: effect.reference,
    at: input.at,
  });
  if (receipt.status === 'conflict') return receipt;
  return { status: 'ok', reference: receipt.receipt.phases[input.phase].reference };
};

const processPlan = async (options: BookRemovalUpdateExecutorOptions, action: BookUpdateActionRecord, plan: BookRemovalUpdatePlan, at: string) => {
  const identity: BookRemovalReceiptIdentity = {
    ownerId: plan.ownerId,
    actionId: plan.actionId,
    bookId: plan.bookId,
    contextKey: plan.contextKey,
    contextId: plan.contextId,
    studentId: plan.studentId,
  };
  const base = bookRemovalPhaseFingerprint({
    actionId: action.actionId,
    ownerId: action.ownerId,
    bookId: action.bookId,
    contextKey: plan.contextKey,
    contextId: plan.contextId,
    studentId: plan.studentId,
    operations: plan.operations,
    reason: plan.reason,
  });
  const projections = historyInputs(action, plan, at);
  const history = await applyPhase({
    receipts: options.receipts,
    identity,
    phase: 'history',
    fingerprint: bookRemovalPhaseFingerprint({ base, phase: 'history', projections }),
    at,
    effect: async () => {
      try {
        const result = await options.history.apply({
          operationId: `${action.actionId}:removal:${plan.contextKey}:${plan.contextId}:${plan.studentId}:history`,
          actionId: action.actionId,
          plan,
          projections,
        });
        return result.status === 'conflict'
          ? { status: 'conflict' as const, code: 'historical-projection-conflict' }
          : { status: 'success' as const, reference: { historicalRowCount: result.historicalRowCount } };
      } catch {
        return { status: 'conflict' as const, code: 'historical-projection-failed' };
      }
    },
  });
  if (history.status !== 'ok') return history;

  const placementIds = plan.operations.map((operation) => operation.placementId).sort();
  const exclusion = await applyPhase({
    receipts: options.receipts,
    identity,
    phase: 'exclusion',
    fingerprint: bookRemovalPhaseFingerprint({ base, phase: 'exclusion', placementIds }),
    at,
    effect: async () => {
      try {
        const result = await options.exclusions.apply({
          operationId: `${action.actionId}:removal:${plan.contextKey}:${plan.contextId}:${plan.studentId}:exclusion`,
          actionId: action.actionId,
          plan,
          placementIds,
        });
        return result.status === 'conflict'
          ? { status: 'conflict' as const, code: 'exclusion-projection-conflict' }
          : { status: 'success' as const, reference: { excludedPlacementIds: [...new Set(result.excludedPlacementIds)].sort() } };
      } catch {
        return { status: 'conflict' as const, code: 'exclusion-projection-failed' };
      }
    },
  });
  if (exclusion.status !== 'ok') return exclusion;
  const excludedPlacementIds = exclusion.reference?.excludedPlacementIds ?? placementIds;

  const completion = await applyPhase({
    receipts: options.receipts,
    identity,
    phase: 'completion',
    fingerprint: bookRemovalPhaseFingerprint({ base, phase: 'completion', excludedPlacementIds }),
    at,
    effect: async () => {
      try {
        const result = await options.completion.recalculate({
          operationId: `${action.actionId}:removal:${plan.contextKey}:${plan.contextId}:${plan.studentId}:completion`,
          actionId: action.actionId,
          plan,
        });
        if (result.status === 'conflict') return { status: 'conflict' as const, code: 'completion-projection-conflict' };
        return {
          status: 'success' as const,
          reference: {
            requiredCount: result.projection.completion.requiredCount,
            submittedCount: result.projection.completion.submittedCount,
            completionStatus: result.projection.completion.status,
            scoredCount: result.projection.grading.scoredCount,
            pendingReviewCount: result.projection.grading.pendingReviewCount,
            ungradedSubmittedCount: result.projection.grading.ungradedSubmittedCount,
          },
        };
      } catch {
        return { status: 'conflict' as const, code: 'completion-projection-failed' };
      }
    },
  });
  if (completion.status !== 'ok') return completion;
  const completionReference = completion.reference;

  const audit = await applyPhase({
    receipts: options.receipts,
    identity,
    phase: 'audit',
    fingerprint: bookRemovalPhaseFingerprint({ base, phase: 'audit', excludedPlacementIds, completionReference }),
    at,
    effect: async () => {
      try {
        const result = await options.audit.record({
          operationId: `${action.actionId}:removal:${plan.contextKey}:${plan.contextId}:${plan.studentId}:audit`,
          actionId: action.actionId,
          plan,
          excludedPlacementIds,
          historicalRowCount: history.reference?.historicalRowCount ?? projections.length,
          completion: {
            completion: {
              submittedCount: completionReference?.submittedCount ?? 0,
              requiredCount: completionReference?.requiredCount ?? 0,
              status: completionReference?.completionStatus ?? 'not_started',
              isComplete: completionReference?.completionStatus === 'completed',
            },
            grading: {
              scoredCount: completionReference?.scoredCount ?? 0,
              pendingReviewCount: completionReference?.pendingReviewCount ?? 0,
              ungradedSubmittedCount: completionReference?.ungradedSubmittedCount ?? 0,
            },
          },
        });
        return result.status === 'conflict'
          ? { status: 'conflict' as const, code: 'removal-audit-conflict' }
          : { status: 'success' as const };
      } catch {
        return { status: 'conflict' as const, code: 'removal-audit-failed' };
      }
    },
  });
  return audit;
};

interface BookRemovalUpdateExecutorOptions {
  readonly actions: BookUpdateActionRepository;
  readonly resolver: BookRemovalUpdateResolver;
  readonly receipts: BookRemovalPhaseReceiptRepository;
  readonly history: BookRemovalHistoricalProjectionPort;
  readonly exclusions: BookRemovalExclusionProjectionPort;
  readonly completion: BookRemovalCompletionProjectionPort;
  readonly audit: BookRemovalAuditPort;
  readonly now?: () => Date;
}

const applyingAction = async (
  options: BookRemovalUpdateExecutorOptions,
  action: BookUpdateActionRecord,
  at: string,
): Promise<{ readonly status: 'ready'; readonly action: BookUpdateActionRecord } | { readonly status: 'pending'; readonly action: BookUpdateActionRecord; readonly code: string } | { readonly status: 'replayed'; readonly action: BookUpdateActionRecord }> => {
  if (action.state !== 'accepted') return { status: 'ready', action };
  const applying = await advanceBookUpdateAction({
    repository: options.actions,
    ownerId: action.ownerId,
    actionId: action.actionId,
    expectedState: 'accepted',
    expectedRevision: action.stateRevision,
    nextState: 'applying',
    at,
  });
  if (applying.status === 'advanced' && applying.action) return { status: 'ready', action: applying.action };
  const fresh = await options.actions.read(action.ownerId, action.actionId);
  if (!fresh) return { status: 'pending', action, code: 'action-transition-conflict' };
  if (fresh.state === 'committed' || fresh.state === 'notification-pending' || fresh.state === 'completed') {
    return { status: 'replayed', action: fresh };
  }
  return fresh.state === 'applying'
    ? { status: 'ready', action: fresh }
    : { status: 'pending', action: fresh, code: 'action-transition-conflict' };
};

export const createBookRemovalUpdateExecutor = (options: BookRemovalUpdateExecutorOptions) => Object.freeze({
  async execute(input: { readonly ownerId: string; readonly actionId: string }): Promise<BookRemovalUpdateResult> {
    if (!validId(input.ownerId) || !validId(input.actionId)) return { status: 'blocked', code: 'invalid-identity' };
    let action: BookUpdateActionRecord | null;
    try {
      action = await options.actions.read(input.ownerId, input.actionId);
    } catch {
      return { status: 'blocked', code: 'action-unavailable' };
    }
    if (!action || action.ownerId !== input.ownerId) return { status: 'blocked', code: 'action-missing' };
    if (action.state === 'committed' || action.state === 'notification-pending' || action.state === 'completed') {
      return { status: 'replayed', action };
    }
    if (!actionIsRemovalOnly(action)) {
      return { status: 'pending', action, code: 'delegate-other-update-case', completedStudentCount: 0 };
    }
    let at: string;
    try {
      at = (options.now?.() ?? new Date()).toISOString();
    } catch {
      return { status: 'blocked', code: 'clock-invalid' };
    }
    let applying: Awaited<ReturnType<typeof applyingAction>>;
    try {
      applying = await applyingAction(options, action, at);
    } catch {
      return { status: 'pending', action, code: 'action-transition-unavailable', completedStudentCount: 0 };
    }
    if (applying.status === 'replayed') return applying;
    if (applying.status === 'pending') return { ...applying, completedStudentCount: 0 };
    action = applying.action;
    if (action.state !== 'applying') return { status: 'blocked', code: 'action-not-applicable' };

    let resolved: BookRemovalPlanResolution;
    try {
      resolved = await options.resolver.resolve(action);
    } catch {
      return { status: 'pending', action, code: 'case-resolution-unavailable', completedStudentCount: 0 };
    }
    if (resolved.status !== 'ready') {
      return { status: 'pending', action, code: `case-resolution-${resolved.status}`, completedStudentCount: 0 };
    }
    const plans = [...resolved.students].sort((left, right) => planKey(left).localeCompare(planKey(right)));
    const selectedKeys = action.selections.map((selection) => selectionKey(selection.contextKey, selection.placementId));
    const coveredKeys = plans.flatMap((plan) => plan.operations.map((operation) => selectionKey(operation.contextKey, operation.placementId)));
    if (plans.length === 0
      || new Set(plans.map(planKey)).size !== plans.length
      || new Set(coveredKeys).size < new Set(selectedKeys).size
      || selectedKeys.some((key) => !coveredKeys.includes(key))
      || plans.some((plan) => !validPlan(action, plan))) {
      return { status: 'pending', action, code: 'case-plan-invalid', completedStudentCount: 0 };
    }

    let completedStudentCount = 0;
    for (const plan of plans) {
      let result: Awaited<ReturnType<typeof processPlan>>;
      try {
        result = await processPlan(options, action, plan, at);
      } catch {
        return { status: 'pending', action, code: 'removal-phase-unavailable', completedStudentCount };
      }
      if (result.status !== 'ok') return { status: 'pending', action, code: result.code, completedStudentCount };
      completedStudentCount += 1;
    }

    const committed = await advanceBookUpdateAction({
      repository: options.actions,
      ownerId: action.ownerId,
      actionId: action.actionId,
      expectedState: 'applying',
      expectedRevision: action.stateRevision,
      nextState: 'committed',
      at,
    });
    if (committed.status === 'advanced' && committed.action) return { status: 'committed', action: committed.action };
    const fresh = await options.actions.read(action.ownerId, action.actionId);
    return fresh && (fresh.state === 'committed' || fresh.state === 'notification-pending' || fresh.state === 'completed')
      ? { status: 'replayed', action: fresh }
      : { status: 'pending', action: fresh ?? action, code: 'commit-transition-conflict', completedStudentCount };
  },
});

export type { BookRemovalUpdateExecutorOptions };
