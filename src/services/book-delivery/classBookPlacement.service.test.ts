import { describe, expect, it } from 'vitest';
import {
  ClassBookRolloutGate,
} from './classBookRolloutGate';
import { createClassBookRollbackState } from './classBookMigration.service';
import { migrateLegacyClassBookPlacement } from './classBookMigration.service';
import {
  InMemoryClassBookAuthority,
  InMemoryClassBookPlacementRepository,
} from './classBookPlacement.service';
import type {
  ClassBookSourcePlacement,
} from './classBookPlacement.types';
import { classBookContextId } from './classBookPlacement.types';
import { ClassBookPlacementService } from './classBookPlacement.service';
import {
  ClassBookResultsService,
  InMemoryClassBookProgressRepository,
  type ClassBookAttemptScope,
} from './classBookResults.service';

const now = '2026-08-05T00:00:00.000Z';
const later = '2026-08-05T01:00:00.000Z';
const expires = '2026-08-05T02:00:00.000Z';

const source = (overrides: Partial<ClassBookSourcePlacement> = {}): ClassBookSourcePlacement => ({
  courseId: 'course-source-1',
  moduleId: 'module-1',
  courseMaterialId: 'course-material-source-1',
  ownerId: 'teacher-1',
  placementRevision: 1,
  status: 'active',
  pins: {
    bookId: 'book-1',
    publicationId: 'publication-1',
    unitStableKey: 'unit-1',
    unitVersionId: 'unit-version-1',
    manifestVersionId: 'manifest-1',
    sourceVersionId: 'source-version-1',
    bindingRevision: 'binding-1',
  },
  selection: {
    kind: 'placements',
    nodeKeys: [],
    placementIds: ['activity-placement-1', 'activity-placement-2'],
  },
  activities: [
    {
      placementId: 'activity-placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-1',
      unitStableKey: 'unit-1',
      unitVersionId: 'unit-version-1',
      sourceVersionId: 'source-version-1',
      pageGroupId: 'page-group-1',
      physicalPageNumber: 4,
      order: 0,
      title: 'Activity one',
    },
    {
      placementId: 'activity-placement-2',
      activityId: 'activity-2',
      activityVersionId: 'activity-version-2',
      unitStableKey: 'unit-1',
      unitVersionId: 'unit-version-1',
      sourceVersionId: 'source-version-1',
      pageGroupId: 'page-group-2',
      physicalPageNumber: 8,
      order: 1,
      title: 'Activity two',
    },
  ],
  ...overrides,
});

const setup = () => {
  const authority = new InMemoryClassBookAuthority();
  authority.setClass({ classId: 'class-1', ownerId: 'teacher-1', status: 'active', authorityRevision: 1 });
  authority.setMembership({ classId: 'class-1', studentId: 'student-1', status: 'active', membershipRevision: 1 });
  const repository = new InMemoryClassBookPlacementRepository();
  const gate = new ClassBookRolloutGate({ enabled: true });
  const service = new ClassBookPlacementService(repository, authority, gate);
  service.createCopy({
    operationId: 'op-copy-1', actorId: 'teacher-1', now,
    classId: 'class-1', copyId: 'copy-1', classCourseId: 'class-course-1',
    sourceCourseId: 'course-source-1', sourceCourseMaterialId: 'course-material-source-1',
  });
  const placement = service.place({
    operationId: 'op-place-1', actorId: 'teacher-1', now,
    classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
    classCourseMaterialId: 'class-material-1', source: source(), title: 'Class Book one',
  });
  return { authority, repository, service, placement };
};

const issue = (service: ClassBookPlacementService, activityPlacementId = 'activity-placement-1', bindingId = 'binding-1') =>
  service.issueDelivery({
    operationId: `op-issue-${bindingId}`, actorId: 'teacher-1', now,
    classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
    classCourseMaterialId: 'class-material-1', studentId: 'student-1',
    bindingId, entitlementId: `entitlement-${bindingId}`, activityPlacementId,
    bookTitle: 'Book one', unitTitle: 'Unit one', expiresAt: expires,
  });

