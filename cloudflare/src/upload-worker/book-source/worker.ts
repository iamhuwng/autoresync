import {
  createSourceUploadControl,
  SourceUploadControlError,
  type SourceUploadControl,
  type SourceUploadBeginResult,
  type SourceUploadControlDependencies,
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
import type {
  BookSourceUploadAccountState,
  BookSourceUploadOperation,
} from '../../../../src/types/bookSource.types.ts';
import { createBookRolloutTrustedSeamGate } from '../../book-rollout-seams.ts';
import { createBookRolloutWorkerGate } from '../../book-rollout-gate.ts';
import { createBookSourceControlHost, type BookSourceUploadControlService } from '../../book-source-worker/control-host.ts';
import { createBackblazeB2SourceProviderFromEnv } from '../../book-source-worker/backblaze-b2-source-provider.ts';
import type { BookRouteHandlerInput } from '../book-route-handlers.ts';
import { evaluateTicket49PreviewUploadGate } from './ticket49-preview-gate.ts';

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
  readonly BOOK_SOURCE_TICKET49_PREVIEW_GATE_JSON?: unknown;
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

const safeStatus = (operation: BookSourceUploadOperation) => Object.freeze({
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
      && (profileRecord?.role === 'teacher' || profileRecord?.role === 'super_admin')
      && profileRecord.disabled !== true
      && profileRecord.forceReauth !== true
      && !['blocked', 'inactive', 'suspended'].includes(String(profileRecord.status ?? ''));
  };
  const productionRollout = createBookRolloutTrustedSeamGate(
    createBookRolloutWorkerGate(env),
  ).upload;
  const commonDependencies: Omit<SourceUploadControlDependencies, 'rolloutGate'> = {
    bookManagementAuthority: { canManageBookSource: authorizeOwner },
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
    provider: createBackblazeB2SourceProviderFromEnv(env),
    clock: { now: () => new Date() },
  };
  const productionControl = createSourceUploadControl({
    ...commonDependencies,
    authorizationCache: BOOK_SOURCE_AUTHORIZATION_CACHE,
    rolloutGate: { authorizeUpload: productionRollout },
  });
  const begin = (input: Parameters<typeof productionControl.begin>[0]) => {
    if (env.BOOK_SOURCE_TICKET49_PREVIEW_GATE_JSON === undefined) {
      return productionControl.begin(input);
    }
    const previewControl = createSourceUploadControl({
      ...commonDependencies,
      authorizationCache: BOOK_SOURCE_AUTHORIZATION_CACHE,
      rolloutGate: {
        isUploadAllowed: () => evaluateTicket49PreviewUploadGate(
          env.BOOK_SOURCE_TICKET49_PREVIEW_GATE_JSON,
          {
            teacherId: input.actorId,
            bookId: input.bookId,
            providerObjectKeyPrefix: commonDependencies.deployment?.objectKeyPrefix,
          },
          new Date(),
        ),
      },
    });
    // The disposable gate may exercise a replacement after a prior released
    // drill, while the production path keeps its normal caller-selected kind.
    return previewControl.begin({ ...input, kind: 'replacement' });
  };
  const service: BookSourceUploadControlService = {
    begin,
    complete: productionControl.complete,
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

const handlerFor = (
  options: BookSourceUploadWorkerOptions,
) => async (input: BookRouteHandlerInput): Promise<Response> => {
  const env = input.env as BookSourceUploadWorkerEnv;
  if (typeof env.BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN !== 'string'
    || !env.BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN.trim()) {
    return Response.json({ code: 'invalid_deployment' }, { status: 500 });
  }
  const origin = env.BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN.trim();
  if (input.request.headers.get('origin') !== origin) {
    return Response.json({ code: 'cors_origin_denied' }, { status: 403 });
  }
  const runtime = await (options.runtimeFactory ?? defaultRuntimeFactory)(env);
  return createBookSourceControlHost({
    service: runtime.service,
    verifier: {
      verifyAuthorizationHeader: async () => ({ valid: true, uid: input.uid }),
    },
  }).fetch(input.request, {
    FIREBASE_PROJECT_ID: typeof env.FIREBASE_PROJECT_ID === 'string' ? env.FIREBASE_PROJECT_ID : '',
    BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: origin,
  });
};

export const createBookSourceUploadWorkerHandlers = (
  options: BookSourceUploadWorkerOptions = {},
) => {
  const handler = handlerFor(options);
  return Object.freeze({
    begin: handler,
    complete: handler,
    status: handler,
    cancel: handler,
  });
};
