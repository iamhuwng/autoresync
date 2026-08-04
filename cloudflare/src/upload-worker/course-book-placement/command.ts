import type { CourseBookPlacement } from '../../../../src/services/book-delivery/courseBookPlacement.service.ts';
import {
  deriveDirectCourseModuleRelease,
  requireActiveDirectCourseEnrollment,
} from './access.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const OPERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class CourseBookCommandError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'CourseBookCommandError';
  }
}

export interface CourseBookCommandSelection {
  readonly bookId: string;
  readonly scope:
    | { readonly kind: 'subtree'; readonly nodeKeys: readonly string[]; readonly placementIds: readonly [] }
    | { readonly kind: 'placements'; readonly nodeKeys: readonly []; readonly placementIds: readonly string[] };
}

export interface CourseBookCommandPorts<Projection = unknown> {
  readonly readValue: (path: string, query?: { readonly orderBy: string; readonly equalTo?: string }) => Promise<unknown>;
  readonly placements: {
    read(courseMaterialId: string): Promise<CourseBookPlacement | null>;
    create(placement: CourseBookPlacement): Promise<'created' | 'replayed' | 'conflict'>;
    revoke(input: { courseMaterialId: string; actorUid: string; operationId: string }): Promise<'revoked' | 'replayed' | 'conflict'>;
  };
  readonly publications: {
    derivePlacement(input: {
      actorUid: string; courseId: string; moduleId: string; courseMaterialId: string;
      selection: CourseBookCommandSelection; courseOwnerId: string;
    }): Promise<CourseBookPlacement>;
    validatePlacement(placement: CourseBookPlacement): Promise<boolean>;
  };
  readonly enrollments: {
    transition(input: { actorUid: string; courseId: string; studentId: string; legacyEnrollmentId: string; operationId: string }): Promise<'transitioned' | 'replayed' | 'conflict'>;
  };
  readonly releases: {
    transition(input: { actorUid: string; courseId: string; moduleId: string; studentId: string; released: true; revision: number; operationId: string }): Promise<'transitioned' | 'replayed' | 'conflict'>;
  };
  readonly delivery: {
    ensureAndResolve(input: { placement: CourseBookPlacement; studentId: string; createOperationId: string; activateOperationId: string; supersedeOperationId: string }): Promise<Projection>;
  };
  readonly now?: () => number;
}

const requireId = (value: string, code: string): string => {
  if (!ID.test(value)) throw new CourseBookCommandError(code);
  return value;
};
const requireOperation = (value: string): string => {
  if (!OPERATION.test(value)) throw new CourseBookCommandError('course_book_operation_invalid');
  return value;
};
const asRecord = (value: unknown, code: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CourseBookCommandError(code, 403);
  return value as Record<string, unknown>;
};
const flag = (value: unknown, name: string): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = (value as Record<string, unknown>)[name];
  return candidate === true || Boolean(candidate && typeof candidate === 'object'
    && !Array.isArray(candidate) && (candidate as Record<string, unknown>).active === true);
};

