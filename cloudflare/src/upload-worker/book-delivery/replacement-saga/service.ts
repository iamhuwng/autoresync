import type {
  ReplacementPlanRecord,
  ReplacementPlanReviewRecord,
} from '../../../../../src/services/book-source-delivery/replacementPlan.types.ts';
import { isReplacementPlanExpired } from '../../../../../src/services/book-source-delivery/replacementPlan.service.ts';
import {
  validateReplacementConfirmationToken,
  type ReplacementTokenValidationFailure,
} from '../replacement-plans/token.ts';
import type {
  ReplacementSagaContextItem,
  ReplacementSagaDependencies,
  ReplacementSagaExecutionInput,
  ReplacementSagaExecutionResult,
  ReplacementSagaRecord,
  ReplacementSagaState,
  ReplacementSagaValidationFacts,
} from './contract.ts';
import {
  REPLACEMENT_SAGA_MAX_AUDIT_EVENTS,
  REPLACEMENT_SAGA_MAX_ITEMS,
} from './contract.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const validVector = (value: unknown): value is Readonly<Record<string, number>> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value as Record<string, unknown>).length > 0
  && Object.entries(value as Record<string, unknown>).every(([key, revision]) => ID.test(key) && Number.isSafeInteger(revision) && (revision as number) >= 0)
);

const same = (left: unknown, right: unknown): boolean => stable(left) === stable(right);

const transitionTable: Readonly<Record<ReplacementSagaState, readonly ReplacementSagaState[]>> = {
  accepted: ['staging'],
  staging: ['staged', 'compensating'],
  staged: ['visible', 'compensating'],
  visible: ['contexts-pending'],
  'contexts-pending': ['awaiting-retired-byte-deletion'],
  'awaiting-retired-byte-deletion': [],
  compensating: ['compensated'],
  compensated: [],
};

const isLegalTransition = (from: ReplacementSagaState, to: ReplacementSagaState): boolean => (
  transitionTable[from].includes(to)
);

const safeNow = (dependencies: ReplacementSagaDependencies): string | null => {
  try {
    const date = dependencies.now?.() ?? new Date();
    const milliseconds = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
  } catch {
    return null;
  }
};

const auditEvent = (saga: ReplacementSagaRecord, state: ReplacementSagaState, at: string, code?: string) => [
  ...saga.audit.events,
  { state, stateRevision: saga.stateRevision + 1, at, ...(code ? { code } : {}) },
].slice(-REPLACEMENT_SAGA_MAX_AUDIT_EVENTS);

const nextState = (
  saga: ReplacementSagaRecord,
  state: ReplacementSagaState,
  at: string,
  patch: Partial<Pick<ReplacementSagaRecord, 'stagedReceipt' | 'visibility' | 'retiredByteHandoff'>> = {},
): ReplacementSagaRecord => {
  const nextMilliseconds = Date.parse(at);
  const currentMilliseconds = Date.parse(saga.updatedAt);
  if (!isLegalTransition(saga.state, state)
    || !Number.isFinite(nextMilliseconds)
    || !Number.isFinite(currentMilliseconds)
    || nextMilliseconds < currentMilliseconds) throw new Error('illegal_replacement_saga_transition');
  return clone({
    ...saga,
    ...patch,
    state,
    stateRevision: saga.stateRevision + 1,
    updatedAt: at,
    audit: { ...saga.audit, events: auditEvent(saga, state, at) },
  });
};

const nextItem = (saga: ReplacementSagaRecord, contextKey: string, at: string): ReplacementSagaRecord => {
  const item = saga.contexts[contextKey];
  if (!item || item.state !== 'pending') throw new Error('invalid_replacement_saga_item_transition');
  const nextMilliseconds = Date.parse(at);
  const currentMilliseconds = Date.parse(saga.updatedAt);
  if (!Number.isFinite(nextMilliseconds) || !Number.isFinite(currentMilliseconds) || nextMilliseconds < currentMilliseconds) {
    throw new Error('non_monotonic_replacement_saga_update');
  }
  const contexts = { ...saga.contexts, [contextKey]: { ...item, state: 'retired-revoked' as const, stateRevision: item.stateRevision + 1 } };
  return clone({
    ...saga,
    contexts,
    stateRevision: saga.stateRevision + 1,
    updatedAt: at,
    audit: {
      ...saga.audit,
      retiredItemCount: saga.audit.retiredItemCount + 1,
      events: [...saga.audit.events, { state: saga.state, stateRevision: saga.stateRevision + 1, at, code: 'context-retired' }].slice(-REPLACEMENT_SAGA_MAX_AUDIT_EVENTS),
    },
  });
};

