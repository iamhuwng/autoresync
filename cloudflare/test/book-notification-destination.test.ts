import { describe, expect, it } from 'vitest';
import {
  isSafeInternalNotificationPath,
  resolveBookNotificationDestination,
} from '../../src/services/notificationDestinationResolver.ts';

const metadata = {
  schemaVersion: 1 as const,
  kind: 'book' as const,
  contextType: 'book-homework' as const,
  contextId: 'homework-1',
  updateActionId: 'update-1',
  checkpointAvailable: true,
  deadlineClass: 'upcoming' as const,
  actionClass: 'resume' as const,
};

describe('Book notification destination resolver', () => {
  it('allows only the role-scoped internal Book destination', () => {
    expect(resolveBookNotificationDestination({ metadata, role: 'student' })).toEqual({
      status: 'allowed', path: '/student/homework/homework-1',
    });
    expect(resolveBookNotificationDestination({ metadata, role: 'teacher' })).toEqual({
      status: 'allowed', path: '/teacher/homework/homework-1',
    });
    expect(resolveBookNotificationDestination({ metadata, role: 'super_admin' })).toEqual({
      status: 'allowed', path: '/teacher/homework/homework-1',
    });
    expect(isSafeInternalNotificationPath('/student/homework/homework-1')).toBe(true);
    expect(isSafeInternalNotificationPath('https://attacker.example')).toBe(false);
  });

  it('fails closed for malformed structured metadata', () => {
    expect(resolveBookNotificationDestination({
      metadata: { ...metadata, contextType: 'external' } as never,
      role: 'student',
    })).toEqual({ status: 'blocked', reason: 'invalid-metadata' });
  });

  it('blocks stale or unauthorized destinations', () => {
    expect(resolveBookNotificationDestination({ metadata, role: 'student', exists: false })).toEqual({
      status: 'blocked', reason: 'stale-destination',
    });
    expect(resolveBookNotificationDestination({ metadata, role: 'student', authorized: false })).toEqual({
      status: 'blocked', reason: 'unauthorized',
    });
  });
});
