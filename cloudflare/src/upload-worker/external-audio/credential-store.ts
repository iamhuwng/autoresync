import { importPKCS8, SignJWT } from 'jose';
import type { B2Key, B2Scope } from './b2-source.ts';
import { validPrefix } from './b2-source.ts';
import {
  CONNECTION_ID, fail, isAudioErrorCode, OWNER_ID, PROVIDER_ID, readJson, record, rootHttpsUrl, type AudioErrorCode,
} from './protocol.ts';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_SCOPES = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
const PRODUCTION_PROJECT = 'temp-a1437';
const PRODUCTION_DATABASE = `https://${PRODUCTION_PROJECT}-default-rtdb.firebaseio.com`;
const SPARE_PROJECT = 'luyentap-pdf-qa-20261021';
const SPARE_DATABASE = `https://${SPARE_PROJECT}-default-rtdb.asia-southeast1.firebasedatabase.app`;
const LOCAL_PROJECT = 'demo-luyentap-local';
export const MAX_CONNECTIONS_PER_OWNER = 64;

type Environment = 'local' | 'qualification' | 'production';

export interface CredentialStoreEnv {
  readonly EXTERNAL_AUDIO_ROUTES_ENABLED?: string;
  readonly EXTERNAL_AUDIO_ENVIRONMENT?: string;
  readonly EXTERNAL_AUDIO_STORE_PROJECT_ID?: string;
  readonly EXTERNAL_AUDIO_STORE_DATABASE_URL?: string;
  readonly EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT?: string;
  readonly EXTERNAL_AUDIO_ENCRYPTION_KEYRING?: string;
  readonly FIREBASE_PROJECT_ID?: string;
  readonly FIREBASE_DB_URL?: string;
  readonly FIREBASE_DATABASE_EMULATOR_URL?: string;
}

export interface CredentialEnvelope {
  readonly version: string;
  readonly wrappedKey: string;
  readonly keyIv: string;
  readonly ciphertext: string;
  readonly dataIv: string;
}

type ConnectionHealth = 'healthy' | AudioErrorCode;

interface ConnectionMetadata {
  readonly id: string;
  readonly label?: string;
  readonly scope: B2Scope;
  readonly checkedAt: number;
  readonly lastSuccessfulAt?: number;
  readonly health: ConnectionHealth;
}

export type AudioConnection = ConnectionMetadata & (
  | { readonly state: 'active' | 'archived'; readonly envelope: CredentialEnvelope }
  | { readonly state: 'revoked'; readonly envelope?: never }
);

export interface OwnerConnections {
  readonly generation: number;
  readonly activeConnectionId?: string;
  readonly connections?: Readonly<Record<string, AudioConnection>>;
}

interface Snapshot {
  readonly value: OwnerConnections;
  readonly etag: string;
}

export interface AudioCredentialStore {
  read(ownerId: string): Promise<Snapshot>;
  readAll(): Promise<Readonly<Record<string, OwnerConnections>>>;
  readDraftAssets(ownerId: string): Promise<unknown>;
  replace(ownerId: string, previous: Snapshot, next: OwnerConnections): Promise<void>;
  seal(ownerId: string, connectionId: string, scope: B2Scope, key: B2Key): Promise<CredentialEnvelope>;
  open(ownerId: string, connection: AudioConnection & { readonly envelope: CredentialEnvelope }): Promise<B2Key>;
}

interface StoreConfig {
  readonly environment: Environment;
  readonly origin: string;
  readonly serviceEmail: string;
  readonly privateKey: string;
  readonly activeVersion: string;
  readonly keys: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}

const keyVersion = /^[A-Za-z0-9_-]{1,48}$/u;
const projectId = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const decode = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value), (byte) => byte.charCodeAt(0));
const encode = (value: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(value)));

function setting(value: string | undefined): Record<string, unknown> {
  if (!value || value.length > 16_384) fail('store_unavailable');
  return record(JSON.parse(value));
}

