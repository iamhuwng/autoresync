import { SignJWT, importPKCS8 } from 'jose';
import type {
  ListeningUploadAssetReference,
  ListeningUploadCleanupLease,
  ListeningDeletedTempAssetTombstone,
  ListeningUploadAssetRecord,
  ListeningUploadSessionMetricRecord,
  ListeningUploadSessionRecord,
  ListeningUploadSessionRepository,
  ListeningUploadSessionSweepCandidate,
  ListeningUploadSessionSweepCheckpoint,
  ListeningUploadSessionSweepCursor,
  ListeningUploadSessionSweepPage,
  ListeningUploadSessionSweepRecord,
} from './listening-upload-session-types.ts';

const OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 5;
const SWEEP_CHECKPOINT_ID = 'listening-temp-upload-session-checkpoint';
const DEFAULT_SWEEP_LEASE_MS = 55 * 60 * 1000;
const SYSTEM_FLAGS_PATH = 'system_flags';
const AUTHORING_ROOT_PATH = 'listening_authoring';
const MEDIA_MUTATION_LEASE_FIELD = 'listening_media_mutation_lease';
const AUTHORING_CLEANUP_LEASE_FIELD = 'temp_cleanup_lease';

interface ServiceAccountKey { client_email: string; private_key: string }
interface TokenResponse { access_token: string; expires_in: number }
interface RepositoryEnv { FIREBASE_DB_URL?: string; GOOGLE_SA_KEY?: string }

class TokenCache {
  private cachedToken: string | null = null;
  private expiresAt = 0;
  constructor(private readonly saKeyJson: string, private readonly fetchImpl: typeof fetch) {}
  async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.expiresAt - REFRESH_BUFFER_MS) return this.cachedToken;
    let serviceAccount: ServiceAccountKey;
    try { serviceAccount = JSON.parse(this.saKeyJson) as ServiceAccountKey; } catch { throw new Error('invalid_google_sa_key'); }
    if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error('invalid_google_sa_key');
    const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      iss: serviceAccount.client_email, sub: serviceAccount.client_email, aud: OAUTH2_TOKEN_URL,
      iat: now, exp: now + 3600, scope: FIREBASE_SCOPES,
    }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
    const response = await this.fetchImpl(OAUTH2_TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`google_oauth_failed:${response.status}:${body}`);
    const token = JSON.parse(body) as TokenResponse;
    if (typeof token.access_token !== 'string' || token.access_token === '') throw new Error('google_oauth_failed:invalid_response');
    this.cachedToken = token.access_token;
    this.expiresAt = Date.now() + Math.max(0, (token.expires_in || 3600) * 1000);
    return this.cachedToken;
  }
}

const parseJsonBody = (value: string): unknown => {
  if (!value.trim()) return null;
  try { return JSON.parse(value); } catch { return value; }
};
const firebaseErrorMessage = (body: unknown): string => body && typeof body === 'object' && 'error' in body
  ? String((body as { error?: unknown }).error) : String(body ?? 'unknown_firebase_error');
