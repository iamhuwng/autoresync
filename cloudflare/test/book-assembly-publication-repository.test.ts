import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyActivitySafeProjectionRecord,
  BookAssemblyActivityVersionRecord,
  BookAssemblyDeliveryPublicationPlan,
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyPlacementRecord,
  BookAssemblyPublicationAuditRecord,
  BookAssemblyPublishedUnitProjectionRecord,
  BookAssemblyStudentSafePublicationProjection,
  SourceQualifiedPageIdentity,
  SourceSetCandidate,
} from '../../src/types/bookAssembly.types';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service';
import type { BookAssemblyPublicationScope } from '../../src/services/book-assembly/publicationRepository';
import {
  BOOK_ASSEMBLY_PUBLICATION_ROOT,
  FirebaseRestBookAssemblyPublicationRepository,
} from '../src/upload-worker/book-assembly/publication-repository';

const env = {
  FIREBASE_DB_URL: 'https://firebase.test',
  BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.iam.gserviceaccount.com',
} as const;

const operationId = '00000000-0000-4000-8000-000000000001';
const concurrentOperationId = '00000000-0000-4000-8000-000000000002';
const createdAt = '2026-07-27T00:00:00.000Z';

const createFetchHarness = (
  initial: unknown = null,
  rejectFirstPut = false,
  concurrentState: unknown = null,
  failPut = false,
) => {
  const calls: string[] = [];
  const etagRequests: string[] = [];
  const ifMatches: string[] = [];
  let stored = initial;
  let etag = '"scope-1"';
  let rejected = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = String(init?.method ?? 'GET');
    const headers = new Headers(init?.headers);
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
    calls.push(method + ' ' + path);
    if (method === 'GET') {
      etagRequests.push(headers.get('x-firebase-etag') ?? '');
      if (headers.get('x-firebase-etag') !== 'true') return new Response('', { status: 400 });
      return new Response(JSON.stringify(stored), { status: 200, headers: { etag } });
    }
    if (method === 'PUT') {
      ifMatches.push(headers.get('if-match') ?? '');
      if (failPut) return new Response('', { status: 500 });
      if (rejectFirstPut && !rejected) {
        rejected = true;
        stored = concurrentState;
        etag = '"scope-concurrent"';
        return new Response('', { status: 412 });
      }
      stored = JSON.parse(String(init?.body ?? 'null')) as unknown;
      etag = '"scope-committed"';
      return new Response('', { status: 200 });
    }
    return new Response('', { status: 405 });
  };
  return { calls, etagRequests, ifMatches, fetchImpl, read: () => stored };
};

