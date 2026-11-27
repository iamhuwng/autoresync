import { describe, expect, it, vi } from 'vitest';
import { InMemoryBookAssemblyPublicationRepository } from '../../src/services/book-assembly/publicationRepository';
import { bookAssemblyActivityVersionScopeKey } from '../../src/services/book-assembly/publicationTransaction.service';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import { BOOK_DELIVERY_SCHEMA_VERSION } from '../../src/services/book-delivery/bookDelivery.types';
import fragment08B from '../src/upload-worker/book-rules/fragments/08B.json';
import {
  BookDeliveryWorkerError,
  createBookDeliveryWorkerHandlers,
  createTrustedBookDeliveryPublication,
  resolveScopedComponentStudentPageGroups,
} from '../src/upload-worker/book-delivery/worker';
import {
  createBookSourceDocumentAuthorityReader,
  createBookSourceDocumentDeliveryHandler,
} from '../src/upload-worker/book-source/document';
import { createComponentStudentDocument } from '../../src/services/book-assembly/componentStudentDocument.types';
import {
  makeBookAssemblyPublicationScope,
  makeBookDeliveryIssuanceIntent,
  makeBookDeliveryTestBinding,
  makeMappingRevisionPublicationScope,
} from './book-delivery.fixture';

const operation = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const env = {
  BOOK_DELIVERY_SERVICE_IDENTITY: 'book-delivery@example.iam.gserviceaccount.com',
  readDatabaseValue: async () => ({ role: 'teacher', status: 'active' }),
} as any;

