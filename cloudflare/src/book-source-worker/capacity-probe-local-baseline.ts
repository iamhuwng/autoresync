import { BOOK_PDF_ACCOUNT_CAPACITY_BYTES } from './capacity-ledger';

export const LOCAL_BASELINE_REFUSAL_CODE = 'unsafe_input' as const;

const INPUT_KEYS = [
  'baselineProviderBytes',
  'baselineProviderObjectCount',
  'reservedBytes',
  'reservedObjectCount',
  'requestedSourceBytes',
  'requestedSourceObjectCount',
  'workerRequestCount',
  'workerRequestBytes',
  'workerResponseBytes',
  'firebaseReadRequestCount',
  'firebaseReadBytes',
  'firebaseWriteRequestCount',
  'firebaseWriteBytes',
  'b2ListPageCount',
  'b2ListRequestBytes',
  'b2ListResponseBytes',
  'workerLatencyMs',
  'firebaseLatencyMs',
  'b2LatencyMs',
] as const;

export interface LocalBaselineDemandInput {
  readonly baselineProviderBytes: number;
  readonly baselineProviderObjectCount: number;
  readonly reservedBytes: number;
  readonly reservedObjectCount: number;
  readonly requestedSourceBytes: number;
  readonly requestedSourceObjectCount: number;
  readonly workerRequestCount: number;
  readonly workerRequestBytes: number;
  readonly workerResponseBytes: number;
  readonly firebaseReadRequestCount: number;
  readonly firebaseReadBytes: number;
  readonly firebaseWriteRequestCount: number;
  readonly firebaseWriteBytes: number;
  readonly b2ListPageCount: number;
  readonly b2ListRequestBytes: number;
  readonly b2ListResponseBytes: number;
  readonly workerLatencyMs: number;
  readonly firebaseLatencyMs: number;
  readonly b2LatencyMs: number;
}

export interface LocalBaselineDemandResult {
  readonly capacity: Readonly<{
    readonly capacityBytes: number;
    readonly baselineBytes: number;
    readonly requestedBytes: number;
    readonly projectedBytes: number;
    readonly headroomBytes: number;
    readonly overflowBytes: number;
    readonly baselineObjectCount: number;
    readonly projectedObjectCount: number;
    readonly withinCapacity: boolean;
  }>;
  readonly transport: Readonly<{
    readonly worker: Readonly<{
      readonly requestCount: number;
      readonly requestBytes: number;
      readonly responseBytes: number;
      readonly latencyMs: number;
    }>;
    readonly firebase: Readonly<{
      readonly readRequestCount: number;
      readonly readBytes: number;
      readonly writeRequestCount: number;
      readonly writeBytes: number;
      readonly latencyMs: number;
    }>;
    readonly b2: Readonly<{
      readonly listPageCount: number;
      readonly requestBytes: number;
      readonly responseBytes: number;
      readonly latencyMs: number;
    }>;
  }>;
}

export interface LocalBaselineDemandAccepted {
  readonly status: 'accepted';
  readonly demand: LocalBaselineDemandResult;
}

export interface LocalBaselineDemandRefused {
  readonly status: 'refused';
  readonly code: typeof LOCAL_BASELINE_REFUSAL_CODE;
}

export type LocalBaselineDemandEvaluation =
  | LocalBaselineDemandAccepted
  | LocalBaselineDemandRefused;

const refusal = (): LocalBaselineDemandRefused => ({
  status: 'refused',
  code: LOCAL_BASELINE_REFUSAL_CODE,
});

const plainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const exactKeys = (value: Record<string, unknown>): boolean => {
  const actual = Reflect.ownKeys(value);
  return actual.length === INPUT_KEYS.length
    && actual.every((key) => typeof key === 'string' && INPUT_KEYS.includes(key as typeof INPUT_KEYS[number]));
};

const readValue = (value: Record<string, unknown>, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};

const readNonNegativeInteger = (value: Record<string, unknown>, key: string): number | null => {
  const candidate = readValue(value, key);
  return typeof candidate === 'number'
    && Number.isSafeInteger(candidate)
    && candidate >= 0
    && !Object.is(candidate, -0)
    ? candidate
    : null;
};

const add = (left: number, right: number): number | null => {
  const result = left + right;
  return Number.isSafeInteger(result) ? result : null;
};

