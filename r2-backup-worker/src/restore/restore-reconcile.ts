import type { RecoveryOperationRecord } from '../types';
import {
  executeRecovery,
  type RecoveryPhaseRunnerInput,
} from './restore-execute';
import {
  RecoveryOperationLedger,
  buildRecoveryOperationId,
} from './recovery-operation-ledger';
import type {
  RecoveryEnvelopeIntegrityVerifier,
  RecoveryRuntimeIdentity,
} from './recovery-envelope';
import { assertRecoveryEnvelope } from './recovery-envelope';
import {
  assertHeldRecoveryCompletion,
  RECOVERY_RECONCILIATION_PHASES,
  RecoveryReconciliationReportError,
  stableRecoveryHash,
  type RecoveryLedgerCompletionReport,
  type RecoveryReconciliationPhase,
  type RecoveryReconciliationPhaseContext,
  type RecoveryReconciliationReport,
} from './recovery-report';
import {
  buildRecoveryRebuildPlan,
  recoveryRebuildSignature,
  type RecoveryRebuildInput,
  type RecoveryRebuildPlan,
} from './restore-rebuild';

export interface RecoveryReconciliationResult {
  readonly firstPass: RecoveryRebuildPlan;
  readonly secondPass: RecoveryRebuildPlan;
  readonly report: RecoveryReconciliationReport;
}

export class RecoveryReconciliationError extends Error {
  readonly name = 'RecoveryReconciliationError';

