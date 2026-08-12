import { describe, expect, it, vi } from 'vitest';
import type { CanonicalPublishedActivityVersionRecord } from '../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookAssemblyPublicationScope } from '../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service.ts';
import {
  createBookRuntimeLaunchCanonicalHandlers,
  canonicalActivityVersionReaderEnv,
  type BookRuntimeLaunchProductionDependencies,
} from '../src/upload-worker/book-runtime-launch/canonical.ts';
import {
  canonicalActivityVersionReaderClaimsForPath,
  FirebaseRestExactPublishedActivityVersionReader,
} from '../src/upload-worker/book-assembly/canonical-activity-version-repository.ts';
import type { FirebaseRtdbAuthRequest } from '../src/upload-worker/listening-authoring/rtdb.ts';

const pilotEnv = {
  BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
  BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({
    schemaVersion: 'v1', environment: 'test', revision: 'launch-pilot',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    teacherId: 'teacher-1', bookId: 'book-1', assignmentId: 'course-material-1',
    studentIds: ['student-1'], maxStudents: 30,
  }),
} as const;

const safeProjection = (title = 'Practice') => ({
  schemaVersion: 1,
  title,
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'text-entry', variant: 'generic' },
  answerRule: { defaultPoints: 1, normalization: 'exact' },
  interactions: [],
  scoring: { mode: 'auto-where-possible' },
});

const binding = (): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'binding-1',
  revision: 2,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1', bookMode: 'pdf', bookRevision: 3,
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1', publicationRevision: 4, publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  outline: [],
  context: {
    kind: 'course', contextId: 'course-material-1', recipientId: 'student-1',
    ownerId: 'teacher-1', entitlementBasis: 'enrollment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'source-1', sourceVersionId: 'source-version-1', lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [{
    placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-version-1',
    activityVersion: 7, nodeKey: 'unit-1', order: 1, contextMode: 'none',
    pageGroupKeys: [], sourcePageScopes: [],
  }],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-08-08T00:00:00.000Z',
});

const scope = (): BookAssemblyPublicationScope<BookAssemblyPublicationResult> => ({
  versions: {
    'manifest-1': {
      schemaVersion: 1, manifestVersionId: 'manifest-1', publicationId: 'publication-1',
      publicationRevision: 4, lifecycle: 'published', ownerId: 'teacher-1', bookId: 'book-1',
      bookRevision: 3, sourceSetRevision: 1, candidateId: 'candidate-1', candidateRevision: 1,
      strategy: 'full_pdf', adapterTicket: 'fixture', inputFingerprint: 'input-1',
      createdByCommandId: '00000000-0000-4000-8000-000000000104',
      createdAt: '2026-08-08T00:00:00.000Z',
      manifest: { bookId: 'book-1', sourceSet: { sourceStrategy: 'full_pdf', sources: [] }, nodes: [], units: [] },
      studentSafeProjection: {
        schemaVersion: 1, bookId: 'book-1', publicationId: 'publication-1', publicationRevision: 4,
        sourceStrategy: 'full_pdf', sourceSet: { sourceStrategy: 'full_pdf', sources: [] }, units: [],
      },
    },
  },
  activityVersions: {
    'manifest-1:activity-version-1': {
      schemaVersion: 1, activityId: 'activity-1', activityVersionId: 'activity-version-1', activityVersion: 7,
      ownerId: 'teacher-1', bookId: 'book-1', manifestVersionId: 'manifest-1', publicationId: 'publication-1',
      publicationRevision: 4, unitKey: 'unit-1', activityKey: 'activity-1',
      createdByCommandId: '00000000-0000-4000-8000-000000000104', createdAt: '2026-08-08T00:00:00.000Z',
      sourcePages: [], canonicalPayloadFingerprint: 'fnv1a64:1111111111111111', payloadFingerprint: 'mapping-1',
    },
  },
  placements: {
    'placement-1': {
      schemaVersion: 1, placementId: 'placement-1', ownerId: 'teacher-1', bookId: 'book-1',
      manifestVersionId: 'manifest-1', publicationId: 'publication-1', publicationRevision: 4,
      unitKey: 'unit-1', nodeKey: 'unit-1', activityKey: 'activity-1', activityId: 'activity-1',
      activityVersionId: 'activity-version-1', order: 1, pageGroupKeys: [], sourcePages: [],
    },
  },
});

