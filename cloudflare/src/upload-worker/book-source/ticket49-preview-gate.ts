const CONFIG_KEYS = Object.freeze([
  'schemaVersion',
  'environment',
  'emergencyState',
  'teacherId',
  'bookId',
  'providerObjectKeyPrefix',
  'issuedAt',
  'expiresAt',
] as const);

const CONFIG_SCHEMA_VERSION = 'v1' as const;
const PREVIEW_ENVIRONMENT = 'ticket49-preview' as const;
const MAX_CONFIG_LENGTH = 4_096;
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_OBJECT_KEY = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9!$&'()*+,=:@._\/-]{1,1024}$/u;

export const TICKET49_PREVIEW_ENVIRONMENT = PREVIEW_ENVIRONMENT;
export const TICKET49_PREVIEW_MAX_LIFETIME_MS = MAX_LIFETIME_MS;
export const TICKET49_PREVIEW_CONFIG_KEYS = CONFIG_KEYS;

export type Ticket49PreviewEmergencyState = 'enabled' | 'disabled';

/** The only deployment-owned document accepted by this isolated gate. */
export interface Ticket49PreviewGateConfig {
  readonly schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  readonly environment: typeof PREVIEW_ENVIRONMENT;
  readonly emergencyState: Ticket49PreviewEmergencyState;
  readonly teacherId: string;
  readonly bookId: string;
  readonly providerObjectKeyPrefix: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** Trusted identity and provider facts supplied by the canonical Worker path. */
export interface Ticket49PreviewUploadContext {
  readonly teacherId: unknown;
  readonly bookId: unknown;
  readonly providerObjectKeyPrefix: unknown;
}

export type Ticket49PreviewClock = Date | number;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const parseCanonicalTimestamp = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;

  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z') ? parsed : undefined;
};

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_IDENTIFIER.test(value);

const isSafeObjectKeyPrefix = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length > 1
  && value.endsWith('/')
  && SAFE_OBJECT_KEY.test(value);

const validConfigRecord = (value: unknown): value is Ticket49PreviewGateConfig => {
  if (!isRecord(value) || !hasExactKeys(value, CONFIG_KEYS)
    || value.schemaVersion !== CONFIG_SCHEMA_VERSION
    || value.environment !== PREVIEW_ENVIRONMENT
    || (value.emergencyState !== 'enabled' && value.emergencyState !== 'disabled')
    || !isSafeIdentifier(value.teacherId)
    || !isSafeIdentifier(value.bookId)
    || !isSafeObjectKeyPrefix(value.providerObjectKeyPrefix)) {
    return false;
  }

  const issuedAtMs = parseCanonicalTimestamp(value.issuedAt);
  const expiresAtMs = parseCanonicalTimestamp(value.expiresAt);
  return issuedAtMs !== undefined
    && expiresAtMs !== undefined
    && expiresAtMs > issuedAtMs
    && expiresAtMs - issuedAtMs <= MAX_LIFETIME_MS;
};

/**
 * Parses only a deployment-provided JSON string. Passing an object, including
 * one copied from a request body, is intentionally rejected.
 */
export const parseTicket49PreviewGateConfig = (
  rawDeploymentConfig: unknown,
): Ticket49PreviewGateConfig | null => {
  if (typeof rawDeploymentConfig !== 'string'
    || rawDeploymentConfig.length === 0
    || rawDeploymentConfig.length > MAX_CONFIG_LENGTH) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDeploymentConfig) as unknown;
  } catch {
    return null;
  }

  if (!validConfigRecord(parsed)) return null;
  return Object.freeze({ ...parsed });
};

const clockMs = (now: Ticket49PreviewClock): number => {
  const value = now instanceof Date ? now.getTime() : now;
  return Number.isSafeInteger(value) ? value : Number.NaN;
};

/**
 * Pure fail-closed evaluator. The deployment JSON is a separate argument from
 * request context so browser/request-body fields cannot provide gate config.
 */
export const evaluateTicket49PreviewUploadGate = (
  rawDeploymentConfig: unknown,
  context: Ticket49PreviewUploadContext,
  now: Ticket49PreviewClock,
): boolean => {
  const config = parseTicket49PreviewGateConfig(rawDeploymentConfig);
  if (!config || config.emergencyState !== 'enabled') return false;

  const nowMs = clockMs(now);
  const issuedAtMs = parseCanonicalTimestamp(config.issuedAt);
  const expiresAtMs = parseCanonicalTimestamp(config.expiresAt);
  if (Number.isNaN(nowMs) || issuedAtMs === undefined || expiresAtMs === undefined
    || nowMs < issuedAtMs || nowMs >= expiresAtMs) {
    return false;
  }

  if (!isRecord(context)
    || context.teacherId !== config.teacherId
    || context.bookId !== config.bookId
    || context.providerObjectKeyPrefix !== config.providerObjectKeyPrefix) {
    return false;
  }

  return true;
};
