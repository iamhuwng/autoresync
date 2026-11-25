import { BackblazeAudioSource } from './b2-source.ts';
import { createAudioCredentialStore, type CredentialStoreEnv } from './credential-store.ts';
import { CONNECTION_ID, ExternalAudioError, OWNER_ID, PROVIDER_ID, record } from './protocol.ts';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const PROXY_VERSION = 1;
const EDGE_CACHE_TTL_SECONDS = 86_400; // 24 hours (immutable B2 versionId; tokens expire in <= 120s)
const CLIENT_CACHE_TTL_SECONDS = 120;

export interface ExternalAudioProxyEnv extends CredentialStoreEnv {
  readonly EXTERNAL_AUDIO_PROXY_ORIGIN?: string;
  readonly LISTENING_DELIVERY_SECRET?: string;
}

export interface ExternalAudioProxyClaims {
  readonly v: 1;
  readonly ownerId: string;
  readonly connectionId: string;
  readonly bucketId: string;
  readonly objectKey: string;
  readonly providerVersionId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly expiresAt: number;
}

export interface ExternalAudioProxyConfig {
  readonly origin: string;
  readonly secret: string;
}

export function resolveExternalAudioProxyConfig(env: ExternalAudioProxyEnv): ExternalAudioProxyConfig | undefined {
  const origin = env.EXTERNAL_AUDIO_PROXY_ORIGIN?.trim().replace(/\/+$/u, '');
  const secret = env.LISTENING_DELIVERY_SECRET?.trim();
  if (!origin || !secret) return undefined;
  return { origin, secret };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

export async function createExternalAudioProxyToken(secret: string, claims: ExternalAudioProxyClaims): Promise<string> {
  const payload = toBase64Url(textEncoder.encode(JSON.stringify(claims)));
  const key = await importHmacKey(secret, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(`external-audio-proxy-v1:${payload}`));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyExternalAudioProxyToken(
  secret: string,
  token: string,
  now: number,
): Promise<ExternalAudioProxyClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64 || payloadB64.length > 4096 || sigB64.length > 128) return null;
  const sigBytes = fromBase64Url(sigB64);
  if (!sigBytes) return null;
  const key = await importHmacKey(secret, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, textEncoder.encode(`external-audio-proxy-v1:${payloadB64}`));
  if (!valid) return null;
  const payloadBytes = fromBase64Url(payloadB64);
  if (!payloadBytes) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = record(JSON.parse(textDecoder.decode(payloadBytes)));
  } catch {
    return null;
  }
  const { v, ownerId, connectionId, bucketId, objectKey, providerVersionId, contentType, sizeBytes, expiresAt } = parsed;
  if (
    v !== PROXY_VERSION
    || typeof ownerId !== 'string' || !OWNER_ID.test(ownerId)
    || typeof connectionId !== 'string' || !CONNECTION_ID.test(connectionId)
    || typeof bucketId !== 'string' || !PROVIDER_ID.test(bucketId)
    || typeof objectKey !== 'string' || !objectKey || objectKey.length > 1024
    || typeof providerVersionId !== 'string' || !PROVIDER_ID.test(providerVersionId)
    || typeof contentType !== 'string' || !contentType.startsWith('audio/')
    || typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0
    || typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= now
  ) {
    return null;
  }
  return { v, ownerId, connectionId, bucketId, objectKey, providerVersionId, contentType, sizeBytes, expiresAt };
}

export function buildExternalAudioProxyUrl(proxyOrigin: string, providerVersionId: string, token: string): string {
  const url = new URL('/external-audio/content', proxyOrigin);
  url.searchParams.set('versionId', providerVersionId);
  url.searchParams.set('token', token);
  return url.toString();
}

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

function parseSingleByteRange(header: string | null, totalSize: number): ByteRange | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/iu.exec(header.trim());
  if (!match) return 'invalid';
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return 'invalid';
  let start: number;
  let end: number;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Math.min(Number(rawEnd), totalSize - 1) : totalSize - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= totalSize) {
    return 'invalid';
  }
  return { start, end };
}

/** O(chunk) streaming byte-range slicer — never buffers the whole file in Worker memory. */
function sliceReadableStream(source: ReadableStream<Uint8Array>, start: number, end: number): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        const chunkStart = offset;
        const chunkEnd = offset + value.byteLength - 1;
        offset += value.byteLength;
        if (chunkEnd < start) continue;
        if (chunkStart > end) {
          await reader.cancel().catch(() => {});
          controller.close();
          return;
        }
        const sliceStart = Math.max(0, start - chunkStart);
        const sliceEnd = Math.min(value.byteLength, end - chunkStart + 1);
        controller.enqueue(value.subarray(sliceStart, sliceEnd));
        if (chunkEnd >= end) {
          await reader.cancel().catch(() => {});
          controller.close();
        }
        return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason).catch(() => {});
    },
  });
}

function immutableCacheUrl(bucketId: string, providerVersionId: string): string {
  return `https://external-audio-cache.internal/v1/${encodeURIComponent(bucketId)}/${encodeURIComponent(providerVersionId)}`;
}

function baseDeliveryHeaders(contentType: string, cacheStatus: 'HIT' | 'MISS'): Headers {
  return new Headers({
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': `private, max-age=${CLIENT_CACHE_TTL_SECONDS}`,
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-External-Audio-Cache': cacheStatus,
  });
}

