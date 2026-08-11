import {
  BOOK_ROLLOUT_ENVIRONMENTS,
  type BookRolloutActionOperation,
  type BookRolloutEnvironment,
} from './bookRolloutGate.policy.ts';

export const BOOK_PILOT_MAX_STUDENTS = 30;
export const BOOK_PILOT_SCOPE_SCHEMA_VERSION = 'v1' as const;

const CONFIG_KEYS = Object.freeze([
  'schemaVersion',
  'environment',
  'revision',
  'issuedAt',
  'expiresAt',
  'teacherId',
  'bookId',
  'assignmentId',
  'studentIds',
  'maxStudents',
] as const);

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const MAX_POLICY_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const INVALID_FINGERPRINT = 'book-pilot-scope-invalid-v1';
export const BOOK_PILOT_SCOPE_ENFORCEMENT_DISABLED_FINGERPRINT =
  'book-pilot-scope-enforcement-disabled-v1';

export interface BookPilotScopeConfigV1 {
  readonly schemaVersion: typeof BOOK_PILOT_SCOPE_SCHEMA_VERSION;
  readonly environment: BookRolloutEnvironment;
  readonly revision: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly teacherId: string | null;
  readonly bookId: string | null;
  readonly assignmentId: string | null;
  readonly studentIds: readonly string[];
  readonly maxStudents: typeof BOOK_PILOT_MAX_STUDENTS;
}

export interface BookPilotScopeConfigReader {
  read(): unknown;
}

export type BookPilotActorKind = 'teacher' | 'student';

export interface BookPilotScopeRequest {
  readonly operation: BookRolloutActionOperation;
  readonly expectedEnvironment: string;
  readonly actorId: string;
  readonly actorKind: BookPilotActorKind;
  readonly bookId?: string;
  readonly assignmentId?: string;
  readonly contextKind?: string;
  readonly studentId?: string;
  readonly selectedStudentIds?: readonly string[];
  readonly count?: number;
  readonly requireBook?: boolean;
  readonly requireAssignment?: boolean;
  readonly requireStudents?: boolean;
  readonly configReader?: BookPilotScopeConfigReader;
  readonly now: Date;
}

export type BookPilotScopeReason =
  | 'enforcement_disabled'
  | 'config_unreadable'
  | 'config_missing'
  | 'invalid_config'
  | 'unknown_environment'
  | 'environment_mismatch'
  | 'not_yet_issued'
  | 'expired'
  | 'lifetime_exceeded'
  | 'identity_unresolved'
  | 'teacher_denied'
  | 'book_denied'
  | 'assignment_denied'
  | 'student_denied'
  | 'count_exceeded'
  | 'subject_missing'
  | 'config_allowed';

export interface BookPilotScopeDecision {
  readonly schemaVersion: 1;
  readonly allowed: boolean;
  readonly operation: BookRolloutActionOperation;
  readonly reason: BookPilotScopeReason;
  readonly environment: BookRolloutEnvironment | 'unknown';
  readonly revision: string | 'unavailable';
  readonly fingerprint: string;
}

export interface BookPilotScopeAuditPayload {
  readonly schemaVersion: 1;
  readonly category: 'book-pilot-scope';
  readonly outcome: 'allowed' | 'denied';
  readonly operation: BookRolloutActionOperation;
  readonly reason: BookPilotScopeReason;
  readonly environment: BookRolloutEnvironment | 'unknown';
  readonly revision: string | 'unavailable';
  readonly fingerprint: string;
}

type ParseResult =
  | { readonly ok: true; readonly config: BookPilotScopeConfigV1; readonly issuedAtMs: number; readonly expiresAtMs: number }
  | { readonly ok: false; readonly reason: 'config_missing' | 'invalid_config' | 'unknown_environment' };

const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const knownEnvironment = (value: unknown): value is BookRolloutEnvironment => (
  typeof value === 'string' && BOOK_ROLLOUT_ENVIRONMENTS.includes(value as BookRolloutEnvironment)
);

