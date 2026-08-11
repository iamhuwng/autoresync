import type {
  RecoveryEnvelope,
  RecoveryEnvelopeAuthorization,
  RecoveryEnvelopeIntegrity,
  RecoveryEnvelopePhase,
  RecoverySnapshotIdentity,
} from '../types';
import {
  BOOK_METADATA_CANONICAL_ROOTS,
} from './book-source-restore';

export type { RecoveryEnvelope } from '../types';

export const RECOVERY_ENVELOPE_KIND = 'book-recovery-envelope' as const;
export const RECOVERY_ENVELOPE_MAX_TTL_MS = 15 * 60 * 1000;
export const RECOVERY_ENVELOPE_CLOCK_SKEW_MS = 30 * 1000;

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type RecoveryRuntimeIdentity =
  | { readonly kind: 'deployment-operator' | 'deployment-service'; readonly identity: string }
  | { readonly kind: 'browser' | 'ordinary-service'; readonly identity: string };

export interface RecoveryEnvelopeIntegrityVerifier {
  verify(payload: string, integrity: RecoveryEnvelopeIntegrity): boolean | Promise<boolean>;
}

export interface RecoveryEnvelopeIntegritySigner {
  sign(payload: string): string | Promise<string>;
}

export interface RecoverySnapshotInput {
  readonly backupId?: string;
  readonly snapshotId?: string;
  readonly firebaseProject: string;
  readonly tenantId: string;
  readonly ownerId: string;
  readonly inventoryVersion: string;
  readonly inventoryFingerprint: string;
  readonly allowedRoots: readonly string[];
}

export interface IssueRecoveryEnvelopeInput {
  readonly snapshot: RecoverySnapshotInput;
  readonly phase: RecoveryEnvelopePhase;
  readonly idempotencyKey: string;
  readonly issuedAt?: string | number | Date;
  readonly expiresAt?: string | number | Date;
  readonly authorized: RecoveryEnvelopeAuthorization;
  readonly runtime: RecoveryRuntimeIdentity;
}

export interface ValidateRecoveryEnvelopeOptions {
  readonly now?: string | number | Date;
  readonly expectedPhase?: RecoveryEnvelopePhase;
  readonly expectedSnapshot?: Partial<RecoverySnapshotIdentity> & {
    readonly allowedRoots?: readonly string[];
  };
  readonly runtime?: RecoveryRuntimeIdentity;
  readonly verifier?: RecoveryEnvelopeIntegrityVerifier;
}

export interface RecoveryEnvelopeValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly RecoveryEnvelopeDiagnostic[];
}

export interface RecoveryEnvelopeDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export class RecoveryEnvelopeError extends Error {
  readonly name = 'RecoveryEnvelopeError';

