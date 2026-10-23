import { describe, expect, it, vi } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import {
  createBookDeliveryProjectionResolver,
} from '../../src/services/book-delivery/bookDelivery.service';
import type {
  BookDeliveryBinding,
} from '../../src/services/book-delivery/bookDelivery.types';
import type {
  BookHomeworkAuthorityRecord,
} from '../../src/services/book-homework/bookHomeworkAuthority.types';
import type {
  BookDocumentAuthorizedSource,
  LiveBookDocumentAuthority,
} from '../src/upload-worker/book-delivery/documentAuthorization';
import {
  createBookRouteHandlers,
} from '../src/upload-worker/book-route-handlers';
import { createBookRouter } from '../src/upload-worker/book-router';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest';
import {
  deriveRevokedBookSourceVersionIds,
  isBookHomeworkDocumentScheduleOpen,
  studentDocumentOperationMatchesDescriptor,
  defaultRuntimeFactory,
} from '../src/upload-worker/book-source/document';
import { bookHomeworkRecipientAuthorityId, bookHomeworkRecipientDeliveryBindingId } from '../src/upload-worker/book-homework/identity';
import {
  makeBookDeliveryTestBinding,
  makeBookAssemblyPublicationScope,
} from './book-delivery.fixture';
import { createComponentStudentDocument, type ComponentStudentDocument } from '../../src/services/book-assembly/componentStudentDocument.types';
import type { BookSourceUploadOperation } from '../../src/types/bookSource.types';
import { fingerprintComponentPdfActivationValue } from '../../src/services/book-assembly/componentPdfActivation.service';
import { createTrustedBookDeliveryPublication, resolveTrustedBookDeliveryStudentDocument } from '../src/upload-worker/book-delivery/worker';

const operation = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const canonicalBindingId = `bd_${'a'.repeat(40)}`;

const studentBinding = (): BookDeliveryBinding => {
  const binding = structuredClone(makeBookDeliveryTestBinding()) as BookDeliveryBinding;
  return {
    ...binding,
    bindingId: canonicalBindingId,
    status: 'draft',
    recipient: { recipientId: 'student-1', recipientKind: 'student' },
    context: {
      kind: 'solo',
      contextId: 'solo-1',
      recipientId: 'student-1',
      ownerId: binding.issuer.ownerId,
      entitlementBasis: 'solo',
    },
  };
};

const readyRepository = async () => {
  const repository = new InMemoryBookDeliveryRepository();
  await repository.createDraft({
    binding: studentBinding(),
    operationId: operation(1),
    now: '2026-07-30T00:00:00.000Z',
  });
  await repository.activate({
    bindingId: canonicalBindingId,
    expectedRecordRevision: 0,
    operationId: operation(2),
    now: '2026-07-30T00:01:00.000Z',
  });
  return repository;
};

const sourceLocation = (): BookDocumentAuthorizedSource => ({
  bookId: 'book-pdf-1',
  sourceVersionId: 'source-v1',
  storageLocationId: 'b2-book-primary',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'bucket-id',
  providerObjectKey: 'book-source/source-v1.pdf',
  providerFileId: '4_zprovider-version',
  providerFileVersionId: '4_zprovider-version',
  checksum: {
    algorithm: 'sha-256',
    value: 'a'.repeat(64),
  },
  byteSize: 578,
  provider: 'b2',
  bucket: 'bookpdf',
  objectKey: 'book-source/source-v1.pdf',
});

const liveAuthority = (
  overrides: Partial<LiveBookDocumentAuthority> = {},
): LiveBookDocumentAuthority => ({
  publicationStatus: 'published',
  scheduleOpen: true,
  sourceVersionIds: ['source-v1'],
  revokedSourceVersionIds: [],
  sourceLocations: [sourceLocation()],
  ...overrides,
});

const handlerInput = (
  opaqueRouteKey: string,
  uid = 'student-1',
  method = 'HEAD',
) => ({
  request: new Request(
    `https://worker.test/v1/book-delivery/document/${encodeURIComponent(opaqueRouteKey)}`,
    {
      method,
      headers: { origin: 'http://localhost:5174' },
    },
  ),
  env: {},
  uid,
  params: { opaqueRouteKey },
  descriptor: {} as never,
});

const teacherHandlerInput = () => ({
  request: new Request(
    'https://worker.test/v1/book-delivery/teacher-assembly/book-pdf-1/unit-1/candidate-1/3/full/source-v1/2/4',
    {
      method: 'HEAD',
      headers: { authorization: 'Bearer teacher-token', origin: 'http://localhost:5173' },
    },
  ),
  env: {},
  uid: 'teacher-1',
  params: {
    bookId: 'book-pdf-1', unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: '3',
    sourceKey: 'full', sourceVersionId: 'source-v1', sourceSetRevision: '2', bookRevision: '4',
  },
  descriptor: {} as never,
});