const validationCode = (code: ReplacementTokenValidationFailure): string => `token-${code}`;

const sourceVersionIds = (plan: ReplacementPlanRecord): readonly string[] => (
  [...new Set(plan.sourceSetDelta.old.sources.map((source) => source.sourceVersionId))].sort()
);

const newSourceVersionIds = (plan: ReplacementPlanRecord): readonly string[] => (
  [...new Set(plan.sourceSetDelta.next.sources.map((source) => source.sourceVersionId))].sort()
);

const contextItems = (plan: ReplacementPlanRecord, sagaId: string): Readonly<Record<string, ReplacementSagaContextItem>> => {
  const result: Record<string, ReplacementSagaContextItem> = {};
  for (const context of plan.contexts) {
    if (result[context.contextKey]) throw new Error('duplicate_replacement_saga_context');
    result[context.contextKey] = {
      contextKey: context.contextKey,
      contextKind: context.contextKind,
      classification: context.classification,
      lifecycle: context.lifecycle,
      status: context.status,
      sourceScopes: clone(context.sourceScopes),
      state: 'pending',
      stateRevision: 0,
      operationId: `${sagaId}:context:${context.contextKey}`,
    };
  }
  return result;
};

const validateFacts = async (
  input: ReplacementSagaExecutionInput,
  dependencies: ReplacementSagaDependencies,
  now: string,
): Promise<{ readonly facts: ReplacementSagaValidationFacts; readonly adapterFingerprint: string } | { readonly code: string }> => {
  const current = await dependencies.plans.readCurrent({ ownerId: input.ownerId, bookId: input.bookId, now });
  if (current.status !== 'ready') return { code: `plan-${current.status}` };
  if (current.plan.planId !== input.planId || current.pointer.planId !== input.planId) return { code: 'stale-plan' };
  const plan = await dependencies.plans.readPlan({ ownerId: input.ownerId, bookId: input.bookId, planId: input.planId });
  const review = await dependencies.plans.readReview({ ownerId: input.ownerId, bookId: input.bookId, planId: input.planId, reviewId: input.reviewId });
  const stored = await dependencies.plans.readToken({ ownerId: input.ownerId, bookId: input.bookId, planId: input.planId, reviewId: input.reviewId });
  if (!plan || !review || !stored) return { code: 'plan-review-token-missing' };
  if (plan.planFingerprint !== current.pointer.planFingerprint
    || plan.ownerId !== input.ownerId || plan.bookId !== input.bookId
    || review.ownerId !== input.ownerId || review.bookId !== input.bookId
    || review.planId !== plan.planId || review.state !== 'reviewed'
    || review.planFingerprint !== plan.planFingerprint
    || review.deltaFingerprint !== plan.deltaFingerprint
    || review.snapshotFingerprint !== plan.impactSnapshotFingerprint
    || isReplacementPlanExpired(plan, now)) return { code: 'stale-review' };
  const revisionFacts = await dependencies.revisions.read({
    ownerId: input.ownerId,
    bookId: input.bookId,
    snapshotId: plan.impactSnapshotId,
    snapshotFingerprint: plan.impactSnapshotFingerprint,
  });
  if (!revisionFacts || !validVector(plan.impactSnapshotRevisionVector)
    || !validVector(revisionFacts.revisionVector.values)
    || !same(plan.impactSnapshotRevisionVector, revisionFacts.revisionVector.values)
    || plan.bookRevision !== revisionFacts.currentRevisions.bookRevision
    || plan.publicationRevision !== revisionFacts.currentRevisions.publicationRevision
    || plan.sourceSetRevision !== revisionFacts.currentRevisions.sourceSetRevision
    || plan.sourceVersionRevisions === undefined
    || !same(plan.sourceVersionRevisions, revisionFacts.currentRevisions.sourceVersionRevisions)
    || !HASH.test(revisionFacts.adapterFingerprint)) return { code: 'revision-changed' };
  const token = await validateReplacementConfirmationToken({
    token: input.confirmationToken,
    ownerId: input.ownerId,
    bookId: input.bookId,
    plan,
    review,
    stored,
    current: current.pointer,
    currentRevisionVector: revisionFacts.revisionVector.values,
    adapterFingerprint: revisionFacts.adapterFingerprint,
    now,
  });
  if (token.status !== 'valid') return { code: validationCode(token.code) };
  if (plan.contexts.length > REPLACEMENT_SAGA_MAX_ITEMS || plan.contexts.some((context) => !ID.test(context.contextKey))) return { code: 'context-scope-invalid' };
  return { facts: { plan, review, current: current.pointer, token: stored }, adapterFingerprint: revisionFacts.adapterFingerprint };
};

