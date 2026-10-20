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
  normalizeTrustedSourceUploadDatabaseUrl,
} from '../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import {
  SourceUploadRtdbRepository,
  sourceUploadAccountPath,
  validateBookSourceUploadAccountState,
} from '../../../src/services/book-source-delivery/sourceUpload.rtdbRepository.ts';
import {
  createBookSourceControlHost,
  type BookSourceControlHostOptions,
} from './control-host';
import {
  createBackblazeB2ExactVersionCleanupAdapterFromEnv,
  type BackblazeB2ExactVersionCleanupEnv,
} from './backblaze-b2-exact-version-cleanup-adapter';
import {
  CAPACITY_PROBE_FAILURE_HEADER,
  createCapacityProbeWorker,
} from './capacity-probe-worker';
import { isActiveBookSourceAuthorityProfile } from '../upload-worker/book-source/trusted-source-contract.ts';
import { authorizesCanceledSubmissionRetirement, fenceCanceledSubmissionBook, findCanceledSubmissionSource } from '../upload-worker/book-source/canceled-submission-retirement.ts';
import { FirebaseRtdbRestClient } from '../upload-worker/listening-authoring/rtdb.ts';

const MAX_ACCOUNT_STATE_BYTES = 32 * 1024 * 1024;
const MAX_SCHEDULED_CAPACITY_WORK_UNITS = 4;
const CAPACITY_RECONCILIATION_PATH = '/internal/book-source-capacity/reconciliation-page';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

interface ReconciliationWorkerEnv extends BackblazeB2ExactVersionCleanupEnv, Record<string, unknown> {
  readonly BOOK_SOURCE_RECONCILIATION_STATE?: string;
  readonly BOOK_SOURCE_RECONCILIATION_ACTION_STATE?: string;
  readonly BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE?: string;
  readonly BOOK_SOURCE_RECONCILIATION_DIAGNOSTICS?: string;
  readonly BOOK_SOURCE_CAPACITY_PROBE_STATE?: string;
  readonly BOOK_SOURCE_CAPACITY_PROBE_TOKEN?: string;
  readonly BOOK_SOURCE_UPLOAD_ACCOUNT_ID: string;
  readonly BOOK_SOURCE_RECONCILIATION_LEASE_OWNER: string;
  readonly BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL: string;
  readonly BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  readonly FIREBASE_DATABASE_URL: string;
  readonly FIREBASE_PROJECT_ID: string;
  readonly BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN?: string;
  readonly LOCAL_EMULATOR_AUTH?: string;
}

const required = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('invalid_deployment');
  return value.trim();
};

const localEmulator = (env: ReconciliationWorkerEnv): boolean => {
  const enabled = env.LOCAL_EMULATOR_AUTH === 'true';
  if (enabled && env.FIREBASE_PROJECT_ID !== 'demo-luyentap-local') {
    throw new Error('invalid_deployment');
  }
  return enabled;
};

const databaseUrl = (value: string, isLocal: boolean): string =>
  normalizeTrustedSourceUploadDatabaseUrl(value, isLocal);

