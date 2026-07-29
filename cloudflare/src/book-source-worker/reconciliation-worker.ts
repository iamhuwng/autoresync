import {
  createSourceUploadReconciler,
  type SourceUploadReconciliationDependencies,
} from '../../../src/services/book-source-delivery/sourceLifecycle.service.ts';
import type {
  BookSourceUploadAccountState,
  BookSourceUploadOperation,
} from '../../../src/types/bookSource.types.ts';
import {
  createTrustedFirebaseRtdbServiceAccountAccessTokenProvider,
  createTrustedFirebaseSourceUploadRtdbTransaction,
} from '../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import {
  SourceUploadRtdbRepository,
  sourceUploadAccountPath,
  validateBookSourceUploadAccountState,
} from '../../../src/services/book-source-delivery/sourceUpload.rtdbRepository.ts';
import { createBookSourceControlHost } from './control-host';
import {
  createBackblazeB2ExactVersionCleanupAdapterFromEnv,
  type BackblazeB2ExactVersionCleanupEnv,
} from './backblaze-b2-exact-version-cleanup-adapter';
import { createCapacityProbeWorker } from './capacity-probe-worker';

const MAX_ACCOUNT_STATE_BYTES = 32 * 1024 * 1024;
const CAPACITY_RECONCILIATION_PATH = '/internal/book-source-capacity/reconciliation-page';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

interface ReconciliationWorkerEnv extends BackblazeB2ExactVersionCleanupEnv, Record<string, unknown> {
  readonly BOOK_SOURCE_RECONCILIATION_STATE?: string;
  readonly BOOK_SOURCE_RECONCILIATION_ACTION_STATE?: string;
  readonly BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE?: string;
  readonly BOOK_SOURCE_RECONCILIATION_DIAGNOSTICS?: string;
  readonly BOOK_SOURCE_UPLOAD_ACCOUNT_ID: string;
  readonly BOOK_SOURCE_RECONCILIATION_LEASE_OWNER: string;
  readonly BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL: string;
  readonly BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  readonly FIREBASE_DATABASE_URL: string;
  readonly FIREBASE_PROJECT_ID: string;
  readonly BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN?: string;
}

const required = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('invalid_deployment');
  return value.trim();
};

const databaseUrl = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('invalid_deployment');
  }
  return url.href.replace(/\/$/u, '');
};

const readBoundedJson = async (response: Response): Promise<unknown> => {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_ACCOUNT_STATE_BYTES)) {
    throw new Error('account_state_unavailable');
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ACCOUNT_STATE_BYTES) {
      await reader.cancel();
      throw new Error('account_state_unavailable');
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
  return text && text !== 'null' ? JSON.parse(text) as unknown : null;
};
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const activeTeacherProfile = (value: unknown): boolean => {
  const profile = record(value);
  return profile !== null
    && (profile.role === 'teacher' || profile.role === 'super_admin')
    && profile.disabled !== true
    && profile.forceReauth !== true
    && !['blocked', 'inactive', 'suspended'].includes(String(profile.status ?? ''));
};

const unavailable = (
  request?: Request,
  env?: ReconciliationWorkerEnv,
  diagnosticCode?: string,
): Response => {
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (diagnosticCode
    && env?.BOOK_SOURCE_RECONCILIATION_DIAGNOSTICS?.trim() === 'enabled'
    && request?.headers.get('origin') === env.BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN) {
    headers['x-book-source-diagnostic-code'] = diagnosticCode;
  }
  return Response.json(
    { code: 'book_source_reconciliation_unavailable' },
    { status: 503, headers },
  );
};

const failureCode = (error: unknown): string => {
  const value = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'code' in error
      ? (error as { readonly code?: unknown }).code
      : undefined;
  return typeof value === 'string' && /^[a-z0-9_]{1,80}$/u.test(value)
    ? value
    : 'internal';
};

interface ReconciliationRuntime {
  readonly readAccountState: () => Promise<BookSourceUploadAccountState | null>;
  readonly reconciler: ReturnType<typeof createSourceUploadReconciler>;
}

type ReconciliationRuntimeFactory = (
  env: ReconciliationWorkerEnv,
) => Promise<ReconciliationRuntime> | ReconciliationRuntime;

const scheduledCandidate = (
  state: BookSourceUploadAccountState | null,
  at: Date,
): BookSourceUploadOperation | undefined => {
  if (!state) return undefined;
  return Object.values(state.operations)
    .filter((operation) => {
      if (operation.status === 'cleanup_pending') {
        return Date.parse(operation.cleanup?.nextRetryAt ?? '') <= at.getTime();
      }
      if (operation.status === 'reserved') {
        return Date.parse(operation.expiresAt) <= at.getTime();
      }
      return operation.status === 'verified_completed'
        && operation.versionReconciliation !== undefined
        && Date.parse(operation.versionReconciliation.nextRetryAt) <= at.getTime();
    })
    .sort((left, right) => left.reservationId.localeCompare(right.reservationId))[0];
};

