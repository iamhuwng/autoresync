import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCapacityProbeWorker,
  getCanonicalCapacityExpectedTotals,
} from '../src/book-source-worker/capacity-probe-worker';

const workerErrors: unknown[] = [];
const readZeroExpectedTotals = vi.fn(async () => ({ totalBytes: 0, objectCount: 0, revision: 0 }));
const writeReconciliationSnapshot = vi.fn(async () => undefined);
const worker = createCapacityProbeWorker({
  onError: (error) => workerErrors.push(error),
  readExpectedTotals: readZeroExpectedTotals,
  writeReconciliationSnapshot,
});

beforeEach(() => {
  workerErrors.length = 0;
  readZeroExpectedTotals.mockClear();
  writeReconciliationSnapshot.mockClear();
});

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const env = () => ({
  BOOK_SOURCE_CAPACITY_PROBE_STATE: 'enabled', BOOK_SOURCE_CAPACITY_PROBE_TOKEN: 'probe-bearer-secret', BOOK_SOURCE_CAPACITY_CURSOR_KEY: key,
  BOOK_SOURCE_CAPACITY_ENVIRONMENT: 'staging',
  FIREBASE_DATABASE_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
  BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL: 'book-source-worker-runtime@temp-a1437.iam.gserviceaccount.com',
  BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: 'test-only-placeholder',
  BOOK_SOURCE_CAPACITY_ACCOUNT_ID: 'book_b2_primary',
  BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', BOOK_SOURCE_B2_REGION: 'us-west-004',
  BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'book_b2_primary', BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'private-bucket-id',
  BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'private-book-pdfs', BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY_ID: 'capacity-key-id', BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY: 'capacity-key-secret',
});
const authorize = () => Response.json({ authorizationToken: 'b2-token', apiInfo: { storageApi: {
  apiUrl: 'https://api004.backblazeb2.com', s3ApiUrl: 'https://s3.us-west-004.backblazeb2.com',
  allowed: { capabilities: ['listFiles'], buckets: [{ id: 'private-bucket-id', name: 'private-book-pdfs' }], namePrefix: null },
} } });
const request = (body: unknown, overrides: RequestInit = {}) => new Request('https://worker.test/internal/book-source-capacity/reconciliation-page', {
  method: 'POST', headers: { authorization: 'Bearer probe-bearer-secret', 'content-type': 'application/json', ...(overrides.headers ?? {}) }, body: JSON.stringify(body), ...overrides,
});

