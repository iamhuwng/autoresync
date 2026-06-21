export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const UPLOAD_GRANT_TTL_MS = 10 * 60 * 1000;

const textEncoder = new TextEncoder();

export class GrantAuthorityError extends Error {
  constructor(reason, status = 403) {
    super(reason);
    this.name = 'GrantAuthorityError';
    this.reason = reason;
    this.status = status;
  }
}

const fail = (reason, status = 403) => {
  throw new GrantAuthorityError(reason, status);
};

const bytesToBase64Url = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const base64UrlToBytes = (value) => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const importHmacKey = (env, usages) => {
  const secret = env.UPLOAD_GRANT_SECRET;
  if (typeof secret !== 'string' || secret.length < 16) {
    fail('missing_grant_secret', 500);
  }
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
};

const encodePayload = (payload) =>
  bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));

const decodePayload = (encodedPayload) => {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)));
  } catch {
    fail('invalid_grant');
  }
};

const signPayload = async (env, encodedPayload) => {
  const key = await importHmacKey(env, ['sign']);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(encodedPayload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
};

const verifySignature = async (env, encodedPayload, encodedSignature) => {
  try {
    const key = await importHmacKey(env, ['verify']);
    return crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(encodedSignature),
      textEncoder.encode(encodedPayload),
    );
  } catch {
    return false;
  }
};

export const parseSizeBytes = (value, { missingStatus = 400 } = {}) => {
  if (value === undefined || value === null || value === '') {
    fail('missing_size', missingStatus);
  }
  const sizeBytes = Number(value);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    fail('invalid_size', 400);
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    fail('upload_too_large', 413);
  }
  return sizeBytes;
};

export const requireContentType = (contentType) => {
  if (typeof contentType !== 'string' || contentType.trim() === '') {
    fail('missing_content_type', 400);
  }
  return contentType.trim().toLowerCase();
};

export const issueGrant = async ({ env, payload }) => {
  const encodedPayload = encodePayload({ v: 1, ...payload });
  const signature = await signPayload(env, encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const verifyGrant = async ({ env, grant, uid, kind, now }) => {
  if (typeof grant !== 'string' || grant.trim() === '') fail('missing_grant', 400);
  const parts = grant.split('.');
  if (parts.length !== 2) fail('invalid_grant');
  const [encodedPayload, encodedSignature] = parts;
  const signatureValid = await verifySignature(env, encodedPayload, encodedSignature);
  if (!signatureValid) fail('invalid_grant');

  const payload = decodePayload(encodedPayload);
  if (payload.v !== 1 || payload.kind !== kind) fail('invalid_grant');
  if (payload.uid !== uid) fail('grant_uid_mismatch');
  if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now()) {
    fail('grant_expired');
  }
  if (typeof payload.nonce !== 'string' || payload.nonce === '') {
    fail('invalid_grant');
  }

  return payload;
};

export const assertUploadGrantMatchesRequest = ({ payload, contentType, sizeBytes }) => {
  const requestContentType = requireContentType(contentType);
  const requestSizeBytes = parseSizeBytes(sizeBytes, { missingStatus: 411 });
  if (payload.contentType !== requestContentType) fail('content_type_mismatch', 400);
  if (payload.sizeBytes !== requestSizeBytes) fail('size_mismatch', 400);
};

const ipClass = (request) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
  return ip.includes(':') ? 'ipv6' : 'unknown';
};

export const enforceRateLimit = async ({ env, uid, request }) => {
  const limiter = env.UPLOAD_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== 'function') {
    fail('rate_limit_unavailable', 500);
  }
  const outcome = await limiter.limit({
    key: `upload-worker:${uid}:${ipClass(request)}`,
  });
  if (!outcome?.success) fail('rate_limited', 429);
  return outcome;
};
