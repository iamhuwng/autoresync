import { describe, expect, it } from 'vitest';
import { InMemoryBookAssemblyPublicationRepository } from '../../src/services/book-assembly/publicationRepository';
import { bookAssemblyActivityVersionScopeKey } from '../../src/services/book-assembly/publicationTransaction.service';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import { BOOK_DELIVERY_SCHEMA_VERSION } from '../../src/services/book-delivery/bookDelivery.types';
import fragment08B from '../src/upload-worker/book-rules/fragments/08B.json';
import {
  BookDeliveryWorkerError,
  createBookDeliveryWorkerHandlers,
  createTrustedBookDeliveryPublication,
} from '../src/upload-worker/book-delivery/worker';
import {
  makeBookAssemblyPublicationScope,
  makeBookDeliveryIssuanceIntent,
  makeBookDeliveryTestBinding,
  makeMappingRevisionPublicationScope,
} from './book-delivery.fixture';

const operation = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const env = {
  BOOK_DELIVERY_SERVICE_IDENTITY: 'book-delivery@example.iam.gserviceaccount.com',
  readDatabaseValue: async () => ({ role: 'teacher' }),
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
});
