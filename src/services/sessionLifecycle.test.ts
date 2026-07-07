import { describe, expect, it } from 'vitest';
import {
  getEffectiveSessionStatus,
  isSessionActiveAt,
  isSessionTimeExpired,
} from './sessionLifecycle';

describe('sessionLifecycle', () => {
  it('derives expired from active status and expiresAt without mutating storage state', () => {
    const session = { status: 'waiting', expiresAt: 1_000 };

    expect(isSessionTimeExpired(session, 1_000)).toBe(true);
    expect(getEffectiveSessionStatus(session, 1_000)).toBe('expired');
    expect(session.status).toBe('waiting');
  });

  it('preserves terminal status and leaves no-expiry legacy status readable', () => {
    expect(getEffectiveSessionStatus({ status: 'completed', expiresAt: 500 }, 1_000))
      .toBe('completed');
    expect(getEffectiveSessionStatus({ status: 'in-progress' }, 1_000)).toBe('in-progress');
    expect(isSessionActiveAt({ status: 'in-progress' }, 1_000)).toBe(false);
  });

  it('rejects inactive sessions before considering expiration', () => {
    expect(isSessionActiveAt({ status: 'paused', expiresAt: 2_000 }, 1_000)).toBe(false);
  });
});
