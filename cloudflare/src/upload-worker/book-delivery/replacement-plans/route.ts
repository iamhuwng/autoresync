import {
  createReplacementPlan,
} from '../../../../../src/services/book-source-delivery/replacementPlan.service.ts';
import type {
  ReplacementCurrentRevisions,
  ReplacementPlanClientCreateRequest,
  ReplacementSnapshotRevisionVector,
  ReplacementPlanRecord,
  ReplacementPlanReviewRecord,
} from '../../../../../src/services/book-source-delivery/replacementPlan.types.ts';
import type { ReplacementSourceSetDeltaInput } from '../../../../../src/services/book-assembly/replacementSourceSetDelta.types.ts';
import { persistReplacementConfirmationToken, createReplacementConfirmationToken } from './token.ts';
import type {
  ReplacementPlanCancelResponse,
  ReplacementPlanCurrentResponse,
  ReplacementPlanReviewResponse,
  ReplacementPlanRouteInput,
} from './contract.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const MAX_IDEMPOTENCY_KEY = 128;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;
const PATH = /^\/v1\/book-replacement-plans\/books\/([^/]+)\/(current|plan|review|cancel)$/u;

const json = (body: unknown, status: number): Response => {
  const serialized = JSON.stringify(body);
  if (new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
    return new Response(JSON.stringify({ code: 'replacement_plan_response_too_large' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(serialized, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const safeId = (value: unknown): value is string =>
  typeof value === 'string' && ID.test(value) && !value.includes('/') && !value.includes('\\');
const safeHash = (value: unknown): value is string => typeof value === 'string' && HASH.test(value);
const parsePath = (request: Request): { readonly bookId: string; readonly operation: 'current' | 'plan' | 'review' | 'cancel' } | null => {
  const url = new URL(request.url);
  if (url.search || url.hash) return null;
  const match = PATH.exec(url.pathname);
  if (!match) return null;
  let bookId = match[1] ?? '';
  try { bookId = decodeURIComponent(bookId); } catch { return null; }
  if (!safeId(bookId) || bookId.includes('/') || bookId.includes('\\')) return null;
  const operation = match[2];
  if (operation !== 'current' && operation !== 'plan' && operation !== 'review' && operation !== 'cancel') return null;
  return { bookId, operation };
};

const boundedBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    return record(value) ? value : null;
  } catch {
    return null;
  }
};

const allowedKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));
const idempotency = (request: Request): string | null => {
  const value = request.headers.get('idempotency-key');
  return value && value.length <= MAX_IDEMPOTENCY_KEY && OPERATION.test(value) ? value : null;
};
const now = (input: ReplacementPlanRouteInput): string | null => {
  try {
    const value = input.dependencies.now?.() ?? new Date();
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  } catch {
    return null;
  }
};
const digest = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

type ReplacementPlanRouteRequest = Record<string, unknown> & {
  readonly sourceSetDelta: ReplacementSourceSetDeltaInput;
  readonly currentRevisions: ReplacementCurrentRevisions;
  readonly targetSourceSetRevision: number;
  readonly capacity: ReplacementPlanClientCreateRequest['capacity'];
  readonly now: string;
  readonly ttlMs?: number;
  readonly snapshotFingerprint: string;
  readonly snapshotRevisionVector: ReplacementSnapshotRevisionVector;
};

const failure = (error: unknown): { readonly status: number; readonly code: string } => {
  const code = error instanceof Error ? error.message : '';
  if (code === 'replacement_plan_stale' || code === 'replacement_plan_idempotency_conflict') return { status: 409, code: 'replacement_plan_stale' };
  if (code.includes('expired')) return { status: 410, code: 'replacement_plan_expired' };
  if (code.startsWith('invalid_') || code.includes('invalid_replacement')) return { status: 400, code: 'replacement_plan_invalid_request' };
  return { status: 503, code: 'replacement_plan_unavailable' };
};

const planRequest = (body: Record<string, unknown>): body is ReplacementPlanRouteRequest =>
  allowedKeys(body, ['sourceSetDelta', 'currentRevisions', 'targetSourceSetRevision', 'capacity', 'now', 'ttlMs', 'snapshotFingerprint', 'snapshotRevisionVector'])
  && record(body.sourceSetDelta)
  && record(body.currentRevisions)
  && record(body.capacity)
  && safeHash(body.snapshotFingerprint)
  && record(body.snapshotRevisionVector)
  && record(body.snapshotRevisionVector.values);

const planFactsCurrent = async (
  input: ReplacementPlanRouteInput,
  plan: ReplacementPlanRecord,
): Promise<boolean> => {
  const facts = await input.dependencies.revisions.read({
    ownerId: plan.ownerId,
    bookId: plan.bookId,
    snapshotId: plan.impactSnapshotId,
    snapshotFingerprint: plan.impactSnapshotFingerprint,
  });
  if (!facts) return false;
  return stable(facts.revisionVector.values) === stable(plan.impactSnapshotRevisionVector)
    && facts.adapterFingerprint === await digest(plan.adapters)
    && stable(facts.currentRevisions) === stable({
      bookRevision: plan.bookRevision,
      publicationRevision: plan.publicationRevision,
      sourceSetRevision: plan.sourceSetRevision,
      sourceVersionRevisions: plan.sourceVersionRevisions,
    });
};

export const handleReplacementPlanRoute = async (input: ReplacementPlanRouteInput): Promise<Response> => {
  // #59 supplies a verified Firebase identity. Reject before parsing the path,
  // gate, or touching any owner/book repository.
  if (!safeId(input.uid)) return json({ code: 'unauthorized' }, 401);
  if (input.dependencies.enabled !== true) return json({ code: 'replacement_plan_route_disabled' }, 503);
  const matched = parsePath(input.request);
  if (!matched) return json({ code: 'replacement_plan_route_not_found' }, 404);
  const currentTime = now(input);
  if (!currentTime) return json({ code: 'replacement_plan_unavailable' }, 503);
  if (matched.operation === 'current') {
    if (input.request.method !== 'GET') return json({ code: 'method_not_allowed' }, 405);
    try {
      const result = await input.dependencies.repository.readCurrent({ ownerId: input.uid, bookId: matched.bookId, now: currentTime });
      if (result.status === 'ready' && !await planFactsCurrent(input, result.plan)) {
        await input.dependencies.repository.invalidateTokens({ ownerId: input.uid, bookId: matched.bookId, planId: result.plan.planId, reason: 'revision-changed', now: currentTime });
        return json({ code: 'replacement_plan_stale' }, 409);
      }
      const body: ReplacementPlanCurrentResponse = result.status === 'ready'
        ? { status: 'ready', plan: result.plan, pointer: result.pointer }
        : result.status === 'expired'
          ? { status: 'expired', planId: result.planId, expiresAt: result.expiresAt }
          : result.status === 'stale'
            ? { status: 'stale', planId: result.planId }
            : { status: result.status };
      return json(body, result.status === 'denied' ? 403 : result.status === 'missing' ? 404 : result.status === 'expired' ? 410 : result.status === 'stale' ? 409 : 200);
    } catch (error) {
      const result = failure(error);
      return json({ code: result.code }, result.status);
    }
  }
  if (input.request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
  const operationIdValue = idempotency(input.request);
  if (!operationIdValue) return json({ code: 'idempotency_key_required' }, 400);
  const body = await boundedBody(input.request);
  if (!body) return json({ code: 'replacement_plan_body_invalid' }, 400);

  try {
    if (matched.operation === 'plan') {
      if (!planRequest(body)) return json({ code: 'replacement_plan_request_invalid' }, 400);
      const snapshotResult = await input.dependencies.snapshots.readCurrent({
        actorId: input.uid,
        bookId: matched.bookId,
        expectedFingerprint: body.snapshotFingerprint,
        now: currentTime,
      });
      if (snapshotResult.status !== 'ready') {
        const status = snapshotResult.status === 'expired' ? 410 : snapshotResult.status === 'denied' ? 403 : snapshotResult.status === 'missing' ? 404 : 409;
        return json({ code: `replacement_plan_snapshot_${snapshotResult.status}` }, status);
      }
      const facts = await input.dependencies.revisions.read({
        ownerId: input.uid,
        bookId: matched.bookId,
        snapshotId: snapshotResult.snapshot.snapshotId,
        snapshotFingerprint: snapshotResult.snapshot.inputFingerprint,
      });
      if (!facts || stable(facts.revisionVector.values) !== stable(body.snapshotRevisionVector.values)
        || stable(facts.currentRevisions) !== stable(body.currentRevisions)
        || facts.adapterFingerprint !== await digest(snapshotResult.snapshot.adapters)) {
        return json({ code: 'replacement_plan_revision_facts_stale' }, 409);
      }
      const trusted = await input.dependencies.sourceSets.resolve({
        ownerId: input.uid,
        bookId: matched.bookId,
        requested: body.sourceSetDelta,
      });
      if (!trusted) return json({ code: 'replacement_plan_source_set_unavailable' }, 409);
      const built = await createReplacementPlan({
        ownerId: input.uid,
        bookId: matched.bookId,
        sourceSetDelta: {
          old: trusted.old,
          next: trusted.next,
          mappings: body.sourceSetDelta.mappings,
        },
        currentRevisions: facts.currentRevisions,
        targetSourceSetRevision: body.targetSourceSetRevision,
        capacity: body.capacity,
        now: currentTime,
        ...(body.ttlMs === undefined ? {} : { ttlMs: body.ttlMs }),
        impactSnapshot: {
          snapshot: snapshotResult.snapshot,
          revisionVector: facts.revisionVector,
          currentRevisions: facts.currentRevisions,
        },
        ...(input.dependencies.newId ? { planId: input.dependencies.newId() } : {}),
      });
      if (built.status !== 'ready') return json({ code: `replacement_plan_${built.code}` }, built.code === 'capacity-exceeded' ? 409 : 422);
      const saved = await input.dependencies.repository.createPlan({ plan: built.plan, operationId: operationIdValue, now: currentTime });
      return json({ status: saved.status, plan: saved.plan, receipt: saved.receipt }, 200);
    }

    if (!allowedKeys(body, ['planId', 'planFingerprint'])
      || !safeId(body.planId) || !safeHash(body.planFingerprint)) return json({ code: 'replacement_plan_request_invalid' }, 400);
    const current = await input.dependencies.repository.readCurrent({
      ownerId: input.uid,
      bookId: matched.bookId,
      now: currentTime,
      expectedPlanFingerprint: body.planFingerprint,
    });
    if (current.status !== 'ready' || current.plan.planId !== body.planId) {
      return json({ code: current.status === 'expired' ? 'replacement_plan_expired' : 'replacement_plan_stale' }, current.status === 'expired' ? 410 : 409);
    }
    if (!await planFactsCurrent(input, current.plan)) {
      await input.dependencies.repository.invalidateTokens({ ownerId: input.uid, bookId: matched.bookId, planId: current.plan.planId, reason: 'revision-changed', now: currentTime });
      return json({ code: 'replacement_plan_stale' }, 409);
    }
    if (matched.operation === 'cancel') {
      const canceled = await input.dependencies.repository.cancel({
        ownerId: input.uid,
        bookId: matched.bookId,
        planId: body.planId,
        planFingerprint: body.planFingerprint,
        operationId: operationIdValue,
        now: currentTime,
      });
      const response: ReplacementPlanCancelResponse = { status: canceled.status, receipt: canceled.receipt };
      return json(response, 200);
    }
    const review: ReplacementPlanReviewRecord = Object.freeze({
      schemaVersion: 1,
      reviewId: input.dependencies.newId?.() ?? crypto.randomUUID(),
      planId: current.plan.planId,
      ownerId: input.uid,
      bookId: matched.bookId,
      planFingerprint: current.plan.planFingerprint,
      deltaFingerprint: current.plan.deltaFingerprint,
      snapshotFingerprint: current.plan.impactSnapshotFingerprint,
      revisionVector: current.plan.impactSnapshotRevisionVector,
      reviewedAt: currentTime,
      expiresAt: current.plan.expiresAt,
      state: 'reviewed',
    });
    const savedReview = await input.dependencies.repository.saveReview({ review, operationId: operationIdValue, now: currentTime });
    const adapterFingerprint = await digest(current.plan.adapters);
    const generated = await createReplacementConfirmationToken({
      ownerId: input.uid,
      bookId: matched.bookId,
      plan: current.plan,
      review: savedReview.review,
      adapterFingerprint,
      now: currentTime,
    });
    const handoff = await persistReplacementConfirmationToken({ repository: input.dependencies.repository, token: generated });
    const response: ReplacementPlanReviewResponse = {
      status: savedReview.status,
      plan: current.plan,
      review: savedReview.review,
      handoff,
    };
    return json(response, 200);
  } catch (error) {
    const result = failure(error);
    return json({ code: result.code }, result.status);
  }
};

export const createReplacementPlanRoute = (dependencies: ReplacementPlanRouteInput['dependencies']) =>
  Object.freeze({
    handle: (request: Request, uid?: string) => handleReplacementPlanRoute({ request, uid, dependencies }),
  });
