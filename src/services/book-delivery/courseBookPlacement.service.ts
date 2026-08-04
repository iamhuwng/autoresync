/** #102 Course-owned immutable Book placement boundary. */
export type CourseBookSelection =
  | Readonly<{ kind: 'subtree'; nodeKeys: readonly string[]; placementIds: readonly [] }>
  | Readonly<{ kind: 'placements'; nodeKeys: readonly []; placementIds: readonly string[] }>;

export type CourseBookSelectedActivityPin = Readonly<{
  placementId: string;
  nodeKey: string;
  unitStableKey: string;
  unitVersionId: string;
  activityId: string;
  activityVersionId: string;
  sourceVersionIds: readonly string[];
}>;

export type CourseBookPins = Readonly<{
  bookId: string;
  publicationId: string;
  publicationRevision: number;
  manifestVersionId: string;
  bindingRevision: number;
  selectedActivities: readonly CourseBookSelectedActivityPin[];
}>;

export type CourseBookCompletionAggregationPolicy =
  | 'all-activities'
  | 'all-activities-with-derived-homework-credit';

export type CourseBookPlacement = Readonly<{
  courseMaterialId: string;
  courseId: string;
  moduleId: string;
  ownerId: string;
  displayTitle: string;
  selection: CourseBookSelection;
  placementRevision: number;
  completionAggregationPolicy: CourseBookCompletionAggregationPolicy;
  status: 'active' | 'revoked';
  pins: CourseBookPins;
}>;

export type CourseEnrollmentAuthority = Readonly<{
  legacyEnrollmentId: string;
  courseId: string;
  studentId: string;
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: number;
  revision: number;
  operationId: string;
}>;

export type CourseBookPublicationAuthority = Readonly<{
  ownerId: string;
  bookId: string;
  publicationId: string;
  publicationRevision: number;
  manifestVersionId: string;
  lifecycle: 'published';
}>;

export type CourseBookRuntimeGate = Readonly<{
  courseArchived?: boolean;
  rollbackEnabled?: boolean;
  restoreInProgress?: boolean;
  now?: number;
}>;

export class CourseBookPlacementError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CourseBookPlacementError';
  }
}

const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const valid = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u.test(value);
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;
const frozenStrings = (values: readonly string[]): readonly string[] => Object.freeze([...values]);

const freezeSelection = (selection: CourseBookSelection): CourseBookSelection => selection.kind === 'subtree'
  ? Object.freeze({ kind: 'subtree', nodeKeys: frozenStrings(selection.nodeKeys), placementIds: Object.freeze([]) as readonly [] })
  : Object.freeze({ kind: 'placements', nodeKeys: Object.freeze([]) as readonly [], placementIds: frozenStrings(selection.placementIds) });

const assertSelection = (selection: CourseBookSelection, pins: readonly CourseBookSelectedActivityPin[]): void => {
  if (selection.kind === 'subtree') {
    if (selection.nodeKeys.length === 0 || selection.placementIds.length !== 0
      || !selection.nodeKeys.every(valid) || !unique(selection.nodeKeys)) {
      throw new CourseBookPlacementError('invalid-selection');
    }
  } else if (selection.placementIds.length === 0 || selection.nodeKeys.length !== 0
    || !selection.placementIds.every(valid) || !unique(selection.placementIds)) {
    throw new CourseBookPlacementError('invalid-selection');
  }
  const selectedIds = pins.map((pin) => pin.placementId);
  if (!unique(selectedIds)
    || (selection.kind === 'placements'
      && (!equal([...selection.placementIds].sort(), [...selectedIds].sort())))) {
    throw new CourseBookPlacementError('selection-pin-mismatch');
  }
};

const freezePins = (pins: CourseBookPins): CourseBookPins => {
  if (![pins.bookId, pins.publicationId, pins.manifestVersionId].every(valid)
    || !Number.isSafeInteger(pins.publicationRevision) || pins.publicationRevision < 1
    || !Number.isSafeInteger(pins.bindingRevision) || pins.bindingRevision < 1
    || pins.selectedActivities.length === 0) throw new CourseBookPlacementError('invalid-pins');
  const selectedActivities = pins.selectedActivities.map((pin) => {
    if (![pin.placementId, pin.nodeKey, pin.unitStableKey, pin.unitVersionId,
      pin.activityId, pin.activityVersionId].every(valid)
      || pin.sourceVersionIds.length === 0 || !pin.sourceVersionIds.every(valid)
      || !unique(pin.sourceVersionIds)) throw new CourseBookPlacementError('invalid-pins');
    return Object.freeze({ ...pin, sourceVersionIds: frozenStrings(pin.sourceVersionIds) });
  });
  return Object.freeze({ ...pins, selectedActivities: Object.freeze(selectedActivities) });
};