const timestamp = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z') ? parsed : undefined;
};

const nullableId = (value: unknown): value is string | null => value === null || (
  typeof value === 'string' && ID.test(value) && !value.startsWith('__UNRESOLVED__')
);

const parseConfig = (value: unknown): ParseResult => {
  if (value === undefined || value === null) return { ok: false, reason: 'config_missing' };
  if (!record(value) || !exactKeys(value, CONFIG_KEYS)
    || value.schemaVersion !== BOOK_PILOT_SCOPE_SCHEMA_VERSION
    || !knownEnvironment(value.environment)
    || typeof value.revision !== 'string' || !REVISION.test(value.revision)
    || !nullableId(value.teacherId) || !nullableId(value.bookId) || !nullableId(value.assignmentId)
    || !Array.isArray(value.studentIds)
    || value.studentIds.some((studentId) => typeof studentId !== 'string' || !ID.test(studentId)
      || studentId.startsWith('__UNRESOLVED__'))
    || new Set(value.studentIds).size !== value.studentIds.length
    || value.studentIds.length > BOOK_PILOT_MAX_STUDENTS
    || value.maxStudents !== BOOK_PILOT_MAX_STUDENTS) {
    return { ok: false, reason: 'invalid_config' };
  }
  const issuedAtMs = timestamp(value.issuedAt);
  const expiresAtMs = timestamp(value.expiresAt);
  if (issuedAtMs === undefined || expiresAtMs === undefined || expiresAtMs <= issuedAtMs) {
    return { ok: false, reason: 'invalid_config' };
  }
  return {
    ok: true,
    config: value as unknown as BookPilotScopeConfigV1,
    issuedAtMs,
    expiresAtMs,
  };
};

