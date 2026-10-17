import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolver = vi.hoisted(() => vi.fn());
vi.mock('../src/upload-worker/course-book-placement/production.ts', () => ({
  resolveCurrentCourseBook: resolver,
}));

import { createCourseBookRuntimeSchedulePolicy } from '../src/upload-worker/course-book-placement/runtime-schedule-policy.ts';
import type { BookDeliveryBinding, BookRuntimeDeliveryProjection } from '../../src/services/book-delivery/bookDelivery.types.ts';

const placement = {
  placementId: 'placement-a', activityId: 'activity-a', activityVersionId: 'activity-version-a',
  activityVersion: 1, nodeKey: 'unit-a', order: 1, contextMode: 'required' as const,
  pageGroupKeys: ['pages-a'], sourcePageScopes: [{ sourceKey: 'source-a', pages: [1] }],
};
const binding = {
  schemaVersion: 3, bindingId: 'binding-a', revision: 3, status: 'active',
  recipient: { recipientId: 'student-a', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-a', authorityBoundary: 'book-owner' },
  book: { bookId: 'book-a', bookMode: 'pdf', bookRevision: 1, manifestVersionId: 'manifest-a', publicationId: 'publication-a', publicationRevision: 2, publicationStatus: 'published' },
  scope: { kind: 'placements', nodeKeys: [], placementIds: [placement.placementId] }, outline: [],
  context: { kind: 'course', contextId: 'material-a', recipientId: 'student-a', ownerId: 'teacher-a', entitlementBasis: 'enrollment' },
  sourceSet: { strategy: 'full_pdf', sources: [{ sourceKey: 'source-a', sourceVersionId: 'source-version-a', lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] } }] },
  placements: [placement], schedulePolicy: { policyId: 'course-policy', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-10-01T00:00:00.000Z',
} as unknown as BookDeliveryBinding;
const projection = (): BookRuntimeDeliveryProjection => ({
  schemaVersion: 1, projectionKind: 'book-runtime-delivery', bindingId: binding.bindingId,
  bindingRevision: binding.revision, recipientId: 'student-a',
  context: { contextId: 'material-a', kind: 'course', entitlementBasis: 'enrollment' },
  book: binding.book, scope: binding.scope, outline: [], sourceSet: binding.sourceSet,
  documentRequests: [{ sourceKey: 'source-a', sourceVersionId: 'source-version-a', opaqueRouteKey: 'opaque', localPageScope: { kind: 'all', pages: [] } }],
  pageGroups: [], activities: [{
    placementId: placement.placementId, activityId: placement.activityId,
    activityVersion: placement.activityVersion, activityVersionId: placement.activityVersionId,
    nodeKey: placement.nodeKey, order: placement.order, contextMode: placement.contextMode,
    sourceContext: { available: true, description: 'Source document.', pageGroupKeys: placement.pageGroupKeys, sourcePageScopes: placement.sourcePageScopes },
  }],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: { publicationId: binding.book.publicationId, publicationRevision: binding.book.publicationRevision, bindingId: binding.bindingId, bindingRevision: binding.revision },
});

describe('Course Runtime schedule policy', () => {
  beforeEach(() => resolver.mockReset());

  it('re-resolves current Course authority and accepts the producer projection', async () => {
    resolver.mockResolvedValue(projection());
    const policy = createCourseBookRuntimeSchedulePolicy({});
    await expect(policy.authorize({
      operation: 'submit', actorUid: 'student-a', binding, target: {
        placementId: placement.placementId, activityId: placement.activityId,
        activityVersion: placement.activityVersion, interactionId: 'interaction-a',
      }, now: '2026-10-01T00:00:00.000Z',
    })).resolves.toEqual({ outcome: 'allowed' });
    expect(resolver).toHaveBeenCalledWith({}, 'student-a', 'material-a');
  });

  it('rejects a stale publication and targets outside the binding', async () => {
    resolver.mockResolvedValue({ ...projection(), book: { ...binding.book, publicationRevision: 3 } });
    const policy = createCourseBookRuntimeSchedulePolicy({});
    const input = {
      operation: 'state' as const, actorUid: 'student-a', binding,
      target: { placementId: placement.placementId, activityId: placement.activityId, activityVersion: 1, interactionId: 'interaction-a' },
      now: '2026-10-01T00:00:00.000Z',
    };
    await expect(policy.authorize(input)).resolves.toEqual({ outcome: 'conflict', code: 'runtime_course_delivery_stale' });
    await expect(policy.authorize({ ...input, target: { ...input.target, activityVersion: 2 } }))
      .resolves.toEqual({ outcome: 'denied', code: 'runtime_course_placement_stale' });
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