const completeScope = (
  commandId = operationId,
): BookAssemblyPublicationScope<BookAssemblyPublicationResult> => {
  const sourceSet: SourceSetCandidate = {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }],
  };
  const sourcePages: readonly SourceQualifiedPageIdentity[] = [{
    sourceKey: 'full',
    sourceVersionId: 'source-1',
    physicalPageNumber: 1,
  }];
  const manifest: BookAssemblyManifestCandidate = {
    bookId: 'book-1',
    sourceSet,
    nodes: [
      { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
    ],
    units: [{
      unitKey: 'unit-1',
      activitySlots: [{
        activityKey: 'activity-1',
        order: 1,
        contextRequirement: 'required',
        pageGroupKeys: ['pages-1'],
      }],
      pageGroups: [{
        pageGroupKey: 'pages-1',
        sourceKey: 'full',
        pages: [1],
        activityKeys: ['activity-1'],
        mode: 'activity',
      }],
    }],
  };
  const studentSafeProjection: BookAssemblyStudentSafePublicationProjection = {
    schemaVersion: 1,
    bookId: 'book-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    sourceStrategy: 'full_pdf',
    sourceSet,
    units: manifest.units,
  };
  const activityVersion: BookAssemblyActivityVersionRecord = {
    schemaVersion: 1,
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    ownerId: 'teacher-1',
    bookId: 'book-1',
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    unitKey: 'unit-1',
    activityKey: 'activity-1',
    createdByCommandId: commandId,
    createdAt,
    sourcePages,
    payloadFingerprint: 'fnv1a64:activity',
  };
  const activitySafeProjection: BookAssemblyActivitySafeProjectionRecord = {
    schemaVersion: 1,
    projectionId: 'projection-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    placementIds: ['placement-1'],
    sourcePages,
    payloadFingerprint: 'fnv1a64:safe',
  };
  const placement: BookAssemblyPlacementRecord = {
    schemaVersion: 1,
    placementId: 'placement-1',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    unitKey: 'unit-1',
    nodeKey: 'unit-1',
    activityKey: 'activity-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    order: 1,
    pageGroupKeys: ['pages-1'],
    sourcePages,
  };
  const unitProjection: BookAssemblyPublishedUnitProjectionRecord = {
    schemaVersion: 1,
    unitProjectionId: 'unit-projection-1',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    unitKey: 'unit-1',
    placementIds: ['placement-1'],
    sourcePages,
    createdByCommandId: commandId,
    createdAt,
  };
  const deliveryPlan: BookAssemblyDeliveryPublicationPlan = {
    schemaVersion: 1,
    deliveryPlanId: 'delivery-plan-1',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    sourceStrategy: 'full_pdf',
    sourceSet,
    placementIds: ['placement-1'],
    unitProjectionIds: ['unit-projection-1'],
    createdByCommandId: commandId,
    createdAt,
  };
  const version: BookAssemblyImmutableManifestVersion = {
    schemaVersion: 1,
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    lifecycle: 'published',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    bookRevision: 1,
    sourceSetRevision: 1,
    candidateId: 'candidate-1',
    candidateRevision: 1,
    strategy: 'full_pdf',
    adapterTicket: 'fixture',
    inputFingerprint: 'fnv1a64:manifest',
    createdByCommandId: commandId,
    createdAt,
    manifest,
    studentSafeProjection,
  };
  const audit: BookAssemblyPublicationAuditRecord = {
    auditId: 'audit-1',
    operationId: commandId,
    action: 'publish',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    manifestVersionId: 'manifest-1',
    inputFingerprint: 'fnv1a64:manifest',
    status: 'committed',
    createdAt,
  };
  return {
    versions: { 'manifest-1': version },
    activityVersions: { 'activity-version-1': activityVersion },
    activitySafeProjections: { 'projection-1': activitySafeProjection },
    placements: { 'placement-1': placement },
    unitProjections: { 'unit-projection-1': unitProjection },
    deliveryPlans: { 'delivery-plan-1': deliveryPlan },
    current: {
      publicationId: 'publication-1',
      publicationRevision: 1,
      manifestVersionId: 'manifest-1',
      bookRevision: 1,
      sourceSetRevision: 1,
      inputFingerprint: 'fnv1a64:manifest',
      updatedAt: createdAt,
      updatedByCommandId: commandId,
    },
    operations: {
      [commandId]: {
        ownerId: 'teacher-1',
        fingerprint: 'fnv1a64:manifest',
        result: { status: 'published' },
        createdAt,
      },
    },
    audits: { 'audit-1': audit },
  };
};