const createSagaRecord = async (
  input: ReplacementSagaExecutionInput,
  facts: ReplacementSagaValidationFacts,
  adapterFingerprint: string,
  tokenHash: string,
  requestFingerprint: string,
  sagaId: string,
  now: string,
): Promise<ReplacementSagaRecord> => {
  const oldSourceVersionIds = sourceVersionIds(facts.plan);
  const nextSourceVersionIds = newSourceVersionIds(facts.plan);
  const items = contextItems(facts.plan, sagaId);
  return {
    schemaVersion: 1,
    sagaId,
    ownerId: input.ownerId,
    bookId: input.bookId,
    planId: facts.plan.planId,
    reviewId: facts.review.reviewId,
    idempotencyKey: input.idempotencyKey,
    tokenHash,
    requestFingerprint,
    planFingerprint: facts.plan.planFingerprint,
    deltaFingerprint: facts.plan.deltaFingerprint,
    snapshotFingerprint: facts.plan.impactSnapshotFingerprint,
    adapterFingerprint,
    revisionVector: clone(facts.plan.impactSnapshotRevisionVector),
    sourceSetDelta: clone(facts.plan.sourceSetDelta),
    sourceVersionIds: oldSourceVersionIds,
    targetSourceSetRevision: facts.plan.targetSourceSetRevision,
    contexts: items,
    state: 'accepted',
    stateRevision: 0,
    acceptedAt: now,
    updatedAt: now,
    stagedReceipt: null,
    visibility: null,
    retiredByteHandoff: null,
    audit: {
      itemCount: Object.keys(items).length,
      retiredItemCount: 0,
      oldSourceVersionIds,
      newSourceVersionIds: nextSourceVersionIds,
      events: [{ state: 'accepted', stateRevision: 0, at: now }],
    },
    recovery: {
      resumeBehavior: 'forward-only-after-visible',
      rollbackBoundary: 'staged-only',
      contextOwner: '#117',
      retiredByteOwner: '#119',
    },
  };
};

const pending = (code: string, saga: ReplacementSagaRecord): ReplacementSagaExecutionResult => ({ status: 'pending', code, saga });

