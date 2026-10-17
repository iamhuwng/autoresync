import { describe, expect, it } from 'vitest';
import {
  createPublicBookReferenceForkRollbackState,
  PublicBookReferenceForkRolloutGate,
} from './publicBookReferenceFork.rolloutGate';

describe('public Book reference/fork rollout and rollback gate', () => {
  it('is deny-by-default and keeps rollback deny-only', () => {
    const disabled = new PublicBookReferenceForkRolloutGate();
    expect(() => disabled.assertReadAllowed()).toThrow('public_book_reference_fork_rollout_disabled');
    expect(() => disabled.assertMutationAllowed()).toThrow('public_book_reference_fork_rollout_disabled');

    const rollback = new PublicBookReferenceForkRolloutGate({ enabled: true, rollback: true });
    expect(() => rollback.assertReadAllowed()).not.toThrow();
    expect(() => rollback.assertExistingReferenceResolutionAllowed()).not.toThrow();
    expect(() => rollback.assertMutationAllowed()).toThrow('public_book_reference_fork_rollback');
  });

  it('creates a scoped rollback state without deleting immutable history', () => {
    expect(createPublicBookReferenceForkRollbackState({
      reason: 'Pause public reference/fork writes',
      changedAt: '2026-08-05T00:00:00.000Z',
      operationId: 'rollback-1',
    })).toEqual({
      schemaVersion: 1,
      enabled: true,
      denyNewWrites: true,
      denyNewForks: true,
      reason: 'Pause public reference/fork writes',
      changedAt: '2026-08-05T00:00:00.000Z',
      operationId: 'rollback-1',
    });
  });
});
