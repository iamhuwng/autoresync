import { getAuth } from 'firebase/auth';

import { DEFAULT_R2_UPLOAD_WORKER_URL, trimWorkerEndpoint } from '../../../../services/r2WorkerEndpoint';
import type { ListeningDeliveryIssuedUrl } from '../storage/listeningAssetDelivery.service';
import type {
  ListeningResultReviewAudioDeliveryIssuer,
} from './listeningResultReviewAudioResolver';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ListeningResultReviewDeliveryEndpointEnv {
  readonly VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export interface ListeningResultReviewDeliveryClientDependencies {
  readonly endpoint?: string;
  readonly getIdToken?: () => Promise<string | null | undefined>;
  readonly fetchImpl?: FetchLike;
}

const defaultEnv = (): ListeningResultReviewDeliveryEndpointEnv =>
  (import.meta.env ?? {}) as ListeningResultReviewDeliveryEndpointEnv;

const trimTrailingSlashes = trimWorkerEndpoint;

export function resolveListeningResultReviewDeliveryEndpoint(
  env: ListeningResultReviewDeliveryEndpointEnv = defaultEnv(),
): string {
  const explicit = (
    env.VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL?.trim()
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

export function createListeningResultReviewDeliveryIssuer(
  dependencies: ListeningResultReviewDeliveryClientDependencies = {},
): ListeningResultReviewAudioDeliveryIssuer {
  return {
    async issue(input) {
      const endpoint = trimTrailingSlashes(
        dependencies.endpoint?.trim() || resolveListeningResultReviewDeliveryEndpoint(),
      );
      if (!endpoint) {
        throw new Error('listening_result_review_delivery_endpoint_missing');
      }
      if (!input.resultScope?.resultId || !input.resultScope.versionId) {
        throw new Error('listening_result_review_scope_required');
      }

      const token = await (dependencies.getIdToken ?? defaultGetIdToken)();
      if (!token) {
        throw new Error('listening_result_review_delivery_auth_required');
      }

      const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch?.bind(globalThis);
      if (!fetchImpl) {
        throw new Error('listening_result_review_delivery_fetch_unavailable');
      }

      const response = await fetchImpl(`${endpoint}/listening-delivery/result-review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetId: input.assetId,
          resultId: input.resultScope.resultId,
          versionId: input.resultScope.versionId,
        }),
      });
      const responseBody = await readJsonBody(response);

      if (response.ok) {
        return responseBody as ListeningDeliveryIssuedUrl;
      }

      throw new Error(readErrorMessage(
        responseBody,
        `Listening result review delivery failed with HTTP ${response.status}.`,
      ));
    },
  };
}