function getEdgeCache(): Cache | null {
  try {
    const storage = globalThis.caches as (CacheStorage & { default?: Cache }) | undefined;
    return storage?.default ?? null;
  } catch {
    return null;
  }
}

export async function handleExternalAudioContent(
  input: {
    request: Request;
    env: ExternalAudioProxyEnv;
    ctx?: ExecutionContext;
    now: () => number;
  },
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const { request, env, ctx, now } = input;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' } });
  }
  if (env.EXTERNAL_AUDIO_ROUTES_ENABLED !== 'enabled' || !env.LISTENING_DELIVERY_SECRET) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const versionId = url.searchParams.get('versionId');
  if (!token || !versionId) {
    return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const claims = await verifyExternalAudioProxyToken(env.LISTENING_DELIVERY_SECRET, token, now());
  if (!claims || claims.providerVersionId !== versionId) {
    return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const rangeHeader = request.headers.get('Range');
  const range = parseSingleByteRange(rangeHeader, claims.sizeBytes);
  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${claims.sizeBytes}`, 'Cache-Control': 'no-store' },
    });
  }

  // HEAD never downloads upstream audio bytes — verified HMAC claims already hold exact size/type.
  if (request.method === 'HEAD') {
    const headers = baseDeliveryHeaders(claims.contentType, 'HIT');
    if (range) {
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${claims.sizeBytes}`);
      headers.set('Content-Length', String(range.end - range.start + 1));
      return new Response(null, { status: 206, headers });
    }
    headers.set('Content-Length', String(claims.sizeBytes));
    return new Response(null, { status: 200, headers });
  }

  const cache = getEdgeCache();
  const cacheUrl = immutableCacheUrl(claims.bucketId, claims.providerVersionId);
  const cachePutKey = new Request(cacheUrl, { method: 'GET' });
  const cacheMatchKey = range
    ? new Request(cacheUrl, { method: 'GET', headers: { Range: `bytes=${range.start}-${range.end}` } })
    : cachePutKey;

  const cached = cache ? await cache.match(cacheMatchKey) : undefined;
  if (cached && cached.body) {
    const headers = baseDeliveryHeaders(claims.contentType, 'HIT');
    if (range) {
      const length = range.end - range.start + 1;
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${claims.sizeBytes}`);
      headers.set('Content-Length', String(length));
      // Cloudflare production Cache API natively returns 206; local fallback slices O(chunk).
      const body = cached.status === 206
        ? cached.body
        : sliceReadableStream(cached.body, range.start, range.end);
      return new Response(body, { status: 206, headers });
    }
    headers.set('Content-Length', String(claims.sizeBytes));
    return new Response(cached.body, { status: 200, headers });
  }

  // Cache MISS: open teacher's B2 connection, stream immutable version once from B2, cache at edge.
  let signedUrl: string;
  try {
    const store = createAudioCredentialStore(env, fetchImpl);
    const { value } = await store.read(claims.ownerId);
    const connection = value.connections?.[claims.connectionId];
    if (!connection || connection.state === 'revoked' || connection.scope.bucketId !== claims.bucketId) {
      return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    const key = await store.open(claims.ownerId, connection);
    const source = new BackblazeAudioSource(fetchImpl);
    signedUrl = await source.signDirectGetUrl(
      key,
      connection.scope,
      { objectKey: claims.objectKey, providerVersionId: claims.providerVersionId },
      now,
      60,
    );
  } catch (error) {
    const status = error instanceof ExternalAudioError ? error.status : 503;
    return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl.call(globalThis, signedUrl, { method: 'GET', redirect: 'manual' });
  } catch {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel();
    return new Response(null, { status: upstream.status === 404 ? 404 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const upstreamVersion = upstream.headers.get('x-amz-version-id');
  if (upstreamVersion && upstreamVersion !== claims.providerVersionId) {
    await upstream.body.cancel();
    return new Response(null, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }

  const edgeHeaders = new Headers({
    'Content-Type': claims.contentType,
    'Content-Length': String(claims.sizeBytes),
    'Accept-Ranges': 'bytes',
    'Cache-Control': `public, max-age=${EDGE_CACHE_TTL_SECONDS}, immutable`,
  });

  // Only tee into edge cache when ctx.waitUntil is present so background cache population is properly tracked
  // and cleanly cancelled on failure without retaining unread memory after a client abort.
  let clientSource: ReadableStream<Uint8Array>;
  if (cache && ctx?.waitUntil) {
    const [forClient, forCache] = upstream.body.tee();
    clientSource = forClient;
    const cachePut = cache
      .put(cachePutKey, new Response(forCache, { status: 200, headers: edgeHeaders }))
      .catch(async () => {
        await forCache.cancel().catch(() => {});
      });
    ctx.waitUntil(cachePut);
  } else {
    clientSource = upstream.body;
  }

  const headers = baseDeliveryHeaders(claims.contentType, 'MISS');
  if (range) {
    const length = range.end - range.start + 1;
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${claims.sizeBytes}`);
    headers.set('Content-Length', String(length));
    return new Response(sliceReadableStream(clientSource, range.start, range.end), { status: 206, headers });
  }

  headers.set('Content-Length', String(claims.sizeBytes));
  return new Response(clientSource, { status: 200, headers });
}
