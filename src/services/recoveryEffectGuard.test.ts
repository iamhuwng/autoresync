import { describe, expect, it } from 'vitest';
import {
  isRecoveryEffectSuppressed,
  withRecoveryEffectGuard,
} from './recoveryEffectGuard';

const heldContext = {
  recoveryOperationId: 'recovery-124',
  operationId: 'recovery-124',
  operationState: 'running',
  finalReconciliation: 'pending' as const,
};

describe('recovery effect guard', () => {
  it('fails closed for missing, mismatched, incomplete, and unreleased recovery state', () => {
    expect(isRecoveryEffectSuppressed('notification', undefined)).toEqual({
      suppressed: true,
      code: 'missing-operation-id',
    });
    expect(isRecoveryEffectSuppressed('notification', heldContext).code).toBe('operation-not-completed');
    expect(isRecoveryEffectSuppressed('notification', {
      ...heldContext,
      operationState: 'completed',
      finalReconciliation: 'approved',
    }).code).toBe('family-not-released');
    expect(isRecoveryEffectSuppressed('unknown', heldContext).code).toBe('unknown-family');
  });

  it('releases only an explicitly approved family for the matching operation', () => {
    const released = {
      ...heldContext,
      operationState: 'completed',
      finalReconciliation: 'approved' as const,
      releasedFamilies: ['notification'],
    };
    expect(isRecoveryEffectSuppressed('notification', released)).toEqual({
      suppressed: false,
      code: 'released',
    });
    expect(isRecoveryEffectSuppressed('checkpoint', released).suppressed).toBe(true);
    expect(isRecoveryEffectSuppressed('notification', { ...released, operationId: 'other' }).code)
      .toBe('operation-mismatch');
  });

  it('does not invoke a held producer and invokes an explicitly released family', async () => {
    const producer = withRecoveryEffectGuard('audit-fan-out', 'held', heldContext, async () => 'ran');
    await expect(producer()).resolves.toBe('held');
    const released = withRecoveryEffectGuard('audit-fan-out', 'held', {
      ...heldContext,
      operationState: 'completed',
      finalReconciliation: 'approved',
      releasedFamilies: ['audit-fan-out'],
    }, async () => 'ran');
    await expect(released()).resolves.toBe('ran');
  });
});
