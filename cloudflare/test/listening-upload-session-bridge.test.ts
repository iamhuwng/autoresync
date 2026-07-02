import { describe, expect, it, vi } from 'vitest';

if (!('DurableObject' in globalThis)) {
  Object.assign(globalThis, { DurableObject: class {} });
}

const { createUploadWorker } = await import('../worker.js');
const { handleListeningUploadSessionGrant } = await import('../src/upload-worker/listening-upload-session-grant.ts');
const { FirebaseRestListeningUploadSessionRepository } = await import('../src/upload-worker/listening-upload-session-repository.ts');
const {
  buildListeningUploadSessionCorsHeaders,
  createListeningUploadSessionHandlers,
  createListeningUploadSessionService,
} = await import('../src/upload-worker/listening-upload-session.ts');
const {
  createListeningUploadSessionSweepHandler,
  createListeningUploadSessionSweepService,
} = await import('../src/upload-worker/listening-upload-session-sweep.ts');

const textEncoder = new TextEncoder();
const toBase64Url = (value: string) => btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const decodeGrantPayload = (grant: string): Record<string, unknown> => {
  const encoded = grant.split('.')[0].replaceAll('-', '+').replaceAll('_', '/');
  return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as Record<string, unknown>;
};

const makeGrant = async (payload: Record<string, unknown>, secret: string): Promise<string> => {
  const encoded = toBase64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(encoded));
  const binary = String.fromCharCode(...new Uint8Array(signature));
  return `${encoded}.${toBase64Url(binary)}`;
};

const makeWorker = () => {
  const objects = new Map<string, unknown>();
  const consumed = new Set<string>();
  const secret = 'listening-upload-session-grant-test-secret';
  const worker = createUploadWorker({
    firebaseVerifier: {
      async verifyAuthorizationHeader(header: string | null) {
        if (header === 'Bearer owner-token') return { valid: true, uid: 'owner-1' };
        if (header === 'Bearer other-owner-token') return { valid: true, uid: 'owner-2' };
        return { valid: false };
      },
    },
  });
  const env = {
    LISTENING_UPLOAD_SESSION_GRANT_SECRET: secret,
    UPLOAD_GRANT_SECRET: 'legacy-upload-grant-test-secret',
    PUBLIC_URL: 'https://public.example',
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
    UPLOAD_GRANT_REPLAY_LEDGER: {
      async consume({ key }: { key: string }) {
        if (consumed.has(key)) return { consumed: false };
        consumed.add(key);
        return { consumed: true };
      },
    },
    R2_BUCKET: {
      async get(key: string) { return objects.get(key) ?? null; },
      async put(key: string, body: unknown) { objects.set(key, { body }); },
    },
  };
  return { env, make: (payload: Record<string, unknown>) => makeGrant(payload, secret), objects, worker };
};

const requestFor = (
  assetGrant: string,
  token = 'owner-token',
  overrides: {
    body?: string;
    contentType?: string;
    contentLength?: string;
    omitContentLength?: boolean;
    origin?: string;
    xUploadSize?: string;
  } = {},
) => new Request(
  `https://upload.example/upload?assetGrant=${encodeURIComponent(assetGrant)}`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: overrides.origin ?? 'http://localhost:5173',
      'Content-Type': overrides.contentType ?? 'audio/mpeg',
      ...(overrides.omitContentLength ? {} : { 'Content-Length': overrides.contentLength ?? '4' }),
      ...(overrides.xUploadSize ? { 'X-Upload-Size': overrides.xUploadSize } : {}),
    },
    body: overrides.body ?? 'tone',
  },
);

type ListeningUploadSessionRepository =
  Parameters<typeof createListeningUploadSessionService>[0]['repository'];

const createMemoryRepository = (): ListeningUploadSessionRepository & {
  writes: string[];
  sweepRecords: any[];
  metricRecords: any[];
  referenceAsset: (assetId: string) => void;
} => {
  const sessions = new Map<string, Record<string, any>>();
  const writes: string[] = [];
  const sweepRecords: any[] = [];
  const metricRecords: any[] = [];
  const durableReferences = new Set<string>();
  const key = (ownerId: string, uploadSessionId: string) => `${ownerId}/${uploadSessionId}`;

  return {
    writes,
    sweepRecords,
    metricRecords,
    referenceAsset(assetId: string) {
      durableReferences.add(assetId);
    },
    async findByCreationRequest(ownerId, creationRequestIdHash) {
      return [...sessions.values()].find((session) =>
        session.ownerId === ownerId && session.creationRequestIdHash === creationRequestIdHash,
      ) ?? null;
    },
    async create(record) {
      const existing = [...sessions.values()].find((session) =>
        session.ownerId === record.ownerId && session.creationRequestIdHash === record.creationRequestIdHash,
      );
      if (existing) return existing;
      writes.push(`media_asset_upload_sessions/${record.ownerId}/${record.uploadSessionId}`);
      sessions.set(key(record.ownerId, record.uploadSessionId), structuredClone(record));
      return sessions.get(key(record.ownerId, record.uploadSessionId))!;
    },
    async get(ownerId, uploadSessionId) {
      return sessions.get(key(ownerId, uploadSessionId)) ?? null;
    },
    async issueAsset({ ownerId, uploadSessionId, assetRequestIdHash, asset }) {
      const session = sessions.get(key(ownerId, uploadSessionId));
      if (!session) return null;
      const existing = session.assetRequests[assetRequestIdHash];
      if (existing) return { session, asset: existing };
      session.assetIds[asset.assetId] = true;
      session.assetRequests[assetRequestIdHash] = asset;
      session.lastGrantIssuedAt = asset.issuedAt;
      writes.push(`media_asset_upload_sessions/${ownerId}/${uploadSessionId}`);
      return { session, asset };
    },
    async findDurableAssetReferences({ assetIds }) {
      return assetIds
        .filter((assetId) => durableReferences.has(assetId))
        .map((assetId) => ({ assetId, source: `media_assets/${assetId}` }));
    },
    async markCleanupState(input) {
      const session = sessions.get(key(input.ownerId, input.uploadSessionId));
      if (!session) return null;
      session.status = input.status;
      session.abandonmentReason = input.reason;
      session.cleanupQueuedAt = input.cleanupQueuedAt;
      if (input.completedAt !== undefined) {
        session.completedAt = input.completedAt;
      }
      session.deletedAssetIds = {
        ...(session.deletedAssetIds ?? {}),
        ...Object.fromEntries(input.deletedAssetIds.map((assetId) => [assetId, true])),
      };
      session.preservedAssetIds = {
        ...(session.preservedAssetIds ?? {}),
        ...Object.fromEntries(input.preservedAssetIds.map((assetId) => [assetId, true])),
      };
      writes.push(`media_asset_upload_sessions/${input.ownerId}/${input.uploadSessionId}`);
      return session;
    },
    async listExpiredCleanupCandidates({ now, notBeforeMs, maxOwners, maxSessions }) {
      const ownerIds = [...new Set([...sessions.values()].map((session) => session.ownerId))]
        .sort()
        .slice(0, maxOwners);
      return ownerIds.flatMap((ownerId) =>
        [...sessions.values()]
          .filter((session) =>
            session.ownerId === ownerId
            && (session.status === 'active' || session.status === 'cleanup-queued')
            && session.purpose === 'listening-authoring'
            && session.createdAt >= notBeforeMs
            && session.maxEligibilityExpiresAt <= now)
          .sort((a, b) => a.uploadSessionId.localeCompare(b.uploadSessionId))
          .map((session) => ({
            ownerId: session.ownerId,
            uploadSessionId: session.uploadSessionId,
            status: session.status,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            maxEligibilityExpiresAt: session.maxEligibilityExpiresAt,
            assetCount: Object.keys(session.assetRequests ?? {}).length,
          })),
      ).slice(0, maxSessions);
    },
    async writeSweepRecord(record) {
      sweepRecords.push(structuredClone(record));
    },
    async writeMetricRecord(record) {
      metricRecords.push(structuredClone(record));
    },
  };
};