const encodeRtdbPath = (path: string): string => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const rtdbUrl = (env: RepositoryEnv, path: string): string => {
  const baseUrl = env.FIREBASE_DB_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) throw new Error('missing_firebase_db_url');
  const encodedPath = encodeRtdbPath(path);
  return encodedPath ? `${baseUrl}/${encodedPath}.json` : `${baseUrl}/.json`;
};
const asSessionRecord = (value: unknown): ListeningUploadSessionRecord | null => value && typeof value === 'object' && !Array.isArray(value) ? value as ListeningUploadSessionRecord : null;
const normalizeOwnerSessions = (value: unknown): Record<string, ListeningUploadSessionRecord> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, ListeningUploadSessionRecord> : {};
const findByCreationHash = (sessions: Record<string, ListeningUploadSessionRecord>, hash: string): ListeningUploadSessionRecord | null => Object.values(sessions).find((session) => session.creationRequestIdHash === hash) ?? null;
const hasRetainedReference = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((entry) => entry === true || (entry !== null && typeof entry === 'object' && hasRetainedReference(entry)));
};
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const authoringRecordReferencesAsset = (
  value: unknown,
  ownerId: string,
  assetId: string,
): boolean => {
  if (!isPlainRecord(value) || value.ownerId !== ownerId) return false;
  if (isPlainRecord(value.assetIds) && value.assetIds[assetId] === true) return true;
  if (!isPlainRecord(value.document) || !Array.isArray(value.document.audioSections)) return false;
  return value.document.audioSections.some((section) =>
    isPlainRecord(section) && section.assetId === assetId);
};
const findAuthoringAssetReference = (
  value: unknown,
  ownerId: string,
  assetId: string,
): string | null => {
  if (!isPlainRecord(value)) return null;
  for (const collection of ['drafts', 'revision_drafts', 'versions'] as const) {
    const records = value[collection];
    if (!isPlainRecord(records)) continue;
    for (const [recordId, record] of Object.entries(records)) {
      if (authoringRecordReferencesAsset(record, ownerId, assetId)) {
        return `listening_authoring/${collection}/${recordId}`;
      }
    }
  }
  return null;
};
const activeLease = (value: unknown, now: number): Record<string, unknown> | null =>
  isPlainRecord(value) && Number(value.expiresAt) > now ? value : null;
const cursorAfter = (ownerId: string, sessionId: string, cursor: ListeningUploadSessionSweepCursor | undefined): boolean => {
  if (!cursor?.ownerId) return true;
  if (ownerId > cursor.ownerId) return true;
  if (ownerId < cursor.ownerId) return false;
  return !cursor.uploadSessionId || sessionId > cursor.uploadSessionId;
};

