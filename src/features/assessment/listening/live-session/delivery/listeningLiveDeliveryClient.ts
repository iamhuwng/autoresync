import { getAuth } from 'firebase/auth';

import { resolveR2UploadEndpoint } from '../../../../../services/r2UploadClient';
import { trimWorkerEndpoint } from '../../../../../services/r2WorkerEndpoint';
import type { ListeningDeliveryIssuedUrl } from '../../storage/listeningAssetDelivery.service';
import type { ListeningLiveDeliveryIssuer } from './listeningLiveDeliveryAdapter';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ListeningLiveDeliveryEndpointEnv {
  readonly DEV?: boolean;
  readonly VITE_LISTENING_LIVE_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface ListeningLiveDeliveryClientDependencies {
  readonly endpoint?: string;
  readonly getIdToken?: () => Promise<string | null | undefined>;
  readonly fetchImpl?: FetchLike;
}

const defaultEnv = (): ListeningLiveDeliveryEndpointEnv =>
  (import.meta.env ?? {}) as ListeningLiveDeliveryEndpointEnv;

const trimTrailingSlashes = trimWorkerEndpoint;

export function resolveListeningLiveDeliveryEndpoint(
  env: ListeningLiveDeliveryEndpointEnv = defaultEnv(),
): string {
  const explicitLive = env.VITE_LISTENING_LIVE_DELIVERY_WORKER_URL?.trim();
  if (explicitLive) return trimTrailingSlashes(explicitLive);
  return trimTrailingSlashes(resolveR2UploadEndpoint(env));
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

export function createListeningLiveDeliveryIssuer(
  dependencies: ListeningLiveDeliveryClientDependencies = {},
): ListeningLiveDeliveryIssuer {
  const postDelivery = async (
    input: Parameters<ListeningLiveDeliveryIssuer['issue']>[0],
    previous?: ListeningDeliveryIssuedUrl,
  ): Promise<ListeningDeliveryIssuedUrl> => {
    const endpoint = trimTrailingSlashes(
      dependencies.endpoint?.trim() || resolveListeningLiveDeliveryEndpoint(),
    );
    if (!endpoint) {
      throw new Error('listening_live_delivery_endpoint_missing');
    }
    if (!input.liveScope?.sessionCode || !input.liveScope.testId || !input.liveScope.versionId) {
      throw new Error('listening_live_delivery_scope_required');
    }

    const token = await (dependencies.getIdToken ?? defaultGetIdToken)();
    if (!token) {
      throw new Error('listening_live_delivery_auth_required');
    }

    const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) {
      throw new Error('listening_live_delivery_fetch_unavailable');
    }

    const response = await fetchImpl(`${endpoint}/listening-delivery/live`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stripUndefined({
        assetId: input.assetId,
        sessionCode: input.liveScope.sessionCode,
        testId: input.liveScope.testId,
        versionId: input.liveScope.versionId,
        classId: input.liveScope.classId,
        sectionNumber: input.liveScope.sectionNumber,
        previous,
      })),
    });
    const responseBody = await readJsonBody(response);

    if (response.ok) {
      return responseBody as ListeningDeliveryIssuedUrl;
    }

    throw new Error(readErrorMessage(
      responseBody,
      `Listening live delivery failed with HTTP ${response.status}.`,
    ));
  };

  return {
    async issue(input) {
      return postDelivery(input);
    },
    async refresh(input) {
      return postDelivery(input, input.previous);
    },
  };
}
