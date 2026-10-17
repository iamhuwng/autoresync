import {
  createBookSourceUploadControl,
  SourceUploadControlError,
  type SourceUploadBeginResult,
  type BookSourceUploadControlDependencies,
} from '../../../../src/services/book-source-delivery/sourceUpload.service.ts';
import {
  createTrustedFirebaseRtdbServiceAccountAccessTokenProvider,
  createTrustedFirebaseSourceUploadRtdbTransaction,
} from '../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import {
  SourceUploadRtdbRepository,
  sourceUploadAccountPath,
  validateBookSourceUploadAccountState,
} from '../../../../src/services/book-source-delivery/sourceUpload.rtdbRepository.ts';
import { createMaterialBookSourceAttachmentService } from '../../../../src/services/book-source-delivery/materialBookSourceAttachment.service.ts';
import type {
  BookSourceUploadAccountState,
  BookSourceUploadOperation,
} from '../../../../src/types/bookSource.types.ts';
import type { SourceSetCandidate } from '../../../../src/types/bookAssembly.types.ts';
import {
  dispatchBookSourceControlRequest,
  type BookSourceControlDispatchResult,
  type BookSourceControlRoute,
  type BookSourceUploadControlService,
} from '../../book-source-worker/control-host.ts';
import { resolveBackblazeB2ProviderWiring } from '../../book-source-worker/backblaze-b2-provider-wiring.ts';
import { createBookSourceDirectPdfPageCountAdapter } from '../../book-source-worker/direct-pdf-page-count.ts';
import type { BookRouteHandlerInput } from '../book-route-handlers.ts';
import {
  attachVerifiedSourceSet,
  createFirebaseMaterialBookSourceAttachmentRepository,
} from './material-book-source-attachment-repository.ts';
import {
  isActiveBookSourceAuthorityProfile,
  readTrustedSourceChecksum,
  readTrustedSourceSafety,
} from './trusted-source-contract.ts';

const MAX_ACCOUNT_STATE_BYTES = 32 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const SERVICE_ACCOUNT_JSON_MAX_BYTES = 64 * 1024;
const BOOK_SOURCE_AUTHORIZATION_CACHE = new Map<string, SourceUploadBeginResult>();

export interface BookSourceUploadWorkerEnv extends Record<string, unknown> {
  readonly BOOK_SOURCE_UPLOAD_ACCOUNT_ID?: unknown;
  readonly BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY?: unknown;
  readonly BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY?: unknown;
  readonly FIREBASE_DB_URL?: unknown;
  readonly FIREBASE_PROJECT_ID?: unknown;
  readonly BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN?: unknown;
  readonly BOOK_SOURCE_B2_OBJECT_KEY_PREFIX?: unknown;
}

export interface BookSourceUploadRuntime {
  readonly service: BookSourceUploadControlService;
}

export interface BookSourceUploadWorkerOptions {
  readonly runtimeFactory?: (
    env: BookSourceUploadWorkerEnv,
  ) => Promise<BookSourceUploadRuntime> | BookSourceUploadRuntime;
}

const required = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new SourceUploadControlError('invalid_deployment');
  if (value.length > 32 * 1024) throw new SourceUploadControlError('invalid_deployment');
  return value.trim();
};

const databaseUrl = (value: unknown): string => {
  let parsed: URL;
  try {
    parsed = new URL(required(value, 'database_url'));
  } catch {
    throw new SourceUploadControlError('invalid_deployment');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new SourceUploadControlError('invalid_deployment');
  }
  return parsed.href.replace(/\/$/u, '');
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readBoundedJson = async (response: Response): Promise<unknown> => {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_ACCOUNT_STATE_BYTES)) {
    throw new SourceUploadControlError('account_state_unavailable');
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ACCOUNT_STATE_BYTES) {
      await reader.cancel();
      throw new SourceUploadControlError('account_state_unavailable');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (!text || text === 'null') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceUploadControlError('account_state_unavailable');
  }
};

