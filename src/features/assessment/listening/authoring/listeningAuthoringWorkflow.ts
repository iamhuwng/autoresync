import { getAuth } from 'firebase/auth';

import type {
  ListeningAuthoringDocumentV1,
  ListeningAuthoringIssue,
  ListeningRetainedPins,
} from '../types/listeningAuthoring.types';
import { DEFAULT_R2_UPLOAD_WORKER_URL } from '../../../../services/r2WorkerEndpoint';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
type ObservabilitySink = (actionName: string, metadata: Record<string, unknown>) => void;

export interface ListeningAuthoringEndpointEnv {
  readonly DEV?: boolean;
  readonly VITE_LISTENING_AUTHORING_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface ListeningAuthoringWorkflowDependencies {
  readonly endpoint?: string;
  readonly getIdToken?: () => Promise<string | null | undefined>;
  readonly fetchImpl?: FetchLike;
  readonly onObservabilityEvent?: ObservabilitySink;
}

export interface SaveListeningDraftRequest {
  readonly idempotencyKey: string;
  readonly document: ListeningAuthoringDocumentV1;
  readonly draftId?: string;
  readonly expectedConflictToken?: number;
  readonly trigger?: 'explicit' | 'autosave';
}

export type PublishListeningDraftRequest =
  | {
      readonly draftId: string;
      readonly expectedConflictToken: number;
      readonly idempotencyKey: string;
      readonly retainedPins?: ListeningRetainedPins;
    }
  | {
      readonly legacyTestId: string;
      readonly idempotencyKey: string;
    };

export type ListeningLifecycleOperation = 'soft-delete' | 'restore' | 'archive' | 'discard';

export interface ListeningLifecycleRequest {
  readonly operation: ListeningLifecycleOperation;
  readonly targetId: string;
  readonly expectedConflictToken: number;
  readonly idempotencyKey: string;
  readonly reasonCode?: string;
}

export type SaveListeningDraftResult =
  | {
      readonly status: 'saved';
      readonly draftId: string;
      readonly conflictToken: number;
      readonly warnings: readonly (string | ListeningAuthoringIssue)[];
      readonly blockers: readonly (string | ListeningAuthoringIssue)[];
    }
  | {
      readonly status: 'conflict';
      readonly recoverable: true;
      readonly draftId: string;
      readonly expectedConflictToken?: number;
      readonly currentConflictToken: number;
    }
  | {
      readonly status: 'idempotency-conflict' | 'not-found';
      readonly recoverable: false;
      readonly draftId?: string;
      readonly operationId?: string;
    };

export type PublishListeningDraftResult =
  | {
      readonly status: 'published';
      readonly draftId: string;
      readonly versionId: string;
      readonly versionNumber: number;
      readonly conflictToken: number;
      readonly warnings: readonly (string | ListeningAuthoringIssue)[];
    }
  | {
      readonly status: 'blocked';
      readonly draftId: string;
      readonly conflictToken?: number;
      readonly blockers: readonly unknown[];
      readonly warnings: readonly (string | ListeningAuthoringIssue)[];
    }
  | {
      readonly status: 'conflict';
      readonly recoverable: true;
      readonly draftId: string;
      readonly expectedConflictToken: number;
      readonly currentConflictToken: number;
    }
  | {
      readonly status: 'idempotency-conflict' | 'not-found';
      readonly recoverable: false;
      readonly draftId?: string;
      readonly operationId?: string;
    };

export type ListeningLifecycleResult =
  | {
      readonly status: 'soft-deleted' | 'restored' | 'archived' | 'discarded';
      readonly draftId?: string;
      readonly versionId?: string;
      readonly versionNumber?: number;
      readonly conflictToken?: number;
      readonly recoverableUntil?: number;
      readonly retainedReferenceCount?: number;
    }
  | {
      readonly status: 'conflict';
      readonly recoverable: true;
      readonly draftId?: string;
      readonly versionId?: string;
      readonly expectedConflictToken?: number;
      readonly currentConflictToken: number;
    }
  | {
      readonly status:
        | 'blocked'
        | 'expired'
        | 'idempotency-conflict'
        | 'invalid-state'
        | 'not-found'
        | 'not-soft-deleted'
        | 'writes-disabled'
        | 'restore-in-progress';
      readonly recoverable?: false;
      readonly draftId?: string;
      readonly versionId?: string;
      readonly reason?: string;
      readonly retainedReferenceCount?: number;
      readonly requiredOperation?: string;
      readonly operationId?: string;
    };

const defaultEnv = (): ListeningAuthoringEndpointEnv =>
  (import.meta.env ?? {}) as ListeningAuthoringEndpointEnv;

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

const readBrowserHostname = (): string | undefined => {
  const browserGlobal = globalThis as typeof globalThis & {
    readonly location?: { readonly hostname?: unknown };
  };

  return typeof browserGlobal.location?.hostname === 'string'
    ? browserGlobal.location.hostname
    : undefined;
};

const isLocalDevHost = (hostname: string | undefined): boolean =>
  hostname === 'localhost'
  || hostname === '127.0.0.1'
  || hostname === '::1'
  || hostname === '[::1]';

const readEndpointDiagnostics = (env: ListeningAuthoringEndpointEnv = defaultEnv()) => {
  const hostname = readBrowserHostname();
  return {
    dev: env.DEV === true,
    hasAuthoringWorkerUrl: Boolean(env.VITE_LISTENING_AUTHORING_WORKER_URL?.trim()),
    hasR2UploadWorkerUrl: Boolean(env.VITE_R2_UPLOAD_WORKER_URL?.trim()),
    hostname,
    isLocalDevHost: isLocalDevHost(hostname),
  };
};

export function resolveListeningAuthoringEndpoint(
  env: ListeningAuthoringEndpointEnv = defaultEnv(),
  hostname: string | undefined = readBrowserHostname(),
): string {
  const explicit = (
    env.VITE_LISTENING_AUTHORING_WORKER_URL?.trim()
    || env.VITE_R2_UPLOAD_WORKER_URL?.trim()
  );
  if (explicit) {
    return trimTrailingSlashes(explicit);
  }

  return DEFAULT_R2_UPLOAD_WORKER_URL;
}

const defaultGetIdToken = async (): Promise<string | null | undefined> =>
  getAuth().currentUser?.getIdToken();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readErrorMessage = (body: unknown, fallback: string): string => {
  if (isRecord(body) && typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }
  return fallback;
};

const readStatus = (body: unknown): string | null =>
  isRecord(body) && typeof body.status === 'string' ? body.status : null;

const readIdempotencyHeaders = (body: unknown): Record<string, string> => {
  if (!isRecord(body) || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) {
    return {};
  }

  return { 'Idempotency-Key': body.idempotencyKey };
};

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function createTrustedPost(dependencies: ListeningAuthoringWorkflowDependencies) {
  return async <T>(
    path: string,
    body: unknown,
    recoverableStatuses: readonly string[],
  ): Promise<T> => {
    const endpoint = trimTrailingSlashes(
      dependencies.endpoint?.trim() || resolveListeningAuthoringEndpoint(),
    );
    if (!endpoint) {
      if (defaultEnv().DEV === true) {
        console.error('[listening-authoring] endpoint missing', readEndpointDiagnostics());
      }
      throw new Error('listening_authoring_endpoint_missing');
    }

    const token = await (dependencies.getIdToken ?? defaultGetIdToken)();
    if (!token) {
      throw new Error('listening_authoring_auth_required');
    }

    const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) {
      throw new Error('listening_authoring_fetch_unavailable');
    }

    const response = await fetchImpl(`${endpoint}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...readIdempotencyHeaders(body),
      },
      body: JSON.stringify(body),
    });
    const responseBody = await readJsonBody(response);

    if (response.ok) {
      return responseBody as T;
    }

    const status = readStatus(responseBody);
    if (status && recoverableStatuses.includes(status)) {
      return responseBody as T;
    }

    throw new Error(readErrorMessage(
      responseBody,
      `Listening authoring request failed with HTTP ${response.status}.`,
    ));
  };
}

export function createListeningAuthoringWorkflow(
  dependencies: ListeningAuthoringWorkflowDependencies = {},
) {
  const post = createTrustedPost(dependencies);
  const emitObservability = (
    actionName: string,
    metadata: Record<string, unknown>,
  ) => {
    dependencies.onObservabilityEvent?.(actionName, {
      source: 'listening_authoring_workflow',
      ...metadata,
    });
  };
  const recoverableSaveStatuses = ['conflict', 'idempotency-conflict', 'not-found'];
  const recoverablePublishStatuses = [
    'blocked',
    'conflict',
    'idempotency-conflict',
    'not-found',
  ];
  const recoverableLifecycleStatuses = [
    'blocked',
    'conflict',
    'expired',
    'idempotency-conflict',
    'invalid-state',
    'not-found',
    'not-soft-deleted',
  ];

  const mutateLifecycle = async (
    input: ListeningLifecycleRequest,
  ): Promise<ListeningLifecycleResult> => {
    const result = await post<ListeningLifecycleResult>(
      'listening-authoring/lifecycle',
      input,
      recoverableLifecycleStatuses,
    );

    if (input.operation === 'restore' && result.status === 'restored') {
      emitObservability('restoreListeningDraft', {
        draftId: result.draftId ?? input.targetId,
        conflictToken: result.conflictToken,
        outcome: 'restored',
      });
    }

    if (input.operation === 'archive' && result.status === 'archived') {
      emitObservability('archiveListeningPublishedVersion', {
        versionId: result.versionId ?? input.targetId,
        versionNumber: result.versionNumber,
        outcome: 'archived',
      });
    }

    return result;
  };

  return {
    async saveDraft(input: SaveListeningDraftRequest): Promise<SaveListeningDraftResult> {
      try {
        const result = await post<SaveListeningDraftResult>(
          'listening-authoring/save-draft',
          input,
          recoverableSaveStatuses,
        );

        if (input.trigger === 'autosave' && result.status !== 'saved') {
          emitObservability('listeningAutosaveFailure', {
            draftId: result.draftId ?? input.draftId,
            status: result.status,
            recoverable: 'recoverable' in result ? result.recoverable : false,
          });
        }

        return result;
      } catch (error) {
        if (input.trigger === 'autosave') {
          emitObservability('listeningAutosaveFailure', {
            draftId: input.draftId,
            status: 'error',
          });
        }
        throw error;
      }
    },

    async publishDraft(input: PublishListeningDraftRequest): Promise<PublishListeningDraftResult> {
      const result = await post<PublishListeningDraftResult>(
        'listening-authoring/publish',
        input,
        recoverablePublishStatuses,
      );

      if ('legacyTestId' in input) {
        emitObservability('listeningLegacyTransition', {
          legacyTestId: input.legacyTestId,
          status: result.status,
          draftId: result.draftId,
          versionId: result.status === 'published' ? result.versionId : undefined,
        });
      }

      if (result.status === 'published' && result.versionNumber > 1) {
        emitObservability('listeningRevisionCreated', {
          draftId: result.draftId,
          versionId: result.versionId,
          versionNumber: result.versionNumber,
        });
      }

      return result;
    },

    mutateLifecycle,

    softDeleteDraft(input: {
      readonly draftId: string;
      readonly expectedConflictToken: number;
      readonly idempotencyKey: string;
      readonly reasonCode?: string;
    }): Promise<ListeningLifecycleResult> {
      return mutateLifecycle({
        operation: 'soft-delete',
        targetId: input.draftId,
        expectedConflictToken: input.expectedConflictToken,
        idempotencyKey: input.idempotencyKey,
        reasonCode: input.reasonCode,
      });
    },

    restoreDraft(input: {
      readonly draftId: string;
      readonly expectedConflictToken: number;
      readonly idempotencyKey: string;
      readonly reasonCode?: string;
    }): Promise<ListeningLifecycleResult> {
      return mutateLifecycle({
        operation: 'restore',
        targetId: input.draftId,
        expectedConflictToken: input.expectedConflictToken,
        idempotencyKey: input.idempotencyKey,
        reasonCode: input.reasonCode,
      });
    },

    archivePublishedVersion(input: {
      readonly versionId: string;
      readonly expectedConflictToken: number;
      readonly idempotencyKey: string;
      readonly reasonCode?: string;
    }): Promise<ListeningLifecycleResult> {
      return mutateLifecycle({
        operation: 'archive',
        targetId: input.versionId,
        expectedConflictToken: input.expectedConflictToken,
        idempotencyKey: input.idempotencyKey,
        reasonCode: input.reasonCode,
      });
    },

    discardDraft(input: {
      readonly draftId: string;
      readonly expectedConflictToken: number;
      readonly idempotencyKey: string;
      readonly reasonCode?: string;
    }): Promise<ListeningLifecycleResult> {
      return mutateLifecycle({
        operation: 'discard',
        targetId: input.draftId,
        expectedConflictToken: input.expectedConflictToken,
        idempotencyKey: input.idempotencyKey,
        reasonCode: input.reasonCode,
      });
    },
  };
}
