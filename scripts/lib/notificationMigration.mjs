import { createSign } from 'node:crypto';
import { sha256Hex } from '../../cloudflare/src/upload-worker/notifications/migration/checkpoint-repository.mjs';
import {
  CHECKPOINT_START_CURSOR,
  CHECKPOINT_PATH,
  MAX_BATCH_SIZE,
  NOTIFICATION_ROOT_PATH,
  RTDB_KEY,
  addCounts,
  createCheckpoint,
  countKeys,
  zeroCounts,
} from '../../cloudflare/src/upload-worker/notifications/migration/checkpoint-schema.mjs';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_SCOPE = 'https://www.googleapis.com/auth/firebase.database';
const FIREBASE_KEY = /^[A-Za-z0-9_-]{1,128}$/u;
const NOTIFICATION_TYPES = new Set(['info', 'success', 'warning', 'error', 'feedback', 'homework_reminder']);
const STRUCTURED_METADATA_KEYS = new Set([
  'schemaVersion',
  'kind',
  'contextType',
  'contextId',
  'updateActionId',
  'checkpointAvailable',
  'deadlineClass',
  'actionClass',
]);

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const withoutUserId = (value) => {
  if (!isRecord(value)) return value;
  const result = { ...value };
  delete result.userId;
  return result;
};

export const notificationSemantic = (value) => stable(withoutUserId(value));

const safeFirebaseKey = (value) => typeof value === 'string' && FIREBASE_KEY.test(value);

// Notification IDs and recipient IDs are restricted to Firebase-safe ASCII
// keys, so this comparator matches RTDB `$key` ordering without locale rules.
export const compareFirebaseKeys = (left, right) => {
  if (left === right) return 0;
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] < rightBytes[index] ? -1 : 1;
  }
  return leftBytes.length < rightBytes.length ? -1 : 1;
};

const hasNotificationContentSignature = (value) => {
  if (!isRecord(value)) return false;
  if (typeof value.userId === 'string' || typeof value.id === 'string') return true;
  if (typeof value.type === 'string' || typeof value.title === 'string' || typeof value.message === 'string') return true;
  if (typeof value.read === 'boolean' || typeof value.createdAt === 'number') return true;
  return typeof value.link === 'string' || isRecord(value.metadata);
};

const looksLikePerUserContainer = (value) => {
  if (!isRecord(value) || hasNotificationContentSignature(value)) return false;
  const entries = Object.values(value);
  return (entries.length === 0 || entries.every(isRecord))
    && Object.keys(value).every(safeFirebaseKey);
};

const hasValidStructuredMetadata = (value) => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !STRUCTURED_METADATA_KEYS.has(key))) return false;
  return value.schemaVersion === 1
    && value.kind === 'book'
    && ['book', 'book-activity', 'book-homework'].includes(value.contextType)
    && safeFirebaseKey(value.contextId)
    && safeFirebaseKey(value.updateActionId)
    && typeof value.checkpointAvailable === 'boolean'
    && ['none', 'upcoming', 'overdue', 'closed'].includes(value.deadlineClass)
    && ['open', 'resume', 'review', 'due'].includes(value.actionClass);
};

const validLegacyMetadata = (value) => {
  if (!isRecord(value)) return false;
  if ('schemaVersion' in value || 'kind' in value) return hasValidStructuredMetadata(value);
  return true;
};

