import {
  createTrustedFirebaseRtdbServiceAccountAccessTokenProvider,
} from '../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import {
  sourceUploadAccountPath,
  validateBookSourceUploadAccountState,
} from '../../../../src/services/book-source-delivery/sourceUpload.rtdbRepository.ts';
import {
  isBookHomeworkDocumentWindowOpen,
} from '../book-delivery/schedule-authority.ts';
import type {
  BookHomeworkAuthorityRecord,
  BookHomeworkAuthorityScope,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type {
  BookSourceUploadOperation,
} from '../../../../src/types/bookSource.types.ts';
import type {
  BookDeliveryBinding,
  BookDeliverySourceBinding,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type {
  BookDeliveryRecord,
  BookDeliveryRepository,
} from '../../../../src/services/book-delivery/bookDelivery.entitlement.ts';
import {
  createBackblazeB2SourceProviderFromEnv,
} from '../../book-source-worker/backblaze-b2-source-provider.ts';
import {
  assertValidBookHomeworkAuthorityRecord,
} from '../book-homework/authority.ts';
import {
  FirebaseRestBookHomeworkDocumentStore,
} from '../book-homework/repository.ts';
import {
  bookHomeworkRecipientAuthorityId,
  readBookHomeworkRecipientAuthority,
} from '../book-homework/identity.ts';
import {
  FirebaseRtdbRestClient,
} from '../listening-authoring/rtdb.ts';
import {
  authorizeBookDocumentRequest,
  type BookDocumentAuthorizationResult,
  type BookDocumentAuthorizedSource,
  type LiveBookDocumentAuthority,
} from '../book-delivery/documentAuthorization.ts';
import {
  authorizeHistoricalAttemptDocument,
  createBookDocumentWorker,
  type BookDocumentWorkerAuthorization,
  type HistoricalAttemptHomeworkAuthority,
} from '../book-delivery/document-worker.ts';
import {
  FirebaseRestBookDeliveryRepository,
} from '../book-delivery/repository.ts';
import {
  createTrustedBookDeliveryPublication,
} from '../book-delivery/worker.ts';
import {
  FirebaseRestBookAssemblyPublicationRepository,
} from '../book-assembly/publication-repository.ts';
import type {
  BookRouteHandler,
  BookRouteHandlerInput,
} from '../book-route-handlers.ts';
import type {
  SourceProviderPort,
} from '../../../../src/services/book-source-delivery/sourceProvider.port.ts';
import {
  FirebaseBookResultReadRepository,
} from '../book-results/repository.ts';
import type {
  BookResultDetail,
} from '../book-results/types.ts';
import {
  isBookAttemptSourceContextProjection,
} from '../../../../src/services/book-delivery/attemptSourceContextProjection.service.ts';

const CANONICAL_BINDING_ID = /^bd_[0-9a-f]{40}$/u;
const CANONICAL_BINDING_ROUTE = /^(bd_[0-9a-f]{40})-/u;
const ROUTE_KEY_SAFE = /[^A-Za-z0-9._~-]/gu;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const SERVICE_ACCOUNT_JSON_MAX_BYTES = 64 * 1024;
const validateHomeworkAuthority: (
  value: unknown,
) => asserts value is BookHomeworkAuthorityRecord = assertValidBookHomeworkAuthorityRecord;

type DocumentProvider = Pick<SourceProviderPort, 'readObjectMetadata' | 'readBounded'>;

interface ResolvedDocumentRoute {
  readonly binding: BookDeliveryBinding;
  readonly source: BookDeliverySourceBinding;
}

export interface BookSourceDocumentRuntime {
  readonly repository: BookDeliveryRepository;
  readonly provider: DocumentProvider;
  readonly readProfile: (uid: string) => Promise<unknown>;
  readonly readCurrentAuthority: (
    binding: BookDeliveryBinding,
  ) => Promise<LiveBookDocumentAuthority>;
  readonly readResultDetail?: (input: {
    readonly bookId: string;
    readonly studentId: string;
    readonly resultId: string;
  }) => Promise<BookResultDetail | null>;
  readonly readHomeworkAuthority?: (
    homeworkId: string,
    studentId: string,
    ownerId: string,
  ) => Promise<HistoricalAttemptHomeworkAuthority | null>;
  readonly readHistoricalSource?: (input: {
    readonly binding: BookDeliveryBinding;
    readonly sourceVersionId: string;
  }) => Promise<{
    readonly availability: 'available' | 'missing' | 'deleted' | 'replaced' | 'revoked';
    readonly source: BookDocumentAuthorizedSource | null;
  }>;
}

export interface BookSourceDocumentDeliveryOptions {
  readonly runtimeFactory?: (
    env: Record<string, unknown>,
  ) => Promise<BookSourceDocumentRuntime> | BookSourceDocumentRuntime;
}

const required = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
};

const serviceAccount = (env: Record<string, unknown>): {
  readonly email: string;
  readonly privateKey: string;
  readonly raw: string;
} => {
  const email = required(env.BOOK_DELIVERY_SERVICE_IDENTITY, 'missing_book_delivery_service_identity');
  const raw = required(env.BOOK_DELIVERY_GOOGLE_SA_KEY, 'missing_book_delivery_google_sa_key');
  if (raw.length > SERVICE_ACCOUNT_JSON_MAX_BYTES) {
    throw new Error('invalid_book_delivery_google_sa_key');
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('invalid_book_delivery_google_sa_key');
  }
  if (parsed.client_email !== email
    || typeof parsed.private_key !== 'string'
    || !parsed.private_key.trim()
    || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/u.test(email)) {
    throw new Error('book_delivery_service_identity_mismatch');
  }
  return {
    email,
    privateKey: parsed.private_key.replace(/\\n/gu, '\n'),
    raw,
  };
};

const opaqueRouteKey = (
  binding: BookDeliveryBinding,
  source: BookDeliverySourceBinding,
): string => (
  `${binding.bindingId}-${binding.revision}-${source.sourceKey}-${source.sourceVersionId}`
    .replace(ROUTE_KEY_SAFE, '_')
    .slice(0, 160)
);

const activeStudentProfile = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return profile.role === 'student'
    && profile.status === 'active'
    && profile.disabled !== true
    && profile.forceReauth !== true
    && !['blocked', 'inactive', 'suspended'].includes(String(profile.status));
};

