import type {
  ReplacementConfirmationHandoff,
  ReplacementPlanClient,
  ReplacementPlanClientCreateRequest,
  ReplacementCurrentPlanPointer,
  ReplacementPlanOperationReceipt,
  ReplacementPlanReadResult,
  ReplacementPlanRecord,
  ReplacementPlanReviewRecord,
} from './replacementPlan.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;

export class ReplacementPlanClientError extends Error {
  constructor(
    readonly code: 'invalid-request' | 'unauthorized' | 'unavailable' | 'malformed-response' | 'stale' | 'expired',
    readonly status = 0,
  ) {
    super(`replacement_plan_${code}`);
    this.name = 'ReplacementPlanClientError';
  }
}

export interface ReplacementPlanClientOptions {
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly basePath?: string;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const safeBody = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    return record(await response.json()) ?? {};
  } catch {
    return {};
  }
};

const validPlan = (value: unknown): value is ReplacementPlanRecord => {
  const plan = record(value);
  return plan !== null
    && plan.schemaVersion === 1
    && typeof plan.planId === 'string' && ID.test(plan.planId)
    && typeof plan.ownerId === 'string' && ID.test(plan.ownerId)
    && typeof plan.bookId === 'string' && ID.test(plan.bookId)
    && typeof plan.planFingerprint === 'string' && HASH.test(plan.planFingerprint)
    && typeof plan.deltaFingerprint === 'string' && HASH.test(plan.deltaFingerprint)
    && typeof plan.impactSnapshotFingerprint === 'string' && HASH.test(plan.impactSnapshotFingerprint)
    && Array.isArray(plan.contexts)
    && Array.isArray(plan.selectedContextKeys)
    && plan.selectedContextKeys.length === 0
    && !Object.hasOwn(plan, 'token');
};

const validReview = (value: unknown): value is ReplacementPlanReviewRecord => {
  const review = record(value);
  return review !== null
    && review.schemaVersion === 1
    && typeof review.reviewId === 'string' && ID.test(review.reviewId)
    && typeof review.planId === 'string' && ID.test(review.planId)
    && typeof review.ownerId === 'string' && ID.test(review.ownerId)
    && typeof review.bookId === 'string' && ID.test(review.bookId)
    && typeof review.planFingerprint === 'string' && HASH.test(review.planFingerprint)
    && typeof review.deltaFingerprint === 'string' && HASH.test(review.deltaFingerprint)
    && typeof review.snapshotFingerprint === 'string' && HASH.test(review.snapshotFingerprint)
    && typeof review.reviewedAt === 'string'
    && typeof review.expiresAt === 'string'
    && review.state === 'reviewed';
};

const validHandoff = (value: unknown): value is ReplacementConfirmationHandoff => {
  const handoff = record(value);
  return handoff !== null
    && handoff.purpose === 'replacement-confirmation'
    && typeof handoff.token === 'string' && TOKEN.test(handoff.token)
    && typeof handoff.ownerId === 'string' && ID.test(handoff.ownerId)
    && typeof handoff.bookId === 'string' && ID.test(handoff.bookId)
    && typeof handoff.planId === 'string' && ID.test(handoff.planId)
    && typeof handoff.reviewId === 'string' && ID.test(handoff.reviewId)
    && typeof handoff.planFingerprint === 'string' && HASH.test(handoff.planFingerprint)
    && typeof handoff.deltaFingerprint === 'string' && HASH.test(handoff.deltaFingerprint)
    && typeof handoff.snapshotFingerprint === 'string' && HASH.test(handoff.snapshotFingerprint)
    && typeof handoff.expiresAt === 'string';
};

const operationId = (value: string): void => {
  if (!OPERATION.test(value)) throw new ReplacementPlanClientError('invalid-request');
};

const pathId = (value: string): string => {
  if (!ID.test(value) || value.includes('/') || value.includes('\\')) throw new ReplacementPlanClientError('invalid-request');
  return encodeURIComponent(value);
};

const readResult = (body: Record<string, unknown>): ReplacementPlanReadResult => {
  if (body.status === 'missing') return { status: 'missing' };
  if (body.status === 'denied') return { status: 'denied' };
  if (body.status === 'stale' && typeof body.planId === 'string') return { status: 'stale', planId: body.planId };
  if (body.status === 'expired' && typeof body.planId === 'string' && typeof body.expiresAt === 'string') {
    return { status: 'expired', planId: body.planId, expiresAt: body.expiresAt };
  }
  if (body.status === 'ready' && validPlan(body.plan) && record(body.pointer)) {
    const pointer = body.pointer as ReplacementCurrentPlanPointer;
    if (!ID.test(pointer.planId) || !HASH.test(pointer.planFingerprint)
      || pointer.planId !== body.plan.planId || pointer.planFingerprint !== body.plan.planFingerprint
      || pointer.ownerId !== body.plan.ownerId || pointer.bookId !== body.plan.bookId
      || pointer.status !== 'current') throw new ReplacementPlanClientError('malformed-response', 502);
    return { status: 'ready', plan: body.plan, pointer };
  }
  throw new ReplacementPlanClientError('malformed-response', 502);
};

