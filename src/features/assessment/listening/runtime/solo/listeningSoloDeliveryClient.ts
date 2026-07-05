// @ts-nocheck
import { getAuth } from 'firebase/auth';

import { DEFAULT_R2_UPLOAD_WORKER_URL, trimWorkerEndpoint } from '../../../../../services/r2WorkerEndpoint';
import type {
  ListeningDeliveryIssuedUrl,
  ListeningDeliveryRefreshedUrl,
} from '../../storage/listeningAssetDelivery.service';
import type { ListeningSoloDeliveryIssuer } from './listeningSoloDeliveryAdapter';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ListeningSoloDeliveryEndpointEnv {
  readonly VITE_LISTENING_SOLO_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface ListeningSoloDeliveryClientDependencies {
  readonly endpoint?: string;
  readonly getIdToken?: () => Promise<string | null | undefined>;
  readonly fetchImpl?: FetchLike;
}

const defaultEnv = (): ListeningSoloDeliveryEndpointEnv =>
  (import.meta.env ?? {}) as ListeningSoloDeliveryEndpointEnv;

const trimTrailingSlashes = trimWorkerEndpoint;

export function resolveListeningSoloDeliveryEndpoint(
  env: ListeningSoloDeliveryEndpointEnv = defaultEnv(),
): string {
  const explicit = (
    env.VITE_LISTENING_SOLO_DELIVERY_WORKER_URL?.trim()
    || env.VITE_R2_UPLOAD_WORKER_URL?.trim()
  );
  return trimTrailingSlashes(explicit || DEFAULT_R2_UPLOAD_WORKER_URL);
}

const defaultGetIdToken = async (): Promise<string | null | undefined> =>
  getAuth().currentUser?.getIdToken();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readErrorMessage = (body: unknown, fallback: string): string => {
  if (isRecord(body) && typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }
  if (isRecord(body) && typeof body.code === 'string' && body.code.trim()) {
    return body.code;
  }
  return fallback;
};

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const stripUndefined = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

export function createListeningSoloDeliveryIssuer(
  dependencies: ListeningSoloDeliveryClientDependencies = {},
): ListeningSoloDeliveryIssuer {
  const postDelivery = async (
    input: Parameters<ListeningSoloDeliveryIssuer['issue']>[0],
    previous?: ListeningDeliveryIssuedUrl,
  ): Promise<ListeningDeliveryIssuedUrl> => {
    const endpoint = trimTrailingSlashes(
      dependencies.endpoint?.trim() || resolveListeningSoloDeliveryEndpoint(),
    );
    if (!endpoint) {
      throw new Error('listening_solo_delivery_endpoint_missing');
    }
    if (!input.soloScope?.testId || !input.soloScope.versionId || !input.soloScope.mode) {
      throw new Error('listening_solo_delivery_scope_required');
    }

    const token = await (dependencies.getIdToken ?? defaultGetIdToken)();
    if (!token) {
      throw new Error('listening_solo_delivery_auth_required');
    }

    const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) {
      throw new Error('listening_solo_delivery_fetch_unavailable');
    }

    const response = await fetchImpl(`${endpoint}/listening-delivery/solo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stripUndefined({
        assetId: input.assetId,
        testId: input.soloScope.testId,
        versionId: input.soloScope.versionId,
        mode: input.soloScope.mode,
        courseId: input.soloScope.courseId,
        moduleId: input.soloScope.moduleId,
        homeworkId: input.soloScope.homeworkId,
        submissionId: input.soloScope.submissionId,
        previous,
      })),
    });
    const responseBody = await readJsonBody(response);

    if (response.ok) {
      return responseBody as ListeningDeliveryIssuedUrl;
    }

    throw new Error(readErrorMessage(
      responseBody,
      `Listening solo delivery failed with HTTP ${response.status}.`,
    ));
  };

  return {
    async issue(input) {
      return postDelivery(input);
    },
    async refresh(input) {
      return postDelivery(input, input.previous) as Promise<ListeningDeliveryRefreshedUrl>;
    },
  };
}
