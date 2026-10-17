import { describe, expect, it } from 'vitest';
import {
  evaluateLocalBaselineDemand,
  LOCAL_BASELINE_REFUSAL_CODE,
  type LocalBaselineDemandInput,
} from '../src/book-source-worker/capacity-probe-local-baseline';

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

describe('PRD0062 #135 local capacity demand model', () => {
  it('produces deterministic frozen demand results without echoing input fields', () => {
    const input = demand();
    const first = evaluateLocalBaselineDemand(input);
    const second = evaluateLocalBaselineDemand({
      b2LatencyMs: input.b2LatencyMs,
      firebaseLatencyMs: input.firebaseLatencyMs,
      workerLatencyMs: input.workerLatencyMs,
      b2ListResponseBytes: input.b2ListResponseBytes,
      b2ListRequestBytes: input.b2ListRequestBytes,
      b2ListPageCount: input.b2ListPageCount,
      firebaseWriteBytes: input.firebaseWriteBytes,
      firebaseWriteRequestCount: input.firebaseWriteRequestCount,
      firebaseReadBytes: input.firebaseReadBytes,
      firebaseReadRequestCount: input.firebaseReadRequestCount,
      workerResponseBytes: input.workerResponseBytes,
      workerRequestBytes: input.workerRequestBytes,
      workerRequestCount: input.workerRequestCount,
      requestedSourceObjectCount: input.requestedSourceObjectCount,
      requestedSourceBytes: input.requestedSourceBytes,
      reservedObjectCount: input.reservedObjectCount,
      reservedBytes: input.reservedBytes,
      baselineProviderObjectCount: input.baselineProviderObjectCount,
      baselineProviderBytes: input.baselineProviderBytes,
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'accepted',
      demand: {
        capacity: {
          baselineBytes: 125,
          requestedBytes: 50,
          projectedBytes: 175,
          baselineObjectCount: 3,
          projectedObjectCount: 4,
          withinCapacity: true,
        },
        transport: {
          worker: { requestCount: 3, requestBytes: 90, responseBytes: 120, latencyMs: 12 },
          firebase: {
            readRequestCount: 2,
            readBytes: 80,
            writeRequestCount: 1,
            writeBytes: 40,
            latencyMs: 24,
          },
          b2: { listPageCount: 4, requestBytes: 160, responseBytes: 320, latencyMs: 36 },
        },
      },
    });
    expect(first).not.toHaveProperty('apiKey');
    expect(Object.isFrozen(first)).toBe(false);
    if (first.status === 'accepted') {
      expect(Object.isFrozen(first.demand)).toBe(true);
      expect(Object.isFrozen(first.demand.capacity)).toBe(true);
      expect(Object.isFrozen(first.demand.transport)).toBe(true);
    }
  });

  it('refuses credential-bearing, remote, write-capable, malformed, and overflow inputs identically', () => {
    const cases: unknown[] = [
      { ...demand(), authorization: 'Bearer local-secret' },
      { ...demand(), remoteEndpoint: 'https://remote.example.test' },
      { ...demand(), writeReconciliationSnapshot: true },
      { ...demand(), requestedSourceBytes: -1 },
      { ...demand(), workerRequestCount: 1.5 },
      { ...demand(), baselineProviderBytes: Number.MAX_SAFE_INTEGER, reservedBytes: 1 },
      { ...demand(), credential: 'capacity-key-secret' },
      null,
      [],
    ];

    for (const input of cases) {
      expect(evaluateLocalBaselineDemand(input)).toEqual({
        status: 'refused',
        code: LOCAL_BASELINE_REFUSAL_CODE,
      });
    }
  });
});