const databasePathUrl = (baseUrl: string, path: string): string => {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/u, '')}/${path}.json`;
  return url.href;
};

const accessTokenProvider = (
  env: ReconciliationWorkerEnv,
  fetchImpl: typeof fetch,
  isLocal: boolean,
) => isLocal
  ? { getAccessToken: async () => 'owner' }
  : createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
      serviceAccountEmail: required(env.BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL),
      serviceAccountPrivateKey: required(env.BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY).replace(/\\n/gu, '\n'),
      fetchImpl,
    });

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
  readonly findCanceledSubmission?: (state: BookSourceUploadAccountState, at: Date) => Promise<BookSourceUploadOperation | undefined>;
  readonly reconciler: ReturnType<typeof createSourceUploadReconciler>;
  readonly repository: Pick<
    SourceUploadRtdbRepository,
    | 'recordProviderReconciliationContinuation'
    | 'clearProviderReconciliationContinuation'
    | 'invalidateProviderReconciliation'
  >;
}

interface CapacityRuntime {
  readonly readAccountState: () => Promise<BookSourceUploadAccountState | null>;
  readonly repository: Pick<
    SourceUploadRtdbRepository,
    | 'recordProviderReconciliationContinuation'
    | 'clearProviderReconciliationContinuation'
    | 'invalidateProviderReconciliation'
  >;
}

type ReconciliationRuntimeFactory = (
  env: ReconciliationWorkerEnv,
) => Promise<ReconciliationRuntime> | ReconciliationRuntime;
type CapacityRuntimeFactory = (
  env: ReconciliationWorkerEnv,
) => Promise<CapacityRuntime> | CapacityRuntime;

const scheduledCandidate = (
  state: BookSourceUploadAccountState | null,
  at: Date,
): BookSourceUploadOperation | undefined => {
  if (!state) return undefined;
  return Object.values(state.operations)
    .filter((operation) => {
      if (operation.status === 'cleanup_pending' || (operation.status === 'retirement_pending'
        && operation.retirementGuard && 'kind' in operation.retirementGuard
        && operation.retirementGuard.kind === 'canceled-submission')
        || ((operation.status === 'released' || operation.status === 'retired') && operation.cleanup !== undefined)) {
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

const readCapacityProbeResult = async (
  response: Response,
): Promise<
  | { readonly state: 'continue'; readonly continuationToken: string }
  | { readonly state: 'complete'; readonly status: 'healthy' | 'drift' }
> => {
  if (!response.ok) throw new Error(`capacity_probe_${response.status}`);
  const value = record(await response.json());
  if (value?.state === 'continue'
    && typeof value.continuationToken === 'string'
    && /^[A-Za-z0-9_-]{1,65536}$/u.test(value.continuationToken)
    && Object.keys(value).length === 2) {
    return { state: 'continue', continuationToken: value.continuationToken };
  }
  if (value?.state === 'complete'
    && (value.status === 'healthy' || value.status === 'drift')
    && Object.keys(value).length === 2) {
    return { state: 'complete', status: value.status };
  }
  throw new Error('capacity_probe_invalid_response');
};

export const createBookSourceReconciliationWorker = (
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  capacityProbe = createCapacityProbeWorker({ fetchImpl }),
  runtimeFactory?: ReconciliationRuntimeFactory,
  capacityRuntimeFactory?: CapacityRuntimeFactory,
  firebaseVerifier?: BookSourceControlHostOptions['verifier'],
) => {
  const createRuntime: ReconciliationRuntimeFactory = runtimeFactory ?? (async (env) => {
    const accountId = required(env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID);
    const isLocal = localEmulator(env);
    const baseUrl = databaseUrl(required(env.FIREBASE_DATABASE_URL), isLocal);
    const tokenProvider = accessTokenProvider(env, fetchImpl, isLocal);
    const repository = new SourceUploadRtdbRepository(
      createTrustedFirebaseSourceUploadRtdbTransaction({
        databaseUrl: baseUrl,
        localEmulator: isLocal,
        accessTokenProvider: tokenProvider,
        fetchImpl,
      }),
      { now },
    );
    const cleanup = createBackblazeB2ExactVersionCleanupAdapterFromEnv(env, { fetch: fetchImpl });
    const readAccountState = async () => {
      const response = await fetchImpl(
        databasePathUrl(baseUrl, sourceUploadAccountPath(accountId)),
        { headers: { Authorization: `Bearer ${await tokenProvider.getAccessToken()}` } },
      );
      if (!response.ok) throw new Error('account_state_unavailable');
      const value = await readBoundedJson(response);
      return value === null ? null : validateBookSourceUploadAccountState(value);
    };
    const readTrustedValue = async (path: string): Promise<unknown> => {
      const response = await fetchImpl(
        databasePathUrl(baseUrl, path),
        { headers: { Authorization: `Bearer ${await tokenProvider.getAccessToken()}` } },
      );
      if (!response.ok) throw new Error('authority_unavailable');
      return readBoundedJson(response);
    };
    const retirementAuthority = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: baseUrl }, fetchImpl, getAccessToken: () => tokenProvider.getAccessToken(),
    });
    const authorizeOwner = async ({
      actorId,
      bookId,
      reservationId,
      operation,
    }: { readonly actorId: string; readonly bookId: string; readonly reservationId: string; readonly operation: BookSourceUploadOperation }): Promise<boolean> => {
      if (!SAFE_ID.test(actorId) || !SAFE_ID.test(bookId) || !SAFE_ID.test(reservationId)
        || operation.ownerId !== actorId || operation.bookId !== bookId
        || operation.reservationId !== reservationId) return false;
      const [book, profile, submission] = await Promise.all([
        readTrustedValue(`material_catalog/books/${bookId}`),
        readTrustedValue(`users/${actorId}`),
        operation.submissionOperationId === undefined
          ? Promise.resolve(null)
          : SAFE_ID.test(operation.submissionOperationId)
            ? readTrustedValue(`book_submission_operations/${actorId}/operations/${operation.submissionOperationId}`)
            : Promise.resolve(undefined),
      ]);
      const submissionRecord = record(submission);
      const canceledSubmission = operation.submissionOperationId !== undefined
        && submissionRecord?.operationId === operation.submissionOperationId
        && submissionRecord.ownerId === actorId
        && submissionRecord.finalBookId === bookId
        && typeof submissionRecord.fingerprint === 'string'
        && /^[a-f0-9]{64}$/iu.test(submissionRecord.fingerprint)
        && submissionRecord.state === 'canceled';
      const bookRecord = record(book);
      const currentBookOwner = bookRecord !== null
        && bookRecord.bookId === bookId
        && bookRecord.ownerId === actorId
        && bookRecord.status !== 'archived';
      if (!isActiveBookSourceAuthorityProfile(profile, 'teacher')) return false;
      if (operation.submissionOperationId === undefined) return currentBookOwner;
      if (canceledSubmission && book === null) {
        return operation.status !== 'retirement_pending' && operation.status !== 'retired'
          || authorizesCanceledSubmissionRetirement(readTrustedValue, operation);
      }
      // A committed submission can reconcile duplicate versions only while preserving its verified source.
      return currentBookOwner && operation.status === 'verified_completed'
        && submissionRecord?.state === 'committed'
        && submissionRecord.operationId === operation.submissionOperationId
        && submissionRecord.ownerId === actorId && submissionRecord.finalBookId === bookId;
    };
    const dependencies: SourceUploadReconciliationDependencies = {
      accountId,
      readAccountState,
      authorizeOwner,
      repository,
      prepareCanceledRetirement: async (state, operation) => {
        if (operation.submissionOperationId === undefined) return null;
        const submission = record(await readTrustedValue(`book_submission_operations/${operation.ownerId}/operations/${operation.submissionOperationId}`));
        if (submission?.state !== 'canceled') return null;
        const retirementGuard = await fenceCanceledSubmissionBook(retirementAuthority, operation);
        return repository.fenceVerifiedSource({
          accountId, expectedRevision: state.revision, reservationId: operation.reservationId,
          bookId: operation.bookId, ownerId: operation.ownerId, sourceKey: operation.sourceKey,
          sourceVersionId: operation.sourceVersionId, verifiedStorage: operation.verifiedStorage!,
          retirementGuard, deletionId: retirementGuard.deletionId, fencedAt: now().toISOString(),
          currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
        });
      },
      provider: cleanup,
      versionReconciliation: cleanup,
      resolveExactVersion: (operation, options) => cleanup.resolveExactVersion(operation, options),
      clock: now,
      leaseOwner: required(env.BOOK_SOURCE_RECONCILIATION_LEASE_OWNER),
      emit: (event) => console.info('book_source_reconciliation', event),
    };
    return {
      readAccountState,
      findCanceledSubmission: async (state, at) => {
        const result = await findCanceledSubmissionSource(state, at, readTrustedValue);
        if (result.afterReservationId) await repository.advanceCanceledSubmissionScan({
          accountId, expectedRevision: state.revision, afterReservationId: result.afterReservationId,
        });
        return result.operation;
      },
      reconciler: createSourceUploadReconciler(dependencies),
      repository,
    };
  });
  const createCapacityRuntime: CapacityRuntimeFactory = capacityRuntimeFactory
    ?? (runtimeFactory
      ? async (env) => {
          const runtime = await runtimeFactory(env);
          return {
            readAccountState: runtime.readAccountState,
            repository: runtime.repository,
          };
        }
      : async (env) => {
          const accountId = required(env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID);
          const isLocal = localEmulator(env);
          const baseUrl = databaseUrl(required(env.FIREBASE_DATABASE_URL), isLocal);
          const tokenProvider = accessTokenProvider(env, fetchImpl, isLocal);
          const repository = new SourceUploadRtdbRepository(
            createTrustedFirebaseSourceUploadRtdbTransaction({
              databaseUrl: baseUrl,
              localEmulator: isLocal,
              accessTokenProvider: tokenProvider,
              fetchImpl,
            }),
            { now },
          );
          const readAccountState = async () => {
            const response = await fetchImpl(
              databasePathUrl(baseUrl, sourceUploadAccountPath(accountId)),
              { headers: { Authorization: `Bearer ${await tokenProvider.getAccessToken()}` } },
            );
            if (!response.ok) throw new Error('account_state_unavailable');
            const value = await readBoundedJson(response);
            return value === null ? null : validateBookSourceUploadAccountState(value);
          };
          return { readAccountState, repository };
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
        verifier: firebaseVerifier,
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
      || env.BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE?.trim() !== 'enabled') {
      return;
    }
    const at = now();

    if (env.BOOK_SOURCE_RECONCILIATION_ACTION_STATE?.trim() === 'enabled') {
      let runtime: ReconciliationRuntime | undefined;
      try {
        runtime = await createRuntime(env);
        const state = await runtime.readAccountState();
        const candidate = scheduledCandidate(state, at);
        if (candidate) {
          await runtime.reconciler.reconcile({
            actorId: candidate.ownerId,
            bookId: candidate.bookId,
            reservationId: candidate.reservationId,
          });
        }
      } catch (error) {
        console.error('book_source_reconciliation_scheduled_failure', {
          code: failureCode(error),
        });
      }
      if (runtime?.findCanceledSubmission) {
        try {
          const state = await runtime.readAccountState();
          const candidate = state ? await runtime.findCanceledSubmission(state, at) : undefined;
          if (candidate) {
            await runtime.reconciler.reconcile({
              actorId: candidate.ownerId,
              bookId: candidate.bookId,
              reservationId: candidate.reservationId,
            });
          }
        } catch (error) {
          console.error('book_source_canceled_submission_scheduled_failure', {
            code: failureCode(error),
          });
        }
      }
    }

    if (env.BOOK_SOURCE_CAPACITY_PROBE_STATE?.trim() === 'enabled') {
      try {
        const runtime = await createCapacityRuntime(env);
        const state = await runtime.readAccountState();
        if (state) {
          let continuation = state.capacity.providerReconciliationContinuation;
          for (let unit = 0; unit < MAX_SCHEDULED_CAPACITY_WORK_UNITS; unit += 1) {
            const response = await capacityProbe.fetch(
              new Request(`https://book-source-reconciliation.internal${CAPACITY_RECONCILIATION_PATH}`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${required(env.BOOK_SOURCE_CAPACITY_PROBE_TOKEN)}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(continuation === undefined
                  ? {}
                  : { continuationToken: continuation.token }),
              }),
              env,
            );
            if (response.status === 503
              && response.headers.get(CAPACITY_PROBE_FAILURE_HEADER) === 'unauthorized') {
              await runtime.repository.invalidateProviderReconciliation({
                accountId: required(env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID),
                expectedRevision: state.revision,
                ...(continuation === undefined ? {} : {
                  expectedContinuationToken: continuation.token,
                }),
              });
              console.warn('book_source_capacity_reconciliation_invalidated', {
                code: 'provider_unauthorized',
              });
              break;
            }
            if (response.status === 400 && continuation !== undefined) {
              await runtime.repository.clearProviderReconciliationContinuation({
                accountId: required(env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID),
                expectedRevision: state.revision,
                expectedContinuationToken: continuation.token,
              });
              break;
            }
            const result = await readCapacityProbeResult(response);
            if (result.state === 'complete') break;
            await runtime.repository.recordProviderReconciliationContinuation({
              accountId: required(env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID),
              expectedRevision: state.revision,
              ...(continuation === undefined ? {} : {
                expectedContinuationToken: continuation.token,
              }),
              continuation: {
                token: result.continuationToken,
                updatedAt: at.toISOString(),
              },
            });
            continuation = {
              token: result.continuationToken,
              updatedAt: at.toISOString(),
            };
          }
        }
      } catch (error) {
        console.error('book_source_capacity_scheduled_failure', {
          code: failureCode(error),
        });
      }
    }
  },
  };
};

export default createBookSourceReconciliationWorker();
