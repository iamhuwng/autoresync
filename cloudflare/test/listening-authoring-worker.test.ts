import { describe, expect, it, vi } from 'vitest';

if (!('DurableObject' in globalThis)) {
  Object.assign(globalThis, { DurableObject: class {} });
}

const { createUploadWorker } = await import('../worker.js');
const { createListeningAuthoringWorkerHandlers } = await import(
  '../src/upload-worker/listening-authoring.ts'
);
const { FirebaseRestListeningAuthoringRepository } = await import(
  '../src/upload-worker/listening-authoring/repository.ts'
);
const { createInMemoryListeningAuthoringRepository } = await import(
  '../../functions/src/listening-authoring/repository.inMemory.ts'
);
const { publishListeningDraftCore } = await import(
  '../../functions/src/listening-authoring/service.ts'
);

const document = {
  title: 'Worker draft',
  type: 'IELTS',
  skill: 'Listening',
  duration: 1200,
  difficulty: 'Intermediate',
  questionCount: 1,
  isPublic: false,
  isComplete: true,
  displayMode: 'text',
  metadata: {
    description: 'Worker route contract',
    instructions: 'Answer every question.',
    tags: [],
  },
  audioSections: [{
    number: 1,
    name: 'Section 1',
    assetId: 'asset-1',
    audioUrl: 'r2://asset-1',
    startQuestion: 1,
    endQuestion: 1,
  }],
  questions: [{
    number: 1,
    type: 'short-answer',
    question: 'Question 1',
    answer: 'A',
    sectionNumber: 1,
    points: 1,
  }],
  settings: {
    allowPause: true,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'after-submission',
    allowReview: true,
    passingScore: 60,
    allowReplay: true,
  },
};

const makeWorker = (overrides: {
  env?: Record<string, unknown>;
  profile?: unknown;
  writesEnabled?: unknown;
  restoreInProgress?: unknown;
} = {}) => {
  const repository = createInMemoryListeningAuthoringRepository({
    now: () => 1_700_000_000_000,
  });
  const reads: string[] = [];
  const env = {
    LISTENING_AUTHORING_IDEMPOTENCY_SECRET: 'authoring-secret-test-value',
    UPLOAD_GRANT_SECRET: 'legacy-upload-grant-test-secret',
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
    readDatabaseValue: async (path: string) => {
      reads.push(path);
      if (path === 'users/teacher-1') return overrides.profile ?? { role: 'teacher' };
      if (path === 'system_flags/listening_authoring_writes_enabled') {
        return overrides.writesEnabled ?? true;
      }
      if (path === 'system_flags/restore_in_progress') {
        return overrides.restoreInProgress ?? false;
      }
      return null;
    },
    ...overrides.env,
  };
  const worker = createUploadWorker({
    firebaseVerifier: {
      async verifyAuthorizationHeader(header: string | null) {
        if (header === 'Bearer teacher-token') return { valid: true, uid: 'teacher-1' };
        return { valid: false };
      },
    },
    listeningAuthoringHandlers: createListeningAuthoringWorkerHandlers({
      repository,
      idempotencySecret: 'authoring-secret-test-value',
      now: () => 1_700_000_000_000,
    }),
  });

  return { env, reads, repository, worker };
};

