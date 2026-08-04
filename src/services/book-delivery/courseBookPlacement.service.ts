/**
 * #102 Course-owned Book delivery boundary.
 *
 * This module intentionally resolves an immutable Course projection only.  It
 * does not dispatch a runtime route (#104), infer a Class copy (#103), or
 * accept public/reference publication authority (#106).
 */
export type CourseBookPins = Readonly<{
  bookId: string;
  publicationId: string;
  manifestVersionId: string;
  unitStableKey: string;
  unitVersionId: string;
  sourceVersionId: string;
  activityId: string;
  activityVersionId: string;
  bindingRevision: string;
}>;

export type CourseBookPlacement = Readonly<{
  courseMaterialId: string;
  courseId: string;
  moduleId: string;
  ownerId: string;
  bindingId: string;
  placementRevision: number;
  completionAggregationPolicy: 'all-activities';
  status: 'active' | 'revoked';
  pins: CourseBookPins;
}>;

export type CourseEnrollmentAuthority = Readonly<{
  legacyEnrollmentId: string;
  courseId: string;
  studentId: string;
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: string;
  revision: number;
  operationId: string;
}>;

export type CourseBookPublicationAuthority = Readonly<{
  ownerId: string;
  bookId: string;
  publicationId: string;
  manifestVersionId: string;
  lifecycle: 'published';
}>;

export type CourseBookRuntimeGate = Readonly<{
  courseArchived?: boolean;
  rollbackEnabled?: boolean;
  restoreInProgress?: boolean;
  now?: string;
}>;

export class CourseBookPlacementError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CourseBookPlacementError';
  }
}

const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const valid = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u.test(value);
const validPins = (pins: CourseBookPins): boolean => Object.values(pins).every(valid);
const activeAt = (enrollment: CourseEnrollmentAuthority, now?: string): boolean => (
  enrollment.status === 'active' && (!enrollment.expiresAt || !now || enrollment.expiresAt > now)
);

/** Deterministic identity: no Book materialId is ever usable as a placement key. */
export const courseBookBindingId = (input: Pick<CourseBookPlacement, 'courseId' | 'courseMaterialId' | 'pins'>): string => (
  `course:${input.courseId}:${input.courseMaterialId}:${input.pins.bindingRevision}`
);

/** Scope all mutable runtime artifacts by student, Course placement, and immutable activity version. */
export const courseBookProjectionKey = (placement: CourseBookPlacement, studentId: string): string => (
  `${placement.bindingId}:${studentId}:${placement.courseMaterialId}:${placement.pins.activityId}:${placement.pins.activityVersionId}`
);

export interface CourseBookPlacementRepository {
  read(courseMaterialId: string): CourseBookPlacement | undefined;
  write(placement: CourseBookPlacement): void;
}

export class InMemoryCourseBookPlacementRepository implements CourseBookPlacementRepository {
  constructor(private readonly records = new Map<string, CourseBookPlacement>()) {}
  read(courseMaterialId: string): CourseBookPlacement | undefined { return this.records.get(courseMaterialId); }
  write(placement: CourseBookPlacement): void { this.records.set(placement.courseMaterialId, placement); }
}

export interface CourseEnrollmentAuthorityPort {
  transitionDirectCourseEnrollment(input: CourseEnrollmentAuthority): CourseEnrollmentAuthority;
}

/** Bounded direct-Course port.  Class enrollment is deliberately rejected. */
export class InMemoryCourseEnrollmentAuthorityPort implements CourseEnrollmentAuthorityPort {
  constructor(private readonly records = new Map<string, CourseEnrollmentAuthority>()) {}
  transitionDirectCourseEnrollment(input: CourseEnrollmentAuthority): CourseEnrollmentAuthority {
    if (![input.legacyEnrollmentId, input.courseId, input.studentId, input.operationId].every(valid)
      || !Number.isSafeInteger(input.revision) || input.revision < 1) {
      throw new CourseBookPlacementError('invalid-enrollment');
    }
    const key = `${input.courseId}:${input.studentId}`;
    const previous = this.records.get(key);
    if (previous && equal(previous, input)) return previous;
    if (previous && input.revision !== previous.revision + 1) {
      throw new CourseBookPlacementError('enrollment-revision-conflict');
    }
    const next = Object.freeze({ ...input });
    this.records.set(key, next);
    return next;
  }
}

