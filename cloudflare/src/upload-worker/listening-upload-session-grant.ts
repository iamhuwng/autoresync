import { GrantAuthorityError, MAX_UPLOAD_BYTES } from './grant-authority.js';
import { consumeGrantNonce } from './replay-authority.js';
import { sanitizeFileName } from './path-authority.js';
import { FirebaseRestListeningUploadSessionRepository } from './listening-upload-session-repository.ts';
import type {
  ListeningUploadCleanupLease,
  ListeningUploadSessionRepository,
} from './listening-upload-session-types.ts';

const textEncoder = new TextEncoder();
const LOCAL_UPLOAD_TRANSPORT_ORIGIN = 'http://localhost:8787';
const LOCAL_APP_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
]);

const fail = (reason: string, status = 403): never => {
  throw new GrantAuthorityError(reason, status);
};

const base64UrlToBytes = (value: string): Uint8Array => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const decodePayload = (encoded: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('invalid_bridge_grant');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GrantAuthorityError) throw error;
    fail('invalid_bridge_grant');
  }
};

const verifySignature = async (secret: string, encoded: string, signature: string): Promise<boolean> => {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify('HMAC', key, base64UrlToBytes(signature) as BufferSource, textEncoder.encode(encoded));
  } catch {
    return false;
  }
};

const stringField = (payload: Record<string, unknown>, name: string): string => {
  const value = payload[name];
  if (typeof value !== 'string' || value === '') fail('invalid_bridge_grant');
  return value as string;
};

const integerField = (payload: Record<string, unknown>, name: string): number => {
  const value = payload[name];
  if (!Number.isSafeInteger(value)) fail('invalid_bridge_grant');
  return value as number;
};

type ListeningUploadSessionStateRepository = Pick<
  ListeningUploadSessionRepository,
  'get' | 'acquireCleanupLease' | 'assertCleanupLeaseOwned' | 'releaseCleanupLease'
>;

const resolveSessionRepository = (
  env: Record<string, any>,
  repository?: ListeningUploadSessionStateRepository,
): ListeningUploadSessionStateRepository => {
  if (repository) return repository;
  const configured = env.LISTENING_UPLOAD_SESSION_REPOSITORY;
  if (configured && typeof configured.get === 'function') return configured;
  return new FirebaseRestListeningUploadSessionRepository({ env });
};

const assertListeningSessionIsActive = async (input: {
  env: Record<string, any>;
  repository?: ListeningUploadSessionStateRepository;
  ownerId: string;
  uploadSessionId: string;
  assetId: string;
  key: string;
  now: number;
}): Promise<void> => {
  let session;
  try {
    session = await resolveSessionRepository(input.env, input.repository).get(
      input.ownerId,
      input.uploadSessionId,
    );
  } catch {
    fail('listening_upload_session_state_unavailable', 503);
  }
  if (
    !session
    || session.ownerId !== input.ownerId
    || session.uploadSessionId !== input.uploadSessionId
    || session.purpose !== 'listening-authoring'
    || session.status !== 'active'
    || session.cleanupFence !== undefined
    || !Number.isSafeInteger(session.expiresAt)
    || session.expiresAt <= input.now
    || !Number.isSafeInteger(session.maxEligibilityExpiresAt)
    || session.maxEligibilityExpiresAt <= input.now
    || !Object.values(session.assetRequests ?? {}).some((asset) =>
      asset.assetId === input.assetId && asset.tempKey === input.key)
  ) {
    fail('listening_upload_session_inactive', 409);
  }
};

const parseBridgeGrant = async (input: {
  env: Record<string, unknown>;
  grant: string | null;
  uid: string;
  now: () => number;
}) => {
  if (!input.grant) fail('missing_bridge_grant', 400);
  const secret = input.env.LISTENING_UPLOAD_SESSION_GRANT_SECRET;
  if (typeof secret !== 'string' || secret.length < 16) fail('missing_bridge_grant_secret', 500);
  const parts = input.grant.split('.');
  if (parts.length !== 2) fail('invalid_bridge_grant');
  const encoded = parts[0] ?? '';
  const signature = parts[1] ?? '';
  if (!await verifySignature(secret as string, encoded, signature)) fail('invalid_bridge_grant');
  const payload = decodePayload(encoded);
  if (payload.v !== 1 || payload.kind !== 'upload' || payload.operation !== 'listening-upload-session') {
    fail('invalid_bridge_grant');
  }
  const uid = stringField(payload, 'uid');
  const ownerId = stringField(payload, 'ownerId');
  const uploadSessionId = stringField(payload, 'uploadSessionId');
  const assetId = stringField(payload, 'assetId');
  const sanitizedFileName = stringField(payload, 'sanitizedFileName');
  const key = stringField(payload, 'key');
  const contentType = stringField(payload, 'contentType').toLowerCase();
  const sizeBytes = integerField(payload, 'sizeBytes');
  const expiresAt = integerField(payload, 'expiresAt');
  const nonce = stringField(payload, 'nonce');
  const uploadTransportOrigin = payload.uploadTransportOrigin;
  if (
    uid !== input.uid ||
    ownerId !== input.uid ||
    !/^[A-Za-z0-9_-]{16,160}$/.test(uploadSessionId) ||
    !/^[A-Za-z0-9_-]{16,160}$/.test(assetId) ||
    sanitizeFileName(sanitizedFileName) !== sanitizedFileName ||
    key !== `temp/listening/${ownerId}/${uploadSessionId}/${assetId}-${sanitizedFileName}` ||
    !contentType.startsWith('audio/') ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_UPLOAD_BYTES ||
    expiresAt <= input.now() ||
    nonce.length < 16 ||
    (
      uploadTransportOrigin !== undefined
      && uploadTransportOrigin !== LOCAL_UPLOAD_TRANSPORT_ORIGIN
    )
  ) {
    fail('invalid_bridge_grant');
  }
  return {
    payload,
    ownerId,
    uploadSessionId,
    assetId,
    key,
    contentType,
    sizeBytes,
    uploadTransportOrigin: uploadTransportOrigin as string | undefined,
  };
};

