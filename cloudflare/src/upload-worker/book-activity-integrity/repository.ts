import type {
  BookIntegrityCanonicalEvent,
  BookIntegrityCaptureResult,
  BookIntegrityRepository,
  BookIntegrityRepositoryAppendInput,
} from '../../../../src/services/book-activity/bookIntegrityCapture.types.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';

export const BOOK_ACTIVITY_INTEGRITY_ROOT = 'book_activity_integrity';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const EVENT_ID = /^integrity-v1-[a-f0-9]{40}$/u;
const FINGERPRINT = /^[a-f0-9]{64}$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SIGNALS = new Set([
  'visibility_loss',
  'focus_loss',
  'route_reload_close',
  'paste',
  'protected_copy',
  'focus_mode_exit',
  'concurrent_attempt',
  'inactivity',
]);
const MAX_SCOPE_BYTES = 192 * 1024;
const MAX_RETRIES = 5;
const EVENT_KEYS = new Set([
  'schemaVersion',
  'eventId',
  'requestFingerprint',
  'signal',
  'recordedAt',
  'source',
  'clientSessionId',
  'sequence',
  'recipientId',
  'accountableAttemptId',
  'attemptNumber',
  'target',
  'policyId',
  'policyRevision',
]);
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

interface IntegritySessionLease {
  readonly clientSessionId: string;
  readonly lastSeenAt: string;
}

interface DurableIntegrityScope {
  readonly schemaVersion: 1;
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly accountableAttemptId: string;
  readonly events: Readonly<Record<string, BookIntegrityCanonicalEvent>>;
  readonly sessions: Readonly<Record<string, IntegritySessionLease>>;
}

export interface BookIntegrityRepositorySnapshot {
  readonly scopes: Readonly<Record<string, DurableIntegrityScope>>;
}

export class BookIntegrityRepositoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookIntegrityRepositoryError';
  }
}

const clone = <T>(value: T): T => structuredClone(value);

const pathId = (value: string, label: string): string => {
  if (!ID.test(value)) throw new BookIntegrityRepositoryError(`integrity_${label}_path_invalid`);
  return value;
};

export const bookIntegrityAttemptScopePath = (
  event: Pick<
    BookIntegrityCanonicalEvent,
    'recipientId' | 'accountableAttemptId' | 'target'
  >,
): string => [
  BOOK_ACTIVITY_INTEGRITY_ROOT,
  'scopes',
  pathId(event.recipientId, 'recipient'),
  pathId(event.target.contextId, 'context'),
  pathId(event.target.placementId, 'placement'),
  pathId(event.target.activityId, 'activity'),
  pathId(event.accountableAttemptId, 'attempt'),
].join('/');

const encodedBytes = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new BookIntegrityRepositoryError('integrity_scope_unserializable');
  }
  return new TextEncoder().encode(serialized).byteLength;
};

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const emptyScope = (event: BookIntegrityCanonicalEvent): DurableIntegrityScope => ({
  schemaVersion: 1,
  recipientId: event.recipientId,
  contextId: event.target.contextId,
  placementId: event.target.placementId,
  activityId: event.target.activityId,
  accountableAttemptId: event.accountableAttemptId,
  events: {},
  sessions: {},
});

const validPositiveInteger = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): boolean => (
  Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum
);

const validStoredEvent = (
  key: string,
  value: unknown,
  expected: BookIntegrityCanonicalEvent,
): value is BookIntegrityCanonicalEvent => {
  const event = record(value);
  const target = record(event?.target);
  return event !== null
    && Object.keys(event).length === EVENT_KEYS.size
    && Object.keys(event).every((field) => EVENT_KEYS.has(field))
    && event.schemaVersion === 1
    && event.eventId === key
    && EVENT_ID.test(key)
    && typeof event.requestFingerprint === 'string'
    && FINGERPRINT.test(event.requestFingerprint)
    && typeof event.signal === 'string'
    && SIGNALS.has(event.signal)
    && typeof event.recordedAt === 'string'
    && Number.isFinite(Date.parse(event.recordedAt))
    && event.source === 'browser'
    && typeof event.clientSessionId === 'string'
    && SESSION_ID.test(event.clientSessionId)
    && validPositiveInteger(event.sequence, 1_000_000)
    && event.recipientId === expected.recipientId
    && event.accountableAttemptId === expected.accountableAttemptId
    && validPositiveInteger(event.attemptNumber, 1_000)
    && target !== null
    && Object.keys(target).length === TARGET_KEYS.size
    && Object.keys(target).every((field) => TARGET_KEYS.has(field))
    && target.bookId === expected.target.bookId
    && target.bindingId === expected.target.bindingId
    && target.bindingRevision === expected.target.bindingRevision
    && target.contextKind === expected.target.contextKind
    && target.contextId === expected.target.contextId
    && target.placementId === expected.target.placementId
    && target.activityId === expected.target.activityId
    && target.activityVersion === expected.target.activityVersion
    && event.policyId === expected.policyId
    && event.policyRevision === expected.policyRevision;
};

