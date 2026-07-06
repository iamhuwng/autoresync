import { describe, expect, it } from 'vitest';
import {
  buildOwnerSessionIndexRecord,
  resolveSessionOwnerId,
  shouldReplaceOwnerIndexRecord,
} from './sessionOwnerIndex';

describe('sessionOwnerIndex', () => {
  it('normalizes legacy owner fields with explicit precedence', () => {
    expect(resolveSessionOwnerId({
      createdByUserId: 'new-owner',
      createdBy: 'middle-owner',
      teacherId: 'legacy-owner',
    })).toBe('new-owner');
    expect(resolveSessionOwnerId({ createdBy: 'middle-owner', teacherId: 'legacy-owner' }))
      .toBe('middle-owner');
    expect(resolveSessionOwnerId({ teacherId: 'legacy-owner' })).toBe('legacy-owner');
  });

  it('builds only bounded active discovery records with numeric expiry', () => {
    expect(buildOwnerSessionIndexRecord('ABC123', {
      createdAt: 100,
      createdByUserId: 'teacher-1',
      expiresAt: 2_000,
      mode: 'test',
      status: 'waiting',
      updatedAt: 150,
    }, 1_000)).toEqual({
      sessionCode: 'ABC123',
      ownerId: 'teacher-1',
      expiresAt: 2_000,
      status: 'waiting',
      mode: 'test',
      createdAt: 100,
      sourceUpdatedAt: 150,
    });

    expect(buildOwnerSessionIndexRecord('DONE', {
      createdByUserId: 'teacher-1',
      expiresAt: 2_000,
      status: 'completed',
    }, 1_000)).toBeNull();
    expect(buildOwnerSessionIndexRecord('MALFORMED', {
      createdByUserId: 'teacher-1',
      status: 'waiting',
    }, 1_000)).toBeNull();
  });

  it('never replaces a newer migration/index record with stale data', () => {
    expect(shouldReplaceOwnerIndexRecord(
      { sourceUpdatedAt: 200 },
      { sourceUpdatedAt: 100 },
    )).toBe(false);
    expect(shouldReplaceOwnerIndexRecord(
      { sourceUpdatedAt: 100 },
      { sourceUpdatedAt: 200 },
    )).toBe(true);
  });
});