const create = (options: ReplacementPlanClientOptions): ReplacementPlanClient => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const basePath = (options.basePath ?? '/v1/book-replacement-plans/books').replace(/\/+$/u, '');
  const request = async (
    bookId: string,
    suffix: string,
    method: 'GET' | 'POST',
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> => {
    const token = (await options.getIdToken()).trim();
    if (!token) throw new ReplacementPlanClientError('unauthorized', 401);
    const url = `${basePath}/${pathId(bookId)}${suffix}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
      credentials: 'omit',
      redirect: 'error',
    });
    if (response.redirected) throw new ReplacementPlanClientError('unavailable', 502);
    const result = await safeBody(response);
    if (!response.ok) {
      if (response.status === 409) throw new ReplacementPlanClientError('stale', response.status);
      if (response.status === 410) throw new ReplacementPlanClientError('expired', response.status);
      if (response.status === 401 || response.status === 403) throw new ReplacementPlanClientError('unauthorized', response.status);
      throw new ReplacementPlanClientError('unavailable', response.status);
    }
    return result;
  };

  return Object.freeze({
    async create(input: ReplacementPlanClientCreateRequest & { readonly idempotencyKey: string }): Promise<ReplacementPlanRecord> {
      operationId(input.idempotencyKey);
      const body = await request(input.bookId, '/plan', 'POST', {
        sourceSetDelta: input.sourceSetDelta,
        currentRevisions: input.currentRevisions,
        targetSourceSetRevision: input.targetSourceSetRevision,
        capacity: input.capacity,
        now: input.now,
        ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs }),
        snapshotFingerprint: input.snapshotFingerprint,
        snapshotRevisionVector: input.snapshotRevisionVector,
      }, input.idempotencyKey);
      if ((body.status !== 'created' && body.status !== 'replayed') || !validPlan(body.plan) || body.plan.bookId !== input.bookId) {
        throw new ReplacementPlanClientError('malformed-response', 502);
      }
      return body.plan;
    },

    async readCurrent(input: { readonly bookId: string; readonly now?: string }): Promise<ReplacementPlanReadResult> {
      const body = await request(input.bookId, '/current', 'GET');
      return readResult(body);
    },

    async review(input): Promise<{ readonly plan: ReplacementPlanRecord; readonly review: ReplacementPlanReviewRecord; readonly handoff: ReplacementConfirmationHandoff }> {
      operationId(input.idempotencyKey);
      const body = await request(input.bookId, '/review', 'POST', {
        planId: input.planId,
        planFingerprint: input.planFingerprint,
      }, input.idempotencyKey);
      if ((body.status !== 'reviewed' && body.status !== 'replayed')
        || !validPlan(body.plan) || !validReview(body.review) || !validHandoff(body.handoff)
        || body.plan.bookId !== input.bookId || body.plan.planId !== input.planId || body.plan.planFingerprint !== input.planFingerprint
        || body.review.planId !== body.plan.planId || body.review.ownerId !== body.plan.ownerId || body.review.bookId !== body.plan.bookId
        || body.review.planFingerprint !== body.plan.planFingerprint || body.review.deltaFingerprint !== body.plan.deltaFingerprint
        || body.review.snapshotFingerprint !== body.plan.impactSnapshotFingerprint
        || body.handoff.ownerId !== body.plan.ownerId || body.handoff.bookId !== body.plan.bookId
        || body.handoff.planId !== body.plan.planId || body.handoff.reviewId !== body.review.reviewId
        || body.handoff.planFingerprint !== body.plan.planFingerprint || body.handoff.deltaFingerprint !== body.plan.deltaFingerprint
        || body.handoff.snapshotFingerprint !== body.plan.impactSnapshotFingerprint) {
        throw new ReplacementPlanClientError('malformed-response', 502);
      }
      return { plan: body.plan, review: body.review, handoff: body.handoff };
    },

    async cancel(input): Promise<ReplacementPlanOperationReceipt> {
      operationId(input.idempotencyKey);
      const body = await request(input.bookId, '/cancel', 'POST', {
        planId: input.planId,
        planFingerprint: input.planFingerprint,
      }, input.idempotencyKey);
      const receipt = record(body.receipt);
      if (!receipt || typeof receipt.operationId !== 'string' || typeof receipt.fingerprint !== 'string'
        || receipt.operationId !== input.idempotencyKey
        || (receipt.planId !== undefined && receipt.planId !== input.planId)
        || !['canceled', 'replayed'].includes(String(receipt.status))) {
        throw new ReplacementPlanClientError('malformed-response', 502);
      }
      return receipt as unknown as ReplacementPlanOperationReceipt;
    },
  });
};

export const createReplacementPlanClient = create;
