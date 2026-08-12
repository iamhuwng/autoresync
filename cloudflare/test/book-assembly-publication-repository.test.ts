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
import {
  bookAssemblyActivityVersionScopeKey,
  type BookAssemblyPublicationResult,
} from '../../src/services/book-assembly/publicationTransaction.service';
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

type FetchHarnessOptions = {
  rejectFirstPointerPut?: boolean;
  concurrentState?: unknown;
  failPutPath?: string;
};

const createFetchHarness = (
  initial: unknown = null,
  options: FetchHarnessOptions = {},
) => {
  const calls: string[] = [];
  const etagRequests: string[] = [];
  const ifMatches: string[] = [];
  const authTokens: string[] = [];
  const authorizationHeaders: string[] = [];
  let stored = initial;
  const scopeRoot = BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1';
  const etags = new Map<string, string>([['current', '"scope-1"']]);
  let rejected = false;
  const relativePath = (path: string): string => path.slice(scopeRoot.length).replace(/^\//u, '');
  const readAt = (path: string): unknown => {
    const relative = relativePath(path);
    if (!relative) return stored;
    let cursor: unknown = stored;
    for (const segment of relative.split('/')) {
      if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return null;
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor ?? null;
  };
  const writeAt = (path: string, value: unknown): void => {
    const segments = relativePath(path).split('/');
    if (!segments[0]) throw new Error('cannot write publication scope ancestor');
    const root = (stored !== null && typeof stored === 'object' && !Array.isArray(stored))
      ? stored as Record<string, unknown>
      : {};
    let cursor = root;
    for (const segment of segments.slice(0, -1)) {
      const child = cursor[segment];
      if (child === null || typeof child !== 'object' || Array.isArray(child)) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[segments.at(-1)!] = value;
    stored = root;
  };
  const etagFor = (path: string): string => {
    const relative = relativePath(path);
    if (!etags.has(relative)) etags.set(relative, `"empty-${relative}"`);
    return etags.get(relative)!;
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = String(init?.method ?? 'GET');
    const headers = new Headers(init?.headers);
    const url = new URL(String(input));
    const auth = url.searchParams.get('auth');
    if (auth !== null) authTokens.push(auth);
    const authorization = headers.get('authorization');
    if (authorization !== null) authorizationHeaders.push(authorization);
    const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
    calls.push(method + ' ' + path);
    if (method === 'GET') {
      etagRequests.push(headers.get('x-firebase-etag') ?? '');
      if (headers.get('x-firebase-etag') !== 'true' && relativePath(path) !== '') {
        return new Response('', { status: 400 });
      }
      return new Response(JSON.stringify(readAt(path)), {
        status: 200,
        headers: { etag: etagFor(path) },
      });
    }
    if (method === 'PUT') {
      ifMatches.push(headers.get('if-match') ?? '');
      const relative = relativePath(path);
      if (relative === '') return new Response('ancestor PUT forbidden', { status: 400 });
      if (options.failPutPath === path) return new Response('', { status: 500 });
      if (headers.get('if-match') !== etagFor(path)) return new Response('', { status: 412 });
      if (relative === 'current' && options.rejectFirstPointerPut && !rejected) {
        rejected = true;
        stored = options.concurrentState ?? null;
        for (const key of etags.keys()) {
          if (key !== 'current') etags.delete(key);
        }
        etags.set('current', '"scope-concurrent"');
        return new Response('', { status: 412 });
      }
      writeAt(path, JSON.parse(String(init?.body ?? 'null')) as unknown);
      etags.set(relative, `"committed-${relative}"`);
      return new Response('', { status: 200 });
    }
    return new Response('', { status: 405 });
  };
  return {
    calls,
    etagRequests,
    ifMatches,
    authTokens,
    authorizationHeaders,
    fetchImpl,
    read: () => stored,
  };
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
    safeProjectionId: 'projection-1',
    canonicalOriginManifestVersionId: 'manifest-1',
    canonicalOriginPublicationId: 'publication-1',
    canonicalOriginOperationId: commandId,
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
    activityVersions: {
      [bookAssemblyActivityVersionScopeKey('manifest-1', 'activity-version-1')]: activityVersion,
    },
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
      operationFingerprint: 'fnv1a64:operation',
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

const toWireScope = <Result>(scope: BookAssemblyPublicationScope<Result>): Record<string, unknown> => {
  const wire: Record<string, unknown> = {};
  if (scope.versions !== undefined) wire.versions = scope.versions;
  if (scope.activityVersions !== undefined) wire.activity_versions = scope.activityVersions;
  if (scope.activitySafeProjections !== undefined) {
    wire.activity_safe_projections = scope.activitySafeProjections;
  }
  if (scope.placements !== undefined) wire.placements = scope.placements;
  if (scope.unitProjections !== undefined) wire.unit_projections = scope.unitProjections;
  if (scope.deliveryPlans !== undefined) wire.delivery_plans = scope.deliveryPlans;
  if (scope.current !== undefined) wire.current = scope.current;
  if (scope.operations !== undefined) wire.operations = scope.operations;
  if (scope.audits !== undefined) wire.audits = scope.audits;
  return wire;
};

const markerScope = (
  count: number,
): BookAssemblyPublicationScope<BookAssemblyPublicationResult> => {
  const operations: NonNullable<BookAssemblyPublicationScope<BookAssemblyPublicationResult>['operations']> = {};
  const audits: NonNullable<BookAssemblyPublicationScope<BookAssemblyPublicationResult>['audits']> = {};
  for (let index = 1; index <= count; index += 1) {
    const operationId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const action: BookAssemblyPublicationAuditRecord['action'] = index % 2 === 0 ? 'rollback' : 'publish';
    const publicationId = `publication-${index}`;
    const manifestVersionId = `manifest-${index}`;
    const inputFingerprint = `fnv1a64:marker-${index}`;
    const at = `2026-07-27T00:00:${String(index % 60).padStart(2, '0')}.000Z`;
    operations[operationId] = {
      ownerId: 'teacher-1',
      fingerprint: inputFingerprint,
      result: { status: action === 'publish' ? 'published' : 'rolled-back' },
      createdAt: at,
    };
    const auditId = `${action}:${operationId}`;
    audits[auditId] = {
      auditId,
      operationId,
      action,
      ownerId: 'teacher-1',
      bookId: 'book-1',
      publicationId,
      publicationRevision: index,
      manifestVersionId,
      inputFingerprint,
      status: 'committed',
      createdAt: at,
    };
  }
  const lastOperationId = `00000000-0000-4000-8000-${String(count).padStart(12, '0')}`;
  return {
    current: {
      publicationId: `publication-${count}`,
      publicationRevision: count,
      manifestVersionId: `manifest-${count}`,
      bookRevision: count,
      sourceSetRevision: count,
      inputFingerprint: `fnv1a64:marker-${count}`,
      operationFingerprint: `fnv1a64:operation-${count}`,
      updatedAt: `2026-07-27T00:00:${String(count % 60).padStart(2, '0')}.000Z`,
      updatedByCommandId: lastOperationId,
    },
    operations,
    audits,
  };
};

describe('Book Assembly publication Firebase repository', () => {
  it('prepares exact immutable child paths, retries the pointer CAS, and heals prepared children', async () => {
    const concurrent = completeScope(concurrentOperationId);
    const scope = completeScope();
    const scopePath = BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1';
    const immutablePaths = [
      `${scopePath}/versions/manifest-1`,
      `${scopePath}/activity_versions/${bookAssemblyActivityVersionScopeKey('manifest-1', 'activity-version-1')}`,
      `${scopePath}/activity_safe_projections/projection-1`,
      `${scopePath}/placements/placement-1`,
      `${scopePath}/unit_projections/unit-projection-1`,
      `${scopePath}/delivery_plans/delivery-plan-1`,
    ];
    const markerPaths = [
      `${scopePath}/audits/audit-1`,
      `${scopePath}/operations/${operationId}`,
    ];
    const concurrentState = { operations: concurrent.operations };
    const harness = createFetchHarness(null, {
      rejectFirstPointerPut: true,
      concurrentState: toWireScope(concurrentState),
    });
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
    }, operationId)).resolves.toBe('committed');

    const expected = {
      ...scope,
      operations: { ...(concurrent.operations ?? {}), ...(scope.operations ?? {}) },
    };
    const read = await repository.readScope('book-1');
    expect(sawConcurrentState).toBe(true);
    expect(read).toEqual(expected);
    expect(harness.read()).toEqual(toWireScope(expected));
    expect(Object.keys(harness.read() as Record<string, unknown>)).toEqual([
      'operations',
      'versions',
      'activity_versions',
      'activity_safe_projections',
      'placements',
      'unit_projections',
      'delivery_plans',
      'current',
      'audits',
    ]);
    const prepared = (paths: readonly string[]): string[] => paths.flatMap((path) => [
      'GET ' + path,
      'PUT ' + path,
    ]);
    const firstAttempt = [
      'GET ' + scopePath,
      'GET ' + scopePath + '/current',
      ...prepared(immutablePaths),
      'PUT ' + scopePath + '/current',
    ];
    const secondAttempt = [
      'GET ' + scopePath,
      'GET ' + scopePath + '/current',
      ...prepared(immutablePaths),
      'PUT ' + scopePath + '/current',
      ...prepared(markerPaths),
      'GET ' + scopePath,
    ];
    expect(harness.calls).toEqual([...firstAttempt, ...secondAttempt]);
    expect(harness.calls).not.toContain('PUT ' + scopePath);
    expect(harness.ifMatches).toEqual([
      ...immutablePaths.map((path) => `"empty-${path.slice(scopePath.length + 1)}"`),
      '"scope-1"',
      ...immutablePaths.map((path) => `"empty-${path.slice(scopePath.length + 1)}"`),
      '"scope-concurrent"',
      ...markerPaths.map((path) => `"empty-${path.slice(scopePath.length + 1)}"`),
    ]);
    expect(harness.etagRequests[0]).toBe('');
    expect(harness.etagRequests.filter((value) => value === '')).toHaveLength(2);
    expect(harness.etagRequests.every((value) => value === '' || value === 'true')).toBe(true);
  });

  it('repairs missing commit markers after a pointer-visible crash before replay', async () => {
    const committed = completeScope();
    const interrupted = {
      ...committed,
      operations: undefined,
      audits: undefined,
    };
    const scopePath = BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1';
    const auditId = `publish:${operationId}`;
    const harness = createFetchHarness(toWireScope(interrupted));
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'test-token',
    });

    await expect(repository.transaction('book-1', (current) => {
      expect(current.operations?.[operationId]?.result).toMatchObject({
        status: 'published',
        pointer: { manifestVersionId: 'manifest-1' },
      });
      expect(current.audits?.[auditId]).toMatchObject({
        action: 'publish',
        status: 'committed',
      });
      return { outcome: 'replayed', write: false };
    }, operationId, committed.current!.operationFingerprint)).resolves.toBe('replayed');

    expect(harness.calls).toEqual([
      `GET ${scopePath}`,
      `GET ${scopePath}/current`,
      `GET ${scopePath}/audits/${auditId}`,
      `PUT ${scopePath}/audits/${auditId}`,
      `GET ${scopePath}/operations/${operationId}`,
      `PUT ${scopePath}/operations/${operationId}`,
    ]);
  });

  it('does not repair missing markers for a mismatched operation fingerprint', async () => {
    const committed = completeScope();
    const interrupted = {
      ...committed,
      operations: undefined,
      audits: undefined,
    };
    const scopePath = BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1';
    const harness = createFetchHarness(toWireScope(interrupted));
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'test-token',
    });

    await expect(repository.transaction('book-1', (current) => {
      expect(current.operations?.[operationId]).toBeUndefined();
      return { outcome: 'not-replayed', write: false };
    }, operationId, 'fnv1a64:mismatched')).resolves.toBe('not-replayed');

    expect(harness.calls).toEqual([
      `GET ${scopePath}`,
      `GET ${scopePath}/current`,
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
    expect(harness.calls).toEqual([
      'GET ' + BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1',
      'GET ' + BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1/current',
    ]);
    expect(harness.etagRequests).toEqual(['', 'true']);
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

    const exhaustedHarness = createFetchHarness(null, { rejectFirstPointerPut: true });
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
    }))).rejects.toThrow('book_assembly_publication_pointer_cas_retries_exhausted');
    expect(exhaustedHarness.read()).toBeNull();
  });

  it('uses a Firebase auth query for exact-book read-only access while mutations retain OAuth auth', async () => {
    const harness = createFetchHarness(null);
    const requestedBookIds: string[] = [];
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'oauth-token',
      getFirebaseAuthToken: async (bookId) => {
        requestedBookIds.push(bookId);
        return 'firebase-id-token';
      },
    });

    await expect(repository.readScope('book-1')).resolves.toEqual({});
    expect(requestedBookIds).toEqual(['book-1']);
    expect(harness.authTokens).toEqual(['firebase-id-token']);
    expect(harness.authorizationHeaders).toEqual([]);

    await expect(repository.transaction('book-1', () => ({
      outcome: 'read-only',
      write: false,
    }))).resolves.toBe('read-only');
    expect(harness.authTokens).toEqual(['firebase-id-token']);
    expect(harness.authorizationHeaders).toEqual(['Bearer oauth-token', 'Bearer oauth-token']);
  });

  it('rejects immutable updates and deletes without issuing child writes', async () => {
    const scopePath = BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1';
    const prior = completeScope();
    const changedVersion = {
      ...prior.versions!['manifest-1']!,
      inputFingerprint: 'fnv1a64:changed',
    };
    const updateHarness = createFetchHarness(toWireScope(prior));
    const updateRepository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: updateHarness.fetchImpl,
      getAccessToken: async () => 'test-token',
      maxRetries: 1,
    });
    await expect(updateRepository.transaction('book-1', () => ({
      outcome: 'updated',
      next: {
        ...prior,
        versions: { ...prior.versions, 'manifest-1': changedVersion },
      },
      write: true,
    }))).rejects.toThrow('book_assembly_publication_immutable_update:versions/manifest-1');
    expect(updateHarness.calls).toEqual([
      'GET ' + scopePath,
      'GET ' + scopePath + '/current',
    ]);
    expect(updateHarness.read()).toEqual(toWireScope(prior));

    const deleteHarness = createFetchHarness(toWireScope(prior));
    const deleteRepository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: deleteHarness.fetchImpl,
      getAccessToken: async () => 'test-token',
      maxRetries: 1,
    });
    await expect(deleteRepository.transaction('book-1', () => ({
      outcome: 'deleted',
      next: {
        ...prior,
        placements: {},
      },
      write: true,
    }))).rejects.toThrow('book_assembly_publication_immutable_delete:placements');
    expect(deleteHarness.calls).toEqual([
      'GET ' + scopePath,
      'GET ' + scopePath + '/current',
    ]);
    expect(deleteHarness.read()).toEqual(toWireScope(prior));
  });

  it('leaves the pointer and prior state unchanged when an exact child write fails', async () => {
    const prior = completeScope();
    const priorVersion = prior.versions!['manifest-1']!;
    const addedVersion: BookAssemblyImmutableManifestVersion = {
      ...priorVersion,
      manifestVersionId: 'manifest-2',
      publicationId: 'publication-2',
      publicationRevision: 2,
      studentSafeProjection: {
        ...priorVersion.studentSafeProjection,
        publicationId: 'publication-2',
        publicationRevision: 2,
      },
    };
    const scopePath = BOOK_ASSEMBLY_PUBLICATION_ROOT + '/book-1';
    const failedPath = `${scopePath}/versions/manifest-2`;
    const harness = createFetchHarness(toWireScope(prior), { failPutPath: failedPath });
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: harness.fetchImpl,
      getAccessToken: async () => 'test-token',
      maxRetries: 1,
    });

    await expect(repository.transaction('book-1', () => ({
      outcome: 'not-committed',
      next: {
        ...prior,
        versions: { ...prior.versions, 'manifest-2': addedVersion },
      },
      write: true,
    }))).rejects.toThrow('firebase_rtdb_put_failed:500:');

    await expect(repository.readScope('book-1')).resolves.toEqual(prior);
    expect(harness.read()).toEqual(toWireScope(prior));
    expect(harness.calls).toEqual([
      'GET ' + scopePath,
      'GET ' + scopePath + '/current',
      'GET ' + failedPath,
      'PUT ' + failedPath,
      'GET ' + scopePath,
    ]);
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

  it('accepts 257 valid immutable operation and audit markers under the 2 MiB scope cap', async () => {
    const scope = markerScope(257);
    const wire = toWireScope(scope);
    const scopeBytes = new TextEncoder().encode(JSON.stringify(wire)).byteLength;
    expect(scopeBytes).toBeLessThan(2 * 1024 * 1024);
    expect(Object.keys(wire.operations as Record<string, unknown>)).toHaveLength(257);
    expect(Object.keys(wire.audits as Record<string, unknown>)).toHaveLength(257);
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: createFetchHarness(wire).fetchImpl,
      getAccessToken: async () => 'test-token',
    });

    const read = await repository.readScope('book-1');
    expect(read.current).toEqual(scope.current);
    expect(Object.keys(read.operations ?? {})).toHaveLength(257);
    expect(Object.keys(read.audits ?? {})).toHaveLength(257);
  });

  it('round-trips a collision-free Activity reference key built from maximum-length IDs', async () => {
    const manifestVersionId = 'm'.repeat(160);
    const activityVersionId = 'a'.repeat(160);
    const key = bookAssemblyActivityVersionScopeKey(manifestVersionId, activityVersionId);
    expect(key.length).toBeGreaterThan(160);
    const base = completeScope().activityVersions![
      bookAssemblyActivityVersionScopeKey('manifest-1', 'activity-version-1')
    ]!;
    const record = {
      ...base,
      manifestVersionId,
      activityVersionId,
    };
    const repository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: createFetchHarness({
        activity_versions: { [key]: record },
      }).fetchImpl,
      getAccessToken: async () => 'test-token',
    });

    await expect(repository.readScope('book-1')).resolves.toMatchObject({
      activityVersions: {
        [key]: { manifestVersionId, activityVersionId },
      },
    });
  });

  it('accepts canonical student-safe records and rejects private or unknown nested fields', async () => {
    const validRepository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: createFetchHarness(toWireScope(completeScope())).fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    await expect(validRepository.readScope('book-1')).resolves.toMatchObject(completeScope());

    const malformedScopes = [
      (() => {
        const scope = structuredClone(toWireScope(completeScope())) as Record<string, unknown>;
        const version = (scope.versions as Record<string, Record<string, unknown>>)['manifest-1']!;
        (version.studentSafeProjection as Record<string, unknown>).teacherNotes = 'private';
        return scope;
      })(),
      (() => {
        const scope = structuredClone(toWireScope(completeScope())) as Record<string, unknown>;
        const projection = (scope.activity_safe_projections as Record<string, Record<string, unknown>>)[
          'projection-1'
        ]!;
        projection.privateObjectKey = 'private-key';
        return scope;
      })(),
      (() => {
        const scope = structuredClone(toWireScope(completeScope())) as Record<string, unknown>;
        const version = (scope.versions as Record<string, Record<string, unknown>>)['manifest-1']!;
        const manifest = version.manifest as Record<string, unknown>;
        const units = manifest.units as Record<string, unknown>[];
        const firstUnit = units[0]!;
        const pageGroups = firstUnit.pageGroups as Record<string, unknown>[];
        pageGroups[0]!.unknownNestedField = true;
        return scope;
      })(),
    ];

    for (const malformedScope of malformedScopes) {
      const repository = new FirebaseRestBookAssemblyPublicationRepository({
        env,
        fetchImpl: createFetchHarness(malformedScope).fetchImpl,
        getAccessToken: async () => 'test-token',
      });
      await expect(repository.readScope('book-1'))
        .rejects.toThrow('invalid_book_assembly_publication_record');
    }
  });

  it('rejects camelCase, mixed, and unknown aggregate wire keys', async () => {
    const malformedWireScopes: Record<string, unknown>[] = [
      { activityVersions: {} },
      { activity_versions: {}, activityVersions: {} },
      { versions: {}, unexpected: {} },
    ];
    const invalidActivityKey = toWireScope(completeScope());
    invalidActivityKey.activity_versions = {
      'activity-version-1': (invalidActivityKey.activity_versions as Record<string, unknown>)[
        bookAssemblyActivityVersionScopeKey('manifest-1', 'activity-version-1')
      ],
    };
    malformedWireScopes.push(invalidActivityKey);

    const missingSafeProjectionId = JSON.parse(JSON.stringify(toWireScope(completeScope()))) as Record<string, unknown>;
    const activityVersions = missingSafeProjectionId.activity_versions as Record<string, Record<string, unknown>>;
    delete activityVersions[
      bookAssemblyActivityVersionScopeKey('manifest-1', 'activity-version-1')
    ]!.safeProjectionId;
    malformedWireScopes.push(missingSafeProjectionId);

    const invalidOperationFingerprint = JSON.parse(JSON.stringify(toWireScope(completeScope()))) as Record<string, unknown>;
    (invalidOperationFingerprint.current as Record<string, unknown>).operationFingerprint = '';
    malformedWireScopes.push(invalidOperationFingerprint);

    for (const malformedWireScope of malformedWireScopes) {
      const repository = new FirebaseRestBookAssemblyPublicationRepository({
        env,
        fetchImpl: createFetchHarness(malformedWireScope).fetchImpl,
        getAccessToken: async () => 'test-token',
      });
      await expect(repository.readScope('book-1'))
        .rejects.toThrow(/invalid_book_assembly_publication_(scope|record|current)/u);
    }
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
      fetchImpl: createFetchHarness(toWireScope(malformedNested)).fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    await expect(nestedRepository.readScope('book-1'))
      .rejects.toThrow('invalid_book_assembly_publication_record');

    const malformedResult = JSON.parse(JSON.stringify(completeScope())) as Record<string, unknown>;
    const operations = malformedResult.operations as Record<string, Record<string, unknown>>;
    operations[operationId]!.result = { status: 'not-a-publication-result' };
    const resultRepository = new FirebaseRestBookAssemblyPublicationRepository({
      env,
      fetchImpl: createFetchHarness(toWireScope(malformedResult)).fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    await expect(resultRepository.readScope('book-1'))
      .rejects.toThrow('invalid_book_assembly_publication_operation');
  });
});
