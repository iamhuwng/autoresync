import { describe, expect, it, vi } from 'vitest';

import {
    isRecoverySideEffectSuppressed,
    withRecoverySideEffectGuard,
} from './restoreGuard';

describe('restore guard recovery suppression', () => {
    it('fails closed for unknown or missing recovery family/state and only allows explicit release', () => {
        expect(isRecoverySideEffectSuppressed('future-family', undefined)).toEqual({ suppressed: true, code: 'unknown-family' });
        expect(isRecoverySideEffectSuppressed('notification', undefined)).toEqual({ suppressed: true, code: 'missing-operation-id' });
        expect(isRecoverySideEffectSuppressed('notification', {
            recoveryOperationId: 'rec-1',
            operationId: 'rec-1',
            operationState: 'reconciling',
            finalReconciliation: 'pending',
            releasedFamilies: [],
        })).toEqual({ suppressed: true, code: 'operation-not-completed' });
        expect(isRecoverySideEffectSuppressed('notification', {
            recoveryOperationId: 'rec-1',
            operationId: 'rec-1',
            operationState: 'completed',
            finalReconciliation: 'approved',
            releasedFamilies: ['notification'],
        })).toEqual({ suppressed: false, code: 'released' });
    });

    it('does not call an automatic side effect while recovery context is incomplete', async () => {
        const sideEffect = vi.fn(async () => 'sent');
        const guarded = withRecoverySideEffectGuard('notification', 'suppressed', {
            recoveryOperationId: 'rec-1',
            operationId: 'rec-1',
            operationState: 'completed',
            finalReconciliation: 'pending',
            releasedFamilies: [],
        })(sideEffect);
        await expect(guarded()).resolves.toBe('suppressed');
        expect(sideEffect).not.toHaveBeenCalled();
    });
});
