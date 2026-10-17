import { describe, expect, it, vi } from 'vitest';
import type { CourseBookPlacement } from '../../src/services/book-delivery/courseBookPlacement.service.ts';
import {
  CourseBookCommandError,
  createCourseBookPlacementCommand,
  type CourseBookCommandPorts,
} from '../src/upload-worker/course-book-placement/command.ts';

const operationId = '11111111-1111-4111-8111-111111111111';
const placement: CourseBookPlacement = {
  courseMaterialId: 'course-material-001', courseId: 'course-001', moduleId: 'module-001',
  ownerId: 'teacher-001', displayTitle: 'Selected unit', selection: {
    kind: 'subtree', nodeKeys: ['unit-001'], placementIds: [],
  }, placementRevision: 1, completionAggregationPolicy: 'all-activities', status: 'active',
  pins: {
    bookId: 'book-001', publicationId: 'publication-001', publicationRevision: 2,
    manifestVersionId: 'manifest-001', bindingRevision: 1,
    selectedActivities: [{
      placementId: 'placement-001', nodeKey: 'unit-001', unitStableKey: 'unit-001',
      unitVersionId: 'unit-projection-001', activityId: 'activity-001',
      activityVersionId: 'activity-version-001', sourceVersionIds: ['source-version-001'],
    }],
  },
};

const createHarness = () => {
  const values = new Map<string, unknown>([
    ['courses/course-001', { ownerId: 'teacher-001' }],
    ['course_modules/module-001', { id: 'module-001', courseId: 'course-001', order: 0, accessType: 'open' }],
    ['course_modules', { 'module-001': { id: 'module-001', courseId: 'course-001', order: 0, accessType: 'open' } }],
    ['course_progress/student-001/course-001', null],
    ['course_enrollments/legacy-001', {
      courseId: 'course-001', studentId: 'student-001', enrollmentType: 'individual',
      status: 'active', expiresAt: 2_000, revision: 1,
    }],
    ['system_flags', {}],
  ]);
  let stored: CourseBookPlacement | null = placement;
  const enrollmentTransition = vi.fn(async (input: Parameters<CourseBookCommandPorts['enrollments']['transition']>[0]) => {
    values.set('course_book_authority/enrollments/course-001/student-001', {
      legacyEnrollmentId: input.legacyEnrollmentId, status: 'active', revision: 1,
    });
    return 'transitioned' as const;
  });
  const releaseTransition = vi.fn(async (input: Parameters<CourseBookCommandPorts['releases']['transition']>[0]) => {
    values.set('course_book_authority/releases/course-001/module-001/student-001', {
      released: true, revision: input.revision, operationId: input.operationId,
    });
    return 'transitioned' as const;
  });
  const ensureAndResolve = vi.fn(async () => ({ bindingId: 'binding-student-001' }));
  const ports: CourseBookCommandPorts<{ bindingId: string }> = {
    readValue: async (path) => values.get(path) ?? null,
    placements: {
      read: async () => stored,
      create: async (next) => { stored = next; return 'created'; },
      revoke: async () => { stored = { ...placement, status: 'revoked', placementRevision: 2 }; return 'revoked'; },
    },
    publications: { derivePlacement: async () => placement, validatePlacement: async () => true },
    enrollments: { transition: enrollmentTransition },
    releases: { transition: releaseTransition },
    delivery: { ensureAndResolve }, now: () => 1_000,
  };
  return { values, ports, enrollmentTransition, releaseTransition, ensureAndResolve };
};

describe('#102 Course command producer', () => {
  it('derives placement authority on the server and persists only an accepted placement', async () => {
    const harness = createHarness();
    const derive = vi.spyOn(harness.ports.publications, 'derivePlacement');
    const result = await createCourseBookPlacementCommand(harness.ports).place({
      actorUid: 'teacher-001', operationId, courseId: 'course-001', moduleId: 'module-001',
      courseMaterialId: 'course-material-001', selection: {
        bookId: 'book-001', scope: { kind: 'subtree', nodeKeys: ['unit-001'], placementIds: [] },
      },
    });
    expect(result).toMatchObject({ status: 'created', placement: { pins: { publicationId: 'publication-001' } } });
    expect(derive).toHaveBeenCalledWith(expect.objectContaining({ actorUid: 'teacher-001', courseOwnerId: 'teacher-001' }));
  });

  it('materializes enrollment and release before resolving one student-scoped Delivery', async () => {
    const harness = createHarness();
    await expect(createCourseBookPlacementCommand(harness.ports).prepare({
      actorUid: 'student-001', operationId, courseMaterialId: 'course-material-001', legacyEnrollmentId: 'legacy-001',
    })).resolves.toEqual({ bindingId: 'binding-student-001' });
    expect(harness.enrollmentTransition).toHaveBeenCalledOnce();
    expect(harness.releaseTransition).toHaveBeenCalledOnce();
    expect(harness.ensureAndResolve).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 'student-001', placement,
      createOperationId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    }));
  });

  it('denies a partial transition and resumes safely on retry', async () => {
    const harness = createHarness();
    harness.ports.releases.transition = vi.fn()
      .mockRejectedValueOnce(new Error('release_write_failed'))
      .mockImplementation(async (input) => {
        harness.values.set('course_book_authority/releases/course-001/module-001/student-001', {
          released: true, revision: input.revision, operationId: input.operationId,
        });
        return 'transitioned';
      });
    const command = createCourseBookPlacementCommand(harness.ports);
    const input = { actorUid: 'student-001', operationId, courseMaterialId: 'course-material-001', legacyEnrollmentId: 'legacy-001' };
    await expect(command.prepare(input)).rejects.toThrow('release_write_failed');
    expect(harness.ensureAndResolve).not.toHaveBeenCalled();
    await expect(command.prepare(input)).resolves.toEqual({ bindingId: 'binding-student-001' });
    expect(harness.enrollmentTransition).toHaveBeenCalledOnce();
    expect(harness.ports.releases.transition).toHaveBeenCalledTimes(2);
  });

  it('keeps rollback deny-only and never reaches producer writes', async () => {
    const harness = createHarness();
    harness.values.set('system_flags', { course_book_rollback: true });
    const command = createCourseBookPlacementCommand(harness.ports);
    await expect(command.prepare({
      actorUid: 'student-001', operationId, courseMaterialId: 'course-material-001', legacyEnrollmentId: 'legacy-001',
    })).rejects.toEqual(expect.objectContaining<CourseBookCommandError>({ code: 'course_book_writes_disabled' }));
    expect(harness.enrollmentTransition).not.toHaveBeenCalled();
    expect(harness.releaseTransition).not.toHaveBeenCalled();
    expect(harness.ensureAndResolve).not.toHaveBeenCalled();
  });
});