const activeAt = (enrollment: CourseEnrollmentAuthority, now?: number): boolean => (
  enrollment.status === 'active'
  && (!enrollment.expiresAt || now === undefined || enrollment.expiresAt > now)
);

/** Scope mutable runtime artifacts by actual Delivery binding, student, and placement. */
export const courseBookProjectionKey = (
  placement: CourseBookPlacement,
  studentId: string,
  bindingId: string,
  placementId: string,
  activityVersionId: string,
): string => `${bindingId}:${studentId}:${placement.courseMaterialId}:${placementId}:${activityVersionId}`;

export type CourseBookActivityCompletion = Readonly<{
  bindingId: string;
  studentId: string;
  courseMaterialId: string;
  placementId: string;
  activityVersionId: string;
  surface?: 'course' | 'homework';
  derivedFromCourseMaterialId?: string;
  status: 'completed';
}>;

export const deriveCourseBookCompletion = (
  placement: CourseBookPlacement,
  studentId: string,
  bindingId: string,
  completions: readonly CourseBookActivityCompletion[],
) => {
  if (!valid(studentId) || !valid(bindingId) || placement.status !== 'active') {
    throw new CourseBookPlacementError('invalid-completion-scope');
  }
  const requiredKeys = placement.pins.selectedActivities.map((pin) => courseBookProjectionKey(
    placement, studentId, bindingId, pin.placementId, pin.activityVersionId,
  ));
  const completedKeys = new Set(completions.flatMap((completion) => {
    if (completion.status !== 'completed' || completion.bindingId !== bindingId
      || completion.studentId !== studentId || completion.courseMaterialId !== placement.courseMaterialId) return [];
    const isCourseCompletion = completion.surface === undefined || completion.surface === 'course';
    const isEnabledDerivedHomework = placement.completionAggregationPolicy === 'all-activities-with-derived-homework-credit'
      && completion.surface === 'homework'
      && completion.derivedFromCourseMaterialId === placement.courseMaterialId;
    if (!isCourseCompletion && !isEnabledDerivedHomework) return [];
    return [courseBookProjectionKey(
      placement, completion.studentId, completion.bindingId,
      completion.placementId, completion.activityVersionId,
    )];
  }));
  const completedRequiredKeys = requiredKeys.filter((key) => completedKeys.has(key));
  return Object.freeze({
    courseMaterialId: placement.courseMaterialId,
    completionAggregationPolicy: placement.completionAggregationPolicy,
    requiredCount: requiredKeys.length,
    completedCount: completedRequiredKeys.length,
    status: completedRequiredKeys.length === requiredKeys.length ? 'completed' as const : 'in-progress' as const,
    requiredKeys: Object.freeze(requiredKeys),
    completedKeys: Object.freeze(completedRequiredKeys),
  });
};

export interface CourseBookPlacementRepository {
  read(courseMaterialId: string): CourseBookPlacement | undefined;
  write(placement: CourseBookPlacement): void;
}

export class InMemoryCourseBookPlacementRepository implements CourseBookPlacementRepository {
  constructor(private readonly records = new Map<string, CourseBookPlacement>()) {}
  read(courseMaterialId: string): CourseBookPlacement | undefined { return this.records.get(courseMaterialId); }
  write(placement: CourseBookPlacement): void { this.records.set(placement.courseMaterialId, placement); }
}

