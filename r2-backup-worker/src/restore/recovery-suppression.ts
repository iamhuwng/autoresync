import type {
  RecoveryOperationRecord,
  RecoveryOperationState,
  RecoverySuppressionFamily,
} from '../types';
import { RECOVERY_SUPPRESSION_FAMILIES } from './recovery-operation-ledger';

export interface RecoverySuppressionContext {
  readonly recoveryOperationId?: string;
  readonly operation?: RecoveryOperationRecord | null;
}

export interface RecoverySuppressionDecision {
  readonly suppressed: boolean;
  readonly code:
    | 'missing-operation-id'
    | 'missing-operation-state'
    | 'unknown-family'
    | 'operation-mismatch'
    | 'operation-not-completed'
    | 'reconciliation-pending'
    | 'family-not-released'
    | 'released';
}

export class RecoverySuppressionError extends Error {
  readonly name = 'RecoverySuppressionError';

  constructor(readonly code: RecoverySuppressionDecision['code'], message: string) {
    super(`${code}: ${message}`);
  }
}

/** Every family is held until #125 has explicitly approved final reconciliation. */
export const RECOVERY_FAMILY_RELEASE_PHASE: Readonly<Record<RecoverySuppressionFamily, 'reconciling'>> = Object.freeze({
  'source-cleanup-provider-delete': 'reconciling',
  'submission-result-scoring': 'reconciling',
  completion: 'reconciling',
  checkpoint: 'reconciling',
  notification: 'reconciling',
  'update-replacement-revocation': 'reconciling',
  'audit-fan-out': 'reconciling',
});

const terminal = (state: RecoveryOperationState): boolean => state === 'completed' || state === 'failed_terminal';

export const isRecoveryEffectSuppressed = (
  family: unknown,
  context: RecoverySuppressionContext,
): RecoverySuppressionDecision => {
  if (typeof family !== 'string' || !RECOVERY_SUPPRESSION_FAMILIES.includes(family as RecoverySuppressionFamily)) return { suppressed: true, code: 'unknown-family' };
  if (!context.recoveryOperationId) return { suppressed: true, code: 'missing-operation-id' };
  if (!context.operation) return { suppressed: true, code: 'missing-operation-state' };
  if (context.operation.operationId !== context.recoveryOperationId) return { suppressed: true, code: 'operation-mismatch' };
  if (terminal(context.operation.state) !== true || context.operation.state !== 'completed') return { suppressed: true, code: 'operation-not-completed' };
  if (context.operation.suppression.finalReconciliation !== 'approved') return { suppressed: true, code: 'reconciliation-pending' };
  if (!context.operation.suppression.releasedFamilies.includes(family as RecoverySuppressionFamily)) return { suppressed: true, code: 'family-not-released' };
  return { suppressed: false, code: 'released' };
};

export const assertRecoveryEffectAllowed = (
  family: unknown,
  context: RecoverySuppressionContext,
): void => {
  const decision = isRecoveryEffectSuppressed(family, context);
  if (decision.suppressed) throw new RecoverySuppressionError(decision.code, `Recovery side effect ${String(family)} remains suppressed.`);
};

/**
 * Side-effect adapters use this gate at their irreversible boundary. The
 * missing-context default is intentional: ordinary automatic fan-out cannot
 * infer that a recovery operation is safe.
 */
export const withRecoverySuppression = <TReturn, TArgs extends unknown[]>(
  family: RecoverySuppressionFamily,
  safeReturn: TReturn,
  context: RecoverySuppressionContext | (() => RecoverySuppressionContext | Promise<RecoverySuppressionContext>),
  fn: (...args: TArgs) => Promise<TReturn>,
): ((...args: TArgs) => Promise<TReturn>) => async (...args: TArgs): Promise<TReturn> => {
  const resolved = typeof context === 'function' ? await context() : context;
  if (isRecoveryEffectSuppressed(family, resolved).suppressed) return safeReturn;
  return fn(...args);
};

export const shouldSuppressRecoveryEffect = isRecoveryEffectSuppressed;