export const handleListeningUploadSessionGrant = async (input: {
  request: Request;
  env: Record<string, any>;
  url: URL;
  uid: string;
  now: () => number;
  repository?: ListeningUploadSessionStateRepository;
}) => {
  const grant = await parseBridgeGrant({
    env: input.env,
    grant: input.url.searchParams.get('assetGrant'),
    uid: input.uid,
    now: input.now,
  });
  const contentType = input.request.headers.get('Content-Type')?.trim().toLowerCase();
  const requestOrigin = input.request.headers.get('Origin') ?? '';
  const contentLength = input.request.headers.get('Content-Length')
    ?? (
      grant.uploadTransportOrigin === LOCAL_UPLOAD_TRANSPORT_ORIGIN
      && LOCAL_APP_ORIGINS.has(requestOrigin)
        ? input.request.headers.get('X-Upload-Size')
        : null
    );
  if (contentLength === null || contentLength === '') fail('missing_size', 411);
  const sizeBytes = Number(contentLength);
  if (contentType !== grant.contentType) fail('content_type_mismatch', 400);
  if (!Number.isSafeInteger(sizeBytes)) fail('invalid_size', 400);
  if (grant.sizeBytes <= 0 || sizeBytes <= 0) fail('invalid_bridge_grant');
  if (sizeBytes !== grant.sizeBytes) fail('size_mismatch', 400);

  await consumeGrantNonce({ env: input.env, payload: grant.payload });
  const repository = resolveSessionRepository(input.env, input.repository);
  await assertListeningSessionIsActive({
    env: input.env,
    repository,
    ownerId: grant.ownerId,
    uploadSessionId: grant.uploadSessionId,
    assetId: grant.assetId,
    key: grant.key,
    now: input.now(),
  });
  if (!repository.acquireCleanupLease
    || !repository.assertCleanupLeaseOwned
    || !repository.releaseCleanupLease) {
    fail('listening_upload_session_state_unavailable', 503);
  }
  const claimedAt = input.now();
  const lease = await repository.acquireCleanupLease({
    ownerId: grant.ownerId,
    uploadSessionId: grant.uploadSessionId,
    assetId: grant.assetId,
    leaseId: `upload:${crypto.randomUUID()}`,
    now: claimedAt,
    leaseMs: 2 * 60 * 1000,
  });
  if (!lease) fail('listening_upload_session_mutation_busy', 503);
  try {
    await assertListeningSessionIsActive({
      env: input.env,
      repository,
      ownerId: grant.ownerId,
      uploadSessionId: grant.uploadSessionId,
      assetId: grant.assetId,
      key: grant.key,
      now: input.now(),
    });
    const existingObject = await input.env.R2_BUCKET.get(grant.key);
    if (existingObject) return { body: { error: 'Destination already exists' }, init: { status: 409 } };
    await assertListeningSessionIsActive({
      env: input.env,
      repository,
      ownerId: grant.ownerId,
      uploadSessionId: grant.uploadSessionId,
      assetId: grant.assetId,
      key: grant.key,
      now: input.now(),
    });
    if (!await repository.assertCleanupLeaseOwned(lease as ListeningUploadCleanupLease, input.now())) {
      fail('listening_upload_session_mutation_lease_lost', 503);
    }
    await input.env.R2_BUCKET.put(grant.key, input.request.body, {
      httpMetadata: { contentType: grant.contentType },
    });
    try {
      await assertListeningSessionIsActive({
        env: input.env,
        repository,
        ownerId: grant.ownerId,
        uploadSessionId: grant.uploadSessionId,
        assetId: grant.assetId,
        key: grant.key,
        now: input.now(),
      });
    } catch (error) {
      await input.env.R2_BUCKET.delete(grant.key);
      throw error;
    }
    return {
      body: { success: true, url: `${input.env.PUBLIC_URL}/${grant.key}`, key: grant.key },
    };
  } finally {
    await repository.releaseCleanupLease(lease as ListeningUploadCleanupLease);
  }
};