export const createCourseBookPlacementService = (repository: CourseBookPlacementRepository) => {
  const assertWritable = (gate?: CourseBookRuntimeGate): void => {
    if (gate?.rollbackEnabled || gate?.restoreInProgress) throw new CourseBookPlacementError('course-book-writes-disabled');
  };

  return {
    place(input: {
      actorId: string;
      courseId: string;
      moduleId: string;
      courseMaterialId: string;
      courseOwnerId: string;
      contextOwnerId: string;
      publication: CourseBookPublicationAuthority;
      pins: CourseBookPins;
      gate?: CourseBookRuntimeGate;
    }) {
      assertWritable(input.gate);
      if (![input.actorId, input.courseId, input.moduleId, input.courseMaterialId, input.courseOwnerId, input.contextOwnerId].every(valid)
        || !validPins(input.pins)) throw new CourseBookPlacementError('invalid-placement');
      if (input.actorId !== input.courseOwnerId
        || input.actorId !== input.contextOwnerId
        || input.actorId !== input.publication.ownerId
        || input.pins.bookId !== input.publication.bookId
        || input.pins.publicationId !== input.publication.publicationId
        || input.pins.manifestVersionId !== input.publication.manifestVersionId
        || input.publication.lifecycle !== 'published') {
        throw new CourseBookPlacementError('forbidden');
      }
      const placement = Object.freeze({
        courseMaterialId: input.courseMaterialId,
        courseId: input.courseId,
        moduleId: input.moduleId,
        ownerId: input.courseOwnerId,
        bindingId: courseBookBindingId({ courseId: input.courseId, courseMaterialId: input.courseMaterialId, pins: input.pins }),
        placementRevision: 1,
        completionAggregationPolicy: 'all-activities' as const,
        status: 'active' as const,
        pins: Object.freeze({ ...input.pins }),
      });
      const previous = repository.read(placement.courseMaterialId);
      if (previous && equal(previous, placement)) return { kind: 'replayed' as const, placement: previous };
      if (previous) throw new CourseBookPlacementError('pin-conflict');
      repository.write(placement);
      return { kind: 'created' as const, placement };
    },

    resolve(input: {
      actorId: string;
      studentId: string;
      courseId: string;
      moduleId: string;
      courseMaterialId?: string;
      enrollment: CourseEnrollmentAuthority;
      moduleReleased: boolean;
      publication: CourseBookPublicationAuthority;
      gate?: CourseBookRuntimeGate;
    }) {
      if (input.actorId !== input.studentId || !input.courseMaterialId || input.gate?.courseArchived
        || input.gate?.restoreInProgress || !input.moduleReleased || !activeAt(input.enrollment, input.gate?.now)) {
        throw new CourseBookPlacementError('denied');
      }
      const placement = repository.read(input.courseMaterialId);
      if (!placement || placement.status !== 'active' || placement.courseId !== input.courseId
        || placement.moduleId !== input.moduleId || input.enrollment.courseId !== input.courseId
        || input.enrollment.studentId !== input.studentId || placement.ownerId !== input.publication.ownerId
        || placement.pins.bookId !== input.publication.bookId || placement.pins.publicationId !== input.publication.publicationId
        || placement.pins.manifestVersionId !== input.publication.manifestVersionId || input.publication.lifecycle !== 'published') {
        throw new CourseBookPlacementError('denied');
      }
      const isolatedKey = courseBookProjectionKey(placement, input.studentId);
      return Object.freeze({
        projectionKind: 'course-book-delivery-v1' as const,
        context: { kind: 'course' as const, contextId: placement.courseId, courseMaterialId: placement.courseMaterialId },
        bindingId: placement.bindingId,
        bindingRevision: placement.pins.bindingRevision,
        placementRevision: placement.placementRevision,
        completionAggregationPolicy: placement.completionAggregationPolicy,
        pins: placement.pins,
        progressKey: isolatedKey,
        resultKey: isolatedKey,
      });
    },

    revoke(input: { actorId: string; courseMaterialId: string; gate?: CourseBookRuntimeGate }): CourseBookPlacement {
      assertWritable(input.gate);
      const previous = repository.read(input.courseMaterialId);
      if (!previous || previous.ownerId !== input.actorId) throw new CourseBookPlacementError('forbidden');
      const next = Object.freeze({ ...previous, status: 'revoked' as const, placementRevision: previous.placementRevision + 1 });
      repository.write(next);
      return next;
    },
  };
};
