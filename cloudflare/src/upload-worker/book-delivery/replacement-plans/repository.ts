import { FirebaseRtdbRestClient, type RepositoryEnv } from '../../listening-authoring/rtdb.ts';
import { isReplacementPlanExpired } from '../../../../../src/services/book-source-delivery/replacementPlan.service.ts';
import type {
  ReplacementCurrentPlanPointer,
  ReplacementPlanOperationReceipt,
  ReplacementPlanReadResult,
  ReplacementPlanRecord,
  ReplacementPlanReviewRecord,
  ReplacementTokenRecord,
} from '../../../../../src/services/book-source-delivery/replacementPlan.types.ts';
import {
  REPLACEMENT_PLAN_MAX_IDEMPOTENCY_RECORDS,
  REPLACEMENT_PLAN_ROOT,
  type ReplacementPlanRepository,
} from './contract.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export interface ReplacementPlanRepositoryEnv extends RepositoryEnv {
  BOOK_REPLACEMENT_PLAN_SERVICE_IDENTITY?: string;
  BOOK_REPLACEMENT_PLAN_GOOGLE_SA_KEY?: string;
}

interface PersistedOperation {
  readonly fingerprint: string;
  readonly receipt: ReplacementPlanOperationReceipt;
}

interface ReplacementPlanRoot {
  plans?: Record<string, Record<string, ReplacementPlanRecord>>;
  current?: Record<string, Record<string, ReplacementCurrentPlanPointer>>;
  reviews?: Record<string, Record<string, Record<string, ReplacementPlanReviewRecord>>>;
  tokens?: Record<string, Record<string, Record<string, ReplacementTokenRecord>>>;
  operations?: Record<string, Record<string, Record<string, PersistedOperation>>>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => structuredClone(value);
const rootFrom = (value: unknown): ReplacementPlanRoot => {
  if (value === null || value === undefined) return {};
  if (!record(value)) throw new Error('invalid_replacement_plan_root');
  return clone(value) as ReplacementPlanRoot;
};
const safeId = (value: unknown): value is string => typeof value === 'string' && ID.test(value) && !value.includes('/') && !value.includes('\\');
const safeOperationId = (value: unknown): value is string => safeId(value) && value.length <= 128;
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const operationFingerprint = (action: string, value: unknown): string => stable({ action, value });
const nowOr = (value: string): number => Date.parse(value);
const planAt = (root: ReplacementPlanRoot, ownerId: string, planId: string): ReplacementPlanRecord | null =>
  root.plans?.[ownerId]?.[planId] ?? null;
const validPlan = (value: unknown, ownerId: string, bookId: string, planId?: string): value is ReplacementPlanRecord =>
  record(value)
  && value.schemaVersion === 1
  && safeId(value.ownerId) && value.ownerId === ownerId
  && safeId(value.bookId) && value.bookId === bookId
  && safeId(value.planId) && (!planId || value.planId === planId)
  && typeof value.planFingerprint === 'string' && HASH.test(value.planFingerprint)
  && typeof value.deltaFingerprint === 'string' && HASH.test(value.deltaFingerprint)
  && typeof value.impactSnapshotFingerprint === 'string' && HASH.test(value.impactSnapshotFingerprint)
  && Array.isArray(value.contexts)
  && Array.isArray(value.selectedContextKeys)
  && value.selectedContextKeys.length === 0
  && !Object.hasOwn(value, 'token');
const validPointer = (value: unknown, ownerId: string, bookId: string): value is ReplacementCurrentPlanPointer =>
  record(value)
  && safeId(value.planId)
  && safeId(value.planFingerprint) && HASH.test(value.planFingerprint)
  && safeId(value.ownerId) && value.ownerId === ownerId
  && safeId(value.bookId) && value.bookId === bookId
  && ['current', 'canceled', 'replanned'].includes(String(value.status))
  && typeof value.updatedAt === 'string' && Number.isFinite(nowOr(value.updatedAt));
const validReview = (value: unknown, ownerId: string, bookId: string, planId: string): value is ReplacementPlanReviewRecord =>
  record(value)
  && value.schemaVersion === 1
  && safeId(value.reviewId)
  && safeId(value.planId) && value.planId === planId
  && safeId(value.ownerId) && value.ownerId === ownerId
  && safeId(value.bookId) && value.bookId === bookId
  && typeof value.planFingerprint === 'string' && HASH.test(value.planFingerprint)
  && typeof value.deltaFingerprint === 'string' && HASH.test(value.deltaFingerprint)
  && typeof value.snapshotFingerprint === 'string' && HASH.test(value.snapshotFingerprint)
  && record(value.revisionVector)
  && ['reviewed', 'canceled'].includes(String(value.state));
const validToken = (value: unknown, ownerId: string, bookId: string, planId: string, reviewId: string): value is ReplacementTokenRecord =>
  record(value)
  && value.schemaVersion === 1
  && value.purpose === 'replacement-confirmation'
  && typeof value.tokenHash === 'string' && HASH.test(value.tokenHash)
  && safeId(value.ownerId) && value.ownerId === ownerId
  && safeId(value.bookId) && value.bookId === bookId
  && safeId(value.planId) && value.planId === planId
  && safeId(value.reviewId) && value.reviewId === reviewId
  && typeof value.planFingerprint === 'string' && HASH.test(value.planFingerprint)
  && typeof value.deltaFingerprint === 'string' && HASH.test(value.deltaFingerprint)
  && typeof value.snapshotFingerprint === 'string' && HASH.test(value.snapshotFingerprint)
  && record(value.revisionVector)
  && typeof value.adapterFingerprint === 'string' && HASH.test(value.adapterFingerprint)
  && typeof value.issuedAt === 'string' && typeof value.expiresAt === 'string';
const pointerFor = (plan: ReplacementPlanRecord, status: ReplacementCurrentPlanPointer['status'], updatedAt: string): ReplacementCurrentPlanPointer => ({
  planId: plan.planId,
  planFingerprint: plan.planFingerprint,
  ownerId: plan.ownerId,
  bookId: plan.bookId,
  status,
  updatedAt,
});
const receiptFor = (
  operationId: string,
  fingerprint: string,
  status: ReplacementPlanOperationReceipt['status'],
  now: string,
  planId?: string,
  reviewId?: string,
): ReplacementPlanOperationReceipt => ({ operationId, fingerprint, status, ...(planId ? { planId } : {}), ...(reviewId ? { reviewId } : {}), createdAt: now });

export class FirebaseRestReplacementPlanRepository implements ReplacementPlanRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly maxRetries: number;

