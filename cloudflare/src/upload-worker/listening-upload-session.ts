import {
  buildListeningUploadSessionCorsHeaders,
  createListeningTempKey,
  createListeningUploadAssetGrant,
  createOpaqueId,
  hashIdempotencyKey,
  ListeningUploadSessionInputError,
  parseCreateSessionRequest,
  parseIssueAssetRequest,
  parseProbeAssetRequest,
} from './listening-upload-session-contract.ts';
import { FirebaseRestListeningUploadSessionRepository } from './listening-upload-session-repository.ts';
import type {
  ListeningUploadAssetRecord,
  ListeningUploadSessionRecord,
  ListeningUploadSessionRepository,
} from './listening-upload-session-types.ts';

export {
  buildListeningUploadSessionCorsHeaders,
  createOpaqueId,
  hashIdempotencyKey,
} from './listening-upload-session-contract.ts';

const SESSION_ELIGIBILITY_MS = 8 * 60 * 60 * 1000;
const GRANT_TTL_MS = 10 * 60 * 1000;
const BRIDGE_VERSION = '0056A-v1' as const;
const LOCAL_UPLOAD_TRANSPORT_ORIGIN = 'http://localhost:8787' as const;
const LOCAL_APP_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
]);

const resolveLocalUploadTransportOrigin = (
  request: Request,
  env: Record<string, unknown>,
): typeof LOCAL_UPLOAD_TRANSPORT_ORIGIN | undefined =>
  env.LISTENING_UPLOAD_SESSION_DEV_TRANSPORT_ENABLED === 'true'
  && LOCAL_APP_ORIGINS.has(request.headers.get('Origin') ?? '')
    ? LOCAL_UPLOAD_TRANSPORT_ORIGIN
    : undefined;

export class ListeningUploadSessionError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 400) {
    super(code);
    this.name = 'ListeningUploadSessionError';
  }
}

const asError = (error: unknown): ListeningUploadSessionError => {
  if (error instanceof ListeningUploadSessionError) return error;
  if (error instanceof ListeningUploadSessionInputError) {
    return new ListeningUploadSessionError(
      error.code,
      error.code === 'upload_too_large' ? 413 : 400,
    );
  }
  if (error instanceof Error) {
    if (
      error.message === 'missing_google_sa_key'
      || error.message === 'invalid_google_sa_key'
      || error.message.startsWith('google_oauth_failed:')
    ) {
      return new ListeningUploadSessionError('bridge_google_oauth_failed', 500);
    }
    if (
      error.message === 'missing_firebase_db_url'
      || error.message.startsWith('firebase_rtdb_get_failed:')
      || error.message.startsWith('firebase_rtdb_put_failed:')
      || error.message.startsWith('missing_firebase_etag:')
      || error.message === 'bootstrap_write_failed'
    ) {
      return new ListeningUploadSessionError('bridge_firebase_rtdb_failed', 500);
    }
    const safeName = error.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'error';
    return new ListeningUploadSessionError(`bridge_unexpected_${safeName}`, 500);
  }
  return new ListeningUploadSessionError('bridge_unexpected_non_error', 500);
};

const requireSecret = (value: string | undefined, code: string): string => {
  if (!value || value.length < 16) {
    throw new ListeningUploadSessionError(code, 500);
  }
  return value;
};

const sessionResponse = (record: ListeningUploadSessionRecord) => ({
  uploadSessionId: record.uploadSessionId,
  ownerId: record.ownerId,
  status: record.status,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  maxEligibilityExpiresAt: record.maxEligibilityExpiresAt,
});

const bodyLength = async (value: unknown): Promise<number> => {
  if (typeof value === 'string') return value.length;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (value instanceof Uint8Array) return value.byteLength;
  if (value && typeof value === 'object' && 'arrayBuffer' in value && typeof value.arrayBuffer === 'function') {
    return (await (value.arrayBuffer as () => Promise<ArrayBuffer>)()).byteLength;
  }
  if (value && typeof value === 'object' && 'body' in value && value.body) {
    return (await new Response(value.body as BodyInit).arrayBuffer()).byteLength;
  }
  return 0;
};

