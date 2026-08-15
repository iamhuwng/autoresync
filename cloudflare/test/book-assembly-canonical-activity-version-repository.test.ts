import { decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';

import { normalizeActivity } from '../../src/services/book-activity/activityCanonical.service';
import { projectStudentActivity } from '../../src/services/book-activity/activityProjection.service';
import {
  assertCanonicalPublishedActivityVersion,
  createCanonicalActivityVersionFingerprint,
} from '../../src/services/book-assembly/canonicalActivityVersion.service';
import {
  bookAssemblyActivityVersionScopeKey,
} from '../../src/services/book-assembly/publicationTransaction.service';

import {
  BOOK_ASSEMBLY_PUBLICATION_ROOT,
  CANONICAL_ACTIVITY_STUDENT_SAFE_PROJECTION_ROOT,
  CANONICAL_ACTIVITY_VERSION_READER_IDENTITY_ENV,
  CANONICAL_ACTIVITY_VERSION_READER_KEY_ENV,
  CANONICAL_ACTIVITY_VERSION_ROOT,
  CANONICAL_ACTIVITY_VERSION_WRITER_IDENTITY_ENV,
  CANONICAL_ACTIVITY_VERSION_WRITER_KEY_ENV,
  FirebaseRestCanonicalActivityVersionWriter,
  FirebaseRestExactPublishedActivityVersionReader,
  hydrateCanonicalActivityVersionFromRtdb,
} from '../src/upload-worker/book-assembly/canonical-activity-version-repository';
import committedProductionState from '../../tmp/prd0062-bridge-m1-committed-state-fixture.json';
import productionPublicationState from '../../tmp/prd0062-converged-publication.json';

const dbUrl = 'https://firebase.test';
const writerIdentity = 'canonical-writer@example.iam.gserviceaccount.com';
const readerIdentity = 'canonical-reader@example.iam.gserviceaccount.com';
const accessToken = async () => 'test-token';

const request = {
  bookId: 'book-1',
  manifestVersionId: 'manifest-1',
  publicationId: 'publication-1',
  ownerId: 'teacher-1',
  activityId: 'activity-1',
  activityVersionId: 'activity-version-1',
  activityVersion: 1,
  payloadFingerprint: 'fnv1a64:512f03d300dfceca',
} as const;

const canonicalRecord = (overrides: Record<string, unknown> = {}) => {
  const activity = normalizeActivity({
    schemaVersion: 1,
    title: 'Vocabulary practice',
    taskProfile: null,
    presentationMode: 'structured',
    contextRequirement: { mode: 'none', acceptedKinds: [] },
    instructions: [{ text: 'Complete each item.' }],
    interaction: { family: 'text-entry', variant: 'fill-blank' },
    answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
    stimulus: null,
    assetRefs: [],
    interactions: [{ prompt: 'Prompt 1', acceptedAnswers: ['answer-1'] }],
    scoring: { mode: 'auto-where-possible' },
  }, {
    createId: () => 'interaction-1',
  });
  const recordWithoutFingerprint = {
    schemaVersion: 1,
    lifecycle: 'published',
    activityId: request.activityId,
    activityVersionId: request.activityVersionId,
    activityVersion: request.activityVersion,
    ownerId: request.ownerId,
    activity,
    projection: projectStudentActivity(activity),
    placementIds: ['placement-1'],
    evidenceRefs: [],
    sourceContextFingerprint: null,
    createdByOperationId: 'operation-1',
    publishedAt: '2026-07-30T00:00:00.000Z',
    provenance: {
      kind: 'initial-book-publication',
      bookId: request.bookId,
      manifestVersionId: request.manifestVersionId,
      publicationId: request.publicationId,
      publicationRevision: 1,
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      sourcePages: [{
        sourceKey: 'source-1',
        sourceVersionId: 'source-version-1',
        physicalPageNumber: 1,
      }],
    },
    ...overrides,
  };
  return {
    ...recordWithoutFingerprint,
    payloadFingerprint: overrides.payloadFingerprint
      ?? createCanonicalActivityVersionFingerprint(recordWithoutFingerprint as never),
  };
};

const paths = {
  canonical: `${CANONICAL_ACTIVITY_VERSION_ROOT}/${request.activityId}/${request.activityVersionId}`,
  studentSafeProjection: `${CANONICAL_ACTIVITY_STUDENT_SAFE_PROJECTION_ROOT}/${request.activityId}/${request.activityVersionId}`,
  manifest: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${request.bookId}/versions/${request.manifestVersionId}`,
  bookActivityVersion: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${request.bookId}/activity_versions/${
    bookAssemblyActivityVersionScopeKey(request.manifestVersionId, request.activityVersionId)
  }`,
  bookSafeProjection: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${request.bookId}/activity_safe_projections/projection-1`,
  bookPlacement: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${request.bookId}/placements/placement-1`,
  current: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${request.bookId}/current`,
  operation: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${request.bookId}/operations/operation-1`,
};

const safeProjectionRecord = () => {
  const record = canonicalRecord();
  return {
    schemaVersion: 1,
    projectionKind: 'student-safe',
    activityId: record.activityId,
    activityVersionId: record.activityVersionId,
    ownerId: record.ownerId,
    content: record.projection,
    payloadFingerprint: record.payloadFingerprint,
    createdByOperationId: record.createdByOperationId,
    publishedAt: record.publishedAt,
  };
};

const manifestRecord = () => ({
  schemaVersion: 1,
  lifecycle: 'published',
  bookId: request.bookId,
  manifestVersionId: request.manifestVersionId,
  publicationId: request.publicationId,
  publicationRevision: 1,
  ownerId: request.ownerId,
  manifest: { bookId: request.bookId },
  studentSafeProjection: { bookId: request.bookId },
});

const bookActivityVersionRecord = () => ({
  schemaVersion: 1,
  bookId: request.bookId,
  manifestVersionId: request.manifestVersionId,
  publicationId: request.publicationId,
  publicationRevision: 1,
  ownerId: request.ownerId,
  activityId: request.activityId,
  activityVersionId: request.activityVersionId,
  activityVersion: request.activityVersion,
  canonicalPayloadFingerprint: request.payloadFingerprint,
  safeProjectionId: 'projection-1',
  canonicalOriginManifestVersionId: request.manifestVersionId,
  canonicalOriginPublicationId: request.publicationId,
  canonicalOriginOperationId: 'operation-1',
  createdByCommandId: 'operation-1',
  unitKey: 'unit-1',
  activityKey: 'activity-1',
  sourcePages: [{
    sourceKey: 'source-1',
    sourceVersionId: 'source-version-1',
    physicalPageNumber: 1,
  }],
  payloadFingerprint: 'mapping:fixture',
});

const bookSafeProjectionRecord = () => ({
  schemaVersion: 1,
  projectionId: 'projection-1',
  bookId: request.bookId,
  manifestVersionId: request.manifestVersionId,
  publicationId: request.publicationId,
  publicationRevision: 1,
  ownerId: request.ownerId,
  activityId: request.activityId,
  activityVersionId: request.activityVersionId,
  placementIds: ['placement-1'],
  sourcePages: bookActivityVersionRecord().sourcePages,
});

const bookPlacementRecord = () => ({
  schemaVersion: 1,
  placementId: 'placement-1',
  bookId: request.bookId,
  manifestVersionId: request.manifestVersionId,
  publicationId: request.publicationId,
  publicationRevision: 1,
  ownerId: request.ownerId,
  activityId: request.activityId,
  activityVersionId: request.activityVersionId,
  unitKey: 'unit-1',
  activityKey: 'activity-1',
  sourcePages: bookActivityVersionRecord().sourcePages,
});

const currentRecord = () => ({
  manifestVersionId: request.manifestVersionId,
  publicationId: request.publicationId,
});

const committedState = () => ({
  [paths.manifest]: manifestRecord(),
  [paths.bookActivityVersion]: bookActivityVersionRecord(),
  [paths.bookSafeProjection]: bookSafeProjectionRecord(),
  [paths.bookPlacement]: bookPlacementRecord(),
  [paths.current]: currentRecord(),
  [paths.canonical]: canonicalRecord(),
  [paths.studentSafeProjection]: safeProjectionRecord(),
});

const pathFromInput = (input: RequestInfo | URL): string => {
  const url = new URL(String(input));
  return decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
};

const createFetchHarness = (
  initial: Record<string, unknown> = {},
  options: {
    readonly rejectFirstPut?: boolean;
    readonly concurrentValue?: unknown;
    readonly failPutOnce?: boolean;
    readonly failPutPath?: string;
  } = {},
) => {
  const values = new Map(Object.entries(initial));
  const etags = new Map<string, string>();
  const calls: string[] = [];
  let rejected = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = String(init?.method ?? 'GET');
    const path = pathFromInput(input as RequestInfo | URL);
    calls.push(`${method} ${path}`);
    if (method === 'GET') {
      const headers = new Headers(init?.headers);
      const value = values.has(path) ? values.get(path) : null;
      const etag = etags.get(path) ?? '"etag-1"';
      if (headers.get('x-firebase-etag') === 'true') {
        return new Response(JSON.stringify(value), { status: 200, headers: { etag } });
      }
      return new Response(JSON.stringify(value), { status: 200 });
    }
    if (method === 'PUT') {
      if (options.failPutOnce && path === options.failPutPath && !rejected) {
        rejected = true;
        return new Response('', { status: 500 });
      }
      if (options.rejectFirstPut && !rejected) {
        rejected = true;
        if (options.concurrentValue === null || options.concurrentValue === undefined) {
          values.delete(path);
        } else {
          values.set(path, options.concurrentValue);
        }
        etags.set(path, '"etag-concurrent"');
        return new Response('', { status: 412 });
      }
      const headers = new Headers(init?.headers);
      if (headers.get('if-match') !== (etags.get(path) ?? '"etag-1"')) {
        return new Response('', { status: 412 });
      }
      values.set(path, JSON.parse(String(init?.body ?? 'null')) as unknown);
      etags.set(path, '"etag-written"');
      return new Response('', { status: 200 });
    }
    return new Response('', { status: 405 });
  };
  return { calls, fetchImpl, values };
};

