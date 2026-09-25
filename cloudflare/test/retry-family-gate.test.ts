import { describe, expect, it } from 'vitest';
import { afterSuccess, afterTerminalFailure, type RetryFamilyState } from '../src/upload-worker/notifications/retry-family-gate.ts';

describe('notification retry family gate', () => {
  it('suppresses after three distinct consecutive terminal failures and keeps fresh success evidence', () => {
    let state: RetryFamilyState = { consecutiveFailures: 0, retrySuppressed: false };
    state = afterTerminalFailure(state, 'action-a');
    state = afterTerminalFailure(state, 'action-a');
    expect(state.consecutiveFailures).toBe(1);
    state = afterTerminalFailure(state, 'action-b');
    state = afterTerminalFailure(state, 'action-c');
    expect(state.retrySuppressed).toBe(true);
    state = afterSuccess(state, 123);
    expect(state).toMatchObject({ retrySuppressed: true, consecutiveFailures: 3, lastSuccessAt: 123 });
  });

  it('resets the consecutive pattern on success before suppression', () => {
    const state = afterSuccess(afterTerminalFailure({ consecutiveFailures: 0, retrySuppressed: false }, 'a'), 456);
    expect(afterTerminalFailure(state, 'b')).toMatchObject({ consecutiveFailures: 1, retrySuppressed: false });
  });
});