describe('Book Source capacity probe worker', () => {
  it('is disabled by default and rejects route, method, query, auth, and bounded invalid bodies without B2', async () => {
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', fetcher);
    const cases = [
      [new Request('https://worker.test/internal/book-source-capacity/reconciliation-page'), env()],
      [new Request('https://worker.test/internal/book-source-capacity/reconciliation-page?x=1', { method: 'POST' }), env()],
      [request({}, { headers: { authorization: 'Bearer wrong' } }), env()],
      [request({ bad: true }), env()],
      [request({ expectedTotalBytes: 1, expectedObjectCount: 1 }), env()],
      [request({}, { headers: { authorization: 'Bearer probe-bearer-secret', 'content-type': 'text/plain' } }), env()],
      [new Request('https://worker.test/internal/book-source-capacity/reconciliation-page', {
        method: 'POST',
        headers: {
          authorization: 'Bearer probe-bearer-secret',
          'content-length': '99999',
          'content-type': 'application/json',
        },
        body: '{}',
      }), env()],
      [request({}), { ...env(), BOOK_SOURCE_CAPACITY_ENVIRONMENT: 'production' }],
      [request({}), { ...env(), BOOK_SOURCE_CAPACITY_MAX_PROVIDER_PAGES: '0' }],
      [request({}), {}],
    ] as const;
    for (const [input, bindings] of cases) {
      const response = await worker.fetch(input, bindings);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ code: 'unavailable' });
    }
    expect(fetcher).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });

  it('fails closed when the deployment object-page budget is exceeded', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => (
      String(url).includes('b2_authorize_account')
        ? authorize()
        : Response.json({
          files: [{ action: 'upload', fileId: 'first', fileName: 'a.pdf', contentLength: 1 }],
          nextFileName: 'b.pdf',
          nextFileId: 'next',
        })
    ));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(request({}), {
      ...env(),
      BOOK_SOURCE_CAPACITY_MAX_PROVIDER_PAGES: '1',
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'unavailable' });
    expect(workerErrors).toEqual([
      expect.objectContaining({ code: 'reconciliation_bound_exceeded' }),
    ]);
    expect(writeReconciliationSnapshot).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('does exactly one provider page per request; continuation is sealed and result leaks no B2/totals/config', async () => {
    let listCount = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('b2_authorize_account')) return authorize();
      listCount += 1;
      return listCount === 1
        ? Response.json({ files: [{ action: 'upload', fileId: 'first', fileName: 'a.pdf', contentLength: 4 }], nextFileName: 'b.pdf', nextFileId: 'next' })
        : Response.json({ files: [{ action: 'upload', fileId: 'second', fileName: 'b.pdf', contentLength: 6 }] });
    });
    vi.stubGlobal('fetch', fetcher);
    const readExpectedTotals = vi.fn(async () => ({ totalBytes: 10, objectCount: 2, revision: 7 }));
    const writeSnapshot = vi.fn(async () => undefined);
    const exactWorker = createCapacityProbeWorker({
      onError: (error) => workerErrors.push(error),
      readExpectedTotals,
      writeReconciliationSnapshot: writeSnapshot,
    });
    const first = await exactWorker.fetch(request({}), env());
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { state: string; continuationToken: string };
    expect(firstBody.state).toBe('continue');
    expect(firstBody.continuationToken).not.toContain('b.pdf');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const second = await exactWorker.fetch(request({ continuationToken: firstBody.continuationToken }), env());
    expect(await second.json()).toEqual({ state: 'complete', status: 'healthy' });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(readExpectedTotals).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).toHaveBeenCalledWith(
      env(),
      expect.objectContaining({
        expectedRevision: 7,
        snapshot: expect.objectContaining({
          status: 'healthy',
          totalBytes: 10,
          objectCount: 2,
        }),
      }),
    );
    const driftFetcher = vi.fn<typeof fetch>(async (url) => (
      String(url).includes('b2_authorize_account')
        ? authorize()
        : Response.json({
          files: [{ action: 'upload', fileId: 'drift', fileName: 'drift.pdf', contentLength: 1 }],
        })
    ));
    vi.stubGlobal('fetch', driftFetcher);
    const drift = await worker.fetch(request({}), env());
    expect(driftFetcher).toHaveBeenCalledTimes(2);
    expect(workerErrors).toEqual([]);
    expect(await drift.json()).toEqual({ state: 'complete', status: 'drift' });
    expect(writeReconciliationSnapshot).toHaveBeenCalledWith(
      env(),
      expect.objectContaining({
        expectedRevision: 0,
        snapshot: expect.objectContaining({
          status: 'drift',
          totalBytes: 1,
          objectCount: 1,
        }),
      }),
    );
    expect(JSON.stringify(firstBody)).not.toMatch(/capacity-key-secret|private-bucket|b2-token|totalBytes|objectCount/iu);
    vi.unstubAllGlobals();
  });

  it('fails closed when the canonical RTDB capacity ledger is absent', () => {
    expect(() => getCanonicalCapacityExpectedTotals(null)).toThrow('invalid');
  });

  it('fails closed when the reconciled provider snapshot cannot be persisted', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => (
      String(url).includes('b2_authorize_account')
        ? authorize()
        : Response.json({ files: [] })
    ));
    vi.stubGlobal('fetch', fetcher);
    const snapshotFailure = new Error('capacity snapshot CAS conflict');
    const failingWorker = createCapacityProbeWorker({
      onError: (error) => workerErrors.push(error),
      readExpectedTotals: readZeroExpectedTotals,
      writeReconciliationSnapshot: async () => {
        throw snapshotFailure;
      },
    });

    const response = await failingWorker.fetch(request({}), env());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'unavailable' });
    expect(workerErrors).toEqual([snapshotFailure]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('round-trips the maximum 256-page sealed cursor without raw cursor growth', async () => {
    let page = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('b2_authorize_account')) return authorize();
      page += 1;
      return page < 256
        ? Response.json({
          files: [],
          nextFileName: `page-${page}.pdf`,
          nextFileId: `version-${page}`,
        })
        : Response.json({ files: [] });
    });
    vi.stubGlobal('fetch', fetcher);

    let response = await worker.fetch(request({}), env());
    for (let index = 1; index < 256; index += 1) {
      const body = await response.json() as { state: string; continuationToken?: string };
      expect(body.state).toBe('continue');
      expect(body.continuationToken!.length).toBeLessThan(64 * 1_024);
      response = await worker.fetch(request({
        continuationToken: body.continuationToken,
      }), env());
    }
    expect(await response.json()).toEqual({ state: 'complete', status: 'healthy' });
    expect(page).toBe(256);
    vi.unstubAllGlobals();
  }, 20_000);

  it('sanitizes malformed B2 failures and rejects tampered continuation tokens', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('B2 diagnostic capacity-key-secret', { status: 500 }));
    vi.stubGlobal('fetch', fetcher);
    const failureWorker = createCapacityProbeWorker({
      onError: (error) => workerErrors.push(error),
      readExpectedTotals: async () => ({ totalBytes: 1, objectCount: 1, revision: 1 }),
      writeReconciliationSnapshot,
    });
    const failure = await failureWorker.fetch(request({}), env());
    expect(await failure.json()).toEqual({ code: 'unavailable' });
    const tampered = await worker.fetch(request({ continuationToken: 'not-a-real-token' }), env());
    expect(await tampered.json()).toEqual({ code: 'unavailable' });
    vi.unstubAllGlobals();
  });

  it('logs only an allowlisted production failure code', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response('B2 diagnostic capacity-key-secret', { status: 500 }));
    vi.stubGlobal('fetch', fetcher);
    const productionWorker = createCapacityProbeWorker({
      readExpectedTotals: async () => ({ totalBytes: 0, objectCount: 0, revision: 0 }),
      writeReconciliationSnapshot,
    });

    const failure = await productionWorker.fetch(
      request({}),
      env(),
    );

    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ code: 'unavailable' });
    expect(consoleError).toHaveBeenCalledWith(JSON.stringify({
      event: 'book_source_capacity_probe_failure',
      code: 'timeout',
      phase: 'authorize',
      kind: 'http',
      status: 500,
    }));
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(
      /capacity-key-secret|private-bucket|b2-token|diagnostic|backblaze/iu,
    );
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

  it('rejects expired sealed continuations before any new B2 request', async () => {
    let now = Date.parse('2026-07-23T00:00:00.000Z');
    const expiryWorker = createCapacityProbeWorker({
      now: () => now,
      readExpectedTotals: async () => ({ totalBytes: 0, objectCount: 0, revision: 0 }),
      writeReconciliationSnapshot,
    });
    const fetcher = vi.fn<typeof fetch>(async (url) => (
      String(url).includes('b2_authorize_account')
        ? authorize()
        : Response.json({
          files: [],
          nextFileName: 'next.pdf',
          nextFileId: 'next-version',
        })
    ));
    vi.stubGlobal('fetch', fetcher);
    const first = await expiryWorker.fetch(request({}), env());
    const firstBody = await first.json() as { continuationToken: string };
    expect(fetcher).toHaveBeenCalledTimes(2);

    now += 10 * 60 * 1_000;
    const expired = await expiryWorker.fetch(request({
      continuationToken: firstBody.continuationToken,
    }), env());
    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual({ code: 'unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('bounds streaming bodies without Content-Length and cancels stalled input', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);
    const oversized = new Request(
      'https://worker.test/internal/book-source-capacity/reconciliation-page',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer probe-bearer-secret',
          'content-type': 'application/json',
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(64 * 1_024 + 1));
            controller.close();
          },
        }),
        duplex: 'half',
      } as RequestInit,
    );
    expect((await worker.fetch(oversized, env())).status).toBe(400);

    const stalledWorker = createCapacityProbeWorker({
      bodyReadTimeoutMs: 10,
      readExpectedTotals: readZeroExpectedTotals,
      writeReconciliationSnapshot,
    });
    const stalled = new Request(
      'https://worker.test/internal/book-source-capacity/reconciliation-page',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer probe-bearer-secret',
          'content-type': 'application/json',
        },
        body: new ReadableStream({ start() { /* intentionally never closes */ } }),
        duplex: 'half',
      } as RequestInit,
    );
    expect((await stalledWorker.fetch(stalled, env())).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
