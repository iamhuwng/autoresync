import { describe, expect, it, vi } from 'vitest';
import { handleReplacementPlanRoute } from './route.ts';
import type { ReplacementPlanRouteDependencies } from './contract.ts';
import fragment from '../../book-rules/fragments/45.json';

const dependencies = (): ReplacementPlanRouteDependencies => ({
  enabled: false,
  repository: {
    createPlan: vi.fn(), readPlan: vi.fn(), readCurrent: vi.fn(), saveReview: vi.fn(), readReview: vi.fn(), cancel: vi.fn(), saveToken: vi.fn(), readToken: vi.fn(), invalidateTokens: vi.fn(),
  },
  snapshots: { readCurrent: vi.fn() },
  sourceSets: { resolve: vi.fn() },
  revisions: { read: vi.fn() },
});

describe('replacement plan route boundary', () => {
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
    const adapterFingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('[]')))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
          currentRevisions: { bookRevision: 1, publicationRevision: 1, sourceSetRevision: 1, sourceVersionRevisions: { full: 1 } },
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
    expect(response.status).toBe(409);
    expect(deps.sourceSets.resolve).not.toHaveBeenCalled();
    expect(deps.repository.createPlan).not.toHaveBeenCalled();
  });

  it('keeps the inactive fragment deny-only and owner/book scoped', () => {
    expect(fragment.status).toBe('inactive');
    const operations = fragment.operations as readonly { path: string; rule: string; expression: string }[];
    expect(operations.filter((entry) => entry.path === 'book_replacement_plans').map((entry) => entry.expression)).toEqual(['false', 'false']);
    expect(operations.filter((entry) => entry.expression !== 'false').every((entry) => entry.expression.includes('auth.token.bis.s == true'))).toBe(true);
    expect(operations.filter((entry) => entry.expression !== 'false').every((entry) => entry.expression.includes('auth.token.bis.o == $ownerId'))).toBe(true);
  });
});
