import { getAuth } from 'firebase/auth';

import {
  defaultListeningAuthoringEndpointEnv,
  readListeningAuthoringEndpointDiagnostics,
  resolveListeningAuthoringEndpoint,
  trimTrailingSlashes,
} from './listeningAuthoringEndpoint';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type ObservabilitySink = (actionName: string, metadata: Record<string, unknown>) => void;

export interface ListeningAuthoringWorkflowDependencies {
  readonly endpoint?: string;
  readonly getIdToken?: () => Promise<string | null | undefined>;
  readonly fetchImpl?: FetchLike;
  readonly onObservabilityEvent?: ObservabilitySink;
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

export function createTrustedPost(dependencies: ListeningAuthoringWorkflowDependencies) {
  return async <T>(
    path: string,
    body: unknown,
    recoverableStatuses: readonly string[],
  ): Promise<T> => {
    const endpoint = trimTrailingSlashes(
      dependencies.endpoint?.trim() || resolveListeningAuthoringEndpoint(),
    );
    if (!endpoint) {
      if (defaultListeningAuthoringEndpointEnv().DEV === true) {
        console.error(
          '[listening-authoring] endpoint missing',
          readListeningAuthoringEndpointDiagnostics(),
        );
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