const sameCanonicalEvent = (
  value: unknown,
  expected: BookIntegrityCanonicalEvent,
): value is BookIntegrityCanonicalEvent => validStoredEvent(expected.eventId, value, expected)
  && value.requestFingerprint === expected.requestFingerprint
  && value.signal === expected.signal
  && value.recordedAt === expected.recordedAt
  && value.source === expected.source
  && value.clientSessionId === expected.clientSessionId
  && value.sequence === expected.sequence
  && value.recipientId === expected.recipientId
  && value.accountableAttemptId === expected.accountableAttemptId
  && value.attemptNumber === expected.attemptNumber;

const validSession = (key: string, value: unknown): value is IntegritySessionLease => {
  const session = record(value);
  return SESSION_ID.test(key)
    && session !== null
    && Object.keys(session).length === 2
    && session.clientSessionId === key
    && typeof session.lastSeenAt === 'string'
    && Number.isFinite(Date.parse(session.lastSeenAt));
};

const canonicalScope = (
  value: unknown,
  event: BookIntegrityCanonicalEvent,
  limits: BookIntegrityRepositoryAppendInput['limits'],
): DurableIntegrityScope => {
  if (value === null || value === undefined) return emptyScope(event);
  const source = record(value);
  const events = record(source?.events);
  const sessions = record(source?.sessions);
  const allowed = new Set([
    'schemaVersion',
    'recipientId',
    'contextId',
    'placementId',
    'activityId',
    'accountableAttemptId',
    'events',
    'sessions',
  ]);
  if (!source
    || source.schemaVersion !== 1
    || source.recipientId !== event.recipientId
    || source.contextId !== event.target.contextId
    || source.placementId !== event.target.placementId
    || source.activityId !== event.target.activityId
    || source.accountableAttemptId !== event.accountableAttemptId
    || Object.keys(source).some((key) => !allowed.has(key))
    || !events
    || !sessions
    || Object.keys(events).length > limits.maxEvents
    || Object.keys(sessions).length > limits.maxSessions
    || !Object.entries(events).every(([key, entry]) => validStoredEvent(key, entry, event))
    || !Object.entries(sessions).every(([key, entry]) => validSession(key, entry))
    || encodedBytes(source) > MAX_SCOPE_BYTES) {
    throw new BookIntegrityRepositoryError('integrity_scope_invalid');
  }
  return clone(source as unknown as DurableIntegrityScope);
};

const parseTime = (value: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new BookIntegrityRepositoryError('integrity_timestamp_invalid');
  return parsed;
};

const resultForEvent = (
  status: 'recorded' | 'deduplicated',
  event: BookIntegrityCanonicalEvent,
  count: number,
): BookIntegrityCaptureResult => ({
  status,
  eventId: event.eventId,
  signal: event.signal,
  recordedAt: event.recordedAt,
  recordedEventCount: count,
});

const transition = (
  scope: DurableIntegrityScope,
  input: BookIntegrityRepositoryAppendInput,
): {
  readonly next?: DurableIntegrityScope;
  readonly result: BookIntegrityCaptureResult;
} => {
  const { event, limits, nowMs } = input;
  const events = scope.events;
  const existing = events[event.eventId];
  if (existing) {
    return existing.requestFingerprint === event.requestFingerprint
      ? { result: resultForEvent('deduplicated', existing, Object.keys(events).length) }
      : {
          result: {
            status: 'ignored',
            signal: event.signal,
            reason: 'replay_conflict',
            recordedEventCount: Object.keys(events).length,
          },
        };
  }

  const activeSessions = Object.values(scope.sessions)
    .filter((session) => nowMs - parseTime(session.lastSeenAt) <= limits.sessionLeaseMs)
    .sort((left, right) => parseTime(right.lastSeenAt) - parseTime(left.lastSeenAt));
  const hasConcurrentSession = activeSessions.some(
    (session) => session.clientSessionId !== event.clientSessionId,
  );
  const nextLease: IntegritySessionLease = {
    clientSessionId: event.clientSessionId,
    lastSeenAt: event.recordedAt,
  };
  const retainedSessions = [
    nextLease,
    ...activeSessions.filter((session) => session.clientSessionId !== event.clientSessionId),
  ].slice(0, limits.maxSessions);
  const sessions = Object.fromEntries(
    retainedSessions.map((session) => [session.clientSessionId, session]),
  );

  if (event.signal === 'concurrent_attempt' && !hasConcurrentSession) {
    return {
      next: { ...scope, sessions },
      result: {
        status: 'ignored',
        signal: event.signal,
        reason: 'not_concurrent',
        recordedEventCount: Object.keys(events).length,
      },
    };
  }
  const eventCount = Object.keys(events).length;
  if (eventCount >= limits.maxEvents) {
    return {
      result: {
        status: 'ignored',
        signal: event.signal,
        reason: 'event_limit',
        recordedEventCount: eventCount,
      },
    };
  }
  const windowStart = nowMs - limits.rateWindowMs;
  const recent = Object.values(events)
    .map((entry) => parseTime(entry.recordedAt))
    .filter((recordedAt) => recordedAt > windowStart)
    .sort((left, right) => left - right);
  if (recent.length >= limits.maxEventsPerWindow) {
    const retryAfterMs = Math.max(1, Math.min(
      limits.rateWindowMs,
      recent[0]! + limits.rateWindowMs - nowMs + 1,
    ));
    return {
      result: {
        status: 'rate_limited',
        signal: event.signal,
        retryAfterMs,
        recordedEventCount: eventCount,
      },
    };
  }
  const next: DurableIntegrityScope = {
    ...scope,
    events: { ...events, [event.eventId]: clone(event) },
    sessions,
  };
  if (encodedBytes(next) > MAX_SCOPE_BYTES) {
    throw new BookIntegrityRepositoryError('integrity_scope_unbounded');
  }
  return {
    next,
    result: resultForEvent('recorded', event, eventCount + 1),
  };
};