const writerEnv = () => ({
  FIREBASE_DB_URL: dbUrl,
  [CANONICAL_ACTIVITY_VERSION_WRITER_IDENTITY_ENV]: writerIdentity,
});

const readerEnv = () => ({
  FIREBASE_DB_URL: dbUrl,
  [CANONICAL_ACTIVITY_VERSION_READER_IDENTITY_ENV]: readerIdentity,
});

const productionRawCanonical = committedProductionState.canonicalActivity as Record<string, unknown>;
const productionProvenance = productionRawCanonical.provenance as Record<string, unknown>;
const productionRequest = {
  bookId: productionProvenance.bookId as string,
  manifestVersionId: productionProvenance.manifestVersionId as string,
  publicationId: productionProvenance.publicationId as string,
  ownerId: productionRawCanonical.ownerId as string,
  activityId: productionRawCanonical.activityId as string,
  activityVersionId: productionRawCanonical.activityVersionId as string,
  activityVersion: productionRawCanonical.activityVersion as number,
  payloadFingerprint: productionRawCanonical.payloadFingerprint as string,
};
const productionActivityVersionKey = Object.entries(productionPublicationState.activity_versions)
  .find(([, value]) => value.activityVersionId === productionRequest.activityVersionId)?.[0] as string;
const productionActivityVersion = productionPublicationState.activity_versions[productionActivityVersionKey];
const productionSafeProjection = productionPublicationState.activity_safe_projections[
  productionActivityVersion.safeProjectionId
];
const productionPlacementId = (productionRawCanonical.placementIds as string[])[0];
const productionPaths = {
  canonical: `${CANONICAL_ACTIVITY_VERSION_ROOT}/${productionRequest.activityId}/${productionRequest.activityVersionId}`,
  studentSafeProjection: `${CANONICAL_ACTIVITY_STUDENT_SAFE_PROJECTION_ROOT}/${productionRequest.activityId}/${productionRequest.activityVersionId}`,
  manifest: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${productionRequest.bookId}/versions/${productionRequest.manifestVersionId}`,
  bookActivityVersion: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${productionRequest.bookId}/activity_versions/${productionActivityVersionKey}`,
  bookSafeProjection: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${productionRequest.bookId}/activity_safe_projections/${productionActivityVersion.safeProjectionId}`,
  bookPlacement: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${productionRequest.bookId}/placements/${productionPlacementId}`,
  current: `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${productionRequest.bookId}/current`,
};
const hydrateProductionWireLoss = (value: Record<string, unknown>): Record<string, unknown> => ({
  ...value,
  evidenceRefs: [],
  activity: {
    ...(value.activity as Record<string, unknown>),
    taskProfile: null,
    stimulus: null,
    assetRefs: [],
  },
  projection: {
    ...(value.projection as Record<string, unknown>),
    taskProfile: null,
    stimulus: null,
    assetRefs: [],
  },
});
const withoutFingerprint = (value: Record<string, unknown>): Record<string, unknown> => {
  const copy = structuredClone(value);
  delete copy.payloadFingerprint;
  return copy;
};
const productionCommittedState = (canonical: unknown = productionRawCanonical) => ({
  [productionPaths.manifest]: productionPublicationState.versions[productionRequest.manifestVersionId],
  [productionPaths.bookActivityVersion]: productionActivityVersion,
  [productionPaths.bookSafeProjection]: productionSafeProjection,
  [productionPaths.bookPlacement]: productionPublicationState.placements[productionPlacementId],
  [productionPaths.current]: productionPublicationState.current,
  [productionPaths.canonical]: canonical,
  [productionPaths.studentSafeProjection]: committedProductionState.studentSafeProjection,
});