const createSessionService = (now = () => 1_700_000_000_000) => {
  const repository = createMemoryRepository();
  const ids = [
    'session-0123456789abcdef0123456789abcdef',
    'asset-0123456789abcdef0123456789abcdef',
    'nonce-0123456789abcdef0123456789abcdef',
  ];
  const service = createListeningUploadSessionService({
    repository,
    idempotencySecret: 'idempotency-secret-test-value',
    grantSecret: 'grant-secret-test-value',
    now,
    createOpaqueId: () => ids.shift() ?? 'overflow-0123456789abcdef0123456789abcdef',
  });
  return { repository, service };
};

describe('PRD-0056A Worker bridge grant', () => {
  it('allows only exact approved bridge origins for Worker session CORS headers', () => {
    expect(buildListeningUploadSessionCorsHeaders('https://kahut1.web.app')).toEqual(
      expect.objectContaining({ 'Access-Control-Allow-Origin': 'https://kahut1.web.app' }),
    );
    expect(buildListeningUploadSessionCorsHeaders('http://localhost:5173')).toEqual(
      expect.objectContaining({ 'Access-Control-Allow-Origin': 'http://localhost:5173' }),
    );
    expect(buildListeningUploadSessionCorsHeaders('http://localhost:5174')).toEqual(
      expect.objectContaining({ 'Access-Control-Allow-Origin': 'http://localhost:5174' }),
    );
    expect(buildListeningUploadSessionCorsHeaders('https://evil.example')).not.toHaveProperty(
      'Access-Control-Allow-Origin',
    );
  });

  it('issues idempotent owner-scoped session and asset identities with exact canonical temp key', async () => {
    const { repository, service } = createSessionService();
    const input = {
      uid: 'teacher-1',
      idempotencyKey: 'session-request-sentinel',
      body: { draftId: 'draft-correlation-only' },
    };

    const firstSession = await service.createSession(input);
    const secondSession = await service.createSession(input);
    const firstAsset = await service.issueAsset({
      uid: 'teacher-1',
      idempotencyKey: 'asset-request-sentinel',
      body: {
        uploadSessionId: firstSession.uploadSessionId,
        fileName: ' Listening Source (Final).MP3 ',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 42,
      },
    });
    const secondAsset = await service.issueAsset({
      uid: 'teacher-1',
      idempotencyKey: 'asset-request-sentinel',
      body: {
        uploadSessionId: firstSession.uploadSessionId,
        fileName: ' Listening Source (Final).MP3 ',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 42,
      },
    });

    expect(firstSession.uploadSessionId).toBe(secondSession.uploadSessionId);
    expect(firstAsset.assetId).toBe(secondAsset.assetId);
    expect(firstAsset.tempKey).toBe(
      `temp/listening/teacher-1/${firstSession.uploadSessionId}/${firstAsset.assetId}-listening-source-final.mp3`,
    );
    expect(firstAsset.assetGrant.split('.')).toHaveLength(2);
    expect(repository.writes).toEqual([
      `media_asset_upload_sessions/teacher-1/${firstSession.uploadSessionId}`,
      `media_asset_upload_sessions/teacher-1/${firstSession.uploadSessionId}`,
    ]);
    const sessionRecord = await repository.get('teacher-1', firstSession.uploadSessionId);
    expect(sessionRecord?.creationRequestIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionRecord?.creationRequestIdHash).not.toContain('session-request-sentinel');
    const assetRequestHashes = Object.keys(sessionRecord?.assetRequests ?? {});
    expect(assetRequestHashes).toHaveLength(1);
    expect(assetRequestHashes[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(assetRequestHashes[0]).not.toContain('asset-request-sentinel');
  });

  it('rejects asset idempotency reuse with different file metadata', async () => {
    const { service } = createSessionService();
    const session = await service.createSession({
      uid: 'teacher-1',
      idempotencyKey: 'session-request-sentinel',
      body: {},
    });
    const input = {
      uid: 'teacher-1',
      idempotencyKey: 'asset-request-sentinel',
      body: {
        uploadSessionId: session.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 42,
      },
    };

    await service.issueAsset(input);

    await expect(service.issueAsset({
      ...input,
      body: {
        ...input.body,
        sizeBytes: 43,
      },
    })).rejects.toMatchObject({ code: 'idempotency_conflict', statusCode: 409 });
  });

  it('rejects expired sessions, cross-owner access, and browser authority fields without leaking sensitive values', async () => {
    let currentTime = 1_700_000_000_000;
    const { repository, service } = createSessionService(() => currentTime);
    const logSpies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ].map((spy) => spy.mockImplementation(() => undefined));
    const session = await service.createSession({
      uid: 'teacher-1',
      idempotencyKey: 'owner-one-session-idempotency',
      body: {},
    });
    currentTime += 8 * 60 * 60 * 1000 + 1;

    await expect(service.issueAsset({
      uid: 'teacher-1',
      idempotencyKey: 'expired-asset-idempotency',
      body: {
        uploadSessionId: session.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 1,
      },
    })).rejects.toMatchObject({ code: 'upload_session_expired' });
    await expect(service.issueAsset({
      uid: 'teacher-2',
      idempotencyKey: 'owner-two-asset-idempotency',
      body: {
        uploadSessionId: session.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 1,
      },
    })).rejects.toMatchObject({ code: 'upload_session_not_found' });
    await expect(service.createSession({
      uid: 'teacher-1',
      idempotencyKey: 'raw-idempotency-sentinel',
      body: { ownerId: 'teacher-2' },
    })).rejects.toMatchObject({ code: 'browser_authority_field' });
    await expect(service.issueAsset({
      uid: 'teacher-1',
      idempotencyKey: 'browser-asset-idempotency',
      body: {
        uploadSessionId: session.uploadSessionId,
        assetId: 'browser-asset-id',
        tempKey: 'temp/listening/teacher-1/browser-key.mp3',
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 1,
      },
    })).rejects.toMatchObject({ code: 'browser_authority_field' });

    const records = JSON.stringify(await repository.get('teacher-1', session.uploadSessionId));
    expect(records).not.toContain('owner-one-session-idempotency');
    expect(logSpies.flatMap((spy) => spy.mock.calls).flat().map(String).join(' ')).not.toContain('teacher-1');
  });

  it('rejects media contracts outside MP3, M4A, AAC, WAV, and OGG', async () => {
    const { service } = createSessionService();
    const session = await service.createSession({
      uid: 'teacher-1',
      idempotencyKey: 'session-request-sentinel',
      body: {},
    });

    await expect(service.issueAsset({
      uid: 'teacher-1',
      idempotencyKey: 'asset-request-webm',
      body: {
        uploadSessionId: session.uploadSessionId,
        fileName: 'audio.webm',
        declaredMimeType: 'audio/webm',
        sizeBytes: 42,
      },
    })).rejects.toMatchObject({ code: 'unsupported_mime_type' });
  });

  it('treats missing RTDB empty maps as empty when issuing an asset', async () => {
    const uploadSessionId = 'session-0123456789abcdef';
    const issuedAssets: string[] = [];
    const service = createListeningUploadSessionService({
      repository: {
        async findByCreationRequest() { return null; },
        async create(record) { return record; },
        async get(ownerId, requestedUploadSessionId) {
          return {
            uploadSessionId: requestedUploadSessionId,
            ownerId,
            purpose: 'listening-authoring',
            status: 'active',
            creationRequestIdHash: 'a'.repeat(64),
            createdAt: 1_700_000_000_000,
            createdBy: ownerId,
            expiresAt: 1_700_000_600_000,
            maxEligibilityExpiresAt: 1_700_000_600_000,
            bridgeVersion: 'prd-0056a-worker-only-v1',
          } as any;
        },
        async issueAsset(input) {
          issuedAssets.push(input.asset.assetId);
          return {
            session: {
              uploadSessionId: input.uploadSessionId,
              ownerId: input.ownerId,
              purpose: 'listening-authoring',
              status: 'active',
              creationRequestIdHash: 'a'.repeat(64),
              createdAt: 1_700_000_000_000,
              createdBy: input.ownerId,
              expiresAt: 1_700_000_600_000,
              maxEligibilityExpiresAt: 1_700_000_600_000,
              assetIds: { [input.asset.assetId]: true },
              assetRequests: { [input.assetRequestIdHash]: input.asset },
            },
            asset: input.asset,
          };
        },
      },
      idempotencySecret: 'idempotency-secret-test-value',
      grantSecret: 'grant-secret-test-value',
      now: () => 1_700_000_000_000,
      createOpaqueId: (() => {
        const ids = ['asset-0123456789abcdef', 'nonce-0123456789abc'];
        return () => ids.shift() ?? 'overflow-0123456789abcdef';
      })(),
    });

    await expect(service.issueAsset({
      uid: 'teacher-1',
      idempotencyKey: 'asset-request-sentinel',
      body: {
        uploadSessionId,
        fileName: 'proof.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 4,
      },
    })).resolves.toMatchObject({
      assetId: 'asset-0123456789abcdef',
      uploadSessionId,
      tempKey: `temp/listening/teacher-1/${uploadSessionId}/asset-0123456789abcdef-proof.mp3`,
    });
    expect(issuedAssets).toEqual(['asset-0123456789abcdef']);
  });

  it('routes create-session and issue-asset POSTs through worker auth without Cloud Functions', async () => {
    const { repository } = createSessionService();
    const worker = createUploadWorker({
      firebaseVerifier: {
        async verifyAuthorizationHeader(header: string | null) {
          if (header === 'Bearer owner-token') return { valid: true, uid: 'owner-1' };
          return { valid: false };
        },
      },
      listeningUploadSessionHandlers: createListeningUploadSessionHandlers({
        repository,
        idempotencySecret: 'idempotency-secret-test-value',
        grantSecret: 'listening-upload-session-grant-test-secret',
        now: () => 1_700_000_000_000,
        createOpaqueId: (() => {
          const ids = [
            'session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            'nonce-cccccccccccccccccccccccccccccccc',
          ];
          return () => ids.shift() ?? 'overflow-dddddddddddddddddddddddddddddddd';
        })(),
      }),
    });
    const env = {
      LISTENING_UPLOAD_SESSION_GRANT_SECRET: 'listening-upload-session-grant-test-secret',
      LISTENING_UPLOAD_SESSION_DEV_TRANSPORT_ENABLED: 'true',
      UPLOAD_GRANT_SECRET: 'legacy-upload-grant-test-secret',
      PUBLIC_URL: 'https://public.example',
      UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
      UPLOAD_GRANT_REPLAY_LEDGER: { async consume() { return { consumed: true }; } },
      R2_BUCKET: {
        async get() { return null; },
        async put() {},
      },
    };

    const sessionResponse = await worker.fetch(new Request('https://upload.example/createListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'session-request',
      },
      body: JSON.stringify({ draftId: 'draft-only' }),
    }), env);

    expect(sessionResponse.status).toBe(200);
    const sessionPayload = await sessionResponse.json() as Record<string, unknown>;
    expect(sessionPayload.uploadSessionId).toBe('session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(sessionResponse.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');

    const assetResponse = await worker.fetch(new Request('https://upload.example/issueListeningUploadAsset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'asset-request',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 4,
      }),
    }), env);

    expect(assetResponse.status).toBe(200);
    const assetPayload = await assetResponse.json() as Record<string, unknown>;
    expect(assetPayload).toEqual(expect.objectContaining({
      assetId: 'asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      uploadSessionId: sessionPayload.uploadSessionId,
      tempKey: `temp/listening/owner-1/${sessionPayload.uploadSessionId}/asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-audio.mp3`,
    }));
    expect(decodeGrantPayload(String(assetPayload.assetGrant))).toEqual(expect.objectContaining({
      uploadTransportOrigin: 'http://localhost:8787',
    }));
  });

  it('routes trusted authoring asset range probe through worker auth without browser R2 CORS', async () => {
    const { repository } = createSessionService();
    const objects = new Map<string, Uint8Array>();
    const worker = createUploadWorker({
      now: () => 1_700_000_000_000,
      firebaseVerifier: {
        async verifyAuthorizationHeader(header: string | null) {
          if (header === 'Bearer owner-token') return { valid: true, uid: 'owner-1' };
          if (header === 'Bearer other-owner-token') return { valid: true, uid: 'owner-2' };
          return { valid: false };
        },
      },
      listeningUploadSessionHandlers: createListeningUploadSessionHandlers({
        repository,
        idempotencySecret: 'idempotency-secret-test-value',
        grantSecret: 'listening-upload-session-grant-test-secret',
        now: () => 1_700_000_000_000,
        createOpaqueId: (() => {
          const ids = [
            'session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            'nonce-cccccccccccccccccccccccccccccccc',
          ];
          return () => ids.shift() ?? 'overflow-dddddddddddddddddddddddddddddddd';
        })(),
      }),
    });
    const env = {
      LISTENING_UPLOAD_SESSION_GRANT_SECRET: 'listening-upload-session-grant-test-secret',
      LISTENING_UPLOAD_SESSION_DEV_TRANSPORT_ENABLED: 'true',
      UPLOAD_GRANT_SECRET: 'legacy-upload-grant-test-secret',
      PUBLIC_URL: 'https://public.example',
      UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
      UPLOAD_GRANT_REPLAY_LEDGER: { async consume() { return { consumed: true }; } },
      R2_BUCKET: {
        async get(key: string, options?: { range?: { offset: number; length: number } }) {
          const bytes = objects.get(key);
          if (!bytes) return null;
          const range = options?.range;
          return {
            size: bytes.byteLength,
            body: range
              ? bytes.slice(range.offset, range.offset + range.length)
              : bytes,
          };
        },
        async put(key: string, body: BodyInit) {
          objects.set(key, new Uint8Array(await new Response(body).arrayBuffer()));
        },
      },
    };

    const sessionResponse = await worker.fetch(new Request('https://upload.example/createListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'session-request',
      },
      body: JSON.stringify({ draftId: 'draft-only' }),
    }), env);
    const sessionPayload = await sessionResponse.json() as Record<string, string>;
    const assetResponse = await worker.fetch(new Request('https://upload.example/issueListeningUploadAsset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'asset-request',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 4,
      }),
    }), env);
    const assetPayload = await assetResponse.json() as Record<string, string>;
    objects.set(assetPayload.tempKey, new TextEncoder().encode('tone'));

    const probeResponse = await worker.fetch(new Request('https://upload.example/probeListeningUploadAsset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        assetId: assetPayload.assetId,
      }),
    }), env);
    expect(probeResponse.status).toBe(200);
    await expect(probeResponse.json()).resolves.toEqual(expect.objectContaining({
      status: 'ready',
      assetId: assetPayload.assetId,
      uploadSessionId: sessionPayload.uploadSessionId,
      range: expect.objectContaining({
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/4',
      }),
    }));

    const crossOwnerResponse = await worker.fetch(new Request('https://upload.example/probeListeningUploadAsset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer other-owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        assetId: assetPayload.assetId,
      }),
    }), env);
    expect(crossOwnerResponse.status).toBe(404);
  });

  it('cancels abandoned Listening temp uploads through Worker authority and touches no permanent object', async () => {
    const { repository } = createSessionService();
    const objects = new Map<string, Uint8Array>();
    const deletedKeys: string[] = [];
    const worker = createUploadWorker({
      now: () => 1_700_000_000_000,
      firebaseVerifier: {
        async verifyAuthorizationHeader(header: string | null) {
          if (header === 'Bearer owner-token') return { valid: true, uid: 'owner-1' };
          return { valid: false };
        },
      },
      listeningUploadSessionHandlers: createListeningUploadSessionHandlers({
        repository,
        idempotencySecret: 'idempotency-secret-test-value',
        grantSecret: 'listening-upload-session-grant-test-secret',
        now: () => 1_700_000_000_000,
        createOpaqueId: (() => {
          const ids = [
            'session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            'nonce-cccccccccccccccccccccccccccccccc',
          ];
          return () => ids.shift() ?? 'overflow-dddddddddddddddddddddddddddddddd';
        })(),
      }),
    });
    const env = {
      LISTENING_UPLOAD_SESSION_GRANT_SECRET: 'listening-upload-session-grant-test-secret',
      UPLOAD_GRANT_SECRET: 'legacy-upload-grant-test-secret',
      PUBLIC_URL: 'https://public.example',
      UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
      UPLOAD_GRANT_REPLAY_LEDGER: { async consume() { return { consumed: true }; } },
      R2_BUCKET: {
        async get(key: string) { return objects.get(key) ?? null; },
        async put(key: string, body: BodyInit) {
          objects.set(key, new Uint8Array(await new Response(body).arrayBuffer()));
        },
        async delete(key: string) {
          deletedKeys.push(key);
          objects.delete(key);
        },
      },
    };

    const sessionResponse = await worker.fetch(new Request('https://upload.example/createListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'session-request',
      },
      body: JSON.stringify({}),
    }), env);
    const sessionPayload = await sessionResponse.json() as Record<string, string>;
    const assetResponse = await worker.fetch(new Request('https://upload.example/issueListeningUploadAsset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'asset-request',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 4,
      }),
    }), env);
    const assetPayload = await assetResponse.json() as Record<string, string>;
    const permanentKey = 'assessment-assets/listening/owner-1/asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/audio.mp3';
    objects.set(assetPayload.tempKey, new TextEncoder().encode('tone'));
    objects.set(permanentKey, new TextEncoder().encode('permanent'));

    const cancelResponse = await worker.fetch(new Request('https://upload.example/cancelListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        assetId: assetPayload.assetId,
        reason: 'builder-cancel',
      }),
    }), env);

    expect(cancelResponse.status).toBe(200);
    await expect(cancelResponse.json()).resolves.toEqual(expect.objectContaining({
      status: 'abandoned',
      uploadSessionId: sessionPayload.uploadSessionId,
      deletedCount: 1,
      preservedCount: 0,
    }));
    expect(deletedKeys).toEqual([assetPayload.tempKey]);
    expect(objects.has(assetPayload.tempKey)).toBe(false);
    expect(objects.has(permanentKey)).toBe(true);
    await expect(repository.get('owner-1', sessionPayload.uploadSessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'abandoned',
        abandonmentReason: 'builder-cancel',
        deletedAssetIds: { [assetPayload.assetId]: true },
      }),
    );
  });

  it('queues cleanup state before R2 delete so failed deletion does not leave session active', async () => {
    const { repository } = createSessionService();
    const objects = new Map<string, Uint8Array>();
    const deletedKeys: string[] = [];
    let deleteAttempts = 0;
    const worker = createUploadWorker({
      now: () => 1_700_000_000_000,
      firebaseVerifier: {
        async verifyAuthorizationHeader(header: string | null) {
          if (header === 'Bearer owner-token') return { valid: true, uid: 'owner-1' };
          return { valid: false };
        },
      },
      listeningUploadSessionHandlers: createListeningUploadSessionHandlers({
        repository,
        idempotencySecret: 'idempotency-secret-test-value',
        grantSecret: 'listening-upload-session-grant-test-secret',
        now: () => 1_700_000_000_000,
        createOpaqueId: (() => {
          const ids = [
            'session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            'nonce-cccccccccccccccccccccccccccccccc',
          ];
          return () => ids.shift() ?? 'overflow-dddddddddddddddddddddddddddddddd';
        })(),
      }),
    });
    const env = {
      LISTENING_UPLOAD_SESSION_GRANT_SECRET: 'listening-upload-session-grant-test-secret',
      UPLOAD_GRANT_SECRET: 'legacy-upload-grant-test-secret',
      PUBLIC_URL: 'https://public.example',
      UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
      UPLOAD_GRANT_REPLAY_LEDGER: { async consume() { return { consumed: true }; } },
      R2_BUCKET: {
        async get(key: string) { return objects.get(key) ?? null; },
        async put() {},
        async delete(key: string) {
          deleteAttempts += 1;
          if (deleteAttempts === 1) throw new Error('r2_delete_failed');
          deletedKeys.push(key);
          objects.delete(key);
        },
      },
    };

    const sessionResponse = await worker.fetch(new Request('https://upload.example/createListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'session-request',
      },
      body: JSON.stringify({}),
    }), env);
    const sessionPayload = await sessionResponse.json() as Record<string, string>;
    const assetResponse = await worker.fetch(new Request('https://upload.example/issueListeningUploadAsset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'asset-request',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 4,
      }),
    }), env);
    const assetPayload = await assetResponse.json() as Record<string, string>;
    objects.set(assetPayload.tempKey, new TextEncoder().encode('tone'));

    const cancelRequestBody = {
      uploadSessionId: sessionPayload.uploadSessionId,
      assetId: assetPayload.assetId,
      reason: 'builder-cancel',
    };
    const firstCancelResponse = await worker.fetch(new Request('https://upload.example/cancelListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cancelRequestBody),
    }), env);
    expect(firstCancelResponse.status).toBe(500);
    await expect(firstCancelResponse.json()).resolves.toEqual({ code: 'bridge_unexpected_error' });
    await expect(repository.get('owner-1', sessionPayload.uploadSessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'cleanup-queued',
        abandonmentReason: 'builder-cancel',
      }),
    );
    expect(objects.has(assetPayload.tempKey)).toBe(true);

    const retryCancelResponse = await worker.fetch(new Request('https://upload.example/cancelListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cancelRequestBody),
    }), env);
    expect(retryCancelResponse.status).toBe(200);
    await expect(retryCancelResponse.json()).resolves.toEqual(expect.objectContaining({
      status: 'abandoned',
      deletedCount: 1,
      preservedCount: 0,
    }));
    expect(deletedKeys).toEqual([assetPayload.tempKey]);
    expect(objects.has(assetPayload.tempKey)).toBe(false);
    await expect(repository.get('owner-1', sessionPayload.uploadSessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'abandoned',
        deletedAssetIds: { [assetPayload.assetId]: true },
      }),
    );
  });

  it('queues cleanup state before reference scan so RTDB scan failure does not leave session active', async () => {
    const { repository } = createSessionService();
    const objects = new Map<string, Uint8Array>();
    const repositoryWithFailingScan = {
      ...repository,
      async findDurableAssetReferences() {
        throw new Error('rtdb_reference_scan_failed');
      },
    };
    const worker = createUploadWorker({
      now: () => 1_700_000_000_000,
      firebaseVerifier: {
        async verifyAuthorizationHeader(header: string | null) {
          if (header === 'Bearer owner-token') return { valid: true, uid: 'owner-1' };
          return { valid: false };
        },
      },
      listeningUploadSessionHandlers: createListeningUploadSessionHandlers({
        repository: repositoryWithFailingScan,
        idempotencySecret: 'idempotency-secret-test-value',
        grantSecret: 'listening-upload-session-grant-test-secret',
        now: () => 1_700_000_000_000,
        createOpaqueId: (() => {
          const ids = [
            'session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            'nonce-cccccccccccccccccccccccccccccccc',
          ];
          return () => ids.shift() ?? 'overflow-dddddddddddddddddddddddddddddddd';
        })(),
      }),
    });
    const env = {
      LISTENING_UPLOAD_SESSION_GRANT_SECRET: 'listening-upload-session-grant-test-secret',
      UPLOAD_GRANT_SECRET: 'legacy-upload-grant-test-secret',
      PUBLIC_URL: 'https://public.example',
      UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
      UPLOAD_GRANT_REPLAY_LEDGER: { async consume() { return { consumed: true }; } },
      R2_BUCKET: {
        async get(key: string) { return objects.get(key) ?? null; },
        async put() {},
        async delete(key: string) {
          objects.delete(key);
        },
      },
    };

    const sessionResponse = await worker.fetch(new Request('https://upload.example/createListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'session-request',
      },
      body: JSON.stringify({}),
    }), env);
    const sessionPayload = await sessionResponse.json() as Record<string, string>;
    const assetResponse = await worker.fetch(new Request('https://upload.example/issueListeningUploadAsset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'asset-request',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 4,
      }),
    }), env);
    const assetPayload = await assetResponse.json() as Record<string, string>;
    objects.set(assetPayload.tempKey, new TextEncoder().encode('tone'));

    const cancelResponse = await worker.fetch(new Request('https://upload.example/cancelListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        assetId: assetPayload.assetId,
        reason: 'builder-cancel',
      }),
    }), env);

    expect(cancelResponse.status).toBe(500);
    await expect(cancelResponse.json()).resolves.toEqual({ code: 'bridge_unexpected_error' });
    expect(objects.has(assetPayload.tempKey)).toBe(true);
    await expect(repository.get('owner-1', sessionPayload.uploadSessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'cleanup-queued',
        abandonmentReason: 'builder-cancel',
      }),
    );
  });

  it('denies cross-owner cleanup and preserves referenced temp audio', async () => {
    const { repository } = createSessionService();
    const objects = new Map<string, Uint8Array>();
    const deletedKeys: string[] = [];
    const worker = createUploadWorker({
      now: () => 1_700_000_000_000,
      firebaseVerifier: {
        async verifyAuthorizationHeader(header: string | null) {
          if (header === 'Bearer owner-token') return { valid: true, uid: 'owner-1' };
          if (header === 'Bearer other-owner-token') return { valid: true, uid: 'owner-2' };
          return { valid: false };
        },
      },
      listeningUploadSessionHandlers: createListeningUploadSessionHandlers({
        repository,
        idempotencySecret: 'idempotency-secret-test-value',
        grantSecret: 'listening-upload-session-grant-test-secret',
        now: () => 1_700_000_000_000,
        createOpaqueId: (() => {
          const ids = [
            'session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'asset-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            'nonce-cccccccccccccccccccccccccccccccc',
          ];
          return () => ids.shift() ?? 'overflow-dddddddddddddddddddddddddddddddd';
        })(),
      }),
    });
    const env = {
      LISTENING_UPLOAD_SESSION_GRANT_SECRET: 'listening-upload-session-grant-test-secret',
      UPLOAD_GRANT_SECRET: 'legacy-upload-grant-test-secret',
      PUBLIC_URL: 'https://public.example',
      UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
      UPLOAD_GRANT_REPLAY_LEDGER: { async consume() { return { consumed: true }; } },
      R2_BUCKET: {
        async get(key: string) { return objects.get(key) ?? null; },
        async put() {},
        async delete(key: string) {
          deletedKeys.push(key);
          objects.delete(key);
        },
      },
    };

    const sessionResponse = await worker.fetch(new Request('https://upload.example/createListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'session-request',
      },
      body: JSON.stringify({}),
    }), env);
    const sessionPayload = await sessionResponse.json() as Record<string, string>;
    const assetResponse = await worker.fetch(new Request('https://upload.example/issueListeningUploadAsset', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'asset-request',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        fileName: 'audio.mp3',
        declaredMimeType: 'audio/mpeg',
        sizeBytes: 4,
      }),
    }), env);
    const assetPayload = await assetResponse.json() as Record<string, string>;
    objects.set(assetPayload.tempKey, new TextEncoder().encode('tone'));

    const crossOwnerResponse = await worker.fetch(new Request('https://upload.example/cancelListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer other-owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        assetId: assetPayload.assetId,
        reason: 'builder-cancel',
      }),
    }), env);
    expect(crossOwnerResponse.status).toBe(404);
    expect(objects.has(assetPayload.tempKey)).toBe(true);

    repository.referenceAsset(assetPayload.assetId);
    const referencedResponse = await worker.fetch(new Request('https://upload.example/cancelListeningUploadSession', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner-token',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadSessionId: sessionPayload.uploadSessionId,
        assetId: assetPayload.assetId,
        reason: 'builder-cancel',
      }),
    }), env);
    expect(referencedResponse.status).toBe(200);
    await expect(referencedResponse.json()).resolves.toEqual(expect.objectContaining({
      status: 'cleanup-queued',
      deletedCount: 0,
      preservedCount: 1,
    }));
    expect(deletedKeys).toEqual([]);
    expect(objects.has(assetPayload.tempKey)).toBe(true);
    await expect(repository.get('owner-1', sessionPayload.uploadSessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'cleanup-queued',
        preservedAssetIds: { [assetPayload.assetId]: true },
      }),
    );
  });

  it('scheduled sweep cleans only future expired temp sessions and preserves referenced assets', async () => {
    const repository = createMemoryRepository();
    const now = 1_800_000_000_000;
    const notBeforeMs = now - 10_000;
    const deletedKeys: string[] = [];
    const makeSession = (input: {
      ownerId: string;
      uploadSessionId: string;
      assetId: string;
      createdAt: number;
    }) => {
      const tempKey = `temp/listening/${input.ownerId}/${input.uploadSessionId}/${input.assetId}-audio.mp3`;
      return {
        schemaVersion: 1 as const,
        ownerId: input.ownerId,
        uploadSessionId: input.uploadSessionId,
        purpose: 'listening-authoring' as const,
        status: 'active' as const,
        creationRequestIdHash: `${input.assetId.replace(/[^a-f0-9]/g, 'a').slice(0, 63)}0`,
        createdAt: input.createdAt,
        createdBy: input.ownerId,
        expiresAt: now - 1,
        maxEligibilityExpiresAt: now - 1,
        assetIds: { [input.assetId]: true },
        assetRequests: {
          [`${input.assetId}-request`]: {
            assetId: input.assetId,
            fileName: 'audio.mp3',
            sanitizedFileName: 'audio.mp3',
            declaredMimeType: 'audio/mpeg',
            sizeBytes: 4,
            tempKey,
            issuedAt: input.createdAt,
            grantExpiresAt: input.createdAt + 600_000,
          },
        },
        bridgeVersion: '0056A-v1' as const,
      };
    };
    const deletable = makeSession({
      ownerId: 'teacher-1',
      uploadSessionId: 'session-expired-aaaaaaaaaaaaaaaa',
      assetId: 'asset-deletable-aaaaaaaaaaaaaaaa',
      createdAt: notBeforeMs + 1,
    });
    const referenced = makeSession({
      ownerId: 'teacher-1',
      uploadSessionId: 'session-ref-aaaaaaaaaaaaaaaaaaaa',
      assetId: 'asset-referenced-aaaaaaaaaaaaaaa',
      createdAt: notBeforeMs + 2,
    });
    const historical = makeSession({
      ownerId: 'teacher-1',
      uploadSessionId: 'session-old-aaaaaaaaaaaaaaaaaaaa',
      assetId: 'asset-old-aaaaaaaaaaaaaaaaaaaa',
      createdAt: notBeforeMs - 1,
    });
    await repository.create(deletable);
    await repository.create(referenced);
    await repository.create(historical);
    repository.referenceAsset('asset-referenced-aaaaaaaaaaaaaaa');

    const sweep = createListeningUploadSessionSweepService({
      repository,
      now: () => now,
      createOpaqueId: () => 'sweep-proof-aaaaaaaaaaaaaaaaaaaa',
      grantSecret: 'listening-upload-session-grant-test-secret',
    });
    const result = await sweep.sweepExpiredTempSessions({
      env: {
        R2_BUCKET: {
          async delete(key: string) {
            deletedKeys.push(key);
          },
        },
      },
      notBeforeMs,
      maxOwners: 10,
      maxSessions: 10,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'complete',
      scannedCandidateCount: 2,
      processedSessionCount: 2,
      deletedAssetCount: 1,
      preservedAssetCount: 1,
      failedSessionCount: 0,
    }));
    expect(deletedKeys).toEqual([
      deletable.assetRequests['asset-deletable-aaaaaaaaaaaaaaaa-request'].tempKey,
    ]);
    await expect(repository.get('teacher-1', deletable.uploadSessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'abandoned',
        abandonmentReason: 'scheduled-expired',
        deletedAssetIds: { [deletable.assetRequests['asset-deletable-aaaaaaaaaaaaaaaa-request'].assetId]: true },
      }),
    );
    await expect(repository.get('teacher-1', referenced.uploadSessionId)).resolves.toEqual(
      expect.objectContaining({
        status: 'cleanup-queued',
        preservedAssetIds: { [referenced.assetRequests['asset-referenced-aaaaaaaaaaaaaaa-request'].assetId]: true },
      }),
    );
    await expect(repository.get('teacher-1', historical.uploadSessionId)).resolves.toEqual(
      expect.objectContaining({ status: 'active' }),
    );
    expect(repository.sweepRecords).toHaveLength(2);
    expect(repository.metricRecords).toEqual([
      expect.objectContaining({
        operation: 'reconciliation',
        outcome: 'within-threshold',
        reasonCode: 'scheduled_temp_sweep_complete',
        runId: result.sweepId,
      }),
    ]);
    expect(JSON.stringify(repository.sweepRecords)).not.toContain('temp/listening/');
    expect(JSON.stringify(repository.metricRecords)).not.toContain('temp/listening/');
  });

  it('Worker scheduled handler delegates sweep work through ctx.waitUntil', async () => {
    const scheduled = vi.fn(async () => ({ status: 'complete' }));
    const worker = createUploadWorker({
      listeningUploadSessionSweepHandler: { scheduled },
    });
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
    };

    await worker.scheduled({ cron: '0 * * * *' }, { R2_BUCKET: {} }, ctx);

    expect(scheduled).toHaveBeenCalledWith({
      env: { R2_BUCKET: {} },
      cron: '0 * * * *',
    });
    expect(pending).toHaveLength(1);
    await expect(pending[0]).resolves.toEqual({ status: 'complete' });
  });

  it('maps bridge dependency failures to sanitized non-secret response codes', async () => {
    const env = {
      LISTENING_UPLOAD_SESSION_GRANT_SECRET: 'listening-upload-session-grant-test-secret',
    };
    const createRequest = () => new Request('https://upload.example/createListeningUploadSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'session-request',
      },
      body: JSON.stringify({ draftId: 'draft-only' }),
    });

    const googleHandlers = createListeningUploadSessionHandlers({
      repository: {
        async findByCreationRequest() { return null; },
        async create() {
          throw new Error('google_oauth_failed:400:raw-secret-sentinel');
        },
        async get() { return null; },
        async issueAsset() { return null; },
      },
      now: () => 1_700_000_000_000,
    });
    const googleResponse = await googleHandlers.createSession({
      request: createRequest(),
      env,
      uid: 'owner-1',
      now: () => 1_700_000_000_000,
    });
    expect(googleResponse.init?.status).toBe(500);
    expect(googleResponse.body).toEqual({ code: 'bridge_google_oauth_failed' });
    expect(JSON.stringify(googleResponse.body)).not.toContain('raw-secret-sentinel');

    const firebaseHandlers = createListeningUploadSessionHandlers({
      repository: {
        async findByCreationRequest() { return null; },
        async create() {
          throw new Error('firebase_rtdb_put_failed:media_asset_upload_sessions/owner-1:401:permission_denied');
        },
        async get() { return null; },
        async issueAsset() { return null; },
      },
      now: () => 1_700_000_000_000,
    });
    const firebaseResponse = await firebaseHandlers.createSession({
      request: createRequest(),
      env,
      uid: 'owner-1',
      now: () => 1_700_000_000_000,
    });
    expect(firebaseResponse.init?.status).toBe(500);
    expect(firebaseResponse.body).toEqual({ code: 'bridge_firebase_rtdb_failed' });
    expect(JSON.stringify(firebaseResponse.body)).not.toContain('media_asset_upload_sessions/owner-1');
  });

  it('calls default Firebase REST fetch through the global receiver', async () => {
    const originalFetch = globalThis.fetch;
    const ownerId = 'teacher-1';
    const creationRequestIdHash = 'a'.repeat(64);
    const session = {
      uploadSessionId: 'session-1',
      ownerId,
      purpose: 'listening-authoring',
      status: 'active',
      creationRequestIdHash,
      createdAt: 1_700_000_000_000,
      createdBy: ownerId,
      expiresAt: 1_700_000_600_000,
      maxEligibilityExpiresAt: 1_700_028_800_000,
      assetIds: {},
      assetRequests: {},
    };
    const calls: string[] = [];

    vi.stubGlobal('fetch', function (
      this: unknown,
      input: RequestInfo | URL,
      _init?: RequestInit,
    ) {
      expect(this).toBe(globalThis);
      calls.push(String(input));
      return Promise.resolve(new Response(JSON.stringify({ [session.uploadSessionId]: session }), {
        status: 200,
        headers: { etag: 'test-etag' },
      }));
    });

    try {
      const repository = new FirebaseRestListeningUploadSessionRepository({
        env: {
          FIREBASE_DB_URL: 'https://db.example',
          GOOGLE_SA_KEY: 'unused-in-test',
        },
        getAccessToken: async () => 'access-token',
      });

      await expect(
        repository.findByCreationRequest(ownerId, creationRequestIdHash),
      ).resolves.toMatchObject({ uploadSessionId: session.uploadSessionId });
      expect(calls).toEqual([
        'https://db.example/media_asset_upload_sessions/teacher-1.json',
      ]);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('accepts only an exact, unexpired, single-use bridge tuple and preserves S0 route handling', async () => {
    const { env, make, objects, worker } = makeWorker();
    const uploadSessionId = 'session-0123456789abcdef';
    const assetId = 'asset-0123456789abcdef';
    const key = `temp/listening/owner-1/${uploadSessionId}/${assetId}-audio.mp3`;
    const grant = await make({
      v: 1,
      kind: 'upload',
      uid: 'owner-1',
      ownerId: 'owner-1',
      uploadSessionId,
      assetId,
      sanitizedFileName: 'audio.mp3',
      key,
      operation: 'listening-upload-session',
      contentType: 'audio/mpeg',
      sizeBytes: 4,
      expiresAt: Date.now() + 60_000,
      nonce: 'bridge-nonce-0123456789',
    });

    await expect(worker.fetch(requestFor(grant), env)).resolves.toMatchObject({ status: 200 });
    expect(objects.has(key)).toBe(true);
    await expect(worker.fetch(requestFor(grant), env)).resolves.toMatchObject({ status: 409 });
    await expect(worker.fetch(requestFor(`${grant}tampered`), env)).resolves.toMatchObject({ status: 403 });
    await expect(worker.fetch(requestFor(grant, 'other-owner-token'), env)).resolves.toMatchObject({ status: 403 });
  });

  it('accepts X-Upload-Size only when the signed grant and request origin are localhost dev', async () => {
    const { env, make, worker } = makeWorker();
    const uploadSessionId = 'session-0123456789abcdef';
    const assetId = 'asset-0123456789abcdef';
    const key = `temp/listening/owner-1/${uploadSessionId}/${assetId}-audio.mp3`;
    const payload = {
      v: 1,
      kind: 'upload',
      uid: 'owner-1',
      ownerId: 'owner-1',
      uploadSessionId,
      assetId,
      sanitizedFileName: 'audio.mp3',
      key,
      operation: 'listening-upload-session',
      contentType: 'audio/mpeg',
      sizeBytes: 4,
      expiresAt: Date.now() + 60_000,
    };
    const localGrant = await make({
      ...payload,
      nonce: 'local-size-nonce-0123456789',
      uploadTransportOrigin: 'http://localhost:8787',
    });
    const productionGrant = await make({
      ...payload,
      nonce: 'production-size-nonce-0123456789',
    });

    await expect(worker.fetch(requestFor(localGrant, 'owner-token', {
      omitContentLength: true,
      xUploadSize: '4',
    }), env)).resolves.toMatchObject({ status: 200 });
    await expect(worker.fetch(requestFor(productionGrant, 'owner-token', {
      omitContentLength: true,
      xUploadSize: '4',
    }), env)).resolves.toMatchObject({ status: 411 });
  });

  it('rejects a signed old-prefix bridge claim and keeps sensitive request values out of logs', async () => {
    const { env, make, objects, worker } = makeWorker();
    const secretSentinel = String(env.LISTENING_UPLOAD_SESSION_GRANT_SECRET);
    const uploadSessionId = 'session-0123456789abcdef';
    const assetId = 'asset-0123456789abcdef';
    const rawKey = `temp/listening-audio/owner-1/${uploadSessionId}/${assetId}-audio.mp3`;
    const grant = await make({
      v: 1,
      kind: 'upload',
      uid: 'owner-1',
      ownerId: 'owner-1',
      uploadSessionId,
      assetId,
      sanitizedFileName: 'audio.mp3',
      key: rawKey,
      operation: 'listening-upload-session',
      contentType: 'audio/mpeg',
      sizeBytes: 4,
      expiresAt: Date.now() + 60_000,
      nonce: 'bridge-nonce-0123456789',
    });
    const logSpies = ['log', 'warn', 'error'].map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    await expect(worker.fetch(requestFor(grant), env))
      .resolves.toMatchObject({ status: 403 });
    expect(objects.has(rawKey)).toBe(false);
    const logs = logSpies.flatMap((spy) => spy.mock.calls).flat().map(String).join(' ');
    expect(logs).not.toContain(secretSentinel);
    expect(logs).not.toContain(rawKey);
    expect(logs).not.toContain(grant);
  });

  it('rejects expired grants and request media contract mismatches before accepting bytes', async () => {
    const { env, make, objects, worker } = makeWorker();
    const uploadSessionId = 'session-0123456789abcdef';
    const assetId = 'asset-0123456789abcdef';
    const key = `temp/listening/owner-1/${uploadSessionId}/${assetId}-audio.mp3`;
    const payload = {
      v: 1,
      kind: 'upload',
      uid: 'owner-1',
      ownerId: 'owner-1',
      uploadSessionId,
      assetId,
      sanitizedFileName: 'audio.mp3',
      key,
      operation: 'listening-upload-session',
      contentType: 'audio/mpeg',
      sizeBytes: 4,
    };
    const expiredGrant = await make({
      ...payload,
      expiresAt: Date.now() - 1,
      nonce: 'expired-nonce-0123456789',
    });
    const mismatchGrant = await make({
      ...payload,
      expiresAt: Date.now() + 60_000,
      nonce: 'contract-nonce-0123456789',
    });
    const zeroByteGrant = await make({
      ...payload,
      sizeBytes: 0,
      expiresAt: Date.now() + 60_000,
      nonce: 'zero-byte-nonce-0123456789',
    });

    await expect(worker.fetch(requestFor(expiredGrant), env)).resolves.toMatchObject({ status: 403 });
    await expect(worker.fetch(requestFor(mismatchGrant, 'owner-token', { contentType: 'audio/wav' }), env))
      .resolves.toMatchObject({ status: 400 });
    await expect(worker.fetch(requestFor(mismatchGrant, 'owner-token', { contentLength: '5' }), env))
      .resolves.toMatchObject({ status: 400 });
    await expect(worker.fetch(requestFor(mismatchGrant, 'owner-token', { body: '', omitContentLength: true }), env))
      .resolves.toMatchObject({ status: 411 });
    const zeroByteRequest = requestFor(zeroByteGrant, 'owner-token', { body: '', contentLength: '0' });
    await expect(handleListeningUploadSessionGrant({
      request: zeroByteRequest,
      env,
      url: new URL(zeroByteRequest.url),
      uid: 'owner-1',
      now: () => Date.now(),
    })).rejects.toMatchObject({ reason: 'invalid_bridge_grant', status: 403 });
    expect(objects.has(key)).toBe(false);
  });

  it('retries owner-branch create on Firebase RTDB precondition failure and returns concurrent winner', async () => {
    const record = {
      schemaVersion: 1,
      ownerId: 'teacher-1',
      uploadSessionId: 'session-11111111111111111111111111111111',
      purpose: 'listening-authoring',
      status: 'active',
      creationRequestIdHash: 'a'.repeat(64),
      createdAt: 1_700_000_000_000,
      createdBy: 'teacher-1',
      expiresAt: 1_700_000_600_000,
      maxEligibilityExpiresAt: 1_700_028_800_000,
      assetIds: {},
      assetRequests: {},
      bridgeVersion: '0056A-v1',
    } as const;
    const winner = {
      ...record,
      uploadSessionId: 'session-22222222222222222222222222222222',
    };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('null', {
        status: 200,
        headers: { etag: '"owner-etag-1"' },
      }))
      .mockResolvedValueOnce(new Response('precondition failed', { status: 412 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        [winner.uploadSessionId]: winner,
      }), {
        status: 200,
        headers: { etag: '"owner-etag-2"' },
      }));
    const repository = new FirebaseRestListeningUploadSessionRepository({
      env: {
        FIREBASE_DB_URL: 'https://db.example.test',
        GOOGLE_SA_KEY: 'unused-in-test',
      },
      fetchImpl,
      getAccessToken: async () => 'worker-token',
    });

    await expect(repository.create(record)).resolves.toEqual(winner);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringContaining('/media_asset_upload_sessions/teacher-1.json'), expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer worker-token',
        'X-Firebase-ETag': 'true',
      }),
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, expect.stringContaining('/media_asset_upload_sessions/teacher-1.json'), expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: 'Bearer worker-token',
        'if-match': '"owner-etag-1"',
      }),
    }));
  });

  it('retries session-branch asset issue on Firebase RTDB precondition failure and returns concurrent winner asset', async () => {
    const existingSession = {
      schemaVersion: 1,
      ownerId: 'teacher-1',
      uploadSessionId: 'session-33333333333333333333333333333333',
      purpose: 'listening-authoring',
      status: 'active',
      creationRequestIdHash: 'b'.repeat(64),
      createdAt: 1_700_000_000_000,
      createdBy: 'teacher-1',
      expiresAt: 1_700_000_600_000,
      maxEligibilityExpiresAt: 1_700_028_800_000,
      assetIds: {},
      assetRequests: {},
      bridgeVersion: '0056A-v1',
    };
    const asset = {
      assetId: 'asset-44444444444444444444444444444444',
      fileName: 'audio.mp3',
      sanitizedFileName: 'audio.mp3',
      declaredMimeType: 'audio/mpeg',
      sizeBytes: 4,
      tempKey: `temp/listening/teacher-1/${existingSession.uploadSessionId}/asset-44444444444444444444444444444444-audio.mp3`,
      issuedAt: 1_700_000_000_000,
      grantExpiresAt: 1_700_000_600_000,
    };
    const winner = {
      ...existingSession,
      lastGrantIssuedAt: asset.issuedAt,
      assetIds: { [asset.assetId]: true },
      assetRequests: { ['c'.repeat(64)]: asset },
    };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(existingSession), {
        status: 200,
        headers: { etag: '"session-etag-1"' },
      }))
      .mockResolvedValueOnce(new Response('precondition failed', { status: 412 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(winner), {
        status: 200,
        headers: { etag: '"session-etag-2"' },
      }));
    const repository = new FirebaseRestListeningUploadSessionRepository({
      env: {
        FIREBASE_DB_URL: 'https://db.example.test',
        GOOGLE_SA_KEY: 'unused-in-test',
      },
      fetchImpl,
      getAccessToken: async () => 'worker-token',
    });

    await expect(repository.issueAsset({
      ownerId: 'teacher-1',
      uploadSessionId: existingSession.uploadSessionId,
      assetRequestIdHash: 'c'.repeat(64),
      asset,
    })).resolves.toEqual({ session: winner, asset });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, expect.stringContaining(`/${existingSession.uploadSessionId}.json`), expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: 'Bearer worker-token',
        'if-match': '"session-etag-1"',
      }),
    }));
  });
});