const canonical = (projection = safeProjection()): CanonicalPublishedActivityVersionRecord => ({
  schemaVersion: 1, lifecycle: 'published', activityId: 'activity-1', activityVersionId: 'activity-version-1',
  activityVersion: 7, ownerId: 'teacher-1', activity: {} as never, projection: projection as never,
  payloadFingerprint: 'fnv1a64:1111111111111111', placementIds: ['placement-1'], evidenceRefs: [],
  sourceContextFingerprint: null, createdByOperationId: 'operation-1', publishedAt: '2026-08-08T00:00:00.000Z',
  provenance: {
    kind: 'initial-book-publication', bookId: 'book-1', manifestVersionId: 'manifest-1',
    publicationId: 'publication-1', publicationRevision: 4, unitKey: 'unit-1', activityKey: 'activity-1', sourcePages: [],
  },
});

const request = (overrides: Record<string, unknown> = {}) => new Request(
  'https://worker.test/v1/book-runtime-launch/activities',
  { method: 'POST', body: JSON.stringify({
    bindingId: 'binding-1', bindingRevision: 2, contextId: 'course-material-1',
    activityPins: [{ activityId: 'activity-1', activityVersionId: 'activity-version-1' }], ...overrides,
  }) },
);

const dependencies = (overrides: Partial<BookRuntimeLaunchProductionDependencies> = {}) => {
  const active = binding();
  return {
    delivery: {
      resolveCurrent: vi.fn(async () => ({
        record: { binding: active, recordRevision: 1, status: 'active' as const, createdAt: active.createdAt, updatedAt: active.createdAt },
        pointer: {
          bindingId: active.bindingId, bindingRevision: active.revision, recipientId: active.recipient.recipientId,
          contextId: active.context.contextId, contextKind: active.context.kind, status: 'active' as const, updatedAt: active.createdAt,
        },
      })),
    },
    publications: { readScope: vi.fn(async () => scope()) },
    exactReader: { readExact: vi.fn(async () => canonical()) },
    ...overrides,
  } as BookRuntimeLaunchProductionDependencies;
};

const handlersFor = (value = dependencies()) => ({
  dependencies: value,
  handlers: createBookRuntimeLaunchCanonicalHandlers({ createDependencies: () => value }),
});

