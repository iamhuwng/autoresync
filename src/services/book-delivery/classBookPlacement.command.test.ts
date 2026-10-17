import { describe, expect, it } from 'vitest';
import { createClassBookPlacementCommand } from '../../../cloudflare/src/upload-worker/class-book-placement/command';
import type { ClassBookCommandReceipt } from '../../../cloudflare/src/upload-worker/class-book-placement/command-types';
import type { ClassBookSourcePlacement, ClassBookCopyIdentity, ClassBookPlacement, ClassBookLockAuthority } from './classBookPlacement.types';

const source: ClassBookSourcePlacement = {
  courseId: 'course-1', moduleId: 'module-1', courseMaterialId: 'material-1', ownerId: 'teacher-1', placementRevision: 1, status: 'active',
  pins: { bookId: 'book-1', publicationId: 'publication-1', publicationRevision: 1,
    unitStableKey: 'unit-1', unitVersionId: 'unit-v1', manifestVersionId: 'manifest-1', sourceVersionId: 'source-1', bindingRevision: '1' },
  selection: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1', 'placement-2'] },
  activities: [{ placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-v1', unitStableKey: 'unit-1',
    unitVersionId: 'unit-v1', sourceVersionId: 'source-1', pageGroupId: 'group-1', physicalPageNumber: 1, order: 0, title: 'Activity' },
  { placementId: 'placement-2', activityId: 'activity-2', activityVersionId: 'activity-v2', unitStableKey: 'unit-2',
    unitVersionId: 'unit-v2', sourceVersionId: 'source-2', pageGroupId: 'group-2', physicalPageNumber: 3, order: 1, title: 'Second source' }],
};

describe('trusted Class commands', () => {
  it('rejects malformed revision commands before loading authority or source state', async () => {
    const readValue = async () => ({ createdBy: 'teacher-1', status: 'active' });
    const command = createClassBookPlacementCommand({
      readValue,
      readCopy: async () => null,
      readCurrent: async () => null,
      readLock: async () => null,
      readReceipt: async () => null,
      loadSource: async () => { throw new Error('source_should_not_load'); },
      commit: async () => { throw new Error('commit_should_not_run'); },
    });
    await expect(command('lock', 'teacher-1', { operationId: 'bad-lock', classId: 'class-1',
      classPlacementId: 'placement-1', state: 'locked', expectedRevision: '0' })).rejects
      .toThrow('class_book_lock_revision_invalid');
    await expect(command('sync', 'teacher-1', { operationId: 'bad-sync', classId: 'class-1', copyId: 'copy-1',
      classPlacementId: 'placement-1', classCourseMaterialId: 'class-material-1', expectedPlacementRevision: -1 })).rejects
      .toThrow('class_book_placement_revision_invalid');
    await expect(command('lock', 'teacher-1', { operationId: 'bad-state', classId: 'class-1',
      classPlacementId: 'placement-1', state: 'paused', expectedRevision: 0 })).rejects
      .toThrow('class_book_lock_state_invalid');
  });

  it('retains original receipts across later sync, rejects changed inputs, and fences stale sync and locks', async () => {
    let copy: ClassBookCopyIdentity | null = null;
    let current: ClassBookPlacement | null = null;
    let lock: ClassBookLockAuthority | null = null;
    let sourceRevision = 1;
    const receipts = new Map<string, ClassBookCommandReceipt>();
    const command = createClassBookPlacementCommand({
      readValue: async (path) => path.startsWith('classes/') ? { createdBy: 'teacher-1', status: 'active' } : {},
      readCopy: async () => copy, readCurrent: async () => current, readLock: async () => lock,
      readReceipt: async (id) => receipts.get(id) ?? null,
      loadSource: async () => ({ ...source, placementRevision: sourceRevision }),
      now: () => '2026-10-04T00:00:00.000Z',
      commit: async (receipt, claims) => {
        expect(claims.classBookOperation).toBe(receipt.kind);
        expect(claims.nextRevision).toBe(claims.expectedRevision + 1);
        receipts.set(receipt.operationId, receipt);
        if (receipt.kind === 'copy') copy = receipt.outcome as ClassBookCopyIdentity;
        else if (receipt.kind === 'lock') lock = receipt.outcome as ClassBookLockAuthority;
        else current = receipt.outcome as ClassBookPlacement;
      },
    });
    await command('copy', 'teacher-1', { operationId: 'copy-command', classId: 'class-1', copyId: 'copy-1',
      classCourseId: 'class-course-1', sourceCourseId: 'course-1', sourceCourseMaterialId: 'material-1' });
    const place = { operationId: 'place-command', classId: 'class-1', copyId: 'copy-1',
      classPlacementId: 'class-placement-1', classCourseMaterialId: 'class-material-1', title: 'Book' };
    const original = await command('place', 'teacher-1', place);
    sourceRevision = 2;
    const sync = { operationId: 'sync-command', classId: 'class-1', copyId: 'copy-1',
      classPlacementId: 'class-placement-1', classCourseMaterialId: 'class-material-1', expectedPlacementRevision: 1 };
    expect(await command('sync', 'teacher-1', sync)).toMatchObject({ placementRevision: 2, sourcePlacementRevision: 2 });
    expect(await command('place', 'teacher-1', place)).toEqual(original);
    expect(current).toMatchObject({ placementRevision: 2 });
    await expect(command('place', 'teacher-1', { ...place, title: 'Changed' })).rejects.toThrow('operation_conflict');
    await expect(command('sync', 'teacher-1', { ...sync, operationId: 'stale-command' })).rejects.toThrow('placement_stale');
    await expect(command('lock', 'teacher-2', { operationId: 'foreign-command', classId: 'class-1',
      classPlacementId: 'class-placement-1', state: 'locked', expectedRevision: 0 })).rejects.toThrow('owner_denied');
    await command('lock', 'teacher-1', { operationId: 'lock-command', classId: 'class-1',
      classPlacementId: 'class-placement-1', state: 'locked', expectedRevision: 0 });
    await expect(command('sync', 'teacher-1', { ...sync, operationId: 'locked-command', expectedPlacementRevision: 2 })).rejects.toThrow('class_book_locked');
  });
});