const parseServiceAccount = (env: BookSourceUploadWorkerEnv): {
  readonly email: string;
  readonly privateKey: string;
} => {
  const identity = required(env.BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY, 'service_identity');
  const raw = required(env.BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY, 'service_account_key');
  if (raw.length > SERVICE_ACCOUNT_JSON_MAX_BYTES) {
    throw new SourceUploadControlError('invalid_deployment');
  }
  let parsed: Record<string, unknown> | null;
  try {
    parsed = record(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  const email = parsed?.client_email;
  const privateKey = parsed?.private_key;
  if (typeof email !== 'string' || email !== identity
    || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/u.test(email)
    || typeof privateKey !== 'string' || !privateKey.trim()) {
    throw new SourceUploadControlError('invalid_deployment');
  }
  return { email, privateKey: privateKey.replace(/\\n/gu, '\n') };
};

const safeStatus = (operation: BookSourceUploadOperation) => {
  const checksum = readTrustedSourceChecksum(operation.expectedChecksum);
  const safety = readTrustedSourceSafety(operation, {
    sourceVersionId: operation.sourceVersionId,
    checksum: operation.expectedChecksum,
  });
  if (!checksum || !safety || operation.status === 'retired') {
    throw new SourceUploadControlError('account_state_unavailable');
  }
  return Object.freeze({
    reservationId: operation.reservationId,
    bookId: operation.bookId,
    sourceVersionId: operation.sourceVersionId,
    status: operation.status,
    retryKind: operation.status === 'cleanup_pending'
      || (operation.status === 'verified_completed' && operation.versionReconciliation !== undefined)
      ? 'cleanup' as const
      : operation.status === 'reserved'
        ? 'bytes' as const
        : 'none' as const,
    ...(operation.cleanup?.nextRetryAt || operation.versionReconciliation?.nextRetryAt
      ? { nextRetryAt: operation.cleanup?.nextRetryAt ?? operation.versionReconciliation!.nextRetryAt }
      : {}),
    ...(operation.cleanup?.lastErrorCode || operation.versionReconciliation?.lastErrorCode
      ? { lastErrorCode: operation.cleanup?.lastErrorCode ?? operation.versionReconciliation!.lastErrorCode }
      : {}),
  });
};

export const listBookSourceProjections = (
  state: Pick<BookSourceUploadAccountState, 'assemblyBooks'>,
  actorId: string,
  bookId: string,
) => Object.entries(state.assemblyBooks?.[bookId] ?? {})
  .flatMap(([sourceVersionId, projection]) => {
    const raw = record(projection);
    const checksum = readTrustedSourceChecksum(raw?.checksum);
    const safety = readTrustedSourceSafety(raw, {
      sourceVersionId,
      purpose: 'book-source',
      checksum: raw?.checksum,
    });
    if (!raw
      || !SAFE_ID.test(sourceVersionId)
      || raw.ownerId !== actorId
      || raw.bookId !== bookId
      || raw.sourceVersionId !== sourceVersionId
      || !SAFE_ID.test(String(raw.sourceKey))
      || !checksum
      || !Number.isSafeInteger(raw.physicalPageCount)
      || (raw.physicalPageCount as number) <= 0
      || raw.verifiedUsable !== true
      || !safety
      || safety.studentSafeStatus === 'rejected') return [];
    return [{
      sourceKey: raw.sourceKey as string,
      sourceVersionId,
      bookId,
      checksum,
      physicalPageCount: raw.physicalPageCount as number,
      verifiedUsable: true as const,
      purpose: safety.purpose,
      studentSafeStatus: safety.studentSafeStatus,
      studentSafeDecision: safety.studentSafeDecision,
    }];
  })
  .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)
    || left.sourceVersionId.localeCompare(right.sourceVersionId));

