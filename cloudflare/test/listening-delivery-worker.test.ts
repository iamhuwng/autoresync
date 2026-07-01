import { describe, expect, it, vi } from 'vitest';

if (!('DurableObject' in globalThis)) {
  Object.assign(globalThis, { DurableObject: class {} });
}

const { createUploadWorker } = await import('../worker.js');
const { createListeningDeliveryWorkerHandlers } = await import(
  '../src/upload-worker/listening-delivery.ts'
);

const deliveryResponse = {
  assetId: 'asset-1',
  url: 'https://authorized.example/asset-1',
  tokenId: 'token-1',
  issuedAt: 1_700_000_000_000,
  expiresAt: 1_700_003_600_000,
  refreshAfter: 1_700_003_000_000,
  ttlMs: 3_600_000,
  deliveryReady: true,
  range: {
    requestRange: 'bytes=0-0',
    status: 206,
    acceptRanges: 'bytes',
    contentLength: 1,
    contentRange: 'bytes 0-0/4096',
  },
};

const makeWorker = () => {
  const deliveryIssuer = {
    issue: vi.fn(async () => deliveryResponse),
  };
  const worker = createUploadWorker({
    now: () => 1_700_000_000_000,
    firebaseVerifier: {
      async verifyAuthorizationHeader(header: string | null) {
        if (header === 'Bearer student-token') return { valid: true, uid: 'student-1' };
        return { valid: false };
      },
    },
    listeningDeliveryHandlers: createListeningDeliveryWorkerHandlers({
      deliveryIssuer,
      now: () => 1_700_000_000_000,
    }),
  });
  const env = {
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
  return { deliveryIssuer, env, worker };
};

const post = (path: string, body: unknown, token: string | null = 'student-token') => {
  const headers: Record<string, string> = {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new Request(
    `https://upload.example${path}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
  );
};

const deliveryGraph = {
  assetId: 'asset-1',
  canonicalAssetId: 'asset-1',
  ownerId: 'teacher-1',
  state: 'committed',
  durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.wav',
  contentType: 'audio/wav',
  sizeBytes: 4,
  references: {
    tests: {
      'test-1': true,
    },
    versions: {
      'version-1': true,
    },
    sessions: {
      LIVE123: true,
    },
  },
  retainedVersions: [{
    versionId: 'version-1',
    ownerId: 'teacher-1',
    immutable: true,
    active: true,
  }],
  retainedResults: [],
  retainedLiveSessions: [{
    sessionCode: 'LIVE123',
    testId: 'test-1',
    versionId: 'version-1',
    active: true,
    studentUserIds: ['student-1'],
    sectionNumbers: [1],
  }],
};

const makeDefaultDeliveryWorker = () => {
  let currentNow = 1_700_000_000_000;
  const audioBytes = new Uint8Array([10, 20, 30, 40]);
  const get = vi.fn(async (_key: string, options?: { range?: { offset: number; length: number } }) => {
    const range = options?.range;
    const body = range
      ? audioBytes.slice(range.offset, range.offset + range.length)
      : audioBytes;
    return {
      size: audioBytes.byteLength,
      body,
      httpEtag: '"fixture-etag"',
    };
  });
  const head = vi.fn(async () => ({
    size: audioBytes.byteLength,
    httpEtag: '"fixture-etag"',
  }));
  const verifyAuthorizationHeader = vi.fn(async (header: string | null) => (
    header === 'Bearer student-token'
      ? { valid: true, uid: 'student-1' }
      : header === 'Bearer teacher-token'
        ? { valid: true, uid: 'teacher-1' }
        : { valid: false }
  ));
  const worker = createUploadWorker({
    now: () => currentNow,
    firebaseVerifier: { verifyAuthorizationHeader },
  });
  const readDatabaseValue = vi.fn(async (path: string) => {
    if (path === 'media_assets/asset-1') return deliveryGraph;
    if (path === 'game_sessions/LIVE123') {
      return {
        sessionCode: 'LIVE123',
        status: 'in-progress',
        testId: 'test-1',
        teacherId: 'teacher-1',
        players: {
          'student-1': { isConnected: true },
        },
      };
    }
    if (path === 'tests/test-1') {
      return {
        id: 'test-1',
        authoringVersioning: {
          frozen: true,
          versionId: 'version-1',
        },
        audioSections: [{
          number: 1,
          assetId: 'asset-1',
        }],
      };
    }
    return null;
  });
  const env = {
    LISTENING_DELIVERY_SECRET: 'local-listening-delivery-secret-32-bytes-minimum',
    R2_BUCKET: { get, head },
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
    readDatabaseValue,
  };
  return {
    advanceTo: (now: number) => {
      currentNow = now;
    },
    env,
    get,
    head,
    readDatabaseValue,
    verifyAuthorizationHeader,
    worker,
  };
};

describe('PRD-0055 Worker result-review Listening delivery', () => {
  it('issues result-review delivery through authenticated trusted-server authority', async () => {
    const { deliveryIssuer, env, worker } = makeWorker();

    const response = await worker.fetch(post('/listening-delivery/result-review', {
      assetId: 'asset-1',
      resultId: 'result-1',
      versionId: 'version-1',
    }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    await expect(response.json()).resolves.toEqual(deliveryResponse);
    expect(deliveryIssuer.issue).toHaveBeenCalledWith({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: 1_700_000_000_000,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    });
  });

  it('rejects browser-provided authority before issuing delivery', async () => {
    const { deliveryIssuer, env, worker } = makeWorker();

    const response = await worker.fetch(post('/listening-delivery/result-review', {
      assetId: 'asset-1',
      resultId: 'result-1',
      versionId: 'version-1',
      ownerId: 'teacher-2',
      context: {
        runtime: 'browser',
        callerUserId: 'student-2',
      },
    }), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'browser_authority_not_allowed' });
    expect(deliveryIssuer.issue).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated result-review delivery before issuer access', async () => {
    const { deliveryIssuer, env, worker } = makeWorker();

    const response = await worker.fetch(post('/listening-delivery/result-review', {
      assetId: 'asset-1',
      resultId: 'result-1',
      versionId: 'version-1',
    }, null), env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(deliveryIssuer.issue).not.toHaveBeenCalled();
  });

  it('requires result and immutable version scope', async () => {
    const { deliveryIssuer, env, worker } = makeWorker();

    const response = await worker.fetch(post('/listening-delivery/result-review', {
      assetId: 'asset-1',
      resultId: 'result-1',
    }), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'versionId_required' });
    expect(deliveryIssuer.issue).not.toHaveBeenCalled();
  });

  it('issues solo delivery through authenticated trusted-server authority without browser-provided student authority', async () => {
    const { deliveryIssuer, env, worker } = makeWorker();

    const response = await worker.fetch(post('/listening-delivery/solo', {
      assetId: 'asset-1',
      testId: 'test-1',
      versionId: 'version-1',
      mode: 'homework',
      homeworkId: 'homework-1',
      submissionId: 'submission-1',
    }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(deliveryResponse);
    expect(deliveryIssuer.issue).toHaveBeenCalledWith({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: 1_700_000_000_000,
      soloScope: {
        testId: 'test-1',
        versionId: 'version-1',
        studentId: 'student-1',
        mode: 'homework',
        courseId: undefined,
        moduleId: undefined,
        homeworkId: 'homework-1',
        submissionId: 'submission-1',
      },
    });
  });

  it('issues live delivery through authenticated trusted-server authority without browser-provided student authority', async () => {
    const { deliveryIssuer, env, worker } = makeWorker();

    const response = await worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      classId: 'class-1',
      sectionNumber: 2,
    }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(deliveryResponse);
    expect(deliveryIssuer.issue).toHaveBeenCalledWith({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: 1_700_000_000_000,
      liveScope: {
        sessionCode: 'LIVE123',
        testId: 'test-1',
        versionId: 'version-1',
        studentId: 'student-1',
        classId: 'class-1',
        sectionNumber: 2,
      },
    });
  });

  it('rejects unauthenticated solo and live delivery before issuer access', async () => {
    const { deliveryIssuer, env, worker } = makeWorker();

    const solo = await worker.fetch(post('/listening-delivery/solo', {
      assetId: 'asset-1',
      testId: 'test-1',
      versionId: 'version-1',
      mode: 'self_study',
    }, 'bad-token'), env);
    const live = await worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
    }, 'bad-token'), env);

    expect(solo.status).toBe(401);
    expect(live.status).toBe(401);
    expect(deliveryIssuer.issue).not.toHaveBeenCalled();
  });

  it('rejects browser-provided authority on live delivery before issuing', async () => {
    const { deliveryIssuer, env, worker } = makeWorker();

    const response = await worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      callerUserId: 'student-2',
    }), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'browser_authority_not_allowed' });
    expect(deliveryIssuer.issue).not.toHaveBeenCalled();
  });
});

describe('PRD-0055 default private Listening delivery runtime', () => {
  it('issues an opaque live URL from the RTDB graph and serves exact R2 byte ranges without Firebase auth', async () => {
    const fixture = makeDefaultDeliveryWorker();
    const issuedResponse = await fixture.worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      sectionNumber: 1,
    }), fixture.env);

    expect(issuedResponse.status).toBe(200);
    const issued = await issuedResponse.json() as typeof deliveryResponse;
    expect(issued.url).toContain('/listening-delivery/content?token=');
    expect(issued.url).not.toContain(deliveryGraph.durableKey);
    expect(issued.range).toEqual({
      requestRange: 'bytes=0-0',
      status: 206,
      acceptRanges: 'bytes',
      contentLength: 1,
      contentRange: 'bytes 0-0/4',
    });
    expect(fixture.readDatabaseValue).toHaveBeenCalledWith('media_assets/asset-1');
    expect(fixture.readDatabaseValue).toHaveBeenCalledWith('game_sessions/LIVE123');
    expect(fixture.readDatabaseValue).toHaveBeenCalledWith('tests/test-1');

    fixture.verifyAuthorizationHeader.mockClear();
    const rangedResponse = await fixture.worker.fetch(new Request(issued.url, {
      headers: {
        Origin: 'http://localhost:5174',
        Range: 'bytes=1-2',
      },
    }), fixture.env);

    expect(rangedResponse.status).toBe(206);
    expect(rangedResponse.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5174');
    expect(rangedResponse.headers.get('Accept-Ranges')).toBe('bytes');
    expect(rangedResponse.headers.get('Content-Length')).toBe('2');
    expect(rangedResponse.headers.get('Content-Range')).toBe('bytes 1-2/4');
    expect(new Uint8Array(await rangedResponse.arrayBuffer())).toEqual(new Uint8Array([20, 30]));
    expect(fixture.verifyAuthorizationHeader).not.toHaveBeenCalled();
  });

  it('rejects a tampered content token before reading R2', async () => {
    const fixture = makeDefaultDeliveryWorker();
    const issuedResponse = await fixture.worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      sectionNumber: 1,
    }), fixture.env);
    const issued = await issuedResponse.json() as typeof deliveryResponse;
    const url = new URL(issued.url);
    const token = url.searchParams.get('token')!;
    const [payload, signature] = token.split('.');
    const tamperedSignature = `${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`;
    url.searchParams.set('token', `${payload}.${tamperedSignature}`);
    fixture.get.mockClear();

    const response = await fixture.worker.fetch(new Request(url), fixture.env);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'delivery_token_invalid' });
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it('rejects stale retained live access when the current session is no longer active', async () => {
    const fixture = makeDefaultDeliveryWorker();
    fixture.readDatabaseValue.mockImplementation(async (path: string) => {
      if (path === 'game_sessions/LIVE123') {
        return {
          status: 'completed',
          testId: 'test-1',
          players: { 'student-1': {} },
        };
      }
      if (path === 'media_assets/asset-1') return deliveryGraph;
      return null;
    });

    const response = await fixture.worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      sectionNumber: 1,
    }), fixture.env);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'delivery_live_session_inactive' });
  });

  it('rejects a browser-selected section when the authoritative test maps the asset elsewhere', async () => {
    const fixture = makeDefaultDeliveryWorker();

    const response = await fixture.worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      sectionNumber: 2,
    }), fixture.env);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'delivery_live_asset_mismatch' });
  });

  it('accepts teacher authority from createdByUserId when legacy teacherId is not a Firebase UID', async () => {
    const fixture = makeDefaultDeliveryWorker();
    fixture.readDatabaseValue.mockImplementation(async (path: string) => {
      if (path === 'game_sessions/LIVE123') {
        return {
          sessionCode: 'LIVE123',
          status: 'in-progress',
          testId: 'test-1',
          teacherId: 'legacy-session-teacher-LIVE123',
          createdByUserId: 'teacher-1',
          players: {},
          students: {},
        };
      }
      if (path === 'media_assets/asset-1') return deliveryGraph;
      if (path === 'tests/test-1') {
        return {
          id: 'test-1',
          authoringVersioning: {
            frozen: true,
            versionId: 'version-1',
          },
          audioSections: [{
            number: 1,
            assetId: 'asset-1',
          }],
        };
      }
      return null;
    });

    const response = await fixture.worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      sectionNumber: 1,
    }, 'teacher-token'), fixture.env);

    expect(response.status).toBe(200);
    const issued = await response.json() as typeof deliveryResponse;
    expect(issued.url).toContain('/listening-delivery/content?token=');
  });

  it('refreshes only from a server-signed previous delivery with exact timing metadata', async () => {
    const fixture = makeDefaultDeliveryWorker();
    const requestBody = {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      sectionNumber: 1,
    };
    const issuedResponse = await fixture.worker.fetch(
      post('/listening-delivery/live', requestBody),
      fixture.env,
    );
    const issued = await issuedResponse.json() as typeof deliveryResponse;

    const forgedResponse = await fixture.worker.fetch(post('/listening-delivery/live', {
      ...requestBody,
      previous: {
        ...issued,
        refreshAfter: issued.issuedAt,
      },
    }), fixture.env);
    expect(forgedResponse.status).toBe(400);
    await expect(forgedResponse.json()).resolves.toEqual({ code: 'previous_delivery_invalid' });

    fixture.advanceTo(issued.refreshAfter);
    const refreshedResponse = await fixture.worker.fetch(post('/listening-delivery/live', {
      ...requestBody,
      previous: issued,
    }), fixture.env);
    expect(refreshedResponse.status).toBe(200);
    const refreshed = await refreshedResponse.json() as typeof deliveryResponse & {
      previousUrlValidUntil: number;
    };
    expect(refreshed.tokenId).not.toBe(issued.tokenId);
    expect(refreshed.previousUrlValidUntil).toBe(issued.expiresAt);
  });

  it('rejects an expired content token while preserving the issued URL until its exact expiry', async () => {
    const fixture = makeDefaultDeliveryWorker();
    const issuedResponse = await fixture.worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      sectionNumber: 1,
    }), fixture.env);
    const issued = await issuedResponse.json() as typeof deliveryResponse;
    fixture.advanceTo(issued.expiresAt);
    fixture.get.mockClear();

    const response = await fixture.worker.fetch(new Request(issued.url), fixture.env);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'delivery_token_expired' });
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it('fails closed when the independent delivery secret is absent', async () => {
    const fixture = makeDefaultDeliveryWorker();
    const envWithoutSecret = {
      ...fixture.env,
      LISTENING_DELIVERY_SECRET: undefined,
    };

    const response = await fixture.worker.fetch(post('/listening-delivery/live', {
      assetId: 'asset-1',
      sessionCode: 'LIVE123',
      testId: 'test-1',
      versionId: 'version-1',
      sectionNumber: 1,
    }), envWithoutSecret);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ code: 'delivery_secret_unavailable' });
  });
});