function configuration(env: CredentialStoreEnv): StoreConfig {
  const environment = env.EXTERNAL_AUDIO_ENVIRONMENT;
  if (env.EXTERNAL_AUDIO_ROUTES_ENABLED !== 'enabled'
    || (environment !== 'local' && environment !== 'qualification' && environment !== 'production')) fail('store_unavailable');
  const app = env.FIREBASE_PROJECT_ID;
  const appOrigin = rootHttpsUrl(env.FIREBASE_DB_URL)?.origin;
  const usesProduction = environment === 'production' && app === PRODUCTION_PROJECT
    && appOrigin === PRODUCTION_DATABASE && !env.FIREBASE_DATABASE_EMULATOR_URL;
  const usesSpare = environment !== 'production' && app === SPARE_PROJECT
    && appOrigin === SPARE_DATABASE && !env.FIREBASE_DATABASE_EMULATOR_URL;
  const usesEmulator = environment === 'local' && app === LOCAL_PROJECT
    && /^http:\/\/localhost:[1-9][0-9]{1,4}\/?$/u.test(env.FIREBASE_DATABASE_EMULATOR_URL ?? '');
  if (!usesProduction && !usesSpare && !usesEmulator) fail('store_unavailable');

  const project = env.EXTERNAL_AUDIO_STORE_PROJECT_ID;
  const suffix = environment === 'local' ? '-audio-local'
    : environment === 'qualification' ? '-audio-qa' : '-audio-prod';
  const database = rootHttpsUrl(env.EXTERNAL_AUDIO_STORE_DATABASE_URL);
  if (!project || !projectId.test(project) || !project.endsWith(suffix) || project === app || !database
    || database.origin === appOrigin) fail('store_unavailable');
  const [namespace, ...domain] = database.hostname.split('.');
  const regionalDatabase = /^[a-z][a-z0-9-]+\.firebasedatabase\.app$/u.test(domain.join('.'));
  if (namespace !== `${project}-default-rtdb` || (!regionalDatabase && domain.join('.') !== 'firebaseio.com')) {
    fail('store_unavailable');
  }
  const service = setting(env.EXTERNAL_AUDIO_STORE_SERVICE_ACCOUNT);
  const serviceEmail = `external-audio-worker@${project}.iam.gserviceaccount.com`;
  if (service.project_id !== project || service.client_email !== serviceEmail
    || typeof service.private_key !== 'string' || !service.private_key.startsWith('-----BEGIN PRIVATE KEY-----\n')) {
    fail('store_unavailable');
  }

  const keyring = setting(env.EXTERNAL_AUDIO_ENCRYPTION_KEYRING);
  const activeVersion = keyring.active;
  if (keyring.environment !== environment || typeof activeVersion !== 'string' || !keyVersion.test(activeVersion)) {
    fail('store_unavailable');
  }
  const keys = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [version, key] of Object.entries(record(keyring.keys))) {
    if (!keyVersion.test(version) || typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/u.test(key)) fail('store_unavailable');
    const bytes = decode(key);
    if (bytes.length !== 32 || encode(bytes) !== key) fail('store_unavailable');
    keys.set(version, bytes);
  }
  if (!keys.has(activeVersion)) fail('store_unavailable');

  return { environment, origin: database.origin, serviceEmail, privateKey: service.private_key, activeVersion, keys };
}

export function validConnectionLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
    && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validScope(value: unknown): value is B2Scope {
  const { accountId, bucketId, bucketName, prefix } = record(value);
  return typeof accountId === 'string' && PROVIDER_ID.test(accountId)
    && typeof bucketId === 'string' && PROVIDER_ID.test(bucketId)
    && typeof bucketName === 'string' && /^[A-Za-z0-9-]{6,63}$/u.test(bucketName)
    && validPrefix(prefix);
}

function validEnvelope(value: unknown): value is CredentialEnvelope {
  const data = record(value);
  return typeof data.version === 'string' && keyVersion.test(data.version)
    && typeof data.wrappedKey === 'string' && data.wrappedKey.length === 64
    && typeof data.keyIv === 'string' && data.keyIv.length === 16
    && typeof data.dataIv === 'string' && data.dataIv.length === 16
    && typeof data.ciphertext === 'string' && data.ciphertext.length <= 1200;
}