describe('Book Assembly publication Firebase repository', () => {
  it('persists the complete publication scope through one book-level ETag CAS path', async () => {
    const concurrent = completeScope(concurrentOperationId);
    const scope = completeScope();
    const harness = createFetchHarness(null, true, concurrent);
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    let sawConcurrentState = false;

    await expect(repository.transaction('book-1', (current) => {
      sawConcurrentState ||= Boolean(current.operations?.[concurrentOperationId]);
      return {
        outcome: 'committed',
        next: {
          ...current,
          ...scope,
          operations: { ...(current.operations ?? {}), ...(scope.operations ?? {}) },
        },
        write: true,
      };
    })).resolves.toBe('committed');

    const expected = {
      ...scope,
      operations: { ...(concurrent.operations ?? {}), ...(scope.operations ?? {}) },
    };
    const read = await repository.readScope('book-1');
    expect(sawConcurrentState).toBe(true);
    expect(read).toEqual(expected);
    expect(harness.read()).toEqual(expected);
    expect(harness.etagRequests).toEqual(['true', 'true', 'true']);
    expect(harness.ifMatches).toEqual(['\"scope-1\"', '\"scope-concurrent\"']);
    expect(harness.calls).toEqual([
      'GET ' + BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1',
      'PUT ' + BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1',
      'GET ' + BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1',
      'PUT ' + BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1',
      'GET ' + BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1',
    ]);
  });

  it('returns no-write outcomes without a PUT and rejects unsafe paths or credentials', async () => {
    const harness = createFetchHarness(null);
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'test-token',
    });

    await expect(repository.transaction('book-1', () => ({
      outcome: 'replayed',
      write: false,
    }))).resolves.toBe('replayed');
    expect(harness.calls).toEqual(['GET ' + BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1']);
    expect(harness.etagRequests).toEqual(['true']);
    await expect(repository.readScope('../book-1'))
      .rejects.toThrow('invalid_book_assembly_publication_book_id');
    expect(() => new FirebaseRestBookAssemblyPublicationRepository({
      env: { FIREBASE_DB_URL: env.FIREBASE_DB_URL },
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'test-token',
    })).toThrow('missing_book_assembly_publication_service_identity');
    expect(() => new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
    })).toThrow('missing_book_assembly_publication_google_sa_key');

    const exhaustedHarness = createFetchHarness(null, true);
    const exhaustedRepository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: exhaustedHarness.fetchImpl,
      getAccessToken: async () => 'test-token',
      maxRetries: 1,
    });
    await expect(exhaustedRepository.transaction('book-1', () => ({
      outcome: 'not-committed',
      next: completeScope(),
      write: true,
    }))).rejects.toThrow('book_assembly_publication_scope_cas_retries_exhausted');
    expect(exhaustedHarness.read()).toBeNull();
  });

  it('preserves the prior aggregate when a durable commit fails before storage mutation', async () => {
    const prior = completeScope();
    const harness = createFetchHarness(prior, false, null, true);
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'test-token',
      maxRetries: 1,
    });

    await expect(repository.transaction('book-1', () => ({
      outcome: 'not-committed',
      next: completeScope(concurrentOperationId),
      write: true,
    }))).rejects.toThrow('firebase_rtdb_put_failed:500:');

    await expect(repository.readScope('book-1')).resolves.toEqual(prior);
    expect(harness.read()).toEqual(prior);
  });

  it('fails closed on stored sensitive publication payloads', async () => {
    const harness = createFetchHarness({
      versions: {
        'manifest-1': {
          manifestVersionId: 'manifest-1',
          bookId: 'book-1',
          ownerId: 'teacher-1',
          answer_key: 'must-not-persist',
        },
      },
    });
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'test-token',
    });

    await expect(repository.readScope('book-1'))
      .rejects.toThrow('invalid_book_assembly_publication_scope');
  });

  it('fails closed on malformed nested records and replay results', async () => {
    const malformedNested = JSON.parse(JSON.stringify(completeScope())) as Record<string, unknown>;
    const versions = malformedNested.versions as Record<string, Record<string, unknown>>;
    const version = versions['manifest-1']!;
    const malformedManifest = version.manifest as Record<string, unknown>;
    const malformedSourceSet = malformedManifest.sourceSet as Record<string, unknown>;
    malformedSourceSet.sources = [];
    const nestedRepository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: createFetchHarness(malformedNested).fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    await expect(nestedRepository.readScope('book-1'))
      .rejects.toThrow('invalid_book_assembly_publication_record');

    const malformedResult = JSON.parse(JSON.stringify(completeScope())) as Record<string, unknown>;
    const operations = malformedResult.operations as Record<string, Record<string, unknown>>;
    operations[operationId]!.result = { status: 'not-a-publication-result' };
    const resultRepository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: createFetchHarness(malformedResult).fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    await expect(resultRepository.readScope('book-1'))
      .rejects.toThrow('invalid_book_assembly_publication_operation');
  });
});
