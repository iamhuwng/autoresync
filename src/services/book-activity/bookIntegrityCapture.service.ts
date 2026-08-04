import {
  BOOK_INTEGRITY_MAX_EVENTS_PER_ATTEMPT,
  BOOK_INTEGRITY_MAX_EVENTS_PER_WINDOW,
  BOOK_INTEGRITY_MAX_INACTIVITY_MS,
  BOOK_INTEGRITY_MAX_REQUEST_BYTES,
  BOOK_INTEGRITY_MAX_SESSIONS_PER_ATTEMPT,
  BOOK_INTEGRITY_MIN_INACTIVITY_MS,
  BOOK_INTEGRITY_RATE_WINDOW_MS,
  BOOK_INTEGRITY_SCHEMA_VERSION,
  BOOK_INTEGRITY_SESSION_LEASE_MS,
  BOOK_INTEGRITY_SIGNAL_TYPES,
  type BookIntegrityAttemptAuthority,
  type BookIntegrityCanonicalEvent,
  type BookIntegrityCaptureClient,
  type BookIntegrityCaptureResult,
  type BookIntegrityCaptureTarget,
  type BookIntegrityFrozenPolicy,
  type BookIntegrityIntent,
  type BookIntegrityRepository,
  type BookIntegritySignalPolicy,
  type BookIntegritySignalRequest,
  type BookIntegritySignalType,
} from './bookIntegrityCapture.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const EVENT_ID = /^integrity-v1-[a-f0-9]{40}$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const WARNING_MESSAGE = 'An integrity signal was recorded. You can continue this Activity and submit normally.';

const SIGNAL_SET = new Set<string>(BOOK_INTEGRITY_SIGNAL_TYPES);
const TARGET_KEYS = new Set([
  'bookId',
  'bindingId',
  'bindingRevision',
  'contextKind',
  'contextId',
  'placementId',
  'activityId',
  'activityVersion',
]);
const REQUEST_KEYS = new Set([
  'schemaVersion',
  'target',
  'policyId',
  'policyRevision',
  'clientSessionId',
  'sequence',
  'signal',
]);
const RESULT_KEYS = new Set([
  'status',
  'eventId',
  'signal',
  'recordedAt',
  'recordedEventCount',
  'retryAfterMs',
  'reason',
]);

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const hasOnlyKeys = (value: Record<string, unknown>, keys: ReadonlySet<string>): boolean => (
  Object.keys(value).every((key) => keys.has(key))
);

const isPositiveInteger = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number => (
  Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum
);

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

export class BookIntegrityCaptureError extends Error {
  constructor(
    readonly code:
      | 'integrity_request_malformed'
      | 'integrity_response_malformed'
      | 'integrity_unauthorized'
      | 'integrity_unavailable',
    readonly status: number,
  ) {
    super(code);
    this.name = 'BookIntegrityCaptureError';
  }
}

const allSignals = (enabled: boolean): BookIntegritySignalPolicy => Object.freeze(
  Object.fromEntries(
    BOOK_INTEGRITY_SIGNAL_TYPES.map((signal) => [signal, enabled]),
  ) as unknown as BookIntegritySignalPolicy,
);

export const createDefaultBookIntegrityPolicy = (
  intent: BookIntegrityIntent,
  identity: { readonly policyId: string; readonly policyRevision: number } = {
    policyId: 'book-integrity-default',
    policyRevision: 1,
  },
): BookIntegrityFrozenPolicy => Object.freeze({
  schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
  ...identity,
  intent,
  enabled: intent === 'accountable',
  signals: allSignals(intent === 'accountable'),
  requiredFocusMode: false,
  inactivityThresholdMs: 60_000,
});

export const isBookIntegrityPolicyValid = (value: unknown): value is BookIntegrityFrozenPolicy => {
  const source = record(value);
  const signals = record(source?.signals);
  return source !== null
    && source.schemaVersion === BOOK_INTEGRITY_SCHEMA_VERSION
    && isId(source.policyId)
    && isPositiveInteger(source.policyRevision)
    && ['accountable', 'practice'].includes(String(source.intent))
    && typeof source.enabled === 'boolean'
    && signals !== null
    && Object.keys(signals).length === BOOK_INTEGRITY_SIGNAL_TYPES.length
    && BOOK_INTEGRITY_SIGNAL_TYPES.every((signal) => typeof signals[signal] === 'boolean')
    && typeof source.requiredFocusMode === 'boolean'
    && isPositiveInteger(source.inactivityThresholdMs, BOOK_INTEGRITY_MAX_INACTIVITY_MS)
    && Number(source.inactivityThresholdMs) >= BOOK_INTEGRITY_MIN_INACTIVITY_MS;
};

