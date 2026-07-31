import {
  createTrustedFirebaseRtdbServiceAccountAccessTokenProvider,
} from '../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import {
  sourceUploadAccountPath,
  validateBookSourceUploadAccountState,
} from '../../../../src/services/book-source-delivery/sourceUpload.rtdbRepository.ts';
import {
  resolveEffectiveBookHomeworkWindow,
} from '../../../../src/services/book-homework/bookHomeworkSchedule.service.ts';
import type {
  BookHomeworkAuthorityRecord,
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
  FirebaseRtdbRestClient,
} from '../listening-authoring/rtdb.ts';
import {
  authorizeBookDocumentRequest,
  type BookDocumentAuthorizationResult,
  type BookDocumentAuthorizedSource,
  type LiveBookDocumentAuthority,
} from '../book-delivery/documentAuthorization.ts';
import {
  createBookDocumentWorker,
  type BookDocumentWorkerAuthorization,
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

const scopeNodeKeys = (
  binding: BookDeliveryBinding,
  outline: BookDeliveryBinding['outline'],
): readonly string[] => {
  if (binding.scope.kind === 'subtree') {
    const selected = new Set(binding.scope.nodeKeys);
    let changed = true;
    while (changed) {
      changed = false;
      outline.forEach((node) => {
        if (node.parentNodeKey !== null
          && selected.has(node.parentNodeKey)
          && !selected.has(node.nodeKey)) {
          selected.add(node.nodeKey);
          changed = true;
        }
      });
    }
    return [...selected];
  }
  const selected = new Set(binding.scope.placementIds);
  return [...new Set(binding.placements
    .filter((placement) => selected.has(placement.placementId))
    .map((placement) => placement.nodeKey))];
};

export const isBookHomeworkDocumentScheduleOpen = (
  binding: BookDeliveryBinding,
  authority: BookHomeworkAuthorityRecord,
  now: Date,
): boolean => {
  if (authority.assignmentId !== binding.context.contextId
    || authority.ownerId !== binding.issuer.ownerId
    || authority.visibility.status !== 'committed'
    || authority.saga.state !== 'committed'
    || authority.bookManifest.bindingRevision !== binding.revision
    || authority.bookManifest.book.bookId !== binding.book.bookId
    || authority.bookManifest.book.bookRevision !== binding.book.bookRevision
    || authority.bookManifest.book.publicationId !== binding.book.publicationId
    || authority.bookManifest.book.publicationRevision !== binding.book.publicationRevision
    || authority.bookManifest.context.contextId !== binding.context.contextId
    || authority.bookManifest.context.recipientId !== binding.recipient.recipientId) {
    return false;
  }
  const nodes = scopeNodeKeys(binding, authority.bookManifest.outline);
  if (nodes.length === 0) return false;
  return nodes.every((nodeKey) => resolveEffectiveBookHomeworkWindow({
    schedule: authority.schedule,
    outline: authority.bookManifest.outline,
    nodeKey,
    now,
  }).isAccessible);
};

const homeworkScheduleOpen = async (
  binding: BookDeliveryBinding,
  store: FirebaseRestBookHomeworkDocumentStore,
  now: Date,
): Promise<boolean> => {
  const stored = await store.read(binding.context.contextId);
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
  const provider = createBackblazeB2SourceProviderFromEnv(env);

  return {
    repository,
    provider,
    readProfile: (uid) => (
      SAFE_ID.test(uid) ? rtdb.readValue(`users/${uid}`) : Promise.resolve(null)
    ),
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
      const accountState = validateBookSourceUploadAccountState(
        await rtdb.readValue(sourceUploadAccountPath(accountId)),
      );
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
