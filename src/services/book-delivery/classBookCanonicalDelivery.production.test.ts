import { describe, expect, it } from 'vitest';
import { InMemoryBookDeliveryRepository } from './bookDelivery.entitlementRepository';
import type { BookDeliveryPublishedPublicationReference } from './bookDelivery.publication';
import type { ClassBookCopyIdentity, ClassBookPlacement } from './classBookPlacement.types';
import {
  ClassBookDeliveryProductionError,
  createClassBookDeliveryProductionAdapter,
  type ClassBookDeliveryPorts,
} from '../../../cloudflare/src/upload-worker/class-book-placement/production.ts';

const now = '2026-08-08T00:00:00.000Z';
const operation = '11111111-1111-4111-8111-111111111111';

const placement: ClassBookPlacement = {
  schemaVersion: 1,
  classPlacementId: 'placement-1',
  classId: 'class-1',
  copyId: 'copy-1',
  classCourseId: 'class-course-1',
  sourceCourseId: 'course-1',
  courseMaterialId: 'class-material-1',
  sourceCourseMaterialId: 'course-material-1',
  ownerId: 'teacher-1',
  sourcePlacementRevision: 1,
  placementRevision: 1,
  status: 'active',
  pins: {
    bookId: 'book-1', publicationId: 'publication-1', publicationRevision: 2,
    manifestVersionId: 'manifest-1', unitStableKey: 'unit-1', unitVersionId: 'unit-version-1',
    sourceVersionId: 'source-version-1', bindingRevision: 'legacy-binding-1',
  },
  selection: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  activities: [{
    placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-version-1',
    unitStableKey: 'unit-1', unitVersionId: 'unit-version-1', sourceVersionId: 'source-version-1',
    pageGroupId: 'page-group-1', physicalPageNumber: 1, order: 0, title: 'Activity one',
  }],
  sourceFingerprint: 'source-fingerprint',
  title: 'Class Book',
  createdAt: now,
  createdBy: 'teacher-1',
  updatedAt: now,
  updatedBy: 'teacher-1',
};

const copy: ClassBookCopyIdentity = {
  schemaVersion: 1,
  copyId: 'copy-1', classId: 'class-1', classCourseId: 'class-course-1',
  sourceCourseId: 'course-1', sourceCourseMaterialId: 'course-material-1', ownerId: 'teacher-1',
  status: 'active', copyRevision: 1, createdAt: now, createdBy: 'teacher-1', updatedAt: now, updatedBy: 'teacher-1',
};

const publication: BookDeliveryPublishedPublicationReference = {
  bookId: 'book-1', bookMode: 'pdf', bookRevision: 1,
  publicationId: 'publication-1', publicationRevision: 2, publicationStatus: 'published', ownerId: 'teacher-1',
  scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit one' }],
  sourceSet: { strategy: 'full_pdf', sources: [{
    sourceKey: 'source-1', sourceVersionId: 'source-version-1', lifecycle: 'verified-usable',
    localPageScope: { kind: 'all', pages: [] },
  }] },
  placements: [{
    placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-version-1', activityVersion: 1,
    nodeKey: 'unit-1', order: 1, contextMode: 'required', pageGroupKeys: ['page-group-1'],
    sourcePageScopes: [{ sourceKey: 'source-1', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'class-policy', policyRevision: 1, basis: 'immutable-reference' },
};

const setup = () => {
  const repository = new InMemoryBookDeliveryRepository();
  let classRecord: unknown = { createdBy: 'teacher-1', status: 'active' };
  let membership: unknown = { uid: 'student-1', status: 'active' };
  let current: ClassBookPlacement | null = placement;
  const ports: ClassBookDeliveryPorts = {
    readValue: async (path) => path.endsWith('/students/student-1') ? membership : classRecord,
    placements: {
      readCurrent: async () => current,
      readCopy: async () => copy,
      readLock: async () => null,
    },
    deliveryRepository: repository,
    loadPublication: async () => publication,
    now: () => now,
  };
  return {
    adapter: createClassBookDeliveryProductionAdapter(ports),
    setMembership: (value: unknown) => { membership = value; },
    setClass: (value: unknown) => { classRecord = value; },
    setCurrent: (value: ClassBookPlacement | null) => { current = value; },
  };
};

const identity = {
  classId: 'class-1', copyId: 'copy-1', classPlacementId: 'placement-1',
  classCourseMaterialId: 'class-material-1', studentId: 'student-1',
};

describe('canonical Class Book delivery production adapter', () => {
  it('prepares and resolves only canonical runtime projections from exact frozen authority', async () => {
    const { adapter } = setup();
    const prepared = await adapter.prepare({ ...identity, operationId: operation });
    expect(prepared).toMatchObject({
      projectionKind: 'book-runtime-delivery',
      context: {
        kind: 'class', entitlementBasis: 'membership',
        contextId: 'class-class-1-copy-copy-1-material-class-material-1-placement-placement-1',
      },
      book: { publicationId: 'publication-1', publicationRevision: 2 },
    });
    expect(prepared).not.toHaveProperty('binding');
    await expect(adapter.resolve({ ...identity, bindingId: prepared.bindingId })).resolves.toEqual(prepared);
    await expect(adapter.resolve({ ...identity, bindingId: 'forged-binding' }))
      .rejects.toMatchObject({ code: 'class_book_delivery_context_denied' });
  });

  it('fails closed when membership, class status, placement, or frozen publication authority changes', async () => {
    const { adapter, setMembership, setClass, setCurrent } = setup();
    setMembership({ uid: 'student-1', status: 'removed' });
    await expect(adapter.prepare({ ...identity, operationId: operation })).rejects.toMatchObject({ code: 'class_book_enrollment_denied' });
    setMembership({ uid: 'student-1', status: 'active' });
    setClass({ createdBy: 'teacher-1', status: 'archived' });
    await expect(adapter.prepare({ ...identity, operationId: operation })).rejects.toMatchObject({ code: 'class_book_class_unavailable' });
    setClass({ createdBy: 'teacher-1', status: 'active' });
    setCurrent({ ...placement, status: 'superseded' });
    await expect(adapter.prepare({ ...identity, operationId: operation })).rejects.toMatchObject({ code: 'class_book_placement_unavailable' });
  });

  it('does not treat legacy frozen records without the exact publication revision as runnable', async () => {
    const { adapter, setCurrent } = setup();
    setCurrent({ ...placement, pins: { ...placement.pins, publicationRevision: 0 } });
    await expect(adapter.prepare({ ...identity, operationId: operation })).rejects.toBeInstanceOf(ClassBookDeliveryProductionError);
  });
});
