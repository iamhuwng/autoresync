import { GrantAuthorityError, MAX_UPLOAD_BYTES } from './grant-authority.js';
import { consumeGrantNonce } from './replay-authority.js';
import { sanitizeFileName } from './path-authority.js';

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
    return crypto.subtle.verify('HMAC', key, base64UrlToBytes(signature), textEncoder.encode(encoded));
  } catch {
    return false;
  }
};

const stringField = (payload: Record<string, unknown>, name: string): string => {
  const value = payload[name];
  if (typeof value !== 'string' || value === '') fail('invalid_bridge_grant');
  return value;
};

const integerField = (payload: Record<string, unknown>, name: string): number => {
  const value = payload[name];
  if (!Number.isSafeInteger(value)) fail('invalid_bridge_grant');
  return value as number;
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
  const [encoded, signature] = parts;
  if (!await verifySignature(secret, encoded, signature)) fail('invalid_bridge_grant');
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
  const existingObject = await input.env.R2_BUCKET.get(grant.key);
  if (existingObject) return { body: { error: 'Destination already exists' }, init: { status: 409 } };
  await input.env.R2_BUCKET.put(grant.key, input.request.body, {
    httpMetadata: { contentType: grant.contentType },
  });
  return {
    body: { success: true, url: `${input.env.PUBLIC_URL}/${grant.key}`, key: grant.key },
  };
};