describe('#103 Class Book placement and delivery chain', () => {
  it('keeps copy, exact placement, source pins, and sync revisions immutable', () => {
    const { service, repository, placement } = setup();
    const binding = issue(service);
    expect(() => issue(service)).toThrowError('class_book_replay_denied');
    expect(placement.copyId).toBe('copy-1');
    expect(placement.courseMaterialId).toBe('class-material-1');
    expect(placement.sourceCourseMaterialId).toBe('course-material-source-1');
    expect(binding.context.contextId).toBe('class-class-1-copy-copy-1-material-class-material-1-placement-class-placement-1');
    const updated = service.sync({
      operationId: 'op-sync-1', actorId: 'teacher-1', now: later,
      classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
      classCourseMaterialId: 'class-material-1', expectedPlacementRevision: 1,
      source: source({
        placementRevision: 2,
        pins: { ...source().pins, bindingRevision: 'binding-2', unitVersionId: 'unit-version-2' },
        activities: source().activities.map((activity) => ({ ...activity, unitVersionId: 'unit-version-2' })),
      }),
    });
    expect(updated.placementRevision).toBe(2);
    expect(repository.readVersion(classBookContextId('class-1', 'copy-1', 'class-material-1'), 1)?.pins.bindingRevision)
      .toBe('binding-1');
    expect(() => service.resolveDelivery({
      studentId: 'student-1', classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
      classCourseMaterialId: 'class-material-1', binding, now: later,
    })).toThrowError('class_book_delivery_pin_mismatch');
  });

  it('denies wrong owner, enrollment, lock, source owner, and bare-material inputs', () => {
    const { authority, service } = setup();
    expect(() => service.createCopy({
      operationId: 'op-copy-wrong-owner', actorId: 'teacher-2', now,
      classId: 'class-1', copyId: 'copy-2', classCourseId: 'class-course-2',
      sourceCourseId: 'course-source-1', sourceCourseMaterialId: 'course-material-source-1',
    })).toThrowError('class_book_owner_denied');
    authority.setMembership({ classId: 'class-1', studentId: 'student-2', status: 'removed', membershipRevision: 2 });
    expect(() => service.issueDelivery({
      operationId: 'op-issue-removed', actorId: 'teacher-1', now,
      classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
      classCourseMaterialId: 'class-material-1', studentId: 'student-2', bindingId: 'binding-removed',
      entitlementId: 'entitlement-removed', activityPlacementId: 'activity-placement-1',
      bookTitle: 'Book one', unitTitle: 'Unit one', expiresAt: expires,
    })).toThrowError('class_book_enrollment_denied');
    service.setLock({
      operationId: 'op-lock-1', actorId: 'teacher-1', now,
      classId: 'class-1', classPlacementId: 'class-placement-1', state: 'locked', expectedRevision: 0,
    });
    expect(() => issue(service, 'activity-placement-2', 'binding-locked')).toThrowError('class_book_locked');
    expect(() => service.sync({
      operationId: 'op-sync-locked', actorId: 'teacher-1', now: later,
      classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
      classCourseMaterialId: 'class-material-1', expectedPlacementRevision: 1, source: source(),
    })).toThrowError('class_book_locked');
    const forged = source({ ownerId: 'teacher-2' });
    expect(() => service.place({
      operationId: 'op-bad-source', actorId: 'teacher-1', now,
      classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-2',
      classCourseMaterialId: 'class-material-2', source: forged, title: 'Bad',
    })).toThrowError('class_book_source_owner_mismatch');
    const bare = { ...source(), materialId: 'legacy-material' } as unknown as ClassBookSourcePlacement;
    expect(() => service.place({
      operationId: 'op-bare-source', actorId: 'teacher-1', now,
      classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-2',
      classCourseMaterialId: 'class-material-2', source: bare, title: 'Bad',
    })).toThrowError('class_book_bare_material_id_forbidden');
  });

  it('isolates duplicate Activity placements in progress and results', () => {
    const { authority, repository, service } = setup();
    const first = issue(service, 'activity-placement-1', 'binding-duplicate-1');
    service.createCopy({
      operationId: 'op-copy-2', actorId: 'teacher-1', now,
      classId: 'class-1', copyId: 'copy-2', classCourseId: 'class-course-2',
      sourceCourseId: 'course-source-1', sourceCourseMaterialId: 'course-material-source-1',
    });
    service.place({
      operationId: 'op-place-2', actorId: 'teacher-1', now,
      classId: 'class-1', copyId: 'copy-2', classPlacementId: 'class-placement-2',
      classCourseMaterialId: 'class-material-2', source: source(), title: 'Class Book two',
    });
    const second = service.issueDelivery({
      operationId: 'op-issue-duplicate-2', actorId: 'teacher-1', now,
      classId: 'class-1', copyId: 'copy-2', classPlacementId: 'class-placement-2',
      classCourseMaterialId: 'class-material-2', studentId: 'student-1',
      bindingId: 'binding-duplicate-2', entitlementId: 'entitlement-duplicate-2',
      activityPlacementId: 'activity-placement-1', bookTitle: 'Book one', unitTitle: 'Unit one', expiresAt: expires,
    });
    const results = new ClassBookResultsService(new InMemoryClassBookProgressRepository(), authority, new ClassBookRolloutGate({ enabled: true }));
    const scope = (binding: typeof first, copyId: string, classPlacementId: string, courseMaterialId: string): ClassBookAttemptScope => ({
      surface: 'class-course', classId: 'class-1', copyId, courseMaterialId, classPlacementId,
      studentId: 'student-1', bindingId: binding.bindingId,
      activityPlacementId: binding.activity.placementId, activityVersionId: binding.activity.activityVersionId,
    });
    const firstScope = scope(first, 'copy-1', 'class-placement-1', 'class-material-1');
    const secondScope = scope(second, 'copy-2', 'class-placement-2', 'class-material-2');
    results.saveProgress({ actorId: 'student-1', scope: firstScope, expectedRevision: 0, responseDigest: 'draft-1', updatedAt: now });
    results.saveProgress({ actorId: 'student-1', scope: secondScope, expectedRevision: 0, responseDigest: 'draft-2', updatedAt: now });
    expect(results.submitResult({ actorId: 'student-1', scope: firstScope, responseDigest: 'result-1', submittedAt: later }).key)
      .not.toBe(results.submitResult({ actorId: 'student-1', scope: secondScope, responseDigest: 'result-2', submittedAt: later }).key);
    expect(results.readResult({ actorId: 'teacher-1', scope: firstScope })?.responseDigest).toBe('result-1');
    expect(results.readResult({ actorId: 'teacher-1', scope: secondScope })?.responseDigest).toBe('result-2');
  });

  it('denies forged delivery dimensions and preserves history during rollback', () => {
    const { authority, repository, placement, service } = setup();
    const binding = issue(service);
    expect(() => service.resolveDelivery({
      studentId: 'student-1', classId: 'class-1', copyId: 'copy-2', classPlacementId: placement.classPlacementId,
      classCourseMaterialId: 'class-material-1', binding, now,
    })).toThrowError('class_book_delivery_context_denied');
    expect(() => service.resolveDelivery({
      studentId: 'student-1', classId: 'class-1', copyId: 'copy-1', classPlacementId: placement.classPlacementId,
      classCourseMaterialId: 'class-material-1', binding: { ...binding, activity: { ...binding.activity, bindingRevision: 'forged' } }, now,
    })).toThrowError('class_book_delivery_pin_mismatch');
    const rollbackService = new ClassBookPlacementService(repository, authority, new ClassBookRolloutGate({ enabled: true, rollback: true }));
    expect(() => rollbackService.issueDelivery({
      operationId: 'op-rollback-issue', actorId: 'teacher-1', now,
      classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1', classCourseMaterialId: 'class-material-1',
      studentId: 'student-1', bindingId: 'binding-new', entitlementId: 'entitlement-new',
      activityPlacementId: 'activity-placement-1', bookTitle: 'Book one', unitTitle: 'Unit one', expiresAt: expires,
    })).toThrowError('class_book_rollout_rollback');
    expect(rollbackService.resolveDelivery({
      studentId: 'student-1', classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
      classCourseMaterialId: 'class-material-1', binding, now,
    }).binding.bindingId).toBe(binding.bindingId);
    expect(repository.readVersion(classBookContextId('class-1', 'copy-1', 'class-material-1'), 1)).toEqual(placement);
    expect(createClassBookRollbackState({ reason: 'local proof', changedAt: later, operationId: 'op-rollback' }).denyNewWrites)
      .toBe(true);
  });

  it('migrates only an explicit class copy/placement and rejects a legacy bare material', () => {
    const { service } = setup();
    const migrated = migrateLegacyClassBookPlacement(service, {
      actorId: 'teacher-1',
      operationId: 'op-migration-1',
      classId: 'class-1',
      copyId: 'copy-1',
      classPlacementId: 'class-placement-migrated',
      classCourseMaterialId: 'class-material-migrated',
      source: source(),
      title: 'Migrated Class Book',
      migratedAt: later,
    });
    expect(migrated.receipt.mode).toBe('explicit-class-book-placement');
    expect(migrated.placement.courseMaterialId).toBe('class-material-migrated');
    expect(() => migrateLegacyClassBookPlacement(service, {
      actorId: 'teacher-1', operationId: 'op-migration-bare', classId: 'class-1', copyId: 'copy-1',
      classPlacementId: 'class-placement-bare', classCourseMaterialId: 'class-material-bare', source: source(),
      title: 'Bare', migratedAt: later, materialId: 'legacy-material',
    } as never)).toThrowError('class_book_migration_bare_material_id_forbidden');
  });
});
