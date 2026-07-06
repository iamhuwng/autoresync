import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, refMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  refMock: vi.fn((_database: unknown, path: string) => ({ path })),
}));

vi.mock('firebase/database', () => ({
  get: getMock,
  ref: refMock,
}));
vi.mock('./firebase', () => ({ database: {} }));

import {
  resolveSessionMutationFailure,
  SESSION_EXPIRED_MESSAGE,
} from './sessionActionError';

const snap = (value: unknown) => ({ val: () => value });

describe('resolveSessionMutationFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps an authoritative permission rejection after expiry to the shared message', async () => {
    getMock
      .mockResolvedValueOnce(snap({ status: 'in-progress', expiresAt: 1_000 }))
      .mockResolvedValueOnce(snap(250));

    await expect(resolveSessionMutationFailure(
      { code: 'PERMISSION_DENIED' },
      'ABC123',
      800,
    )).resolves.toEqual({
      code: 'session-expired',
      message: SESSION_EXPIRED_MESSAGE,
    });
  });

  it('uses the safe expiry message when server offset is unavailable', async () => {
    getMock
      .mockResolvedValueOnce(snap({ status: 'waiting', expiresAt: 2_000 }))
      .mockResolvedValueOnce(snap(null));

    const result = await resolveSessionMutationFailure(
      new Error('permission_denied'),
      'ABC123',
      1_000,
    );

    expect(result?.message).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('maps active legacy sessions without numeric expiresAt to the repair-needed expiry message', async () => {
    getMock
      .mockResolvedValueOnce(snap({ status: 'waiting' }))
      .mockResolvedValueOnce(snap(0));

    const result = await resolveSessionMutationFailure(
      { message: 'Permission denied' },
      'ABC123',
      1_000,
    );

    expect(result).toEqual({
      code: 'session-expired',
      message: SESSION_EXPIRED_MESSAGE,
    });
  });

  it('does not relabel unrelated failures', async () => {
    await expect(resolveSessionMutationFailure(
      new Error('network unavailable'),
      'ABC123',
    )).resolves.toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });
});