function decodeSnapshot(value: unknown): OwnerConnections {
  if (value === null) return { generation: 0 };
  const { generation, activeConnectionId, connections } = record(value);
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 1
    || (activeConnectionId !== undefined && (typeof activeConnectionId !== 'string' || !CONNECTION_ID.test(activeConnectionId)))
    || !connections || typeof connections !== 'object' || Array.isArray(connections)) fail('store_unavailable');
  const entries = Object.entries(connections);
  if (entries.length > MAX_CONNECTIONS_PER_OWNER) fail('store_unavailable');
  for (const [id, raw] of entries) {
    const { id: storedId, label, scope, state, envelope, health, checkedAt, lastSuccessfulAt } = record(raw);
    if (!CONNECTION_ID.test(id) || storedId !== id || (label !== undefined && !validConnectionLabel(label))
      || !validScope(scope) || (health !== 'healthy' && !isAudioErrorCode(health))
      || typeof checkedAt !== 'number' || !Number.isSafeInteger(checkedAt)
      || (lastSuccessfulAt !== undefined && (typeof lastSuccessfulAt !== 'number' || !Number.isSafeInteger(lastSuccessfulAt) || lastSuccessfulAt < 0 || lastSuccessfulAt > checkedAt))
      || (state === 'active' && activeConnectionId !== id) || (activeConnectionId === id && state !== 'active')
      || (state === 'revoked' ? envelope !== undefined
        : ((state !== 'active' && state !== 'archived') || !validEnvelope(envelope)))) fail('store_unavailable');
  }
  if (activeConnectionId && !Object.hasOwn(connections, activeConnectionId)) fail('store_unavailable');
  return { generation, activeConnectionId, connections: connections as OwnerConnections['connections'] };
}