const probeUploadedAssetRange = async (
  env: Record<string, unknown>,
  asset: ListeningUploadAssetRecord,
) => {
  const bucket = env.R2_BUCKET as {
    get?: (key: string, options?: unknown) => Promise<unknown>;
  } | undefined;
  if (!bucket?.get) {
    throw new ListeningUploadSessionError('asset_probe_unavailable', 500);
  }
  const object = await bucket.get(asset.tempKey, {
    range: { offset: 0, length: 1 },
  });
  if (!object || typeof object !== 'object') {
    throw new ListeningUploadSessionError('asset_not_uploaded', 404);
  }
  const objectRecord = object as { size?: unknown };
  const observedSize = Number(objectRecord.size);
  const totalSize = Number.isSafeInteger(observedSize) && observedSize > 0
    ? observedSize
    : asset.sizeBytes;
  const length = await bodyLength(object);
  if (totalSize !== asset.sizeBytes || length !== 1) {
    throw new ListeningUploadSessionError('asset_range_probe_failed', 409);
  }
  return {
    requestRange: 'bytes=0-0',
    status: 206,
    acceptRanges: 'bytes' as const,
    contentLength: 1,
    contentRange: `bytes 0-0/${asset.sizeBytes}`,
  };
};

export const createListeningUploadSessionService = (dependencies: {
  repository: ListeningUploadSessionRepository;
  idempotencySecret: string;
  grantSecret: string;
  now?: () => number;
  createOpaqueId?: () => string;
}) => {
  const now = dependencies.now ?? (() => Date.now());
  const issueOpaqueId = dependencies.createOpaqueId ?? createOpaqueId;
  const idempotencySecret = requireSecret(dependencies.idempotencySecret, 'idempotency_secret_unavailable');
  const grantSecret = requireSecret(dependencies.grantSecret, 'grant_secret_unavailable');

  return {
    async createSession(input: { uid: string; idempotencyKey: unknown; body: unknown }) {
      const request = parseCreateSessionRequest(input.body, input.idempotencyKey);
      let creationRequestIdHash: string;
      try {
        creationRequestIdHash = await hashIdempotencyKey(idempotencySecret, request.idempotencyKey);
      } catch {
        throw new ListeningUploadSessionError('bridge_hmac_failed', 500);
      }
      let existing: ListeningUploadSessionRecord | null;
      try {
        existing = await dependencies.repository.findByCreationRequest(input.uid, creationRequestIdHash);
      } catch (error) {
        const safeError = asError(error);
        if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
        throw new ListeningUploadSessionError('bridge_repository_find_failed', 500);
      }
      if (existing) return sessionResponse(existing);

      const createdAt = now();
      let uploadSessionId: string;
      try {
        uploadSessionId = issueOpaqueId();
      } catch {
        throw new ListeningUploadSessionError('bridge_id_failed', 500);
      }
      const record: ListeningUploadSessionRecord = {
        schemaVersion: 1,
        ownerId: input.uid,
        uploadSessionId,
        purpose: 'listening-authoring',
        status: 'active',
        creationRequestIdHash,
        ...(request.draftId ? { draftId: request.draftId } : {}),
        ...(request.testId ? { testId: request.testId } : {}),
        ...(request.revisionId ? { revisionId: request.revisionId } : {}),
        createdAt,
        createdBy: input.uid,
        expiresAt: createdAt + SESSION_ELIGIBILITY_MS,
        maxEligibilityExpiresAt: createdAt + SESSION_ELIGIBILITY_MS,
        assetIds: {},
        assetRequests: {},
        bridgeVersion: BRIDGE_VERSION,
      };
      try {
        return sessionResponse(await dependencies.repository.create(record));
      } catch (error) {
        const safeError = asError(error);
        if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
        throw new ListeningUploadSessionError('bridge_repository_create_failed', 500);
      }
    },

    async issueAsset(input: {
      uid: string;
      idempotencyKey: unknown;
      body: unknown;
      uploadTransportOrigin?: typeof LOCAL_UPLOAD_TRANSPORT_ORIGIN;
    }) {
      const request = parseIssueAssetRequest(input.body, input.idempotencyKey);
      let session: ListeningUploadSessionRecord | null;
      try {
        session = await dependencies.repository.get(input.uid, request.uploadSessionId);
      } catch (error) {
        const safeError = asError(error);
        if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
        throw new ListeningUploadSessionError('bridge_repository_get_failed', 500);
      }
      if (!session || session.ownerId !== input.uid || session.status !== 'active') {
        throw new ListeningUploadSessionError('upload_session_not_found', 404);
      }

      const issuedAt = now();
      if (session.expiresAt <= issuedAt || session.maxEligibilityExpiresAt <= issuedAt) {
        throw new ListeningUploadSessionError('upload_session_expired', 403);
      }

      let assetRequestIdHash: string;
      try {
        assetRequestIdHash = await hashIdempotencyKey(idempotencySecret, request.idempotencyKey);
      } catch {
        throw new ListeningUploadSessionError('bridge_hmac_failed', 500);
      }
      const existingAsset = (session.assetRequests ?? {})[assetRequestIdHash];
      if (
        existingAsset
        && (
          existingAsset.fileName !== request.fileName
          || existingAsset.sanitizedFileName !== request.fileName
          || existingAsset.declaredMimeType !== request.declaredMimeType
          || existingAsset.sizeBytes !== request.sizeBytes
        )
      ) {
        throw new ListeningUploadSessionError('idempotency_conflict', 409);
      }
      const candidate: ListeningUploadAssetRecord = existingAsset ?? {
        assetId: (() => {
          try {
            return issueOpaqueId();
          } catch {
            throw new ListeningUploadSessionError('bridge_id_failed', 500);
          }
        })(),
        fileName: request.fileName,
        sanitizedFileName: request.fileName,
        declaredMimeType: request.declaredMimeType,
        sizeBytes: request.sizeBytes,
        tempKey: '',
        issuedAt,
        grantExpiresAt: issuedAt + GRANT_TTL_MS,
      };
      const asset: ListeningUploadAssetRecord = {
        ...candidate,
        tempKey: createListeningTempKey({
          ownerId: input.uid,
          uploadSessionId: session.uploadSessionId,
          assetId: candidate.assetId,
          sanitizedFileName: candidate.sanitizedFileName,
        }),
      };
      let saved: { session: ListeningUploadSessionRecord; asset: ListeningUploadAssetRecord } | null;
      if (existingAsset) {
        saved = { session, asset };
      } else {
        try {
          saved = await dependencies.repository.issueAsset({
            ownerId: input.uid,
            uploadSessionId: session.uploadSessionId,
            assetRequestIdHash,
            asset,
          });
        } catch (error) {
          const safeError = asError(error);
          if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
          throw new ListeningUploadSessionError('bridge_repository_issue_failed', 500);
        }
      }
      if (!saved) throw new ListeningUploadSessionError('upload_session_not_found', 404);

      const assetGrantExpiresAt = issuedAt + GRANT_TTL_MS;
      const assetGrant = await createListeningUploadAssetGrant({
        v: 1,
        kind: 'upload',
        uid: input.uid,
        ownerId: input.uid,
        uploadSessionId: saved.session.uploadSessionId,
        assetId: saved.asset.assetId,
        sanitizedFileName: saved.asset.sanitizedFileName,
        key: saved.asset.tempKey,
        operation: 'listening-upload-session',
        contentType: saved.asset.declaredMimeType,
        sizeBytes: saved.asset.sizeBytes,
        expiresAt: assetGrantExpiresAt,
        nonce: issueOpaqueId(),
        ...(input.uploadTransportOrigin
          ? { uploadTransportOrigin: input.uploadTransportOrigin }
          : {}),
      }, grantSecret);
      return {
        assetId: saved.asset.assetId,
        uploadSessionId: saved.session.uploadSessionId,
        tempKey: saved.asset.tempKey,
        assetGrant,
        assetGrantExpiresAt,
      };
    },

    async resolveAssetForProbe(input: { uid: string; body: unknown }) {
      const request = parseProbeAssetRequest(input.body);
      let session: ListeningUploadSessionRecord | null;
      try {
        session = await dependencies.repository.get(input.uid, request.uploadSessionId);
      } catch (error) {
        const safeError = asError(error);
        if (safeError.code !== 'bridge_unexpected_typeerror') throw safeError;
        throw new ListeningUploadSessionError('bridge_repository_get_failed', 500);
      }
      if (!session || session.ownerId !== input.uid || session.status !== 'active') {
        throw new ListeningUploadSessionError('upload_session_not_found', 404);
      }
      const checkedAt = now();
      if (session.expiresAt <= checkedAt || session.maxEligibilityExpiresAt <= checkedAt) {
        throw new ListeningUploadSessionError('upload_session_expired', 403);
      }
      const asset = Object.values(session.assetRequests ?? {})
        .find((entry) => entry.assetId === request.assetId);
      if (!asset || !session.assetIds?.[request.assetId]) {
        throw new ListeningUploadSessionError('asset_not_found', 404);
      }
      if (asset.tempKey !== createListeningTempKey({
        ownerId: input.uid,
        uploadSessionId: session.uploadSessionId,
        assetId: asset.assetId,
        sanitizedFileName: asset.sanitizedFileName,
      })) {
        throw new ListeningUploadSessionError('asset_key_mismatch', 409);
      }
      return {
        uploadSessionId: session.uploadSessionId,
        asset,
      };
    },
  };
};

const readJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) return {};
  try {
    return await request.json();
  } catch {
    throw new ListeningUploadSessionError('invalid_request', 400);
  }
};

const createServiceFromEnv = (input: {
  env: Record<string, unknown>;
  repository?: ListeningUploadSessionRepository;
  now: () => number;
  createOpaqueId?: () => string;
  idempotencySecret?: string;
  grantSecret?: string;
}) => {
  const repository = input.repository ?? new FirebaseRestListeningUploadSessionRepository({
    env: input.env,
  });
  const grantSecret = input.grantSecret ?? requireSecret(
    typeof input.env.LISTENING_UPLOAD_SESSION_GRANT_SECRET === 'string'
      ? input.env.LISTENING_UPLOAD_SESSION_GRANT_SECRET
      : undefined,
    'grant_secret_unavailable',
  );

  return createListeningUploadSessionService({
    repository,
    idempotencySecret: input.idempotencySecret ?? grantSecret,
    grantSecret,
    now: input.now,
    createOpaqueId: input.createOpaqueId,
  });
};

export const createListeningUploadSessionHandlers = (options: {
  repository?: ListeningUploadSessionRepository;
  now?: () => number;
  createOpaqueId?: () => string;
  idempotencySecret?: string;
  grantSecret?: string;
} = {}) => ({
  async createSession(input: {
    request: Request;
    env: Record<string, unknown>;
    uid: string;
    now: () => number;
  }) {
    try {
      let service: ReturnType<typeof createServiceFromEnv>;
      try {
        service = createServiceFromEnv({
          env: input.env,
          repository: options.repository,
          now: options.now ?? input.now,
          createOpaqueId: options.createOpaqueId,
          idempotencySecret: options.idempotencySecret,
          grantSecret: options.grantSecret,
        });
      } catch {
        throw new ListeningUploadSessionError('bridge_service_init_failed', 500);
      }
      let body: unknown;
      try {
        body = await readJsonBody(input.request);
      } catch (error) {
        if (error instanceof ListeningUploadSessionError) throw error;
        throw new ListeningUploadSessionError('bridge_body_read_failed', 500);
      }
      return {
        body: await service.createSession({
          uid: input.uid,
          idempotencyKey: input.request.headers.get('Idempotency-Key'),
          body,
        }),
      };
    } catch (error) {
      const safeError = asError(error);
      return { body: { code: safeError.code }, init: { status: safeError.statusCode } };
    }
  },

  async issueAsset(input: {
    request: Request;
    env: Record<string, unknown>;
    uid: string;
    now: () => number;
  }) {
    try {
      const service = createServiceFromEnv({
        env: input.env,
        repository: options.repository,
        now: options.now ?? input.now,
        createOpaqueId: options.createOpaqueId,
        idempotencySecret: options.idempotencySecret,
        grantSecret: options.grantSecret,
      });
      return {
        body: await service.issueAsset({
          uid: input.uid,
          idempotencyKey: input.request.headers.get('Idempotency-Key'),
          body: await readJsonBody(input.request),
          uploadTransportOrigin: resolveLocalUploadTransportOrigin(input.request, input.env),
        }),
      };
    } catch (error) {
      const safeError = asError(error);
      return { body: { code: safeError.code }, init: { status: safeError.statusCode } };
    }
  },

  async probeAsset(input: {
    request: Request;
    env: Record<string, unknown>;
    uid: string;
    now: () => number;
  }) {
    try {
      const service = createServiceFromEnv({
        env: input.env,
        repository: options.repository,
        now: options.now ?? input.now,
        createOpaqueId: options.createOpaqueId,
        idempotencySecret: options.idempotencySecret,
        grantSecret: options.grantSecret,
      });
      const probeTarget = await service.resolveAssetForProbe({
        uid: input.uid,
        body: await readJsonBody(input.request),
      });
      return {
        body: {
          status: 'ready',
          assetId: probeTarget.asset.assetId,
          uploadSessionId: probeTarget.uploadSessionId,
          contentType: probeTarget.asset.declaredMimeType,
          sizeBytes: probeTarget.asset.sizeBytes,
          range: await probeUploadedAssetRange(input.env, probeTarget.asset),
        },
      };
    } catch (error) {
      const safeError = asError(error);
      return { body: { code: safeError.code }, init: { status: safeError.statusCode } };
    }
  },
});

export type {
  ListeningUploadAssetRecord,
  ListeningUploadSessionRecord,
  ListeningUploadSessionRepository,
};
