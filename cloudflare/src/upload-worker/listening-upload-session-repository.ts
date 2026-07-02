import { SignJWT, importPKCS8 } from 'jose';
import type {
  ListeningUploadAssetReference,
  ListeningUploadAssetRecord,
  ListeningUploadSessionMetricRecord,
  ListeningUploadSessionRecord,
  ListeningUploadSessionRepository,
  ListeningUploadSessionSweepCandidate,
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

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface RepositoryEnv {
  FIREBASE_DB_URL?: string;
  GOOGLE_SA_KEY?: string;
}

class TokenCache {
  private cachedToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly saKeyJson: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.expiresAt - REFRESH_BUFFER_MS) {
      return this.cachedToken;
    }

    let serviceAccount: ServiceAccountKey;
    try {
      serviceAccount = JSON.parse(this.saKeyJson) as ServiceAccountKey;
    } catch {
      throw new Error('invalid_google_sa_key');
    }

    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('invalid_google_sa_key');
    }

    const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: OAUTH2_TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: FIREBASE_SCOPES,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(privateKey);

    const response = await this.fetchImpl(OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`google_oauth_failed:${response.status}:${body}`);
    }

    const token = JSON.parse(body) as TokenResponse;
    if (typeof token.access_token !== 'string' || token.access_token === '') {
      throw new Error('google_oauth_failed:invalid_response');
    }

    this.cachedToken = token.access_token;
    this.expiresAt = Date.now() + Math.max(0, (token.expires_in || 3600) * 1000);
    return this.cachedToken;
  }
}

const tokenCaches = new Map<string, TokenCache>();

const getTokenCache = (saKeyJson: string, fetchImpl: typeof fetch): TokenCache => {
  let cache = tokenCaches.get(saKeyJson);
  if (!cache) {
    cache = new TokenCache(saKeyJson, fetchImpl);
    tokenCaches.set(saKeyJson, cache);
  }
  return cache;
};

const parseJsonBody = (value: string): unknown => {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const firebaseErrorMessage = (body: unknown): string => {
  if (body && typeof body === 'object' && 'error' in body) {
    return String((body as { error?: unknown }).error);
  }
  return String(body ?? 'unknown_firebase_error');
};

const encodeRtdbPath = (path: string): string =>
  path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');

const rtdbUrl = (env: RepositoryEnv, path: string): string => {
  const baseUrl = env.FIREBASE_DB_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) throw new Error('missing_firebase_db_url');
  const encodedPath = encodeRtdbPath(path);
  return encodedPath ? `${baseUrl}/${encodedPath}.json` : `${baseUrl}/.json`;
};

const asSessionRecord = (value: unknown): ListeningUploadSessionRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as ListeningUploadSessionRecord
    : null;

const normalizeOwnerSessions = (
  value: unknown,
): Record<string, ListeningUploadSessionRecord> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, ListeningUploadSessionRecord>
    : {};

const findByCreationHash = (
  sessions: Record<string, ListeningUploadSessionRecord>,
  creationRequestIdHash: string,
): ListeningUploadSessionRecord | null =>
  Object.values(sessions).find((session) =>
    session.creationRequestIdHash === creationRequestIdHash,
  ) ?? null;

export class FirebaseRestListeningUploadSessionRepository implements ListeningUploadSessionRepository {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(
    private readonly options: {
      env: RepositoryEnv;
      fetchImpl?: typeof fetch;
      getAccessToken?: () => Promise<string>;
      maxRetries?: number;
    },
  ) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  private async accessToken(): Promise<string> {
    if (this.options.getAccessToken) return this.options.getAccessToken();
    const saKey = this.options.env.GOOGLE_SA_KEY?.trim();
    if (!saKey) throw new Error('missing_google_sa_key');
    return getTokenCache(saKey, this.fetchImpl).getToken();
  }

