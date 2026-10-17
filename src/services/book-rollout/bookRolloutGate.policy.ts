const ACTION_OPERATIONS = Object.freeze([
  'create',
  'upload',
  'publish',
  'assign-place',
  'launch-delivery',
  'mutation',
] as const);

const SAFE_OPERATIONS = Object.freeze([
  'read',
  'cleanup',
  'revocation',
  'recovery',
  'audit',
] as const);

const ENVIRONMENTS = Object.freeze([
  'development',
  'test',
  'staging',
  'production',
] as const);

const CONFIG_KEYS = Object.freeze([
  'schemaVersion',
  'environment',
  'revision',
  'issuedAt',
  'expiresAt',
  'actions',
] as const);

const MAX_POLICY_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const STATIC_FINGERPRINT = 'book-rollout-static-v1';
const INVALID_FINGERPRINT = 'book-rollout-invalid-v1';

export const BOOK_ROLLOUT_ACTION_OPERATIONS = ACTION_OPERATIONS;
export const BOOK_ROLLOUT_SAFE_OPERATIONS = SAFE_OPERATIONS;
export const BOOK_ROLLOUT_ENVIRONMENTS = ENVIRONMENTS;

export type BookRolloutActionOperation = typeof ACTION_OPERATIONS[number];
export type BookRolloutSafeOperation = typeof SAFE_OPERATIONS[number];
export type BookRolloutOperation = BookRolloutActionOperation | BookRolloutSafeOperation;
export type BookRolloutEnvironment = typeof ENVIRONMENTS[number];
export type BookRolloutActionSetting = 'allow' | 'deny';

/** Exact server-supplied rollout document schema. */
export interface BookRolloutGateConfigV1 {
  readonly schemaVersion: 'v1';
  readonly environment: BookRolloutEnvironment;
  readonly revision: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly actions: Readonly<Record<BookRolloutActionOperation, BookRolloutActionSetting>>;
}

/** Read fresh policy state for each action request. Do not cache result. */
export interface BookRolloutConfigReader {
  read(): unknown;
}

export interface BookRolloutGateRequest {
  readonly operation: BookRolloutOperation;
  readonly expectedEnvironment: string;
  readonly now: Date;
  readonly configReader?: BookRolloutConfigReader;
}

export type BookRolloutGateReason =
  | 'safe_operation'
  | 'invalid_operation'
  | 'invalid_now'
  | 'config_unreadable'
  | 'config_missing'
  | 'invalid_config'
  | 'unknown_environment'
  | 'environment_mismatch'
  | 'not_yet_issued'
  | 'expired'
  | 'lifetime_exceeded'
  | 'config_allowed'
  | 'config_denied';

/** Excludes config values, identities, books, content, credentials. */
export interface BookRolloutGateDecision {
  readonly schemaVersion: 1;
  readonly allowed: boolean;
  readonly operation: BookRolloutOperation | 'unknown';
  readonly policy: 'static-safe' | 'rollout-config';
  readonly reason: BookRolloutGateReason;
  readonly environment: BookRolloutEnvironment | 'unknown';
  readonly revision: string | 'unavailable';
  readonly fingerprint: string;
}

/** Minimal privacy-safe record for operational audit sinks. */
export interface BookRolloutGateAuditPayload {
  readonly schemaVersion: 1;
  readonly category: 'book-rollout-gate';
  readonly outcome: 'allowed' | 'denied';
  readonly operation: BookRolloutOperation | 'unknown';
  readonly policy: 'static-safe' | 'rollout-config';
  readonly reason: BookRolloutGateReason;
  readonly environment: BookRolloutEnvironment | 'unknown';
  readonly revision: string | 'unavailable';
  readonly fingerprint: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isKnownEnvironment = (value: unknown): value is BookRolloutEnvironment =>
  typeof value === 'string' && ENVIRONMENTS.includes(value as BookRolloutEnvironment);

const isActionOperation = (value: unknown): value is BookRolloutActionOperation =>
  typeof value === 'string' && ACTION_OPERATIONS.includes(value as BookRolloutActionOperation);

const isSafeOperation = (value: unknown): value is BookRolloutSafeOperation =>
  typeof value === 'string' && SAFE_OPERATIONS.includes(value as BookRolloutSafeOperation);

const parseCanonicalTimestamp = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;

  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z') ? parsed : undefined;
};

type ConfigParseResult =
  | { readonly ok: true; readonly config: BookRolloutGateConfigV1; readonly issuedAtMs: number; readonly expiresAtMs: number }
  | { readonly ok: false; readonly reason: 'config_missing' | 'invalid_config' | 'unknown_environment' };

const parseConfig = (value: unknown): ConfigParseResult => {
  if (value === undefined || value === null) return { ok: false, reason: 'config_missing' };
  if (!isRecord(value) || !hasExactKeys(value, CONFIG_KEYS)) return { ok: false, reason: 'invalid_config' };
  if (value.schemaVersion !== 'v1') return { ok: false, reason: 'invalid_config' };
  if (!isKnownEnvironment(value.environment)) return { ok: false, reason: 'unknown_environment' };
  if (typeof value.revision !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value.revision)
    || !isRecord(value.actions)) {
    return { ok: false, reason: 'invalid_config' };
  }
  if (!hasExactKeys(value.actions, ACTION_OPERATIONS)) return { ok: false, reason: 'invalid_config' };

  for (const operation of ACTION_OPERATIONS) {
    if (value.actions[operation] !== 'allow' && value.actions[operation] !== 'deny') {
      return { ok: false, reason: 'invalid_config' };
    }
  }

  const issuedAtMs = parseCanonicalTimestamp(value.issuedAt);
  const expiresAtMs = parseCanonicalTimestamp(value.expiresAt);
  if (issuedAtMs === undefined || expiresAtMs === undefined || expiresAtMs <= issuedAtMs) {
    return { ok: false, reason: 'invalid_config' };
  }

  return {
    ok: true,
    config: value as unknown as BookRolloutGateConfigV1,
    issuedAtMs,
    expiresAtMs,
  };
};

