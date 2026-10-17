/**
 * Pure recovery side-effect gate shared by browser/domain and Worker code.
 *
 * This module deliberately has no Firebase or Cloudflare dependency. A
 * producer may supply recovery context when it is invoked by an explicit
 * recovery flow; an absent context preserves ordinary behavior.
 */

export const RECOVERY_EFFECT_FAMILIES = Object.freeze([
  'checkpoint',
  'notification',
  'update-replacement-revocation',
  'audit-fan-out',
] as const);

export type RecoveryEffectFamily = typeof RECOVERY_EFFECT_FAMILIES[number];

export interface RecoveryEffectContext {
  readonly recoveryOperationId?: string;
  readonly operationId?: string;
  readonly operationState?: string;
  readonly finalReconciliation?: 'pending' | 'approved';
  readonly releasedFamilies?: readonly string[];
}

export type RecoveryEffectDecisionCode =
  | 'missing-operation-id'
  | 'missing-operation-state'
  | 'unknown-family'
  | 'operation-mismatch'
  | 'operation-not-completed'
  | 'reconciliation-pending'
  | 'family-not-released'
  | 'released';

export interface RecoveryEffectDecision {
  readonly suppressed: boolean;
  readonly code: RecoveryEffectDecisionCode;
}

/** Recovery is fail-closed until #125 reconciliation explicitly releases a family. */
export const isRecoveryEffectSuppressed = (
  family: unknown,
  context: RecoveryEffectContext | null | undefined,
): RecoveryEffectDecision => {
  if (typeof family !== 'string' || !RECOVERY_EFFECT_FAMILIES.includes(family as RecoveryEffectFamily)) {
    return { suppressed: true, code: 'unknown-family' };
  }
  if (!context?.recoveryOperationId) return { suppressed: true, code: 'missing-operation-id' };
  if (!context.operationId || !context.operationState) return { suppressed: true, code: 'missing-operation-state' };
  if (context.recoveryOperationId !== context.operationId) return { suppressed: true, code: 'operation-mismatch' };
  if (context.operationState !== 'completed') return { suppressed: true, code: 'operation-not-completed' };
  if (context.finalReconciliation !== 'approved') return { suppressed: true, code: 'reconciliation-pending' };
  if (!context.releasedFamilies?.includes(family)) return { suppressed: true, code: 'family-not-released' };
  return { suppressed: false, code: 'released' };
};

export const withRecoveryEffectGuard = <TReturn, TArgs extends unknown[]>(
  family: RecoveryEffectFamily,
  safeReturn: TReturn,
  context: RecoveryEffectContext | null | undefined | (() => RecoveryEffectContext | null | undefined | Promise<RecoveryEffectContext | null | undefined>),
  fn: (...args: TArgs) => Promise<TReturn>,
): ((...args: TArgs) => Promise<TReturn>) => async (...args: TArgs): Promise<TReturn> => {
  const resolved = typeof context === 'function' ? await context() : context;
  if (isRecoveryEffectSuppressed(family, resolved).suppressed) return safeReturn;
  return fn(...args);
};