export const createBookSourceReconciliationWorker = (
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  capacityProbe = createCapacityProbeWorker({ fetchImpl }),
  runtimeFactory?: ReconciliationRuntimeFactory,
) => {
  const createRuntime: ReconciliationRuntimeFactory = runtimeFactory ?? (async (env) => {
    const accountId = required(env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID);
    const baseUrl = databaseUrl(required(env.FIREBASE_DATABASE_URL));
    const accessTokenProvider = createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
      serviceAccountEmail: required(env.BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL),
      serviceAccountPrivateKey: required(env.BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY).replace(/\\n/gu, '\n'),
      fetchImpl,
    });
    const repository = new SourceUploadRtdbRepository(
      createTrustedFirebaseSourceUploadRtdbTransaction({
        databaseUrl: baseUrl,
        accessTokenProvider,
        fetchImpl,
      }),
      { now },
    );
    const cleanup = createBackblazeB2ExactVersionCleanupAdapterFromEnv(env, { fetch: fetchImpl });
    const readAccountState = async () => {
      const response = await fetchImpl(
        `${baseUrl}/${sourceUploadAccountPath(accountId)}.json`,
        { headers: { Authorization: `Bearer ${await accessTokenProvider.getAccessToken()}` } },
      );
      if (!response.ok) throw new Error('account_state_unavailable');
      const value = await readBoundedJson(response);
      return value === null ? null : validateBookSourceUploadAccountState(value);
    };
    const readTrustedValue = async (path: string): Promise<unknown> => {
      const response = await fetchImpl(
        `${baseUrl}/${path}.json`,
        { headers: { Authorization: `Bearer ${await accessTokenProvider.getAccessToken()}` } },
      );
      if (!response.ok) throw new Error('authority_unavailable');
      return readBoundedJson(response);
    };
    const authorizeOwner = async ({
      actorId,
      bookId,
    }: { readonly actorId: string; readonly bookId: string }): Promise<boolean> => {
      if (!SAFE_ID.test(actorId) || !SAFE_ID.test(bookId)) return false;
      const [state, book, profile] = await Promise.all([
        readAccountState(),
        readTrustedValue(`material_catalog/books/${bookId}`),
        readTrustedValue(`users/${actorId}`),
      ]);
      const ownsOperation = state !== null
        && Object.values(state.operations).some(
          (operation) => operation.bookId === bookId && operation.ownerId === actorId,
        );
      const bookRecord = record(book);
      const currentBookOwner = bookRecord !== null
        && bookRecord.bookId === bookId
        && bookRecord.ownerId === actorId
        && bookRecord.status !== 'archived';
      return ownsOperation && currentBookOwner && activeTeacherProfile(profile);
    };
    const dependencies: SourceUploadReconciliationDependencies = {
      accountId,
      readAccountState,
      authorizeOwner,
      repository,
      provider: cleanup,
      versionReconciliation: cleanup,
      resolveExactVersion: (operation, options) => cleanup.resolveExactVersion(operation, options),
      clock: now,
      leaseOwner: required(env.BOOK_SOURCE_RECONCILIATION_LEASE_OWNER),
      emit: (event) => console.info('book_source_reconciliation', event),
    };
    return {
      readAccountState,
      reconciler: createSourceUploadReconciler(dependencies),
    };
  });

  return {
  async fetch(request: Request, env: ReconciliationWorkerEnv): Promise<Response> {
    if (new URL(request.url).pathname === CAPACITY_RECONCILIATION_PATH) {
      return capacityProbe.fetch(request, env);
    }
    if (env.BOOK_SOURCE_RECONCILIATION_STATE?.trim() !== 'enabled') return unavailable();
    try {
      const { reconciler } = await createRuntime(env);
      const actionsEnabled = env.BOOK_SOURCE_RECONCILIATION_ACTION_STATE?.trim() === 'enabled';
      return createBookSourceControlHost({
        service: {
          begin: async () => { throw { code: 'rollout_denied' }; },
          complete: async () => { throw { code: 'invalid_deployment' }; },
          status: reconciler.status,
          requestCleanup: actionsEnabled
            ? reconciler.requestCleanup
            : async () => { throw { code: 'rollout_denied' }; },
          reconcile: actionsEnabled
            ? reconciler.reconcile
            : async () => { throw { code: 'rollout_denied' }; },
        },
      }).fetch(request, env);
    } catch (error) {
      console.error('book_source_reconciliation_unavailable', {
        code: failureCode(error),
      });
      return unavailable(request, env, failureCode(error));
    }
  },
  async scheduled(
    _controller: ScheduledController,
    env: ReconciliationWorkerEnv,
    _context: ExecutionContext,
  ): Promise<void> {
    if (env.BOOK_SOURCE_RECONCILIATION_STATE?.trim() !== 'enabled'
      || env.BOOK_SOURCE_RECONCILIATION_ACTION_STATE?.trim() !== 'enabled'
      || env.BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE?.trim() !== 'enabled') {
      return;
    }
    try {
      const runtime = await createRuntime(env);
      const at = now();
      const candidate = scheduledCandidate(await runtime.readAccountState(), at);
      if (!candidate) return;
      await runtime.reconciler.reconcile({
        actorId: candidate.ownerId,
        bookId: candidate.bookId,
        reservationId: candidate.reservationId,
      });
    } catch (error) {
      console.error('book_source_reconciliation_scheduled_failure', {
        code: failureCode(error),
      });
    }
  },
  };
};

export default createBookSourceReconciliationWorker();