const request = (value: unknown) => new Request('https://worker.test/book-delivery/create', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

const setup = (
  allocateBindingId: (operationId: string) => string = () => 'binding-worker',
  publicationScope = makeBookAssemblyPublicationScope(),
) => {
  const repository = new InMemoryBookDeliveryRepository();
  const publicationRepository = new InMemoryBookAssemblyPublicationRepository({
    'book-pdf-1': publicationScope,
  });
  const handlers = createBookDeliveryWorkerHandlers({
    repository: repository as any,
    publicationRepository,
    allocateBindingId,
    now: () => '2026-07-25T00:00:00.000Z',
  });
  return { handlers, repository };
};

const makeComponentPlacementScope = () => {
  const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
  const version = scope.versions['manifest-1'];
  version.strategy = 'component_pdfs';
  version.manifest.sourceSet = {
    sourceStrategy: 'component_pdfs',
    sources: [
      { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
    ],
  };
  scope.deliveryPlans['delivery-plan-1'].sourceStrategy = 'component_pdfs';
  scope.deliveryPlans['delivery-plan-1'].sourceSet = structuredClone(version.manifest.sourceSet);
  version.manifest.units[0].pageGroups[0].sourceKey = 'component-a';
  scope.placements['placement-1'].sourcePages = [
    { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', physicalPageNumber: 1 },
  ];
  scope.activityVersions['activity-1-v1'].sourcePages = [
    { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', physicalPageNumber: 1 },
  ];
  scope.activitySafeProjections['projection-1'].sourcePages = [
    { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', physicalPageNumber: 1 },
  ];
  return scope;
};

describe('Book Delivery Worker contract', () => {
  it('requires the strict active owner authority profile and permits an active owner super-admin', async () => {
    const deniedProfiles: readonly unknown[] = [
      undefined,
      null,
      [],
      { role: 'teacher' },
      { role: 'student', status: 'active' },
      { role: 'teacher', status: 'inactive' },
      { role: 'teacher', status: 'blocked' },
      { role: 'teacher', status: 'suspended' },
      { role: 'teacher', status: 'active', disabled: true },
      { role: 'teacher', status: 'active', forceReauth: true },
      { role: 'teacher', status: 'active', privilegedAuthorityRevokedAt: '2026-07-25T00:00:00.000Z' },
      { role: 'teacher', status: 'ACTIVE' },
    ];
    for (const profile of deniedProfiles) {
      const { handlers } = setup();
      await expect(handlers.create({
        env: { ...env, readDatabaseValue: async () => profile },
        uid: 'teacher-1',
        request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(30) }),
      })).resolves.toEqual({ body: { status: 'forbidden' }, init: { status: 403 } });
    }

    const { handlers } = setup();
    await expect(handlers.create({
      env: { ...env, readDatabaseValue: async () => ({ role: 'super_admin', status: 'active' }) },
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(31) }),
    })).resolves.toMatchObject({ init: { status: 200 }, body: { status: 'created' } });
  });
  it('owns every 08B fragment operation and no #72 scope path', () => {
    expect([...fragment08B.owner.generatedRuleLocations].sort()).toEqual(
      fragment08B.operations.map((operation) => `${operation.path}/${operation.rule}`).sort(),
    );
    expect(fragment08B.owner.generatedRuleLocations.every((location) => (
      !location.startsWith('book_delivery/scopes/')
      && !location.startsWith('book_delivery/indexes/bindings/')
    ))).toBe(true);
  });

  it('hydrates trusted publication state, allocates the binding, and resolves it', async () => {
    const { handlers } = setup();
    const create = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(1) }),
    });
    expect(create.init.status).toBe(200);
    expect(create.body).toMatchObject({
      status: 'created',
      record: {
        binding: {
          bindingId: 'binding-worker',
          book: {
            publicationId: 'publication-1',
            manifestVersionId: 'manifest-1',
            publicationRevision: 4,
          },
          issuer: { ownerId: 'teacher-1' },
          scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
          schedulePolicy: {
            policyId: 'preview:preview-1',
            policyRevision: 1,
            basis: 'immutable-reference',
          },
          sourceSet: {
            strategy: 'full_pdf',
            sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1' }],
          },
          placements: [{
            placementId: 'placement-1',
            activityId: 'activity-1',
            activityVersion: 1,
          }],
        },
      },
    });

    const activate = await handlers.activate({
      env,
      uid: 'teacher-1',
      request: request({
        bindingId: 'binding-worker',
        expectedRecordRevision: 0,
        operationId: operation(2),
      }),
    });
    expect(activate.init.status).toBe(200);
    const resolved = await handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(resolved.init.status).toBe(200);
    expect(resolved.body).toMatchObject({
      projectionKind: 'book-runtime-delivery',
      bindingId: 'binding-worker',
      recipientId: 'teacher-1',
      book: { publicationId: 'publication-1', publicationStatus: 'published' },
      provenance: {
        publicationId: 'publication-1',
        publicationRevision: 4,
        bindingId: 'binding-worker',
        bindingRevision: 1,
      },
    });
    if ((BOOK_DELIVERY_SCHEMA_VERSION as number) >= 3) {
      expect(resolved.body).toMatchObject({
        outline: [{ nodeKey: 'unit-1', nodeType: 'unit' }],
        activities: [{
          placementId: 'placement-1',
          activityVersionId: 'activity-1-v1',
          sourceContext: { pageGroupKeys: ['group-1'] },
        }],
      });
    }
    expect(JSON.stringify(resolved.body)).not.toMatch(
      /answerKey|teacherNotes|objectKey|credentials|providerAuthority|private/iu,
    );
    const repeated = await handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(repeated).toEqual(resolved);
    const revoked = await handlers.revoke({
      env,
      uid: 'teacher-1',
      request: request({
        bindingId: 'binding-worker',
        expectedRecordRevision: 1,
        expectedCurrentBindingId: 'binding-worker',
        operationId: operation(25),
      }),
    });
    expect(revoked).toMatchObject({ init: { status: 200 }, body: { status: 'revoked' } });
    await expect(handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    })).resolves.toEqual({
      body: { code: 'book-delivery-not-found' },
      init: { status: 404 },
    });
  });

  it('accepts composite activity-version keys and semantically equivalent insertion order', () => {
    const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
    const activityVersion = scope.activityVersions['activity-1-v1'];
    delete scope.activityVersions['activity-1-v1'];
    scope.activityVersions[bookAssemblyActivityVersionScopeKey('manifest-1', 'activity-1-v1')] = {
      ...activityVersion,
      sourcePages: [{ physicalPageNumber: 1, sourceVersionId: 'source-v1', sourceKey: 'full' }],
    };
    scope.versions['manifest-1'].manifest.sourceSet = {
      sources: [{ sourceOrder: 1, sourceVersionId: 'source-v1', sourceKey: 'full' }],
      sourceStrategy: 'full_pdf',
    };
    scope.deliveryPlans['delivery-plan-1'].sourceSet = {
      sources: [{ sourceVersionId: 'source-v1', sourceKey: 'full', sourceOrder: 1 }],
      sourceStrategy: 'full_pdf',
    };
    scope.placements['placement-1'].sourcePages = [{
      physicalPageNumber: 1,
      sourceVersionId: 'source-v1',
      sourceKey: 'full',
    }];
    scope.activitySafeProjections['projection-1'].sourcePages = [{
      physicalPageNumber: 1,
      sourceVersionId: 'source-v1',
      sourceKey: 'full',
    }];

    expect(createTrustedBookDeliveryPublication(
      makeBookDeliveryIssuanceIntent(),
      scope,
      { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' },
    )).toMatchObject({
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      placements: [{ activityVersionId: 'activity-1-v1', sourcePageScopes: [{ sourceKey: 'full', pages: [1] }] }],
    });
  });

  it('accepts a preserved Activity Version stored under a composite key', () => {
    const scope = makeMappingRevisionPublicationScope() as any;
    const activityVersion = scope.activityVersions['activity-1-v1'];
    delete scope.activityVersions['activity-1-v1'];
    scope.activityVersions[bookAssemblyActivityVersionScopeKey('manifest-1', 'activity-1-v1')] = activityVersion;

    expect(createTrustedBookDeliveryPublication(
      {
        ...makeBookDeliveryIssuanceIntent(),
        publicationId: 'publication-2',
        publicationRevision: 5,
      },
      scope,
      { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' },
    )).toMatchObject({
      manifestVersionId: 'manifest-2',
      publicationId: 'publication-2',
      placements: [{ activityVersionId: 'activity-1-v1', activityVersion: 1 }],
    });
  });

  it.each([
    ['malformed activity version', (scope: any) => { scope.activityVersions['activity-1-v1'].activityVersionId = ''; }],
    ['wrong manifest', (scope: any) => { scope.activityVersions['activity-1-v1'].manifestVersionId = 'manifest-other'; }],
  ])('rejects %s activity-version state', (_label, corrupt) => {
    const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
    let error: unknown;
    corrupt(scope);
    try {
      createTrustedBookDeliveryPublication(
        makeBookDeliveryIssuanceIntent(),
        scope,
        { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BookDeliveryWorkerError);
    expect(error).toMatchObject({ code: 'book_delivery_activity_version_invalid' });
  });

  it('keeps placement-scoped component delivery limited to selected source keys', async () => {
    const { handlers } = setup(() => 'binding-component-placement', makeComponentPlacementScope());
    const created = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: {
          ...makeBookDeliveryIssuanceIntent(),
          scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
        },
        operationId: operation(26),
      }),
    });
    expect(created.init.status).toBe(200);
    expect(created.body).toMatchObject({
      record: {
        binding: {
          sourceSet: {
            strategy: 'component_pdfs',
            sources: [{ sourceKey: 'component-a', sourceVersionId: 'source-a-v1', ownerNodeKey: 'unit-1' }],
          },
        },
      },
    });
    expect(JSON.stringify(created.body)).not.toContain('component-b');
  });

  it('resolves a component binding to one source-free student document request', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const publicationRepository = new InMemoryBookAssemblyPublicationRepository({
      'book-pdf-1': makeComponentPlacementScope(),
    });
    const expectedEtag = `"${'a'.repeat(64)}"`;
    const resolveStudentDocument = vi.fn(async () => ({ expectedByteLength: 578, expectedEtag, physicalPageCount: 4,
      pageGroups: [{ pageGroupKey: 'group-1', combinedPhysicalPages: [1] }] }));
    const handlers = createBookDeliveryWorkerHandlers({
      repository: repository as any, publicationRepository, resolveStudentDocument,
      allocateBindingId: () => `bd_${'d'.repeat(40)}`,
      now: () => '2026-07-25T00:00:00.000Z',
    });
    const created = await handlers.create({
      env, uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(71) }),
    });
    expect(created.init.status).toBe(200);
    const activated = await handlers.activate({
      env, uid: 'teacher-1',
      request: request({ bindingId: `bd_${'d'.repeat(40)}`, expectedRecordRevision: 0, operationId: operation(72) }),
    });
    expect(activated.init.status).toBe(200);
    const resolved = await handlers.resolve({ env, uid: 'teacher-1', recipientId: 'teacher-1', contextId: 'preview-1' });
    expect(resolved.init.status).toBe(200);
    expect(resolved.body).toMatchObject({ documentRequests: [{
      opaqueRouteKey: `bd_${'d'.repeat(40)}-1-student-document`, expectedByteLength: 578,
      expectedEtag,
    }] });
    expect((resolved.body as any).documentRequests).toHaveLength(1);
    expect((resolved.body as any).pageGroups).toEqual([{ pageGroupKey: 'group-1', combinedPhysicalPages: [1] }]);
    expect(JSON.stringify(resolved.body)).not.toMatch(/component-a|source-a-v1|component-b|source-b-v1|providerObjectKey|checksum/iu);
    expect(resolveStudentDocument).toHaveBeenCalledTimes(1);
  });

  it('derives stable collision-resistant IDs from operation identity and replays safely', async () => {
    const repository = new InMemoryBookDeliveryRepository();
    const publicationRepository = new InMemoryBookAssemblyPublicationRepository({
      'book-pdf-1': makeBookAssemblyPublicationScope(),
    });
    let clockMinute = 0;
    const handlers = createBookDeliveryWorkerHandlers({
      repository: repository as any,
      publicationRepository,
      now: () => `2026-07-25T00:0${clockMinute++}:00.000Z`,
    });
    const first = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(3) }),
    });
    const replay = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(3) }),
    });
    const crossActionReplay = await handlers.activate({
      env,
      uid: 'teacher-1',
      request: request({
        bindingId: (first.body as any).record.binding.bindingId,
        expectedRecordRevision: 0,
        operationId: operation(3),
      }),
    });
    const replayConflict = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: { ...makeBookDeliveryIssuanceIntent(), contextId: 'preview-conflict' },
        operationId: operation(3),
      }),
    });
    const second = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: { ...makeBookDeliveryIssuanceIntent(), contextId: 'preview-2' },
        operationId: operation(4),
      }),
    });
    const firstId = (first.body as any).record.binding.bindingId;
    const secondId = (second.body as any).record.binding.bindingId;
    expect(firstId).toMatch(/^bd_[0-9a-f]{40}$/u);
    expect(secondId).toMatch(/^bd_[0-9a-f]{40}$/u);
    expect(secondId).not.toBe(firstId);
    expect(replay.body).toMatchObject({ status: 'replayed', receipt: { bindingId: firstId } });
    expect(crossActionReplay.body).toMatchObject({ status: 'idempotency-conflict' });
    expect(replayConflict.body).toMatchObject({ status: 'idempotency-conflict' });

    const collisionHandlers = setup(() => 'forced-binding-collision').handlers;
    const collisionFirst = await collisionHandlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(18) }),
    });
    const collisionSecond = await collisionHandlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: { ...makeBookDeliveryIssuanceIntent(), contextId: 'preview-collision' },
        operationId: operation(19),
      }),
    });
    expect(collisionFirst.body).toMatchObject({ status: 'created' });
    expect(collisionSecond.body).toMatchObject({ status: 'conflict' });
  });

  it('rejects caller-authored binding and publication authority fields', async () => {
    const { handlers } = setup();
    const directBinding = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({ binding: makeBookDeliveryTestBinding(), operationId: operation(5) }),
    });
    expect(directBinding).toEqual({
      body: { code: 'invalid_request' },
      init: { status: 400 },
    });

    const forged = {
      ...makeBookDeliveryIssuanceIntent(),
      publication: { ownerId: 'teacher-1' },
      sourceSet: { strategy: 'full_pdf', sources: [] },
      outline: [],
      placements: [],
    };
    const forgedCreate = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: forged, operationId: operation(6) }),
    });
    const forgedSupersede = await handlers.supersede({
      env,
      uid: 'teacher-1',
      request: request({
        intent: forged,
        expectedCurrentBindingId: 'binding-worker',
        operationId: operation(7),
      }),
    });
    expect(forgedCreate).toEqual({
      body: { code: 'invalid_request' },
      init: { status: 400 },
    });
    expect(forgedSupersede).toEqual(forgedCreate);

    const forgedSchedule = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: {
          ...makeBookDeliveryIssuanceIntent(),
          schedulePolicy: {
            policyId: 'forged-policy',
            policyRevision: 999,
            basis: 'immutable-reference',
          },
        },
        operationId: operation(20),
      }),
    });
    expect(forgedSchedule).toEqual(forgedCreate);
  });

  it('rejects cross-family Source Version and Page Group drift in durable publication state', async () => {
    const sourceDrift = structuredClone(makeBookAssemblyPublicationScope()) as any;
    sourceDrift.placements['placement-1'].sourcePages[0].sourceVersionId = 'forged-source-v9';
    const sourceHandlers = setup(() => 'binding-source-drift', sourceDrift).handlers;
    const sourceRejected = await sourceHandlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(8) }),
    });
    expect(sourceRejected).toEqual({
      body: { code: 'book_delivery_activity_version_invalid' },
      init: { status: 409 },
    });

    const groupDrift = structuredClone(makeBookAssemblyPublicationScope()) as any;
    groupDrift.placements['placement-1'].pageGroupKeys = ['forged-group'];
    const groupHandlers = setup(() => 'binding-group-drift', groupDrift).handlers;
    const groupRejected = await groupHandlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(9) }),
    });
    expect(groupRejected).toEqual(sourceRejected);

    const activityDrift = structuredClone(makeBookAssemblyPublicationScope()) as any;
    activityDrift.activityVersions['activity-1-v1'].sourcePages[0].physicalPageNumber = 2;
    const activityHandlers = setup(() => 'binding-activity-drift', activityDrift).handlers;
    const activityRejected = await activityHandlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(21) }),
    });
    expect(activityRejected).toEqual(sourceRejected);
  });

  it('issues from a mapping revision that reuses an immutable Activity Version', async () => {
    const { handlers } = setup(() => 'binding-mapping-revision', makeMappingRevisionPublicationScope());
    const created = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: {
          ...makeBookDeliveryIssuanceIntent(),
          publicationId: 'publication-2',
          publicationRevision: 5,
        },
        operationId: operation(22),
      }),
    });
    expect(created.body).toMatchObject({
      status: 'created',
      record: {
        binding: {
          book: { publicationId: 'publication-2', publicationRevision: 5 },
          placements: [{
            placementId: 'placement-2',
            activityId: 'activity-1',
            activityVersion: 1,
          }],
        },
      },
    });

    const unrelated = structuredClone(makeMappingRevisionPublicationScope()) as any;
    unrelated.activityVersions['activity-1-v1'].manifestVersionId = 'manifest-unrelated';
    unrelated.activityVersions['activity-1-v1'].publicationId = 'publication-unrelated';
    unrelated.activityVersions['activity-1-v1'].publicationRevision = 1;
    const unrelatedHandlers = setup(() => 'binding-unrelated-history', unrelated).handlers;
    await expect(unrelatedHandlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: {
          ...makeBookDeliveryIssuanceIntent(),
          publicationId: 'publication-2',
          publicationRevision: 5,
        },
        operationId: operation(23),
      }),
    })).resolves.toEqual({
      body: { code: 'book_delivery_activity_version_invalid' },
      init: { status: 409 },
    });

    const corruptions = [
      (scope: any) => { scope.versions['manifest-1'].lifecycle = 'draft'; },
      (scope: any) => { scope.versions['manifest-1'].manifestVersionId = 'manifest-tampered'; },
      (scope: any) => {
        scope.versions['manifest-1'].sourceSetRevision = 3;
        scope.versions['manifest-2'].mappingRevisionLineage.sourceSetRevision = 3;
      },
    ];
    for (const [index, corrupt] of corruptions.entries()) {
      const corrupted = structuredClone(makeMappingRevisionPublicationScope()) as any;
      corrupt(corrupted);
      const corruptedHandlers = setup(() => `binding-corrupt-chain-${index}`, corrupted).handlers;
      const rejected = await corruptedHandlers.create({
        env,
        uid: 'teacher-1',
        request: request({
          intent: {
            ...makeBookDeliveryIssuanceIntent(),
            publicationId: 'publication-2',
            publicationRevision: 5,
          },
          operationId: operation(24 + index),
        }),
      });
      expect(rejected).toEqual({
        body: { code: 'book_delivery_activity_version_invalid' },
        init: { status: 409 },
      });
    }
  });

  it('fails closed for stale publication, foreign scope, unsupported context, and forged recipient', async () => {
    const { handlers } = setup();
    const stale = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: { ...makeBookDeliveryIssuanceIntent(), publicationRevision: 3 },
        operationId: operation(10),
      }),
    });
    expect(stale).toEqual({
      body: { code: 'book_delivery_publication_stale' },
      init: { status: 409 },
    });

    const foreignScope = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: {
          ...makeBookDeliveryIssuanceIntent(),
          scope: { kind: 'subtree', nodeKeys: ['foreign-unit'], placementIds: [] },
        },
        operationId: operation(11),
      }),
    });
    expect(foreignScope).toEqual({
      body: { code: 'book_delivery_scope_invalid' },
      init: { status: 409 },
    });

    const future = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: { ...makeBookDeliveryIssuanceIntent(), contextKind: 'future_live' },
        operationId: operation(12),
      }),
    });
    expect(future).toEqual({
      body: { code: 'invalid_issuance_intent' },
      init: { status: 400 },
    });

    const forgedRecipient = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: { ...makeBookDeliveryIssuanceIntent(), recipientId: 'other-student' },
        operationId: operation(13),
      }),
    });
    const unsupportedAdapter = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: {
          ...makeBookDeliveryIssuanceIntent(),
          recipientId: 'student-1',
          contextKind: 'homework',
          contextId: 'homework-1',
        },
        operationId: operation(14),
      }),
    });
    expect(forgedRecipient).toEqual({
      body: { status: 'forbidden' },
      init: { status: 403 },
    });
    expect(unsupportedAdapter).toEqual(forgedRecipient);

    const forbidden = await handlers.create({
      env,
      uid: 'other-teacher',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(15) }),
    });
    expect(forbidden).toEqual({
      body: { status: 'forbidden' },
      init: { status: 403 },
    });
  });

  it('bounds payloads and denies cross-recipient or missing projections', async () => {
    const { handlers } = setup();
    const oversized = await handlers.create({
      env,
      uid: 'teacher-1',
      request: new Request('https://worker.test/book-delivery/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(300 * 1024) },
        body: '{}',
      }),
    });
    expect(oversized.init.status).toBe(413);

    await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(16) }),
    });
    await handlers.activate({
      env,
      uid: 'teacher-1',
      request: request({
        bindingId: 'binding-worker',
        expectedRecordRevision: 0,
        operationId: operation(17),
      }),
    });
    await expect(handlers.resolve({
      env,
      uid: 'other-student',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    })).resolves.toEqual({
      body: { code: 'book-delivery-forbidden' },
      init: { status: 403 },
    });
    await expect(handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'missing-context',
    })).resolves.toEqual({
      body: { code: 'book-delivery-not-found' },
      init: { status: 404 },
    });
  });

  it('scopes Component-PDF student pageGroups strictly to assigned placements and excludes unassigned units, reference_only, and teacher_only groups', () => {
    const descriptor = createComponentStudentDocument({
      sourceVersionId: 'student-doc-v1',
      descriptorRevision: 1,
      sha256Hex: 'a'.repeat(64),
      byteSize: 1024,
      physicalPageCount: 6,
      compositionFingerprint: 'comp-fp-1',
      components: [
        { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1', localPageCount: 3, combinedStartPage: 1, combinedEndPage: 3 },
        { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'unit-2', localPageCount: 3, combinedStartPage: 4, combinedEndPage: 6 },
      ],
    });
    const activation = {
      unitCandidates: [
        { unitKey: 'unit-1', candidateId: 'cand-u1', candidateRevision: 1, manifestFingerprint: 'fp-u1' },
        { unitKey: 'unit-2', candidateId: 'cand-u2', candidateRevision: 1, manifestFingerprint: 'fp-u2' },
      ],
      activities: [
        { unitKey: 'unit-1', activityKey: 'u1-a1', activityId: 'act-u1-a1', activityCandidateId: 'ac-1', activityCandidateRevision: 1, activityPayloadFingerprint: 'ap-1' },
        { unitKey: 'unit-1', activityKey: 'u1-a2', activityId: 'act-u1-a2', activityCandidateId: 'ac-2', activityCandidateRevision: 1, activityPayloadFingerprint: 'ap-2' },
        { unitKey: 'unit-2', activityKey: 'u2-a1', activityId: 'act-u2-a1', activityCandidateId: 'ac-3', activityCandidateRevision: 1, activityPayloadFingerprint: 'ap-3' },
      ],
    } as any;
    const candidatesByUnit = new Map<string, any>([
      ['unit-1', {
        candidateId: 'cand-u1',
        manifest: {
          units: [{
            unitKey: 'unit-1',
            activitySlots: [
              { activityKey: 'u1-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['u1-g1'] },
              { activityKey: 'u1-a2', order: 2, contextRequirement: 'required', pageGroupKeys: ['u1-g2'] },
            ],
            pageGroups: [
              { pageGroupKey: 'u1-g1', sourceKey: 'component-a', pages: [1], activityKeys: ['u1-a1'], mode: 'activity' },
              { pageGroupKey: 'u1-g2', sourceKey: 'component-a', pages: [2], activityKeys: ['u1-a2'], mode: 'activity' },
              { pageGroupKey: 'u1-ref', sourceKey: 'component-a', pages: [3], activityKeys: [], mode: 'reference_only' },
              { pageGroupKey: 'u1-answer-key', sourceKey: 'component-a', pages: [3], activityKeys: [], mode: 'teacher_only' },
            ],
          }],
        },
      }],
      ['unit-2', {
        candidateId: 'cand-u2',
        manifest: {
          units: [{
            unitKey: 'unit-2',
            activitySlots: [
              { activityKey: 'u2-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['u2-g1'] },
            ],
            pageGroups: [
              { pageGroupKey: 'u2-g1', sourceKey: 'component-b', pages: [2], activityKeys: ['u2-a1'], mode: 'activity' },
            ],
          }],
        },
      }],
    ]);
    const assignedBinding = {
      ...makeBookDeliveryTestBinding(),
      sourceSet: {
        strategy: 'component_pdfs' as const,
        sources: [{ sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1', lifecycle: 'verified-usable' as const, localPageScope: { kind: 'all' as const, pages: [] } }],
      },
      placements: [{
        placementId: 'placement-u1-a1',
        activityId: 'act-u1-a1',
        activityVersionId: 'act-u1-a1-v1',
        activityVersion: 1,
        nodeKey: 'unit-1',
        order: 1,
        contextMode: 'required' as const,
        pageGroupKeys: ['u1-g1'],
        sourcePageScopes: [{ sourceKey: 'component-a', pages: [1] }],
      }],
    };
    const projected = resolveScopedComponentStudentPageGroups({
      binding: assignedBinding as any,
      activation,
      descriptor,
      candidatesByUnit,
    });
    expect(projected).toEqual([{ pageGroupKey: 'u1-g1', combinedPhysicalPages: [1] }]);

    // Rejects any placement referencing a teacher_only pageGroup
    const tampered = {
      ...assignedBinding,
      placements: [{
        ...assignedBinding.placements[0]!,
        pageGroupKeys: ['u1-answer-key'],
        sourcePageScopes: [{ sourceKey: 'component-a', pages: [3] }],
      }],
    };
    expect(resolveScopedComponentStudentPageGroups({
      binding: tampered as any,
      activation,
      descriptor,
      candidatesByUnit,
    })).toBeNull();
  });

  it('selects the current manifest activityVersion on carried-forward Full-PDF revisions, namespaces reference_only, propagates physicalPageCount, and preserves context-free navigation mapping', async () => {
    const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
    const rev1Version = scope.versions['manifest-1'];
    const rev1ActivityVersion = scope.activityVersions['activity-1-v1'];
    const rev1Key = bookAssemblyActivityVersionScopeKey('manifest-1', 'activity-1-v1');
    const rev2Key = bookAssemblyActivityVersionScopeKey('manifest-2', 'activity-1-v1');
    scope.activityVersions = {
      [rev1Key]: { ...rev1ActivityVersion },
      [rev2Key]: {
        ...rev1ActivityVersion,
        manifestVersionId: 'manifest-2',
        publicationId: 'pub-2',
        publicationRevision: 2,
        safeProjectionId: 'projection-2',
      },
    };
    scope.versions['manifest-2'] = {
      ...structuredClone(rev1Version),
      manifestVersionId: 'manifest-2',
      publicationId: 'pub-2',
      publicationRevision: 2,
      manifest: {
        ...structuredClone(rev1Version.manifest),
        units: [{
          ...structuredClone(rev1Version.manifest.units[0]),
          activitySlots: [{
            ...structuredClone(rev1Version.manifest.units[0].activitySlots[0]),
            contextRequirement: 'none',
          }],
          pageGroups: [
            ...structuredClone(rev1Version.manifest.units[0].pageGroups),
            {
              pageGroupKey: 'unit-1-transcript',
              sourceKey: 'full',
              pages: [4, 5],
              activityKeys: [],
              mode: 'reference_only',
            },
          ],
        }],
      },
    };
    scope.placements['placement-2'] = {
      ...structuredClone(scope.placements['placement-1']),
      placementId: 'placement-2',
      manifestVersionId: 'manifest-2',
      publicationId: 'pub-2',
      publicationRevision: 2,
    };
    scope.activitySafeProjections['projection-2'] = {
      ...structuredClone(scope.activitySafeProjections['projection-1']),
      projectionId: 'projection-2',
      manifestVersionId: 'manifest-2',
      publicationId: 'pub-2',
      publicationRevision: 2,
      placementIds: ['placement-2'],
    };
    scope.deliveryPlans['delivery-plan-2'] = {
      ...structuredClone(scope.deliveryPlans['delivery-plan-1']),
      deliveryPlanId: 'delivery-plan-2',
      manifestVersionId: 'manifest-2',
      publicationId: 'pub-2',
      publicationRevision: 2,
      placementIds: ['placement-2'],
    };
    scope.current = {
      ...scope.current,
      manifestVersionId: 'manifest-2',
      publicationId: 'pub-2',
      publicationRevision: 2,
    };

    const pub = createTrustedBookDeliveryPublication(
      {
        ...makeBookDeliveryIssuanceIntent(),
        publicationId: 'pub-2',
        publicationRevision: 2,
      },
      scope,
      { policyId: 'preview:preview-1', policyRevision: 1, basis: 'immutable-reference' },
      { fullPdfPhysicalPageCount: 24 },
    );
    expect(pub.sourceSet.sources[0]?.physicalPageCount).toBe(24);
    expect(pub.placements).toHaveLength(1);
    expect(pub.placements[0]).toMatchObject({
      contextMode: 'none',
      pageGroupKeys: [],
      sourcePageScopes: [],
      navigationPageGroupKeys: ['group-1'],
      navigationPageScopes: [{ sourceKey: 'full', pages: [1] }],
    });
    expect(pub.referencePageGroups).toEqual([
      {
        nodeKey: 'unit-1',
        pageGroupKey: 'ref:unit-1:unit-1-transcript',
        sourceKey: 'full',
        pages: [4, 5],
      },
    ]);

    const { handlers } = setup(() => 'binding-carried-ref', scope);
    const created = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: {
          ...makeBookDeliveryIssuanceIntent(),
          publicationId: 'pub-2',
          publicationRevision: 2,
        },
        operationId: operation(91),
      }),
    });
    expect(created.init.status).toBe(200);
    await handlers.activate({
      env,
      uid: 'teacher-1',
      request: request({ bindingId: 'binding-carried-ref', expectedRecordRevision: 0, operationId: operation(92) }),
    });
    const resolved = await handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(resolved.init.status).toBe(200);
    expect((resolved.body as any).pageGroups).toEqual(expect.arrayContaining([
      { pageGroupKey: 'group-1', combinedPhysicalPages: [1] },
      { pageGroupKey: 'ref:unit-1:unit-1-transcript', combinedPhysicalPages: [4, 5] },
    ]));
    expect((resolved.body as any).activities[0]).toMatchObject({
      contextMode: 'none',
      sourceContext: {
        available: false,
        pageGroupKeys: [],
        sourcePageScopes: [],
      },
      navigationPageGroupKeys: ['group-1'],
      navigationPageScopes: [{ sourceKey: 'full', pages: [1] }],
    });
  });

  it('prevents cross-unit reference_only pageGroupKey collisions with Activity pageGroupKeys', () => {
    const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
    const version = scope.versions['manifest-1'];
    version.manifest.nodes.push({ nodeKey: 'unit-2', parentNodeKey: null, nodeType: 'unit', order: 2 });
    version.manifest.units.push({
      unitKey: 'unit-2',
      activitySlots: [],
      pageGroups: [{
        pageGroupKey: 'group-1',
        sourceKey: 'full',
        pages: [10, 11],
        activityKeys: [],
        mode: 'reference_only',
      }],
    });
    const pub = createTrustedBookDeliveryPublication(
      {
        ...makeBookDeliveryIssuanceIntent(),
        scope: { kind: 'subtree', nodeKeys: ['unit-1', 'unit-2'], placementIds: [] },
      },
      scope,
      { policyId: 'preview:preview-1', policyRevision: 1, basis: 'immutable-reference' },
    );
    expect(pub.placements[0]?.pageGroupKeys).toEqual(['group-1']);
    expect(pub.referencePageGroups).toEqual([{
      nodeKey: 'unit-2',
      pageGroupKey: 'ref:unit-2:group-1',
      sourceKey: 'full',
      pages: [10, 11],
    }]);
  });

  it('fails closed on raw Full-PDF containing teacher_only pages at delivery issuance AND on authenticated student GET and Range document requests with zero provider reads', async () => {
    const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
    scope.versions['manifest-1'].manifest.units[0].pageGroups.push({
      pageGroupKey: 'unit-1-answer-key',
      sourceKey: 'full',
      pages: [9],
      activityKeys: [],
      mode: 'teacher_only',
    });

    // 1. Delivery publication issuance rejects unstripped full_pdf with teacher_only
    expect(() => createTrustedBookDeliveryPublication(
      makeBookDeliveryIssuanceIntent(),
      scope,
      { policyId: 'solo:solo-1', policyRevision: 1, basis: 'immutable-reference' },
    )).toThrowError(BookDeliveryWorkerError);
    try {
      createTrustedBookDeliveryPublication(
        makeBookDeliveryIssuanceIntent(),
        scope,
        { policyId: 'solo:solo-1', policyRevision: 1, basis: 'immutable-reference' },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BookDeliveryWorkerError);
      expect((error as BookDeliveryWorkerError).code).toBe('book_delivery_teacher_only_unstripped_forbidden');
      expect((error as BookDeliveryWorkerError).status).toBe(409);
    }

    // 2. Document byte serving (GET and Range) fails closed BEFORE any provider read even if a binding already exists
    const bindingId = 'bd_0123456789abcdef0123456789abcdef01234567';
    const existingBinding = {
      ...makeBookDeliveryTestBinding(),
      bindingId,
      revision: 1,
      status: 'active' as const,
      recipient: { recipientId: 'student-1', recipientKind: 'student' as const },
      issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' as const },
      context: {
        kind: 'solo' as const,
        contextId: 'solo-1',
        recipientId: 'student-1',
        ownerId: 'teacher-1',
        entitlementBasis: 'solo' as const,
      },
      book: {
        bookId: 'book-pdf-1',
        bookMode: 'pdf' as const,
        bookRevision: 3,
        manifestVersionId: 'manifest-1',
        publicationId: 'pub-1',
        publicationRevision: 1,
        publicationStatus: 'published' as const,
      },
    };
    const deliveryRepo = new InMemoryBookDeliveryRepository();
    await deliveryRepo.createDraft({
      operationId: operation(98),
      binding: { ...existingBinding, status: 'draft' },
      now: '2026-07-25T00:00:00.000Z',
    });
    await deliveryRepo.activate({
      bindingId,
      expectedRecordRevision: 0,
      operationId: operation(99),
      now: '2026-07-25T00:00:01.000Z',
    });
    const provider = {
      readObjectMetadata: vi.fn(async () => {
        throw new Error('must_not_read_provider_metadata');
      }),
      readBounded: vi.fn(async () => {
        throw new Error('must_not_read_provider_bytes');
      }),
    };
    const readCurrentAuthority = createBookSourceDocumentAuthorityReader({
      readPublicationScope: async () => scope,
      readAccountState: async () => ({
        accountId: 'account-1',
        quotaBytes: 1024 * 1024,
        reservedBytes: 0,
        usedBytes: 32,
        operations: {},
      } as any),
      readScheduleOpen: async () => true,
      readComponentStudentDocument: async () => null,
      providerTag: 'b2',
      privateBucketName: 'book-source',
    });
    const handler = createBookSourceDocumentDeliveryHandler({
      runtimeFactory: () => ({
        repository: deliveryRepo as any,
        provider,
        readProfile: async () => ({ role: 'student', status: 'active' }),
        readCurrentAuthority,
      }),
    });
    const routeKey = `${bindingId}-1-full-source-v1`;

    const getRes = await handler({
      request: new Request(`https://worker.test/v1/book-delivery/document/${routeKey}`, { method: 'GET' }),
      env: {},
      uid: 'student-1',
      params: { opaqueRouteKey: routeKey },
    });
    expect(getRes.status).toBe(403);
    expect(await getRes.json()).toEqual({ code: 'forbidden' });

    const rangeRes = await handler({
      request: new Request(`https://worker.test/v1/book-delivery/document/${routeKey}`, {
        method: 'GET',
        headers: { range: 'bytes=0-15' },
      }),
      env: {},
      uid: 'student-1',
      params: { opaqueRouteKey: routeKey },
    });
    expect(rangeRes.status).toBe(403);
    expect(await rangeRes.json()).toEqual({ code: 'forbidden' });
    expect(provider.readObjectMetadata).not.toHaveBeenCalled();
    expect(provider.readBounded).not.toHaveBeenCalled();
  });

  it('rejects activating a pre-existing full_pdf draft whose pinned manifest has teacher_only pages or is missing', async () => {
    const unsafeScope = structuredClone(makeBookAssemblyPublicationScope()) as any;
    unsafeScope.versions['manifest-1'].manifest.units[0].pageGroups.push({
      pageGroupKey: 'teacher-only-notes',
      sourceKey: 'full',
      pages: [10],
      activityKeys: [],
      mode: 'teacher_only',
    });
    const deliveryRepo = new InMemoryBookDeliveryRepository();
    const existingDraft = {
      ...makeBookDeliveryTestBinding(),
      bindingId: 'bd_unsafe_draft_1',
      status: 'draft' as const,
      book: {
        bookId: 'book-pdf-1',
        bookMode: 'pdf' as const,
        bookRevision: 2,
        manifestVersionId: 'manifest-1',
        publicationId: 'publication-1',
        publicationRevision: 4,
        publicationStatus: 'published' as const,
      },
    };
    await deliveryRepo.createDraft({
      binding: existingDraft,
      operationId: operation(110),
      now: '2026-07-25T00:00:00.000Z',
    });

    const unsafeHandlers = createBookDeliveryWorkerHandlers({
      repository: deliveryRepo as any,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({ 'book-pdf-1': unsafeScope }),
      now: () => '2026-07-25T00:01:00.000Z',
    });
    const activateUnsafe = await unsafeHandlers.activate({
      env,
      uid: 'teacher-1',
      request: request({ bindingId: 'bd_unsafe_draft_1', expectedRecordRevision: 0, operationId: operation(111) }),
    });
    expect(activateUnsafe).toEqual({
      body: { code: 'book_delivery_teacher_only_unstripped_forbidden' },
      init: { status: 409 },
    });
    expect((await deliveryRepo.readBinding('bd_unsafe_draft_1'))?.status).toBe('draft');

    const missingManifestHandlers = createBookDeliveryWorkerHandlers({
      repository: deliveryRepo as any,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({
        'book-pdf-1': { ...makeBookAssemblyPublicationScope(), versions: {} },
      }),
      now: () => '2026-07-25T00:01:00.000Z',
    });
    const activateMissing = await missingManifestHandlers.activate({
      env,
      uid: 'teacher-1',
      request: request({ bindingId: 'bd_unsafe_draft_1', expectedRecordRevision: 0, operationId: operation(112) }),
    });
    expect(activateMissing).toEqual({
      body: { code: 'book_delivery_teacher_only_unstripped_forbidden' },
      init: { status: 409 },
    });
    expect((await deliveryRepo.readBinding('bd_unsafe_draft_1'))?.status).toBe('draft');
  });

  it('preserves exact per-group pages for multi-group full_pdf Activities, hydrates physicalPageCount on old bindings, and bounds >120-char ref keys', async () => {
    const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
    const longRefKey = `reference-${'x'.repeat(115)}`;
    const unit = scope.versions['manifest-1'].manifest.units[0];
    unit.activitySlots[0].pageGroupKeys = ['group-a', 'group-b'];
    unit.pageGroups = [
      { pageGroupKey: 'group-a', sourceKey: 'full', pages: [2], activityKeys: ['activity-key-1'], mode: 'activity' },
      { pageGroupKey: 'group-b', sourceKey: 'full', pages: [8], activityKeys: ['activity-key-1'], mode: 'activity' },
      { pageGroupKey: longRefKey, sourceKey: 'full', pages: [12], activityKeys: [], mode: 'reference_only' },
    ];
    const twoPages = [
      { sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 2 },
      { sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 8 },
    ];
    scope.placements['placement-1'].pageGroupKeys = ['group-a', 'group-b'];
    scope.placements['placement-1'].sourcePages = twoPages;
    scope.activityVersions['activity-1-v1'].sourcePages = twoPages;
    scope.activitySafeProjections['projection-1'].sourcePages = twoPages;

    const repository = new InMemoryBookDeliveryRepository();
    const handlers = createBookDeliveryWorkerHandlers({
      repository: repository as any,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({ 'book-pdf-1': scope }),
      readFullPdfPhysicalPageCount: async () => 24,
      allocateBindingId: () => 'binding-multi-group',
      now: () => '2026-07-25T00:00:00.000Z',
    });
    const created = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({ intent: makeBookDeliveryIssuanceIntent(), operationId: operation(120) }),
    });
    expect(created.init.status).toBe(200);
    const createdBinding = (created.body as any).record.binding;
    expect(createdBinding.activityPageGroups).toEqual([
      { nodeKey: 'unit-1', pageGroupKey: 'group-a', sourceKey: 'full', pages: [2] },
      { nodeKey: 'unit-1', pageGroupKey: 'group-b', sourceKey: 'full', pages: [8] },
    ]);
    expect(createdBinding.referencePageGroups).toHaveLength(1);
    expect(createdBinding.referencePageGroups[0].pageGroupKey.startsWith('ref:')).toBe(true);
    expect(createdBinding.referencePageGroups[0].pageGroupKey.length).toBeLessThanOrEqual(120);

    await handlers.activate({
      env,
      uid: 'teacher-1',
      request: request({ bindingId: 'binding-multi-group', expectedRecordRevision: 0, operationId: operation(121) }),
    });
    const resolved = await handlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(resolved.init.status).toBe(200);
    expect((resolved.body as any).pageGroups).toEqual([
      { pageGroupKey: 'group-a', combinedPhysicalPages: [2] },
      { pageGroupKey: 'group-b', combinedPhysicalPages: [8] },
      { pageGroupKey: createdBinding.referencePageGroups[0].pageGroupKey, combinedPhysicalPages: [12] },
    ]);

    // Pre-existing binding without physicalPageCount gets hydrated on resolve()
    const legacyRepo = new InMemoryBookDeliveryRepository();
    const legacyBinding = {
      ...makeBookDeliveryTestBinding(),
      bindingId: 'binding-legacy-count',
      status: 'draft' as const,
    };
    await legacyRepo.createDraft({
      binding: legacyBinding,
      operationId: operation(122),
      now: '2026-07-25T00:00:00.000Z',
    });
    await legacyRepo.activate({
      bindingId: 'binding-legacy-count',
      expectedRecordRevision: 0,
      operationId: operation(123),
      now: '2026-07-25T00:00:01.000Z',
    });
    const hydrateHandlers = createBookDeliveryWorkerHandlers({
      repository: legacyRepo as any,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({ 'book-pdf-1': makeBookAssemblyPublicationScope() }),
      readFullPdfPhysicalPageCount: async () => 36,
    });
    const hydrated = await hydrateHandlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(hydrated.init.status).toBe(200);
    expect((hydrated.body as any).sourceSet.sources[0].physicalPageCount).toBe(36);
    expect((hydrated.body as any).documentRequests[0].physicalPageCount).toBe(36);
  });

  it('preserves :: delimiter-bearing Unit/PageGroup pairs and hydrates colliding cross-unit activityPageGroups on legacy full_pdf bindings', async () => {
    const scope = structuredClone(makeBookAssemblyPublicationScope()) as any;
    scope.versions['manifest-1'].manifest.nodes = [
      { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'u1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
      { nodeKey: 'u1::a', parentNodeKey: 'root', nodeType: 'unit', order: 2 },
    ];
    scope.versions['manifest-1'].manifest.units = [
      {
        unitKey: 'u1',
        activitySlots: [{ activityKey: 'act-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['a::b', 'intro'] }],
        pageGroups: [
          { pageGroupKey: 'a::b', sourceKey: 'full', pages: [2], activityKeys: ['act-1'], mode: 'activity' },
          { pageGroupKey: 'intro', sourceKey: 'full', pages: [4], activityKeys: ['act-1'], mode: 'activity' },
        ],
      },
      {
        unitKey: 'u1::a',
        activitySlots: [{ activityKey: 'act-2', order: 1, contextRequirement: 'required', pageGroupKeys: ['b', 'intro'] }],
        pageGroups: [
          { pageGroupKey: 'b', sourceKey: 'full', pages: [6], activityKeys: ['act-2'], mode: 'activity' },
          { pageGroupKey: 'intro', sourceKey: 'full', pages: [10], activityKeys: ['act-2'], mode: 'activity' },
        ],
      },
    ];
    const basePlacement = scope.placements['placement-1'];
    const baseActivity = scope.activityVersions['activity-1-v1'];
    const baseProjection = scope.activitySafeProjections['projection-1'];
    const u1Pages = [
      { sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 2 },
      { sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 4 },
    ];
    const u2Pages = [
      { sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 6 },
      { sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 10 },
    ];
    scope.placements = {
      'p-1': { ...basePlacement, placementId: 'p-1', unitKey: 'u1', nodeKey: 'u1', activityKey: 'act-1', activityId: 'a-1', activityVersionId: 'a-1-v1', pageGroupKeys: ['a::b', 'intro'], sourcePages: u1Pages },
      'p-2': { ...basePlacement, placementId: 'p-2', unitKey: 'u1::a', nodeKey: 'u1::a', activityKey: 'act-2', activityId: 'a-2', activityVersionId: 'a-2-v1', order: 2, pageGroupKeys: ['b', 'intro'], sourcePages: u2Pages },
    };
    scope.activityVersions = {
      'a-1-v1': { ...baseActivity, unitKey: 'u1', activityKey: 'act-1', activityId: 'a-1', activityVersionId: 'a-1-v1', safeProjectionId: 'proj-1', sourcePages: u1Pages },
      'a-2-v1': { ...baseActivity, unitKey: 'u1::a', activityKey: 'act-2', activityId: 'a-2', activityVersionId: 'a-2-v1', safeProjectionId: 'proj-2', sourcePages: u2Pages },
    };
    scope.activitySafeProjections = {
      'proj-1': { ...baseProjection, projectionId: 'proj-1', activityId: 'a-1', activityVersionId: 'a-1-v1', placementIds: ['p-1'], sourcePages: u1Pages },
      'proj-2': { ...baseProjection, projectionId: 'proj-2', activityId: 'a-2', activityVersionId: 'a-2-v1', placementIds: ['p-2'], sourcePages: u2Pages },
    };
    scope.versions['manifest-1'].studentSafeProjection.units = structuredClone(scope.versions['manifest-1'].manifest.units);
    scope.deliveryPlans['delivery-plan-1'].placementIds = ['p-1', 'p-2'];

    // Create binding with :: delimiter keys -> both ('u1', 'a::b') and ('u1::a', 'b') survive!
    const repo = new InMemoryBookDeliveryRepository();
    const handlers = createBookDeliveryWorkerHandlers({
      repository: repo as any,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({ 'book-pdf-1': scope }),
      readFullPdfPhysicalPageCount: async () => 20,
      allocateBindingId: () => 'binding-colon-keys',
      now: () => '2026-07-25T00:00:00.000Z',
    });
    const created = await handlers.create({
      env,
      uid: 'teacher-1',
      request: request({
        intent: {
          ...makeBookDeliveryIssuanceIntent(),
          scope: { kind: 'placements', nodeKeys: [], placementIds: ['p-1', 'p-2'] },
        },
        operationId: operation(130),
      }),
    });
    expect(created.init.status).toBe(200);
    const createdBinding = (created.body as any).record.binding;
    expect(createdBinding.activityPageGroups).toEqual([
      { nodeKey: 'u1', pageGroupKey: 'a::b', sourceKey: 'full', pages: [2] },
      { nodeKey: 'u1', pageGroupKey: 'intro', sourceKey: 'full', pages: [4] },
      { nodeKey: 'u1::a', pageGroupKey: 'b', sourceKey: 'full', pages: [6] },
      { nodeKey: 'u1::a', pageGroupKey: 'intro', sourceKey: 'full', pages: [10] },
    ]);

    // Simulate an older persisted binding without activityPageGroups -> resolve() hydrates from pinned manifest!
    const legacyBinding = structuredClone(createdBinding);
    delete legacyBinding.activityPageGroups;
    legacyBinding.bindingId = 'binding-legacy-hydrate-groups';
    const legacyRepo = new InMemoryBookDeliveryRepository();
    await legacyRepo.createDraft({ binding: legacyBinding, operationId: operation(131), now: '2026-07-25T00:00:00.000Z' });
    await legacyRepo.activate({ bindingId: 'binding-legacy-hydrate-groups', expectedRecordRevision: 0, operationId: operation(132), now: '2026-07-25T00:00:01.000Z' });
    const legacyHandlers = createBookDeliveryWorkerHandlers({
      repository: legacyRepo as any,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({ 'book-pdf-1': scope }),
      readFullPdfPhysicalPageCount: async () => 20,
    });
    const resolved = await legacyHandlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(resolved.init.status).toBe(200);
    expect((resolved.body as any).pageGroups).toEqual([
      { pageGroupKey: 'a::b', combinedPhysicalPages: [2] },
      { nodeKey: 'u1', pageGroupKey: 'intro', combinedPhysicalPages: [4] },
      { pageGroupKey: 'b', combinedPhysicalPages: [6] },
      { nodeKey: 'u1::a', pageGroupKey: 'intro', combinedPhysicalPages: [10] },
    ]);

    // Fail closed (409) when legacy full_pdf hydration cannot read or match the pinned manifest
    const missingManifestHandlers = createBookDeliveryWorkerHandlers({
      repository: legacyRepo as any,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({}),
      readFullPdfPhysicalPageCount: async () => 20,
    });
    const missingManifestResult = await missingManifestHandlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(missingManifestResult.init.status).toBe(409);
    expect(missingManifestResult.body).toEqual({ code: 'book-delivery-stale-binding' });

    const failingScopeHandlers = createBookDeliveryWorkerHandlers({
      repository: legacyRepo as any,
      publicationRepository: {
        readScope: async () => {
          throw new Error('rtdb_unavailable');
        },
      } as any,
      readFullPdfPhysicalPageCount: async () => 20,
    });
    const failingScopeResult = await failingScopeHandlers.resolve({
      env,
      uid: 'teacher-1',
      recipientId: 'teacher-1',
      contextId: 'preview-1',
    });
    expect(failingScopeResult.init.status).toBe(409);
    expect(failingScopeResult.body).toEqual({ code: 'book-delivery-stale-binding' });
  });
});