export const createReplacementSagaService = (dependencies: ReplacementSagaDependencies) => Object.freeze({
  async execute(input: ReplacementSagaExecutionInput): Promise<ReplacementSagaExecutionResult> {
    if (dependencies.enabled !== true) return { status: 'blocked', code: 'replacement_saga_disabled' };
    if (!ID.test(input.ownerId) || !ID.test(input.bookId) || !ID.test(input.planId) || !ID.test(input.reviewId)
      || !IDEMPOTENCY.test(input.idempotencyKey) || typeof input.confirmationToken !== 'string' || input.confirmationToken.length === 0) {
      return { status: 'blocked', code: 'invalid-request' };
    }
    const tokenHash = await sha256Hex(input.confirmationToken);
    const requestFingerprint = await sha256Hex(stable({
      ownerId: input.ownerId,
      bookId: input.bookId,
      planId: input.planId,
      reviewId: input.reviewId,
      idempotencyKey: input.idempotencyKey,
      tokenHash,
    }));
    let existing: ReplacementSagaRecord | null;
    try {
      existing = await dependencies.ledger.findByIdempotency({ ownerId: input.ownerId, bookId: input.bookId, idempotencyKey: input.idempotencyKey });
    } catch {
      return { status: 'blocked', code: 'ledger-unavailable' };
    }
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) return { status: 'blocked', code: 'replay-conflict' };
      if (existing.state === 'accepted' || existing.state === 'staging' || existing.state === 'staged') {
        const now = safeNow(dependencies);
        if (!now) return { status: 'blocked', code: 'clock-unavailable' };
        let validation: Awaited<ReturnType<typeof validateFacts>>;
        try { validation = await validateFacts(input, dependencies, now); } catch { return { status: 'blocked', code: 'validation-unavailable' }; }
        if ('code' in validation) return { status: 'blocked', code: validation.code };
        if (validation.facts.plan.planFingerprint !== existing.planFingerprint
          || validation.facts.review.reviewId !== existing.reviewId
          || validation.adapterFingerprint !== existing.adapterFingerprint) return { status: 'blocked', code: 'saga-authority-changed' };
      }
      return resumeSaga(existing, dependencies, true);
    }
    const now = safeNow(dependencies);
    if (!now) return { status: 'blocked', code: 'clock-unavailable' };
    let validation: Awaited<ReturnType<typeof validateFacts>>;
    try { validation = await validateFacts(input, dependencies, now); } catch { return { status: 'blocked', code: 'validation-unavailable' }; }
    if ('code' in validation) return { status: 'blocked', code: validation.code };
    let saga: ReplacementSagaRecord;
    try {
      saga = await createSagaRecord(input, validation.facts, validation.adapterFingerprint, tokenHash, requestFingerprint, dependencies.newId?.() ?? crypto.randomUUID(), now);
    } catch { return { status: 'blocked', code: 'invalid-saga' }; }
    let accepted;
    try { accepted = await dependencies.ledger.accept({ saga }); } catch { return { status: 'blocked', code: 'ledger-unavailable' }; }
    if (accepted.status === 'conflict') return { status: 'blocked', code: 'replay-conflict' };
    return resumeSaga(accepted.saga ?? saga, dependencies, accepted.status === 'replayed');
  },
});

const casState = async (
  saga: ReplacementSagaRecord,
  state: ReplacementSagaState,
  dependencies: ReplacementSagaDependencies,
  at: string,
  patch: Partial<Pick<ReplacementSagaRecord, 'stagedReceipt' | 'visibility' | 'retiredByteHandoff'>> = {},
): Promise<ReplacementSagaRecord | null> => {
  const next = nextState(saga, state, at, patch);
  const result = await dependencies.ledger.compareAndSet({ ownerId: saga.ownerId, sagaId: saga.sagaId, expectedState: saga.state, expectedRevision: saga.stateRevision, next });
  return result.status === 'advanced' ? result.saga ?? next : null;
};

const compensate = async (saga: ReplacementSagaRecord, dependencies: ReplacementSagaDependencies): Promise<ReplacementSagaExecutionResult> => {
  let current = saga;
  if (current.state !== 'compensating') {
    const at = safeNow(dependencies);
    if (!at) return pending('clock-unavailable', current);
    const transitioned = await casState(current, 'compensating', dependencies, at);
    if (!transitioned) return pending('compensation-transition-conflict', current);
    current = transitioned;
  }
  try {
    const result = await dependencies.visibility.rollbackStaged({ saga: current, operationId: `${current.sagaId}:rollback` });
    if (result.status === 'pending') return pending('rollback-pending', current);
    const at = safeNow(dependencies);
    if (!at) return pending('clock-unavailable', current);
    const compensated = await casState(current, 'compensated', dependencies, at);
    return compensated ? { status: 'compensated', saga: compensated } : pending('compensation-cas-conflict', current);
  } catch {
    return pending('rollback-unavailable', current);
  }
};