describe('canonical Activity Version Firebase repositories', () => {
  it('keeps the exact production wire record red under raw validation and reads it only after bounded hydration', async () => {
    const rawBefore = structuredClone(productionRawCanonical);
    const studentSafeBefore = structuredClone(productionCommittedState()[productionPaths.studentSafeProjection]);
    expect(() => assertCanonicalPublishedActivityVersion(productionRawCanonical))
      .toThrow('invalid_canonical_activity_version:$.evidenceRefs:missing-field');

    const evidenceOnly = { ...productionRawCanonical, evidenceRefs: [] };
    expect(createCanonicalActivityVersionFingerprint(withoutFingerprint(productionRawCanonical) as never))
      .toBe('fnv1a64:995d6073941e3893');
    expect(createCanonicalActivityVersionFingerprint(withoutFingerprint(evidenceOnly) as never))
      .toBe('fnv1a64:492f35413d79ae90');
    expect(() => assertCanonicalPublishedActivityVersion(evidenceOnly))
      .toThrow('invalid_canonical_activity_version:$.activity.taskProfile:missing-field');

    const hydrated = hydrateProductionWireLoss(productionRawCanonical);
    expect(createCanonicalActivityVersionFingerprint(withoutFingerprint(hydrated) as never))
      .toBe('fnv1a64:2fcc389f248bb9ae');
    expect(hydrated.payloadFingerprint).toBe('fnv1a64:2fcc389f248bb9ae');
    expect(assertCanonicalPublishedActivityVersion(hydrated)).toEqual(hydrated);

    const harness = createFetchHarness(productionCommittedState());
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: readerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(reader.readExact(productionRequest)).resolves.toEqual(hydrated);
    expect(productionRawCanonical).toEqual(rawBefore);
    expect(harness.values.get(productionPaths.studentSafeProjection)).toEqual(studentSafeBefore);

    const replayHarness = createFetchHarness({
      [productionPaths.canonical]: productionRawCanonical,
      [productionPaths.studentSafeProjection]: committedProductionState.studentSafeProjection,
    });
    const writer = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: replayHarness.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(writer.prepare(hydrated as never)).resolves.toEqual({ status: 'replayed' });
    expect(replayHarness.values.get(productionPaths.canonical)).toEqual(rawBefore);
    expect(replayHarness.values.get(productionPaths.studentSafeProjection)).toEqual(studentSafeBefore);

    const rawInputHarness = createFetchHarness();
    const strictWriter = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: rawInputHarness.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(strictWriter.prepare(productionRawCanonical as never))
      .resolves.toEqual({ status: 'conflict' });
    expect(rawInputHarness.calls).toEqual([]);
  });

  it.each([
    ['missing content', (record: Record<string, unknown>) => {
      const activity = { ...(record.activity as Record<string, unknown>) };
      delete activity.title;
      return { ...record, activity };
    }],
    ['non-empty evidence', (record: Record<string, unknown>) => ({
      ...record,
      evidenceRefs: [{ kind: 'invented' }],
    })],
    ['provenance', (record: Record<string, unknown>) => ({
      ...record,
      provenance: { ...(record.provenance as Record<string, unknown>), unitKey: 'unit-crossed' },
    })],
    ['placement', (record: Record<string, unknown>) => ({ ...record, placementIds: ['placement-crossed'] })],
    ['publication', (record: Record<string, unknown>) => ({
      ...record,
      provenance: {
        ...(record.provenance as Record<string, unknown>),
        publicationId: 'publication-crossed',
      },
    })],
    ['Activity Version', (record: Record<string, unknown>) => ({
      ...record,
      activityVersionId: 'activity-version-crossed',
    })],
    ['fingerprint', (record: Record<string, unknown>) => ({
      ...record,
      payloadFingerprint: 'fnv1a64:0000000000000000',
    })],
  ])('fails closed after bounded hydration for a tampered %s field', async (_label, tamper) => {
    const tampered = tamper(structuredClone(productionRawCanonical));
    const hydrated = hydrateCanonicalActivityVersionFromRtdb(tampered);
    expect(() => assertCanonicalPublishedActivityVersion(hydrated)).toThrow();

    const harness = createFetchHarness(productionCommittedState(tampered));
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: readerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(reader.readExact(productionRequest)).resolves.toBeNull();
  });

  it('does not hydrate missing parents, later schemas, or present wire values', () => {
    expect(hydrateCanonicalActivityVersionFromRtdb({ schemaVersion: 1 }))
      .toEqual({ schemaVersion: 1, evidenceRefs: [] });
    expect(hydrateCanonicalActivityVersionFromRtdb({
      schemaVersion: 2,
      activity: {},
      projection: {},
    })).toEqual({ schemaVersion: 2, activity: {}, projection: {} });
    expect(hydrateCanonicalActivityVersionFromRtdb({
      schemaVersion: 1,
      evidenceRefs: ['present'],
      activity: { taskProfile: 'present', stimulus: 'present', assetRefs: ['present'] },
      projection: { taskProfile: 'present', stimulus: 'present', assetRefs: ['present'] },
    })).toEqual({
      schemaVersion: 1,
      evidenceRefs: ['present'],
      activity: { taskProfile: 'present', stimulus: 'present', assetRefs: ['present'] },
      projection: { taskProfile: 'present', stimulus: 'present', assetRefs: ['present'] },
    });
  });

  it('uses the exact canonical path and creates, replays, or conflicts without overwriting', async () => {
    const createHarness = createFetchHarness();
    const writer = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: createHarness.fetchImpl,
      getAccessToken: accessToken,
    });

    await expect(writer.prepare(canonicalRecord() as never)).resolves.toEqual({ status: 'created' });
    await expect(writer.readPrepared({
      activityId: request.activityId,
      activityVersionId: request.activityVersionId,
      activityVersion: request.activityVersion,
      canonicalPayloadFingerprint: request.payloadFingerprint,
    })).resolves.toEqual(canonicalRecord());
    expect(createHarness.calls).toEqual([
      `GET ${paths.canonical}`,
      `GET ${paths.studentSafeProjection}`,
      `PUT ${paths.canonical}`,
      `PUT ${paths.studentSafeProjection}`,
    ]);

    const replayHarness = createFetchHarness({
      [paths.canonical]: canonicalRecord(),
      [paths.studentSafeProjection]: safeProjectionRecord(),
    });
    const replayWriter = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: replayHarness.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(replayWriter.prepare(canonicalRecord() as never))
      .resolves.toEqual({ status: 'replayed' });
    expect(replayHarness.calls).toEqual([
      `GET ${paths.canonical}`,
      `GET ${paths.studentSafeProjection}`,
    ]);

    const conflictHarness = createFetchHarness({
      [paths.canonical]: canonicalRecord(),
      [paths.studentSafeProjection]: safeProjectionRecord(),
    });
    const conflictWriter = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: conflictHarness.fetchImpl,
      getAccessToken: accessToken,
    });
    const conflicting = canonicalRecord({ createdByOperationId: 'operation-2' });
    await expect(conflictWriter.prepare(conflicting as never))
      .resolves.toEqual({ status: 'conflict' });
    expect(conflictHarness.calls).toEqual([
      `GET ${paths.canonical}`,
      `GET ${paths.studentSafeProjection}`,
    ]);
  });

  it('classifies a 412 as a retry and replays the concurrent exact record', async () => {
    const harness = createFetchHarness({
      [paths.studentSafeProjection]: safeProjectionRecord(),
    }, {
      rejectFirstPut: true,
      concurrentValue: canonicalRecord(),
    });
    const writer = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });

    await expect(writer.prepare(canonicalRecord() as never))
      .resolves.toEqual({ status: 'replayed' });
    expect(harness.calls).toEqual([
      `GET ${paths.canonical}`,
      `GET ${paths.studentSafeProjection}`,
      `PUT ${paths.canonical}`,
      `GET ${paths.canonical}`,
      `GET ${paths.studentSafeProjection}`,
    ]);
  });

  it('heals either missing immutable sibling without rewriting the existing equivalent record', async () => {
    const versionOnly = createFetchHarness({ [paths.canonical]: canonicalRecord() });
    const writer = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: versionOnly.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(writer.prepare(canonicalRecord() as never)).resolves.toEqual({ status: 'created' });
    expect(versionOnly.calls).toEqual([
      `GET ${paths.canonical}`,
      `GET ${paths.studentSafeProjection}`,
      `PUT ${paths.studentSafeProjection}`,
    ]);
    expect(versionOnly.values.get(paths.studentSafeProjection)).toEqual(safeProjectionRecord());

    const projectionOnly = createFetchHarness({
      [paths.studentSafeProjection]: safeProjectionRecord(),
    });
    const projectionWriter = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: projectionOnly.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(projectionWriter.prepare(canonicalRecord() as never)).resolves.toEqual({ status: 'created' });
    expect(projectionOnly.calls).toEqual([
      `GET ${paths.canonical}`,
      `GET ${paths.studentSafeProjection}`,
      `PUT ${paths.canonical}`,
    ]);
  });

  it('uses exact Firebase claims for canonical publication leaves', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const assemblyIdentity = 'book-assembly@example.iam.gserviceaccount.com';
    const exchangeClaims: unknown[] = [];
    const rtdbRequests: Array<{ method: string; path: string; auth: string | null; authorization: string | null }> = [];
    const values = new Map<string, unknown>();
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'identitytoolkit.googleapis.com') {
        expect(url.searchParams.get('key')).toBe('web-key');
        expect(new Headers(init?.headers).get('referer'))
          .toBe('https://r2-upload-signer.iamhuwng.workers.dev/');
        const body = JSON.parse(String(init?.body)) as { token: string };
        exchangeClaims.push(decodeJwt(body.token));
        return Response.json({ idToken: 'assembly-firebase-id-token', expiresIn: '300' });
      }
      expect(url.hostname).toBe('firebase.test');
      const method = String(init?.method ?? 'GET');
      const path = pathFromInput(input as RequestInfo | URL);
      const headers = new Headers(init?.headers);
      rtdbRequests.push({
        method,
        path,
        auth: url.searchParams.get('auth'),
        authorization: headers.get('authorization'),
      });
      if (method === 'GET') {
        return new Response(JSON.stringify(values.get(path) ?? null), {
          status: 200,
          headers: { etag: '"etag-1"' },
        });
      }
      if (method === 'PUT') {
        values.set(path, JSON.parse(String(init?.body ?? 'null')) as unknown);
        return new Response('{}', { status: 200 });
      }
      return new Response('', { status: 405 });
    };
    const writer = new FirebaseRestCanonicalActivityVersionWriter({
      env: {
        FIREBASE_DB_URL: dbUrl,
        FIREBASE_PROJECT_ID: 'project-1',
        FIREBASE_WEB_API_KEY: 'web-key',
        BOOK_ASSEMBLY_SERVICE_IDENTITY: assemblyIdentity,
        BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
          client_email: assemblyIdentity,
          private_key: await exportPKCS8(privateKey),
        }),
      },
      fetchImpl,
    });

    await expect(writer.prepare(canonicalRecord() as never)).resolves.toEqual({ status: 'created' });

    expect(exchangeClaims).toEqual([expect.objectContaining({
      uid: request.ownerId,
      claims: {
        book_activity_publication_writer_service: true,
        book_activity_publication_writer_ownerId: request.ownerId,
        book_activity_publication_writer_activityId: request.activityId,
        book_activity_publication_writer_activityVersionId: request.activityVersionId,
      },
    })]);
    expect(rtdbRequests).toEqual([
      { method: 'GET', path: paths.canonical, auth: 'assembly-firebase-id-token', authorization: null },
      { method: 'GET', path: paths.studentSafeProjection, auth: 'assembly-firebase-id-token', authorization: null },
      { method: 'PUT', path: paths.canonical, auth: 'assembly-firebase-id-token', authorization: null },
      { method: 'PUT', path: paths.studentSafeProjection, auth: 'assembly-firebase-id-token', authorization: null },
    ]);
    await expect(writer.readPrepared({
      activityId: request.activityId,
      activityVersionId: request.activityVersionId,
      activityVersion: request.activityVersion,
      canonicalPayloadFingerprint: request.payloadFingerprint,
    })).resolves.toEqual(canonicalRecord());
    expect(rtdbRequests).toHaveLength(4);
  });

  it('retries a crash after version creation and heals the missing safe sibling', async () => {
    const harness = createFetchHarness({}, {
      failPutOnce: true,
      failPutPath: paths.studentSafeProjection,
    });
    const writer = new FirebaseRestCanonicalActivityVersionWriter({
      env: writerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });

    await expect(writer.prepare(canonicalRecord() as never))
      .rejects.toThrow('firebase_rtdb_put_failed:500:');
    expect(harness.values.has(paths.canonical)).toBe(true);
    expect(harness.values.has(paths.studentSafeProjection)).toBe(false);
    await expect(writer.prepare(canonicalRecord() as never)).resolves.toEqual({ status: 'created' });
    expect(harness.values.get(paths.studentSafeProjection)).toEqual(safeProjectionRecord());
  });

  it('rejects malformed input records and never reads a broad Activity or Book root', async () => {
    const harness = createFetchHarness({
      [paths.manifest]: manifestRecord(),
      [paths.bookActivityVersion]: bookActivityVersionRecord(),
      [paths.bookSafeProjection]: bookSafeProjectionRecord(),
      [paths.bookPlacement]: bookPlacementRecord(),
      [paths.current]: currentRecord(),
      [paths.canonical]: { lifecycle: 'published', activityId: request.activityId },
    });
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: readerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });

    await expect(reader.readExact(request)).resolves.toBeNull();
    expect(harness.calls).toEqual([
      `GET ${paths.manifest}`,
      `GET ${paths.bookActivityVersion}`,
      `GET ${paths.current}`,
      `GET ${paths.bookSafeProjection}`,
      `GET ${paths.canonical}`,
    ]);
    expect(harness.calls.some((call) => call.endsWith('book_activity'))).toBe(false);
    expect(harness.calls.some((call) => call.endsWith(`${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${request.bookId}`))).toBe(false);
  });

  it('keeps a prepared canonical record invisible until the exact Book reference and manifest commit exist', async () => {
    const harness = createFetchHarness({ [paths.canonical]: canonicalRecord() });
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: readerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });

    await expect(reader.readExact(request)).resolves.toBeNull();
    expect(harness.calls).toEqual([`GET ${paths.manifest}`]);

    harness.values.set(paths.manifest, manifestRecord());
    await expect(reader.readExact(request)).resolves.toBeNull();
    expect(harness.calls.slice(1)).toEqual([
      `GET ${paths.manifest}`,
      `GET ${paths.bookActivityVersion}`,
    ]);

    harness.values.set(paths.bookActivityVersion, bookActivityVersionRecord());
    harness.values.set(paths.bookSafeProjection, bookSafeProjectionRecord());
    harness.values.set(paths.bookPlacement, bookPlacementRecord());
    harness.values.set(paths.studentSafeProjection, safeProjectionRecord());
    await expect(reader.readExact(request)).resolves.toBeNull();
    expect(harness.calls.slice(3)).toEqual([
      `GET ${paths.manifest}`,
      `GET ${paths.bookActivityVersion}`,
      `GET ${paths.current}`,
      `GET ${paths.operation}`,
    ]);

    harness.values.set(paths.current, currentRecord());
    await expect(reader.readExact(request)).resolves.toEqual(canonicalRecord());
    expect(harness.calls.slice(7)).toEqual([
      `GET ${paths.manifest}`,
      `GET ${paths.bookActivityVersion}`,
      `GET ${paths.current}`,
      `GET ${paths.bookSafeProjection}`,
      `GET ${paths.canonical}`,
      `GET ${paths.bookPlacement}`,
      `GET ${paths.studentSafeProjection}`,
    ]);
  });

  it.each([
    ['owner', { ownerId: 'teacher-2' }],
    ['version', { activityVersion: 2 }],
    ['fingerprint', { payloadFingerprint: 'fnv1a64:other' }],
    ['publication', { publicationId: 'publication-2' }],
  ])('denies a request with a wrong %s', async (_label, change) => {
    const harness = createFetchHarness(committedState());
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: readerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(reader.readExact({ ...request, ...change })).resolves.toBeNull();
  });

  it.each([
    ['owner', { ownerId: 'teacher-2' }],
    ['version', { activityVersion: 2 }],
    ['fingerprint', { payloadFingerprint: 'fnv1a64:other' }],
  ])('denies a canonical record with a wrong %s', async (_label, change) => {
    const state = committedState();
    state[paths.canonical] = canonicalRecord(change);
    const harness = createFetchHarness(state);
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: readerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(reader.readExact(request)).resolves.toBeNull();
  });

  it('fails closed on Book projection, placement, or initial-publication lineage mismatch', async () => {
    const cases = [
      {
        path: paths.bookSafeProjection,
        value: { ...bookSafeProjectionRecord(), placementIds: ['placement-2'] },
      },
      {
        path: paths.bookPlacement,
        value: { ...bookPlacementRecord(), unitKey: 'unit-2' },
      },
      {
        path: paths.canonical,
        value: canonicalRecord({
          provenance: {
            ...canonicalRecord().provenance,
            manifestVersionId: 'manifest-2',
          },
        }),
      },
    ] as const;
    for (const candidate of cases) {
      const state = committedState();
      state[candidate.path] = candidate.value;
      const harness = createFetchHarness(state);
      const reader = new FirebaseRestExactPublishedActivityVersionReader({
        env: readerEnv(),
        fetchImpl: harness.fetchImpl,
        getAccessToken: accessToken,
      });
      await expect(reader.readExact(request)).resolves.toBeNull();
    }
  });

  it('keeps an exact historical publication readable only through its committed operation marker', async () => {
    const state = committedState();
    delete state[paths.current];
    state[paths.operation] = {
      ownerId: request.ownerId,
      result: {
        status: 'published',
        pointer: {
          manifestVersionId: request.manifestVersionId,
          publicationId: request.publicationId,
        },
      },
    };
    const harness = createFetchHarness(state);
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: readerEnv(),
      fetchImpl: harness.fetchImpl,
      getAccessToken: accessToken,
    });
    await expect(reader.readExact(request)).resolves.toEqual(canonicalRecord());
  });

  it('propagates repository outages instead of classifying them as missing records', async () => {
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: readerEnv(),
      fetchImpl: async () => new Response('', { status: 503 }),
      getAccessToken: accessToken,
    });
    await expect(reader.readExact(request)).rejects.toThrow('firebase_rtdb_get_failed:503');
  });

  it('keeps writer and reader identity/key configuration distinct and validates supplied key emails', () => {
    const writerOnlyIdentity = {
      FIREBASE_DB_URL: dbUrl,
      [CANONICAL_ACTIVITY_VERSION_WRITER_IDENTITY_ENV]: writerIdentity,
    };
    const readerOnlyIdentity = {
      FIREBASE_DB_URL: dbUrl,
      [CANONICAL_ACTIVITY_VERSION_READER_IDENTITY_ENV]: readerIdentity,
    };
    expect(() => new FirebaseRestCanonicalActivityVersionWriter({
      env: readerOnlyIdentity,
      getAccessToken: accessToken,
    })).toThrow('missing_canonical_activity_version_writer_service_identity');
    expect(() => new FirebaseRestExactPublishedActivityVersionReader({
      env: writerOnlyIdentity,
      getAccessToken: accessToken,
    })).toThrow('missing_canonical_activity_version_reader_service_identity');
    expect(() => new FirebaseRestExactPublishedActivityVersionReader({
      env: {
        FIREBASE_DB_URL: dbUrl,
        BOOK_ASSEMBLY_SERVICE_IDENTITY: readerIdentity,
        BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
          client_email: readerIdentity,
          private_key: 'not-a-key',
        }),
      } as never,
      getAccessToken: accessToken,
    })).toThrow('missing_canonical_activity_version_reader_service_identity');

    expect(() => new FirebaseRestCanonicalActivityVersionWriter({
      env: {
        ...writerEnv(),
        [CANONICAL_ACTIVITY_VERSION_WRITER_KEY_ENV]: JSON.stringify({
          client_email: readerIdentity,
          private_key: 'not-a-key',
        }),
      },
      getAccessToken: accessToken,
    })).toThrow('service_identity_mismatch');
    expect(() => new FirebaseRestExactPublishedActivityVersionReader({
      env: {
        ...readerEnv(),
        [CANONICAL_ACTIVITY_VERSION_READER_KEY_ENV]: JSON.stringify({
          client_email: writerIdentity,
          private_key: 'not-a-key',
        }),
      },
      getAccessToken: accessToken,
    })).toThrow('service_identity_mismatch');
  });
});
