import { describe, expect, it, vi } from 'vitest';
import { createReplacementPlan } from '../../src/services/book-source-delivery/replacementPlan.service.ts';
import type { ReplacementPlanRouteDependencies } from '../src/upload-worker/book-delivery/replacement-plans/contract.ts';
import { FirebaseRestReplacementPlanRepository } from '../src/upload-worker/book-delivery/replacement-plans/repository.ts';
import { handleReplacementPlanRoute } from '../src/upload-worker/book-delivery/replacement-plans/route.ts';

vi.mock('../../src/services/book-source-delivery/replacementPlan.service.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/book-source-delivery/replacementPlan.service.ts')>(),
  createReplacementPlan: vi.fn(),
  isReplacementPlanExpired: vi.fn(() => false),
}));

const revisionFacts = {
  revisionVector: { values: { book: 2 } },
  currentRevisions: { bookRevision: 2, publicationRevision: 1, sourceSetRevision: 3, sourceVersionRevisions: { full: 1 } },
  adapterFingerprint: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
} as const;
const oldSourceSet = { sourceSet: {}, sources: [] } as never;
const nextSourceSet = { sourceSet: {}, sources: [] } as never;
const trustedCapacity = {
  current: { trackedAccountBytes: 10, pendingUploadBytes: 20, replacementUploadBytes: 30, temporaryBytes: 40 },
  additionalBytes: 50,
} as const;
type CreatePlanInput = Parameters<ReplacementPlanRouteDependencies['repository']['createPlan']>[0];
type CreatePlanResult = Awaited<ReturnType<ReplacementPlanRouteDependencies['repository']['createPlan']>>;

const body = (overrides: Record<string, unknown> = {}) => ({
  sourceSetDelta: { mappings: [] },
  expectedCurrentRevisions: revisionFacts.currentRevisions,
  expectedSnapshotFingerprint: 'a'.repeat(64),
  expectedSnapshotRevisionVector: revisionFacts.revisionVector,
  ...overrides,
});

const dependencies = (overrides: Partial<ReplacementPlanRouteDependencies> = {}): ReplacementPlanRouteDependencies => ({
  enabled: true,
  repository: {
    createPlan: vi.fn(async (input: CreatePlanInput): Promise<CreatePlanResult> => ({ status: 'created', plan: input.plan, receipt: { operationId: input.operationId } as never })),
    readPlan: vi.fn(), readCurrent: vi.fn(), saveReview: vi.fn(), readReview: vi.fn(), cancel: vi.fn(), saveToken: vi.fn(), readToken: vi.fn(), invalidateTokens: vi.fn(),
  },
  snapshots: {
    readCurrent: vi.fn(async () => ({
      status: 'ready' as const,
      snapshot: { snapshotId: 'snapshot-1', inputFingerprint: 'a'.repeat(64), adapters: [] },
    } as never)),
  },
  sourceSets: {
    resolve: vi.fn(async () => ({ old: oldSourceSet, next: nextSourceSet, targetSourceSetRevision: 4 })),
  },
  revisions: { read: vi.fn(async () => revisionFacts) },
  capacity: { read: vi.fn(async () => trustedCapacity) },
  now: () => new Date('2026-08-11T00:05:00.000Z'),
  ...overrides,
});

const request = (value: Record<string, unknown>) => new Request(
  'https://worker.test/v1/book-replacement-plans/books/book-1/plan',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'operation-1' },
    body: JSON.stringify(value),
  },
);

describe('replacement plan authority correction', () => {
  it('fails closed without a trusted capacity adapter', async () => {
    const deps = dependencies();
    (deps as unknown as { capacity?: unknown }).capacity = undefined;

    const response = await handleReplacementPlanRoute({ request: request(body()), uid: 'teacher-1', dependencies: deps });

    expect(response.status).toBe(503);
    expect(vi.mocked(createReplacementPlan)).not.toHaveBeenCalled();
    expect(deps.repository.createPlan).not.toHaveBeenCalled();
  });

  it('uses trusted target and capacity facts derived from the expected tokens', async () => {
    vi.mocked(createReplacementPlan).mockResolvedValue({ status: 'ready', plan: {} as never });
    const deps = dependencies();

    const response = await handleReplacementPlanRoute({ request: request(body()), uid: 'teacher-1', dependencies: deps });

    expect(response.status).toBe(200);
    expect(createReplacementPlan).toHaveBeenCalledWith(expect.objectContaining({
      targetSourceSetRevision: 4,
      capacity: trustedCapacity,
      currentRevisions: revisionFacts.currentRevisions,
    }));
    expect(deps.repository.createPlan).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation-1' }));
  });

  it('rejects obsolete browser authority fields', async () => {
    const deps = dependencies();
    const response = await handleReplacementPlanRoute({
      request: request({
        ...body(),
        currentRevisions: revisionFacts.currentRevisions,
        targetSourceSetRevision: 999_999,
        capacity: trustedCapacity,
        now: '1999-01-01T00:00:00.000Z',
        snapshotFingerprint: 'a'.repeat(64),
        snapshotRevisionVector: revisionFacts.revisionVector,
      }),
      uid: 'teacher-1',
      dependencies: deps,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'replacement_plan_request_invalid' });
    expect(deps.snapshots.readCurrent).not.toHaveBeenCalled();
    expect(deps.repository.createPlan).not.toHaveBeenCalled();
  });

  it.each([
    ['snapshot', { snapshots: { readCurrent: vi.fn(async () => ({ status: 'missing' as const })) } }, 'replacement_plan_snapshot_missing'],
    ['revision', { revisions: { read: vi.fn(async () => null) } }, 'replacement_plan_revision_facts_stale'],
    ['source set', { sourceSets: { resolve: vi.fn(async () => null) } }, 'replacement_plan_source_set_unavailable'],
    ['target revision', { sourceSets: { resolve: vi.fn(async () => ({ old: oldSourceSet, next: nextSourceSet, targetSourceSetRevision: 3 })) } }, 'replacement_plan_authority_unavailable'],
    ['capacity', { capacity: { read: vi.fn(async () => null) } }, 'replacement_plan_authority_unavailable'],
  ] as const)('does not create a plan when authoritative %s data is unavailable', async (_name, overrides, code) => {
    const deps = dependencies(overrides);
    const response = await handleReplacementPlanRoute({ request: request(body()), uid: 'teacher-1', dependencies: deps });

    expect(response.status).toBe(code.includes('snapshot') ? 404 : code.includes('stale') || code.includes('source_set') ? 409 : 503);
    expect(await response.json()).toEqual({ code });
    expect(deps.repository.createPlan).not.toHaveBeenCalled();
  });

  it('rejects a persisted plan without complete authority facts before any RTDB write', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const repository = new FirebaseRestReplacementPlanRepository({
      env: {
        BOOK_REPLACEMENT_PLAN_SERVICE_IDENTITY: 'replacement-plan-service',
        BOOK_REPLACEMENT_PLAN_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'replacement-plan-service' }),
      },
      fetchImpl,
    });

    await expect(repository.createPlan({
      plan: { schemaVersion: 1, planId: 'plan-1', ownerId: 'teacher-1', bookId: 'book-1' } as never,
      operationId: 'operation-1',
      now: '2026-08-11T00:05:00.000Z',
    })).rejects.toThrow('invalid_replacement_plan_create');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
