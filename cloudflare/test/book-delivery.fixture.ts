import { createBookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.entitlementFactory';
import { BOOK_DELIVERY_SCHEMA_VERSION } from '../../src/services/book-delivery/bookDelivery.types';
import type { BookAssemblyPublicationScope } from '../../src/services/book-assembly/publicationRepository';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service';

const publication = (): Record<string, unknown> => {
  const placement: Record<string, unknown> = {
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
  };
  if ((BOOK_DELIVERY_SCHEMA_VERSION as number) >= 3) {
    placement.activityVersionId = 'activity-1-v1';
    placement.pageGroupKeys = ['group-1'];
  }
  const value: Record<string, unknown> = {
    bookId: 'book-pdf-1',
    bookMode: 'pdf',
    bookRevision: 3,
    publicationId: 'publication-1',
    publicationRevision: 4,
    publicationStatus: 'published',
    ownerId: 'teacher-1',
    scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
    sourceSet: {
      strategy: 'full_pdf',
      sources: [{
        sourceKey: 'full',
        sourceVersionId: 'source-v1',
        lifecycle: 'verified-usable',
        localPageScope: { kind: 'all', pages: [] },
      }],
    },
    placements: [placement],
    schedulePolicy: { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' },
  };
  if ((BOOK_DELIVERY_SCHEMA_VERSION as number) >= 3) {
    value.outline = [{
      nodeKey: 'unit-1',
      parentNodeKey: null,
      nodeType: 'unit',
      order: 1,
      titleSnapshot: 'Unit 1',
    }];
  }
  return value;
};

export const makeBookDeliveryTestBinding = () => createBookDeliveryBinding({
  bindingId: 'binding-worker',
  revision: 1,
  status: 'draft',
  recipient: { recipientId: 'teacher-1', recipientKind: 'preview-user' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  context: {
    kind: 'preview',
    contextId: 'preview-1',
    recipientId: 'teacher-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'preview',
  },
  publication: publication() as never,
  createdAt: '2026-07-25T00:00:00.000Z',
});

export const makeBookDeliveryIssuanceIntent = () => ({
  bookId: 'book-pdf-1',
  publicationId: 'publication-1',
  publicationRevision: 4,
  recipientId: 'teacher-1',
  contextKind: 'preview',
  contextId: 'preview-1',
  scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
});

export const makeBookAssemblyPublicationScope = (): BookAssemblyPublicationScope<BookAssemblyPublicationResult> => ({
  current: {
    publicationId: 'publication-1',
    publicationRevision: 4,
    manifestVersionId: 'manifest-1',
    bookRevision: 3,
    sourceSetRevision: 2,
    inputFingerprint: 'fingerprint-1',
    updatedAt: '2026-07-25T00:00:00.000Z',
    updatedByCommandId: '00000000-0000-4000-8000-000000000101',
  },
  versions: {
    'manifest-1': {
      schemaVersion: 1,
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 4,
      lifecycle: 'published',
      ownerId: 'teacher-1',
      bookId: 'book-pdf-1',
      bookRevision: 3,
      sourceSetRevision: 2,
      candidateId: 'candidate-1',
      candidateRevision: 5,
      strategy: 'full_pdf',
      adapterTicket: 'fixture',
      inputFingerprint: 'fingerprint-1',
      createdByCommandId: '00000000-0000-4000-8000-000000000101',
      createdAt: '2026-07-25T00:00:00.000Z',
      manifest: {
        bookId: 'book-pdf-1',
        sourceSet: {
          sourceStrategy: 'full_pdf',
          sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
        },
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        units: [{
          unitKey: 'unit-1',
          activitySlots: [{
            activityKey: 'activity-key-1',
            order: 1,
            contextRequirement: 'required',
            pageGroupKeys: ['group-1'],
          }],
          pageGroups: [{
            pageGroupKey: 'group-1',
            sourceKey: 'full',
            pages: [1],
            activityKeys: ['activity-key-1'],
            mode: 'activity',
          }],
        }],
      },
      studentSafeProjection: {
        schemaVersion: 1,
        bookId: 'book-pdf-1',
        publicationId: 'publication-1',
        publicationRevision: 4,
        sourceStrategy: 'full_pdf',
        sourceSet: {
          sourceStrategy: 'full_pdf',
          sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
        },
        units: [{
          unitKey: 'unit-1',
          activitySlots: [{
            activityKey: 'activity-key-1',
            order: 1,
            contextRequirement: 'required',
            pageGroupKeys: ['group-1'],
          }],
          pageGroups: [{
            pageGroupKey: 'group-1',
            sourceKey: 'full',
            pages: [1],
            activityKeys: ['activity-key-1'],
            mode: 'activity',
          }],
        }],
      },
    },
  },
  activityVersions: {
    'activity-1-v1': {
      schemaVersion: 1,
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      activityVersion: 1,
      ownerId: 'teacher-1',
      bookId: 'book-pdf-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 4,
      unitKey: 'unit-1',
      activityKey: 'activity-key-1',
      createdByCommandId: '00000000-0000-4000-8000-000000000101',
      createdAt: '2026-07-25T00:00:00.000Z',
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 1 }],
      payloadFingerprint: 'activity-fingerprint-1',
    },
  },
  activitySafeProjections: {
    'projection-1': {
      schemaVersion: 1,
      projectionId: 'projection-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      ownerId: 'teacher-1',
      bookId: 'book-pdf-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 4,
      placementIds: ['placement-1'],
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 1 }],
      payloadFingerprint: 'projection-fingerprint-1',
    },
  },
  placements: {
    'placement-1': {
      schemaVersion: 1,
      placementId: 'placement-1',
      ownerId: 'teacher-1',
      bookId: 'book-pdf-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 4,
      unitKey: 'unit-1',
      nodeKey: 'unit-1',
      activityKey: 'activity-key-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      order: 1,
      pageGroupKeys: ['group-1'],
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 1 }],
    },
  },
  deliveryPlans: {
    'delivery-plan-1': {
      schemaVersion: 1,
      deliveryPlanId: 'delivery-plan-1',
      ownerId: 'teacher-1',
      bookId: 'book-pdf-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 4,
      sourceStrategy: 'full_pdf',
      sourceSet: {
        sourceStrategy: 'full_pdf',
        sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
      },
      placementIds: ['placement-1'],
      unitProjectionIds: ['unit-projection-1'],
      createdByCommandId: '00000000-0000-4000-8000-000000000101',
      createdAt: '2026-07-25T00:00:00.000Z',
    },
  },
});