const documentRuntimeEnvironment = (): Record<string, unknown> => {
  const serviceIdentity = 'book-delivery-runtime@temp-a143.iam.gserviceaccount.com';
  const assemblyIdentity = 'book-assembly-p2-runtime@temp-a143.iam.gserviceaccount.com';
  const serviceAccount = JSON.stringify({
    client_email: serviceIdentity,
    private_key: 'test-only',
  });
  const assemblyServiceAccount = JSON.stringify({
    client_email: assemblyIdentity,
    private_key: 'test-only',
  });
  return {
    FIREBASE_PROJECT_ID: 'temp-a143',
    FIREBASE_DB_URL: 'https://temp-a143.firebaseio.com',
    FIREBASE_WEB_API_KEY: 'test-web-api-key',
    BOOK_DELIVERY_SERVICE_IDENTITY: serviceIdentity,
    BOOK_DELIVERY_GOOGLE_SA_KEY: serviceAccount,
    BOOK_ASSEMBLY_GOOGLE_SA_KEY: assemblyServiceAccount,
    BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'upload-account',
    BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com/',
    BOOK_SOURCE_B2_REGION: 'us-west-004',
    BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'location-1',
    BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'bucket-id',
    BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'bookpdf',
    BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: 'book-source/',
    BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID: 'upload-key-id',
    BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY: 'upload-key',
    BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: 'metadata-key-id',
    BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: 'metadata-key',
    BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: 'read-key-id',
    BOOK_SOURCE_B2_READ_APPLICATION_KEY: 'read-key',
    BOOK_SOURCE_B2_PROVIDER_STATE: 'enabled',
  };
};