const resumeSaga = async (
  initial: ReplacementSagaRecord,
  dependencies: ReplacementSagaDependencies,
  replay: boolean,
): Promise<ReplacementSagaExecutionResult> => {
  let saga = initial;
  if (saga.state === 'awaiting-retired-byte-deletion' || saga.state === 'compensated') {
    return { status: replay ? 'replayed' : saga.state, saga } as ReplacementSagaExecutionResult;
  }
  if (saga.state === 'accepted') {
    const at = safeNow(dependencies);
    if (!at) return pending('clock-unavailable', saga);
    const staging = await casState(saga, 'staging', dependencies, at);
    if (!staging) return pending('staging-cas-conflict', saga);
    saga = staging;
  }
  if (saga.state === 'staging') {
    try {
      const prepared = await dependencies.visibility.prepare({ saga, operationId: `${saga.sagaId}:prepare` });
      if (!HASH.test(prepared.receipt)) return pending('prepare-receipt-invalid', saga);
      const at = safeNow(dependencies);
      if (!at) return pending('clock-unavailable', saga);
      const staged = await casState(saga, 'staged', dependencies, at, { stagedReceipt: prepared.receipt });
      if (!staged) return pending('staging-cas-conflict', saga);
      saga = staged;
    } catch {
      return compensate(saga, dependencies);
    }
  }
  if (saga.state === 'staged') {
    try {
      const visible = await dependencies.visibility.publish({ saga, operationId: `${saga.sagaId}:visibility` });
      if (!HASH.test(visible.receipt) || !Number.isFinite(Date.parse(visible.visibleAt))) return pending('visibility-receipt-invalid', saga);
      const at = safeNow(dependencies);
      if (!at) return pending('clock-unavailable', saga);
      const madeVisible = await casState(saga, 'visible', dependencies, at, { visibility: { receipt: visible.receipt, visibleAt: visible.visibleAt } });
      if (!madeVisible) return pending('visibility-cas-conflict', saga);
      saga = madeVisible;
    } catch {
      return pending('visibility-pending', saga);
    }
  }
  if (saga.state === 'visible') {
    const at = safeNow(dependencies);
    if (!at) return pending('clock-unavailable', saga);
    const contextsPending = await casState(saga, 'contexts-pending', dependencies, at);
    if (!contextsPending) return pending('context-phase-cas-conflict', saga);
    saga = contextsPending;
  }
  if (saga.state === 'contexts-pending') {
    for (const contextKey of Object.keys(saga.contexts).sort()) {
      const currentItem = saga.contexts[contextKey]!;
      if (currentItem.state === 'retired-revoked') continue;
      try {
        const result = await dependencies.contexts.adoptAndRevoke({ saga, item: currentItem, operationId: currentItem.operationId });
        if (result.status === 'pending' || !result.allRetiredDeliveriesRevoked) return pending('context-revocation-pending', saga);
      } catch {
        return pending('context-owner-unavailable', saga);
      }
      const at = safeNow(dependencies);
      if (!at) return pending('clock-unavailable', saga);
      const updated = nextItem(saga, contextKey, at);
      const saved = await dependencies.ledger.compareAndSet({ ownerId: saga.ownerId, sagaId: saga.sagaId, expectedState: saga.state, expectedRevision: saga.stateRevision, next: updated });
      if (saved.status !== 'advanced' || !saved.saga) return pending('context-cas-conflict', saga);
      saga = saved.saga;
    }
    if (Object.values(saga.contexts).some((item) => item.state !== 'retired-revoked')) return pending('context-revocation-pending', saga);
    if (!saga.retiredByteHandoff) {
      try {
        const handoff = await dependencies.retiredBytes.enqueueExactDeletion({
          saga,
          operationId: `${saga.sagaId}:retired-byte-deletion`,
          sourceVersionIds: saga.sourceVersionIds,
          precondition: 'all-contexts-retired-deliveries-revoked',
        });
        if (handoff.status === 'pending') return pending('retired-byte-handoff-pending', saga);
        const at = safeNow(dependencies);
        if (!at) return pending('clock-unavailable', saga);
        const complete = await casState(saga, 'awaiting-retired-byte-deletion', dependencies, at, {
          retiredByteHandoff: { status: handoff.status === 'replayed' ? 'replayed' : 'queued', sourceVersionIds: saga.sourceVersionIds, queuedAt: at },
        });
        return complete ? { status: 'awaiting-retired-byte-deletion', saga: complete } : pending('handoff-cas-conflict', saga);
      } catch {
        return pending('retired-byte-handoff-unavailable', saga);
      }
    }
  }
  return { status: replay ? 'replayed' : 'pending', saga } as ReplacementSagaExecutionResult;
};

export { isLegalTransition };