const activeDocumentProfile = (
  value: unknown,
): { readonly role: 'student' | 'teacher' } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (
    (profile.role !== 'student' && profile.role !== 'teacher')
    || profile.status !== 'active'
    || profile.disabled === true
    || profile.forceReauth === true
    || ['blocked', 'inactive', 'suspended'].includes(String(profile.status))
  ) {
    return null;
  }
  return { role: profile.role };
};

const resolveDocumentRoute = async (
  repository: Pick<BookDeliveryRepository, 'readBinding'>,
  routeKey: string,
): Promise<ResolvedDocumentRoute | null> => {
  const bindingId = CANONICAL_BINDING_ROUTE.exec(routeKey)?.[1];
  if (!bindingId || !CANONICAL_BINDING_ID.test(bindingId)) return null;
  const record = await repository.readBinding(bindingId);
  if (!record) return null;
  const matches = record.binding.sourceSet.sources.filter(
    (source) => opaqueRouteKey(record.binding, source) === routeKey,
  );
  return matches.length === 1
    ? { binding: record.binding, source: matches[0]! }
    : null;
};

const failureAuthorization = (
  result: Extract<BookDocumentAuthorizationResult, { readonly ok: false }>,
): BookDocumentWorkerAuthorization => ({
  ok: false,
  status: result.code === 'unauthorized'
    ? 401
    : result.code === 'not-found'
      ? 404
      : result.code === 'stale-binding'
        ? 409
        : 403,
  code: result.code === 'unauthorized'
    ? 'unauthorized'
    : result.code === 'not-found'
      ? 'not-found'
      : result.code === 'stale-binding'
        ? 'stale-binding'
        : 'forbidden',
});

export const isBookHomeworkDocumentScheduleOpen = (
  binding: BookDeliveryBinding,
  authority: BookHomeworkAuthorityRecord,
  now: Date,
): boolean => isBookHomeworkDocumentWindowOpen({
  binding,
  authority,
  evaluatedAt: now.toISOString(),
});

const homeworkScheduleOpen = async (
  binding: BookDeliveryBinding,
  store: FirebaseRestBookHomeworkDocumentStore,
  now: Date,
): Promise<boolean> => {
  const stored = await readBookHomeworkRecipientAuthority(
    store,
    {
      authorityId: bookHomeworkRecipientAuthorityId(
        binding.context.contextId,
        binding.recipient.recipientId,
      ),
      assignmentId: binding.context.contextId,
      ownerId: binding.issuer.ownerId,
    } satisfies BookHomeworkAuthorityScope,
    binding.recipient.recipientId,
  );
  if (!stored) return false;
  validateHomeworkAuthority(stored.value);
  return isBookHomeworkDocumentScheduleOpen(binding, stored.value, now);
};

