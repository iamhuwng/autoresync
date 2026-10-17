import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SecurityAuthContext } from '../types/security.types';

const { mockPush, mockRef } = vi.hoisted(() => ({
  mockPush: vi.fn().mockResolvedValue({ key: 'mock-log-id' }),
  mockRef: vi.fn().mockReturnValue({}),
}));

vi.mock('firebase/database', () => ({
  ref: mockRef,
  push: mockPush,
  get: vi.fn(),
  query: vi.fn().mockReturnValue({}),
  orderByChild: vi.fn().mockReturnValue({}),
  limitToLast: vi.fn().mockReturnValue({}),
  startAt: vi.fn().mockReturnValue({}),
  endAt: vi.fn().mockReturnValue({}),
  serverTimestamp: vi.fn(() => Date.now()),
}));

vi.mock('./firebase', () => ({ database: {} }));

import { logAuditEvent } from './auditService';

const authContext: SecurityAuthContext = {
  userId: 'teacher-1',
  userRole: 'teacher',
  activeRole: 'teacher',
  roles: ['teacher'],
  isActive: true,
};

describe('Book update recovery audit producer suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fan out held recovery audit events, while normal events still write', async () => {
    logAuditEvent({
      action: 'UPDATE',
      target: 'book',
      targetId: 'book-1',
      recoveryContext: {
        recoveryOperationId: 'recovery-124',
        operationId: 'recovery-124',
        operationState: 'running',
        finalReconciliation: 'pending',
      },
    }, authContext);
    await Promise.resolve();
    expect(mockPush).not.toHaveBeenCalled();

    logAuditEvent({ action: 'UPDATE', target: 'book', targetId: 'book-1' }, authContext);
    await Promise.resolve();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
