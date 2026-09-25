import { describe, expect, it, vi } from 'vitest';
import { afterSuccess, afterTerminalFailure, notificationIssuePath, RetryFamilyGate, type RetryFamilyState } from '../src/upload-worker/notifications/retry-family-gate.ts';
import type { FirebaseRtdbRestClient } from '../src/upload-worker/listening-authoring/rtdb.ts';

describe('notification retry family gate', () => {
  it('suppresses after three distinct consecutive terminal failures and keeps fresh success evidence', () => {
    let state: RetryFamilyState = { consecutiveFailures: 0, retrySuppressed: false };
    state = afterTerminalFailure(state, 'action-a');
    state = afterTerminalFailure(state, 'action-a');
    expect(state.consecutiveFailures).toBe(1);
    state = afterTerminalFailure(state, 'action-b');
    state = afterTerminalFailure(state, 'action-a');
    expect(state.consecutiveFailures).toBe(2);
    state = afterTerminalFailure(state, 'action-c');
    expect(state.retrySuppressed).toBe(true);
    state = afterSuccess(state, 123);
    expect(state).toMatchObject({ retrySuppressed: true, consecutiveFailures: 3, lastSuccessAt: 123 });
  });

  it('uses the saved event time for one issue path across midnight', () => {
    const occurredAt = Date.parse('2026-09-25T23:59:59Z');
    expect(notificationIssuePath('action-a', occurredAt)).toBe('reports/errors/2026-09-25/action-a');
    expect(notificationIssuePath('action-a', occurredAt)).not.toContain('2026-09-26');
  });

  it('resets the consecutive pattern on success before suppression', () => {
    const state = afterSuccess(afterTerminalFailure({ consecutiveFailures: 0, retrySuppressed: false }, 'a'), 456);
    expect(afterTerminalFailure(state, 'b')).toMatchObject({ consecutiveFailures: 1, retrySuppressed: false });
  });

  it('adds fresh success time to the existing admin issue without clearing suppression', async () => {
    const issuePath = 'reports/errors/2026-09-26/action-a';
    const rows = new Map<string, unknown>([
      ['notification_retry_families/class-membership', {
        consecutiveFailures: 3, retrySuppressed: true, failedActionIds: ['action-a'], lastIssuePath: issuePath,
      }],
      [issuePath, { id: 'action-a', timestamp: 100, contextData: { actionId: 'action-a' } }],
    ]);
    const client = {
      readWithEtag: vi.fn(async (path: string) => ({ data: rows.get(path) ?? null, etag: '"0"' })),
      writeIfMatch: vi.fn(async (path: string, value: unknown) => { rows.set(path, value); return true; }),
    } as unknown as FirebaseRtdbRestClient;
    await new RetryFamilyGate(client).recordSuccess('class-membership', 456);
    expect(rows.get(issuePath)).toMatchObject({ timestamp: 100,
      contextData: { actionId: 'action-a', lastSuccessAt: 456 } });
    expect(rows.get('notification_retry_families/class-membership')).toMatchObject({
      retrySuppressed: true, lastSuccessAt: 456,
    });
  });
});