export const shouldCaptureBookIntegritySignal = (
  policy: BookIntegrityFrozenPolicy,
  signal: BookIntegritySignalType,
): boolean => isBookIntegrityPolicyValid(policy)
  && policy.intent === 'accountable'
  && policy.enabled
  && policy.signals[signal]
  && (signal !== 'focus_mode_exit' || policy.requiredFocusMode);

export const isBookIntegrityCaptureTarget = (value: unknown): value is BookIntegrityCaptureTarget => {
  const source = record(value);
  return source !== null
    && hasOnlyKeys(source, TARGET_KEYS)
    && isId(source.bookId)
    && isId(source.bindingId)
    && isPositiveInteger(source.bindingRevision)
    && source.contextKind === 'homework'
    && isId(source.contextId)
    && isId(source.placementId)
    && isId(source.activityId)
    && isPositiveInteger(source.activityVersion);
};

export const isBookIntegritySignalRequest = (value: unknown): value is BookIntegritySignalRequest => {
  const source = record(value);
  return source !== null
    && hasOnlyKeys(source, REQUEST_KEYS)
    && source.schemaVersion === BOOK_INTEGRITY_SCHEMA_VERSION
    && isBookIntegrityCaptureTarget(source.target)
    && isId(source.policyId)
    && isPositiveInteger(source.policyRevision)
    && typeof source.clientSessionId === 'string'
    && SESSION_ID.test(source.clientSessionId)
    && isPositiveInteger(source.sequence, 1_000_000)
    && typeof source.signal === 'string'
    && SIGNAL_SET.has(source.signal);
};

const targetsEqual = (
  requested: BookIntegrityCaptureTarget,
  authority: BookIntegrityAttemptAuthority,
): boolean => (
  requested.bookId === authority.bookId
  && requested.bindingId === authority.bindingId
  && requested.bindingRevision === authority.bindingRevision
  && requested.contextKind === authority.contextKind
  && requested.contextId === authority.contextId
  && requested.placementId === authority.placementId
  && requested.activityId === authority.activityId
  && requested.activityVersion === authority.activityVersion
);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const eventIdentity = async (input: {
  readonly authority: BookIntegrityAttemptAuthority;
  readonly request: BookIntegritySignalRequest;
}): Promise<{ eventId: string; requestFingerprint: string }> => {
  const operation = {
    schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
    recipientId: input.authority.recipientId,
    accountableAttemptId: input.authority.accountableAttemptId,
    clientSessionId: input.request.clientSessionId,
    sequence: input.request.sequence,
  };
  const fingerprint = {
    ...operation,
    signal: input.request.signal,
    target: input.request.target,
    policyId: input.request.policyId,
    policyRevision: input.request.policyRevision,
  };
  const [operationHash, requestHash] = await Promise.all([
    sha256(stable(operation)),
    sha256(stable(fingerprint)),
  ]);
  return {
    eventId: `integrity-v1-${operationHash.slice(0, 40)}`,
    requestFingerprint: requestHash,
  };
};

export interface TrustedBookIntegrityCaptureService {
  capture(input: {
    readonly actorUid: string;
    readonly routeBookId: string;
    readonly request: BookIntegritySignalRequest;
  }): Promise<BookIntegrityCaptureResult>;
}