const fingerprint = (config: BookPilotScopeConfigV1): string => {
  const canonical = JSON.stringify({
    schemaVersion: config.schemaVersion,
    environment: config.environment,
    revision: config.revision,
    issuedAt: config.issuedAt,
    expiresAt: config.expiresAt,
    teacherId: config.teacherId,
    bookId: config.bookId,
    assignmentId: config.assignmentId,
    studentIds: [...config.studentIds],
    maxStudents: config.maxStudents,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = Math.imul(hash ^ canonical.charCodeAt(index), 0x01000193) >>> 0;
  }
  return `book-pilot-scope-v1-${hash.toString(16).padStart(8, '0')}`;
};

const denied = (
  input: BookPilotScopeRequest,
  reason: BookPilotScopeReason,
  environment: BookPilotScopeDecision['environment'] = 'unknown',
  revision: BookPilotScopeDecision['revision'] = 'unavailable',
  configFingerprint = INVALID_FINGERPRINT,
): BookPilotScopeDecision => ({
  schemaVersion: 1,
  allowed: false,
  operation: input.operation,
  reason,
  environment,
  revision,
  fingerprint: configFingerprint,
});

const selectedIds = (input: BookPilotScopeRequest): readonly string[] => (
  input.selectedStudentIds ?? (input.studentId === undefined ? [] : [input.studentId])
);

/**
 * Evaluate the exact bounded pilot subject. IDs are supplied by the trusted
 * route adapter from authenticated identity/path/validated payload context;
 * the client never supplies authorization state.
 */
export const evaluateBookPilotScope = (input: BookPilotScopeRequest): BookPilotScopeDecision => {
  const environment = knownEnvironment(input.expectedEnvironment) ? input.expectedEnvironment : 'unknown';
  if (!input.configReader || typeof input.configReader.read !== 'function') {
    return denied(input, 'config_unreadable', environment);
  }
  let parsed: ParseResult;
  try {
    parsed = parseConfig(input.configReader.read());
  } catch {
    return denied(input, 'invalid_config', environment);
  }
  if (!parsed.ok) return denied(input, parsed.reason, environment);
  const configFingerprint = fingerprint(parsed.config);
  if (environment === 'unknown') return denied(input, 'unknown_environment', 'unknown', parsed.config.revision);
  if (parsed.config.environment !== input.expectedEnvironment) {
    return denied(input, 'environment_mismatch', environment, parsed.config.revision);
  }
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    return denied(input, 'invalid_config', environment, parsed.config.revision);
  }
  if (parsed.issuedAtMs > input.now.getTime()) {
    return denied(input, 'not_yet_issued', environment, parsed.config.revision);
  }
  if (input.now.getTime() >= parsed.expiresAtMs) {
    return denied(input, 'expired', environment, parsed.config.revision);
  }
  if (parsed.expiresAtMs - parsed.issuedAtMs > MAX_POLICY_LIFETIME_MS) {
    return denied(input, 'lifetime_exceeded', environment, parsed.config.revision);
  }
  if (parsed.config.teacherId === null || parsed.config.bookId === null || parsed.config.assignmentId === null
    || parsed.config.studentIds.length === 0) {
    return denied(input, 'identity_unresolved', environment, parsed.config.revision, configFingerprint);
  }
  if (input.actorKind === 'teacher' && input.actorId !== parsed.config.teacherId) {
    return denied(input, 'teacher_denied', environment, parsed.config.revision, configFingerprint);
  }
  if (input.actorKind === 'student'
    && (!parsed.config.studentIds.includes(input.actorId)
      || (input.studentId !== undefined && input.studentId !== input.actorId))) {
    return denied(input, 'student_denied', environment, parsed.config.revision, configFingerprint);
  }
  if (input.requireBook && input.bookId !== parsed.config.bookId) {
    return denied(input, input.bookId === undefined ? 'subject_missing' : 'book_denied', environment, parsed.config.revision, configFingerprint);
  }
  if (input.requireAssignment && input.assignmentId !== parsed.config.assignmentId) {
    return denied(input, input.assignmentId === undefined ? 'subject_missing' : 'assignment_denied', environment, parsed.config.revision, configFingerprint);
  }
  if (input.requireAssignment && input.contextKind !== undefined && input.contextKind !== 'homework') {
    return denied(input, 'assignment_denied', environment, parsed.config.revision, configFingerprint);
  }
  const students = selectedIds(input);
  if (input.requireStudents && students.length === 0) {
    return denied(input, 'subject_missing', environment, parsed.config.revision, configFingerprint);
  }
  if (input.count !== undefined
    && (!Number.isSafeInteger(input.count) || input.count < 0 || input.count > BOOK_PILOT_MAX_STUDENTS
      || input.count !== students.length)) {
    return denied(input, 'count_exceeded', environment, parsed.config.revision, configFingerprint);
  }
  if (students.length > BOOK_PILOT_MAX_STUDENTS
    || new Set(students).size !== students.length
    || students.some((studentId) => !parsed.config.studentIds.includes(studentId))) {
    return denied(input, students.length > BOOK_PILOT_MAX_STUDENTS ? 'count_exceeded' : 'student_denied', environment, parsed.config.revision, configFingerprint);
  }
  return {
    schemaVersion: 1,
    allowed: true,
    operation: input.operation,
    reason: 'config_allowed',
    environment,
    revision: parsed.config.revision,
    fingerprint: configFingerprint,
  };
};

export const buildBookPilotScopeAuditPayload = (
  decision: BookPilotScopeDecision,
): BookPilotScopeAuditPayload => ({
  schemaVersion: 1,
  category: 'book-pilot-scope',
  outcome: decision.allowed ? 'allowed' : 'denied',
  operation: decision.operation,
  reason: decision.reason,
  environment: decision.environment,
  revision: decision.revision,
  fingerprint: decision.fingerprint,
});

export const validateBookPilotScopeConfig = (value: unknown): BookPilotScopeConfigV1 | null => {
  const parsed = parseConfig(value);
  return parsed.ok ? parsed.config : null;
};