describe('Ticket #49 canonical source document composition', () => {
  it.each(['projection', 'bytes'] as const)('keeps assigned component %s pinned after source and plan replacement', async (surface) => {
    const scope = { ...structuredClone(makeBookAssemblyPublicationScope()), studentDocuments: {} as Record<string, ComponentStudentDocument> };
    const version = scope.versions!['manifest-1']!;
    Object.assign(Object.values(scope.activityVersions!)[0]!, { safeProjectionId: 'projection-1',
      canonicalOriginManifestVersionId: 'manifest-1', canonicalOriginPublicationId: 'publication-1', canonicalOriginOperationId: operation(101) });
    const sources = [
      { sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'second', sourceVersionId: 'source-v2', sourceOrder: 2, ownerNodeKey: 'unit-1' },
    ];
    const sourceSet = { sourceStrategy: 'component_pdfs' as const, sources };
    const descriptor = createComponentStudentDocument({
      sourceVersionId: 'student-v1', descriptorRevision: 2, sha256Hex: 'a'.repeat(64),
      byteSize: 578, physicalPageCount: 2, compositionFingerprint: 'composition-1',
      components: sources.map((source, index) => ({ ...source, localPageCount: 1, combinedStartPage: index + 1, combinedEndPage: index + 1 })),
    });
    Object.assign(version, { strategy: 'component_pdfs', studentDocument: {
      sourceVersionId: descriptor.sourceVersionId, descriptorRevision: descriptor.descriptorRevision,
      sha256Hex: descriptor.sha256Hex, descriptorFingerprint: fingerprintComponentPdfActivationValue(descriptor),
    } });
    Object.assign(version.manifest, { sourceSet });
    Object.assign(version.studentSafeProjection, { sourceStrategy: 'component_pdfs', sourceSet });
    Object.assign(scope.deliveryPlans!['delivery-plan-1']!, { sourceStrategy: 'component_pdfs', sourceSet });
    scope.studentDocuments = { [descriptor.sourceVersionId]: descriptor };
    const binding = { ...studentBinding(), sourceSet: { strategy: 'component_pdfs' as const,
      sources: sources.map(source => ({ ...source, lifecycle: 'verified-usable' as const, localPageScope: { kind: 'all' as const, pages: [] } })),
    } };
    // Only current authoring/publication authority advances; every assigned immutable record stays exact.
    const successor = structuredClone(version);
    Object.assign(successor, { manifestVersionId: 'manifest-next', publicationId: 'publication-next', bookRevision: 4, sourceSetRevision: 3 });
    Object.assign(successor.studentSafeProjection, { publicationId: 'publication-next' });
    Object.assign(successor.manifest.units[0]!.pageGroups[0]!, { pages: [2] });
    Object.assign(successor.manifest.sourceSet.sources[0]!, { sourceVersionId: 'replacement-v1' });
    scope.versions!['manifest-next'] = successor;
    Object.assign(scope.current!, { manifestVersionId: 'manifest-next', publicationId: 'publication-next', bookRevision: 4, sourceSetRevision: 3, operationFingerprint: 'operation-next' });
    expect(() => createTrustedBookDeliveryPublication({ bookId: binding.book.bookId, publicationId: binding.book.publicationId,
      publicationRevision: binding.book.publicationRevision, recipientId: binding.recipient.recipientId,
      contextKind: 'solo', contextId: binding.context.contextId, scope: binding.scope }, scope, binding.schedulePolicy)).toThrow('book_delivery_publication_stale');
    const storage = { ...sourceLocation(), sourceVersionId: descriptor.sourceVersionId };
    const { provider: _provider, bucket: _bucket, objectKey: _objectKey, ...verifiedStorage } = storage;
    const uploadOperation: BookSourceUploadOperation = {
      reservationId: 'reservation-1', bookId: binding.book.bookId, ownerId: binding.issuer.ownerId,
      sourceKey: 'student-document', sourceVersionId: descriptor.sourceVersionId, kind: 'initial', purpose: 'student-document',
      storageLocationId: storage.storageLocationId, providerKind: storage.providerKind, privateBucketId: storage.privateBucketId,
      providerObjectKey: storage.providerObjectKey, byteSize: storage.byteSize, originalFilename: 'combined.pdf',
      expectedChecksum: storage.checksum, createdAt: '2026-07-30T00:00:00.000Z', expiresAt: '2026-07-30T00:15:00.000Z',
      status: 'verified_completed', completedAt: '2026-07-30T00:01:00.000Z', physicalPageCount: 2, verifiedStorage,
      studentSafeStatus: 'ready', studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: '2026-07-30T00:02:00.000Z',
        sourceVersionId: descriptor.sourceVersionId, sha256Hex: descriptor.sha256Hex, reasonCode: 'teacher-reviewed' },
    };
    const uploadAccount = { revision: 1, capacity: { trackedAccountBytes: storage.byteSize, temporaryBytes: 0 },
      operations: { 'reservation-1': uploadOperation } as Record<string, BookSourceUploadOperation> };
    const environment = documentRuntimeEnvironment();
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const key = await exportPKCS8(privateKey);
    for (const service of ['DELIVERY', 'ASSEMBLY', 'SOURCE_UPLOAD']) {
      const identity = `${service.toLowerCase()}@temp-a143.iam.gserviceaccount.com`;
      environment[`BOOK_${service}_SERVICE_IDENTITY`] = identity;
      environment[`BOOK_${service}_GOOGLE_SA_KEY`] = JSON.stringify({ client_email: identity, private_key: key });
    }
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(String(input)); requests.push(url.pathname);
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'synthetic', expires_in: 3600 });
      if (url.hostname === 'identitytoolkit.googleapis.com') return Response.json({ idToken: 'synthetic', expiresIn: '3600' });
      if (url.pathname === '/book_assembly_publications/books/book-pdf-1.json') return Response.json({
        current: scope.current, versions: scope.versions, placements: scope.placements, activity_versions: scope.activityVersions,
        activity_safe_projections: scope.activitySafeProjections, delivery_plans: scope.deliveryPlans, student_documents: scope.studentDocuments,
      }, { headers: { etag: '"fixture"' } });
      if (url.pathname === '/book_source_upload_accounts/upload-account.json') return Response.json(uploadAccount);
      if (url.pathname === '/material_catalog/books/book-pdf-1.json') return Response.json({
        bookId: binding.book.bookId, ownerId: binding.issuer.ownerId, bookMode: 'pdf', bookRevision: 4, sourceSetRevision: 3,
        sourceSet: successor.manifest.sourceSet,
      });
      return Response.json(null);
    });
    try {
      if (surface === 'projection') {
        const document = await resolveTrustedBookDeliveryStudentDocument(environment, binding);
        expect(document).toMatchObject({ expectedByteLength: descriptor.byteSize, physicalPageCount: 2,
          pageGroups: [{ pageGroupKey: 'group-1', combinedPhysicalPages: [1] }] });
      } else {
        const authority = await defaultRuntimeFactory(environment).readCurrentAuthority(binding);
        expect(authority).toMatchObject({ publicationStatus: 'published', scheduleOpen: true,
          sourceVersionIds: [descriptor.sourceVersionId], studentDocument: { sourceVersionId: descriptor.sourceVersionId } });
      }
      expect(requests.some(path => path.startsWith('/material_catalog/'))).toBe(false);
      for (const failure of ['missing-descriptor', 'tampered-descriptor', 'missing-source', 'unreviewed-source', 'foreign-source']) {
        scope.studentDocuments = failure === 'missing-descriptor' ? {} : { [descriptor.sourceVersionId]:
          failure === 'tampered-descriptor' ? { ...descriptor, sha256Hex: 'b'.repeat(64) } : descriptor };
        uploadAccount.operations = failure === 'missing-source' ? {} : { 'reservation-1':
          failure === 'unreviewed-source' ? { ...uploadOperation, studentSafeStatus: 'unreviewed', studentSafeDecision: undefined } : uploadOperation };
        Object.assign(binding.sourceSet.sources[0]!, { sourceVersionId: failure === 'foreign-source' ? 'unassigned-v1' : 'source-v1' });
        if (surface === 'projection') expect(await resolveTrustedBookDeliveryStudentDocument(environment, binding), failure).toBeNull();
        else expect(await defaultRuntimeFactory(environment).readCurrentAuthority(binding), failure)
          .toMatchObject({ publicationStatus: 'unpublished', sourceLocations: [] });
      }
    } finally { vi.unstubAllGlobals(); }
  });
  it.each(['disabled', undefined] as const)('fails closed when the B2 provider state is %s', (state) => {
    const environment = { ...documentRuntimeEnvironment(), BOOK_SOURCE_B2_PROVIDER_STATE: state };
    expect(() => defaultRuntimeFactory(environment)).toThrow('book_source_b2_provider_unavailable');
  });

  it('keeps the explicit document OAuth publication reader when dedicated publisher credentials exist', async () => {
    const environment = documentRuntimeEnvironment();
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    environment.BOOK_DELIVERY_GOOGLE_SA_KEY = JSON.stringify({ client_email: environment.BOOK_DELIVERY_SERVICE_IDENTITY, private_key: await exportPKCS8(privateKey) });
    environment.BOOK_ASSEMBLY_PUBLICATION_SERVICE_IDENTITY = 'publication@temp-a143.iam.gserviceaccount.com';
    environment.BOOK_ASSEMBLY_PUBLICATION_GOOGLE_SA_KEY = JSON.stringify({ client_email: environment.BOOK_ASSEMBLY_PUBLICATION_SERVICE_IDENTITY, private_key: await exportPKCS8(privateKey) });
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'document-read-token', expires_in: 3600 });
      if (url.includes('/book_assembly_publications/books/book-pdf-1.json')) return Response.json(null, { headers: { etag: '"empty"' } });
      throw new Error('unexpected_document_reader_transport');
    });
    try {
      await expect(defaultRuntimeFactory(environment).readCurrentAuthority(studentBinding())).rejects.toThrow();
      expect(calls.some(url => url.includes('/book_assembly_publications/books/book-pdf-1.json'))).toBe(true);
      expect(calls.some(url => url.includes('identitytoolkit.googleapis.com'))).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([
    ['active teacher', { role: 'teacher', status: 'active' }, 200],
    ['active super_admin', { role: 'super_admin', status: 'active' }, 200],
    ['student profile', { role: 'student', status: 'active' }, 401],
    ['missing status', { role: 'teacher' }, 401],
    ['unknown status', { role: 'teacher', status: 'unknown' }, 401],
    ['pending status', { role: 'teacher', status: 'pending' }, 401],
    ['disabled', { role: 'teacher', status: 'active', disabled: true }, 401],
    ['force reauth', { role: 'teacher', status: 'active', forceReauth: true }, 401],
    ['privileged authority revoked', {
      role: 'teacher', status: 'active', privilegedAuthorityRevokedAt: '2026-09-15T00:00:00.000Z',
    }, 401],
  ] as const)('serves the registered teacher PDF route only for %s', async (_label, profile, expectedStatus) => {
    const repository = new InMemoryBookDeliveryRepository();
    const readObjectMetadata = vi.fn(async ({ identity }) => ({
      identity,
      contentType: 'application/pdf' as const,
    }));
    const candidate = {
      candidateId: 'candidate-1', ownerId: 'teacher-1', bookId: 'book-pdf-1', bookRevision: 4,
      sourceSetRevision: 2, unitKey: 'unit-1', revision: 3, lifecycle: 'validated' as const,
      validation: { valid: true, errors: [] }, updatedAt: '2026-08-29T00:00:00.000Z',
      manifest: {
        bookId: 'book-pdf-1',
        sourceSet: { sourceStrategy: 'full_pdf' as const, sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }] },
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit' as const, order: 1 }],
        units: [{
          unitKey: 'unit-1',
          activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pages-1'] }],
          pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [1], activityKeys: ['activity-1'], mode: 'activity' as const }],
        }],
      },
    };
    const readTeacherBookAuthority = vi.fn(async () => ({
      bookId: 'book-pdf-1', ownerId: 'teacher-1', bookMode: 'pdf' as const, status: 'active' as const,
      bookRevision: 4, sourceSetRevision: 2, sourceSet: candidate.manifest.sourceSet,
    }));
    const readTeacherCandidate = vi.fn(async () => ({
      current: { candidateId: 'candidate-1', candidateRevision: 3 }, candidate,
    }));
    const readTeacherSourceVersion = vi.fn(async () => ({
      sourceVersionId: 'source-v1', sourceKey: 'full', bookId: 'book-pdf-1', ownerId: 'teacher-1',
      bookRevision: 4, sourceSetRevision: 2, lifecycle: 'verified-usable' as const, storage: sourceLocation(),
    }));
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider: { readObjectMetadata, readBounded: vi.fn() },
          readProfile: vi.fn(async () => profile),
          readCurrentAuthority: async () => liveAuthority(),
          readTeacherBookAuthority,
          readTeacherCandidate,
          readTeacherSourceVersion,
        }),
      },
    });

    const teacherRoute = canonicalBookRouteManifest.find(
      (route) => route.id === 'book.document-delivery.serve-teacher-assembly-document',
    )!;
    const router = createBookRouter({
      manifest: [teacherRoute],
      handlers: { serveTeacherAssemblyDocument: handlers.serveTeacherAssemblyDocument! },
      firebaseVerifier: { verifyAuthorizationHeader: () => ({ valid: true, uid: 'teacher-1' }) },
    });
    const response = await router.fetch(teacherHandlerInput().request, {
      BOOK_TEACHER_ASSEMBLY_DOCUMENT_ROUTES_ENABLED: 'enabled',
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'assembly-runtime@temp-a143.iam.gserviceaccount.com',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'assembly-runtime@temp-a143.iam.gserviceaccount.com',
        private_key: 'test-only',
      }),
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });

    expect(response?.status).toBe(expectedStatus);
    if (expectedStatus === 200) {
      expect(response?.headers.get('content-type')).toBe('application/pdf');
      expect(readObjectMetadata).toHaveBeenCalledTimes(1);
    } else {
      expect(await response?.json()).toEqual({ code: 'unauthorized' });
      expect(readObjectMetadata).not.toHaveBeenCalled();
      expect(readTeacherBookAuthority).not.toHaveBeenCalled();
      expect(readTeacherCandidate).not.toHaveBeenCalled();
      expect(readTeacherSourceVersion).not.toHaveBeenCalled();
    }
  });

  it('fails closed with a stable configuration error when the disabled preview is not provisioned', async () => {
    const response = await createBookRouteHandlers().serveAuthorizedDocument!(
      handlerInput(`${canonicalBindingId}-1-full-source-v1`),
    ) as Response;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'document_configuration_unavailable' });
  });

  it('passes the Firebase Web API key through the default document homework store', async () => {
    const response = await createBookRouteHandlers().serveAuthorizedDocument!({
      ...handlerInput(`${canonicalBindingId}-1-full-source-v1`, ''),
      env: documentRuntimeEnvironment(),
    }) as Response;

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'forbidden' });
  });

  it('resolves the persisted homework recipient delivery binding route shape', async () => {
    const bindingId = 'assignment-1--student-1--delivery';
    const binding = {
      ...studentBinding(),
      bindingId,
      context: {
        kind: 'homework' as const,
        contextId: 'assignment-1',
        recipientId: 'student-1',
        ownerId: 'teacher-1',
        entitlementBasis: 'assignment' as const,
      },
    };
    const repository = new InMemoryBookDeliveryRepository();
    await repository.createDraft({
      binding,
      operationId: operation(3),
      now: '2026-07-30T00:00:00.000Z',
    });
    await repository.activate({
      bindingId,
      expectedRecordRevision: 0,
      operationId: operation(4),
      now: '2026-07-30T00:01:00.000Z',
    });
    const readObjectMetadata = vi.fn(async ({ identity }) => ({
      identity,
      contentType: 'application/pdf' as const,
    }));
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider: { readObjectMetadata, readBounded: vi.fn() },
          readProfile: async () => ({ role: 'student', status: 'active' }),
          readCurrentAuthority: async () => liveAuthority(),
        }),
      },
    });

    const response = await handlers.serveAuthorizedDocument!(
      handlerInput(`${bindingId}-1-full-source-v1`),
    ) as Response;

    expect(response.status).toBe(200);
    expect(readObjectMetadata).toHaveBeenCalledTimes(1);
  });

  it('resolves one combined document for the persisted homework binding shape', async () => {
    const bindingId = 'assignment-2--student-1--delivery';
    const full = studentBinding();
    const binding = { ...full, bindingId,
      context: { ...full.context, kind: 'homework' as const, contextId: 'assignment-2', entitlementBasis: 'assignment' as const },
      sourceSet: { strategy: 'component_pdfs' as const, sources: [{ ...full.sourceSet.sources[0]!, ownerNodeKey: 'unit-1', sourceOrder: 1 }] },
    } as BookDeliveryBinding;
    const repository = new InMemoryBookDeliveryRepository();
    await repository.createDraft({ binding, operationId: operation(15), now: '2026-07-30T00:00:00.000Z' });
    await repository.activate({ bindingId, expectedRecordRevision: 0, operationId: operation(16), now: '2026-07-30T00:01:00.000Z' });
    const combined = { ...sourceLocation(), sourceVersionId: 'student-v2' };
    const readObjectMetadata = vi.fn(async ({ identity }) => ({ identity, contentType: 'application/pdf' as const }));
    const handlers = createBookRouteHandlers({ sourceDocument: { runtimeFactory: () => ({
      repository, provider: { readObjectMetadata, readBounded: vi.fn() },
      readProfile: async () => ({ role: 'student', status: 'active' }),
      readCurrentAuthority: async () => liveAuthority({
        sourceVersionIds: ['student-v2'], sourceLocations: [combined],
        studentDocument: { sourceVersionId: 'student-v2', descriptorRevision: 2, descriptorFingerprint: 'a'.repeat(64) },
      }),
    }) } });
    const response = await handlers.serveAuthorizedDocument!(
      handlerInput(`${bindingId}-1-student-document`),
    ) as Response;
    expect(response.status).toBe(200);
    expect(readObjectMetadata).toHaveBeenCalledTimes(1);
  });

  it('fails closed for a component source binding instead of exposing a student document resource', async () => {
    const bindingId = `bd_${'b'.repeat(40)}`;
    const fullBinding = studentBinding();
    const binding = {
      ...fullBinding,
      bindingId,
      sourceSet: {
        strategy: 'component_pdfs' as const,
        sources: [{
          ...fullBinding.sourceSet.sources[0]!,
          sourceKey: 'component-a',
          sourceOrder: 1,
          ownerNodeKey: 'unit-1',
        }],
      },
      placements: fullBinding.placements.map((placement) => ({
        ...placement,
        sourcePageScopes: placement.sourcePageScopes.map((scope) => ({
          ...scope,
          sourceKey: 'component-a',
        })),
      })),
    } as BookDeliveryBinding;
    const repository = new InMemoryBookDeliveryRepository();
    await repository.createDraft({
      binding,
      operationId: operation(5),
      now: '2026-07-30T00:00:00.000Z',
    });
    await repository.activate({
      bindingId,
      expectedRecordRevision: 0,
      operationId: operation(6),
      now: '2026-07-30T00:01:00.000Z',
    });
    const readObjectMetadata = vi.fn();
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider: { readObjectMetadata, readBounded: vi.fn() },
          readProfile: async () => ({ role: 'student', status: 'active' }),
          readCurrentAuthority: async () => liveAuthority(),
        }),
      },
    });

    const response = await handlers.serveAuthorizedDocument!(
      handlerInput(`${bindingId}-1-component-a-source-v1`),
    ) as Response;

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'stale-binding' });
    expect(readObjectMetadata).not.toHaveBeenCalled();
  });

  it('serves only the combined component document through its opaque route', async () => {
    const bindingId = `bd_${'c'.repeat(40)}`;
    const fullBinding = studentBinding();
    const binding = {
      ...fullBinding,
      bindingId,
      sourceSet: {
        strategy: 'component_pdfs' as const,
        sources: [{ ...fullBinding.sourceSet.sources[0]!, sourceKey: 'component-private', ownerNodeKey: 'unit-1', sourceOrder: 1 }],
      },
      placements: fullBinding.placements.map((placement) => ({
        ...placement,
        sourcePageScopes: placement.sourcePageScopes.map((scope) => ({ ...scope, sourceKey: 'component-private' })),
      })),
    } as BookDeliveryBinding;
    const repository = new InMemoryBookDeliveryRepository();
    await repository.createDraft({ binding, operationId: operation(11), now: '2026-07-30T00:00:00.000Z' });
    await repository.activate({ bindingId, expectedRecordRevision: 0, operationId: operation(12), now: '2026-07-30T00:01:00.000Z' });
    const combined = { ...sourceLocation(), sourceVersionId: 'student-v1', providerObjectKey: 'private/combined.pdf', objectKey: 'private/combined.pdf' };
    const readObjectMetadata = vi.fn(async ({ identity }) => ({ identity, contentType: 'application/pdf' as const }));
    const readBounded = vi.fn(async ({ range }) => ({
      bytes: new Uint8Array(range.length), totalByteSize: combined.byteSize, offset: range.offset,
    }));
    const currentAuthority = vi.fn(async () => liveAuthority({
      sourceVersionIds: ['student-v1'], sourceLocations: [combined],
      studentDocument: { sourceVersionId: 'student-v1', descriptorRevision: 2, descriptorFingerprint: 'a'.repeat(64) },
    }));
    const handlers = createBookRouteHandlers({
      sourceDocument: { runtimeFactory: () => ({
        repository, provider: { readObjectMetadata, readBounded },
        readProfile: async () => ({ role: 'student', status: 'active' }),
        readCurrentAuthority: currentAuthority,
      }) },
    });
    const route = `${bindingId}-1-student-document`;
    const head = await handlers.serveAuthorizedDocument!(handlerInput(route)) as Response;
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(combined.byteSize));
    expect(head.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/u);
    expect(head.headers.get('etag')).not.toBe(`"${combined.checksum.value}"`);
    expect(route).not.toMatch(/component-private|student-v1|combined\.pdf/u);
    expect(head.headers.get('etag')).not.toContain(combined.providerObjectKey);
    expect(readObjectMetadata).toHaveBeenCalledWith({ identity: combined }, expect.anything());
    expect(readBounded).not.toHaveBeenCalled();

    const range = await handlers.serveAuthorizedDocument!({
      ...handlerInput(route, 'student-1', 'GET'),
      request: new Request(`https://worker.test/v1/book-delivery/document/${route}`, {
        method: 'GET', headers: { origin: 'http://localhost:5174', range: 'bytes=0-7' },
      }),
    }) as Response;
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe(`bytes 0-7/${combined.byteSize}`);
    expect((await range.arrayBuffer()).byteLength).toBe(8);

    const full = await handlers.serveAuthorizedDocument!(handlerInput(route, 'student-1', 'GET')) as Response;
    expect(full.status).toBe(200);
    expect((await full.arrayBuffer()).byteLength).toBe(combined.byteSize);
    const unsatisfiable = await handlers.serveAuthorizedDocument!({
      ...handlerInput(route, 'student-1', 'GET'),
      request: new Request(`https://worker.test/v1/book-delivery/document/${route}`, {
        method: 'GET', headers: { origin: 'http://localhost:5174', range: `bytes=${combined.byteSize}-` },
      }),
    }) as Response;
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('content-range')).toBe(`bytes */${combined.byteSize}`);

    currentAuthority.mockResolvedValueOnce(liveAuthority({ publicationStatus: 'unpublished', sourceLocations: [] }));
    const readsBeforeDenial = readObjectMetadata.mock.calls.length;
    const stale = await handlers.serveAuthorizedDocument!(handlerInput(route)) as Response;
    expect(stale.status).toBe(403);
    expect(readObjectMetadata).toHaveBeenCalledTimes(readsBeforeDenial);
  });

  it('denies descriptor/storage byte mismatch before provider access', async () => {
    const bindingId = `bd_${'e'.repeat(40)}`;
    const fullBinding = studentBinding();
    const binding = { ...fullBinding, bindingId, sourceSet: {
      strategy: 'component_pdfs' as const,
      sources: [{ ...fullBinding.sourceSet.sources[0]!, ownerNodeKey: 'unit-1', sourceOrder: 1 }],
    } } as BookDeliveryBinding;
    const repository = new InMemoryBookDeliveryRepository();
    await repository.createDraft({ binding, operationId: operation(13), now: '2026-07-30T00:00:00.000Z' });
    await repository.activate({ bindingId, expectedRecordRevision: 0, operationId: operation(14), now: '2026-07-30T00:01:00.000Z' });
    const storage = { ...sourceLocation(), sourceVersionId: 'student-v1' };
    const mismatchedOperation = { verifiedStorage: storage } as never;
    expect(studentDocumentOperationMatchesDescriptor(mismatchedOperation, {
      byteSize: storage.byteSize + 1, sha256Hex: storage.checksum.value,
    })).toBe(false);
    expect(studentDocumentOperationMatchesDescriptor(mismatchedOperation, {
      byteSize: storage.byteSize, sha256Hex: 'b'.repeat(64),
    })).toBe(false);
    const provider = { readObjectMetadata: vi.fn(), readBounded: vi.fn() };
    const handlers = createBookRouteHandlers({ sourceDocument: { runtimeFactory: () => ({
      repository, provider,
      readProfile: async () => ({ role: 'student', status: 'active' }),
      readCurrentAuthority: async () => ({
        publicationStatus: 'unpublished' as const, scheduleOpen: false,
        sourceVersionIds: [], revokedSourceVersionIds: [], sourceLocations: [],
      }),
    }) } });
    const response = await handlers.serveAuthorizedDocument!(
      handlerInput(`${bindingId}-1-student-document`),
    ) as Response;
    expect(response.status).toBe(403);
    expect(provider.readObjectMetadata).not.toHaveBeenCalled();
    expect(provider.readBounded).not.toHaveBeenCalled();
  });

  it('resolves a canonical projection route by indexed binding and invokes #51/#52', async () => {
    const repository = await readyRepository();
    const projection = await createBookDeliveryProjectionResolver({ repository }).resolve({
      recipientId: 'student-1',
      contextId: 'solo-1',
      actor: { uid: 'student-1' },
    });
    const readObjectMetadata = vi.fn(async ({ identity }) => ({
      identity,
      contentType: 'application/pdf' as const,
    }));
    const readBounded = vi.fn();
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider: { readObjectMetadata, readBounded },
          readProfile: async () => ({ role: 'student', status: 'active' }),
          readCurrentAuthority: async () => liveAuthority(),
        }),
      },
    });

    const response = await handlers.serveAuthorizedDocument!(
      handlerInput(projection.documentRequests[0]!.opaqueRouteKey),
    ) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-length')).toBe('578');
    expect(readObjectMetadata).toHaveBeenCalledTimes(1);
    expect(readBounded).not.toHaveBeenCalled();
  });

  it('denies noncanonical, copied-user, and stale-source routes before B2 access', async () => {
    const repository = await readyRepository();
    const projection = await createBookDeliveryProjectionResolver({ repository }).resolve({
      recipientId: 'student-1',
      contextId: 'solo-1',
      actor: { uid: 'student-1' },
    });
    const readObjectMetadata = vi.fn();
    const readBounded = vi.fn();
    const authority = vi.fn(async () => liveAuthority());
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider: { readObjectMetadata, readBounded },
          readProfile: async () => ({ role: 'student', status: 'active' }),
          readCurrentAuthority: authority,
        }),
      },
    });

    const malformed = await handlers.serveAuthorizedDocument!(
      handlerInput('binding-worker-1-full-source-v1'),
    ) as Response;
    expect(malformed.status).toBe(404);

    const copied = await handlers.serveAuthorizedDocument!(
      handlerInput(projection.documentRequests[0]!.opaqueRouteKey, 'student-2'),
    ) as Response;
    expect(copied.status).toBe(401);

    authority.mockResolvedValueOnce(liveAuthority({ sourceLocations: [] }));
    const stale = await handlers.serveAuthorizedDocument!(
      handlerInput(projection.documentRequests[0]!.opaqueRouteKey),
    ) as Response;
    expect(stale.status).toBe(409);

    expect(readObjectMetadata).not.toHaveBeenCalled();
    expect(readBounded).not.toHaveBeenCalled();
  });

  it('checks the active student profile before any Delivery lookup', async () => {
    const repository = await readyRepository();
    const readBinding = vi.spyOn(repository, 'readBinding');
    const resolveCurrent = vi.spyOn(repository, 'resolveCurrent');
    const provider = {
      readObjectMetadata: vi.fn(),
      readBounded: vi.fn(),
    };
    const handlers = createBookRouteHandlers({
      sourceDocument: {
        runtimeFactory: () => ({
          repository,
          provider,
          readProfile: async () => ({ role: 'student', status: 'disabled' }),
          readCurrentAuthority: async () => liveAuthority(),
        }),
      },
    });

    const response = await handlers.serveAuthorizedDocument!(
      handlerInput(`${canonicalBindingId}-1-full-source-v1`),
    ) as Response;

    expect(response.status).toBe(403);
    expect(readBinding).not.toHaveBeenCalled();
    expect(resolveCurrent).not.toHaveBeenCalled();
    expect(provider.readObjectMetadata).not.toHaveBeenCalled();
  });

  it('reaches the composed handler only after canonical auth and gate checks', async () => {
    const handler = vi.fn(async () => new Response('ok', {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-length': '2' },
    }));
    const router = createBookRouter({
      firebaseVerifier: {
        verifyAuthorizationHeader: async (authorization) => (
          authorization === 'Bearer student-token'
            ? { valid: true, uid: 'student-1' }
            : { valid: false }
        ),
      },
      routeHandlers: { documentHandler: handler },
    });
    const env = {
      BOOK_DOCUMENT_DELIVERY_ROUTES_ENABLED: 'enabled',
      BOOK_DELIVERY_SERVICE_IDENTITY: 'book-delivery-runtime@temp-a1437.iam.gserviceaccount.com',
      BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'book-delivery-runtime@temp-a1437.iam.gserviceaccount.com',
        private_key: 'test-only',
      }),
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    };
    const route = `/v1/book-delivery/document/${encodeURIComponent(
      `${canonicalBindingId}-1-full-source-v1`,
    )}`;
    const denied = await router.fetch(new Request(`https://worker.test${route}`, {
      method: 'HEAD',
      headers: { origin: 'http://localhost:5174' },
    }), env);
    expect(denied?.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();

    const allowed = await router.fetch(new Request(`https://worker.test${route}`, {
      method: 'HEAD',
      headers: {
        origin: 'http://localhost:5174',
        authorization: 'Bearer student-token',
      },
    }), env);
    expect(allowed?.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].params.opaqueRouteKey).toBe(
      `${canonicalBindingId}-1-full-source-v1`,
    );
  });

  it('derives revoked source versions from cleanup, retirement-pending, and release operations', () => {
    const revoked = deriveRevokedBookSourceVersionIds({
      cleanup: { sourceVersionId: 'source-v1', status: 'cleanup_pending' },
      released: { sourceVersionId: 'source-v2', status: 'released' },
      active: { sourceVersionId: 'source-v3', status: 'verified_completed' },
      pending: { sourceVersionId: 'source-v4', status: 'retirement_pending' },
    } as never, ['source-v1', 'source-v2', 'source-v3', 'source-v4']);
    expect(revoked).toEqual(['source-v1', 'source-v2', 'source-v4']);
  });

  it('requires assignment start but never narrows an authorized PDF by nested schedules', () => {
    const binding = {
      ...studentBinding(),
      bindingId: bookHomeworkRecipientDeliveryBindingId('homework-1', 'student-1'),
      context: {
        kind: 'homework',
        contextId: 'homework-1',
        recipientId: 'student-1',
        ownerId: 'teacher-1',
        entitlementBasis: 'assignment',
      },
      scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
      outline: [
        {
          nodeKey: 'unit-1',
          parentNodeKey: null,
          nodeType: 'unit',
          order: 1,
        },
        {
          nodeKey: 'activity-container-1',
          parentNodeKey: 'unit-1',
          nodeType: 'section',
          order: 1,
        },
      ],
    } as BookDeliveryBinding;
    const placement = binding.placements[0]!;
    const authority: BookHomeworkAuthorityRecord = {
      assignmentId: bookHomeworkRecipientAuthorityId('homework-1', 'student-1'),
      assignmentKind: 'book_activity_bundle',
      schemaVersion: 1,
      ownerId: 'teacher-1',
      bookManifest: {
        schemaVersion: 1,
        assignmentKind: 'book_activity_bundle',
        manifestVersionId: 'manifest-1',
        ownerId: 'teacher-1',
        createdByCommandId: 'command-1',
        createdAt: '2026-07-29T00:00:00.000Z',
        bindingRevision: 1,
        book: binding.book,
        context: {
          contextId: 'homework-1',
          recipientId: 'student-1',
          kind: 'homework',
          entitlementBasis: 'assignment',
        },
        selectedTarget: { kind: 'unit', bookId: binding.book.bookId, nodeKey: 'unit-1' },
        outline: binding.outline,
        scheduleRules: [{
          nodeKey: 'activity-container-1',
          availableFrom: '2026-07-31T00:00:00.000Z',
        }],
        bindings: [{
          bindingId: 'activity-binding-1',
          placementId: placement.placementId,
          activityId: placement.activityId,
          activityVersionId: placement.activityVersionId,
          activityVersion: placement.activityVersion,
          nodeKey: placement.nodeKey,
          order: placement.order,
          contextMode: placement.contextMode,
          pageGroupKeys: placement.pageGroupKeys,
          sourceReadiness: 'ready',
          sourceContext: placement.sourcePageScopes.map((source) => ({
            sourceKey: source.sourceKey,
            sourceVersionId: binding.sourceSet.sources.find(
              (candidate) => candidate.sourceKey === source.sourceKey,
            )!.sourceVersionId,
            physicalPageNumbers: source.pages,
          })),
          state: 'required',
        }],
        completion: {
          aggregation: 'required-activities-submitted-over-required-activities',
          requiredBindingCount: 1,
          excludedBindingCount: 0,
          legacyScoreFields: 'untouched',
        },
      },
      schedule: {
        schemaVersion: 1,
        resolverVersion: 1,
        availableFrom: '2026-07-30T00:00:00.000Z',
        finalDueAt: '2026-08-01T00:00:00.000Z',
        scheduleRules: [{
          nodeKey: 'activity-container-1',
          availableFrom: '2026-07-31T00:00:00.000Z',
        }],
      },
      studentExtensions: {},
      saga: { sagaId: 'homework-1', state: 'committed', lastCommandId: 'command-1' },
      visibility: {
        status: 'committed',
        pointerId: 'manifest-1',
        manifestVersionId: 'manifest-1',
        revision: 1,
      },
      revision: 1,
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    };

    expect(isBookHomeworkDocumentScheduleOpen(
      binding,
      authority,
      new Date('2026-07-29T23:59:59.999Z'),
    )).toBe(false);
    expect(isBookHomeworkDocumentScheduleOpen(
      binding,
      authority,
      new Date('2026-07-30T12:00:00.000Z'),
    )).toBe(true);
  });
});