const defaultRuntimeFactory = async (
  env: BookSourceUploadWorkerEnv,
): Promise<BookSourceUploadRuntime> => {
  const accountId = required(env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID, 'account_id');
  if (!SAFE_ID.test(accountId)) throw new SourceUploadControlError('invalid_deployment');
  const baseUrl = databaseUrl(env.FIREBASE_DB_URL);
  const serviceAccount = parseServiceAccount(env);
  const accessTokenProvider = createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
    serviceAccountEmail: serviceAccount.email,
    serviceAccountPrivateKey: serviceAccount.privateKey,
  });
  const repository = new SourceUploadRtdbRepository(
    createTrustedFirebaseSourceUploadRtdbTransaction({
      databaseUrl: baseUrl,
      accessTokenProvider,
    }),
    {},
  );
  const materialBookSourceAttachmentRepository = createFirebaseMaterialBookSourceAttachmentRepository({
    env: { FIREBASE_DB_URL: baseUrl },
    accountId,
    getAccessToken: () => accessTokenProvider.getAccessToken(),
  });
  const materialBookSourceAttachment = createMaterialBookSourceAttachmentService(
    materialBookSourceAttachmentRepository,
  );
  const readAccountState = async (): Promise<BookSourceUploadAccountState> => {
    const response = await fetch(
      `${baseUrl}/${sourceUploadAccountPath(accountId)}.json`,
      { headers: { Authorization: `Bearer ${await accessTokenProvider.getAccessToken()}` } },
    );
    if (!response.ok) throw new SourceUploadControlError('account_state_unavailable');
    return validateBookSourceUploadAccountState(await readBoundedJson(response));
  };
  const readTrustedValue = async (path: string): Promise<unknown> => {
    const response = await fetch(
      `${baseUrl}/${path}.json`,
      { headers: { Authorization: `Bearer ${await accessTokenProvider.getAccessToken()}` } },
    );
    if (!response.ok) throw new SourceUploadControlError('authority_denied');
    return readBoundedJson(response);
  };
  const authorizeOwner = async ({
    actorId,
    bookId,
  }: { readonly actorId: string; readonly bookId: string }): Promise<boolean> => {
    if (!SAFE_ID.test(actorId) || !SAFE_ID.test(bookId)) return false;
    const [book, profile] = await Promise.all([
      readTrustedValue(`material_catalog/books/${bookId}`),
      readTrustedValue(`users/${actorId}`),
    ]);
    const bookRecord = record(book);
    const profileRecord = record(profile);
    return bookRecord?.bookId === bookId
      && bookRecord.ownerId === actorId
      && bookRecord.status !== 'archived'
      && isActiveBookSourceAuthorityProfile(profileRecord, 'teacher');
  };
  const authorizeDecision = async ({
    actorId,
    bookId,
  }: { readonly actorId: string; readonly bookId: string }): Promise<boolean> => {
    if (!SAFE_ID.test(actorId) || !SAFE_ID.test(bookId)) return false;
    const [book, profile] = await Promise.all([
      readTrustedValue(`material_catalog/books/${bookId}`),
      readTrustedValue(`users/${actorId}`),
    ]);
    const bookRecord = record(book);
    const profileRecord = record(profile);
    const activeAdmin = isActiveBookSourceAuthorityProfile(profileRecord, 'super_admin');
    const activeOwner = bookRecord?.ownerId === actorId
      && isActiveBookSourceAuthorityProfile(profileRecord, 'teacher');
    return bookRecord?.bookId === bookId
      && bookRecord.status !== 'archived'
      && (activeOwner || activeAdmin);
  };
  const providerWiring = resolveBackblazeB2ProviderWiring(env);
  if (!providerWiring.provider) throw new SourceUploadControlError('invalid_deployment');
  const provider = providerWiring.provider;
  const commonDependencies: Omit<BookSourceUploadControlDependencies, 'releaseAuthorization'> = {
    bookManagementAuthority: {
      canManageBookSource: authorizeOwner,
      canDecideStudentSafeSource: authorizeDecision,
    },
    deployment: {
      accountId,
      storageLocationId: required(env.BOOK_SOURCE_B2_STORAGE_LOCATION_ID, 'storage_location_id'),
      providerKind: 'backblaze-b2-s3',
      privateBucketId: required(env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID, 'private_bucket_id'),
      objectKeyPrefix: typeof env.BOOK_SOURCE_B2_OBJECT_KEY_PREFIX === 'string'
        ? env.BOOK_SOURCE_B2_OBJECT_KEY_PREFIX
        : 'book-source/',
    },
    accountStateReader: { read: readAccountState },
    repository,
    provider,
    pageCount: createBookSourceDirectPdfPageCountAdapter(provider),
    clock: { now: () => new Date() },
  };
  const productionControl = createBookSourceUploadControl({
    ...commonDependencies,
    authorizationCache: BOOK_SOURCE_AUTHORIZATION_CACHE,
    releaseAuthorization: { authorizeUpload: () => true },
  });
  const service: BookSourceUploadControlService = {
    begin: productionControl.begin,
    decideStudentSafeSource: async (input) => {
      const before = (await readAccountState()).operations[input.reservationId];
      if (!before
        || before.ownerId !== input.actorId
        || before.bookId !== input.bookId
        || before.status !== 'verified_completed'
        || (before.purpose !== 'book-source' && before.purpose !== 'student-document')
        || before.studentSafeStatus === 'rejected') {
        throw new SourceUploadControlError('reservation_conflict');
      }
      const result = await productionControl.decideStudentSafeSource(input);
      const state = await readAccountState();
      const operation = state.operations[input.reservationId];
      const checksum = readTrustedSourceChecksum(operation?.expectedChecksum);
      const decision = result.studentSafeDecision;
      const safety = readTrustedSourceSafety(result, {
        sourceVersionId: result.sourceVersionId,
        purpose: before.purpose,
        checksum: operation?.expectedChecksum,
      });
      if (!operation
        || operation.ownerId !== input.actorId
        || operation.bookId !== input.bookId
        || operation.status !== 'verified_completed'
        || result.status !== 'verified_completed'
        || operation.purpose !== before.purpose
        || result.purpose !== before.purpose
        || result.sourceVersionId !== operation.sourceVersionId
        || !checksum
        || !decision
        || decision.decidedBy !== input.actorId
        || !safety
        || safety.studentSafeStatus === 'unreviewed'
        || safety.studentSafeDecision === undefined) {
        throw new SourceUploadControlError('account_state_unavailable');
      }
      return {
        status: 'verified_completed' as const,
        reservationId: result.reservationId,
        sourceVersionId: result.sourceVersionId,
        checksum,
        purpose: before.purpose,
        studentSafeStatus: result.studentSafeStatus as Exclude<BookSourceUploadOperation['studentSafeStatus'], 'unreviewed'>,
        studentSafeDecision: safety.studentSafeDecision,
      };
    },
    complete: productionControl.complete,
    attachSourceSet: async ({
      actorId,
      bookId,
      operationId,
      expectedBookRevision,
      expectedSourceSetRevision,
      sourceSet,
    }) => {
      if (!(await authorizeOwner({ actorId, bookId }))) {
        throw new SourceUploadControlError('authority_denied');
      }
      if (sourceSet.sourceStrategy === 'component_pdfs') {
        throw new SourceUploadControlError('authority_denied');
      }
      const result = await attachVerifiedSourceSet(materialBookSourceAttachment, {
        ownerId: actorId,
        bookId,
        operationId,
        expectedBookRevision,
        expectedSourceSetRevision,
        sourceSet,
      });
      if ((result.status !== 'attached' && result.status !== 'replaced' && result.status !== 'replayed')
        || !result.sourceSet || result.bookRevision === undefined || result.sourceSetRevision === undefined) {
        throw new SourceUploadControlError('account_state_unavailable');
      }
      return {
        status: result.status,
        bookRevision: result.bookRevision,
        sourceSetRevision: result.sourceSetRevision,
        sourceSet: result.sourceSet as SourceSetCandidate,
      };
    },
    status: async ({ actorId, bookId, reservationId }) => {
      if (!(await authorizeOwner({ actorId, bookId }))) {
        throw new SourceUploadControlError('authority_denied');
      }
      const state = await readAccountState();
      const operation = state.operations[reservationId];
      if (!operation || operation.bookId !== bookId || operation.ownerId !== actorId) {
        throw new SourceUploadControlError('reservation_not_found');
      }
      return safeStatus(operation);
    },
    sources: async ({ actorId, bookId }) => {
      if (!(await authorizeOwner({ actorId, bookId }))) {
        throw new SourceUploadControlError('authority_denied');
      }
      const state = await readAccountState();
      return { sources: listBookSourceProjections(state, actorId, bookId) };
    },
    requestCleanup: async ({
      actorId,
      bookId,
      reservationId,
      reason,
      providerFileId,
      providerFileVersionId,
    }) => {
      if (!(await authorizeOwner({ actorId, bookId }))) {
        throw new SourceUploadControlError('authority_denied');
      }
      const state = await readAccountState();
      const operation = state.operations[reservationId];
      if (!operation || operation.bookId !== bookId || operation.ownerId !== actorId) {
        throw new SourceUploadControlError('reservation_not_found');
      }
      const next = await repository.requestCleanup({
        accountId,
        expectedRevision: state.revision,
        reservationId,
        ownerId: actorId,
        reason,
        requestedAt: new Date().toISOString(),
        providerFileId,
        providerFileVersionId,
      });
      return safeStatus(next.operations[reservationId]!);
    },
    reconcile: async () => {
      throw new SourceUploadControlError('rollout_denied');
    },
  };
  return { service };
};

