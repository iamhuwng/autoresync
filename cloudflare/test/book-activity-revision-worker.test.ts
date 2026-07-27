import { describe, expect, it, vi } from 'vitest';
import {
  createBookActivityRevisionWorkerHandlers,
  type TrustedActivityRevisionResult,
} from '../src/upload-worker/book-activity/activity-revision-worker';

const OPERATION = '00000000-0000-4000-8000-000000000068';
const env = { BOOK_ACTIVITY_REVISION_ENABLED: 'true' };
const replacement = {
  schemaVersion: 1,
  title: 'Complete the sentences',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Complete each sentence.' }],
  interaction: { family: 'text-entry', variant: 'fill-blank' },
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
  stimulus: { kind: 'sentence-list' },
  assetRefs: [],
  interactions: [{ prompt: 'I _____ here.', acceptedAnswers: ['have lived'] }],
  scoring: { mode: 'auto-where-possible' },
};
const projection = {
  schemaVersion: 1,
  title: replacement.title,
  taskProfile: null,
  presentationMode: replacement.presentationMode,
  contextRequirement: replacement.contextRequirement,
  instructions: replacement.instructions,
  interaction: replacement.interaction,
  answerRule: replacement.answerRule,
  stimulus: replacement.stimulus,
  assetRefs: [],
  interactions: [{ interactionId: 'interaction-1', prompt: 'I _____ here.', family: 'text-entry' }],
  scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
};
const request = (body: Record<string, unknown>, headers: Record<string, string> = {}): Request => new Request('https://worker.test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const command = (overrides: Record<string, unknown> = {}) => ({
  activityId: 'activity-1',
  candidateId: 'candidate-1',
  expectedCandidateRevision: 4,
  expectedCurrentActivityVersionId: 'activity-1-v3',
  expectedCurrentActivityVersion: 3,
  expectedSourceContext: { bookId: 'book-1', sourceVersionId: 'source-v2', pageRefs: ['full:4'] },
  replacementContent: replacement,
  previewApproval: {
    approvalId: 'fnv1a64:0000000000000000',
    approvedAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-28T00:10:00.000Z',
  },
  operationId: OPERATION,
  ...overrides,
});
const revised = (overrides: Partial<Extract<TrustedActivityRevisionResult, { status: 'revised' }>> & { status?: 'revised' | 'replayed' } = {}): TrustedActivityRevisionResult => ({
  status: 'revised',
  activityId: 'activity-1',
  activityVersionId: 'activity-1-v4',
  activityVersion: 4,
  predecessorActivityVersionId: 'activity-1-v3',
  candidateId: 'candidate-1',
  candidateRevision: 5,
  placementIds: ['placement-1'],
  diff: { classification: 'regrade', reasons: ['answer-or-scoring'], requiresRedo: false },
  projection,
  ...overrides,
});

const handlersFor = (revisionService: { revalidateAndCommit: ReturnType<typeof vi.fn> }) => createBookActivityRevisionWorkerHandlers({
  revisionService,
  authenticate: vi.fn(async () => undefined),
});