const parseInput = (value: unknown): LocalBaselineDemandInput | null => {
  if (!plainRecord(value) || !exactKeys(value)) return null;

  const baselineProviderBytes = readNonNegativeInteger(value, 'baselineProviderBytes');
  const baselineProviderObjectCount = readNonNegativeInteger(value, 'baselineProviderObjectCount');
  const reservedBytes = readNonNegativeInteger(value, 'reservedBytes');
  const reservedObjectCount = readNonNegativeInteger(value, 'reservedObjectCount');
  const requestedSourceBytes = readNonNegativeInteger(value, 'requestedSourceBytes');
  const requestedSourceObjectCount = readNonNegativeInteger(value, 'requestedSourceObjectCount');
  const workerRequestCount = readNonNegativeInteger(value, 'workerRequestCount');
  const workerRequestBytes = readNonNegativeInteger(value, 'workerRequestBytes');
  const workerResponseBytes = readNonNegativeInteger(value, 'workerResponseBytes');
  const firebaseReadRequestCount = readNonNegativeInteger(value, 'firebaseReadRequestCount');
  const firebaseReadBytes = readNonNegativeInteger(value, 'firebaseReadBytes');
  const firebaseWriteRequestCount = readNonNegativeInteger(value, 'firebaseWriteRequestCount');
  const firebaseWriteBytes = readNonNegativeInteger(value, 'firebaseWriteBytes');
  const b2ListPageCount = readNonNegativeInteger(value, 'b2ListPageCount');
  const b2ListRequestBytes = readNonNegativeInteger(value, 'b2ListRequestBytes');
  const b2ListResponseBytes = readNonNegativeInteger(value, 'b2ListResponseBytes');
  const workerLatencyMs = readNonNegativeInteger(value, 'workerLatencyMs');
  const firebaseLatencyMs = readNonNegativeInteger(value, 'firebaseLatencyMs');
  const b2LatencyMs = readNonNegativeInteger(value, 'b2LatencyMs');

  if (baselineProviderBytes === null
    || baselineProviderObjectCount === null
    || reservedBytes === null
    || reservedObjectCount === null
    || requestedSourceBytes === null
    || requestedSourceObjectCount === null
    || workerRequestCount === null
    || workerRequestBytes === null
    || workerResponseBytes === null
    || firebaseReadRequestCount === null
    || firebaseReadBytes === null
    || firebaseWriteRequestCount === null
    || firebaseWriteBytes === null
    || b2ListPageCount === null
    || b2ListRequestBytes === null
    || b2ListResponseBytes === null
    || workerLatencyMs === null
    || firebaseLatencyMs === null
    || b2LatencyMs === null) return null;

  return Object.freeze({
    baselineProviderBytes,
    baselineProviderObjectCount,
    reservedBytes,
    reservedObjectCount,
    requestedSourceBytes,
    requestedSourceObjectCount,
    workerRequestCount,
    workerRequestBytes,
    workerResponseBytes,
    firebaseReadRequestCount,
    firebaseReadBytes,
    firebaseWriteRequestCount,
    firebaseWriteBytes,
    b2ListPageCount,
    b2ListRequestBytes,
    b2ListResponseBytes,
    workerLatencyMs,
    firebaseLatencyMs,
    b2LatencyMs,
  });
};

const calculate = (input: LocalBaselineDemandInput): LocalBaselineDemandResult | null => {
  const baselineBytes = add(input.baselineProviderBytes, input.reservedBytes);
  const projectedBytes = baselineBytes === null
    ? null
    : add(baselineBytes, input.requestedSourceBytes);
  const baselineObjectCount = add(input.baselineProviderObjectCount, input.reservedObjectCount);
  const projectedObjectCount = baselineObjectCount === null
    ? null
    : add(baselineObjectCount, input.requestedSourceObjectCount);

  if (baselineBytes === null || projectedBytes === null
    || baselineObjectCount === null || projectedObjectCount === null) return null;

  const worker = Object.freeze({
    requestCount: input.workerRequestCount,
    requestBytes: input.workerRequestBytes,
    responseBytes: input.workerResponseBytes,
    latencyMs: input.workerLatencyMs,
  });
  const firebase = Object.freeze({
    readRequestCount: input.firebaseReadRequestCount,
    readBytes: input.firebaseReadBytes,
    writeRequestCount: input.firebaseWriteRequestCount,
    writeBytes: input.firebaseWriteBytes,
    latencyMs: input.firebaseLatencyMs,
  });
  const b2 = Object.freeze({
    listPageCount: input.b2ListPageCount,
    requestBytes: input.b2ListRequestBytes,
    responseBytes: input.b2ListResponseBytes,
    latencyMs: input.b2LatencyMs,
  });
  const capacity = Object.freeze({
    capacityBytes: BOOK_PDF_ACCOUNT_CAPACITY_BYTES,
    baselineBytes,
    requestedBytes: input.requestedSourceBytes,
    projectedBytes,
    headroomBytes: Math.max(0, BOOK_PDF_ACCOUNT_CAPACITY_BYTES - projectedBytes),
    overflowBytes: Math.max(0, projectedBytes - BOOK_PDF_ACCOUNT_CAPACITY_BYTES),
    baselineObjectCount,
    projectedObjectCount,
    withinCapacity: projectedBytes <= BOOK_PDF_ACCOUNT_CAPACITY_BYTES,
  });

  return Object.freeze({
    capacity,
    transport: Object.freeze({ worker, firebase, b2 }),
  });
};

export const evaluateLocalBaselineDemand = (value: unknown): LocalBaselineDemandEvaluation => {
  try {
    const input = parseInput(value);
    if (input === null) return refusal();
    const demand = calculate(input);
    return demand === null ? refusal() : { status: 'accepted', demand };
  } catch {
    return refusal();
  }
};
