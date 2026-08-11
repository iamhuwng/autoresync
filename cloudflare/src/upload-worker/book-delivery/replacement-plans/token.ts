import type {
  ReplacementConfirmationHandoff,
  ReplacementPlanRecord,
  ReplacementPlanReviewRecord,
  ReplacementCurrentPlanPointer,
  ReplacementTokenRecord,
} from '../../../../../src/services/book-source-delivery/replacementPlan.types.ts';
import { isReplacementPlanExpired } from '../../../../../src/services/book-source-delivery/replacementPlan.service.ts';
import type { ReplacementPlanRepository } from './contract.ts';

export const REPLACEMENT_CONFIRMATION_TOKEN_PURPOSE = 'replacement-confirmation' as const;
export const REPLACEMENT_CONFIRMATION_TOKEN_DEFAULT_TTL_MS = 15 * 60 * 1000;
export const REPLACEMENT_CONFIRMATION_TOKEN_MAX_TTL_MS = 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const HASH = /^[a-f0-9]{64}$/u;
const BASE64URL = /^[A-Za-z0-9_-]{43}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const base64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const clone = <T>(value: T): T => structuredClone(value);
const sameVector = (left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>): boolean => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
};
const safeId = (value: unknown): value is string => typeof value === 'string' && ID.test(value) && !value.includes('/') && !value.includes('\\');

export type ReplacementTokenValidationFailure =
  | 'invalid-token'
  | 'missing'
  | 'expired'
  | 'invalidated'
  | 'stale-plan'
  | 'stale-review'
  | 'revision-changed'
  | 'adapter-changed'
  | 'scope-mismatch';

export type ReplacementTokenValidationResult =
  | { readonly status: 'valid'; readonly handoff: ReplacementConfirmationHandoff }
  | { readonly status: 'invalid'; readonly code: ReplacementTokenValidationFailure };

export const createReplacementConfirmationToken = async (input: {
  readonly ownerId: string;
  readonly bookId: string;
  readonly plan: ReplacementPlanRecord;
  readonly review: ReplacementPlanReviewRecord;
  readonly adapterFingerprint: string;
  readonly now: string;
  readonly ttlMs?: number;
  readonly randomValues?: (bytes: Uint8Array) => Uint8Array;
}): Promise<{ readonly token: string; readonly record: ReplacementTokenRecord; readonly handoff: ReplacementConfirmationHandoff }> => {
  const ttlMs = input.ttlMs ?? REPLACEMENT_CONFIRMATION_TOKEN_DEFAULT_TTL_MS;
  if (!safeId(input.ownerId) || !safeId(input.bookId)
    || input.plan.ownerId !== input.ownerId || input.plan.bookId !== input.bookId
    || input.review.ownerId !== input.ownerId || input.review.bookId !== input.bookId
    || input.review.planId !== input.plan.planId
    || !HASH.test(input.plan.planFingerprint) || !HASH.test(input.review.planFingerprint)
    || !HASH.test(input.adapterFingerprint)
    || !Number.isFinite(Date.parse(input.now))
    || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > REPLACEMENT_CONFIRMATION_TOKEN_MAX_TTL_MS
    || isReplacementPlanExpired(input.plan, input.now)
    || Date.parse(input.review.expiresAt) <= Date.parse(input.now)) {
    throw new Error('invalid_replacement_confirmation_token_request');
  }
  const bytes = new Uint8Array(TOKEN_BYTES);
  const randomValues = input.randomValues ?? ((target) => crypto.getRandomValues(target));
  randomValues(bytes);
  const token = base64Url(bytes);
  if (!BASE64URL.test(token)) throw new Error('replacement_confirmation_token_generation_failed');
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Math.min(
    Date.parse(input.plan.expiresAt),
    Date.parse(input.review.expiresAt),
    Date.parse(input.now) + ttlMs,
  )).toISOString();
  const record: ReplacementTokenRecord = Object.freeze({
    schemaVersion: 1,
    tokenHash,
    purpose: REPLACEMENT_CONFIRMATION_TOKEN_PURPOSE,
    ownerId: input.ownerId,
    bookId: input.bookId,
    planId: input.plan.planId,
    reviewId: input.review.reviewId,
    planFingerprint: input.plan.planFingerprint,
    deltaFingerprint: input.plan.deltaFingerprint,
    snapshotFingerprint: input.plan.impactSnapshotFingerprint,
    revisionVector: clone(input.plan.impactSnapshotRevisionVector),
    adapterFingerprint: input.adapterFingerprint,
    issuedAt: input.now,
    expiresAt,
  });
  const handoff: ReplacementConfirmationHandoff = Object.freeze({
    purpose: REPLACEMENT_CONFIRMATION_TOKEN_PURPOSE,
    token,
    ownerId: input.ownerId,
    bookId: input.bookId,
    planId: input.plan.planId,
    reviewId: input.review.reviewId,
    planFingerprint: input.plan.planFingerprint,
    deltaFingerprint: input.plan.deltaFingerprint,
    snapshotFingerprint: input.plan.impactSnapshotFingerprint,
    revisionVector: clone(input.plan.impactSnapshotRevisionVector),
    expiresAt,
  });
  return { token, record, handoff };
};