describe('PRD0062 #68 standalone Activity revision Worker', () => {
  it('fails closed by default before parsing or calling authority', async () => {
    const service = { revalidateAndCommit: vi.fn() };
    const handlers = handlersFor(service);
    const result = await handlers.publish({
      request: request(command()),
      env: {},
      uid: 'teacher-1',
    });
    expect(result).toMatchObject({ init: { status: 503 }, body: { code: 'activity_revision_disabled' } });
    expect(service.revalidateAndCommit).not.toHaveBeenCalled();
  });

  it('fails closed when the canonical verified-auth seam is not configured', async () => {
    const service = { revalidateAndCommit: vi.fn() };
    const handlers = createBookActivityRevisionWorkerHandlers({ revisionService: service });
    const result = await handlers.publish({
      request: request(command()),
      env,
      uid: 'teacher-1',
    });
    expect(result).toMatchObject({ init: { status: 503 }, body: { code: 'revision_auth_unconfigured' } });
    expect(service.revalidateAndCommit).not.toHaveBeenCalled();
  });

  it('passes actor and every exact current precondition to injected authority', async () => {
    const service = { revalidateAndCommit: vi.fn(async () => revised()) };
    const handlers = handlersFor(service);
    const result = await handlers.publish({
      request: request(command(), { 'Idempotency-Key': OPERATION }),
      env,
      uid: 'teacher-1',
    });
    expect(result.init.status).toBe(200);
    expect(service.revalidateAndCommit).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      ...command(),
      evidenceRefs: [],
      sourceEvidenceRefs: [],
      answerEvidenceRefs: [],
    });
  });

  it.each([
    ['conflict', 409],
    ['idempotency-conflict', 409],
    ['invalid', 422],
    ['not-found', 404],
    ['forbidden', 403],
  ] as const)('maps authority %s without pretending mutation succeeded', async (status, httpStatus) => {
    const service = { revalidateAndCommit: vi.fn(async () => ({ status, failureCode: `failure-${status}` } as TrustedActivityRevisionResult)) };
    const handlers = handlersFor(service);
    await expect(handlers.publish({ request: request(command()), env, uid: 'teacher-1' })).resolves.toMatchObject({
      init: { status: httpStatus },
      body: { status, failureCode: `failure-${status}` },
    });
  });

  it('returns answer-safe revision and replay payloads only', async () => {
    const service = { revalidateAndCommit: vi.fn()
      .mockResolvedValueOnce(revised())
      .mockResolvedValueOnce(revised({ status: 'replayed' })) };
    const handlers = handlersFor(service);
    const first = await handlers.publish({ request: request(command()), env, uid: 'teacher-1' });
    const replay = await handlers.publish({ request: request(command()), env, uid: 'teacher-1' });
    for (const result of [first, replay]) {
      expect(result.init.status).toBe(200);
      expect(result.body).toMatchObject({ activityId: 'activity-1', projection: { interactions: [{ interactionId: 'interaction-1' }] } });
      expect(JSON.stringify(result.body)).not.toContain('have lived');
      expect(result.body).not.toHaveProperty('replacementContent');
      expect(result.body).not.toHaveProperty('answerKey');
    }
    expect(replay.body.status).toBe('replayed');
  });

  it('rejects malformed body, mismatched operation, and oversized payload before authority', async () => {
    const service = { revalidateAndCommit: vi.fn(async () => revised()) };
    const handlers = handlersFor(service);
    await expect(handlers.publish({ request: new Request('https://worker.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }), env, uid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 400 }, body: { code: 'malformed_json' } });
    await expect(handlers.publish({ request: request(command(), { 'Idempotency-Key': '00000000-0000-4000-8000-000000000069' }), env, uid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 400 }, body: { code: 'operation_id_mismatch' } });
    const oversized = { ...command(), replacementContent: { ...replacement, title: 'x'.repeat(260 * 1024) } };
    await expect(handlers.publish({ request: request(oversized), env, uid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 413 } });
    expect(service.revalidateAndCommit).not.toHaveBeenCalled();
  });

  it('fails closed when injected service returns malformed success data', async () => {
    const service = { revalidateAndCommit: vi.fn(async () => ({
      ...revised(),
      projection: { ...projection, interactions: [{ answerKey: { acceptedAnswers: ['secret'] } }] },
    } as TrustedActivityRevisionResult)) };
    const handlers = handlersFor(service);
    await expect(handlers.publish({ request: request(command()), env, uid: 'teacher-1' })).resolves.toMatchObject({
      init: { status: 502 },
      body: { code: 'malformed_service_response' },
    });
  });

  it('rejects nested projection secrets before returning student-safe data', async () => {
    const service = { revalidateAndCommit: vi.fn(async () => ({
      ...revised(),
      projection: { ...projection, content: { teacherNotes: 'private' } },
    } as TrustedActivityRevisionResult)) };
    const handlers = handlersFor(service);
    await expect(handlers.publish({ request: request(command()), env, uid: 'teacher-1' })).resolves.toMatchObject({
      init: { status: 502 },
      body: { code: 'malformed_service_response' },
    });
  });
});
