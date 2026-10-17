import { describe, expect, it, vi } from 'vitest';
import { createCapacityProbeWorker } from '../src/book-source-worker/capacity-probe-worker';
import type { LocalBaselineDemandInput } from '../src/book-source-worker/capacity-probe-local-baseline';

const demand = (overrides: Partial<LocalBaselineDemandInput> = {}): LocalBaselineDemandInput => ({
  baselineProviderBytes: 100,
  baselineProviderObjectCount: 2,
  reservedBytes: 25,
  reservedObjectCount: 1,
  requestedSourceBytes: 50,
  requestedSourceObjectCount: 1,
  workerRequestCount: 3,
  workerRequestBytes: 90,
  workerResponseBytes: 120,
  firebaseReadRequestCount: 2,
  firebaseReadBytes: 80,
  firebaseWriteRequestCount: 1,
  firebaseWriteBytes: 40,
  b2ListPageCount: 4,
  b2ListRequestBytes: 160,
  b2ListResponseBytes: 320,
  workerLatencyMs: 12,
  firebaseLatencyMs: 24,
  b2LatencyMs: 36,
  ...overrides,
});

const localEnv = () => ({
  BOOK_SOURCE_CAPACITY_PROBE_STATE: 'enabled',
  BOOK_SOURCE_CAPACITY_ENVIRONMENT: 'local',
  BOOK_SOURCE_CAPACITY_PROBE_MODE: 'local-baseline',
});

const localRequest = (body: unknown, headers: Record<string, string> = {}) => new Request(
  'https://worker.test/internal/book-source-capacity/reconciliation-page',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  },
);

describe('PRD0062 #135 local capacity probe mode', () => {
  it('returns a local baseline without remote calls or reconciled-ledger writes', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const readExpectedTotals = vi.fn(async () => ({ totalBytes: 1, objectCount: 1, revision: 9 }));
    const writeReconciliationSnapshot = vi.fn(async () => undefined);
    const worker = createCapacityProbeWorker({
      fetchImpl,
      readExpectedTotals,
      writeReconciliationSnapshot,
    });

    const response = await worker.fetch(localRequest({ demand: demand() }), localEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: 'complete',
      mode: 'local-baseline',
      demand: { capacity: { projectedBytes: 175 } },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readExpectedTotals).not.toHaveBeenCalled();
    expect(writeReconciliationSnapshot).not.toHaveBeenCalled();
  });

  it('fails closed with the same redacted result for credentials, remote configuration, auth headers, and unsafe payloads', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const readExpectedTotals = vi.fn(async () => ({ totalBytes: 1, objectCount: 1, revision: 9 }));
    const writeReconciliationSnapshot = vi.fn(async () => undefined);
    const worker = createCapacityProbeWorker({
      fetchImpl,
      readExpectedTotals,
      writeReconciliationSnapshot,
    });
    const credentialEnv = {
      ...localEnv(),
      BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY: 'capacity-key-secret',
    };
    const providerBindingEnv = {
      ...localEnv(),
      R2_BUCKET: { put: vi.fn() },
    };
    const cases: [Request, Record<string, unknown>][] = [
      [localRequest({ demand: demand() }), credentialEnv],
      [localRequest({ demand: demand() }), providerBindingEnv],
      [localRequest({ demand: demand() }, { authorization: 'Bearer local-secret' }), localEnv()],
      [localRequest({ demand: { ...demand(), remoteUrl: 'https://remote.example.test' } }), localEnv()],
      [localRequest({ demand: { ...demand(), write: true } }), localEnv()],
      [localRequest({ continuationToken: 'opaque-remote-token' }), localEnv()],
    ];

    for (const [request, env] of cases) {
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: 'unavailable' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readExpectedTotals).not.toHaveBeenCalled();
    expect(writeReconciliationSnapshot).not.toHaveBeenCalled();
  });

  it('does not activate from staging, remote, or unknown mode selections', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const worker = createCapacityProbeWorker({ fetchImpl });
    const cases = [
      { ...localEnv(), BOOK_SOURCE_CAPACITY_ENVIRONMENT: 'staging' },
      { ...localEnv(), BOOK_SOURCE_CAPACITY_PROBE_MODE: 'remote' },
      { ...localEnv(), BOOK_SOURCE_CAPACITY_PROBE_MODE: 'unsafe-mode' },
    ];

    for (const env of cases) {
      const response = await worker.fetch(localRequest({ demand: demand() }), env);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: 'unavailable' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