export const createTrustedBookIntegrityCaptureService = (options: {
  readonly repository: BookIntegrityRepository;
  readonly resolveAttemptAuthority: (input: {
    readonly actorUid: string;
    readonly target: BookIntegrityCaptureTarget;
  }) => Promise<BookIntegrityAttemptAuthority | null>;
  readonly now?: () => number;
}): TrustedBookIntegrityCaptureService => ({
  async capture(input) {
    if (!isId(input.actorUid) || !isId(input.routeBookId)
      || !isBookIntegritySignalRequest(input.request)
      || input.routeBookId !== input.request.target.bookId) {
      throw new BookIntegrityCaptureError('integrity_request_malformed', 400);
    }
    const authority = await options.resolveAttemptAuthority({
      actorUid: input.actorUid,
      target: input.request.target,
    });
    if (!authority || authority.recipientId !== input.actorUid || !authority.active) {
      return {
        status: 'ignored',
        signal: input.request.signal,
        reason: 'inactive_attempt',
        recordedEventCount: 0,
      };
    }
    if (!targetsEqual(input.request.target, authority)) {
      return {
        status: 'ignored',
        signal: input.request.signal,
        reason: 'attempt_mismatch',
        recordedEventCount: 0,
      };
    }
    if (!isBookIntegrityPolicyValid(authority.frozenPolicy)
      || authority.frozenPolicy.policyId !== input.request.policyId
      || authority.frozenPolicy.policyRevision !== input.request.policyRevision
      || authority.frozenPolicy.intent !== 'accountable'
      || !authority.frozenPolicy.enabled) {
      return {
        status: 'ignored',
        signal: input.request.signal,
        reason: 'policy_off',
        recordedEventCount: 0,
      };
    }
    if (!shouldCaptureBookIntegritySignal(authority.frozenPolicy, input.request.signal)) {
      return {
        status: 'ignored',
        signal: input.request.signal,
        reason: 'signal_disabled',
        recordedEventCount: 0,
      };
    }
    if (!isId(authority.accountableAttemptId)
      || !isPositiveInteger(authority.attemptNumber, 1_000)) {
      return {
        status: 'ignored',
        signal: input.request.signal,
        reason: 'inactive_attempt',
        recordedEventCount: 0,
      };
    }
    const nowMs = options.now?.() ?? Date.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new BookIntegrityCaptureError('integrity_unavailable', 503);
    }
    const identity = await eventIdentity({ authority, request: input.request });
    const event: BookIntegrityCanonicalEvent = {
      schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
      ...identity,
      signal: input.request.signal,
      recordedAt: new Date(nowMs).toISOString(),
      source: 'browser',
      clientSessionId: input.request.clientSessionId,
      sequence: input.request.sequence,
      recipientId: authority.recipientId,
      accountableAttemptId: authority.accountableAttemptId,
      attemptNumber: authority.attemptNumber,
      target: { ...input.request.target },
      policyId: authority.frozenPolicy.policyId,
      policyRevision: authority.frozenPolicy.policyRevision,
    };
    return options.repository.append({
      event,
      nowMs,
      limits: {
        maxEvents: BOOK_INTEGRITY_MAX_EVENTS_PER_ATTEMPT,
        maxEventsPerWindow: BOOK_INTEGRITY_MAX_EVENTS_PER_WINDOW,
        rateWindowMs: BOOK_INTEGRITY_RATE_WINDOW_MS,
        maxSessions: BOOK_INTEGRITY_MAX_SESSIONS_PER_ATTEMPT,
        sessionLeaseMs: BOOK_INTEGRITY_SESSION_LEASE_MS,
      },
    });
  },
});

const isCaptureResult = (value: unknown): value is BookIntegrityCaptureResult => {
  const source = record(value);
  if (!source || !hasOnlyKeys(source, RESULT_KEYS)
    || typeof source.status !== 'string'
    || typeof source.signal !== 'string'
    || !SIGNAL_SET.has(source.signal)
    || !Number.isSafeInteger(source.recordedEventCount)
    || Number(source.recordedEventCount) < 0
    || Number(source.recordedEventCount) > BOOK_INTEGRITY_MAX_EVENTS_PER_ATTEMPT) {
    return false;
  }
  if (source.status === 'recorded' || source.status === 'deduplicated') {
    return typeof source.eventId === 'string'
      && EVENT_ID.test(source.eventId)
      && typeof source.recordedAt === 'string'
      && !Number.isNaN(Date.parse(source.recordedAt));
  }
  if (source.status === 'rate_limited') {
    return isPositiveInteger(source.retryAfterMs, BOOK_INTEGRITY_RATE_WINDOW_MS);
  }
  return source.status === 'ignored'
    && [
      'inactive_attempt',
      'attempt_mismatch',
      'policy_off',
      'signal_disabled',
      'not_concurrent',
      'event_limit',
      'replay_conflict',
    ].includes(String(source.reason));
};

export const createBookIntegrityCaptureClient = (options: {
  readonly baseUrl: string;
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}): BookIntegrityCaptureClient => ({
  async recordSignal(request, recordOptions = {}) {
    if (!isBookIntegritySignalRequest(request)) {
      throw new BookIntegrityCaptureError('integrity_request_malformed', 400);
    }
    const body = JSON.stringify(request);
    if (new TextEncoder().encode(body).byteLength > BOOK_INTEGRITY_MAX_REQUEST_BYTES) {
      throw new BookIntegrityCaptureError('integrity_request_malformed', 400);
    }
    const token = await options.getIdToken();
    if (!token) throw new BookIntegrityCaptureError('integrity_unauthorized', 401);
    const response = await (options.fetchImpl ?? fetch)(
      `${options.baseUrl.replace(/\/$/u, '')}/book-integrity/books/${encodeURIComponent(request.target.bookId)}/signals`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
        keepalive: recordOptions.keepalive === true,
      },
    );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BookIntegrityCaptureError('integrity_response_malformed', 502);
    }
    if (!response.ok) {
      const code = record(payload)?.code;
      throw new BookIntegrityCaptureError(
        code === 'integrity_unauthorized' ? 'integrity_unauthorized' : 'integrity_unavailable',
        response.status,
      );
    }
    if (!isCaptureResult(payload)) {
      throw new BookIntegrityCaptureError('integrity_response_malformed', 502);
    }
    return payload;
  },
});

export const bookIntegrityWarningMessage = (): string => WARNING_MESSAGE;