/** The app's RTDB client and credentials are never used to access this database. */
export function createAudioCredentialStore(env: CredentialStoreEnv, fetchImpl: typeof fetch = globalThis.fetch) {
  let config: StoreConfig;
  try {
    config = configuration(env);
  } catch {
    return fail('store_unavailable');
  }
  // Reuse a token only within this Worker request.
  let token: Promise<string> | undefined;
  const accessToken = async () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: FIREBASE_SCOPES })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(config.serviceEmail)
      .setAudience(OAUTH_URL)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 300)
      .sign(await importPKCS8(config.privateKey, 'RS256'));
    const response = await fetchImpl.call(globalThis, OAUTH_URL, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      fail('store_unavailable');
    }
    const result = record(await readJson(response, 16_384, 'store_unavailable'));
    if (typeof result.access_token !== 'string' || !result.access_token) fail('store_unavailable');
    return result.access_token;
  };

  const request = async (ownerId: string, init: RequestInit, assetId?: string | null) => {
    if (ownerId && !OWNER_ID.test(ownerId)) fail('store_unavailable');
    if (typeof assetId === 'string' && !CONNECTION_ID.test(assetId)) fail('invalid_request');
    const ownerKey = encodeURIComponent(ownerId);
    const path = assetId === undefined
      ? (ownerId ? `external_audio_connections/${ownerKey}` : 'external_audio_connections')
      : ['external_audio_draft_assets', ownerKey, assetId].filter((segment) => segment !== null).join('/');
    try {
      const bearer = await (token ??= accessToken());
      return await fetchImpl.call(globalThis, `${config.origin}/${path}.json`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${bearer}`, 'Cache-Control': 'no-store' },
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return fail('store_unavailable');
    }
  };

  const purpose = (ownerId: string, id: string, scope: B2Scope, version: string, use: 'key' | 'data') =>
    textEncoder.encode(JSON.stringify([
      'external-audio-envelope-v1', config.environment, config.origin, version, use,
      ownerId, id, scope.accountId, scope.bucketId, scope.bucketName, scope.prefix,
    ]));
  const aes = (bytes: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

  return {
    async readDraftAssets(ownerId: string) {
      if (!OWNER_ID.test(ownerId)) fail('invalid_request');
      const response = await request(ownerId, {}, null);
      if (!response.ok) {
        await response.body?.cancel();
        fail('store_unavailable');
      }
      return await readJson(response, 1_000_000, 'store_unavailable');
    },
    async readDraftAsset(ownerId: string, assetId: string) {
      const response = await request(ownerId, {}, assetId);
      if (!response.ok) {
        await response.body?.cancel();
        fail('store_unavailable');
      }
      return await readJson(response, 8192, 'store_unavailable');
    },
    async writeDraftAsset(ownerId: string, assetId: string, value: unknown) {
      const response = await request(ownerId, {
        method: 'PUT',
        headers: { 'If-Match': 'null_etag', 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      }, assetId);
      await response.body?.cancel();
      if (!response.ok) fail('store_unavailable');
    },
    async read(ownerId) {
      const response = await request(ownerId, { headers: { 'X-Firebase-ETag': 'true' } });
      const etag = response.headers.get('ETag');
      if (!response.ok || !etag || etag === '*') {
        await response.body?.cancel();
        fail('store_unavailable');
      }
      return { etag, value: decodeSnapshot(await readJson(response, 256_000, 'store_unavailable')) };
    },
    async readAll() {
      const response = await request('', {});
      if (!response.ok) { await response.body?.cancel(); fail('store_unavailable'); }
      const parsed = await readJson(response, 512_000, 'store_unavailable');
      if (parsed === null) return {};
      const raw = record(parsed);
      const result: Record<string, OwnerConnections> = {};
      for (const [ownerId, value] of Object.entries(raw)) {
        if (OWNER_ID.test(ownerId)) result[ownerId] = decodeSnapshot(value);
      }
      return result;
    },
    async replace(ownerId, previous, next) {
      if (next.generation !== previous.value.generation + 1) fail('generation_conflict');
      const response = await request(ownerId, {
        method: 'PUT',
        headers: { 'If-Match': previous.etag, 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      await response.body?.cancel();
      if (response.status === 412) fail('generation_conflict');
      if (!response.ok) fail('store_unavailable');
    },
    async seal(ownerId, id, scope, key) {
      const version = config.activeVersion;
      const keyIv = crypto.getRandomValues(new Uint8Array(12));
      const dataIv = crypto.getRandomValues(new Uint8Array(12));
      const dataBytes = crypto.getRandomValues(new Uint8Array(32));
      const wrappingBytes = config.keys.get(version);
      if (!wrappingBytes) fail('store_unavailable');
      const wrappedKey = await crypto.subtle.encrypt({
        name: 'AES-GCM', iv: keyIv, additionalData: purpose(ownerId, id, scope, version, 'key'),
      }, await aes(wrappingBytes), dataBytes);
      const ciphertext = await crypto.subtle.encrypt({
        name: 'AES-GCM', iv: dataIv, additionalData: purpose(ownerId, id, scope, version, 'data'),
      }, await aes(dataBytes), textEncoder.encode(JSON.stringify({
        applicationKeyId: key.applicationKeyId,
        applicationKey: key.applicationKey,
      })));
      return { version, wrappedKey: encode(wrappedKey), keyIv: encode(keyIv), ciphertext: encode(ciphertext), dataIv: encode(dataIv) };
    },
    async open(ownerId, connection) {
      const { envelope, id, scope } = connection;
      const { version } = envelope;
      const wrappingBytes = config.keys.get(version);
      if (!wrappingBytes || !validEnvelope(envelope)) fail('store_unavailable');
      try {
        const key = await crypto.subtle.decrypt({
          name: 'AES-GCM', iv: decode(envelope.keyIv), additionalData: purpose(ownerId, id, scope, version, 'key'),
        }, await aes(wrappingBytes), decode(envelope.wrappedKey));
        const plaintext = await crypto.subtle.decrypt({
          name: 'AES-GCM', iv: decode(envelope.dataIv), additionalData: purpose(ownerId, id, scope, version, 'data'),
        }, await aes(new Uint8Array(key)), decode(envelope.ciphertext));
        const data = record(JSON.parse(textDecoder.decode(plaintext)));
        if (typeof data.applicationKeyId !== 'string' || typeof data.applicationKey !== 'string') fail('store_unavailable');
        return { applicationKeyId: data.applicationKeyId, applicationKey: data.applicationKey };
      } catch {
        return fail('store_unavailable');
      }
    },
  };
}