export const validateReplacementConfirmationToken = async (input: {
  readonly token: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly plan: ReplacementPlanRecord;
  readonly review: ReplacementPlanReviewRecord;
  readonly current: ReplacementCurrentPlanPointer | null;
  readonly stored: ReplacementTokenRecord | null;
  readonly currentRevisionVector: Readonly<Record<string, number>>;
  readonly adapterFingerprint: string;
  readonly now: string;
}): Promise<ReplacementTokenValidationResult> => {
  if (!BASE64URL.test(input.token)) return { status: 'invalid', code: 'invalid-token' };
  if (!input.stored) return { status: 'invalid', code: 'missing' };
  const hash = await sha256Hex(input.token);
  if (hash !== input.stored.tokenHash) return { status: 'invalid', code: 'invalid-token' };
  if (input.stored.purpose !== REPLACEMENT_CONFIRMATION_TOKEN_PURPOSE
    || input.stored.ownerId !== input.ownerId || input.stored.bookId !== input.bookId
    || input.stored.planId !== input.plan.planId || input.stored.reviewId !== input.review.reviewId
    || input.stored.planFingerprint !== input.plan.planFingerprint
    || input.stored.deltaFingerprint !== input.plan.deltaFingerprint
    || input.stored.snapshotFingerprint !== input.plan.impactSnapshotFingerprint) {
    return { status: 'invalid', code: 'scope-mismatch' };
  }
  if (!input.current || input.current.status !== 'current'
    || input.current.ownerId !== input.ownerId || input.current.bookId !== input.bookId
    || input.current.planId !== input.plan.planId
    || input.current.planFingerprint !== input.plan.planFingerprint) {
    return { status: 'invalid', code: 'stale-plan' };
  }
  const now = Date.parse(input.now);
  if (!Number.isFinite(now) || now >= Date.parse(input.stored.expiresAt) || now >= Date.parse(input.plan.expiresAt)) {
    return { status: 'invalid', code: 'expired' };
  }
  if (input.stored.invalidatedAt && now >= Date.parse(input.stored.invalidatedAt)) return { status: 'invalid', code: 'invalidated' };
  if (input.review.state !== 'reviewed' || input.review.planFingerprint !== input.plan.planFingerprint) return { status: 'invalid', code: 'stale-review' };
  if (!sameVector(input.stored.revisionVector, input.currentRevisionVector)) return { status: 'invalid', code: 'revision-changed' };
  if (input.stored.adapterFingerprint !== input.adapterFingerprint) return { status: 'invalid', code: 'adapter-changed' };
  return {
    status: 'valid',
    handoff: Object.freeze({
      purpose: REPLACEMENT_CONFIRMATION_TOKEN_PURPOSE,
      token: input.token,
      ownerId: input.ownerId,
      bookId: input.bookId,
      planId: input.plan.planId,
      reviewId: input.review.reviewId,
      planFingerprint: input.plan.planFingerprint,
      deltaFingerprint: input.plan.deltaFingerprint,
      snapshotFingerprint: input.plan.impactSnapshotFingerprint,
      revisionVector: clone(input.stored.revisionVector),
      expiresAt: input.stored.expiresAt,
    }),
  };
};

/** Explicit adapter bridge for #116; it stores only the digest, never token bytes. */
export const persistReplacementConfirmationToken = async (input: {
  readonly repository: ReplacementPlanRepository;
  readonly token: Awaited<ReturnType<typeof createReplacementConfirmationToken>>;
}): Promise<ReplacementConfirmationHandoff> => {
  await input.repository.saveToken({ token: input.token.record });
  return input.token.handoff;
};