  constructor(
    readonly code: string,
    message: string,
    readonly diagnostics: readonly RecoveryEnvelopeDiagnostic[] = [],
  ) {
    super(`${code}: ${message}`);
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const stableSerialize = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RecoveryEnvelopeError('invalid-integrity-payload', 'Envelope contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (!isPlainRecord(value)) throw new RecoveryEnvelopeError('invalid-integrity-payload', 'Envelope contains an unsupported value.');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
};

const asDate = (value: string | number | Date | undefined, fallback: Date): Date => {
  if (value === undefined) return fallback;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RecoveryEnvelopeError('invalid-timestamp', 'Envelope timestamp is invalid.');
  return date;
};

const add = (
  diagnostics: RecoveryEnvelopeDiagnostic[],
  code: string,
  path: string,
  message: string,
): void => {
  diagnostics.push({ code, path, message });
};

const canonicalRoots = (): readonly string[] => [
  ...BOOK_METADATA_CANONICAL_ROOTS,
];

export const RECOVERY_CANONICAL_ROOTS = Object.freeze(canonicalRoots());

const normalizeSnapshot = (input: RecoverySnapshotInput): RecoverySnapshotIdentity => {
  const backupId = input.backupId ?? input.snapshotId;
  const snapshotId = input.snapshotId ?? input.backupId;
  if (!backupId || !snapshotId || backupId !== snapshotId) {
    throw new RecoveryEnvelopeError('snapshot-identity-mismatch', 'backupId and snapshotId must both identify the same snapshot.');
  }
  return {
    backupId,
    snapshotId,
    firebaseProject: input.firebaseProject,
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    inventoryVersion: input.inventoryVersion,
    inventoryFingerprint: input.inventoryFingerprint,
    allowedRoots: [...input.allowedRoots],
  };
};

/** Payload bound by the injected signature verifier. */
export const recoveryEnvelopeIntegrityPayload = (envelope: RecoveryEnvelope): string => {
  const { integrity: _integrity, ...unsigned } = envelope;
  return stableSerialize(unsigned);
};

const validateShape = (
  envelope: unknown,
  options: ValidateRecoveryEnvelopeOptions,
): RecoveryEnvelopeValidationResult => {
  const diagnostics: RecoveryEnvelopeDiagnostic[] = [];
  if (!isPlainRecord(envelope)) {
    add(diagnostics, 'invalid-envelope', '$', 'Recovery envelope must be a plain object.');
    return { valid: false, diagnostics };
  }
  const value = envelope as Partial<RecoveryEnvelope>;
  if (value.kind !== RECOVERY_ENVELOPE_KIND) add(diagnostics, 'invalid-kind', '$.kind', 'Recovery envelope kind is invalid.');
  if (value.schemaVersion !== 'prd0062-49a-v1') add(diagnostics, 'invalid-schema-version', '$.schemaVersion', 'Unsupported recovery envelope schema version.');
  if (value.phase !== 'dry-run' && value.phase !== 'execute') add(diagnostics, 'invalid-phase', '$.phase', 'Recovery envelope phase must be dry-run or execute.');
  if (options.expectedPhase !== undefined && value.phase !== options.expectedPhase) add(diagnostics, 'phase-mismatch', '$.phase', 'Envelope phase does not match the requested operation.');
  if (typeof value.idempotencyKey !== 'string' || !SAFE_IDENTIFIER.test(value.idempotencyKey)) add(diagnostics, 'invalid-idempotency-key', '$.idempotencyKey', 'Idempotency key is missing or unsafe.');

  const snapshot = isPlainRecord(value.snapshot) ? value.snapshot as Partial<RecoverySnapshotIdentity> : null;
  if (!snapshot) {
    add(diagnostics, 'invalid-snapshot', '$.snapshot', 'Snapshot identity is required.');
  } else {
    for (const field of ['backupId', 'snapshotId', 'firebaseProject', 'tenantId', 'ownerId', 'inventoryVersion', 'inventoryFingerprint'] as const) {
      const fieldValue = snapshot[field];
      if (typeof fieldValue !== 'string' || fieldValue.length === 0 || fieldValue.length > 512) {
        add(diagnostics, 'invalid-snapshot', `$.snapshot.${field}`, `${field} is required and bounded.`);
      }
    }
    if (snapshot.backupId !== snapshot.snapshotId) add(diagnostics, 'snapshot-identity-mismatch', '$.snapshot', 'backupId and snapshotId must match.');
    if (typeof snapshot.backupId === 'string' && !SAFE_IDENTIFIER.test(snapshot.backupId)) add(diagnostics, 'invalid-snapshot', '$.snapshot.backupId', 'Snapshot identifier is unsafe.');
    if (typeof snapshot.snapshotId === 'string' && !SAFE_IDENTIFIER.test(snapshot.snapshotId)) add(diagnostics, 'invalid-snapshot', '$.snapshot.snapshotId', 'Snapshot identifier is unsafe.');
    if (snapshot.inventoryVersion !== 'prd0062-48b-v1') add(diagnostics, 'invalid-inventory-version', '$.snapshot.inventoryVersion', 'Recovery envelope does not accept this metadata inventory version.');
    if (typeof snapshot.allowedRoots !== 'object' || !Array.isArray(snapshot.allowedRoots) || snapshot.allowedRoots.length === 0) {
      add(diagnostics, 'invalid-root-scope', '$.snapshot.allowedRoots', 'At least one canonical root must be explicitly allowed.');
    } else {
      const roots = snapshot.allowedRoots;
      const canonical = RECOVERY_CANONICAL_ROOTS;
      const indexes = roots.map((root) => canonical.indexOf(root));
      if (roots.some((root) => typeof root !== 'string' || !canonical.includes(root))) add(diagnostics, 'root-scope-broadened', '$.snapshot.allowedRoots', 'Allowed roots must be canonical enumerated roots.');
      if (new Set(roots).size !== roots.length) add(diagnostics, 'invalid-root-scope', '$.snapshot.allowedRoots', 'Allowed roots must not repeat.');
      if (indexes.some((index, position) => index < 0 || (position > 0 && index <= indexes[position - 1]))) add(diagnostics, 'invalid-root-scope-order', '$.snapshot.allowedRoots', 'Allowed roots must use canonical order.');
    }
    if (options.expectedSnapshot) {
      const expected = options.expectedSnapshot;
      for (const field of ['backupId', 'snapshotId', 'firebaseProject', 'tenantId', 'ownerId', 'inventoryVersion', 'inventoryFingerprint'] as const) {
        if (expected[field] !== undefined && snapshot[field] !== expected[field]) add(diagnostics, 'snapshot-mismatch', `$.snapshot.${field}`, `Snapshot ${field} does not match the authorized operation.`);
      }
      if (expected.allowedRoots !== undefined && JSON.stringify(snapshot.allowedRoots) !== JSON.stringify(expected.allowedRoots)) add(diagnostics, 'root-scope-mismatch', '$.snapshot.allowedRoots', 'Envelope root scope does not match the authorized operation.');
    }
  }

  for (const field of ['issuedAt', 'expiresAt'] as const) {
    if (typeof value[field] !== 'string' || !ISO_DATE.test(value[field]) || !Number.isFinite(Date.parse(value[field]))) add(diagnostics, 'invalid-timestamp', `$.${field}`, `${field} must be a UTC ISO timestamp.`);
  }
  if (typeof value.issuedAt === 'string' && typeof value.expiresAt === 'string' && ISO_DATE.test(value.issuedAt) && ISO_DATE.test(value.expiresAt)) {
    const issued = Date.parse(value.issuedAt);
    const expires = Date.parse(value.expiresAt);
    const now = asDate(options.now, new Date()).getTime();
    if (expires <= issued) add(diagnostics, 'invalid-expiry', '$.expiresAt', 'expiresAt must be after issuedAt.');
    if (expires - issued > RECOVERY_ENVELOPE_MAX_TTL_MS) add(diagnostics, 'expiry-too-long', '$.expiresAt', 'Recovery envelope lifetime is longer than the deployment limit.');
    if (issued > now + RECOVERY_ENVELOPE_CLOCK_SKEW_MS) add(diagnostics, 'issued-in-future', '$.issuedAt', 'Recovery envelope is not valid before its issue time.');
    if (now >= expires) add(diagnostics, 'expired', '$.expiresAt', 'Recovery envelope has expired.');
  }

  const authorized = isPlainRecord(value.authorized) ? value.authorized as Partial<RecoveryEnvelopeAuthorization> : null;
  if (!authorized || (authorized.kind !== 'deployment-operator' && authorized.kind !== 'deployment-service') || typeof authorized.identity !== 'string' || !SAFE_IDENTIFIER.test(authorized.identity)) {
    add(diagnostics, 'unauthorized-identity', '$.authorized', 'Only a bounded deployment operator or deployment service may authorize recovery.');
  }
  const integrity = isPlainRecord(value.integrity) ? value.integrity as Partial<RecoveryEnvelopeIntegrity> : null;
  if (!integrity || integrity.algorithm !== 'injected-signature' || typeof integrity.value !== 'string' || integrity.value.length === 0 || integrity.value.length > 2048) {
    add(diagnostics, 'invalid-integrity', '$.integrity', 'A bounded injected integrity binding is required.');
  }
  if (options.runtime) {
    if (options.runtime.kind !== 'deployment-operator' && options.runtime.kind !== 'deployment-service') add(diagnostics, 'ordinary-identity-denied', '$.runtime', 'Browser and ordinary service identities cannot use recovery envelopes.');
    if (authorized && options.runtime.identity !== authorized.identity) add(diagnostics, 'operator-mismatch', '$.runtime.identity', 'Runtime identity does not match the authorized envelope identity.');
  }
  return { valid: diagnostics.length === 0, diagnostics };
};

export const validateRecoveryEnvelope = async (
  envelope: unknown,
  options: ValidateRecoveryEnvelopeOptions = {},
): Promise<RecoveryEnvelopeValidationResult> => {
  const result = validateShape(envelope, options);
  if (!result.valid || !options.verifier) {
    if (result.valid) return { valid: false, diagnostics: [{ code: 'integrity-verifier-required', path: '$.integrity', message: 'Recovery use requires an injected integrity verifier.' }] };
    return result;
  }
  const candidate = envelope as RecoveryEnvelope;
  let verified = false;
  try {
    verified = await options.verifier.verify(recoveryEnvelopeIntegrityPayload(candidate), candidate.integrity);
  } catch {
    verified = false;
  }
  return verified
    ? result
    : { valid: false, diagnostics: [...result.diagnostics, { code: 'integrity-mismatch', path: '$.integrity', message: 'Recovery envelope integrity verification failed.' }] };
};

export const assertRecoveryEnvelope = async (
  envelope: unknown,
  options: ValidateRecoveryEnvelopeOptions = {},
): Promise<RecoveryEnvelope> => {
  const result = await validateRecoveryEnvelope(envelope, options);
  if (!result.valid) throw new RecoveryEnvelopeError(result.diagnostics[0]?.code ?? 'invalid-envelope', result.diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join('; '), result.diagnostics);
  return envelope as RecoveryEnvelope;
};

/** Minting is deliberately deployment-only and always uses the injected signer. */
export const issueRecoveryEnvelope = async (
  input: IssueRecoveryEnvelopeInput,
  signer: RecoveryEnvelopeIntegritySigner,
  now = new Date(),
): Promise<RecoveryEnvelope> => {
  if (input.runtime.kind !== 'deployment-operator' && input.runtime.kind !== 'deployment-service') throw new RecoveryEnvelopeError('ordinary-identity-denied', 'Only deployment identities may mint recovery envelopes.');
  if (input.runtime.identity !== input.authorized.identity) throw new RecoveryEnvelopeError('operator-mismatch', 'Minting identity must equal the authorized envelope identity.');
  const issuedAt = asDate(input.issuedAt, now);
  const expiresAt = asDate(input.expiresAt, new Date(issuedAt.getTime() + RECOVERY_ENVELOPE_MAX_TTL_MS));
  const envelopeWithoutIntegrity = {
    kind: RECOVERY_ENVELOPE_KIND,
    schemaVersion: 'prd0062-49a-v1' as const,
    snapshot: normalizeSnapshot(input.snapshot),
    phase: input.phase,
    idempotencyKey: input.idempotencyKey,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    authorized: input.authorized,
  };
  const payload = stableSerialize(envelopeWithoutIntegrity);
  const value = await signer.sign(payload);
  const envelope: RecoveryEnvelope = {
    ...envelopeWithoutIntegrity,
    integrity: { algorithm: 'injected-signature', value },
  };
  await assertRecoveryEnvelope(envelope, {
    now,
    runtime: input.runtime,
    verifier: { verify: (candidate, integrity) => candidate === payload && integrity.value === value },
  });
  return Object.freeze(envelope);
};

export const mintRecoveryEnvelope = issueRecoveryEnvelope;
export const verifyRecoveryEnvelope = validateRecoveryEnvelope;
export const authorizeRecoveryEnvelope = assertRecoveryEnvelope;

export const assertRecoveryEnvelopeScope = async (
  envelope: unknown,
  expected: {
    readonly phase: RecoveryEnvelopePhase;
    readonly snapshot: RecoverySnapshotIdentity;
    readonly runtime: RecoveryRuntimeIdentity;
    readonly verifier: RecoveryEnvelopeIntegrityVerifier;
    readonly now?: string | number | Date;
  },
): Promise<RecoveryEnvelope> => assertRecoveryEnvelope(envelope, {
  expectedPhase: expected.phase,
  expectedSnapshot: expected.snapshot,
  runtime: expected.runtime,
  verifier: expected.verifier,
  now: expected.now,
});
