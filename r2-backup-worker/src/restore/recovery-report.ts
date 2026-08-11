import type { RecoverySuppressionContext } from './recovery-suppression';

export const RECOVERY_RECONCILIATION_REPORT_SCHEMA_VERSION = 'prd0062-49e-v1' as const;

/**
 * These are the logical recovery stages. The durable #121 ledger remains
 * three-phase; #125 maps its rebuilding phase to the three middle stages.
 */
export const RECOVERY_RECONCILIATION_PHASES = Object.freeze([
  'canonical-authority',
  'source-delivery',
  'runtime-results-completion',
  'updates-checkpoints-notifications-replacement-audit',
  'reconciliation-ledger-completion',
] as const);

export type RecoveryReconciliationPhase = typeof RECOVERY_RECONCILIATION_PHASES[number];

export interface RecoveryReconciliationCounts {
  readonly total: number;
  readonly pending: number;
  readonly completed: number;
  readonly invalid: number;
  readonly unavailable: number;
  readonly externallyMissing: number;
  readonly retryable: number;
  readonly terminal: number;
}

export interface RecoveryReconciliationPhaseReport {
  readonly phase: RecoveryReconciliationPhase;
  readonly stableHash: string;
  readonly counts: RecoveryReconciliationCounts;
}

/**
 * Side effects are represented explicitly instead of inferred from a total.
 * Every field is part of the fail-closed report contract and must remain zero
 * for #125. Recovery-ledger state transitions are reported separately.
 */
export interface RecoverySideEffectReport {
  readonly productionWrites: 0;
  readonly externalProviderOperations: 0;
  readonly providerOperations: 0;
  readonly studentCommandExecutions: 0;
  readonly commandExecutions: 0;
  readonly scoringCalls: 0;
  readonly gradingCalls: 0;
  readonly completionWrites: 0;
  readonly notificationWrites: 0;
  readonly notificationDuplicates: 0;
  readonly checkpointWrites: 0;
  readonly checkpointDuplicates: 0;
  readonly replacementMutations: 0;
  readonly revocations: 0;
  readonly deletionOperations: 0;
  readonly auditFanOut: 0;
  readonly userVisibleSideEffects: 0;
}

export const zeroRecoverySideEffects = (): RecoverySideEffectReport => ({
  productionWrites: 0,
  externalProviderOperations: 0,
  providerOperations: 0,
  studentCommandExecutions: 0,
  commandExecutions: 0,
  scoringCalls: 0,
  gradingCalls: 0,
  completionWrites: 0,
  notificationWrites: 0,
  notificationDuplicates: 0,
  checkpointWrites: 0,
  checkpointDuplicates: 0,
  replacementMutations: 0,
  revocations: 0,
  deletionOperations: 0,
  auditFanOut: 0,
  userVisibleSideEffects: 0,
});

export interface RecoveryLedgerCompletionReport {
  /** The only completion write authorized by this reconciliation seam. */
  readonly kind: 'recovery-ledger-only';
  readonly state: 'not-completed' | 'completed';
  /** #126 activation is not part of #125 and remains absent. */
  readonly activation: 'absent';
  readonly delivery: 'held-unavailable';
  readonly finalReconciliation: 'pending';
  readonly approvalRequired: true;
}

export interface RecoveryReconciliationReport {
  readonly kind: 'book-recovery-reconciliation-report';
  readonly schemaVersion: typeof RECOVERY_RECONCILIATION_REPORT_SCHEMA_VERSION;
  readonly operationId: string;
  readonly inventoryFingerprint: string;
  readonly phaseOrder: readonly RecoveryReconciliationPhase[];
  readonly phases: readonly RecoveryReconciliationPhaseReport[];
  readonly stableHash: string;
  readonly sideEffects: RecoverySideEffectReport;
  readonly completion: RecoveryLedgerCompletionReport;
}

export class RecoveryReconciliationReportError extends Error {
  readonly name = 'RecoveryReconciliationReportError';

  constructor(
    readonly code: 'non-deterministic' | 'side-effect-authorized' | 'invalid-report' | 'identity-mismatch',
    message: string,
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

/** Canonical JSON used for hashes and comparisons; object enumeration is ignored. */
export const stableRecoverySerialize = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RecoveryReconciliationReportError('invalid-report', 'Non-finite values cannot enter a recovery hash.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableRecoverySerialize).join(',')}]`;
  if (!isPlainRecord(value)) throw new RecoveryReconciliationReportError('invalid-report', 'Recovery hashes require deterministic JSON values.');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableRecoverySerialize(value[key])}`).join(',')}}`;
};

const fnv1a64 = (value: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
};

export const stableRecoveryHash = (value: unknown): string => `fnv1a64:${fnv1a64(stableRecoverySerialize(value))}`;

export const emptyRecoveryCounts = (): RecoveryReconciliationCounts => ({
  total: 0,
  pending: 0,
  completed: 0,
  invalid: 0,
  unavailable: 0,
  externallyMissing: 0,
  retryable: 0,
  terminal: 0,
});

export const assertZeroRecoverySideEffects = (value: RecoverySideEffectReport): void => {
  const nonZero = Object.entries(value).filter(([, count]) => count !== 0);
  if (nonZero.length > 0) {
    throw new RecoveryReconciliationReportError(
      'side-effect-authorized',
      `Recovery reconciliation must remain write-free: ${nonZero.map(([key, count]) => `${key}=${String(count)}`).join(', ')}.`,
    );
  }
};

export const assertHeldRecoveryCompletion = (value: RecoveryReconciliationReport): void => {
  assertZeroRecoverySideEffects(value.sideEffects);
  if (value.phaseOrder.join('\u0000') !== RECOVERY_RECONCILIATION_PHASES.join('\u0000')) {
    throw new RecoveryReconciliationReportError('invalid-report', 'Recovery phase order is not the #125 order.');
  }
  if (value.completion.kind !== 'recovery-ledger-only'
    || value.completion.activation !== 'absent'
    || value.completion.delivery !== 'held-unavailable'
    || value.completion.finalReconciliation !== 'pending'
    || value.completion.approvalRequired !== true) {
    throw new RecoveryReconciliationReportError('invalid-report', 'Recovery completion must remain held and approval-gated.');
  }
};

export interface RecoveryReconciliationPhaseContext {
  readonly operationId: string;
  readonly phase: RecoveryReconciliationPhase;
  readonly pendingRecordKeys: readonly string[];
  readonly suppression: RecoverySuppressionContext;
}
