export const BOOK_INTEGRITY_SCHEMA_VERSION = 1 as const;
export const BOOK_INTEGRITY_MAX_EVENTS_PER_ATTEMPT = 64;
export const BOOK_INTEGRITY_MAX_EVENTS_PER_WINDOW = 8;
export const BOOK_INTEGRITY_RATE_WINDOW_MS = 60_000;
export const BOOK_INTEGRITY_MAX_SESSIONS_PER_ATTEMPT = 4;
export const BOOK_INTEGRITY_SESSION_LEASE_MS = 90_000;
export const BOOK_INTEGRITY_MIN_INACTIVITY_MS = 5_000;
export const BOOK_INTEGRITY_MAX_INACTIVITY_MS = 30 * 60_000;
export const BOOK_INTEGRITY_MAX_REQUEST_BYTES = 4 * 1024;

export const BOOK_INTEGRITY_SIGNAL_TYPES = [
  'visibility_loss',
  'focus_loss',
  'route_reload_close',
  'paste',
  'protected_copy',
  'focus_mode_exit',
  'concurrent_attempt',
  'inactivity',
] as const;

export type BookIntegritySignalType = typeof BOOK_INTEGRITY_SIGNAL_TYPES[number];
export type BookIntegrityIntent = 'accountable' | 'practice';

export type BookIntegritySignalPolicy = Readonly<Record<BookIntegritySignalType, boolean>>;

export interface BookIntegrityFrozenPolicy {
  readonly schemaVersion: typeof BOOK_INTEGRITY_SCHEMA_VERSION;
  readonly policyId: string;
  readonly policyRevision: number;
  readonly intent: BookIntegrityIntent;
  readonly enabled: boolean;
  readonly signals: BookIntegritySignalPolicy;
  readonly requiredFocusMode: boolean;
  readonly inactivityThresholdMs: number;
}

export interface BookIntegrityCaptureTarget {
  readonly bookId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly contextKind: 'homework';
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
}

export interface BookIntegritySignalRequest {
  readonly schemaVersion: typeof BOOK_INTEGRITY_SCHEMA_VERSION;
  readonly target: BookIntegrityCaptureTarget;
  readonly policyId: string;
  readonly policyRevision: number;
  readonly clientSessionId: string;
  readonly sequence: number;
  readonly signal: BookIntegritySignalType;
}

export interface BookIntegrityAttemptAuthority extends BookIntegrityCaptureTarget {
  readonly recipientId: string;
  readonly accountableAttemptId: string;
  readonly attemptNumber: number;
  readonly active: boolean;
  readonly frozenPolicy: BookIntegrityFrozenPolicy;
}

export interface BookIntegrityCanonicalEvent {
  readonly schemaVersion: typeof BOOK_INTEGRITY_SCHEMA_VERSION;
  readonly eventId: string;
  readonly requestFingerprint: string;
  readonly signal: BookIntegritySignalType;
  readonly recordedAt: string;
  readonly source: 'browser';
  readonly clientSessionId: string;
  readonly sequence: number;
  readonly recipientId: string;
  readonly accountableAttemptId: string;
  readonly attemptNumber: number;
  readonly target: BookIntegrityCaptureTarget;
  readonly policyId: string;
  readonly policyRevision: number;
}

export type BookIntegrityIgnoredReason =
  | 'inactive_attempt'
  | 'attempt_mismatch'
  | 'policy_off'
  | 'signal_disabled'
  | 'not_concurrent'
  | 'event_limit'
  | 'replay_conflict';

export type BookIntegrityCaptureResult =
  | {
      readonly status: 'recorded' | 'deduplicated';
      readonly eventId: string;
      readonly signal: BookIntegritySignalType;
      readonly recordedAt: string;
      readonly recordedEventCount: number;
    }
  | {
      readonly status: 'rate_limited';
      readonly signal: BookIntegritySignalType;
      readonly retryAfterMs: number;
      readonly recordedEventCount: number;
    }
  | {
      readonly status: 'ignored';
      readonly signal: BookIntegritySignalType;
      readonly reason: BookIntegrityIgnoredReason;
      readonly recordedEventCount: number;
    };

export interface BookIntegrityRepositoryAppendInput {
  readonly event: BookIntegrityCanonicalEvent;
  readonly nowMs: number;
  readonly limits: {
    readonly maxEvents: number;
    readonly maxEventsPerWindow: number;
    readonly rateWindowMs: number;
    readonly maxSessions: number;
    readonly sessionLeaseMs: number;
  };
}

export interface BookIntegrityRepository {
  append(input: BookIntegrityRepositoryAppendInput): Promise<BookIntegrityCaptureResult>;
}

export interface BookIntegrityCaptureClient {
  recordSignal(
    request: BookIntegritySignalRequest,
    options?: { readonly keepalive?: boolean },
  ): Promise<BookIntegrityCaptureResult>;
}

export interface BookIntegrityWarning {
  readonly signal: BookIntegritySignalType;
  readonly eventId: string;
  readonly message: string;
}