export const makeMappingRevisionPublicationScope = (): BookAssemblyPublicationScope<BookAssemblyPublicationResult> => {
  const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
  const version = structuredClone(scope.versions['manifest-1']);
  version.manifestVersionId = 'manifest-2';
  version.publicationId = 'publication-2';
  version.publicationRevision = 5;
  version.inputFingerprint = 'fingerprint-2';
  version.createdByCommandId = '00000000-0000-4000-8000-000000000102';
  version.manifest.units[0].pageGroups[0].pages = [2];
  version.studentSafeProjection.publicationId = 'publication-2';
  version.studentSafeProjection.publicationRevision = 5;
  version.studentSafeProjection.units = structuredClone(version.manifest.units);
  version.mappingRevisionLineage = {
    kind: 'mapping-revision',
    predecessorPublicationId: 'publication-1',
    predecessorManifestVersionId: 'manifest-1',
    predecessorPublicationRevision: 4,
    sourceSetRevision: 2,
    createdByCommandId: '00000000-0000-4000-8000-000000000102',
    createdAt: '2026-07-25T00:01:00.000Z',
    changedPageGroupKeys: ['unit-1:group-1'],
    preservedActivityIds: ['activity-1'],
    preservedActivityVersionIds: ['activity-1-v1'],
  };
  scope.versions['manifest-2'] = version;
  scope.current = {
    ...scope.current,
    publicationId: 'publication-2',
    publicationRevision: 5,
    manifestVersionId: 'manifest-2',
    inputFingerprint: 'fingerprint-2',
    updatedByCommandId: '00000000-0000-4000-8000-000000000102',
  };
  scope.placements['placement-2'] = {
    ...scope.placements['placement-1'],
    placementId: 'placement-2',
    manifestVersionId: 'manifest-2',
    publicationId: 'publication-2',
    publicationRevision: 5,
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 2 }],
    predecessorPlacementId: 'placement-1',
  };
  scope.activitySafeProjections['projection-2'] = {
    ...scope.activitySafeProjections['projection-1'],
    projectionId: 'projection-2',
    manifestVersionId: 'manifest-2',
    publicationId: 'publication-2',
    publicationRevision: 5,
    placementIds: ['placement-2'],
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 2 }],
    payloadFingerprint: 'projection-fingerprint-2',
  };
  scope.deliveryPlans['delivery-plan-2'] = {
    ...scope.deliveryPlans['delivery-plan-1'],
    deliveryPlanId: 'delivery-plan-2',
    manifestVersionId: 'manifest-2',
    publicationId: 'publication-2',
    publicationRevision: 5,
    placementIds: ['placement-2'],
    createdByCommandId: '00000000-0000-4000-8000-000000000102',
  };
  return scope;
};
