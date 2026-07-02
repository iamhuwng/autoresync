import { getAuth } from 'firebase/auth';
import {
  resolveR2UploadEndpoint,
  type R2UploadEndpointEnv,
} from '../../../../services/r2UploadClient';

export interface ListeningUploadSessionResponse {
  uploadSessionId: string;
  ownerId: string;
  status: 'active';
  createdAt: number;
  expiresAt: number;
  maxEligibilityExpiresAt: number;
}

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
  status: 'abandoned' | 'cleanup-queued' | 'expired';
  uploadSessionId: string;
  deletedCount: number;
  preservedCount: number;
  skippedCount: number;
}

export interface ListeningUploadSessionApi {
  createSession(input: {
    idempotencyKey: string;
    draftId?: string;
    testId?: string;
    revisionId?: string;
  }): Promise<ListeningUploadSessionResponse>;
  issueAsset(input: {
    idempotencyKey: string;
    uploadSessionId: string;
    fileName: string;
    declaredMimeType: string;
    sizeBytes: number;
  }): Promise<ListeningUploadAssetResponse>;
  probeAsset(input: {
    uploadSessionId: string;
    assetId: string;
  }): Promise<ListeningUploadAssetProbeResponse>;
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
  ): Promise<T> {
    const endpoint = resolveListeningUploadSessionEndpoint();
    const user = getAuth().currentUser;
    if (!endpoint || !user) throw new Error('Listening upload session service unavailable');
    const token = await user.getIdToken();
    const response = await globalThis.fetch(`${endpoint}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Listening upload session request failed');
    return response.json() as Promise<T>;
  }

  createSession(input: {
    idempotencyKey: string;
    draftId?: string;
    testId?: string;
    revisionId?: string;
  }): Promise<ListeningUploadSessionResponse> {
    const { idempotencyKey, ...body } = input;
    return this.post('createListeningUploadSession', body, idempotencyKey);
  }

  issueAsset(input: {
    idempotencyKey: string;
    uploadSessionId: string;
    fileName: string;
    declaredMimeType: string;
    sizeBytes: number;
  }): Promise<ListeningUploadAssetResponse> {
    const { idempotencyKey, ...body } = input;
    return this.post('issueListeningUploadAsset', body, idempotencyKey);
  }

  probeAsset(input: {
    uploadSessionId: string;
    assetId: string;
  }): Promise<ListeningUploadAssetProbeResponse> {
    return this.post('probeListeningUploadAsset', input);
  }

  cancelSession(input: {
    uploadSessionId: string;
    assetId?: string;
    reason: ListeningUploadCleanupReason;
  }): Promise<ListeningUploadCancelResponse> {
    return this.post('cancelListeningUploadSession', input);
  }
}