  constructor(
    readonly code: 'pass-mismatch' | 'unsafe-records' | 'pending-records' | 'ledger-not-held',
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

const compareStrings = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

const permutedInventory = (plan: RecoveryRebuildPlan): unknown => ({
  ...plan.inventory,
  roots: [...plan.inventory.roots].reverse(),
});

const assertPlanSafe = (plan: RecoveryRebuildPlan): void => {
  const unsafe = plan.phases.find((phase) => (
    phase.counts.invalid > 0
    || phase.counts.unavailable > 0
    || phase.counts.retryable > 0
    || phase.counts.terminal > 0
  ));
  if (unsafe) {
    throw new RecoveryReconciliationError(
      'unsafe-records',
      `Recovery phase ${unsafe.phase} contains invalid, unavailable, retryable, or terminal records; the ledger cannot complete.`,
    );
  }
};

const assertExecutionRecordsComplete = (plan: RecoveryRebuildPlan): void => {
  const pending = plan.records
    .filter((record) => record.phase !== 'reconciliation-ledger-completion' && record.status === 'pending')
    .map((record) => record.key)
    .sort(compareStrings);
  if (pending.length > 0) {
    throw new RecoveryReconciliationError(
      'pending-records',
      `Recovery cannot complete the ledger while non-ledger records remain pending: ${pending.join(', ')}. Supply durable completion evidence for every record and retry.`,
    );
  }
};

const completion = (state: RecoveryLedgerCompletionReport['state']): RecoveryLedgerCompletionReport => ({
  kind: 'recovery-ledger-only',
  state,
  activation: 'absent',
  delivery: 'held-unavailable',
  finalReconciliation: 'pending',
  approvalRequired: true,
});

const reportFor = (
  plan: RecoveryRebuildPlan,
  state: RecoveryLedgerCompletionReport['state'],
): RecoveryReconciliationReport => {
  const reportWithoutHash = {
    kind: 'book-recovery-reconciliation-report' as const,
    schemaVersion: 'prd0062-49e-v1' as const,
    operationId: plan.recoveryOperationId,
    inventoryFingerprint: plan.inventoryFingerprint,
    phaseOrder: RECOVERY_RECONCILIATION_PHASES,
    phases: plan.phases,
    sideEffects: plan.sideEffects,
    completion: completion(state),
  };
  return Object.freeze({
    ...reportWithoutHash,
    stableHash: stableRecoveryHash(reportWithoutHash),
  });
};

const phasePendingKeys = (plan: RecoveryRebuildPlan, phase: RecoveryReconciliationPhase): readonly string[] => (
  Object.freeze(plan.records
    .filter((record) => record.phase === phase && record.status === 'pending')
    .map((record) => record.key)
    .sort(compareStrings))
);

const invokeSubphase = async (
  input: {
    readonly operationId: string;
    readonly plan: RecoveryRebuildPlan;
    readonly phase: RecoveryReconciliationPhase;
    readonly suppression: RecoveryPhaseRunnerInput['suppression'];
    readonly onPhase?: (context: RecoveryReconciliationPhaseContext) => void | Promise<void>;
  },
): Promise<void> => {
  if (!RECOVERY_RECONCILIATION_PHASES.includes(input.phase)) {
    throw new RecoveryReconciliationReportError('invalid-report', `Unknown recovery phase ${input.phase}.`);
  }
  await input.onPhase?.({
    operationId: input.operationId,
    phase: input.phase,
    pendingRecordKeys: phasePendingKeys(input.plan, input.phase),
    suppression: input.suppression,
  });
};

/** Compare pass evidence before any recovery-ledger completion transition. */
export const compareRecoveryRebuildPasses = (
  firstPass: RecoveryRebuildPlan,
  secondPass: RecoveryRebuildPlan,
): void => {
  if (firstPass.inventoryFingerprint !== secondPass.inventoryFingerprint) {
    throw new RecoveryReconciliationError('pass-mismatch', 'Independent recovery passes produced different inventory identities.');
  }
  if (stableRecoveryHash(recoveryRebuildSignature(firstPass)) !== stableRecoveryHash(recoveryRebuildSignature(secondPass))) {
    throw new RecoveryReconciliationError(
      'pass-mismatch',
      'Independent recovery passes produced different phase hashes, counts, or side-effect ledgers.',
    );
  }
};

/**
 * Run two independent, write-free rebuilds over the same validated snapshot.
 * The second pass intentionally reverses transport root enumeration; the
 * normalizer must restore canonical order or reconciliation fails closed.
 */
export const reconcileRecoveryInventory = (input: RecoveryRebuildInput): RecoveryReconciliationResult => {
  const firstPass = buildRecoveryRebuildPlan(input);
  assertPlanSafe(firstPass);
  const secondPass = buildRecoveryRebuildPlan({
    ...input,
    inventory: permutedInventory(firstPass),
  });
  assertPlanSafe(secondPass);
  compareRecoveryRebuildPasses(firstPass, secondPass);
  const report = reportFor(firstPass, 'not-completed');
  assertHeldRecoveryCompletion(report);
  return Object.freeze({ firstPass, secondPass, report });
};

export const reconcileRecovery = reconcileRecoveryInventory;

export interface ExecuteRecoveryReconciliationInput extends RecoveryRebuildInput {
  readonly envelope: unknown;
  readonly runtime: RecoveryRuntimeIdentity;
  readonly verifier: RecoveryEnvelopeIntegrityVerifier;
  readonly ledger: RecoveryOperationLedger;
  readonly now?: string;
  /** Test/host seam for observing the exact logical phase order. */
  readonly onPhase?: (context: RecoveryReconciliationPhaseContext) => void | Promise<void>;
}

export interface ExecuteRecoveryReconciliationResult extends RecoveryReconciliationResult {
  readonly operation: RecoveryOperationRecord;
  readonly report: RecoveryReconciliationReport;
}

/**
 * Execute only recovery-ledger transitions after the two-pass gate succeeds.
 * No product adapter is called here; #126 activation and all effect families
 * remain held and unavailable.
 */
export const executeRecoveryReconciliation = async (
  input: ExecuteRecoveryReconciliationInput,
): Promise<ExecuteRecoveryReconciliationResult> => {
  const envelope = await assertRecoveryEnvelope(input.envelope, {
    expectedPhase: 'execute',
    runtime: input.runtime,
    verifier: input.verifier,
    now: input.now,
  });
  const expectedOperationId = buildRecoveryOperationId({
    snapshot: envelope.snapshot,
    idempotencyKey: envelope.idempotencyKey,
  });
  if (input.recoveryOperationId !== expectedOperationId) {
    throw new RecoveryReconciliationReportError(
      'identity-mismatch',
      'Recovery rebuild operation identity does not match the envelope-bound ledger operation.',
    );
  }
  const reconciled = reconcileRecoveryInventory(input);
  assertExecutionRecordsComplete(reconciled.firstPass);
  const runners: Partial<Record<RecoveryPhaseRunnerInput['phase'], (runnerInput: RecoveryPhaseRunnerInput) => Promise<void>>> = {
    restoring_canonical_authority: async (runnerInput) => {
      await invokeSubphase({
        operationId: runnerInput.operationId,
        plan: reconciled.firstPass,
        phase: 'canonical-authority',
        suppression: runnerInput.suppression,
        onPhase: input.onPhase,
      });
    },
    rebuilding: async (runnerInput) => {
      await invokeSubphase({
        operationId: runnerInput.operationId,
        plan: reconciled.firstPass,
        phase: 'source-delivery',
        suppression: runnerInput.suppression,
        onPhase: input.onPhase,
      });
      await invokeSubphase({
        operationId: runnerInput.operationId,
        plan: reconciled.firstPass,
        phase: 'runtime-results-completion',
        suppression: runnerInput.suppression,
        onPhase: input.onPhase,
      });
      await invokeSubphase({
        operationId: runnerInput.operationId,
        plan: reconciled.firstPass,
        phase: 'updates-checkpoints-notifications-replacement-audit',
        suppression: runnerInput.suppression,
        onPhase: input.onPhase,
      });
    },
    reconciling: async (runnerInput) => {
      await invokeSubphase({
        operationId: runnerInput.operationId,
        plan: reconciled.firstPass,
        phase: 'reconciliation-ledger-completion',
        suppression: runnerInput.suppression,
        onPhase: input.onPhase,
      });
    },
  };
  const operation = await executeRecovery({
    envelope: input.envelope,
    runtime: input.runtime,
    verifier: input.verifier,
    ledger: input.ledger,
    now: input.now,
    runners,
  });
  const report = reportFor(reconciled.firstPass, operation.state === 'completed' ? 'completed' : 'not-completed');
  if (operation.state === 'completed'
    && (operation.suppression.finalReconciliation !== 'pending' || operation.suppression.releasedFamilies.length !== 0)) {
    throw new RecoveryReconciliationError('ledger-not-held', 'Completed recovery unexpectedly released an effect family.');
  }
  assertHeldRecoveryCompletion(report);
  return Object.freeze({ ...reconciled, operation, report });
};

export const executeDeterministicRecovery = executeRecoveryReconciliation;