export const deriveRevokedBookSourceVersionIds = (
  operations: Readonly<Record<string, BookSourceUploadOperation>>,
  sourceVersionIds: readonly string[],
): readonly string[] => {
  const revoked = new Set(
    Object.values(operations)
      .filter((operation) => operation.status === 'cleanup_pending' || operation.status === 'released')
      .map((operation) => operation.sourceVersionId),
  );
  return sourceVersionIds.filter((sourceVersionId) => revoked.has(sourceVersionId));
};

const defaultRuntimeFactory = (
  env: Record<string, unknown>,
): BookSourceDocumentRuntime => {
  const accountId = required(env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID, 'missing_book_source_upload_account_id');
  const privateBucketName = required(
    env.BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME,
    'missing_book_source_private_bucket_name',
  );
  if (!SAFE_ID.test(accountId) || !SAFE_ID.test(privateBucketName)) {
    throw new Error('invalid_book_source_document_configuration');
  }
  const account = serviceAccount(env);
  const accessTokenProvider = createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
    serviceAccountEmail: account.email,
    serviceAccountPrivateKey: account.privateKey,
  });
  const getAccessToken = () => accessTokenProvider.getAccessToken();
  const repository = new FirebaseRestBookDeliveryRepository({
    env,
    getAccessToken,
  });
  const rtdb = new FirebaseRtdbRestClient({
    env,
    fetchImpl: globalThis.fetch,
    getAccessToken,
  });
  const publicationRepository = new FirebaseRestBookAssemblyPublicationRepository({
    env: {
      ...env,
      BOOK_ASSEMBLY_SERVICE_IDENTITY: account.email,
    },
    getAccessToken,
  });
  const homeworkStore = new FirebaseRestBookHomeworkDocumentStore({
    env: {
      FIREBASE_PROJECT_ID: required(env.FIREBASE_PROJECT_ID, 'missing_firebase_project_id'),
      BOOK_HOMEWORK_SERVICE_IDENTITY: account.email,
      BOOK_HOMEWORK_GOOGLE_SA_KEY: account.raw,
    },
  });
  const resultRepository = new FirebaseBookResultReadRepository({
    env,
    getAccessToken,
  });
  const provider = createBackblazeB2SourceProviderFromEnv(env);
  const readAccountState = async () => validateBookSourceUploadAccountState(
    await rtdb.readValue(sourceUploadAccountPath(accountId)),
  );

  return {
    repository,
    provider,
    readProfile: (uid) => (
      SAFE_ID.test(uid) ? rtdb.readValue(`users/${uid}`) : Promise.resolve(null)
    ),
    readResultDetail: ({ bookId, studentId, resultId }) => resultRepository.readResultDetail({
      bookId,
      studentId,
      resultId,
      limit: 1,
    }),
    readHomeworkAuthority: async (homeworkId, studentId, ownerId) => {
      const stored = await readBookHomeworkRecipientAuthority(
        homeworkStore,
        {
          authorityId: bookHomeworkRecipientAuthorityId(homeworkId, studentId),
          assignmentId: homeworkId,
          ownerId,
        },
        studentId,
      );
      if (!stored) return null;
      validateHomeworkAuthority(stored.value);
      const authority = stored.value;
      if (authority.bookManifest.context.contextId !== homeworkId
        || authority.bookManifest.context.recipientId !== studentId
        || authority.ownerId !== ownerId) return null;
      return {
        homeworkId,
        ownerId: authority.ownerId,
        studentIds: [authority.bookManifest.context.recipientId],
        status: authority.visibility.status === 'committed'
          && authority.saga.state === 'committed'
          ? 'current'
          : 'unresolved',
      };
    },
    readHistoricalSource: async ({ binding, sourceVersionId }) => {
      const accountState = await readAccountState();
      const matches = Object.values(accountState.operations).filter(
        (operation) => operation.bookId === binding.book.bookId
          && operation.ownerId === binding.issuer.ownerId
          && operation.sourceVersionId === sourceVersionId,
      );
      if (matches.some((operation) => operation.status === 'cleanup_pending')) {
        return { availability: 'revoked', source: null };
      }
      if (matches.some((operation) => operation.status === 'released')) {
        return { availability: 'deleted', source: null };
      }
      const available = matches.filter(
        (operation) => operation.status === 'verified_completed'
          && operation.verifiedStorage !== undefined,
      );
      if (available.length !== 1) return { availability: 'missing', source: null };
      const storage = available[0]!.verifiedStorage!;
      return {
        availability: 'available',
        source: {
          ...storage,
          provider: 'b2',
          bucket: privateBucketName,
          objectKey: storage.providerObjectKey,
        },
      };
    },
    readCurrentAuthority: async (binding) => {
      if (binding.context.kind === 'future_live') {
        throw new Error('unsupported_book_document_context');
      }
      const scope = await publicationRepository.readScope(binding.book.bookId);
      const publication = createTrustedBookDeliveryPublication({
        bookId: binding.book.bookId,
        publicationId: binding.book.publicationId,
        publicationRevision: binding.book.publicationRevision,
        recipientId: binding.recipient.recipientId,
        contextKind: binding.context.kind as 'solo' | 'preview' | 'homework' | 'course' | 'class',
        contextId: binding.context.contextId,
        scope: binding.scope,
      }, scope, binding.schedulePolicy);
      const accountState = await readAccountState();
      const sourceVersionIds = publication.sourceSet.sources.map(
        (source) => source.sourceVersionId,
      );
      const revokedSourceVersionIds = deriveRevokedBookSourceVersionIds(
        accountState.operations,
        sourceVersionIds,
      );
      const sourceLocations: BookDocumentAuthorizedSource[] = [];
      for (const sourceVersionId of sourceVersionIds) {
        const matches = Object.values(accountState.operations).filter(
          (operation) => operation.status === 'verified_completed'
            && operation.bookId === binding.book.bookId
            && operation.ownerId === binding.issuer.ownerId
            && operation.sourceVersionId === sourceVersionId
            && operation.verifiedStorage !== undefined,
        );
        if (matches.length !== 1) continue;
        const storage = matches[0]!.verifiedStorage!;
        sourceLocations.push({
          ...storage,
          provider: 'b2',
          bucket: privateBucketName,
          objectKey: storage.providerObjectKey,
        });
      }
      const scheduleOpen = binding.context.kind === 'solo'
        ? true
        : binding.context.kind === 'homework'
          ? await homeworkScheduleOpen(binding, homeworkStore, new Date())
          : false;
      return {
        publicationStatus: 'published',
        scheduleOpen,
        sourceVersionIds,
        revokedSourceVersionIds,
        sourceLocations,
      };
    },
  };
};