describe('Book Runtime launch production composition', () => {
  it('maps the assembly identity explicitly when dedicated reader bindings are absent', () => {
    const env = {
      FIREBASE_DB_URL: 'https://firebase.test',
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: 'assembly-key',
    };
    const mapped = canonicalActivityVersionReaderEnv(env);
    expect(mapped.BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_SERVICE_IDENTITY)
      .toBe('assembly@example.test');
    expect(mapped.BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_GOOGLE_SA_KEY)
      .toBe('assembly-key');

    const dedicated = {
      ...env,
      BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_SERVICE_IDENTITY: 'reader@example.test',
      BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_GOOGLE_SA_KEY: 'reader-key',
    };
    expect(canonicalActivityVersionReaderEnv(dedicated as never)).toBe(dedicated);
  });

  it('uses Firebase Auth with exact request-scoped reader claims', async () => {
    const authRequests: FirebaseRtdbAuthRequest[] = [];
    const calls: string[] = [];
    const reader = new FirebaseRestExactPublishedActivityVersionReader({
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_SERVICE_IDENTITY: 'reader@example.test',
      },
      fetchImpl: async (input) => {
        calls.push(String(input));
        return new Response('null', { status: 200 });
      },
      getFirebaseAuthToken: async (request) => {
        authRequests.push(request!);
        return 'firebase-id-token';
      },
    });
    await expect(reader.readExact({
      bookId: 'book-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      ownerId: 'teacher-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-1',
      activityVersion: 7,
      payloadFingerprint: 'fnv1a64:1111111111111111',
    })).resolves.toBeNull();

    expect(authRequests).toEqual([{
      path: 'book_assembly_publications/books/book-1/versions/manifest-1',
    }]);
    expect(new URL(calls[0]!).searchParams.get('auth')).toBe('firebase-id-token');
    expect(canonicalActivityVersionReaderClaimsForPath(
      'book_activity/versions/activity-1/activity-version-1',
      {
        bookId: 'book-1',
        manifestVersionId: 'manifest-1',
        publicationId: 'publication-1',
        ownerId: 'teacher-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-version-1',
        activityVersion: 7,
        payloadFingerprint: 'fnv1a64:1111111111111111',
      },
    )).toEqual({
      service: 'book_activity_runtime_reader',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: 'manifest-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-1',
    });
  });

  it('revalidates the current binding, derives immutable provenance, and supports a repeat launch', async () => {
    const { handlers, dependencies: production } = handlersFor();
    const first = await handlers.launch({ request: request(), env: pilotEnv, uid: 'student-1' });
    const second = await handlers.launch({ request: request(), env: pilotEnv, uid: 'student-1' });

    expect(first).toMatchObject({ init: { status: 200 }, body: { activities: [{ activityId: 'activity-1' }] } });
    expect(second).toMatchObject({ init: { status: 200 } });
    expect(production.delivery.resolveCurrent).toHaveBeenCalledTimes(2);
    expect(production.publications.readScope).toHaveBeenCalledTimes(2);
    expect(production.exactReader.readExact).toHaveBeenCalledWith({
      bookId: 'book-1', manifestVersionId: 'manifest-1', publicationId: 'publication-1', ownerId: 'teacher-1',
      activityId: 'activity-1', activityVersionId: 'activity-version-1', activityVersion: 7,
      payloadFingerprint: 'fnv1a64:1111111111111111',
    });
  });

  it.each([
    ['wrong recipient', request(), 'student-2'],
    ['wrong context', request({ contextId: 'other-context' }), 'student-1'],
    ['wrong revision', request({ bindingRevision: 3 }), 'student-1'],
    ['wrong pin set', request({ activityPins: [{ activityId: 'activity-1', activityVersionId: 'other-version' }] }), 'student-1'],
  ])('denies %s before any immutable projection read', async (_label, candidate, uid) => {
    const { handlers, dependencies: production } = handlersFor();
    const result = await handlers.launch({ request: candidate, env: pilotEnv, uid });
    expect(result).toMatchObject({ init: { status: 403 } });
    expect(production.publications.readScope).not.toHaveBeenCalled();
    expect(production.exactReader.readExact).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'superseded', 'not-current'])('denies a %s delivery binding', async (state) => {
    const production = dependencies({ delivery: { resolveCurrent: vi.fn(async () => null) } });
    const { handlers } = handlersFor(production);
    const result = await handlers.launch({ request: request(), env: pilotEnv, uid: 'student-1' });
    expect(result).toMatchObject({ init: { status: 403 } });
    expect(production.exactReader.readExact).not.toHaveBeenCalled();
    expect(state).toBeTruthy();
  });

  it('denies a mismatched exact immutable projection and never returns it', async () => {
    const production = dependencies({ exactReader: { readExact: vi.fn(async () => null) } });
    const { handlers } = handlersFor(production);
    const result = await handlers.launch({ request: request(), env: pilotEnv, uid: 'student-1' });
    expect(result).toMatchObject({ init: { status: 409 }, body: { code: 'projection_mismatch' } });
  });

  it('denies malformed provenance and an unsafe student projection', async () => {
    const malformed = scope();
    delete (malformed.activityVersions!['manifest-1:activity-version-1'] as { canonicalPayloadFingerprint?: string }).canonicalPayloadFingerprint;
    const first = handlersFor(dependencies({ publications: { readScope: vi.fn(async () => malformed) } }));
    expect(await first.handlers.launch({ request: request(), env: pilotEnv, uid: 'student-1' }))
      .toMatchObject({ init: { status: 409 } });

    const unsafe = handlersFor(dependencies({
      exactReader: { readExact: vi.fn(async () => canonical({ ...safeProjection(), teacherNotes: 'private' })) },
    }));
    expect(await unsafe.handlers.launch({ request: request(), env: pilotEnv, uid: 'student-1' }))
      .toMatchObject({ init: { status: 409 }, body: { code: 'projection_mismatch' } });
  });

  it('constructs a production-capable handler when dependencies are configured', () => {
    const handlers = createBookRuntimeLaunchCanonicalHandlers({ createDependencies: () => dependencies() });
    expect(handlers.launch).toEqual(expect.any(Function));
  });
});