const validLegacyRow = (key, value) => {
  if (!isRecord(value) || !safeFirebaseKey(key) || typeof value.userId !== 'string' || !safeFirebaseKey(value.userId)) {
    return false;
  }
  if (value.id !== undefined && (typeof value.id !== 'string' || value.id !== key)) return false;
  if (typeof value.type !== 'string' || !NOTIFICATION_TYPES.has(value.type)) return false;
  if (typeof value.title !== 'string' || typeof value.message !== 'string') return false;
  if (typeof value.read !== 'boolean' || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false;
  if (value.link !== undefined && value.link !== null && typeof value.link !== 'string') return false;
  if (value.metadata !== undefined && value.metadata !== null && !validLegacyMetadata(value.metadata)) return false;
  return true;
};

const validPerUserRow = (key, value) => {
  if (!isRecord(value) || !safeFirebaseKey(key) || value.userId !== undefined) return false;
  if (value.id !== undefined && (typeof value.id !== 'string' || value.id !== key)) return false;
  if (typeof value.type !== 'string' || !NOTIFICATION_TYPES.has(value.type)) return false;
  if (typeof value.title !== 'string' || typeof value.message !== 'string') return false;
  if (typeof value.read !== 'boolean' || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false;
  if (value.link !== undefined && value.link !== null && typeof value.link !== 'string') return false;
  if (value.metadata !== undefined && value.metadata !== null && !validLegacyMetadata(value.metadata)) return false;
  return true;
};

export const classifyNotificationEntry = (key, value) => {
  if (looksLikePerUserContainer(value)) return { kind: 'per-user-container', key };
  if (validLegacyRow(key, value)) {
    return {
      kind: 'legacy',
      key,
      recipientId: value.userId,
      destination: withoutUserId(value),
    };
  }
  const recipientId = isRecord(value) && safeFirebaseKey(value.userId) ? value.userId : undefined;
  const safeDestination = recipientId && safeFirebaseKey(key)
    && (value.id === undefined || value.id === key);
  return {
    kind: 'malformed',
    key,
    recipientId,
    ...(safeDestination ? { destination: withoutUserId(value) } : {}),
    reason: !isRecord(value)
      ? 'not-an-object'
      : !safeFirebaseKey(value.userId)
        ? 'missing-or-invalid-recipient'
        : 'unsupported-notification-shape',
  };
};

const encodePath = (path) => path.split('/').filter(Boolean).map((part) => encodeURIComponent(part)).join('/');
const pathUrl = (databaseUrl, path, query) => {
  const encodedPath = encodePath(path);
  const base = `${databaseUrl.replace(/\/$/u, '')}/${encodedPath}.json`;
  return query ? `${base}?${query}` : base;
};

const base64Url = (value) => Buffer.from(value).toString('base64url');

const signJwt = (serviceAccount) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
    scope: FIREBASE_SCOPE,
  }));
  const input = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
};

const redactedResponseError = (status) => {
  const error = new Error(`firebase_operator_request_failed:${status}`);
  error.code = 'firebase_operator_request_failed';
  error.status = status;
  return error;
};