const fingerprintConfig = (config: BookRolloutGateConfigV1): string => {
  const canonical = JSON.stringify({
    schemaVersion: config.schemaVersion,
    environment: config.environment,
    revision: config.revision,
    issuedAt: config.issuedAt,
    expiresAt: config.expiresAt,
    actions: Object.fromEntries(ACTION_OPERATIONS.map((operation) => [operation, config.actions[operation]])),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = Math.imul(hash ^ canonical.charCodeAt(index), 0x01000193) >>> 0;
  }
  return `book-rollout-v1-${hash.toString(16).padStart(8, '0')}`;
};

const decision = (
  allowed: boolean,
  operation: BookRolloutOperation | 'unknown',
  policy: BookRolloutGateDecision['policy'],
  reason: BookRolloutGateReason,
  environment: BookRolloutEnvironment | 'unknown',
  revision: string | 'unavailable',
  fingerprint: string,
): BookRolloutGateDecision => ({
  schemaVersion: 1,
  allowed,
  operation,
  policy,
  reason,
  environment,
  revision,
  fingerprint,
});

/** Action requests read config on every call; untrusted client state has no input. */
export const evaluateBookRolloutGate = (input: BookRolloutGateRequest): BookRolloutGateDecision => {
  const expectedEnvironment = isKnownEnvironment(input.expectedEnvironment)
    ? input.expectedEnvironment
    : 'unknown';
  if (isSafeOperation(input.operation)) {
    return decision(
      true,
      input.operation,
      'static-safe',
      'safe_operation',
      expectedEnvironment,
      'unavailable',
      STATIC_FINGERPRINT,
    );
  }
  if (!isActionOperation(input.operation)) {
    return decision(false, 'unknown', 'rollout-config', 'invalid_operation', expectedEnvironment, 'unavailable', INVALID_FINGERPRINT);
  }
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    return decision(false, input.operation, 'rollout-config', 'invalid_now', expectedEnvironment, 'unavailable', INVALID_FINGERPRINT);
  }

  let rawConfig: unknown;
  try {
    if (!input.configReader || typeof input.configReader.read !== 'function') {
      return decision(false, input.operation, 'rollout-config', 'config_unreadable', expectedEnvironment, 'unavailable', INVALID_FINGERPRINT);
    }
    rawConfig = input.configReader.read();
  } catch {
    return decision(false, input.operation, 'rollout-config', 'config_unreadable', expectedEnvironment, 'unavailable', INVALID_FINGERPRINT);
  }

  let parsed: ConfigParseResult;
  try {
    parsed = parseConfig(rawConfig);
  } catch {
    return decision(false, input.operation, 'rollout-config', 'invalid_config', expectedEnvironment, 'unavailable', INVALID_FINGERPRINT);
  }
  if ('reason' in parsed) {
    return decision(false, input.operation, 'rollout-config', parsed.reason, expectedEnvironment, 'unavailable', INVALID_FINGERPRINT);
  }
  if (!isKnownEnvironment(input.expectedEnvironment)) {
    return decision(false, input.operation, 'rollout-config', 'unknown_environment', 'unknown', parsed.config.revision, INVALID_FINGERPRINT);
  }
  if (parsed.config.environment !== input.expectedEnvironment) {
    return decision(false, input.operation, 'rollout-config', 'environment_mismatch', expectedEnvironment, parsed.config.revision, INVALID_FINGERPRINT);
  }
  if (parsed.issuedAtMs > input.now.getTime()) {
    return decision(false, input.operation, 'rollout-config', 'not_yet_issued', expectedEnvironment, parsed.config.revision, INVALID_FINGERPRINT);
  }
  if (input.now.getTime() >= parsed.expiresAtMs) {
    return decision(false, input.operation, 'rollout-config', 'expired', expectedEnvironment, parsed.config.revision, INVALID_FINGERPRINT);
  }
  if (parsed.expiresAtMs - parsed.issuedAtMs > MAX_POLICY_LIFETIME_MS) {
    return decision(false, input.operation, 'rollout-config', 'lifetime_exceeded', expectedEnvironment, parsed.config.revision, INVALID_FINGERPRINT);
  }

  const fingerprint = fingerprintConfig(parsed.config);
  const allowed = parsed.config.actions[input.operation] === 'allow';
  return decision(
    allowed,
    input.operation,
    'rollout-config',
    allowed ? 'config_allowed' : 'config_denied',
    expectedEnvironment,
    parsed.config.revision,
    fingerprint,
  );
};

/** Decision-only input blocks audit callers from attaching sensitive subject data. */
export const buildBookRolloutGateAuditPayload = (
  value: BookRolloutGateDecision,
): BookRolloutGateAuditPayload => ({
  schemaVersion: 1,
  category: 'book-rollout-gate',
  outcome: value.allowed ? 'allowed' : 'denied',
  operation: value.operation,
  policy: value.policy,
  reason: value.reason,
  environment: value.environment,
  revision: value.revision,
  fingerprint: value.fingerprint,
});