const childOperation = async (operationId: string, stage: string): Promise<string> => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${operationId}:${stage}`)));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const assertWritable = (flags: unknown): void => {
  if (flag(flags, 'restore_in_progress') || flag(flags, 'course_book_rollback')) {
    throw new CourseBookCommandError('course_book_writes_disabled', 503);
  }
};

export const createCourseBookPlacementCommand = <Projection>(ports: CourseBookCommandPorts<Projection>) => {
  const now = ports.now ?? Date.now;
  return {
    async place(input: {
      actorUid: string; operationId: string; courseId: string; moduleId: string;
      courseMaterialId: string; selection: CourseBookCommandSelection;
    }) {
      requireId(input.actorUid, 'course_book_actor_invalid');
      requireOperation(input.operationId);
      [input.courseId, input.moduleId, input.courseMaterialId, input.selection.bookId]
        .forEach((value) => requireId(value, 'course_book_placement_invalid'));
      const [courseRaw, moduleRaw, flags] = await Promise.all([
        ports.readValue(`courses/${input.courseId}`),
        ports.readValue(`course_modules/${input.moduleId}`),
        ports.readValue('system_flags'),
      ]);
      assertWritable(flags);
      const course = asRecord(courseRaw, 'course_book_course_denied');
      const module = asRecord(moduleRaw, 'course_book_module_denied');
      if (course.ownerId !== input.actorUid || course.isClassInstance === true || course.archivedAt
        || module.id !== input.moduleId || module.courseId !== input.courseId) {
        throw new CourseBookCommandError('course_book_placement_denied', 403);
      }
      const placement = await ports.publications.derivePlacement({
        actorUid: input.actorUid, courseId: input.courseId, moduleId: input.moduleId,
        courseMaterialId: input.courseMaterialId, selection: input.selection, courseOwnerId: input.actorUid,
      });
      const result = await ports.placements.create(placement);
      if (result === 'conflict') throw new CourseBookCommandError('course_book_placement_conflict', 409);
      return { status: result, placement };
    },

    async prepare(input: { actorUid: string; operationId: string; courseMaterialId: string; legacyEnrollmentId: string }) {
      requireId(input.actorUid, 'course_book_actor_invalid');
      requireOperation(input.operationId);
      requireId(input.courseMaterialId, 'course_book_material_invalid');
      requireId(input.legacyEnrollmentId, 'course_book_enrollment_invalid');
      const placement = await ports.placements.read(input.courseMaterialId);
      if (!placement || placement.status !== 'active') throw new CourseBookCommandError('course_book_placement_denied', 403);
      const readLive = async () => {
        const [course, module, modules, progress, legacy, authority, release, flags] = await Promise.all([
          ports.readValue(`courses/${placement.courseId}`),
          ports.readValue(`course_modules/${placement.moduleId}`),
          ports.readValue('course_modules', { orderBy: 'courseId', equalTo: placement.courseId }),
          ports.readValue(`course_progress/${input.actorUid}/${placement.courseId}`),
          ports.readValue(`course_enrollments/${input.legacyEnrollmentId}`),
          ports.readValue(`course_book_authority/enrollments/${placement.courseId}/${input.actorUid}`),
          ports.readValue(`course_book_authority/releases/${placement.courseId}/${placement.moduleId}/${input.actorUid}`),
          ports.readValue('system_flags'),
        ]);
        return { course, module, modules, progress, legacy, authority, release, flags };
      };
      const live = await readLive();
      assertWritable(live.flags);
      const course = asRecord(live.course, 'course_book_course_denied');
      if (course.ownerId !== placement.ownerId || course.isClassInstance === true || course.archivedAt) {
        throw new CourseBookCommandError('course_book_course_denied', 403);
      }
      requireActiveDirectCourseEnrollment({
        legacyEnrollmentId: input.legacyEnrollmentId, value: live.legacy,
        courseId: placement.courseId, studentId: input.actorUid, now: now(),
      });
      if (!await ports.publications.validatePlacement(placement)) {
        throw new CourseBookCommandError('course_book_publication_stale', 409);
      }
      const released = deriveDirectCourseModuleRelease({
        courseId: placement.courseId, moduleId: placement.moduleId,
        module: live.module, courseModules: live.modules, progress: live.progress,
      });
      if (!released) throw new CourseBookCommandError('course_book_module_locked', 403);
      const authority = live.authority && typeof live.authority === 'object' && !Array.isArray(live.authority)
        ? live.authority as Record<string, unknown> : null;
      if (!authority || authority.legacyEnrollmentId !== input.legacyEnrollmentId
        || authority.status !== 'active') {
        const result = await ports.enrollments.transition({
          actorUid: input.actorUid, courseId: placement.courseId, studentId: input.actorUid,
          legacyEnrollmentId: input.legacyEnrollmentId,
          operationId: await childOperation(input.operationId, 'enrollment'),
        });
        if (result === 'conflict') throw new CourseBookCommandError('course_book_enrollment_conflict', 409);
      }
      const release = live.release && typeof live.release === 'object' && !Array.isArray(live.release)
        ? live.release as Record<string, unknown> : null;
      if (!release || release.released !== true) {
        const revision = release && Number.isSafeInteger(release.revision) ? Number(release.revision) + 1 : 1;
        const result = await ports.releases.transition({
          actorUid: input.actorUid, courseId: placement.courseId, moduleId: placement.moduleId,
          studentId: input.actorUid, released: true, revision,
          operationId: await childOperation(input.operationId, 'release'),
        });
        if (result === 'conflict') throw new CourseBookCommandError('course_book_release_conflict', 409);
      }
      const after = await readLive();
      assertWritable(after.flags);
      const afterCourse = asRecord(after.course, 'course_book_course_denied');
      requireActiveDirectCourseEnrollment({
        legacyEnrollmentId: input.legacyEnrollmentId, value: after.legacy,
        courseId: placement.courseId, studentId: input.actorUid, now: now(),
      });
      if (afterCourse.ownerId !== placement.ownerId || afterCourse.archivedAt
        || !deriveDirectCourseModuleRelease({ courseId: placement.courseId, moduleId: placement.moduleId,
          module: after.module, courseModules: after.modules, progress: after.progress })
        || !await ports.publications.validatePlacement(placement)) {
        throw new CourseBookCommandError('course_book_authority_changed', 409);
      }
      return ports.delivery.ensureAndResolve({
        placement, studentId: input.actorUid,
        createOperationId: await childOperation(input.operationId, 'delivery-create'),
        activateOperationId: await childOperation(input.operationId, 'delivery-activate'),
        supersedeOperationId: await childOperation(input.operationId, 'delivery-supersede'),
      });
    },

    async revoke(input: { actorUid: string; operationId: string; courseMaterialId: string }) {
      requireId(input.actorUid, 'course_book_actor_invalid');
      requireOperation(input.operationId);
      requireId(input.courseMaterialId, 'course_book_material_invalid');
      const placement = await ports.placements.read(input.courseMaterialId);
      if (!placement) throw new CourseBookCommandError('course_book_placement_denied', 403);
      const [courseRaw, flags] = await Promise.all([
        ports.readValue(`courses/${placement.courseId}`), ports.readValue('system_flags'),
      ]);
      assertWritable(flags);
      const course = asRecord(courseRaw, 'course_book_course_denied');
      if (placement.ownerId !== input.actorUid || course.ownerId !== input.actorUid) {
        throw new CourseBookCommandError('course_book_revoke_denied', 403);
      }
      const result = await ports.placements.revoke(input);
      if (result === 'conflict') throw new CourseBookCommandError('course_book_revoke_conflict', 409);
      return { status: result };
    },
  };
};
