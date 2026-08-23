import { getAuth } from 'firebase/auth';
import {
  resolveR2UploadEndpoint,
  type R2UploadEndpointEnv,
} from '../../../../services/r2UploadClient';

export interface ListeningUploadSessionResponse {
  uploadSessionId: string;
  ownerId: string;
  status: ListeningUploadSessionStatus;
  createdAt: number;
  expiresAt: number;
  maxEligibilityExpiresAt: number;
}

/** States returned by the trusted upload-session authority. */
export type ListeningUploadSessionStatus =
  | 'active'
  | 'committing'
  | 'completed'
  | 'cleanup-queued'
  | 'abandoned'
  | 'expired';

export interface ListeningUploadAssetResponse {
  assetId: string;
  uploadSessionId: string;
  tempKey: string;
  assetGrant: string;
  assetGrantExpiresAt: number;
}

export interface ListeningUploadAssetProbeResponse {
  status: 'ready';
  assetId: string;
  uploadSessionId: string;
  contentType: string;
  sizeBytes: number;
  range: {
    requestRange: 'bytes=0-0';
    status: 206;
    acceptRanges: 'bytes';
    contentLength: number;
    contentRange: string;
  };
}

export type ListeningUploadCleanupReason =
  | 'builder-cancel'
  | 'discard-draft'
  | 'section-removed'
  | 'replacement-cancelled'
  | 'upload-aborted'
  | 'navigation-away';

export interface ListeningUploadCancelResponse {
  status: 'cleanup-queued' | 'abandoned' | 'expired';
  uploadSessionId: string;
  deletedCount: number;
  preservedCount: number;
  skippedCount: number;
}

export interface ListeningUploadRequestOptions {
  signal?: AbortSignal;
}

const createAbortError = (): Error => {
  if (typeof DOMException !== 'undefined') return new DOMException('The request was aborted', 'AbortError');
  const error = new Error('The request was aborted');
  error.name = 'AbortError';
  return error;
};

export interface ListeningUploadSessionApi {
  createSession(input: {
    idempotencyKey: string;
    draftId?: string;
    testId?: string;
    revisionId?: string;
  }, options?: ListeningUploadRequestOptions): Promise<ListeningUploadSessionResponse>;
  issueAsset(input: {
    idempotencyKey: string;
    uploadSessionId: string;
    fileName: string;
    declaredMimeType: string;
    sizeBytes: number;
  }, options?: ListeningUploadRequestOptions): Promise<ListeningUploadAssetResponse>;
  probeAsset(input: {
    uploadSessionId: string;
    assetId: string;
  }, options?: ListeningUploadRequestOptions): Promise<ListeningUploadAssetProbeResponse>;
  cancelSession(input: {
    uploadSessionId: string;
    assetId?: string;
    reason: ListeningUploadCleanupReason;
  }): Promise<ListeningUploadCancelResponse>;
}

type ListeningUploadSessionEnv = R2UploadEndpointEnv & {
  VITE_LISTENING_UPLOAD_SESSION_WORKER_URL?: string;
};

export const resolveListeningUploadSessionEndpoint = (
  env: ListeningUploadSessionEnv = import.meta.env,
  hostname?: string,
): string =>
  (
    env.VITE_LISTENING_UPLOAD_SESSION_WORKER_URL?.trim()
    || resolveR2UploadEndpoint(env, hostname)
  ).replace(/\/+$/, '');

export class WorkerListeningUploadSessionApi implements ListeningUploadSessionApi {
  private async post<T>(
    path: string,
    body: Record<string, unknown>,
    idempotencyKey?: string,
    options?: ListeningUploadRequestOptions,
  ): Promise<T> {
    const endpoint = resolveListeningUploadSessionEndpoint();
    if (options?.signal?.aborted) {
      throw createAbortError();
    }
    const user = getAuth().currentUser;
    if (!endpoint || !user) throw new Error('Listening upload session service unavailable');
    const token = await user.getIdToken();
    let response: Response;
    try {
      response = await globalThis.fetch(`${endpoint}/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
    } catch (error) {
      if (options?.signal?.aborted) {
        throw createAbortError();
      }
      throw error;
    }
    if (!response.ok) {
      const error = new Error('Listening upload session request failed') as Error & {
        status?: number;
        retryable?: boolean;
      };
      error.status = response.status;
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw error;
    }
    return response.json() as Promise<T>;
  }

  createSession(input: {
    idempotencyKey: string;
    draftId?: string;
    testId?: string;
    revisionId?: string;
  }, options?: ListeningUploadRequestOptions): Promise<ListeningUploadSessionResponse> {
    const { idempotencyKey, ...body } = input;
    return this.post('createListeningUploadSession', body, idempotencyKey, options);
  }

  issueAsset(input: {
    idempotencyKey: string;
    uploadSessionId: string;
    fileName: string;
    declaredMimeType: string;
    sizeBytes: number;
  }, options?: ListeningUploadRequestOptions): Promise<ListeningUploadAssetResponse> {
    const { idempotencyKey, ...body } = input;
    return this.post('issueListeningUploadAsset', body, idempotencyKey, options);
  }

  probeAsset(input: {
    uploadSessionId: string;
    assetId: string;
  }, options?: ListeningUploadRequestOptions): Promise<ListeningUploadAssetProbeResponse> {
    return this.post('probeListeningUploadAsset', input, undefined, options);
  }

  cancelSession(input: {
    uploadSessionId: string;
    assetId?: string;
    reason: ListeningUploadCleanupReason;
  }): Promise<ListeningUploadCancelResponse> {
    return this.post('cancelListeningUploadSession', input);
  }
}
