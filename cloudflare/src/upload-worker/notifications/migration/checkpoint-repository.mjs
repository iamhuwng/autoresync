import {
  CHECKPOINT_START_CURSOR,
  CHECKPOINT_PATH,
  canonicalCheckpointPayload,
  validateCheckpoint,
  NotificationMigrationCheckpointError,
} from './checkpoint-schema.mjs';

const IDENTITY = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/u;

const fail = (code) => {
  throw new NotificationMigrationCheckpointError(code);
};

const hex = (bytes) => [...new Uint8Array(bytes)]
  .map((value) => value.toString(16).padStart(2, '0'))
  .join('');

export const sha256Hex = async (value) => hex(await globalThis.crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(value),
));

const hmacHex = async (value, secret) => {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
};

const parseServiceAccount = (raw, expectedIdentity, expectedProject) => {
  if (typeof raw !== 'string' || raw.trim() === '') fail('operator_service_account_missing');
  let key;
  try {
    key = JSON.parse(raw);
  } catch {
    fail('operator_service_account_invalid');
  }
  if (!key || typeof key !== 'object' || Array.isArray(key)) fail('operator_service_account_invalid');
  if (key.type !== 'service_account') fail('operator_service_account_invalid');
  if (typeof key.client_email !== 'string' || !IDENTITY.test(key.client_email)) {
    fail('operator_service_identity_invalid');
  }
  if (key.client_email !== expectedIdentity) fail('operator_service_identity_mismatch');
  if (typeof key.project_id !== 'string' || key.project_id !== expectedProject) {
    fail('operator_service_project_mismatch');
  }
  if (typeof key.private_key !== 'string' || !key.private_key.includes('BEGIN PRIVATE KEY')) {
    fail('operator_service_account_invalid');
  }
  return key;
};

const assertDatabaseUrl = (databaseUrl, projectId) => {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') fail('operator_database_url_missing');
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail('operator_database_url_invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash
    || parsed.pathname !== '/') {
    fail('operator_database_url_invalid');
  }
  const host = parsed.hostname.toLowerCase();
  const expected = `${projectId}-default-rtdb.firebaseio.com`;
  const legacy = `${projectId}.firebaseio.com`;
  if (host !== expected && host !== legacy) fail('operator_database_project_mismatch');
  return parsed.origin;
};

export const assertOperatorConfiguration = ({
  projectId,
  databaseUrl,
  operatorIdentity,
  serviceAccountKey,
  checkpointSecret,
  requireServiceAccount = true,
}) => {
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,29}$/u.test(projectId)) {
    fail('operator_project_invalid');
  }
  if (typeof operatorIdentity !== 'string' || !IDENTITY.test(operatorIdentity)) {
    fail('operator_identity_invalid');
  }
  if (typeof checkpointSecret !== 'string' || checkpointSecret.length < 32) {
    fail('checkpoint_secret_missing');
  }
  const normalizedDatabaseUrl = assertDatabaseUrl(databaseUrl, projectId);
  if (!requireServiceAccount) {
    const suffix = '.iam.gserviceaccount.com';
    const at = operatorIdentity.indexOf('@');
    const identityProject = operatorIdentity.slice(at + 1, -suffix.length);
    if (identityProject !== projectId) fail('operator_service_project_mismatch');
  }
  const serviceAccount = requireServiceAccount
    ? parseServiceAccount(serviceAccountKey, operatorIdentity, projectId)
    : null;
  return { normalizedDatabaseUrl, serviceAccount };
};

export class NotificationMigrationCheckpointRepository {
  constructor({
    rtdb,
    projectId,
    databaseUrl,
    operatorIdentity,
    serviceAccountKey,
    checkpointSecret,
    operatorFingerprint,
    requireServiceAccount = true,
    maxRetries = 5,
  }) {
    if (!rtdb || typeof rtdb.readWithEtag !== 'function' || typeof rtdb.writeIfMatch !== 'function') {
      fail('checkpoint_repository_invalid');
    }
    const config = assertOperatorConfiguration({
      projectId,
      databaseUrl,
      operatorIdentity,
      serviceAccountKey,
      checkpointSecret,
      requireServiceAccount,
    });
    if (typeof operatorFingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(operatorFingerprint)) {
      fail('operator_fingerprint_invalid');
    }
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) {
      fail('checkpoint_retry_limit_invalid');
    }
    this.rtdb = rtdb;
    this.projectId = projectId;
    this.databaseUrl = config.normalizedDatabaseUrl;
    this.operatorIdentity = operatorIdentity;
    this.operatorFingerprint = operatorFingerprint;
    this.checkpointSecret = checkpointSecret;
    this.maxRetries = maxRetries;
  }

  async assertAuthority() {
    const expectedFingerprint = await sha256Hex(this.operatorIdentity);
    if (expectedFingerprint !== this.operatorFingerprint) fail('operator_fingerprint_mismatch');
  }

  async load() {
    await this.assertAuthority();
    const current = await this.rtdb.readWithEtag(CHECKPOINT_PATH);
    if (current.data === null || current.data === undefined) return current;
    const missingStartCursor = current.data
      && typeof current.data === 'object'
      && !Array.isArray(current.data)
      && !Object.prototype.hasOwnProperty.call(current.data, 'lastKey');
    const checkpoint = validateCheckpoint(missingStartCursor
      ? { ...current.data, lastKey: CHECKPOINT_START_CURSOR }
      : current.data);
    if (checkpoint.projectId !== this.projectId || checkpoint.operatorFingerprint !== this.operatorFingerprint) {
      fail('checkpoint_authority_mismatch');
    }
    // A prior runner signed the initial cursor as null. RTDB then removed that
    // child, making its own zero-progress checkpoint unreadable. Recover only
    // when the exact legacy payload still verifies with the protected HMAC.
    const signedPayload = missingStartCursor ? { ...checkpoint, lastKey: null } : checkpoint;
    const expected = await hmacHex(canonicalCheckpointPayload(signedPayload), this.checkpointSecret);
    if (checkpoint.signature !== expected) fail('checkpoint_tampered');
    return { ...current, data: checkpoint };
  }

  async save(unsignedCheckpoint, expectedEtag) {
    await this.assertAuthority();
    if (typeof expectedEtag !== 'string' || expectedEtag.length === 0 || expectedEtag === '*') {
      fail('checkpoint_etag_missing');
    }
    const checkpoint = validateCheckpoint(unsignedCheckpoint, { allowUnsigned: true });
    if (checkpoint.projectId !== this.projectId || checkpoint.operatorFingerprint !== this.operatorFingerprint) {
      fail('checkpoint_authority_mismatch');
    }
    const signature = await hmacHex(canonicalCheckpointPayload(checkpoint), this.checkpointSecret);
    const signed = validateCheckpoint({ ...checkpoint, signature });
    const written = await this.rtdb.writeIfMatch(CHECKPOINT_PATH, signed, expectedEtag);
    if (!written) return { written: false, checkpoint: null, etag: expectedEtag };
    const readBack = await this.load();
    return { written: true, checkpoint: readBack.data, etag: readBack.etag };
  }

  async update(mutator) {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.load();
      const next = await mutator(current.data);
      const result = await this.save(next, current.etag);
      if (result.written) return result;
    }
    fail('checkpoint_cas_retries_exhausted');
  }
}

export const checkpointPath = () => CHECKPOINT_PATH;