const post = (
  path: string,
  body: unknown,
  idempotencyKey: string,
  origin = 'http://localhost:5173',
) => new Request(
  `https://upload.example${path}`,
  {
    method: 'POST',
    headers: {
      Authorization: 'Bearer teacher-token',
      Origin: origin,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  },
);

describe('PRD-0057 Worker authoring backend', () => {
  it('routes save, publish, and lifecycle through authenticated Worker authority', async () => {
    const { repository, worker, env } = makeWorker();

    const saveResponse = await worker.fetch(post(
      '/listening-authoring/save-draft',
      { idempotencyKey: 'save-1', document },
      'save-header-ignored-by-core',
    ), env);
    const saved = await saveResponse.json() as Record<string, unknown>;

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(saved).toEqual(expect.objectContaining({
      status: 'saved',
      draftId: expect.stringMatching(/^draft-/),
      conflictToken: 1,
    }));

    const publishResponse = await worker.fetch(post(
      '/listening-authoring/publish',
      {
        draftId: saved.draftId,
        expectedConflictToken: 1,
        idempotencyKey: 'publish-1',
      },
      'publish-header-ignored-by-core',
    ), env);
    const published = await publishResponse.json() as Record<string, unknown>;

    expect(publishResponse.status).toBe(200);
    expect(published).toEqual(expect.objectContaining({
      status: 'published',
      versionNumber: 1,
      conflictToken: 2,
    }));

    const lifecycleResponse = await worker.fetch(post(
      '/listening-authoring/lifecycle',
      {
        operation: 'archive',
        targetId: published.versionId,
        expectedConflictToken: 1,
        idempotencyKey: 'archive-1',
        reasonCode: 'teacher-archive',
      },
      'archive-header-ignored-by-core',
    ), env);

    expect(lifecycleResponse.status).toBe(200);
    await expect(lifecycleResponse.json()).resolves.toEqual(expect.objectContaining({
      status: 'archived',
      versionNumber: 1,
    }));
    expect(repository.listOperationClaims()).toHaveLength(3);
    expect(JSON.stringify(repository.listOperationClaims())).not.toContain('save-1');
  });

  it('rejects browser owner authority and Spark write gates before mutation', async () => {
    const disabled = makeWorker({ writesEnabled: false });
    const disabledResponse = await disabled.worker.fetch(post(
      '/listening-authoring/save-draft',
      { idempotencyKey: 'disabled-1', document },
      'disabled-1',
    ), disabled.env);

    expect(disabledResponse.status).toBe(503);
    await expect(disabledResponse.json()).resolves.toEqual(expect.objectContaining({
      status: 'writes-disabled',
    }));
    expect(disabled.repository.listOperationClaims()).toEqual([]);

    const active = makeWorker();
    const ownerResponse = await active.worker.fetch(post(
      '/listening-authoring/save-draft',
      { ownerId: 'teacher-2', idempotencyKey: 'owner-1', document },
      'owner-1',
    ), active.env);

    expect(ownerResponse.status).toBe(400);
    await expect(ownerResponse.json()).resolves.toEqual({ message: 'ownerId is server-derived' });
    expect(active.repository.listOperationClaims()).toEqual([]);
  });

  it('allows the write-gate override only for approved localhost remote development', async () => {
    const local = makeWorker({
      writesEnabled: false,
      env: { LISTENING_AUTHORING_DEV_WRITES_ENABLED: 'true' },
    });
    const localResponse = await local.worker.fetch(post(
      '/listening-authoring/save-draft',
      { idempotencyKey: 'local-dev-override-1', document },
      'local-dev-override-1',
    ), local.env);

    expect(localResponse.status).toBe(200);
    expect(local.repository.listOperationClaims()).toHaveLength(1);

    const deployed = makeWorker({
      writesEnabled: false,
      env: { LISTENING_AUTHORING_DEV_WRITES_ENABLED: 'true' },
    });
    const deployedResponse = await deployed.worker.fetch(post(
      '/listening-authoring/save-draft',
      { idempotencyKey: 'deployed-override-1', document },
      'deployed-override-1',
      'https://kahut1.web.app',
    ), deployed.env);

    expect(deployedResponse.status).toBe(503);
    expect(deployed.repository.listOperationClaims()).toEqual([]);
  });

  it('freezes legacy first-edit metadata with scoped RTDB CAS writes', async () => {
    const legacyTest = {
      ...document,
      id: 'legacy-test-1',
      ownerId: 'teacher-1',
      createdAt: 1_700_000_000_000,
      createdBy: 'teacher-1',
      updatedAt: 1_700_000_000_000,
      isPublished: true,
    };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(null), {
        status: 200,
        headers: { etag: '"authoring-etag-1"' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyTest), {
        status: 200,
        headers: { etag: '"legacy-etag-1"' },
      }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const repository = new FirebaseRestListeningAuthoringRepository({
      env: { FIREBASE_DB_URL: 'https://db.example.test' },
      fetchImpl,
      getAccessToken: async () => 'worker-token',
    });

    await expect(publishListeningDraftCore({
      auth: { uid: 'teacher-1', role: 'teacher' },
      body: {
        legacyTestId: 'legacy-test-1',
        idempotencyKey: 'legacy-key-1',
      },
      repo: repository,
      idempotencySecret: 'authoring-secret-test-value',
    })).resolves.toEqual(expect.objectContaining({
      status: 'published',
      draftId: expect.stringMatching(/^draft-/),
      versionId: expect.stringMatching(/^version-/),
      versionNumber: 1,
    }));

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://db.example.test/listening_authoring.json', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer worker-token',
        'X-Firebase-ETag': 'true',
      }),
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://db.example.test/tests/legacy-test-1.json', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer worker-token',
        'X-Firebase-ETag': 'true',
      }),
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(3, 'https://db.example.test/listening_authoring.json', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: 'Bearer worker-token',
        'if-match': '"authoring-etag-1"',
      }),
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(4, 'https://db.example.test/tests/legacy-test-1.json', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: 'Bearer worker-token',
        'if-match': '"legacy-etag-1"',
      }),
    }));
    const writtenAuthoring = JSON.parse(String((fetchImpl.mock.calls[2][1] as RequestInit).body));
    const writtenLegacy = JSON.parse(String((fetchImpl.mock.calls[3][1] as RequestInit).body));
    expect(writtenLegacy.authoringVersioning).toEqual(expect.objectContaining({
      frozen: true,
      versionNumber: 1,
      frozenBy: 'teacher-1',
    }));
    expect(Object.values(writtenAuthoring.versions)).toHaveLength(1);
    expect(Object.values(writtenAuthoring.revision_drafts)).toHaveLength(1);
    expect(Object.values(writtenAuthoring.operations)).toHaveLength(1);
  });

  it('rejects authoring mutations while temporary cleanup holds the authoring lease', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      temp_cleanup_lease: {
        leaseId: 'cleanup-lease-1',
        expiresAt: 9_000_000_000_000,
      },
    }), {
      status: 200,
      headers: { etag: '"authoring-etag-lease"' },
    }));
    const repository = new FirebaseRestListeningAuthoringRepository({
      env: { FIREBASE_DB_URL: 'https://db.example.test' },
      fetchImpl,
      getAccessToken: async () => 'worker-token',
      now: () => 1_700_000_000_000,
    });

    await expect(publishListeningDraftCore({
      auth: { uid: 'teacher-1', role: 'teacher' },
      body: { legacyTestId: 'legacy-test-1', idempotencyKey: 'legacy-key-lease' },
      repo: repository,
      idempotencySecret: 'authoring-secret-test-value',
    })).rejects.toThrow('listening_asset_cleanup_in_progress');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects delayed authoring saves that reference a deleted temporary asset tombstone', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      deleted_temp_assets: {
        'asset-1': { assetId: 'asset-1', ownerId: 'teacher-1', deletedAt: 1_700_000_000_000 },
      },
    }), { status: 200, headers: { etag: '"authoring-etag-tombstone"' } }));
    const repository = new FirebaseRestListeningAuthoringRepository({
      env: { FIREBASE_DB_URL: 'https://db.example.test' },
      fetchImpl,
      getAccessToken: async () => 'worker-token',
      now: () => 1_700_000_000_001,
    });

    await expect(repository.saveDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      operationId: 'operation-1',
      idempotencyKeyHash: 'idempotency-hash',
      requestHash: 'request-hash',
      document,
      allowCreate: true,
    })).rejects.toThrow('listening_asset_was_deleted');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
