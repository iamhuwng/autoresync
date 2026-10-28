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
      : header === 'Bearer student-2-token'
        ? { valid: true, uid: 'student-2' }
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


describe('native Listening canonical solo authorization', () => {
  const body = { assetId: 'asset-1', testId: 'test-1', versionId: 'version-1', mode: 'self_study' };
  const nativeFixture = () => {
    const fixture = makeDefaultDeliveryWorker();
    const graph = { ...deliveryGraph, references: { versions: { 'version-1': true }, assignments: { 'hw-1': true } },
      retainedVersions: [], retainedSoloAccess: [] };
    const version = { recordType: 'published-version', versionId: 'version-1', testId: 'test-1', ownerId: 'teacher-1',
      assetIds: { 'asset-1': true }, archive: { state: 'active' },
      document: { isPublic: true, audioSections: [{ number: 1, assetId: 'asset-1', url: 'https://expired.example/temp/audio.mp3' }] } };
    const grant = { contentKind: 'ielts_listening', versionId: 'version-1', teacherId: 'assigning-teacher', assetIds: ['asset-1'], createdAt: 1_700_000_000_000 };
    const homework = { id: 'hw-1', createdBy: 'assigning-teacher', createdAt: grant.createdAt,
      materialId: 'test-1', materialType: 'test', materialSkill: 'listening', archived: false, status: 'active',
      contentRef: { contentKind: 'ielts_listening', contentId: 'test-1', version: 'version-1' },
      target: { type: 'students', studentIds: ['student-1'] },
      scheduling: { availableFrom: 1_699_999_000_000, dueDate: 1_700_010_000_000 }, config: {} };
    const submission = { id: 'sub-1', homeworkId: 'hw-1', studentId: 'student-1', teacherId: 'assigning-teacher', status: 'in_progress' };
    const values: Record<string, unknown> = {
      'media_assets/asset-1': graph, 'listening_authoring/versions/version-1': version,
      'homework_test_access/test-1/student-1/hw-1': grant,
    };
    const documents: Record<string, unknown> = { 'homework_assignments/hw-1': homework, 'homework_submissions/sub-1': submission };
    fixture.env.readDatabaseValue.mockImplementation(async (path) => values[path] ?? null);
    const env = { ...fixture.env, readListeningHomeworkDocument: vi.fn(async (path: string) => documents[path] ?? null) };
    return { ...fixture, env, graph, version, grant, homework, submission, values, documents };
  };
  const homeworkBody = { ...body, mode: 'homework', homeworkId: 'hw-1', submissionId: 'sub-1' };

  it('authorizes saved-result playback through current Firebase viewer rules without stored viewer arrays', async () => {
    const fixture = nativeFixture();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      const request = new URL(String(url));
      expect(request.pathname).toBe('/test_results/saved-result.json');
      return request.searchParams.get('auth') === 'student-token'
        ? Response.json({ resultId: 'saved-result', studentId: 'student-1', testId: 'test-1', testSkill: 'Listening', materialVersionId: 'version-1' })
        : Response.json({ error: 'Permission denied' }, { status: 403 });
    });
    try {
      const env = { ...fixture.env, FIREBASE_DB_URL: 'https://database.example' };
      const request = { assetId: 'asset-1', resultId: 'saved-result', versionId: 'version-1' };
      expect((await fixture.worker.fetch(post('/listening-delivery/result-review', request), env)).status).toBe(200);
      fixture.get.mockClear();
      expect((await fixture.worker.fetch(post('/listening-delivery/result-review', request, 'student-2-token'), env)).status).toBe(403);
      expect(fixture.get).not.toHaveBeenCalled();
      expect((await fixture.worker.fetch(post('/listening-delivery/result-review', { ...request, versionId: 'forged-version' }), env)).status).toBe(403);
    } finally { fetchSpy.mockRestore(); }
  });

  it('delivers retained course audio from current enrollment and material placement without stored access arrays', async () => {
    const fixture = nativeFixture();
    fixture.version.document.isPublic = false;
    Object.assign(fixture.values, {
      'tests/test-1': { ownerId: 'teacher-1', versionId: 'later-version' },
      'courses/course-1': { ownerId: 'course-teacher' },
      'modules/module-1': { courseId: 'course-1' },
      course_enrollments: { enrolled: { studentId: 'student-1', courseId: 'course-1', status: 'active', expiresAt: 0 } },
      course_materials: { linked: { courseId: 'course-1', moduleId: 'module-1', materialId: 'test-1' } },
    });
    const scope = { ...body, mode: 'course_material', courseId: 'course-1', moduleId: 'module-1' };
    const allowed = await fixture.worker.fetch(post('/listening-delivery/solo', scope), fixture.env);
    expect(allowed.status).toBe(200);
    (fixture.values.course_enrollments as any).enrolled.status = 'expired';
    fixture.get.mockClear();
    const denied = await fixture.worker.fetch(post('/listening-delivery/solo', scope), fixture.env);
    expect(denied.status).toBe(403);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it('reads the private homework document from its immutable pin after the source changes', async () => {
    const fixture = nativeFixture();
    Object.assign(fixture.version.document, { skill: 'Listening', title: 'Assigned content', isPublic: false,
      metadata: { instructions: 'Listen.', transcript: 'teacher transcript' },
      questions: [{ number: 1, question: 'Assigned question', answer: 'secret', acceptableAnswers: ['secret'], explanation: 'teacher explanation' }] });
    fixture.values['student_safe_tests/test-1'] = { versionId: 'version-2', audioSections: [{ assetId: 'replacement' }] };
    const response = await fixture.worker.fetch(post('/listening-delivery/homework-document', homeworkBody), fixture.env);
    expect(response.status).toBe(200);
    const payload = await response.json() as any;
    expect(payload).toMatchObject({ id: 'test-1', versionId: 'version-1', title: 'Assigned content',
      audioSections: [{ assetId: 'asset-1' }], metadata: { instructions: 'Listen.' }, questions: [{ number: 1, question: 'Assigned question' }] });
    expect(payload.metadata).not.toHaveProperty('transcript');
    expect(payload.questions[0]).not.toHaveProperty('answer');
    expect(payload.questions[0]).not.toHaveProperty('acceptableAnswers');
    expect(payload.questions[0]).not.toHaveProperty('explanation');
    fixture.values['tests/test-1'] = { questions: [{ number: 1, answer: 'replacement key' }] };
    const keyResponse = await fixture.worker.fetch(post('/listening-delivery/homework-questions', homeworkBody), fixture.env);
    expect(keyResponse.status).toBe(405);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it.each(['stranger', 'test', 'submission', 'target', 'closed'])(
    'denies a pinned homework document for mismatched %s authority', async failure => {
      const fixture = nativeFixture();
      Object.assign(fixture.version.document, { skill: 'Listening' });
      const request = { ...homeworkBody };
      if (failure === 'test') request.testId = 'other-test';
      if (failure === 'submission') request.submissionId = 'other-submission';
      if (failure === 'target') fixture.homework.target.studentIds = ['other-student'];
      if (failure === 'closed') fixture.homework.archived = true;
      for (const route of ['homework-document']) {
        const response = await fixture.worker.fetch(post(`/listening-delivery/${route}`, request,
          failure === 'stranger' ? 'student-2-token' : 'student-token'), fixture.env);
        expect(response.status).toBe(403);
      }
    },
  );

  it('reads a trusted attempt text pin instead of the assignment baseline or browser version hint', async () => {
    const fixture = nativeFixture();
    (fixture.submission as any).listeningVersionId = 'version-2';
    fixture.values['listening_authoring/versions/version-2'] = { ...fixture.version, versionId: 'version-2',
      document: { ...fixture.version.document, skill: 'Listening', title: 'New text', metadata: {}, questions: [{ number: 1, question: 'New question', answer: 'secret' }] } };
    fixture.graph.references = { versions: { 'version-2': true }, assignments: {} };
    fixture.grant.assetIds = [];
    const response = await fixture.worker.fetch(post('/listening-delivery/homework-document', {
      testId: 'test-1', homeworkId: 'hw-1', submissionId: 'sub-1', versionId: 'forged-browser-version',
    }), fixture.env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ versionId: 'version-2', title: 'New text', questions: [{ question: 'New question' }] });
  });

  it('delivers committed native public audio to two authenticated students without legacy test refs or per-student grants', async () => {
    const fixture = nativeFixture();
    for (const token of ['student-token', 'student-2-token']) {
      const response = await fixture.worker.fetch(post('/listening-delivery/solo', body, token), fixture.env);
      expect(response.status).toBe(200);
      const issued = await response.json() as typeof deliveryResponse;
      const audio = await fixture.worker.fetch(new Request(issued.url, { headers: { Range: 'bytes=1-2' } }), fixture.env);
      expect(audio.status).toBe(206);
      expect([...new Uint8Array(await audio.arrayBuffer())]).toEqual([20, 30]);
    }
    expect(fixture.env.readDatabaseValue.mock.calls.some(([path]) => path.startsWith('student_safe_tests/'))).toBe(false);
  });

  it.each(['test', 'version', 'owner', 'asset', 'reference', 'private', 'archived'])(
    'denies public delivery with mismatched or unavailable %s authority', async (failure) => {
      const fixture = nativeFixture();
      if (failure === 'test') fixture.version.testId = 'other-test';
      if (failure === 'version') fixture.version.versionId = 'other-version';
      if (failure === 'owner') fixture.version.ownerId = 'other-owner';
      if (failure === 'asset') fixture.version.document.audioSections[0].assetId = 'other-asset';
      if (failure === 'reference') delete (fixture.graph.references.versions as Record<string, true>)['version-1'];
      if (failure === 'private') fixture.version.document.isPublic = false;
      if (failure === 'archived') fixture.version.archive.state = 'archived';
      const response = await fixture.worker.fetch(post('/listening-delivery/solo', body), fixture.env);
      expect(response.status).toBe(403);
      expect(fixture.get).not.toHaveBeenCalled();
    },
  );

  it('reads current homework authority through Firestore REST with the verified caller token', async () => {
    const fixture = nativeFixture();
    const encode = (value: unknown): unknown => {
      if (typeof value === 'string') return { stringValue: value };
      if (typeof value === 'number') return { integerValue: String(value) };
      if (typeof value === 'boolean') return { booleanValue: value };
      if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
      return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, encode(entry)])) } };
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const prefix = 'https://firestore.googleapis.com/v1/projects/project-1/databases/(default)/documents/';
      expect(String(url).startsWith(prefix)).toBe(true);
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer student-token');
      const document = fixture.documents[String(url).slice(prefix.length)];
      return Response.json({ fields: (encode(document) as { mapValue: { fields: unknown } }).mapValue.fields });
    });
    try {
      const { readListeningHomeworkDocument: _reader, ...restEnv } = fixture.env;
      const response = await fixture.worker.fetch(post('/listening-delivery/solo', homeworkBody), { ...restEnv, FIREBASE_PROJECT_ID: 'project-1' });
      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('rechecks public archive state on refresh', async () => {
    const fixture = nativeFixture();
    const response = await fixture.worker.fetch(post('/listening-delivery/solo', body), fixture.env);
    expect(response.status).toBe(200);
    const issued = await response.json() as typeof deliveryResponse;
    fixture.advanceTo(issued.refreshAfter);
    fixture.version.archive.state = 'archived';
    fixture.get.mockClear();
    const refreshed = await fixture.worker.fetch(post('/listening-delivery/solo', { ...body, previous: issued }), fixture.env);
    expect(refreshed.status).toBe(403);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it('rechecks current class membership for retained homework', async () => {
    const fixture = nativeFixture();
    Object.assign(fixture.homework.target, { type: 'class', classId: 'class-1' });
    const classroom = { students: { 'student-record': { uid: 'student-1' } } };
    fixture.values['classes/class-1'] = classroom;
    const response = await fixture.worker.fetch(post('/listening-delivery/solo', homeworkBody), fixture.env);
    expect(response.status).toBe(200);
    const issued = await response.json() as typeof deliveryResponse;
    fixture.advanceTo(issued.refreshAfter);
    delete (classroom.students as Record<string, unknown>)['student-record'];
    fixture.get.mockClear();
    const revoked = await fixture.worker.fetch(post('/listening-delivery/solo', { ...homeworkBody, previous: issued }), fixture.env);
    expect(revoked.status).toBe(403);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it('retains exact homework delivery after source archive and rechecks revocation on refresh', async () => {
    const fixture = nativeFixture();
    fixture.version.archive.state = 'archived';
    fixture.version.document.isPublic = false;
    const response = await fixture.worker.fetch(post('/listening-delivery/solo', homeworkBody), fixture.env);
    expect(response.status).toBe(200);
    const issued = await response.json() as typeof deliveryResponse;
    fixture.advanceTo(issued.refreshAfter);
    const refreshed = await fixture.worker.fetch(post('/listening-delivery/solo', { ...homeworkBody, previous: issued }), fixture.env);
    expect(refreshed.status).toBe(200);
    fixture.homework.archived = true;
    fixture.get.mockClear();
    const revoked = await fixture.worker.fetch(post('/listening-delivery/solo', { ...homeworkBody, previous: issued }), fixture.env);
    expect(revoked.status).toBe(403);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it.each(['forged', 'version', 'teacher', 'student', 'submission', 'target', 'closed', 'future', 'reference'])(
    'denies forged or mismatched homework %s context', async (failure) => {
      const fixture = nativeFixture();
      if (failure === 'forged') delete fixture.values['homework_test_access/test-1/student-1/hw-1'];
      if (failure === 'version') fixture.homework.contentRef.version = 'other-version';
      if (failure === 'teacher') fixture.homework.createdBy = 'other-teacher';
      if (failure === 'student') fixture.submission.studentId = 'other-student';
      if (failure === 'submission') fixture.submission.homeworkId = 'other-homework';
      if (failure === 'target') fixture.homework.target.studentIds = ['other-student'];
      if (failure === 'closed') fixture.homework.status = 'closed';
      if (failure === 'future') fixture.homework.scheduling.availableFrom = 1_700_100_000_000;
      if (failure === 'reference') delete (fixture.graph.references.assignments as Record<string, true>)['hw-1'];
      const response = await fixture.worker.fetch(post('/listening-delivery/solo', homeworkBody), fixture.env);
      expect(response.status).toBe(403);
      expect(fixture.get).not.toHaveBeenCalled();
    },
  );
});