export class InMemoryBookIntegrityRepository implements BookIntegrityRepository {
  private readonly scopes: Record<string, DurableIntegrityScope>;
  private appendCalls = 0;

  constructor(initial: BookIntegrityRepositorySnapshot = { scopes: {} }) {
    this.scopes = clone(initial.scopes);
  }

  snapshot(): BookIntegrityRepositorySnapshot {
    return { scopes: clone(this.scopes) };
  }

  metrics(): { readonly appendCalls: number } {
    return { appendCalls: this.appendCalls };
  }

  async append(input: BookIntegrityRepositoryAppendInput): Promise<BookIntegrityCaptureResult> {
    this.appendCalls += 1;
    const path = bookIntegrityAttemptScopePath(input.event);
    const current = canonicalScope(this.scopes[path], input.event, input.limits);
    const updated = transition(current, input);
    if (updated.next) this.scopes[path] = clone(updated.next);
    return clone(updated.result);
  }
}

export interface FirebaseBookIntegrityRepositoryEnv extends RepositoryEnv {
  readonly BOOK_INTEGRITY_SERVICE_IDENTITY?: string;
  readonly BOOK_INTEGRITY_GOOGLE_SA_KEY?: string;
}

export class FirebaseRestBookIntegrityRepository implements BookIntegrityRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly serviceIdentity: string;
  private readonly serviceAccountKey?: string;

  constructor(private readonly options: {
    readonly env: FirebaseBookIntegrityRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
  }) {
    const identity = options.env.BOOK_INTEGRITY_SERVICE_IDENTITY?.trim();
    if (!identity) throw new BookIntegrityRepositoryError('missing_integrity_service_identity');
    const keyJson = options.env.BOOK_INTEGRITY_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new BookIntegrityRepositoryError('missing_integrity_google_sa_key');
    }
    if (keyJson) {
      let clientEmail: unknown;
      try {
        clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
      } catch {
        throw new BookIntegrityRepositoryError('invalid_integrity_google_sa_key');
      }
      if (clientEmail !== identity) {
        throw new BookIntegrityRepositoryError('integrity_service_identity_mismatch');
      }
    }
    this.serviceIdentity = identity;
    this.serviceAccountKey = keyJson;
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? fetch,
      ...(options.getAccessToken ? { getAccessToken: options.getAccessToken } : {}),
      firebaseAuthToken: Boolean(options.getAccessToken),
    });
  }

  private assertIdentity(): void {
    if (this.options.env.BOOK_INTEGRITY_SERVICE_IDENTITY?.trim() !== this.serviceIdentity) {
      throw new BookIntegrityRepositoryError('integrity_service_identity_changed');
    }
  }

  private async ensureImmutableEvent(
    scopePath: string,
    event: BookIntegrityCanonicalEvent,
  ): Promise<void> {
    const eventPath = `${scopePath}/events/${event.eventId}`;
    if (await this.rtdb.writeIfMatch(eventPath, event, 'null_etag')) return;
    const existing = await this.rtdb.readValue(eventPath);
    if (!sameCanonicalEvent(existing, event)) {
      throw new BookIntegrityRepositoryError('integrity_immutable_event_conflict');
    }
  }

  async append(input: BookIntegrityRepositoryAppendInput): Promise<BookIntegrityCaptureResult> {
    this.assertIdentity();
    const scopePath = bookIntegrityAttemptScopePath(input.event);
    const ledgerPath = `${scopePath}/ledger`;
    for (let retry = 0; retry < MAX_RETRIES; retry += 1) {
      const currentRead = await this.rtdb.readWithEtag<unknown>(ledgerPath);
      const current = canonicalScope(currentRead.data, input.event, input.limits);
      const updated = transition(current, input);
      const canonicalEvent = updated.next?.events[input.event.eventId]
        ?? current.events[input.event.eventId];
      if (!updated.next) {
        if (updated.result.status === 'deduplicated' && canonicalEvent) {
          await this.ensureImmutableEvent(scopePath, canonicalEvent);
        }
        return updated.result;
      }
      if (await this.rtdb.writeIfMatch(ledgerPath, updated.next, currentRead.etag)) {
        if (updated.result.status === 'recorded' && canonicalEvent) {
          await this.ensureImmutableEvent(scopePath, canonicalEvent);
        }
        return updated.result;
      }
    }
    throw new BookIntegrityRepositoryError('integrity_repository_conflict');
  }
}
