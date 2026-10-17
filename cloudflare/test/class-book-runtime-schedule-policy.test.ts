import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolver = vi.hoisted(() => vi.fn());
vi.mock('../src/upload-worker/class-book-placement/production.ts', () => ({
  resolveCurrentClassBookDelivery: resolver,
}));

import { createClassBookRuntimeSchedulePolicy } from '../src/upload-worker/class-book-placement/runtime-schedule-policy.ts';
import { classBookBindingContextId } from '../../src/services/book-delivery/classBookPlacement.types.ts';
import type { BookDeliveryBinding, BookRuntimeDeliveryProjection } from '../../src/services/book-delivery/bookDelivery.types.ts';
import { validateBookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.schema.ts';

const locator = { classId: 'class-a-b', copyId: 'copy-c-d', classPlacementId: 'placement-e-f', courseMaterialId: 'material-g-h' };
const contextId = classBookBindingContextId(locator.classId, locator.copyId, locator.courseMaterialId, locator.classPlacementId);
const placement = {
  placementId: 'activity-placement', activityId: 'activity-a', activityVersionId: 'activity-version-a',
  activityVersion: 1, nodeKey: 'unit-a', order: 1, contextMode: 'required' as const,
  pageGroupKeys: ['pages-a'], sourcePageScopes: [{ sourceKey: 'component-a', pages: [1] }],
};
const binding = {
  schemaVersion: 3, bindingId: 'binding-a', revision: 4, status: 'active',
  recipient: { recipientId: 'student-a', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-a', authorityBoundary: 'book-owner' },
  book: { bookId: 'book-a', bookMode: 'pdf', bookRevision: 1, manifestVersionId: 'manifest-a', publicationId: 'publication-a', publicationRevision: 2, publicationStatus: 'published' },
  scope: { kind: 'placements', nodeKeys: [], placementIds: [placement.placementId] },
  outline: [{ nodeKey: 'unit-a', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  context: { kind: 'class', contextId, recipientId: 'student-a', ownerId: 'teacher-a', entitlementBasis: 'membership', classLocator: locator },
  sourceSet: { strategy: 'component_pdfs', sources: [{ sourceKey: 'component-a', sourceVersionId: 'source-a', lifecycle: 'verified-usable', sourceOrder: 1, ownerNodeKey: 'unit-a', localPageScope: { kind: 'all', pages: [] } }] },
  placements: [placement], schedulePolicy: { policyId: 'class-policy', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-10-01T00:00:00.000Z',
} as unknown as BookDeliveryBinding;
const projection = (): BookRuntimeDeliveryProjection => ({
  schemaVersion: 1, projectionKind: 'book-runtime-delivery', bindingId: binding.bindingId,
  bindingRevision: binding.revision, recipientId: 'student-a',
  context: { contextId, kind: 'class', entitlementBasis: 'membership' },
  book: binding.book, scope: binding.scope, outline: [],
  sourceSet: { strategy: 'component_pdfs', sources: [] },
  documentRequests: [{ opaqueRouteKey: 'opaque', expectedByteLength: 100 }], pageGroups: [],
  activities: [{
    placementId: placement.placementId, activityId: placement.activityId,
    activityVersion: placement.activityVersion, activityVersionId: placement.activityVersionId,
    nodeKey: placement.nodeKey, order: placement.order, contextMode: placement.contextMode,
    sourceContext: { available: false, description: 'Combined student document.', pageGroupKeys: placement.pageGroupKeys, sourcePageScopes: [] },
  }],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: { publicationId: binding.book.publicationId, publicationRevision: binding.book.publicationRevision, bindingId: binding.bindingId, bindingRevision: binding.revision },
});

describe('Class Runtime schedule policy', () => {
  beforeEach(() => resolver.mockReset());

  it('accepts only a typed locator that recomputes the full context ID', () => {
    expect(validateBookDeliveryBinding(binding)).toMatchObject({ valid: true, errors: [] });
    const wrongLocator = {
      ...binding, context: { ...binding.context, classLocator: { ...locator, classPlacementId: 'wrong-placement' } },
    };
    expect(validateBookDeliveryBinding(wrongLocator).valid).toBe(false);
  });

  it('resolves current Class authority and accepts the combined-document projection shape', async () => {
    resolver.mockResolvedValue(projection());
    const policy = createClassBookRuntimeSchedulePolicy({});
    await expect(policy.authorize({
      operation: 'submit', actorUid: 'student-a', binding, target: {
        placementId: placement.placementId, activityId: placement.activityId,
        activityVersion: placement.activityVersion, interactionId: 'interaction-a',
      }, now: '2026-10-01T00:00:00.000Z',
    })).resolves.toEqual({ outcome: 'allowed' });
    expect(resolver).toHaveBeenCalledWith({}, expect.objectContaining({
      classId: locator.classId, copyId: locator.copyId,
      classPlacementId: locator.classPlacementId, classCourseMaterialId: locator.courseMaterialId,
      studentId: 'student-a', bindingId: 'binding-a',
    }));
  });

  it('fails closed for a stale current publication and an out-of-binding target', async () => {
    resolver.mockResolvedValue({ ...projection(), book: { ...binding.book, publicationRevision: 3 } });
    const policy = createClassBookRuntimeSchedulePolicy({});
    const input = {
      operation: 'state' as const, actorUid: 'student-a', binding,
      target: { placementId: placement.placementId, activityId: placement.activityId, activityVersion: 1, interactionId: 'interaction-a' },
      now: '2026-10-01T00:00:00.000Z',
    };
    await expect(policy.authorize(input)).resolves.toEqual({ outcome: 'conflict', code: 'runtime_class_delivery_stale' });
    await expect(policy.authorize({ ...input, target: { ...input.target, placementId: 'other' } }))
      .resolves.toEqual({ outcome: 'denied', code: 'runtime_class_placement_stale' });
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
