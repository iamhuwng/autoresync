import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBookActivityAuthoringWorkerHandlers } from '../src/upload-worker/book-activity-authoring/worker.ts';
import {
  FirebaseRestBookActivityAuthoringRepository,
  type BookActivityAuthoringRoot,
} from '../src/upload-worker/book-activity-authoring/repository.ts';
import { createBookRolloutWorkerGate, type BookRolloutWorkerGate } from '../src/book-rollout-gate.ts';

const activity = {
  schemaVersion: 1, title: 'Candidate', taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] }, instructions: [{ text: 'Choose.' }],
  interaction: { family: 'choice', variant: 'single-choice' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 }, stimulus: null,
  assetRefs: [], interactions: [{ prompt: 'Pick', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
  scoring: { mode: 'auto-where-possible' },
};
const operation = (suffix: string) => `123e4567-e89b-42d3-a456-426614174${suffix}`;
const request = (body: unknown) => new Request('https://worker.test/book-activity-authoring', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const rolloutConfig = (mutation: 'allow' | 'deny'): string => JSON.stringify({
  schemaVersion: 'v1', environment: 'test', revision: 'authoring-test',
  issuedAt: '2026-07-22T11:00:00.000Z', expiresAt: '2026-07-22T13:00:00.000Z',
  actions: {
    create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny',
    'launch-delivery': 'deny', mutation,
  },
});
const allowMutationGate = createBookRolloutWorkerGate({
  BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON: rolloutConfig('allow'),
  BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT: 'test',
}, { clock: () => new Date('2026-07-22T12:00:00.000Z'), audit: () => undefined });
const denyMutationGate = createBookRolloutWorkerGate({
  BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON: rolloutConfig('deny'),
  BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT: 'test',
}, { clock: () => new Date('2026-07-22T12:00:00.000Z'), audit: () => undefined });

const worker = (options: {
  profile?: unknown;
  crashBeforeCommit?: boolean;
  createRecordId?: () => string;
  rolloutGate?: BookRolloutWorkerGate;
  state?: Record<string, BookActivityAuthoringRoot>;
} = {}) => {
  const state: Record<string, BookActivityAuthoringRoot> = options.state ?? {};
  let crashBeforeCommit = options.crashBeforeCommit ?? false;
  const repository = {
    readValue: async (path: string) => path.startsWith('users/') ? (options.profile ?? { role: 'teacher' }) : null,
    readOwnerRoot: async (ownerId: string) => structuredClone(state[ownerId] ?? {}),
    transaction: async <T,>(ownerId: string, mutate: (root: BookActivityAuthoringRoot) => {
      outcome: T; next?: BookActivityAuthoringRoot; write: boolean;
    }) => {
      const result = mutate(structuredClone(state[ownerId] ?? {}));
      if (result.write && crashBeforeCommit) { crashBeforeCommit = false; throw new Error('crash-before-commit'); }
      if (result.write) state[ownerId] = structuredClone(result.next ?? {});
      return result.outcome;
    },
  };
  return { handlers: createBookActivityAuthoringWorkerHandlers({
    repository,
    now: () => 1_700_000_000_000,
    createRecordId: options.createRecordId,
    rolloutGate: options.rolloutGate ?? allowMutationGate,
  }), state, crashNextCommit: () => { crashBeforeCommit = true; } };
};

describe('Book Activity authoring Worker boundary', () => {
  afterEach(() => vi.restoreAllMocks());
  it('denies every mutation when the deployment-owned mutation gate is disabled', async () => {
    const current = worker({ rolloutGate: denyMutationGate });
    const response = await current.handlers.stage({
      request: request({ operationId: operation('000'), expectedRevision: 0, content: activity }),
      env: {}, uid: 'teacher-1',
    });
    expect(response).toMatchObject({
      init: { status: 503 },
      body: { code: 'book_activity_rollout_unavailable', decision: { operation: 'mutation', allowed: false } },
    });
    expect(current.state).toEqual({});
  });

  it('rollback disables mutations while retaining owner-read and published-state isolation', async () => {
    const state: Record<string, BookActivityAuthoringRoot> = {};
    const enabled = worker({ state });
    const staged = await enabled.handlers.stage({
      request: request({ operationId: operation('005'), expectedRevision: 0, content: activity }),
      env: {},
      uid: 'teacher-1',
    });
    const candidateId = String((staged.body as Record<string, unknown>).candidateId);
    const before = structuredClone(state);
    const disabled = worker({ state, rolloutGate: denyMutationGate });
    await expect(disabled.handlers.loadCandidate({ env: {}, uid: 'teacher-1', candidateId }))
      .resolves.toMatchObject({ init: { status: 200 }, body: { status: 'loaded' } });
    await expect(disabled.handlers.stage({
      request: request({ operationId: operation('007'), expectedRevision: 0, content: { ...activity, title: 'blocked' } }),
      env: {},
      uid: 'teacher-1',
    })).resolves.toMatchObject({
      init: { status: 503 },
      body: { code: 'book_activity_rollout_unavailable' },
    });
    expect(state).toEqual(before);
    expect(state['teacher-1'].activities ?? {}).toEqual({});
  });

  it('persists validated candidate through reload, exact replay, then CAS draft save', async () => {
    const { handlers } = worker();
    const staged = await handlers.stage({ request: request({ operationId: operation('001'), expectedRevision: 0, content: activity, evidenceRefs: ['import:1'] }), env: {}, uid: 'teacher-1' });
    expect(staged.init.status).toBe(200);
    const stageBody = staged.body as Record<string, unknown>;
    const candidateId = String(stageBody.candidateId);
    expect(stageBody).toMatchObject({ status: 'staged', lifecycle: 'staged', validation: { valid: true } });

    const replay = await handlers.stage({ request: request({ operationId: operation('001'), expectedRevision: 0, content: activity, evidenceRefs: ['import:1'] }), env: {}, uid: 'teacher-1' });
    expect(replay.body).toMatchObject({ status: 'staged', replayed: true, candidateId });
    const conflictingReplay = await handlers.stage({ request: request({ operationId: operation('001'), expectedRevision: 0, content: { ...activity, title: 'different' } }), env: {}, uid: 'teacher-1' });
    expect(conflictingReplay.init.status).toBe(409);
    expect(conflictingReplay.body).toEqual({ status: 'idempotency-conflict' });

    const loaded = await handlers.loadCandidate({ env: {}, uid: 'teacher-1', candidateId });
    expect(loaded.body).toMatchObject({ status: 'loaded', candidate: { candidateId, lifecycle: 'staged' } });
    const validated = await handlers.validate({ request: request({ operationId: operation('002'), candidateId, expectedRevision: 1, evidenceRefs: ['validate:1'] }), env: {}, uid: 'teacher-1' });
    expect(validated.body).toMatchObject({ status: 'validated', revision: 2, lifecycle: 'validated' });
    const saved = await handlers.saveDraft({ request: request({ operationId: operation('003'), candidateId, expectedRevision: 2, evidenceRefs: ['save:1'] }), env: {}, uid: 'teacher-1' });
    expect(saved.body).toMatchObject({ status: 'saved', revision: 1, lifecycle: 'saved', validation: { valid: true } });
    expect((await handlers.loadCandidate({ env: {}, uid: 'teacher-1', candidateId })).body).toMatchObject({ candidate: { evidenceRefs: ['save:1'] } });
  });

  it('round-trips source and answer evidence separately without exposing it to students', async () => {
    const current = worker();
    const staged = await current.handlers.stage({
      request: request({
        operationId: operation('006'),
        expectedRevision: 0,
        content: activity,
        sourceEvidenceRefs: ['source:pdf:1'],
        answerEvidenceRefs: ['answer:key:1'],
      }),
      env: {},
      uid: 'teacher-1',
    });
    const candidateId = String((staged.body as Record<string, unknown>).candidateId);
    expect(staged.body).toMatchObject({
      sourceEvidenceRefs: ['source:pdf:1'],
      answerEvidenceRefs: ['answer:key:1'],
    });
    expect(await current.handlers.loadCandidate({ env: {}, uid: 'teacher-1', candidateId })).toMatchObject({
      body: { candidate: { sourceEvidenceRefs: ['source:pdf:1'], answerEvidenceRefs: ['answer:key:1'] } },
    });
    const student = worker({ profile: { role: 'student' } });
    await expect(student.handlers.loadCandidate({ env: {}, uid: 'student-1', candidateId }))
      .resolves.toMatchObject({ init: { status: 403 }, body: { code: 'authoring_forbidden' } });
  });

  it('revalidates persisted payload, blocks cross-owner reads, and fails closed on body abuse', async () => {
    const { handlers } = worker();
    const staged = await handlers.stage({ request: request({ operationId: operation('011'), expectedRevision: 0, content: activity }), env: {}, uid: 'teacher-1' });
    const candidateId = String((staged.body as Record<string, unknown>).candidateId);
    const otherOwner = await handlers.loadCandidate({ env: {}, uid: 'teacher-2', candidateId });
    expect(otherOwner.init.status).toBe(404);
    const extraField = await handlers.stage({ request: request({ operationId: operation('012'), expectedRevision: 0, content: activity, ownerId: 'teacher-2' }), env: {}, uid: 'teacher-1' });
    expect(extraField.init.status).toBe(400);
    const invalid = await handlers.stage({ request: request({ operationId: operation('013'), expectedRevision: 0, content: { ...activity, studentAnswers: ['leak'] } }), env: {}, uid: 'teacher-1' });
    expect(invalid.body).toMatchObject({ status: 'invalid', lifecycle: 'rejected', validation: { valid: false } });
  });

  it('preserves evidence when omitted, clears only explicit empty refs, and supports CAS discard tombstones', async () => {
    const { handlers } = worker();
    const staged = await handlers.stage({ request: request({ operationId: operation('021'), expectedRevision: 0, content: activity, evidenceRefs: ['source:1'] }), env: {}, uid: 'teacher-1' });
    const candidateId = String((staged.body as Record<string, unknown>).candidateId);
    const validated = await handlers.validate({ request: request({ operationId: operation('022'), candidateId, expectedRevision: 1 }), env: {}, uid: 'teacher-1' });
    expect(validated.body).toMatchObject({ evidenceRefs: ['source:1'], revision: 2 });
    const cleared = await handlers.validate({ request: request({ operationId: operation('023'), candidateId, expectedRevision: 2, evidenceRefs: [] }), env: {}, uid: 'teacher-1' });
    expect(cleared.body).toMatchObject({ evidenceRefs: [], revision: 3 });
    const discarded = await handlers.discard({ request: request({ operationId: operation('024'), candidateId, expectedRevision: 3 }), env: {}, uid: 'teacher-1' });
    expect(discarded.body).toMatchObject({ status: 'discarded', lifecycle: 'discarded', revision: 4 });
    const replay = await handlers.discard({ request: request({ operationId: operation('024'), candidateId, expectedRevision: 3 }), env: {}, uid: 'teacher-1' });
    expect(replay.body).toMatchObject({ status: 'discarded', replayed: true, revision: 4 });
    const stale = await handlers.discard({ request: request({ operationId: operation('025'), candidateId, expectedRevision: 3 }), env: {}, uid: 'teacher-1' });
    expect(stale.init.status).toBe(409);
    expect((await handlers.loadCandidate({ env: {}, uid: 'teacher-1', candidateId })).body).toMatchObject({ candidate: { lifecycle: 'discarded', content: null } });
  });

  it('full-replaces only owner draft after target and candidate CAS checks', async () => {
    const { handlers, state } = worker();
    const first = await handlers.stage({ request: request({ operationId: operation('026'), expectedRevision: 0, content: activity }), env: {}, uid: 'teacher-1' });
    const firstBody = first.body as Record<string, unknown>;
    await handlers.saveDraft({ request: request({ operationId: operation('027'), candidateId: firstBody.candidateId, expectedRevision: 1 }), env: {}, uid: 'teacher-1' });
    const replacement = await handlers.stage({ request: request({ operationId: operation('028'), expectedRevision: 1, targetActivityId: firstBody.targetActivityId, content: { ...activity, title: 'Replacement' } }), env: {}, uid: 'teacher-1' });
    const replacementId = String((replacement.body as Record<string, unknown>).candidateId);
    const saved = await handlers.saveDraft({ request: request({ operationId: operation('029'), candidateId: replacementId, expectedRevision: 1 }), env: {}, uid: 'teacher-1' });
    expect(saved.body).toMatchObject({ status: 'saved', revision: 2 });
    expect((state['teacher-1'].activities as Record<string, { draft: { title: string } }>)[String(firstBody.targetActivityId)].draft.title).toBe('Replacement');
  });

  it('fails closed on generated candidate ID collision', async () => {
    const { handlers } = worker({
      createRecordId: () => '123e4567-e89b-42d3-a456-426614174999',
    });
    const first = await handlers.stage({ request: request({ operationId: operation('041'), expectedRevision: 0, content: activity }), env: {}, uid: 'teacher-1' });
    const candidateId = String((first.body as Record<string, unknown>).candidateId);
    const collision = await handlers.stage({ request: request({ operationId: operation('042'), expectedRevision: 0, content: { ...activity, title: 'Cannot overwrite' } }), env: {}, uid: 'teacher-1' });
    expect(collision.init.status).toBe(409);
    expect(collision.body).toEqual({ status: 'id-collision' });
    expect((await handlers.loadCandidate({ env: {}, uid: 'teacher-1', candidateId })).body).toMatchObject({ candidate: { content: activity } });
  });

  it('fails closed on poisoned persisted identities without overwriting owner state', async () => {
    const current = worker();
    const staged = await current.handlers.stage({
      request: request({
        operationId: operation('043'),
        expectedRevision: 0,
        content: activity,
      }),
      env: {},
      uid: 'teacher-1',
    });
    const candidateId = String((staged.body as Record<string, unknown>).candidateId);
    const candidates = current.state['teacher-1'].candidates as Record<string, unknown>;
    candidates['candidate-poisoned-map-key'] = structuredClone(candidates[candidateId]);
    const before = structuredClone(current.state['teacher-1']);

    const rejected = await current.handlers.stage({
      request: request({
        operationId: operation('044'),
        expectedRevision: 0,
        content: activity,
      }),
      env: {},
      uid: 'teacher-1',
    });
    expect(rejected).toMatchObject({
      body: { code: 'invalid_persisted_candidate' },
      init: { status: 500 },
    });
    expect(current.state['teacher-1']).toEqual(before);
  });

  it('rejects poisoned owner, operation-key, and evidence invariants', async () => {
    const wrongOwner = worker();
    const ownerStage = await wrongOwner.handlers.stage({
      request: request({ operationId: operation('045'), expectedRevision: 0, content: activity }),
      env: {},
      uid: 'teacher-1',
    });
    const ownerCandidateId = String((ownerStage.body as Record<string, unknown>).candidateId);
    const ownerCandidate = (
      wrongOwner.state['teacher-1'].candidates as Record<string, Record<string, unknown>>
    )[ownerCandidateId]!;
    ownerCandidate.ownerId = 'teacher-2';
    await expect(wrongOwner.handlers.loadCandidate({
      env: {},
      uid: 'teacher-1',
      candidateId: ownerCandidateId,
    })).resolves.toMatchObject({
      body: { code: 'invalid_persisted_candidate' },
      init: { status: 500 },
    });

    const wrongOperation = worker();
    await wrongOperation.handlers.stage({
      request: request({ operationId: operation('046'), expectedRevision: 0, content: activity }),
      env: {},
      uid: 'teacher-1',
    });
    const operations = wrongOperation.state['teacher-1'].operations as Record<string, unknown>;
    operations['not-an-operation-uuid'] = operations[operation('046')];
    delete operations[operation('046')];
    const operationRejected = await wrongOperation.handlers.stage({
      request: request({ operationId: operation('047'), expectedRevision: 0, content: activity }),
      env: {},
      uid: 'teacher-1',
    });
    expect(operationRejected).toMatchObject({
      body: { code: 'invalid_persisted_operation' },
      init: { status: 500 },
    });

    const excessEvidence = worker();
    const evidenceStage = await excessEvidence.handlers.stage({
      request: request({ operationId: operation('048'), expectedRevision: 0, content: activity }),
      env: {},
      uid: 'teacher-1',
    });
    const evidenceCandidateId = String(
      (evidenceStage.body as Record<string, unknown>).candidateId,
    );
    const evidenceCandidate = (
      excessEvidence.state['teacher-1'].candidates as Record<string, Record<string, unknown>>
    )[evidenceCandidateId]!;
    evidenceCandidate.evidenceRefs = Array.from({ length: 33 }, (_, index) => `source:${index}`);
    await expect(excessEvidence.handlers.loadCandidate({
      env: {},
      uid: 'teacher-1',
      candidateId: evidenceCandidateId,
    })).resolves.toMatchObject({
      body: { code: 'invalid_persisted_candidate' },
      init: { status: 500 },
    });
  });

  it('refuses discard of a poisoned retained candidate without writing a tombstone', async () => {
    const current = worker();
    const staged = await current.handlers.stage({
      request: request({ operationId: operation('049'), expectedRevision: 0, content: activity }),
      env: {},
      uid: 'teacher-1',
    });
    const candidateId = String((staged.body as Record<string, unknown>).candidateId);
    const candidate = (
      current.state['teacher-1'].candidates as Record<string, Record<string, unknown>>
    )[candidateId]!;
    candidate.content = { poisoned: true };
    const before = structuredClone(current.state['teacher-1']);
    const discarded = await current.handlers.discard({
      request: request({ operationId: operation('04a'), candidateId, expectedRevision: 1 }),
      env: {},
      uid: 'teacher-1',
    });
    expect(discarded).toMatchObject({
      init: { status: 500 },
      body: { code: 'invalid_persisted_candidate' },
    });
    expect(current.state['teacher-1']).toEqual(before);
  });

  it('keeps the operation ledger bounded while accepting later commands', async () => {
    const current = worker();
    const staged = await current.handlers.stage({
      request: request({ operationId: operation('050'), expectedRevision: 0, content: activity }),
      env: {},
      uid: 'teacher-1',
    });
    const candidateId = String((staged.body as Record<string, unknown>).candidateId);
    let lastStatus = 0;
    for (let index = 0; index < 260; index += 1) {
      const suffix = (0x100 + index).toString(16).padStart(3, '0');
      const response = await current.handlers.validate({
        request: request({
          operationId: operation(suffix),
          candidateId,
          expectedRevision: 0,
        }),
        env: {},
        uid: 'teacher-1',
      });
      lastStatus = response.init.status;
    }
    expect(lastStatus).toBe(409);
    expect(Object.keys(current.state['teacher-1'].operations ?? {})).toHaveLength(256);
  });

  it('rejects streamed 256KiB-plus body without Content-Length and leaves no candidate state', async () => {
    const { handlers, state } = worker();
    const oversized = new Request('https://worker.test/book-activity-authoring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"x":"')); controller.enqueue(new Uint8Array(256 * 1024)); controller.close(); } }),
      duplex: 'half',
    } as RequestInit);
    expect(oversized.headers.get('Content-Length')).toBeNull();
    const response = await handlers.stage({ request: oversized, env: {}, uid: 'teacher-1' });
    expect(response.init.status).toBe(413);
    expect(state['teacher-1']).toBeUndefined();
  });

  it('rechecks revoked auth and does not partially write candidate/activity state on crash before commit', async () => {
    const revoked = worker({ profile: { role: 'teacher', forceReauth: true } });
    const forbidden = await revoked.handlers.stage({ request: request({ operationId: operation('031'), expectedRevision: 0, content: activity }), env: {}, uid: 'teacher-1' });
    expect(forbidden.init.status).toBe(403);
    expect(revoked.state['teacher-1']).toBeUndefined();
    const crashing = worker();
    const staged = await crashing.handlers.stage({ request: request({ operationId: operation('032'), expectedRevision: 0, content: activity }), env: {}, uid: 'teacher-1' });
    const candidateId = String((staged.body as Record<string, unknown>).candidateId);
    crashing.crashNextCommit();
    const failed = await crashing.handlers.saveDraft({ request: request({ operationId: operation('033'), candidateId, expectedRevision: 1 }), env: {}, uid: 'teacher-1' });
    expect(failed.init.status).toBe(500);
    expect(crashing.state['teacher-1']).toMatchObject({ candidates: { [candidateId]: { lifecycle: 'staged' } } });
    expect((crashing.state['teacher-1'].activities as Record<string, unknown> | undefined) ?? {}).toEqual({});
  });

  it('uses owner-scoped ETag path and rejects mismatched dedicated credential identity', async () => {
    const calls: string[] = [];
    const repository = new FirebaseRestBookActivityAuthoringRepository({
      env: { FIREBASE_DB_URL: 'https://db.test', BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@test.example', GOOGLE_SA_KEY: 'must-not-be-used' },
      getAccessToken: async () => 'test-token',
      fetchImpl: async (input) => {
        calls.push(String(input));
        return calls.length === 1
          ? new Response('{}', { headers: { etag: '"v1"' } })
          : new Response('{}');
      },
    });
    await repository.transaction('teacher-1', () => ({ outcome: { ok: true }, next: { candidates: {} }, write: true }));
    expect(calls).toEqual([
      'https://db.test/book_activity_authoring/owners/teacher-1.json',
      'https://db.test/book_activity_authoring/owners/teacher-1.json',
    ]);
    expect(() => new FirebaseRestBookActivityAuthoringRepository({
      env: { BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@test.example', BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'wrong@test.example', private_key: 'not-used' }) },
    })).toThrow('book_activity_authoring_service_identity_mismatch');
  });

  it('rejects reads outside user-auth and owner-scoped authoring paths', async () => {
    const repository = new FirebaseRestBookActivityAuthoringRepository({
      env: {
        FIREBASE_DB_URL: 'https://db.test',
        BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@test.example',
      },
      getAccessToken: async () => 'test-token',
      fetchImpl: async () => new Response('{}'),
    });
    await expect(repository.readValue('users/teacher-1')).resolves.toEqual({});
    await expect(repository.readValue('material_catalog/books/book-1'))
      .rejects.toThrow('book_activity_authoring_path_forbidden');
    await expect(repository.readValue('book_activity_authoring/owners/teacher-1'))
      .resolves.toEqual({});
  });

  it('rejects malformed owner roots instead of coercing and overwriting them', async () => {
    const requests: string[] = [];
    const repository = new FirebaseRestBookActivityAuthoringRepository({
      env: {
        FIREBASE_DB_URL: 'https://db.test',
        BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@test.example',
      },
      getAccessToken: async () => 'test-token',
      fetchImpl: async (input) => {
        requests.push(String(input));
        return new Response('{"unexpected":{"preserve":true}}', {
          headers: { etag: '"v1"' },
        });
      },
    });
    await expect(repository.transaction(
      'teacher-1',
      () => ({ outcome: { ok: true }, next: {}, write: true }),
    )).rejects.toThrow('invalid_book_activity_authoring_root');
    expect(requests).toHaveLength(1);
  });

  it('rechecks authority immediately before every ETag write attempt', async () => {
    const requests: string[] = [];
    const repository = new FirebaseRestBookActivityAuthoringRepository({
      env: { FIREBASE_DB_URL: 'https://db.test', BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@test.example' },
      getAccessToken: async () => 'test-token',
      fetchImpl: async (_input, init) => {
        requests.push(String(init?.method));
        if (requests.length === 1 || requests.length === 3) {
          return new Response('{}', { headers: { etag: requests.length === 1 ? '"v1"' : '"v2"' } });
        }
        return new Response('{}', { status: requests.length === 2 ? 412 : 200 });
      },
    });
    let checks = 0;
    await repository.transaction('teacher-1', () => ({ outcome: { ok: true }, next: { candidates: {} }, write: true }), {
      beforeWrite: async () => { checks += 1; },
    });
    expect(requests).toEqual(['GET', 'PUT', 'GET', 'PUT']);
    expect(checks).toBe(2);
  });
});