type CanonicalSourceAction = Extract<
  BookSourceControlRoute['action'],
  'begin' | 'decideStudentSafeSource' | 'complete' | 'attach' | 'status' | 'sources' | 'cancel'
>;

const handlerFor = (
  options: BookSourceUploadWorkerOptions,
  action: CanonicalSourceAction,
) => async (input: BookRouteHandlerInput): Promise<BookSourceControlDispatchResult> => {
  const env = input.env as BookSourceUploadWorkerEnv;
  let runtime: BookSourceUploadRuntime;
  try {
    runtime = await (options.runtimeFactory ?? defaultRuntimeFactory)(env);
  } catch (error) {
    console.error('book_source_runtime_unavailable', error instanceof Error ? error.message : String(error));
    const code = error instanceof SourceUploadControlError && error.code === 'invalid_deployment'
      ? 'invalid_deployment'
      : 'book_source_upload_unavailable';
    return { body: { code }, init: { status: 503 } };
  }
  const bookId = input.params.bookId!;
  const route: BookSourceControlRoute = action === 'begin' || action === 'attach' || action === 'sources'
    ? { action, bookId }
    : { action, bookId, reservationId: input.params.reservationId! };
  return dispatchBookSourceControlRequest({
    request: input.request,
    uid: input.uid,
    route,
    service: runtime.service,
    ...(input.executionContext === undefined ? {} : { executionContext: input.executionContext }),
  });
};

export const createBookSourceUploadWorkerHandlers = (
  options: BookSourceUploadWorkerOptions = {},
) => {
  return Object.freeze({
    begin: handlerFor(options, 'begin'),
    decideStudentSafeSource: handlerFor(options, 'decideStudentSafeSource'),
    complete: handlerFor(options, 'complete'),
    attach: handlerFor(options, 'attach'),
    status: handlerFor(options, 'status'),
    sources: handlerFor(options, 'sources'),
    cancel: handlerFor(options, 'cancel'),
  });
};