  constructor(private readonly options: {
    readonly env: ReplacementPlanRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_REPLACEMENT_PLAN_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_replacement_plan_service_identity');
    const keyJson = (options.env.BOOK_REPLACEMENT_PLAN_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
    if (!keyJson && !options.getAccessToken) throw new Error('missing_replacement_plan_google_sa_key');
    if (keyJson) {
      let clientEmail: unknown;
      try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch { throw new Error('invalid_replacement_plan_google_sa_key'); }
      if (clientEmail !== identity) throw new Error('replacement_plan_service_identity_mismatch');
    }
    this.maxRetries = options.maxRetries ?? 5;
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
      firebaseAuthToken: Boolean(options.getAccessToken),
    });
  }

  async createPlan(input: { readonly plan: ReplacementPlanRecord; readonly operationId: string; readonly now: string }) {
    const plan = input.plan;
    if (!validPlan(plan, plan.ownerId, plan.bookId) || !safeOperationId(input.operationId) || !Number.isFinite(nowOr(input.now))) {
      throw new Error('invalid_replacement_plan_create');
    }
    const fingerprint = operationFingerprint('create', { planFingerprint: plan.planFingerprint });
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(REPLACEMENT_PLAN_ROOT);
      const root = rootFrom(current.data);
      const operations = root.operations?.[plan.ownerId]?.[plan.bookId] ?? {};
      const prior = operations[input.operationId];
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new Error('replacement_plan_idempotency_conflict');
        const replayPlan = planAt(root, plan.ownerId, prior.receipt.planId ?? plan.planId);
        if (!replayPlan) throw new Error('replacement_plan_replay_missing');
        return { status: 'replayed' as const, plan: clone(replayPlan), receipt: { ...clone(prior.receipt), status: 'replayed' as const } };
      }
      const active = root.current?.[plan.ownerId]?.[plan.bookId];
      const activePlan = active ? planAt(root, plan.ownerId, active.planId) : null;
      if (activePlan && active.status === 'current' && active.planFingerprint === plan.planFingerprint
        && !isReplacementPlanExpired(activePlan, input.now)) {
        const receipt = receiptFor(input.operationId, fingerprint, 'created', input.now, activePlan.planId);
        root.operations ??= {};
        root.operations[plan.ownerId] ??= {};
        root.operations[plan.ownerId]![plan.bookId] ??= {};
        root.operations[plan.ownerId]![plan.bookId]![input.operationId] = { fingerprint, receipt };
        if (await this.rtdb.writeIfMatch(REPLACEMENT_PLAN_ROOT, root, current.etag)) {
          return { status: 'replayed' as const, plan: clone(activePlan), receipt: { ...receipt, status: 'replayed' as const } };
        }
        continue;
      }
      root.plans ??= {};
      root.plans[plan.ownerId] ??= {};
      if (root.plans[plan.ownerId]![plan.planId]) throw new Error('replacement_plan_id_collision');
      root.plans[plan.ownerId]![plan.planId] = clone(plan);
      root.current ??= {};
      root.current[plan.ownerId] ??= {};
      root.current[plan.ownerId]![plan.bookId] = pointerFor(plan, 'current', input.now);
      root.operations ??= {};
      root.operations[plan.ownerId] ??= {};
      root.operations[plan.ownerId]![plan.bookId] ??= {};
      root.operations[plan.ownerId]![plan.bookId]![input.operationId] = {
        fingerprint,
        receipt: receiptFor(input.operationId, fingerprint, 'created', input.now, plan.planId),
      };
      const entries = Object.entries(root.operations[plan.ownerId]![plan.bookId]!);
      entries.slice(0, Math.max(0, entries.length - REPLACEMENT_PLAN_MAX_IDEMPOTENCY_RECORDS)).forEach(([key]) => {
        delete root.operations![plan.ownerId]![plan.bookId]![key];
      });
      if (await this.rtdb.writeIfMatch(REPLACEMENT_PLAN_ROOT, root, current.etag)) {
        if (activePlan && active.status === 'current') {
          await this.invalidateTokens({ ownerId: plan.ownerId, bookId: plan.bookId, planId: activePlan.planId, reason: 'replanned', now: input.now });
        }
        return { status: 'created' as const, plan: clone(plan), receipt: receiptFor(input.operationId, fingerprint, 'created', input.now, plan.planId) };
      }
    }
    throw new Error('replacement_plan_cas_retries_exhausted');
  }

  async readPlan(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string }): Promise<ReplacementPlanRecord | null> {
    if (!safeId(input.ownerId) || !safeId(input.bookId) || !safeId(input.planId)) return null;
    const value = await this.rtdb.readValue(`${REPLACEMENT_PLAN_ROOT}/plans/${input.ownerId}/${input.planId}`);
    return validPlan(value, input.ownerId, input.bookId, input.planId) ? clone(value) : null;
  }

  async readCurrent(input: { readonly ownerId: string; readonly bookId: string; readonly now: string; readonly expectedPlanFingerprint?: string }): Promise<ReplacementPlanReadResult> {
    if (!safeId(input.ownerId) || !safeId(input.bookId) || !Number.isFinite(nowOr(input.now))) return { status: 'denied' };
    const pointerValue = await this.rtdb.readValue(`${REPLACEMENT_PLAN_ROOT}/current/${input.ownerId}/${input.bookId}`);
    if (!validPointer(pointerValue, input.ownerId, input.bookId)) return { status: 'missing' };
    const planValue = await this.rtdb.readValue(`${REPLACEMENT_PLAN_ROOT}/plans/${input.ownerId}/${pointerValue.planId}`);
    if (!validPlan(planValue, input.ownerId, input.bookId, pointerValue.planId)
      || planValue.planFingerprint !== pointerValue.planFingerprint) return { status: 'stale', planId: pointerValue.planId };
    if (pointerValue.status !== 'current') return { status: 'stale', planId: pointerValue.planId };
    if (input.expectedPlanFingerprint && planValue.planFingerprint !== input.expectedPlanFingerprint) return { status: 'stale', planId: planValue.planId };
    if (isReplacementPlanExpired(planValue, input.now)) return { status: 'expired', planId: planValue.planId, expiresAt: planValue.expiresAt };
    return { status: 'ready', plan: clone(planValue), pointer: clone(pointerValue) };
  }

  async saveReview(input: { readonly review: ReplacementPlanReviewRecord; readonly operationId: string; readonly now: string }) {
    const review = input.review;
    if (!validReview(review, review.ownerId, review.bookId, review.planId) || !safeOperationId(input.operationId)) throw new Error('invalid_replacement_plan_review');
    const fingerprint = operationFingerprint('review', { planId: review.planId, planFingerprint: review.planFingerprint });
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(REPLACEMENT_PLAN_ROOT);
      const root = rootFrom(current.data);
      const operations = root.operations?.[review.ownerId]?.[review.bookId] ?? {};
      const prior = operations[input.operationId];
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new Error('replacement_plan_idempotency_conflict');
        const replay = root.reviews?.[review.ownerId]?.[review.planId]?.[prior.receipt.reviewId ?? review.reviewId];
        if (!replay) throw new Error('replacement_plan_review_replay_missing');
        return { status: 'replayed' as const, review: clone(replay), receipt: { ...clone(prior.receipt), status: 'replayed' as const } };
      }
      const pointer = root.current?.[review.ownerId]?.[review.bookId];
      const plan = pointer ? planAt(root, review.ownerId, pointer.planId) : null;
      if (!pointer || pointer.status !== 'current' || pointer.planId !== review.planId || pointer.planFingerprint !== review.planFingerprint
        || !plan || isReplacementPlanExpired(plan, input.now)) throw new Error('replacement_plan_stale');
      root.reviews ??= {};
      root.reviews[review.ownerId] ??= {};
      root.reviews[review.ownerId]![review.planId] ??= {};
      if (root.reviews[review.ownerId]![review.planId]![review.reviewId]) throw new Error('replacement_plan_review_id_collision');
      root.reviews[review.ownerId]![review.planId]![review.reviewId] = clone(review);
      root.operations ??= {};
      root.operations[review.ownerId] ??= {};
      root.operations[review.ownerId]![review.bookId] ??= {};
      const receipt = receiptFor(input.operationId, fingerprint, 'reviewed', input.now, review.planId, review.reviewId);
      root.operations[review.ownerId]![review.bookId]![input.operationId] = { fingerprint, receipt };
      if (await this.rtdb.writeIfMatch(REPLACEMENT_PLAN_ROOT, root, current.etag)) return { status: 'reviewed' as const, review: clone(review), receipt };
    }
    throw new Error('replacement_plan_review_cas_retries_exhausted');
  }

  async readReview(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly reviewId: string }): Promise<ReplacementPlanReviewRecord | null> {
    if (!safeId(input.ownerId) || !safeId(input.bookId) || !safeId(input.planId) || !safeId(input.reviewId)) return null;
    const value = await this.rtdb.readValue(`${REPLACEMENT_PLAN_ROOT}/reviews/${input.ownerId}/${input.planId}/${input.reviewId}`);
    return validReview(value, input.ownerId, input.bookId, input.planId) && value.reviewId === input.reviewId ? clone(value) : null;
  }

  async cancel(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly planFingerprint: string; readonly operationId: string; readonly now: string }) {
    if (!safeId(input.ownerId) || !safeId(input.bookId) || !safeId(input.planId) || !HASH.test(input.planFingerprint) || !safeOperationId(input.operationId)) throw new Error('invalid_replacement_plan_cancel');
    const fingerprint = operationFingerprint('cancel', { planId: input.planId, planFingerprint: input.planFingerprint });
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(REPLACEMENT_PLAN_ROOT);
      const root = rootFrom(current.data);
      const operations = root.operations?.[input.ownerId]?.[input.bookId] ?? {};
      const prior = operations[input.operationId];
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new Error('replacement_plan_idempotency_conflict');
        const replayPointer = root.current?.[input.ownerId]?.[input.bookId];
        if (!replayPointer || !validPointer(replayPointer, input.ownerId, input.bookId)) throw new Error('replacement_plan_replay_missing');
        return { status: 'replayed' as const, pointer: clone(replayPointer), receipt: { ...clone(prior.receipt), status: 'replayed' as const } };
      }
      const pointer = root.current?.[input.ownerId]?.[input.bookId];
      const plan = pointer ? planAt(root, input.ownerId, pointer.planId) : null;
      if (!pointer || !plan || pointer.planId !== input.planId || pointer.planFingerprint !== input.planFingerprint || pointer.status !== 'current') throw new Error('replacement_plan_stale');
      const nextPointer = pointerFor(plan, 'canceled', input.now);
      root.current![input.ownerId]![input.bookId] = nextPointer;
      root.operations ??= {};
      root.operations[input.ownerId] ??= {};
      root.operations[input.ownerId]![input.bookId] ??= {};
      const receipt = receiptFor(input.operationId, fingerprint, 'canceled', input.now, plan.planId);
      root.operations[input.ownerId]![input.bookId]![input.operationId] = { fingerprint, receipt };
      root.tokens?.[input.ownerId]?.[plan.planId] && Object.values(root.tokens[input.ownerId]![plan.planId]!).forEach((token) => {
        if (!token.invalidatedAt) {
          const mutable = token as unknown as { invalidatedAt?: string; invalidationReason?: 'canceled' | 'replanned' | 'revision-changed' | 'expired' };
          mutable.invalidatedAt = input.now;
          mutable.invalidationReason = 'canceled';
        }
      });
      if (await this.rtdb.writeIfMatch(REPLACEMENT_PLAN_ROOT, root, current.etag)) return { status: 'canceled' as const, pointer: nextPointer, receipt };
    }
    throw new Error('replacement_plan_cancel_cas_retries_exhausted');
  }

  async saveToken(input: { readonly token: ReplacementTokenRecord }): Promise<void> {
    const token = input.token;
    if (!validToken(token, token.ownerId, token.bookId, token.planId, token.reviewId)) throw new Error('invalid_replacement_plan_token');
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(REPLACEMENT_PLAN_ROOT);
      const root = rootFrom(current.data);
      root.tokens ??= {};
      root.tokens[token.ownerId] ??= {};
      root.tokens[token.ownerId]![token.planId] ??= {};
      const key = token.reviewId;
      root.tokens[token.ownerId]![token.planId]![key] = clone(token);
      if (await this.rtdb.writeIfMatch(REPLACEMENT_PLAN_ROOT, root, current.etag)) return;
    }
    throw new Error('replacement_plan_token_cas_retries_exhausted');
  }

  async readToken(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly reviewId: string }): Promise<ReplacementTokenRecord | null> {
    if (!safeId(input.ownerId) || !safeId(input.bookId) || !safeId(input.planId) || !safeId(input.reviewId)) return null;
    const value = await this.rtdb.readValue(`${REPLACEMENT_PLAN_ROOT}/tokens/${input.ownerId}/${input.planId}/${input.reviewId}`);
    return validToken(value, input.ownerId, input.bookId, input.planId, input.reviewId) ? clone(value) : null;
  }

  async invalidateTokens(input: { readonly ownerId: string; readonly bookId: string; readonly planId: string; readonly reason: 'canceled' | 'replanned' | 'revision-changed'; readonly now: string }): Promise<void> {
    if (!safeId(input.ownerId) || !safeId(input.bookId) || !safeId(input.planId) || !Number.isFinite(nowOr(input.now))) return;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(REPLACEMENT_PLAN_ROOT);
      const root = rootFrom(current.data);
      const tokens = root.tokens?.[input.ownerId]?.[input.planId];
      if (!tokens) return;
      Object.values(tokens).forEach((token) => {
        if (!token.invalidatedAt) {
          const mutable = token as unknown as { invalidatedAt?: string; invalidationReason?: 'canceled' | 'replanned' | 'revision-changed' | 'expired' };
          mutable.invalidatedAt = input.now;
          mutable.invalidationReason = input.reason;
        }
      });
      if (await this.rtdb.writeIfMatch(REPLACEMENT_PLAN_ROOT, root, current.etag)) return;
    }
    throw new Error('replacement_plan_token_invalidation_cas_retries_exhausted');
  }
}