  private async readWithEtag<T>(path: string): Promise<{ data: T; etag: string }> {
    const response = await this.fetchImpl(rtdbUrl(this.options.env, path), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        'X-Firebase-ETag': 'true',
      },
    });
    const body = parseJsonBody(await response.text());
    if (!response.ok) {
      throw new Error(
        `firebase_rtdb_get_failed:${path || '/'}:${response.status}:${firebaseErrorMessage(body)}`,
      );
    }
    const etag = response.headers.get('etag');
    if (!etag) throw new Error(`missing_firebase_etag:${path || '/'}`);
    return { data: body as T, etag };
  }

  private async readPath<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(rtdbUrl(this.options.env, path), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
      },
    });
    const body = parseJsonBody(await response.text());
    if (!response.ok) {
      throw new Error(
        `firebase_rtdb_get_failed:${path || '/'}:${response.status}:${firebaseErrorMessage(body)}`,
      );
    }
    return body as T;
  }

  private async writeIfMatch<T>(
    path: string,
    value: unknown,
    etag: string,
  ): Promise<{ matched: boolean; data?: T }> {
    const response = await this.fetchImpl(rtdbUrl(this.options.env, path), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        'Content-Type': 'application/json',
        'if-match': etag,
      },
      body: JSON.stringify(value),
    });
    if (response.status === 412) return { matched: false };
    const body = parseJsonBody(await response.text());
    if (!response.ok) {
      throw new Error(
        `firebase_rtdb_put_failed:${path || '/'}:${response.status}:${firebaseErrorMessage(body)}`,
      );
    }
    return { matched: true, data: body as T };
  }

  private async writePath(path: string, value: unknown): Promise<void> {
    const response = await this.fetchImpl(rtdbUrl(this.options.env, path), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    const body = parseJsonBody(await response.text());
    if (!response.ok) {
      throw new Error(
        `firebase_rtdb_put_failed:${path || '/'}:${response.status}:${firebaseErrorMessage(body)}`,
      );
    }
  }

  private ownerPath(ownerId: string): string {
    return `media_asset_upload_sessions/${ownerId}`;
  }

  private sessionPath(ownerId: string, uploadSessionId: string): string {
    return `${this.ownerPath(ownerId)}/${uploadSessionId}`;
  }

  async findByCreationRequest(
    ownerId: string,
    creationRequestIdHash: string,
  ): Promise<ListeningUploadSessionRecord | null> {
    const { data } = await this.readWithEtag<Record<string, ListeningUploadSessionRecord> | null>(
      this.ownerPath(ownerId),
    );
    return findByCreationHash(normalizeOwnerSessions(data), creationRequestIdHash);
  }

  async create(record: ListeningUploadSessionRecord): Promise<ListeningUploadSessionRecord> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<Record<string, ListeningUploadSessionRecord> | null>(
        this.ownerPath(record.ownerId),
      );
      const sessions = normalizeOwnerSessions(current.data);
      const existing = findByCreationHash(sessions, record.creationRequestIdHash);
      if (existing) return existing;

      const nextSessions = {
        ...sessions,
        [record.uploadSessionId]: record,
      };
      const write = await this.writeIfMatch<Record<string, ListeningUploadSessionRecord>>(
        this.ownerPath(record.ownerId),
        nextSessions,
        current.etag,
      );
      if (!write.matched) continue;

      const saved = findByCreationHash(normalizeOwnerSessions(write.data), record.creationRequestIdHash);
      if (saved) return saved;
    }

    const existing = await this.findByCreationRequest(record.ownerId, record.creationRequestIdHash);
    if (existing) return existing;
    throw new Error('bootstrap_write_failed');
  }

  async get(ownerId: string, uploadSessionId: string): Promise<ListeningUploadSessionRecord | null> {
    const { data } = await this.readWithEtag<ListeningUploadSessionRecord | null>(
      this.sessionPath(ownerId, uploadSessionId),
    );
    return asSessionRecord(data);
  }

  async issueAsset(input: {
    ownerId: string;
    uploadSessionId: string;
    assetRequestIdHash: string;
    asset: ListeningUploadAssetRecord;
  }): Promise<{ session: ListeningUploadSessionRecord; asset: ListeningUploadAssetRecord } | null> {
    const path = this.sessionPath(input.ownerId, input.uploadSessionId);

    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<ListeningUploadSessionRecord | null>(path);
      const session = asSessionRecord(current.data);
      if (!session || session.ownerId !== input.ownerId || session.uploadSessionId !== input.uploadSessionId) {
        return null;
      }

      const existing = session.assetRequests?.[input.assetRequestIdHash];
      if (existing) return { session, asset: existing };

      const nextSession: ListeningUploadSessionRecord = {
        ...session,
        lastGrantIssuedAt: input.asset.issuedAt,
        assetIds: { ...(session.assetIds ?? {}), [input.asset.assetId]: true },
        assetRequests: {
          ...(session.assetRequests ?? {}),
          [input.assetRequestIdHash]: input.asset,
        },
      };
      const write = await this.writeIfMatch<ListeningUploadSessionRecord>(
        path,
        nextSession,
        current.etag,
      );
      if (!write.matched) continue;

      const saved = asSessionRecord(write.data) ?? nextSession;
      const asset = saved.assetRequests?.[input.assetRequestIdHash];
      if (asset) return { session: saved, asset };
    }

    const session = await this.get(input.ownerId, input.uploadSessionId);
    if (!session) return null;
    const asset = session.assetRequests?.[input.assetRequestIdHash];
    return asset ? { session, asset } : null;
  }

  async findDurableAssetReferences(input: {
    ownerId: string;
    assetIds: readonly string[];
    tempKeys: readonly string[];
  }): Promise<ListeningUploadAssetReference[]> {
    const references: ListeningUploadAssetReference[] = [];
    for (const assetId of input.assetIds) {
      const asset = await this.readPath<unknown>(`media_assets/${assetId}`);
      if (asset !== null) {
        references.push({ assetId, source: `media_assets/${assetId}` });
      }
    }

    const roots = [
      'listening_authoring/drafts',
      'listening_authoring/versions',
      'tests',
      'results',
      'assignments',
      'sessions',
    ];
    const searchable = input.assetIds.map((assetId, index) => ({
      assetId,
      needles: [assetId, input.tempKeys[index]].filter((value): value is string =>
        typeof value === 'string' && value.length > 0),
    }));

    for (const root of roots) {
      const value = await this.readPath<unknown>(root);
      if (value === null) continue;
      const serialized = JSON.stringify(value);
      for (const target of searchable) {
        if (target.needles.some((needle) => serialized.includes(needle))) {
          references.push({ assetId: target.assetId, source: root });
        }
      }
    }

    return references;
  }

  async markCleanupState(input: {
    ownerId: string;
    uploadSessionId: string;
    status: 'abandoned' | 'cleanup-queued';
    reason: string;
    cleanupQueuedAt: number;
    completedAt?: number;
    deletedAssetIds: readonly string[];
    preservedAssetIds: readonly string[];
  }): Promise<ListeningUploadSessionRecord | null> {
    const path = this.sessionPath(input.ownerId, input.uploadSessionId);

    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.readWithEtag<ListeningUploadSessionRecord | null>(path);
      const session = asSessionRecord(current.data);
      if (!session || session.ownerId !== input.ownerId || session.uploadSessionId !== input.uploadSessionId) {
        return null;
      }

      const nextSession: ListeningUploadSessionRecord = {
        ...session,
        status: input.status,
        abandonmentReason: input.reason,
        cleanupQueuedAt: input.cleanupQueuedAt,
        ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
        deletedAssetIds: {
          ...(session.deletedAssetIds ?? {}),
          ...Object.fromEntries(input.deletedAssetIds.map((assetId) => [assetId, true])),
        },
        preservedAssetIds: {
          ...(session.preservedAssetIds ?? {}),
          ...Object.fromEntries(input.preservedAssetIds.map((assetId) => [assetId, true])),
        },
      };
      const write = await this.writeIfMatch<ListeningUploadSessionRecord>(
        path,
        nextSession,
        current.etag,
      );
      if (!write.matched) continue;
      return asSessionRecord(write.data) ?? nextSession;
    }

    return this.get(input.ownerId, input.uploadSessionId);
  }

  async listExpiredCleanupCandidates(input: {
    now: number;
    notBeforeMs: number;
    maxOwners: number;
    maxSessions: number;
  }): Promise<ListeningUploadSessionSweepCandidate[]> {
    const root = await this.readPath<Record<string, Record<string, ListeningUploadSessionRecord>> | null>(
      'media_asset_upload_sessions',
    );
    const candidates: ListeningUploadSessionSweepCandidate[] = [];
    if (!root || typeof root !== 'object' || Array.isArray(root)) return candidates;

    const ownerIds = Object.keys(root).sort().slice(0, Math.max(0, input.maxOwners));
    for (const ownerId of ownerIds) {
      const sessions = normalizeOwnerSessions(root[ownerId]);
      for (const uploadSessionId of Object.keys(sessions).sort()) {
        if (candidates.length >= input.maxSessions) return candidates;
        const session = asSessionRecord(sessions[uploadSessionId]);
        if (!session || session.ownerId !== ownerId || session.uploadSessionId !== uploadSessionId) {
          continue;
        }
        if (session.purpose !== 'listening-authoring') continue;
        if (session.status !== 'active' && session.status !== 'cleanup-queued') continue;
        if (!Number.isFinite(session.createdAt) || session.createdAt < input.notBeforeMs) continue;
        if (
          Number.isFinite(session.maxEligibilityExpiresAt)
          && session.maxEligibilityExpiresAt > input.now
        ) {
          continue;
        }
        candidates.push({
          ownerId,
          uploadSessionId,
          status: session.status,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          maxEligibilityExpiresAt: session.maxEligibilityExpiresAt,
          assetCount: Object.keys(session.assetRequests ?? {}).length,
        });
      }
    }
    return candidates;
  }

  async writeSweepRecord(record: ListeningUploadSessionSweepRecord): Promise<void> {
    await this.writePath(`media_asset_sweeps/${record.sweepId}`, record);
  }

  async writeMetricRecord(record: ListeningUploadSessionMetricRecord): Promise<void> {
    await this.writePath(`media_asset_metrics/${record.metricEventId}`, record);
  }
}
