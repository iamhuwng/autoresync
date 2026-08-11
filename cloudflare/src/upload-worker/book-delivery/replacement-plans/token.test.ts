import { describe, expect, it } from 'vitest';
import type { ReplacementPlanRecord, ReplacementPlanReviewRecord } from '../../../../../src/services/book-source-delivery/replacementPlan.types.ts';
import {
  createReplacementConfirmationToken,
  validateReplacementConfirmationToken,
} from './token.ts';

const plan: ReplacementPlanRecord = {
  schemaVersion: 1, planId: 'plan-1', ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 1, publicationRevision: 1,
  sourceSetRevision: 1, targetSourceSetRevision: 2, sourceVersionRevisions: { source: 1 },
  sourceSetDelta: {} as never, deltaFingerprint: 'a'.repeat(64), impactSnapshotId: 'snapshot-1', impactSnapshotFingerprint: 'b'.repeat(64),
  impactSnapshotRevisionVector: { book: 1 }, impactSnapshotExpiresAt: '2026-08-11T01:00:00.000Z', adapters: [], contexts: [], selectedContextKeys: [],
  capacity: { current: { trackedAccountBytes: 1, pendingUploadBytes: 0, replacementUploadBytes: 0, temporaryBytes: 0 }, additionalBytes: 1, projected: 2, limit: 9_000_000_000, available: true },
  reviewState: 'unreviewed', createdAt: '2026-08-11T00:00:00.000Z', expiresAt: '2026-08-11T01:00:00.000Z', planFingerprint: 'c'.repeat(64),
};
const review: ReplacementPlanReviewRecord = {
  schemaVersion: 1, reviewId: 'review-1', planId: 'plan-1', ownerId: 'teacher-1', bookId: 'book-1', planFingerprint: plan.planFingerprint,
  deltaFingerprint: plan.deltaFingerprint, snapshotFingerprint: plan.impactSnapshotFingerprint, revisionVector: { book: 1 },
  reviewedAt: '2026-08-11T00:01:00.000Z', expiresAt: plan.expiresAt, state: 'reviewed',
};
const current = {
  planId: plan.planId,
  planFingerprint: plan.planFingerprint,
  ownerId: plan.ownerId,
  bookId: plan.bookId,
  status: 'current' as const,
  updatedAt: '2026-08-11T00:01:00.000Z',
};

describe('replacement confirmation token', () => {
  it('generates an opaque 32-byte token and persists only a hash-shaped record', async () => {
    const generated = await createReplacementConfirmationToken({
      ownerId: 'teacher-1', bookId: 'book-1', plan, review, adapterFingerprint: 'd'.repeat(64), now: '2026-08-11T00:02:00.000Z',
      randomValues: (bytes) => { bytes.fill(7); return bytes; },
    });
    expect(generated.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(generated.record.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(generated.record)).not.toContain(generated.token);
    const valid = await validateReplacementConfirmationToken({
      token: generated.token, ownerId: 'teacher-1', bookId: 'book-1', plan, review, current, stored: generated.record,
      currentRevisionVector: { book: 1 }, adapterFingerprint: 'd'.repeat(64), now: '2026-08-11T00:02:01.000Z',
    });
    expect(valid.status).toBe('valid');
  });

  it.each([
    ['tampered', (token: string) => `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, 'invalid-token'],
    ['cross-owner', (token: string) => token, 'scope-mismatch'],
  ])('rejects %s token use', async (_name, mutate, code) => {
    const generated = await createReplacementConfirmationToken({
      ownerId: 'teacher-1', bookId: 'book-1', plan, review, adapterFingerprint: 'd'.repeat(64), now: '2026-08-11T00:02:00.000Z',
      randomValues: (bytes) => { bytes.fill(3); return bytes; },
    });
    const result = await validateReplacementConfirmationToken({
      token: mutate(generated.token), ownerId: _name === 'cross-owner' ? 'teacher-2' : 'teacher-1', bookId: 'book-1', plan, review, current,
      stored: generated.record, currentRevisionVector: { book: 1 }, adapterFingerprint: 'd'.repeat(64), now: '2026-08-11T00:02:01.000Z',
    });
    expect(result).toEqual({ status: 'invalid', code });
  });

  it('rejects the exact expiry boundary and changed revision vector', async () => {
    const generated = await createReplacementConfirmationToken({
      ownerId: 'teacher-1', bookId: 'book-1', plan, review, adapterFingerprint: 'd'.repeat(64), now: '2026-08-11T00:02:00.000Z', ttlMs: 60_000,
      randomValues: (bytes) => { bytes.fill(4); return bytes; },
    });
    await expect(validateReplacementConfirmationToken({
      token: generated.token, ownerId: 'teacher-1', bookId: 'book-1', plan, review, current, stored: generated.record,
      currentRevisionVector: { book: 1 }, adapterFingerprint: 'd'.repeat(64), now: generated.record.expiresAt,
    })).resolves.toEqual({ status: 'invalid', code: 'expired' });
    await expect(validateReplacementConfirmationToken({
      token: generated.token, ownerId: 'teacher-1', bookId: 'book-1', plan, review, current, stored: generated.record,
      currentRevisionVector: { book: 2 }, adapterFingerprint: 'd'.repeat(64), now: '2026-08-11T00:02:01.000Z',
    })).resolves.toEqual({ status: 'invalid', code: 'revision-changed' });
  });

  it('fences a valid token when the plan is no longer current', async () => {
    const generated = await createReplacementConfirmationToken({
      ownerId: 'teacher-1', bookId: 'book-1', plan, review, adapterFingerprint: 'd'.repeat(64), now: '2026-08-11T00:02:00.000Z',
      randomValues: (bytes) => { bytes.fill(5); return bytes; },
    });
    await expect(validateReplacementConfirmationToken({
      token: generated.token, ownerId: 'teacher-1', bookId: 'book-1', plan, review,
      current: { ...current, planId: 'plan-2', planFingerprint: 'e'.repeat(64) }, stored: generated.record,
      currentRevisionVector: { book: 1 }, adapterFingerprint: 'd'.repeat(64), now: '2026-08-11T00:02:01.000Z',
    })).resolves.toEqual({ status: 'invalid', code: 'stale-plan' });
  });
});