export class FirebaseNotificationOperatorClient {
  constructor({
    databaseUrl,
    projectId,
    serviceAccount = null,
    accessTokenProvider = null,
    fetchImpl = globalThis.fetch,
  }) {
    this.databaseUrl = databaseUrl.replace(/\/$/u, '');
    this.projectId = projectId;
    this.serviceAccount = serviceAccount;
    this.accessTokenProvider = accessTokenProvider;
    this.fetchImpl = fetchImpl;
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  async accessToken() {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 300_000) return this.cachedToken;
    if (this.accessTokenProvider) {
      let provided;
      try {
        provided = await this.accessTokenProvider();
      } catch {
        throw redactedResponseError(401);
      }
      const token = typeof provided === 'string' ? provided : provided?.token;
      const expiresIn = provided && typeof provided === 'object' ? provided.expiresIn : 3600;
      if (typeof token !== 'string' || token.length < 20 || /\s/u.test(token)) {
        throw redactedResponseError(502);
      }
      this.cachedToken = token;
      this.tokenExpiresAt = Date.now() + Math.max(60_000, Number(expiresIn ?? 3600) * 1000);
      return this.cachedToken;
    }
    if (!this.serviceAccount) throw redactedResponseError(401);
    const response = await this.fetchImpl(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signJwt(this.serviceAccount)}`,
    });
    if (!response.ok) throw redactedResponseError(response.status);
    let body;
    try {
      body = JSON.parse(await response.text());
    } catch {
      throw redactedResponseError(502);
    }
    if (!body || typeof body.access_token !== 'string' || body.access_token.length < 20) {
      throw redactedResponseError(502);
    }
    this.cachedToken = body.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(60_000, Number(body.expires_in ?? 3600) * 1000);
    return this.cachedToken;
  }

  assertPath(path, method = 'GET') {
    const segments = path.split('/');
    const isRoot = path === NOTIFICATION_ROOT_PATH;
    const isCheckpoint = path === CHECKPOINT_PATH;
    const isNotificationKey = segments[0] === NOTIFICATION_ROOT_PATH
      && segments.slice(1).every((segment) => RTDB_KEY.test(segment))
      && (segments.length === 2 || segments.length === 3);
    const allowed = isRoot
      ? method === 'GET'
      : isCheckpoint
        ? method === 'GET' || method === 'PUT'
        : isNotificationKey
          ? segments.length === 2
            ? method === 'GET' || method === 'DELETE'
            : method === 'GET' || method === 'PUT' || method === 'DELETE'
          : false;
    if (!allowed) {
      const error = new Error('firebase_operator_path_forbidden');
      error.code = 'firebase_operator_path_forbidden';
      throw error;
    }
  }

  async request(path, { method = 'GET', query, body, etag } = {}) {
    this.assertPath(path, method);
    if ((method === 'PUT' || method === 'DELETE')
      && (typeof etag !== 'string' || etag.length === 0 || etag === '*')) {
      const error = new Error('firebase_operator_cas_required');
      error.code = 'firebase_operator_cas_required';
      throw error;
    }
    const headers = { Authorization: `Bearer ${await this.accessToken()}` };
    if (method === 'GET' && etag) headers['X-Firebase-ETag'] = 'true';
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (etag && method !== 'GET') headers['if-match'] = etag;
    const response = await this.fetchImpl(pathUrl(this.databaseUrl, path, query), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 412) return { status: response.status, body: null, etag: response.headers.get('etag') };
    if (!response.ok) throw redactedResponseError(response.status);
    let parsed = null;
    const text = await response.text();
    if (text.trim()) {
      try { parsed = JSON.parse(text); } catch { throw redactedResponseError(502); }
    }
    return { status: response.status, body: parsed, etag: response.headers.get('etag') };
  }

  async readWithEtag(path) {
    const result = await this.request(path, { etag: true });
    if (!result.etag) {
      const error = new Error('firebase_operator_missing_etag');
      error.code = 'firebase_operator_missing_etag';
      throw error;
    }
    return { data: result.body, etag: result.etag };
  }

  async writeIfMatch(path, value, etag) {
    const result = await this.request(path, { method: 'PUT', body: value, etag });
    return result.status !== 412;
  }

  async deleteIfMatch(path, etag, guard = undefined) {
    if (guard?.path) {
      const currentGuard = await this.readWithEtag(guard.path);
      if (currentGuard.etag !== guard.etag) return false;
    }
    const result = await this.request(path, { method: 'DELETE', etag });
    return result.status !== 412;
  }

  async readBatch({ after = null, limit }) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) {
      const error = new Error('migration_batch_size_invalid');
      error.code = 'migration_batch_size_invalid';
      throw error;
    }
    const params = new URLSearchParams({
      orderBy: JSON.stringify('$key'),
      limitToFirst: String(limit + 1),
    });
    if (after !== null) params.set('startAt', JSON.stringify(after));
    const result = await this.request(NOTIFICATION_ROOT_PATH, { query: params.toString() });
    const entries = isRecord(result.body) ? Object.entries(result.body) : [];
    return entries
      .sort(([left], [right]) => compareFirebaseKeys(left, right))
      .filter(([key]) => after === null || compareFirebaseKeys(key, after) > 0)
      .slice(0, limit)
      .map(([key, value]) => ({ key, value }));
  }
}

const sourcePath = (key) => `${NOTIFICATION_ROOT_PATH}/${key}`;
const destinationPath = (recipientId, key) => `${NOTIFICATION_ROOT_PATH}/${recipientId}/${key}`;

const destinationParentCollides = async ({ store, key, classification }) => {
  if (!classification.recipientId) return false;
  if (classification.recipientId === key) return true;
  const parent = await store.readWithEtag(sourcePath(classification.recipientId));
  return parent.data !== null && !looksLikePerUserContainer(parent.data);
};

const pathCollisionResult = (classification) => {
  const delta = increment(increment({}, 'conflicts'), 'sourceRetained');
  return {
    classification: {
      ...classification,
      kind: 'path-collision',
      reason: 'destination-parent-collision',
      sourceRetained: true,
    },
    delta: classification.kind === 'malformed' ? increment(delta, 'malformed') : delta,
  };
};

const sameSourceSnapshot = (left, right) => (
  left.etag === right.etag && stable(left.data) === stable(right.data)
);

const sourceChangedError = () => {
  const error = new Error('notification_source_changed_during_migration');
  error.code = 'notification_source_changed_during_migration';
  return error;
};

const cleanupCreatedDestination = async ({ store, path, etag }) => {
  try {
    return await store.deleteIfMatch(path, etag);
  } catch {
    return false;
  }
};

const increment = (delta, key) => ({ ...delta, [key]: (delta[key] ?? 0) + 1 });

const perUserContainerCounts = async ({ store, value }) => {
  const rows = isRecord(value) ? Object.entries(value) : [];
  let untouched = rows.length === 0 ? 1 : 0;
  let malformed = 0;
  for (const [key, row] of rows) {
    if (validPerUserRow(key, row)) {
      untouched += 1;
      continue;
    }
    const source = await store.readWithEtag(sourcePath(key));
    const sourceClassification = source.data === null ? null : classifyNotificationEntry(key, source.data);
    if (sourceClassification?.kind === 'malformed'
      && sourceClassification.destination
      && notificationSemantic(row) === notificationSemantic(sourceClassification.destination)) {
      // This is the compatibility projection of a malformed flat source that
      // was intentionally retained; count the source once, not both copies.
      untouched += 1;
    } else {
      malformed += 1;
    }
  }
  return { untouched, malformed };
};

const copyMalformedForCompatibility = async ({ store, classification, source }) => {
  if (!classification.destination || !classification.recipientId) {
    return { classification: { ...classification, sourceRetained: true }, delta: increment(increment({}, 'malformed'), 'sourceRetained') };
  }
  if (source.data === null) return { classification: { ...classification, kind: 'source-gone' }, delta: increment({}, 'malformed') };
  const latestSource = await store.readWithEtag(sourcePath(classification.key));
  if (latestSource.data === null) {
    return { classification: { ...classification, kind: 'source-gone' }, delta: increment({}, 'malformed') };
  }
  if (latestSource.etag !== source.etag || stable(latestSource.data) !== stable(source.data)) {
    throw sourceChangedError();
  }
  const target = destinationPath(classification.recipientId, classification.key);
  const current = await store.readWithEtag(target);
  if (current.data !== null) {
    if (notificationSemantic(current.data) !== notificationSemantic(classification.destination)) {
      return {
        classification: { ...classification, kind: 'conflict', sourceRetained: true },
        delta: increment(increment(increment({}, 'malformed'), 'conflicts'), 'sourceRetained'),
      };
    }
    const sourceBeforeReplay = await store.readWithEtag(sourcePath(classification.key));
    if (!sameSourceSnapshot(sourceBeforeReplay, source)) throw sourceChangedError();
    return {
      classification: { ...classification, kind: 'malformed-replayed', sourceRetained: true },
      delta: increment(increment({}, 'malformed'), 'sourceRetained'),
    };
  }
  const sourceBeforeWrite = await store.readWithEtag(sourcePath(classification.key));
  if (sourceBeforeWrite.data === null) {
    return { classification: { ...classification, kind: 'source-gone' }, delta: increment({}, 'malformed') };
  }
  if (sourceBeforeWrite.etag !== source.etag || stable(sourceBeforeWrite.data) !== stable(source.data)) {
    throw sourceChangedError();
  }
  if (!(await store.writeIfMatch(target, classification.destination, current.etag))) {
    return {
      classification: { ...classification, kind: 'error', sourceRetained: true },
      delta: increment(increment(increment({}, 'malformed'), 'sourceRetained'), 'errors'),
    };
  }
  const verified = await store.readWithEtag(target);
  if (verified.data === null || notificationSemantic(verified.data) !== notificationSemantic(classification.destination)) {
    return {
      classification: { ...classification, kind: 'error', sourceRetained: true },
      delta: increment(increment(increment({}, 'malformed'), 'sourceRetained'), 'errors'),
    };
  }
  const sourceAfterWrite = await store.readWithEtag(sourcePath(classification.key));
  if (!sameSourceSnapshot(sourceAfterWrite, source)) {
    await cleanupCreatedDestination({ store, path: target, etag: verified.etag });
    throw sourceChangedError();
  }
  return {
    classification: { ...classification, kind: 'malformed-copied', sourceRetained: true },
    delta: increment(increment({}, 'malformed'), 'sourceRetained'),
  };
};

const processEntry = async ({ store, entry }) => {
  const source = await store.readWithEtag(sourcePath(entry.key));
  if (source.data === null) {
    return {
      classification: { kind: 'source-gone', key: entry.key },
      delta: increment({}, 'untouched'),
    };
  }
  const classification = classifyNotificationEntry(entry.key, source.data);
  if (classification.kind === 'per-user-container') {
    return { classification, delta: await perUserContainerCounts({ store, value: source.data }) };
  }
  if (await destinationParentCollides({ store, key: entry.key, classification })) {
    return pathCollisionResult(classification);
  }
  if (classification.kind === 'malformed') return copyMalformedForCompatibility({ store, classification, source });

  const expected = classification.destination;
  const target = destinationPath(classification.recipientId, entry.key);
  const sourceBeforeDestination = await store.readWithEtag(sourcePath(entry.key));
  if (!sameSourceSnapshot(sourceBeforeDestination, source)) throw sourceChangedError();
  let destinationStatus = 'created';
  let destinationReady = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.readWithEtag(target);
    if (current.data !== null) {
      if (notificationSemantic(current.data) !== notificationSemantic(expected)) {
        return {
          classification: { ...classification, kind: 'conflict' },
          delta: increment(increment({}, 'conflicts'), 'sourceRetained'),
        };
      }
      destinationStatus = 'replayed';
      destinationReady = true;
      break;
    }
    if (await store.writeIfMatch(target, expected, current.etag)) {
      const verified = await store.readWithEtag(target);
      if (verified.data === null || notificationSemantic(verified.data) !== notificationSemantic(expected)) {
        return {
          classification: { ...classification, kind: 'conflict' },
          delta: increment(increment({}, 'conflicts'), 'sourceRetained'),
        };
      }
      destinationReady = true;
      break;
    }
  }
  if (!destinationReady) {
    return {
      classification: { ...classification, kind: 'error', sourceRetained: true },
      delta: increment(increment({}, 'errors'), 'sourceRetained'),
    };
  }
  const destinationGuard = await store.readWithEtag(target);
  if (destinationGuard.data === null || notificationSemantic(destinationGuard.data) !== notificationSemantic(expected)) {
    return {
      classification: { ...classification, kind: 'conflict', sourceRetained: true },
      delta: increment(increment({}, 'conflicts'), 'sourceRetained'),
    };
  }
  const sourceBeforeDelete = await store.readWithEtag(sourcePath(entry.key));
  if (!sameSourceSnapshot(sourceBeforeDelete, source)) {
    if (destinationStatus === 'created') {
      await cleanupCreatedDestination({ store, path: target, etag: destinationGuard.etag });
    }
    throw sourceChangedError();
  }
  const deleted = await store.deleteIfMatch(sourcePath(entry.key), source.etag, {
    path: target,
    etag: destinationGuard.etag,
  });
  if (!deleted) {
    const sourceAfterFailedDelete = await store.readWithEtag(sourcePath(entry.key));
    if (!sameSourceSnapshot(sourceAfterFailedDelete, source)) {
      if (destinationStatus === 'created') {
        await cleanupCreatedDestination({ store, path: target, etag: destinationGuard.etag });
      }
      throw sourceChangedError();
    }
    const destinationAfterDeleteRace = await store.readWithEtag(target);
    if (destinationAfterDeleteRace.data === null
      || notificationSemantic(destinationAfterDeleteRace.data) !== notificationSemantic(expected)) {
      return {
        classification: { ...classification, kind: 'conflict', sourceRetained: true },
        delta: increment(increment({}, 'conflicts'), 'sourceRetained'),
      };
    }
    return {
      classification: { ...classification, kind: destinationStatus, sourceRetained: true },
      delta: increment(increment({}, destinationStatus === 'replayed' ? 'replayed' : 'migrated'), 'sourceRetained'),
    };
  }
  const sourceAfterDelete = await store.readWithEtag(sourcePath(entry.key));
  if (sourceAfterDelete.data !== null) {
    if (destinationStatus === 'created') {
      await cleanupCreatedDestination({ store, path: target, etag: destinationGuard.etag });
    }
    throw sourceChangedError();
  }
  return {
    classification: { ...classification, kind: destinationStatus, sourceRetained: false },
    delta: increment({}, destinationStatus === 'replayed' ? 'replayed' : 'migrated'),
  };
};

const validateBatchSize = (batchSize) => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    const error = new Error('migration_batch_size_invalid');
    error.code = 'migration_batch_size_invalid';
    throw error;
  }
};

const newCheckpoint = async ({ repo, batchSize, now }) => createCheckpoint({
  projectId: repo.projectId,
  operatorFingerprint: repo.operatorFingerprint,
  batchSize,
  updatedAt: now(),
});

export const createNotificationMigrationRunner = ({ store, checkpointRepository: repo, now = () => new Date().toISOString() }) => {
  if (!store || typeof store.readBatch !== 'function') throw new Error('migration_store_invalid');
  if (!repo || typeof repo.load !== 'function' || typeof repo.save !== 'function') throw new Error('migration_checkpoint_repository_invalid');

  const execute = async ({ batchSize = 100, replay = false } = {}) => {
    validateBatchSize(batchSize);
    const loaded = await repo.load();
    let checkpoint = loaded.data;
    let etag = loaded.etag;
    if (checkpoint?.status === 'paused') return { status: 'paused', checkpoint, runCounts: zeroCounts() };
    if (checkpoint?.status === 'complete' && !replay) return { status: 'complete', checkpoint, runCounts: zeroCounts() };
    if (checkpoint && checkpoint.batchSize !== batchSize) {
      const error = new Error('checkpoint_batch_size_mismatch');
      error.code = 'checkpoint_batch_size_mismatch';
      throw error;
    }
    if (!checkpoint) {
      checkpoint = await newCheckpoint({ repo, batchSize, now });
      const created = await repo.save(checkpoint, etag);
      if (!created.written) return execute({ batchSize, replay });
      checkpoint = created.checkpoint;
      etag = created.etag;
    }

    const replayFromStart = replay && checkpoint.status === 'complete';
    const cursor = replayFromStart || checkpoint.lastKey === CHECKPOINT_START_CURSOR
      ? null
      : checkpoint.lastKey;
    const entries = await store.readBatch({ after: cursor, limit: batchSize });
    const runCounts = zeroCounts();
    let lastKey = replayFromStart ? CHECKPOINT_START_CURSOR : checkpoint.lastKey;
    const nextBatchNumber = checkpoint.batchNumber + 1;
    for (const entry of entries) {
      const processed = await processEntry({ store, entry });
      lastKey = entry.key;
      processed.delta.scanned = 1;
      for (const key of countKeys) runCounts[key] += processed.delta[key] ?? 0;
      const next = createCheckpoint({
        ...checkpoint,
        status: 'active',
        batchSize,
        lastKey,
        batchNumber: nextBatchNumber,
        counts: addCounts(checkpoint.counts, processed.delta),
        updatedAt: now(),
      });
      const saved = await repo.save(next, etag);
      if (!saved.written) {
        const error = new Error('checkpoint_cas_conflict');
        error.code = 'checkpoint_cas_conflict';
        throw error;
      }
      checkpoint = saved.checkpoint;
      etag = saved.etag;
    }

    const done = entries.length < batchSize;
    const finalCheckpoint = createCheckpoint({
      ...checkpoint,
      status: done ? 'complete' : 'active',
      batchSize,
      lastKey,
      batchNumber: entries.length === 0 ? nextBatchNumber : checkpoint.batchNumber,
      updatedAt: now(),
    });
    const saved = await repo.save(finalCheckpoint, etag);
    if (!saved.written) {
      const error = new Error('checkpoint_cas_conflict');
      error.code = 'checkpoint_cas_conflict';
      throw error;
    }
    return { status: saved.checkpoint.status, checkpoint: saved.checkpoint, runCounts };
  };

  const dryRun = async ({ batchSize = 100, after = null } = {}) => {
    validateBatchSize(batchSize);
    const entries = await store.readBatch({ after, limit: batchSize });
    const counts = zeroCounts();
    const planned = [];
    for (const entry of entries) {
      const classification = classifyNotificationEntry(entry.key, entry.value);
      counts.scanned += 1;
      if ((classification.kind === 'legacy' || classification.kind === 'malformed')
        && await destinationParentCollides({ store, key: entry.key, classification })) {
        counts.conflicts += 1;
        counts.sourceRetained += 1;
        if (classification.kind === 'malformed') counts.malformed += 1;
        planned.push({ keyDigest: await sha256Hex(entry.key), action: 'report-destination-parent-collision' });
        continue;
      }
      if (classification.kind === 'legacy') {
        counts.migrated += 1;
        planned.push({ keyDigest: await sha256Hex(entry.key), action: 'copy-and-remove-source' });
      } else if (classification.kind === 'per-user-container') {
        const nested = await perUserContainerCounts({ store, value: entry.value });
        counts.untouched += nested.untouched;
        counts.malformed += nested.malformed;
      } else {
        counts.malformed += 1;
        counts.sourceRetained += 1;
        if (classification.destination && classification.recipientId) {
          planned.push({ keyDigest: await sha256Hex(entry.key), action: 'copy-and-retain-source' });
        }
      }
    }
    return { status: 'dry-run', counts, planned, lastKey: entries.at(-1)?.key ?? after, hasMore: entries.length === batchSize };
  };

  const reconcile = async ({ batchSize = 100 } = {}) => {
    validateBatchSize(batchSize);
    const counts = zeroCounts();
    let cursor = null;
    let batches = 0;
    for (;;) {
      const entries = await store.readBatch({ after: cursor, limit: batchSize });
      if (entries.length === 0) break;
      batches += 1;
      for (const entry of entries) {
        counts.scanned += 1;
        const classification = classifyNotificationEntry(entry.key, entry.value);
        if (classification.kind === 'per-user-container') {
          const nested = await perUserContainerCounts({ store, value: entry.value });
          counts.untouched += nested.untouched;
          counts.malformed += nested.malformed;
        } else if ((classification.kind === 'legacy' || classification.kind === 'malformed')
          && await destinationParentCollides({ store, key: entry.key, classification })) {
          counts.conflicts += 1;
          counts.sourceRetained += 1;
          if (classification.kind === 'malformed') counts.malformed += 1;
        } else if (classification.kind === 'malformed') {
          counts.malformed += 1;
          counts.sourceRetained += 1;
          if (classification.destination && classification.recipientId) {
            const target = await store.readWithEtag(destinationPath(classification.recipientId, entry.key));
            if (target.data !== null && notificationSemantic(target.data) === notificationSemantic(classification.destination)) {
              counts.replayed += 1;
            } else if (target.data === null) {
              counts.errors += 1;
            } else {
              counts.conflicts += 1;
            }
          }
        } else {
          const target = await store.readWithEtag(destinationPath(classification.recipientId, entry.key));
          if (target.data !== null && notificationSemantic(target.data) === notificationSemantic(classification.destination)) {
            counts.replayed += 1;
            counts.sourceRetained += 1;
          } else if (target.data === null) {
            counts.errors += 1;
            counts.sourceRetained += 1;
          } else {
            counts.conflicts += 1;
            counts.sourceRetained += 1;
          }
        }
        cursor = entry.key;
      }
      if (entries.length < batchSize) break;
    }
    return { status: 'reconciled', counts, batches, cursorDigest: cursor ? await sha256Hex(cursor) : null };
  };

  const rollback = async () => {
    const loaded = await repo.load();
    const checkpoint = loaded.data ?? await newCheckpoint({ repo, batchSize: 100, now });
    const next = createCheckpoint({ ...checkpoint, status: 'paused', updatedAt: now() });
    const saved = await repo.save(next, loaded.etag);
    if (!saved.written) {
      const error = new Error('checkpoint_cas_conflict');
      error.code = 'checkpoint_cas_conflict';
      throw error;
    }
    return { status: 'paused', checkpoint: saved.checkpoint };
  };

  return Object.freeze({ execute, dryRun, reconcile, rollback });
};

export const redactText = (value) => String(value)
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [redacted]')
  .replace(/auth=[^&\s"]+/giu, 'auth=[redacted]')
  .replace(/AIza[0-9A-Za-z_-]+/gu, '[redacted-api-key]')
  .replace(/(?:sk|gsk)-[A-Za-z0-9_-]+/gu, '[redacted-api-key]')
  .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/gu, '[redacted-private-key]')
  .replace(/[A-Za-z0-9._~+/=-]{80,}/gu, '[redacted-token]');

export const redactError = (error) => ({
  code: typeof error?.code === 'string' ? redactText(error.code) : 'migration_failed',
  message: redactText(error instanceof Error ? error.message : 'migration_failed'),
});

export const reportForOperator = async (result) => {
  const report = { status: result.status };
  if (result.runCounts) report.runCounts = result.runCounts;
  if (result.counts) report.counts = result.counts;
  if (result.batches !== undefined) report.batches = result.batches;
  if (result.hasMore !== undefined) report.hasMore = result.hasMore;
  if (result.planned) {
    report.plannedCount = result.planned.length;
    report.planned = result.planned;
  }
  if (result.lastKey !== undefined) report.cursorDigest = result.lastKey ? await sha256Hex(result.lastKey) : null;
  if (result.cursorDigest !== undefined) report.cursorDigest = result.cursorDigest;
  if (result.checkpoint) {
    report.cursorDigest = result.checkpoint.lastKey
      ? await sha256Hex(result.checkpoint.lastKey)
      : null;
    report.checkpoint = {
      status: result.checkpoint.status,
      batchNumber: result.checkpoint.batchNumber,
      batchSize: result.checkpoint.batchSize,
      counts: result.checkpoint.counts,
      updatedAt: result.checkpoint.updatedAt,
      checkpointPath: CHECKPOINT_PATH,
    };
  }
  return report;
};
