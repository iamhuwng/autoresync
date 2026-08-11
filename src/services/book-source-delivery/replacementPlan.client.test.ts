import { describe, expect, it, vi } from 'vitest';
import { createReplacementPlanClient, ReplacementPlanClientError } from './replacementPlan.client';
import type { ReplacementPlanClientCreateRequest, ReplacementPlanRecord } from './replacementPlan.types';

const plan = {
  schemaVersion: 1,
  planId: 'plan-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  planFingerprint: 'a'.repeat(64),
  deltaFingerprint: 'b'.repeat(64),
  impactSnapshotFingerprint: 'c'.repeat(64),
  contexts: [],
  selectedContextKeys: [],
} as unknown as ReplacementPlanRecord;

const request = {
  bookId: 'book-1',
  sourceSetDelta: {},
  currentRevisions: {},
  targetSourceSetRevision: 2,
  capacity: {},
  now: '2026-08-11T00:00:00.000Z',
  snapshotFingerprint: 'c'.repeat(64),
  snapshotRevisionVector: { values: {} },
} as unknown as ReplacementPlanClientCreateRequest;

const response = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

describe('replacement plan client', () => {
  it('accepts an exact plan and confirmation handoff from the bounded route', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ status: 'created', plan }))
      .mockResolvedValueOnce(response({
        status: 'reviewed',
        plan,
        review: {
          schemaVersion: 1, reviewId: 'review-1', planId: plan.planId, ownerId: plan.ownerId, bookId: plan.bookId,
          planFingerprint: plan.planFingerprint, deltaFingerprint: plan.deltaFingerprint,
          snapshotFingerprint: plan.impactSnapshotFingerprint, reviewedAt: request.now, expiresAt: '2099-01-01T00:00:00.000Z', state: 'reviewed',
        },
        handoff: {
          purpose: 'replacement-confirmation', token: 'A'.repeat(43), ownerId: plan.ownerId, bookId: plan.bookId,
          planId: plan.planId, reviewId: 'review-1', planFingerprint: plan.planFingerprint,
          deltaFingerprint: plan.deltaFingerprint, snapshotFingerprint: plan.impactSnapshotFingerprint,
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      }));
    const client = createReplacementPlanClient({ getIdToken: async () => 'identity-token', fetchImpl });
    await expect(client.create({ ...request, idempotencyKey: 'create-1' })).resolves.toEqual(plan);
    await expect(client.review({ bookId: plan.bookId, planId: plan.planId, planFingerprint: plan.planFingerprint, idempotencyKey: 'review-1' }))
      .resolves.toMatchObject({ handoff: { token: 'A'.repeat(43) } });
  });

  it('rejects a handoff that is malformed or scoped to another review', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      status: 'reviewed',
      plan,
      review: {
        schemaVersion: 1, reviewId: 'review-1', planId: plan.planId, ownerId: plan.ownerId, bookId: plan.bookId,
        planFingerprint: plan.planFingerprint, deltaFingerprint: plan.deltaFingerprint,
        snapshotFingerprint: plan.impactSnapshotFingerprint, reviewedAt: request.now, expiresAt: '2099-01-01T00:00:00.000Z', state: 'reviewed',
      },
      handoff: {
        purpose: 'replacement-confirmation', token: 'short', ownerId: plan.ownerId, bookId: plan.bookId,
        planId: plan.planId, reviewId: 'review-other', planFingerprint: plan.planFingerprint,
        deltaFingerprint: plan.deltaFingerprint, snapshotFingerprint: plan.impactSnapshotFingerprint,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    }));
    const client = createReplacementPlanClient({ getIdToken: async () => 'identity-token', fetchImpl });
    await expect(client.review({ bookId: plan.bookId, planId: plan.planId, planFingerprint: plan.planFingerprint, idempotencyKey: 'review-1' }))
      .rejects.toMatchObject<Partial<ReplacementPlanClientError>>({ code: 'malformed-response' });
  });
});
