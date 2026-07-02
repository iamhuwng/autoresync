import { MAX_UPLOAD_BYTES } from './grant-authority.js';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
]);
const BROWSER_AUTHORITY_FIELDS = [
  'ownerId',
  'assetId',
  'key',
  'tempKey',
  'prefix',
  'rawKey',
  'schemaVersion',
  'purpose',
  'status',
  'createdAt',
  'createdBy',
  'expiresAt',
  'maxEligibilityExpiresAt',
  'lastGrantIssuedAt',
  'assetIds',
  'assetRequests',
  'bridgeVersion',
];
const LISTENING_CANCEL_REASONS = new Set([
  'builder-cancel',
  'discard-draft',
  'section-removed',
  'replacement-cancelled',
  'upload-aborted',
  'navigation-away',
  'scheduled-expired',
]);
const LISTENING_UPLOAD_SESSION_ALLOWED_ORIGINS = new Set([
  'https://kahut1.web.app',
  'http://localhost:5173',
  'http://localhost:5174',
]);
const LISTENING_UPLOAD_SESSION_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Content-Length',
  'Idempotency-Key',
];
const textEncoder = new TextEncoder();

export interface ListeningUploadAssetGrantPayload {
  v: 1;
  kind: 'upload';
  uid: string;
  ownerId: string;
  uploadSessionId: string;
  assetId: string;
  sanitizedFileName: string;
  key: string;
  operation: 'listening-upload-session';
  contentType: string;
  sizeBytes: number;
  expiresAt: number;
  nonce: string;
  uploadTransportOrigin?: 'http://localhost:8787';
}

export class ListeningUploadSessionInputError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ListeningUploadSessionInputError';
  }
}

const fail = (code: string): never => {
  throw new ListeningUploadSessionInputError(code);
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const importHmacKey = (secret: string, usages: KeyUsage[]): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_request');
  return value as Record<string, unknown>;
};

const assertNoBrowserAuthority = (
  body: Record<string, unknown>,
  fields = BROWSER_AUTHORITY_FIELDS,
): void => {
  if (fields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    fail('browser_authority_field');
  }
};

const optionalCorrelationId = (value: unknown, name: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') fail(`invalid_${name}`);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) fail(`invalid_${name}`);
  return value;
};

const requiredRequestId = (value: unknown): string => {
  if (typeof value !== 'string') fail('invalid_idempotency_key');
  if (value.trim().length < 1 || value.length > 512) fail('invalid_idempotency_key');
  return value;
};

const sanitizeListeningFileName = (fileName: unknown): string => {
  if (typeof fileName !== 'string') fail('invalid_file_name');
  const trimmed = fileName.trim();
  if (trimmed === '') fail('invalid_file_name');
  if (
    CONTROL_CHARACTERS.test(trimmed) ||
    /[\\/]/.test(trimmed) ||
    trimmed.includes('..') ||
    trimmed.includes('://')
  ) {
    fail('invalid_file_name');
  }

  const sanitized = trimmed.normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!sanitized) fail('invalid_file_name');
  return sanitized;
};

export const createListeningTempKey = (input: {
  ownerId: string;
  uploadSessionId: string;
  assetId: string;
  sanitizedFileName: string;
}): string => {
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(input.uploadSessionId)) fail('invalid_upload_session_id');
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(input.assetId)) fail('invalid_asset_id');
  if (typeof input.ownerId !== 'string' || !/^[A-Za-z0-9._~-]{1,128}$/.test(input.ownerId)) {
    fail('invalid_owner');
  }
  if (sanitizeListeningFileName(input.sanitizedFileName) !== input.sanitizedFileName) {
    fail('invalid_file_name');
  }
  return `temp/listening/${input.ownerId}/${input.uploadSessionId}/${input.assetId}-${input.sanitizedFileName}`;
};

export const parseCreateSessionRequest = (body: unknown, idempotencyKey: unknown) => {
  const input = asObject(body);
  assertNoBrowserAuthority(input, [...BROWSER_AUTHORITY_FIELDS, 'uploadSessionId']);
  return {
    idempotencyKey: requiredRequestId(idempotencyKey),
    draftId: optionalCorrelationId(input.draftId, 'draft_id'),
    testId: optionalCorrelationId(input.testId, 'test_id'),
    revisionId: optionalCorrelationId(input.revisionId, 'revision_id'),
  };
};

export const parseIssueAssetRequest = (body: unknown, idempotencyKey: unknown) => {
  const input = asObject(body);
  assertNoBrowserAuthority(input);
  const uploadSessionId = optionalCorrelationId(input.uploadSessionId, 'upload_session_id');
  if (!uploadSessionId || uploadSessionId.length < 16) fail('invalid_upload_session_id');
  const declaredMimeTypeInput = input.declaredMimeType;
  if (typeof declaredMimeTypeInput !== 'string') fail('invalid_mime_type');
  const declaredMimeType = declaredMimeTypeInput.trim().toLowerCase();
  if (!AUDIO_MIME_TYPES.has(declaredMimeType)) fail('unsupported_mime_type');
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) fail('invalid_size');
  if (sizeBytes > MAX_UPLOAD_BYTES) fail('upload_too_large');

  return {
    idempotencyKey: requiredRequestId(idempotencyKey),
    uploadSessionId,
    fileName: sanitizeListeningFileName(input.fileName),
    declaredMimeType,
    sizeBytes,
  };
};

export const parseProbeAssetRequest = (body: unknown) => {
  const input = asObject(body);
  assertNoBrowserAuthority(
    input,
    BROWSER_AUTHORITY_FIELDS.filter((field) => field !== 'assetId'),
  );
  const uploadSessionId = optionalCorrelationId(input.uploadSessionId, 'upload_session_id');
  if (!uploadSessionId || uploadSessionId.length < 16) fail('invalid_upload_session_id');
  const assetId = optionalCorrelationId(input.assetId, 'asset_id');
  if (!assetId || assetId.length < 16) fail('invalid_asset_id');

  return {
    uploadSessionId,
    assetId,
  };
};

export const parseCancelSessionRequest = (body: unknown) => {
  const input = asObject(body);
  assertNoBrowserAuthority(
    input,
    BROWSER_AUTHORITY_FIELDS.filter((field) => field !== 'assetId'),
  );
  const uploadSessionId = optionalCorrelationId(input.uploadSessionId, 'upload_session_id');
  if (!uploadSessionId || uploadSessionId.length < 16) fail('invalid_upload_session_id');
  const assetId = optionalCorrelationId(input.assetId, 'asset_id');
  if (assetId !== undefined && assetId.length < 16) fail('invalid_asset_id');
  const reason = input.reason === undefined ? 'builder-cancel' : input.reason;
  if (typeof reason !== 'string' || !LISTENING_CANCEL_REASONS.has(reason)) {
    fail('invalid_cleanup_reason');
  }

  return {
    uploadSessionId,
    assetId,
    reason,
  };
};

export const buildListeningUploadSessionCorsHeaders = (origin: string | undefined): Record<string, string> => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': LISTENING_UPLOAD_SESSION_ALLOWED_HEADERS.join(', '),
    Vary: 'Origin',
  };
  if (origin && LISTENING_UPLOAD_SESSION_ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
};

export const createOpaqueId = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

export const hashIdempotencyKey = async (secret: string, value: string): Promise<string> => {
  const key = await importHmacKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
};

export const createListeningUploadAssetGrant = async (
  payload: ListeningUploadAssetGrantPayload,
  secret: string,
): Promise<string> => {
  const encoded = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(encoded));
  return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`;
};