export const createCourseBookPlacementService = (repository: CourseBookPlacementRepository) => {
  const assertWritable = (gate?: CourseBookRuntimeGate): void => {
    if (gate?.rollbackEnabled || gate?.restoreInProgress) throw new CourseBookPlacementError('course-book-writes-disabled');
  };
  return {
    place(input: {
      actorId: string; courseId: string; moduleId: string; courseMaterialId: string;
      courseOwnerId: string; contextOwnerId: string; displayTitle: string;
      publication: CourseBookPublicationAuthority; selection: CourseBookSelection;
      pins: CourseBookPins; gate?: CourseBookRuntimeGate;
    }) {
      assertWritable(input.gate);
      if (![input.actorId, input.courseId, input.moduleId, input.courseMaterialId,
        input.courseOwnerId, input.contextOwnerId].every(valid)
        || typeof input.displayTitle !== 'string' || input.displayTitle.trim().length === 0
        || input.displayTitle.length > 512) throw new CourseBookPlacementError('invalid-placement');
      const pins = freezePins(input.pins);
      assertSelection(input.selection, pins.selectedActivities);
      if (input.actorId !== input.courseOwnerId || input.actorId !== input.contextOwnerId
        || input.actorId !== input.publication.ownerId || pins.bookId !== input.publication.bookId
        || pins.publicationId !== input.publication.publicationId
        || pins.publicationRevision !== input.publication.publicationRevision
        || pins.manifestVersionId !== input.publication.manifestVersionId
        || input.publication.lifecycle !== 'published') throw new CourseBookPlacementError('forbidden');
      const placement: CourseBookPlacement = Object.freeze({
        courseMaterialId: input.courseMaterialId, courseId: input.courseId, moduleId: input.moduleId,
        ownerId: input.courseOwnerId, displayTitle: input.displayTitle.trim(),
        selection: freezeSelection(input.selection), placementRevision: 1,
        completionAggregationPolicy: 'all-activities', status: 'active', pins,
      });
      const previous = repository.read(placement.courseMaterialId);
      if (previous && equal(previous, placement)) return { kind: 'replayed' as const, placement: previous };
      if (previous) throw new CourseBookPlacementError('pin-conflict');
      repository.write(placement);
      return { kind: 'created' as const, placement };
    },
    resolve(input: {
      actorId: string; studentId: string; courseId: string; moduleId: string;
      courseMaterialId?: string; bindingId: string; enrollment: CourseEnrollmentAuthority;
      moduleReleased: boolean; publication: CourseBookPublicationAuthority; gate?: CourseBookRuntimeGate;
    }) {
      if (input.actorId !== input.studentId || !input.courseMaterialId || !valid(input.bindingId)
        || input.gate?.courseArchived || input.gate?.restoreInProgress || input.gate?.rollbackEnabled
        || !input.moduleReleased || !activeAt(input.enrollment, input.gate?.now)) {
        throw new CourseBookPlacementError('denied');
      }
      const placement = repository.read(input.courseMaterialId);
      if (!placement || placement.status !== 'active' || placement.courseId !== input.courseId
        || placement.moduleId !== input.moduleId || input.enrollment.courseId !== input.courseId
        || input.enrollment.studentId !== input.studentId || placement.ownerId !== input.publication.ownerId
        || placement.pins.bookId !== input.publication.bookId
        || placement.pins.publicationId !== input.publication.publicationId
        || placement.pins.publicationRevision !== input.publication.publicationRevision
        || placement.pins.manifestVersionId !== input.publication.manifestVersionId
        || input.publication.lifecycle !== 'published') throw new CourseBookPlacementError('denied');
      return Object.freeze({
        projectionKind: 'course-book-delivery-v1' as const,
        context: { kind: 'course' as const, contextId: placement.courseMaterialId, courseId: placement.courseId },
        bindingId: input.bindingId, bindingRevision: placement.pins.bindingRevision,
        placementRevision: placement.placementRevision,
        completionAggregationPolicy: placement.completionAggregationPolicy,
        selection: placement.selection, pins: placement.pins,
        activityKeys: Object.freeze(placement.pins.selectedActivities.map((pin) => Object.freeze({
          placementId: pin.placementId,
          progressKey: courseBookProjectionKey(placement, input.studentId, input.bindingId, pin.placementId, pin.activityVersionId),
          resultKey: courseBookProjectionKey(placement, input.studentId, input.bindingId, pin.placementId, pin.activityVersionId),
        }))),
      });
    },
    revoke(input: { actorId: string; courseMaterialId: string; gate?: CourseBookRuntimeGate }): CourseBookPlacement {
      assertWritable(input.gate);
      const previous = repository.read(input.courseMaterialId);
      if (!previous || previous.ownerId !== input.actorId) throw new CourseBookPlacementError('forbidden');
      if (previous.status === 'revoked') return previous;
      const next = Object.freeze({ ...previous, status: 'revoked' as const, placementRevision: previous.placementRevision + 1 });
      repository.write(next);
      return next;
    },
  };
};