export class FirebaseRestListeningUploadSessionRepository implements ListeningUploadSessionRepository {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly tokenCache?: TokenCache;
  constructor(private readonly options: { env: RepositoryEnv; fetchImpl?: typeof fetch; getAccessToken?: () => Promise<string>; maxRetries?: number }) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const saKey = options.env.GOOGLE_SA_KEY?.trim();
    if (saKey) this.tokenCache = new TokenCache(saKey, this.fetchImpl);
  }
  private async accessToken(): Promise<string> {
    if (this.options.getAccessToken) return this.options.getAccessToken();
    if (!this.options.env.GOOGLE_SA_KEY?.trim() || !this.tokenCache) throw new Error('missing_google_sa_key');
    return this.tokenCache.getToken();
  }
  private async readWithEtag<T>(path: string): Promise<{ data: T; etag: string }> {
    const response = await this.fetchImpl(rtdbUrl(this.options.env, path), { method: 'GET', headers: { Authorization: `Bearer ${await this.accessToken()}`, 'X-Firebase-ETag': 'true' } });
    const body = parseJsonBody(await response.text());
    if (!response.ok) throw new Error(`firebase_rtdb_get_failed:${path || '/'}:${response.status}:${firebaseErrorMessage(body)}`);
    const etag = response.headers.get('etag');
    if (!etag) throw new Error(`missing_firebase_etag:${path || '/'}`);
    return { data: body as T, etag };
  }
  private async readPath<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(rtdbUrl(this.options.env, path), { method: 'GET', headers: { Authorization: `Bearer ${await this.accessToken()}` } });
    const body = parseJsonBody(await response.text());
    if (!response.ok) throw new Error(`firebase_rtdb_get_failed:${path || '/'}:${response.status}:${firebaseErrorMessage(body)}`);
    return body as T;
  }
  private async writeIfMatch<T>(path: string, value: unknown, etag: string): Promise<{ matched: boolean; data?: T }> {
    const response = await this.fetchImpl(rtdbUrl(this.options.env, path), { method: 'PUT', headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(value) });
    if (response.status === 412) return { matched: false };
    const body = parseJsonBody(await response.text());
    if (!response.ok) throw new Error(`firebase_rtdb_put_failed:${path || '/'}:${response.status}:${firebaseErrorMessage(body)}`);
    return { matched: true, data: body as T };
  }
  private async writePath(path: string, value: unknown): Promise<void> {
    const response = await this.fetchImpl(rtdbUrl(this.options.env, path), { method: 'PUT', headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const body = parseJsonBody(await response.text());
    if (!response.ok) throw new Error(`firebase_rtdb_put_failed:${path || '/'}:${response.status}:${firebaseErrorMessage(body)}`);
  }
  private ownerPath(ownerId: string): string { return `media_asset_upload_sessions/${ownerId}`; }
  private sessionPath(ownerId: string, id: string): string { return `${this.ownerPath(ownerId)}/${id}`; }

  async findByCreationRequest(ownerId: string, hash: string): Promise<ListeningUploadSessionRecord | null> {
    const { data } = await this.readWithEtag<Record<string, ListeningUploadSessionRecord> | null>(this.ownerPath(ownerId));
    return findByCreationHash(normalizeOwnerSessions(data), hash);
  }
  async create(record: ListeningUploadSessionRecord): Promise<ListeningUploadSessionRecord> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<Record<string, ListeningUploadSessionRecord> | null>(this.ownerPath(record.ownerId));
      const sessions = normalizeOwnerSessions(current.data);
      const existing = findByCreationHash(sessions, record.creationRequestIdHash);
      if (existing) return existing;
      const write = await this.writeIfMatch<Record<string, ListeningUploadSessionRecord>>(this.ownerPath(record.ownerId), { ...sessions, [record.uploadSessionId]: record }, current.etag);
      if (!write.matched) continue;
      const saved = findByCreationHash(normalizeOwnerSessions(write.data), record.creationRequestIdHash);
      if (saved) return saved;
    }
    const existing = await this.findByCreationRequest(record.ownerId, record.creationRequestIdHash);
    if (existing) return existing;
    throw new Error('bootstrap_write_failed');
  }
  async get(ownerId: string, id: string): Promise<ListeningUploadSessionRecord | null> {
    const { data } = await this.readWithEtag<ListeningUploadSessionRecord | null>(this.sessionPath(ownerId, id));
    return asSessionRecord(data);
  }
  async issueAsset(input: { ownerId: string; uploadSessionId: string; assetRequestIdHash: string; asset: ListeningUploadAssetRecord }): Promise<{ session: ListeningUploadSessionRecord; asset: ListeningUploadAssetRecord } | null> {
    const path = this.sessionPath(input.ownerId, input.uploadSessionId);
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<ListeningUploadSessionRecord | null>(path);
      const session = asSessionRecord(current.data);
      if (!session || session.ownerId !== input.ownerId || session.uploadSessionId !== input.uploadSessionId || session.status !== 'active') return null;
      const existing = session.assetRequests?.[input.assetRequestIdHash];
      if (existing) return { session, asset: existing };
      const nextSession: ListeningUploadSessionRecord = { ...session, lastGrantIssuedAt: input.asset.issuedAt, assetIds: { ...(session.assetIds ?? {}), [input.asset.assetId]: true as const }, assetRequests: { ...(session.assetRequests ?? {}), [input.assetRequestIdHash]: input.asset } };
      const write = await this.writeIfMatch<ListeningUploadSessionRecord>(path, nextSession, current.etag);
      if (!write.matched) continue;
      const saved = asSessionRecord(write.data) ?? nextSession;
      const asset = saved.assetRequests?.[input.assetRequestIdHash];
      if (asset) return { session: saved, asset };
    }
    const session = await this.get(input.ownerId, input.uploadSessionId);
    if (!session || session.status !== 'active') return null;
    const asset = session.assetRequests?.[input.assetRequestIdHash];
    return asset ? { session, asset } : null;
  }
  async findDurableAssetReferences(input: { ownerId: string; uploadSessionId?: string; assetIds: readonly string[]; tempKeys: readonly string[] }): Promise<ListeningUploadAssetReference[]> {
    const references: ListeningUploadAssetReference[] = [];
    // Draft/version records remain durable references while the current
    // commit adapter retains bytes under the canonical temporary key.
    const authoringRoot = await this.readPath<unknown>('listening_authoring');
    for (let index = 0; index < input.assetIds.length; index += 1) {
      const assetId = input.assetIds[index];
      const value = await this.readPath<unknown>(`media_assets/${assetId}`);
      if (value !== null) {
        if (!isPlainRecord(value)) { references.push({ assetId, source: `media_assets/${assetId}`, kind: 'unknown' }); continue; }
        const record = value;
        if (record.ownerId !== input.ownerId || (input.uploadSessionId !== undefined && record.uploadSessionId !== input.uploadSessionId) || record.tempKey !== input.tempKeys[index]) { references.push({ assetId, source: `media_assets/${assetId}`, kind: 'unknown' }); continue; }
        if (record.state === 'committing' || record.state === 'committed' || record.state === 'pending-delete') references.push({ assetId, source: `media_assets/${assetId}`, kind: 'registry' });
        else if (record.state !== 'temp' || !Object.prototype.hasOwnProperty.call(record, 'references') || !record.references || typeof record.references !== 'object' || Array.isArray(record.references) || hasRetainedReference(record.references)) references.push({ assetId, source: `media_assets/${assetId}`, kind: record.state === 'temp' ? 'reference' : 'unknown' });
      }
      if (!references.some((reference) => reference.assetId === assetId)) {
        const source = findAuthoringAssetReference(authoringRoot, input.ownerId, assetId);
        if (source) references.push({ assetId, source, kind: 'reference' });
      }
    }
    return references;
  }
  async isRestoreInProgress(): Promise<boolean> {
    const value = await this.readPath<unknown>('system_flags/restore_in_progress');
    return value === true || (isPlainRecord(value) && value.active === true);
  }
  async acquireCleanupLease(input: { ownerId: string; uploadSessionId: string; assetId: string; leaseId: string; now: number; leaseMs: number }): Promise<ListeningUploadCleanupLease | null> {
    const lease: ListeningUploadCleanupLease = {
      schemaVersion: 1,
      leaseId: input.leaseId,
      kind: 'listening-temp-cleanup',
      ownerId: input.ownerId,
      uploadSessionId: input.uploadSessionId,
      assetId: input.assetId,
      claimedAt: input.now,
      expiresAt: input.now + input.leaseMs,
    };
    let systemLeaseAcquired = false;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<Record<string, unknown> | null>(SYSTEM_FLAGS_PATH);
      const flags = isPlainRecord(current.data) ? current.data : {};
      const restore = flags.restore_in_progress;
      if (restore === true || (isPlainRecord(restore) && restore.active === true)) return null;
      const existing = activeLease(flags[MEDIA_MUTATION_LEASE_FIELD], input.now);
      if (existing && existing.leaseId !== input.leaseId) return null;
      const write = await this.writeIfMatch<Record<string, unknown>>(
        SYSTEM_FLAGS_PATH,
        { ...flags, [MEDIA_MUTATION_LEASE_FIELD]: lease },
        current.etag,
      );
      if (!write.matched) continue;
      systemLeaseAcquired = true;
      break;
    }
    if (!systemLeaseAcquired) return null;

    let authoringLeaseAcquired = false;
    try {
      for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
        const current = await this.readWithEtag<Record<string, unknown> | null>(AUTHORING_ROOT_PATH);
        const root = isPlainRecord(current.data) ? current.data : {};
        const existing = activeLease(root[AUTHORING_CLEANUP_LEASE_FIELD], input.now);
        if (existing && existing.leaseId !== input.leaseId) return null;
        const write = await this.writeIfMatch<Record<string, unknown>>(
          AUTHORING_ROOT_PATH,
          { ...root, [AUTHORING_CLEANUP_LEASE_FIELD]: lease },
          current.etag,
        );
        if (write.matched) {
          authoringLeaseAcquired = true;
          return lease;
        }
      }
      return null;
    } finally {
      // A successful authoring lease is released by the caller. If acquisition
      // failed, do not leave the system-wide restore exclusion stranded.
      if (!authoringLeaseAcquired) await this.releaseSystemCleanupLease(lease);
    }
  }
  private async releaseSystemCleanupLease(lease: ListeningUploadCleanupLease): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<Record<string, unknown> | null>(SYSTEM_FLAGS_PATH);
      const flags = isPlainRecord(current.data) ? current.data : {};
      const existing = flags[MEDIA_MUTATION_LEASE_FIELD];
      if (!isPlainRecord(existing) || existing.leaseId !== lease.leaseId) return;
      const next = { ...flags };
      delete next[MEDIA_MUTATION_LEASE_FIELD];
      const write = await this.writeIfMatch<Record<string, unknown>>(SYSTEM_FLAGS_PATH, next, current.etag);
      if (write.matched) return;
    }
    throw new Error('cleanup_system_lease_release_failed');
  }
  async releaseCleanupLease(lease: ListeningUploadCleanupLease): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<Record<string, unknown> | null>(AUTHORING_ROOT_PATH);
      const root = isPlainRecord(current.data) ? current.data : {};
      const existing = root[AUTHORING_CLEANUP_LEASE_FIELD];
      if (!isPlainRecord(existing) || existing.leaseId !== lease.leaseId) break;
      const next = { ...root };
      delete next[AUTHORING_CLEANUP_LEASE_FIELD];
      const write = await this.writeIfMatch<Record<string, unknown>>(AUTHORING_ROOT_PATH, next, current.etag);
      if (write.matched) break;
      if (attempt === this.maxRetries - 1) throw new Error('cleanup_authoring_lease_release_failed');
    }
    await this.releaseSystemCleanupLease(lease);
  }
  async assertCleanupLeaseOwned(lease: ListeningUploadCleanupLease, now: number): Promise<boolean> {
    const [system, authoring] = await Promise.all([
      this.readPath<Record<string, unknown> | null>(SYSTEM_FLAGS_PATH),
      this.readPath<Record<string, unknown> | null>(AUTHORING_ROOT_PATH),
    ]);
    const systemLease = isPlainRecord(system) ? system[MEDIA_MUTATION_LEASE_FIELD] : null;
    const authoringLease = isPlainRecord(authoring) ? authoring[AUTHORING_CLEANUP_LEASE_FIELD] : null;
    return isPlainRecord(systemLease)
      && isPlainRecord(authoringLease)
      && systemLease.leaseId === lease.leaseId
      && authoringLease.leaseId === lease.leaseId
      && Number(systemLease.expiresAt) > now
      && Number(authoringLease.expiresAt) > now;
  }
  async recordDeletedTempAsset(input: {
    lease: ListeningUploadCleanupLease;
    tempKey: string;
    deletedAt: number;
    state: ListeningDeletedTempAssetTombstone['state'];
  }): Promise<void> {
    const tombstone: ListeningDeletedTempAssetTombstone = {
      schemaVersion: 1,
      assetId: input.lease.assetId,
      ownerId: input.lease.ownerId,
      uploadSessionId: input.lease.uploadSessionId,
      tempKey: input.tempKey,
      cleanupLeaseId: input.lease.leaseId,
      state: input.state,
      deletedAt: input.deletedAt,
    };
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<Record<string, unknown> | null>(AUTHORING_ROOT_PATH);
      const root = isPlainRecord(current.data) ? current.data : {};
      const existingLease = root[AUTHORING_CLEANUP_LEASE_FIELD];
      if (!isPlainRecord(existingLease)
        || existingLease.leaseId !== input.lease.leaseId
        || Number(existingLease.expiresAt) <= input.deletedAt) {
        throw new Error('cleanup_authoring_lease_lost');
      }
      const tombstones = isPlainRecord(root.deleted_temp_assets) ? root.deleted_temp_assets : {};
      const write = await this.writeIfMatch<Record<string, unknown>>(
        AUTHORING_ROOT_PATH,
        { ...root, deleted_temp_assets: { ...tombstones, [input.lease.assetId]: tombstone } },
        current.etag,
      );
      if (write.matched) return;
    }
    throw new Error('deleted_temp_asset_tombstone_write_failed');
  }
  async markCleanupState(input: { ownerId: string; uploadSessionId: string; status: 'abandoned' | 'cleanup-queued'; reason: string; cleanupQueuedAt: number; completedAt?: number; deletedAssetIds: readonly string[]; preservedAssetIds: readonly string[]; expectedStatuses?: readonly ('active' | 'cleanup-queued' | 'expired')[]; cleanupFence?: ListeningUploadSessionRecord['cleanupFence'] }): Promise<ListeningUploadSessionRecord | null> {
    const path = this.sessionPath(input.ownerId, input.uploadSessionId);
    const expectedStatuses = input.expectedStatuses ?? ['active', 'cleanup-queued'];
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<ListeningUploadSessionRecord | null>(path);
      const session = asSessionRecord(current.data);
      if (!session || session.ownerId !== input.ownerId || session.uploadSessionId !== input.uploadSessionId || !expectedStatuses.includes(session.status as 'active' | 'cleanup-queued' | 'expired')) return null;
      const preservedAssetIds: Record<string, true> = { ...(session.preservedAssetIds ?? {}), ...Object.fromEntries(input.preservedAssetIds.map((id) => [id, true as const])) };
      for (const assetId of input.deletedAssetIds) delete preservedAssetIds[assetId];
      const deletedAssetIds: Record<string, true> = { ...(session.deletedAssetIds ?? {}), ...Object.fromEntries(input.deletedAssetIds.map((id) => [id, true as const])) };
      const nextSession: ListeningUploadSessionRecord = { ...session, status: input.status, abandonmentReason: input.reason, cleanupQueuedAt: input.cleanupQueuedAt, ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}), deletedAssetIds, preservedAssetIds, ...(input.cleanupFence !== undefined ? { cleanupFence: input.cleanupFence } : {}) };
      const write = await this.writeIfMatch<ListeningUploadSessionRecord>(path, nextSession, current.etag);
      if (write.matched) return asSessionRecord(write.data) ?? nextSession;
    }
    return null;
  }
  async listExpiredCleanupCandidates(input: { now: number; notBeforeMs: number; maxOwners: number; maxSessions: number; cursor?: ListeningUploadSessionSweepCursor }): Promise<ListeningUploadSessionSweepPage> {
    if (!Number.isSafeInteger(input.notBeforeMs) || input.notBeforeMs <= 0) throw new Error('invalid_sweep_cutoff');
    const root = await this.readPath<Record<string, Record<string, ListeningUploadSessionRecord>> | null>('media_asset_upload_sessions');
    const candidates: ListeningUploadSessionSweepCandidate[] = [];
    if (!root || typeof root !== 'object' || Array.isArray(root)) return { candidates, hasMore: false };
    let ownersSeen = 0; let hasMore = false; let nextCursor: ListeningUploadSessionSweepCursor | undefined;
    let lastVisitedCursor = input.cursor;
    for (const ownerId of Object.keys(root).sort()) {
      const sessions = normalizeOwnerSessions(root[ownerId]); const ids = Object.keys(sessions).sort();
      if (!ids.some((id) => cursorAfter(ownerId, id, input.cursor))) continue;
      if (ownersSeen >= input.maxOwners) { hasMore = true; nextCursor = { ownerId, uploadSessionId: '' }; break; }
      ownersSeen += 1;
      for (const uploadSessionId of ids) {
        if (!cursorAfter(ownerId, uploadSessionId, input.cursor)) continue;
        if (candidates.length >= input.maxSessions) { hasMore = true; nextCursor = lastVisitedCursor; break; }
        const session = asSessionRecord(sessions[uploadSessionId]);
        lastVisitedCursor = { ownerId, uploadSessionId };
        if (!session || session.ownerId !== ownerId || session.uploadSessionId !== uploadSessionId || session.purpose !== 'listening-authoring' || (session.status !== 'active' && session.status !== 'cleanup-queued' && session.status !== 'expired')) continue;
        if (!Number.isSafeInteger(session.createdAt) || session.createdAt < input.notBeforeMs || !Number.isSafeInteger(session.maxEligibilityExpiresAt) || session.maxEligibilityExpiresAt > input.now) continue;
        candidates.push({ ownerId, uploadSessionId, status: session.status, createdAt: session.createdAt, expiresAt: session.expiresAt, maxEligibilityExpiresAt: session.maxEligibilityExpiresAt, assetCount: Object.keys(session.assetRequests ?? {}).length });
      }
      if (hasMore) break;
    }
    return { candidates, nextCursor, hasMore };
  }
  async readSweepCheckpoint(): Promise<ListeningUploadSessionSweepCheckpoint | null> { return this.readPath<ListeningUploadSessionSweepCheckpoint | null>(`media_asset_sweeps/${SWEEP_CHECKPOINT_ID}`); }
  async acquireSweepLease(input: { sweepId: string; now: number; leaseMs?: number; notBeforeMs: number }): Promise<ListeningUploadSessionSweepCheckpoint | null> {
    if (!Number.isSafeInteger(input.notBeforeMs) || input.notBeforeMs <= 0) throw new Error('invalid_sweep_cutoff');
    const path = `media_asset_sweeps/${SWEEP_CHECKPOINT_ID}`;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<ListeningUploadSessionSweepCheckpoint | null>(path); const existing = current.data && typeof current.data === 'object' ? current.data : null;
      if (existing?.status === 'running' && Number(existing.leaseExpiresAt) > input.now) return null;
      if (existing && existing.notBeforeMs !== input.notBeforeMs) throw new Error('sweep_cutoff_mismatch');
      const checkpoint: ListeningUploadSessionSweepCheckpoint = { schemaVersion: 1, sweepId: input.sweepId, status: 'running', createdAt: existing?.createdAt ?? input.now, updatedAt: input.now, notBeforeMs: input.notBeforeMs, ...(existing?.cursor ? { cursor: existing.cursor } : {}), leaseId: input.sweepId, leaseExpiresAt: input.now + (input.leaseMs ?? DEFAULT_SWEEP_LEASE_MS) };
      const write = await this.writeIfMatch<ListeningUploadSessionSweepCheckpoint>(path, checkpoint, current.etag);
      if (write.matched) return write.data ?? checkpoint;
    }
    return null;
  }
  async writeSweepCheckpoint(record: ListeningUploadSessionSweepCheckpoint): Promise<void> {
    const path = `media_asset_sweeps/${SWEEP_CHECKPOINT_ID}`;
    const current = await this.readWithEtag<ListeningUploadSessionSweepCheckpoint | null>(path);
    if (current.data?.leaseId && record.leaseId && current.data.leaseId !== record.leaseId) {
      throw new Error('sweep_lease_lost');
    }
    if (current.data?.status === 'running'
      && Number(current.data.leaseExpiresAt) <= record.updatedAt) {
      throw new Error('sweep_lease_expired');
    }
    const write = await this.writeIfMatch<ListeningUploadSessionSweepCheckpoint>(path, record, current.etag);
    if (!write.matched) throw new Error('sweep_checkpoint_race');
  }
  async writeSweepRecord(record: ListeningUploadSessionSweepRecord): Promise<void> { await this.writePath(`media_asset_sweeps/${record.sweepId}`, record); }
  async writeMetricRecord(record: ListeningUploadSessionMetricRecord): Promise<void> { await this.writePath(`media_asset_metrics/${record.metricEventId}`, record); }
}
