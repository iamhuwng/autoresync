import { describe, expect, it, vi } from 'vitest';
import { handleReplacementPlanRoute } from './route.ts';
import type { ReplacementPlanRouteDependencies } from './contract.ts';
import { canonicalReplacementAdapterFacts } from '../../../../../src/services/book-source-delivery/replacementPlan.service.ts';
import fragment from '../../book-rules/fragments/45.json';

const dependencies = (): ReplacementPlanRouteDependencies => ({
  enabled: false,
  repository: {
    createPlan: vi.fn(), readPlan: vi.fn(), readCurrent: vi.fn(), saveReview: vi.fn(), readReview: vi.fn(), cancel: vi.fn(), saveToken: vi.fn(), readToken: vi.fn(), invalidateTokens: vi.fn(),
  },
  snapshots: { readCurrent: vi.fn() },
  sourceSets: { resolve: vi.fn() },
  revisions: { read: vi.fn() },
  capacity: { read: vi.fn() },
});

describe('replacement plan route boundary', () => {
  it('binds explicit placement choices to the reviewed snapshot and rejects unknown or duplicate targets', async () => {
    const at = '2026-08-11T00:05:00.000Z';
    const revisions = { bookRevision: 1, publicationRevision: 1, sourceSetRevision: 1, sourceVersionRevisions: { source: 1 } };
    const plan = {
      schemaVersion: 1, planId: 'plan-1', ownerId: 'teacher-1', bookId: 'book-1',
      ...revisions, targetSourceSetRevision: 2, adapters: [], contexts: [{ contextKey: 'homework:one' }, { contextKey: 'homework:two' }],
      planFingerprint: 'b'.repeat(64), deltaFingerprint: 'c'.repeat(64),
      impactSnapshotId: 'snapshot-1', impactSnapshotFingerprint: 'a'.repeat(64), impactSnapshotRevisionVector: { book: 1 },
      expiresAt: '2026-08-11T01:00:00.000Z',
    } as never;
    const deps = { ...dependencies(), enabled: true, now: () => new Date(at) };
    vi.mocked(deps.repository.readCurrent).mockResolvedValue({ status: 'ready', plan, pointer: {} as never });
    vi.mocked(deps.revisions.read).mockResolvedValue({ revisionVector: { values: { book: 1 } }, currentRevisions: revisions, adapterFingerprint: (await canonicalReplacementAdapterFacts([])).fingerprint });
    vi.mocked(deps.snapshots.readCurrent).mockResolvedValue({ status: 'ready', snapshot: {
      actorId: 'teacher-1', ownerId: 'teacher-1', bookId: 'book-1', snapshotId: 'snapshot-1', inputFingerprint: 'a'.repeat(64), expiresAt: '2026-08-11T01:00:00.000Z',
      contexts: ['one', 'two'].map((key) => ({ contextKey: `homework:${key}`, updateAuthority: { ownerId: 'teacher-1', actorId: 'teacher-1', permitted: true }, impact: { effectiveWindow: null }, activityChoices: [{ placementId: `placement-${key}`, allowedChoices: ['adopt-successor'] }] })),
    } } as never);
    vi.mocked(deps.repository.saveReview).mockImplementation(async ({ review }) => ({ status: 'reviewed', review, receipt: {} as never }));
    const one = { contextKey: 'homework:one', placementId: 'placement-one', choice: 'adopt-successor' };
    const call = (selections?: unknown) => handleReplacementPlanRoute({ uid: 'teacher-1', dependencies: deps, request: new Request('https://worker.test/v1/book-replacement-plans/books/book-1/review', {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'review-operation' }, body: JSON.stringify({ planId: 'plan-1', planFingerprint: 'b'.repeat(64), reason: 'Replace component', ...(selections === undefined ? {} : { selections }) }),
    }) });
    const approved = await call([one]);
    expect(approved.status).toBe(200);
    const response = await approved.json();
    expect(response.review.selections).toEqual([one]);
    expect(response.handoff.selectionFingerprint).toBe(response.review.selectionFingerprint);
    expect(vi.mocked(deps.repository.saveToken).mock.calls[0]?.[0].token.selectionFingerprint).toBe(response.review.selectionFingerprint);
    expect((await call([one, one])).status).toBe(400);
    expect((await call([{ ...one, placementId: 'unknown' }])).status).toBe(400);
    const empty = await call();
    expect(empty.status).toBe(200);
    expect((await empty.json()).review.selections).toEqual([]);
    expect(deps.repository.saveReview).toHaveBeenCalledTimes(2);
  });

  it('authenticates before the disabled gate and any repository lookup', async () => {
    const deps = dependencies();
    const unauthorized = await handleReplacementPlanRoute({ request: new Request('https://worker.test/v1/book-replacement-plans/books/book-1/current'), dependencies: deps });
    expect(unauthorized.status).toBe(401);
    expect(deps.repository.readCurrent).not.toHaveBeenCalled();

    const disabled = await handleReplacementPlanRoute({ request: new Request('https://worker.test/v1/book-replacement-plans/books/book-1/current'), uid: 'teacher-1', dependencies: deps });
    expect(disabled.status).toBe(503);
    expect(deps.repository.readCurrent).not.toHaveBeenCalled();
  });

  it('rejects encoded slash path segments before owner/book lookup', async () => {
    const deps = { ...dependencies(), enabled: true };
    const response = await handleReplacementPlanRoute({ request: new Request('https://worker.test/v1/book-replacement-plans/books/book%2Fother/current'), uid: 'teacher-1', dependencies: deps });
    expect(response.status).toBe(404);
    expect(deps.repository.readCurrent).not.toHaveBeenCalled();
  });

  it('fails closed when the route clock is invalid', async () => {
    const deps = { ...dependencies(), enabled: true, now: () => new Date(Number.NaN) };
    const response = await handleReplacementPlanRoute({
      request: new Request('https://worker.test/v1/book-replacement-plans/books/book-1/current'),
      uid: 'teacher-1',
      dependencies: deps,
    });
    expect(response.status).toBe(503);
    expect(deps.repository.readCurrent).not.toHaveBeenCalled();
  });

  it('rejects stale client revision facts before resolving replacement sources', async () => {
    const adapterFingerprint = (await canonicalReplacementAdapterFacts([])).fingerprint;
    const deps = { ...dependencies(), enabled: true, now: () => new Date('2026-08-11T00:05:00.000Z') };
    vi.mocked(deps.snapshots.readCurrent).mockResolvedValue({
      status: 'ready',
      snapshot: { snapshotId: 'snapshot-1', inputFingerprint: 'a'.repeat(64), adapters: [] },
    } as never);
    vi.mocked(deps.revisions.read).mockResolvedValue({
      revisionVector: { values: { book: 1 } },
      currentRevisions: { bookRevision: 2, publicationRevision: 1, sourceSetRevision: 1, sourceVersionRevisions: { full: 1 } },
      adapterFingerprint,
    });
    const response = await handleReplacementPlanRoute({
      request: new Request('https://worker.test/v1/book-replacement-plans/books/book-1/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'operation-1' },
        body: JSON.stringify({
          sourceSetDelta: {},
          expectedCurrentRevisions: { bookRevision: 1, publicationRevision: 1, sourceSetRevision: 1, sourceVersionRevisions: { full: 1 } },
          expectedSnapshotFingerprint: 'a'.repeat(64),
          expectedSnapshotRevisionVector: { values: { book: 1 } },
        }),
      }),
      uid: 'teacher-1',
      dependencies: deps,
    });
    expect(response.status).toBe(409);
    expect(deps.sourceSets.resolve).not.toHaveBeenCalled();
    expect(deps.repository.createPlan).not.toHaveBeenCalled();
  });

  it('rejects obsolete browser authority fields', async () => {
    const deps = { ...dependencies(), enabled: true };
    const response = await handleReplacementPlanRoute({
      request: new Request('https://worker.test/v1/book-replacement-plans/books/book-1/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'operation-1' },
        body: JSON.stringify({
          sourceSetDelta: {},
          currentRevisions: { bookRevision: 1 },
          targetSourceSetRevision: 2,
          capacity: {},
          now: '2026-08-11T00:05:00.000Z',
          snapshotFingerprint: 'a'.repeat(64),
          snapshotRevisionVector: { values: { book: 1 } },
        }),
      }),
      uid: 'teacher-1',
      dependencies: deps,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'replacement_plan_request_invalid' });
    expect(deps.snapshots.readCurrent).not.toHaveBeenCalled();
  });

  it('uses the canonical fingerprint when current validation receives five unsorted adapters', async () => {
    const adapters = [
      { contextKind: 'public-reference', adapterId: 'public-reference-adapter', adapterVersion: 1, contractVersion: 1 },
      { contextKind: 'class', adapterId: 'class-adapter', adapterVersion: 1, contractVersion: 1 },
      { contextKind: 'course', adapterId: 'course-adapter', adapterVersion: 1, contractVersion: 1 },
      { contextKind: 'homework', adapterId: 'homework-adapter', adapterVersion: 1, contractVersion: 1 },
      { contextKind: 'solo', adapterId: 'solo-adapter', adapterVersion: 1, contractVersion: 1 },
    ] as const;
    const revisions = {
      bookRevision: 7,
      publicationRevision: 4,
      sourceSetRevision: 8,
      sourceVersionRevisions: { full: 2 },
    } as const;
    const plan = {
      planId: 'plan-1',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      impactSnapshotId: 'snapshot-1',
      impactSnapshotFingerprint: 'a'.repeat(64),
      impactSnapshotRevisionVector: { book: 7 },
      adapters,
      ...revisions,
    } as never;
    const deps = { ...dependencies(), enabled: true, now: () => new Date('2026-08-11T00:05:00.000Z') };
    vi.mocked(deps.repository.readCurrent).mockResolvedValue({
      status: 'ready',
      plan,
      pointer: { planId: 'plan-1', planFingerprint: 'b'.repeat(64), ownerId: 'teacher-1', bookId: 'book-1', status: 'current', updatedAt: '2026-08-11T00:00:00.000Z' },
    });
    vi.mocked(deps.revisions.read).mockResolvedValue({
      revisionVector: { values: { book: 7 } },
      currentRevisions: revisions,
      adapterFingerprint: (await canonicalReplacementAdapterFacts(adapters)).fingerprint,
    });

    const response = await handleReplacementPlanRoute({
      request: new Request('https://worker.test/v1/book-replacement-plans/books/book-1/current'),
      uid: 'teacher-1',
      dependencies: deps,
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as { status: string }).toMatchObject({ status: 'ready' });
    expect(deps.repository.invalidateTokens).not.toHaveBeenCalled();
  });

  it('keeps the inactive fragment deny-only and owner/book scoped', () => {
    expect(fragment.status).toBe('inactive');
    const operations = fragment.operations as readonly { path: string; rule: string; expression: string }[];
    expect(operations.filter((entry) => entry.path === 'book_replacement_plans').map((entry) => entry.expression)).toEqual(['false', 'false']);
    expect(operations.filter((entry) => entry.expression !== 'false').every((entry) => entry.expression.includes('auth.token.bis.s == true'))).toBe(true);
    expect(operations.filter((entry) => entry.expression !== 'false').every((entry) => entry.expression.includes('auth.token.bis.o == $ownerId'))).toBe(true);
  });
});