export const createBookSourceDocumentDeliveryHandler = (
  options: BookSourceDocumentDeliveryOptions = {},
): BookRouteHandler => async (input: BookRouteHandlerInput): Promise<Response> => {
  let runtime: BookSourceDocumentRuntime;
  try {
    runtime = await (options.runtimeFactory ?? defaultRuntimeFactory)(input.env);
  } catch {
    return new Response(
      JSON.stringify({ code: 'document_configuration_unavailable' }),
      {
        status: 503,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  const worker = createBookDocumentWorker({
    provider: runtime.provider,
    authorize: async (): Promise<BookDocumentWorkerAuthorization> => {
      const profile = await runtime.readProfile(input.uid);
      if (!activeStudentProfile(profile)) {
        return { ok: false, status: 403, code: 'forbidden' };
      }
      const routeKey = input.params.opaqueRouteKey;
      if (!routeKey) return { ok: false, status: 404, code: 'not-found' };
      const resolved = await resolveDocumentRoute(runtime.repository, routeKey);
      if (!resolved) return { ok: false, status: 404, code: 'not-found' };
      const result = await authorizeBookDocumentRequest({
        repository: runtime.repository,
        uid: input.uid,
        recipientId: resolved.binding.recipient.recipientId,
        contextId: resolved.binding.context.contextId,
        profile,
        readCurrentAuthority: runtime.readCurrentAuthority,
      });
      if (result.ok === false) return failureAuthorization(result);
      const source = result.decision.sourceLocations.find(
        (candidate) => candidate.sourceVersionId === resolved.source.sourceVersionId,
      );
      if (!source) return { ok: false, status: 409, code: 'stale-binding' };
      return {
        ok: true,
        decision: result.decision,
        source,
      };
    },
  });
  return worker.fetch(input.request, input.env);
};

export const createBookHistoricalAttemptDocumentDeliveryHandler = (
  options: BookSourceDocumentDeliveryOptions = {},
): BookRouteHandler => async (input: BookRouteHandlerInput): Promise<Response> => {
  let runtime: BookSourceDocumentRuntime;
  try {
    runtime = await (options.runtimeFactory ?? defaultRuntimeFactory)(input.env);
  } catch {
    return new Response(JSON.stringify({ code: 'document_configuration_unavailable' }), {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    });
  }
  if (!runtime.readResultDetail || !runtime.readHomeworkAuthority || !runtime.readHistoricalSource) {
    return new Response(JSON.stringify({ code: 'historical_document_configuration_unavailable' }), {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    });
  }
  const worker = createBookDocumentWorker({
    provider: runtime.provider,
    authorize: async (): Promise<BookDocumentWorkerAuthorization> => {
      const { bookId, studentId, resultId, opaqueRouteKey: routeKey } = input.params;
      if (!bookId || !studentId || !resultId || !routeKey) {
        return { ok: false, status: 404, code: 'not-found' };
      }
      const profile = activeDocumentProfile(await runtime.readProfile(input.uid));
      if (!profile) return { ok: false, status: 403, code: 'forbidden' };
      const detail = await runtime.readResultDetail!({ bookId, studentId, resultId });
      const projection = detail?.attemptSourceContext;
      if (
        !detail
        || detail.bookId !== bookId
        || detail.studentId !== studentId
        || detail.resultId !== resultId
        || !isBookAttemptSourceContextProjection(projection)
      ) {
        return { ok: false, status: 404, code: 'not-found' };
      }
      if (projection.state !== 'available') {
        return { ok: false, status: 404, code: 'historical_source_unavailable' };
      }
      const metadata = projection.metadata;
      if (
        metadata.bookId !== bookId
        || metadata.studentId !== studentId
        || metadata.resultId !== resultId
        || metadata.attemptId !== detail.attemptId
        || projection.documentResource.opaqueRouteKey !== routeKey
      ) {
        return { ok: false, status: 403, code: 'forbidden' };
      }
      const resolved = await resolveDocumentRoute(runtime.repository, routeKey);
      const placement = resolved?.binding.placements.find(
        (candidate) => candidate.placementId === metadata.placementId,
      );
      const placementSource = placement?.sourcePageScopes.find(
        (candidate) => candidate.sourceKey === metadata.sourceKey,
      );
      const bindingPageAllowed = resolved?.source.localPageScope.kind === 'all'
        || resolved?.source.localPageScope.pages.includes(metadata.physicalPageNumber);
      if (
        !resolved
        || resolved.binding.bindingId !== detail.bindingId
        || resolved.binding.revision !== detail.bindingRevision
        || resolved.binding.recipient.recipientId !== metadata.studentId
        || resolved.binding.context.recipientId !== metadata.studentId
        || resolved.binding.context.contextId !== metadata.contextId
        || resolved.binding.context.kind !== metadata.surface
        || resolved.binding.context.ownerId !== metadata.ownerId
        || resolved.binding.issuer.ownerId !== metadata.ownerId
        || resolved.source.sourceKey !== metadata.sourceKey
        || resolved.source.sourceVersionId !== metadata.sourceVersionId
        || !bindingPageAllowed
        || !placement
        || placement.activityId !== metadata.activityId
        || placement.activityVersionId !== metadata.activityVersionId
        || placement.activityVersion !== metadata.activityVersion
        || !placement.pageGroupKeys.includes(metadata.pageGroupId)
        || !placementSource
        || !placementSource.pages.includes(metadata.physicalPageNumber)
      ) {
        return { ok: false, status: 403, code: 'forbidden' };
      }
      const historical = await runtime.readHistoricalSource!({
        binding: resolved.binding,
        sourceVersionId: metadata.sourceVersionId,
      });
      const homeworkAuthority = metadata.surface === 'homework'
        ? await runtime.readHomeworkAuthority!(
          metadata.contextId,
          metadata.studentId,
          resolved.binding.issuer.ownerId,
        )
        : null;
      return authorizeHistoricalAttemptDocument({
        viewer: { uid: input.uid, role: profile.role, status: 'active' },
        projection,
        homeworkAuthority,
        source: historical.source,
        sourceAvailability: historical.availability,
        request: {
          attemptId: metadata.attemptId,
          resultId: metadata.resultId,
          bookId: metadata.bookId,
          componentId: metadata.componentId,
          sourceVersionId: metadata.sourceVersionId,
          physicalPageNumber: metadata.physicalPageNumber,
          pageGroupId: metadata.pageGroupId,
          placementId: metadata.placementId,
          activityVersionId: metadata.activityVersionId,
          interactionFocusId: metadata.interactionFocusId,
          opaqueRouteKey: routeKey,
        },
      });
    },
  });
  return worker.fetch(input.request, input.env);
};
