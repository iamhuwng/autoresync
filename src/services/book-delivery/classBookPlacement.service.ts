import {
  assertClassBookId,
  assertClassBookRevision,
  assertClassBookSafeId,
  assertClassBookTimestamp,
  classBookBindingContextId,
  classBookContextId,
  classBookFingerprint,
  classBookPlacementKey,
  classBookProgressKey,
  classBookResultKey,
  cloneClassBook,
  ClassBookPlacementError,
  type ClassBookActivitySelection,
  type ClassBookAuthorityPort,
  type ClassBookClassAuthority,
  type ClassBookCopyIdentity,
  type ClassBookDeliveryBinding,
  type ClassBookDeliveryProjection,
  type ClassBookLockAuthority,
  type ClassBookMembershipAuthority,
  type ClassBookOperationInput,
  type ClassBookPlacement,
  type ClassBookPlacementPins,
  type ClassBookPlacementRepository,
  type ClassBookSelection,
  type ClassBookSourcePlacement,
} from './classBookPlacement.types';
import { ClassBookRolloutGate } from './classBookRolloutGate';

const ACTIVE_CLASS_STATUSES = new Set<ClassBookClassAuthority['status']>(['active']);
const ACTIVE_MEMBERSHIP_STATUSES = new Set<ClassBookMembershipAuthority['status']>(['active']);
const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/u;
const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/u;

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const assertOperation = (value: string): void => assertClassBookId(value, 'class_book_operation_invalid');

const assertTitle = (value: string, code = 'class_book_title_invalid'): void => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 240
    || /[\u0000-\u001f\u007f]/u.test(value)) throw new ClassBookPlacementError(code);
};

const assertPins = (pins: ClassBookPlacementPins): void => {
  if (!pins || typeof pins !== 'object') throw new ClassBookPlacementError('class_book_pins_invalid');
  for (const value of [
    pins.bookId,
    pins.publicationId,
    pins.unitStableKey,
    pins.unitVersionId,
    pins.manifestVersionId,
    pins.sourceVersionId,
    pins.bindingRevision,
  ]) assertClassBookSafeId(value, 'class_book_pin_invalid');
};

const assertSelection = (selection: ClassBookSelection, activities: readonly ClassBookActivitySelection[]): void => {
  if (!selection || (selection.kind !== 'subtree' && selection.kind !== 'placements')
    || !Array.isArray(selection.nodeKeys) || !Array.isArray(selection.placementIds)
    || selection.nodeKeys.length === 0 && selection.placementIds.length === 0
    || selection.kind === 'subtree' && (selection.nodeKeys.length === 0 || selection.placementIds.length !== 0)
    || selection.kind === 'placements' && (selection.nodeKeys.length !== 0 || selection.placementIds.length === 0)
    || new Set(selection.nodeKeys).size !== selection.nodeKeys.length
    || new Set(selection.placementIds).size !== selection.placementIds.length) {
    throw new ClassBookPlacementError('class_book_selection_invalid');
  }
  selection.nodeKeys.forEach((value) => assertClassBookSafeId(value, 'class_book_selection_node_invalid'));
  const activityIds = new Set(activities.map((activity) => activity.placementId));
  selection.placementIds.forEach((value) => {
    assertClassBookSafeId(value, 'class_book_selection_activity_invalid');
    if (!activityIds.has(value)) throw new ClassBookPlacementError('class_book_selection_activity_missing');
  });
};

const assertActivities = (activities: readonly ClassBookActivitySelection[], pins: ClassBookPlacementPins): void => {
  if (!Array.isArray(activities) || activities.length === 0) {
    throw new ClassBookPlacementError('class_book_activities_invalid');
  }
  const placementIds = new Set<string>();
  activities.forEach((activity, index) => {
    if (!activity || placementIds.has(activity.placementId) || activity.order !== index
      || !Number.isSafeInteger(activity.physicalPageNumber) || activity.physicalPageNumber < 1) {
      throw new ClassBookPlacementError('class_book_activity_invalid');
    }
    placementIds.add(activity.placementId);
    for (const value of [
      activity.placementId,
      activity.activityId,
      activity.activityVersionId,
      activity.unitStableKey,
      activity.unitVersionId,
      activity.sourceVersionId,
      activity.pageGroupId,
    ]) assertClassBookSafeId(value, 'class_book_activity_identity_invalid');
    assertTitle(activity.title, 'class_book_activity_title_invalid');
    if (activity.unitStableKey !== pins.unitStableKey
      || activity.unitVersionId !== pins.unitVersionId
      || activity.sourceVersionId !== pins.sourceVersionId) {
      throw new ClassBookPlacementError('class_book_activity_pin_mismatch');
    }
  });
};

const assertSourcePlacement = (source: ClassBookSourcePlacement): void => {
  if (!source || typeof source !== 'object') throw new ClassBookPlacementError('class_book_source_invalid');
  const raw = source as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(raw, 'materialId')) {
    throw new ClassBookPlacementError('class_book_bare_material_id_forbidden');
  }
  for (const value of [source.courseId, source.moduleId, source.courseMaterialId, source.ownerId]) {
    assertClassBookId(value, 'class_book_source_identity_invalid');
  }
  assertClassBookRevision(source.placementRevision, 'class_book_source_revision_invalid');
  if (source.status !== 'active') throw new ClassBookPlacementError('class_book_source_not_active');
  assertPins(source.pins);
  assertActivities(source.activities, source.pins);
  assertSelection(source.selection, source.activities);
  if (source.selection.kind === 'placements'
    && (source.selection.placementIds.length !== source.activities.length
    || source.activities.some((activity) => !source.selection.placementIds.includes(activity.placementId)))) {
    throw new ClassBookPlacementError('class_book_selection_not_exact');
  }
};

const assertClassAuthority = (
  authority: ClassBookAuthorityPort,
  classId: string,
  actorId: string,
): ClassBookClassAuthority => {
  assertClassBookId(classId);
  assertClassBookId(actorId, 'class_book_actor_invalid');
  const record = authority.readClass(classId);
  if (!record || record.classId !== classId || !ACTIVE_CLASS_STATUSES.has(record.status)) {
    throw new ClassBookPlacementError('class_book_class_unavailable');
  }
  if (record.ownerId !== actorId) throw new ClassBookPlacementError('class_book_owner_denied');
  return record;
};

const assertActiveMember = (
  authority: ClassBookAuthorityPort,
  classId: string,
  studentId: string,
): ClassBookMembershipAuthority => {
  assertClassBookId(studentId, 'class_book_student_invalid');
  const membership = authority.readMembership(classId, studentId);
  if (!membership || membership.classId !== classId || membership.studentId !== studentId
    || !ACTIVE_MEMBERSHIP_STATUSES.has(membership.status)) {
    throw new ClassBookPlacementError('class_book_enrollment_denied');
  }
  return membership;
};

const assertUnlocked = (authority: ClassBookAuthorityPort, classId: string, classPlacementId: string): void => {
  const lock = authority.readLock(classId, classPlacementId);
  if (lock && lock.state === 'locked') throw new ClassBookPlacementError('class_book_locked');
};

const makeCopy = (input: {
  readonly copyId: string;
  readonly classId: string;
  readonly classCourseId: string;
  readonly sourceCourseId: string;
  readonly sourceCourseMaterialId: string;
  readonly ownerId: string;
  readonly actorId: string;
  readonly now: string;
}): ClassBookCopyIdentity => ({
  schemaVersion: 1,
  copyId: input.copyId,
  classId: input.classId,
  classCourseId: input.classCourseId,
  sourceCourseId: input.sourceCourseId,
  sourceCourseMaterialId: input.sourceCourseMaterialId,
  ownerId: input.ownerId,
  status: 'active',
  copyRevision: 1,
  createdAt: input.now,
  createdBy: input.actorId,
  updatedAt: input.now,
  updatedBy: input.actorId,
});

const makePlacement = (input: {
  readonly classPlacementId: string;
  readonly classId: string;
  readonly copy: ClassBookCopyIdentity;
  readonly source: ClassBookSourcePlacement;
  readonly classCourseMaterialId: string;
  readonly title: string;
  readonly actorId: string;
  readonly now: string;
  readonly placementRevision: number;
  readonly status?: ClassBookPlacement['status'];
  readonly supersededByPlacementId?: string;
}): ClassBookPlacement => ({
  schemaVersion: 1,
  classPlacementId: input.classPlacementId,
  classId: input.classId,
  copyId: input.copy.copyId,
  classCourseId: input.copy.classCourseId,
  sourceCourseId: input.copy.sourceCourseId,
  courseMaterialId: input.classCourseMaterialId,
  sourceCourseMaterialId: input.source.courseMaterialId,
  ownerId: input.copy.ownerId,
  sourcePlacementRevision: input.source.placementRevision,
  placementRevision: input.placementRevision,
  status: input.status ?? 'active',
  pins: cloneClassBook(input.source.pins),
  selection: cloneClassBook(input.source.selection),
  activities: cloneClassBook(input.source.activities),
  sourceFingerprint: classBookFingerprint({
    courseId: input.source.courseId,
    moduleId: input.source.moduleId,
    courseMaterialId: input.source.courseMaterialId,
    placementRevision: input.source.placementRevision,
    pins: input.source.pins,
    selection: input.source.selection,
    activities: input.source.activities,
  }),
  title: input.title,
  createdAt: input.now,
  createdBy: input.actorId,
  updatedAt: input.now,
  updatedBy: input.actorId,
  ...(input.supersededByPlacementId ? { supersededByPlacementId: input.supersededByPlacementId } : {}),
});

/**
 * #103 service. The caller supplies the immutable class-course material ID;
 * it is never derived from a source Course material ID or a browser tree.
 */
export class ClassBookPlacementService {
  private readonly consumedOperations = new Set<string>();

  constructor(
    private readonly repository: ClassBookPlacementRepository,
    private readonly authority: ClassBookAuthorityPort,
    private readonly gate: ClassBookRolloutGate = new ClassBookRolloutGate(),
  ) {}

  private consumeOperation(operationId: string): void {
    assertOperation(operationId);
    if (this.consumedOperations.has(operationId)) {
      throw new ClassBookPlacementError('class_book_replay_denied');
    }
    this.consumedOperations.add(operationId);
  }

  createCopy(input: ClassBookOperationInput & {
    readonly classId: string;
    readonly copyId: string;
    readonly classCourseId: string;
    readonly sourceCourseId: string;
    readonly sourceCourseMaterialId: string;
  }): ClassBookCopyIdentity {
    this.gate.assertMutationAllowed();
    this.consumeOperation(input.operationId);
    const classRecord = assertClassAuthority(this.authority, input.classId, input.actorId);
    for (const value of [input.copyId, input.classCourseId, input.sourceCourseId, input.sourceCourseMaterialId]) {
      assertClassBookId(value, 'class_book_copy_identity_invalid');
    }
    const now = input.now ?? new Date().toISOString();
    assertClassBookTimestamp(now);
    const copy = makeCopy({ ...input, ownerId: classRecord.ownerId, now });
    const outcome = this.repository.createCopy(copy);
    if (outcome === 'conflict') throw new ClassBookPlacementError('class_book_copy_conflict');
    const existing = this.repository.readCopy(input.classId, input.copyId);
    if (!existing) throw new ClassBookPlacementError('class_book_copy_not_persisted');
    return cloneClassBook(existing);
  }

  place(input: ClassBookOperationInput & {
    readonly classId: string;
    readonly copyId: string;
    readonly classPlacementId: string;
    readonly classCourseMaterialId: string;
    readonly source: ClassBookSourcePlacement;
    readonly title: string;
  }): ClassBookPlacement {
    this.gate.assertMutationAllowed();
    this.consumeOperation(input.operationId);
    const classRecord = assertClassAuthority(this.authority, input.classId, input.actorId);
    assertClassBookId(input.copyId, 'class_book_copy_id_invalid');
    assertClassBookId(input.classPlacementId, 'class_book_placement_id_invalid');
    assertClassBookId(input.classCourseMaterialId, 'class_book_course_material_id_invalid');
    assertSourcePlacement(input.source);
    if (input.source.ownerId !== classRecord.ownerId) {
      throw new ClassBookPlacementError('class_book_source_owner_mismatch');
    }
    assertTitle(input.title);
    assertUnlocked(this.authority, input.classId, input.classPlacementId);
    const copy = this.repository.readCopy(input.classId, input.copyId);
    if (!copy || copy.status !== 'active') throw new ClassBookPlacementError('class_book_copy_unavailable');
    if (copy.classId !== input.classId || copy.ownerId !== classRecord.ownerId
      || copy.sourceCourseId !== input.source.courseId
      || copy.sourceCourseMaterialId !== input.source.courseMaterialId) {
      throw new ClassBookPlacementError('class_book_copy_source_mismatch');
    }
    if (input.classCourseMaterialId === input.source.courseMaterialId) {
      throw new ClassBookPlacementError('class_book_copy_material_must_be_distinct');
    }
    const now = input.now ?? new Date().toISOString();
    assertClassBookTimestamp(now);
    const placement = makePlacement({
      classPlacementId: input.classPlacementId,
      classId: input.classId,
      copy,
      source: input.source,
      classCourseMaterialId: input.classCourseMaterialId,
      title: input.title,
      actorId: input.actorId,
      now,
      placementRevision: 1,
    });
    const outcome = this.repository.createPlacement(placement, input.operationId);
    if (outcome === 'conflict') throw new ClassBookPlacementError('class_book_placement_conflict');
    const current = this.repository.readCurrent(classBookContextId(
      input.classId,
      input.copyId,
      input.classCourseMaterialId,
    ));
    if (!current) throw new ClassBookPlacementError('class_book_placement_not_persisted');
    return cloneClassBook(current);
  }

  sync(input: ClassBookOperationInput & {
    readonly classId: string;
    readonly copyId: string;
    readonly classPlacementId: string;
    readonly classCourseMaterialId: string;
    readonly expectedPlacementRevision: number;
    readonly source: ClassBookSourcePlacement;
    readonly title?: string;
  }): ClassBookPlacement {
    this.gate.assertMutationAllowed();
    this.consumeOperation(input.operationId);
    const classRecord = assertClassAuthority(this.authority, input.classId, input.actorId);
    assertClassBookRevision(input.expectedPlacementRevision, 'class_book_expected_revision_invalid');
    assertClassBookId(input.copyId, 'class_book_copy_id_invalid');
    assertClassBookId(input.classPlacementId, 'class_book_placement_id_invalid');
    assertClassBookId(input.classCourseMaterialId, 'class_book_course_material_id_invalid');
    assertSourcePlacement(input.source);
    if (input.source.ownerId !== classRecord.ownerId) {
      throw new ClassBookPlacementError('class_book_source_owner_mismatch');
    }
    assertUnlocked(this.authority, input.classId, input.classPlacementId);
    const copy = this.repository.readCopy(input.classId, input.copyId);
    const contextId = classBookContextId(input.classId, input.copyId, input.classCourseMaterialId);
    const current = this.repository.readCurrent(contextId);
    if (!copy || copy.status !== 'active') throw new ClassBookPlacementError('class_book_copy_unavailable');
    if (!current || current.classPlacementId !== input.classPlacementId) {
      throw new ClassBookPlacementError('class_book_placement_not_found');
    }
    if (current.placementRevision !== input.expectedPlacementRevision) {
      throw new ClassBookPlacementError('class_book_placement_stale');
    }
    if (copy.ownerId !== classRecord.ownerId || copy.sourceCourseMaterialId !== input.source.courseMaterialId
      || copy.sourceCourseId !== input.source.courseId) {
      throw new ClassBookPlacementError('class_book_copy_source_mismatch');
    }
    const now = input.now ?? new Date().toISOString();
    assertClassBookTimestamp(now);
    const next = makePlacement({
      classPlacementId: input.classPlacementId,
      classId: input.classId,
      copy,
      source: input.source,
      classCourseMaterialId: input.classCourseMaterialId,
      title: input.title ?? current.title,
      actorId: input.actorId,
      now,
      placementRevision: current.placementRevision + 1,
    });
    const outcome = this.repository.appendPlacement(next, input.operationId);
    if (outcome === 'conflict') throw new ClassBookPlacementError('class_book_sync_conflict');
    const updated = this.repository.readCurrent(contextId);
    if (!updated) throw new ClassBookPlacementError('class_book_sync_not_persisted');
    return cloneClassBook(updated);
  }

  setLock(input: ClassBookOperationInput & {
    readonly classId: string;
    readonly classPlacementId: string;
    readonly state: 'locked' | 'unlocked';
    readonly expectedRevision: number;
  }): ClassBookLockAuthority {
    this.gate.assertMutationAllowed();
    this.consumeOperation(input.operationId);
    const classRecord = assertClassAuthority(this.authority, input.classId, input.actorId);
    assertClassBookId(input.classPlacementId, 'class_book_placement_id_invalid');
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new ClassBookPlacementError('class_book_lock_revision_invalid');
    }
    if (input.state !== 'locked' && input.state !== 'unlocked') {
      throw new ClassBookPlacementError('class_book_lock_state_invalid');
    }
    const current = this.authority.readLock(input.classId, input.classPlacementId);
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== input.expectedRevision) throw new ClassBookPlacementError('class_book_lock_stale');
    const now = input.now ?? new Date().toISOString();
    assertClassBookTimestamp(now);
    const next: ClassBookLockAuthority = {
      classId: input.classId,
      classPlacementId: input.classPlacementId,
      state: input.state,
      revision: currentRevision + 1,
      changedBy: classRecord.ownerId,
      changedAt: now,
      operationId: input.operationId,
    };
    const writer = this.authority as ClassBookAuthorityPort & {
      writeLock?: (value: ClassBookLockAuthority) => 'written' | 'replayed' | 'conflict';
    };
    if (!writer.writeLock) throw new ClassBookPlacementError('class_book_lock_authority_unavailable');
    const outcome = writer.writeLock(next);
    if (outcome === 'conflict') throw new ClassBookPlacementError('class_book_lock_conflict');
    return cloneClassBook(next);
  }

  issueDelivery(input: ClassBookOperationInput & {
    readonly classId: string;
    readonly copyId: string;
    readonly classPlacementId: string;
    readonly classCourseMaterialId: string;
    readonly studentId: string;
    readonly bindingId: string;
    readonly entitlementId: string;
    readonly activityPlacementId: string;
    readonly bookTitle: string;
    readonly unitTitle: string;
    readonly createdAt?: string;
    readonly expiresAt: string;
  }): ClassBookDeliveryBinding {
    this.gate.assertIssuanceAllowed();
    this.consumeOperation(input.operationId);
    assertClassAuthority(this.authority, input.classId, input.actorId);
    assertActiveMember(this.authority, input.classId, input.studentId);
    assertUnlocked(this.authority, input.classId, input.classPlacementId);
    assertUnlocked(this.authority, input.classId, input.classPlacementId);
    for (const value of [
      input.copyId, input.classPlacementId, input.classCourseMaterialId, input.bindingId, input.entitlementId,
      input.activityPlacementId,
    ]) assertClassBookSafeId(value, 'class_book_delivery_identity_invalid');
    const current = this.repository.readCurrent(classBookContextId(
      input.classId,
      input.copyId,
      input.classCourseMaterialId,
    ));
    if (!current || current.classPlacementId !== input.classPlacementId || current.status !== 'active') {
      throw new ClassBookPlacementError('class_book_placement_unavailable');
    }
    const copy = this.repository.readCopy(input.classId, input.copyId);
    if (!copy || copy.status !== 'active' || current.ownerId !== copy.ownerId) {
      throw new ClassBookPlacementError('class_book_copy_unavailable');
    }
    const activity = current.activities.find((candidate) => candidate.placementId === input.activityPlacementId);
    if (!activity) throw new ClassBookPlacementError('class_book_activity_unavailable');
    const createdAt = input.createdAt ?? new Date().toISOString();
    assertClassBookTimestamp(createdAt);
    assertClassBookTimestamp(input.expiresAt);
    if (Date.parse(input.expiresAt) <= Date.parse(createdAt)) {
      throw new ClassBookPlacementError('class_book_delivery_expiry_invalid');
    }
    assertTitle(input.bookTitle, 'class_book_book_title_invalid');
    assertTitle(input.unitTitle, 'class_book_unit_title_invalid');
    const binding: ClassBookDeliveryBinding = {
      schemaVersion: 1,
      bindingId: input.bindingId,
      studentId: input.studentId,
      context: {
        surface: 'class-course',
        contextId: classBookBindingContextId(
          input.classId,
          input.copyId,
          input.classCourseMaterialId,
          input.classPlacementId,
        ),
        entitlementId: input.entitlementId,
      },
      book: {
        bookId: current.pins.bookId,
        unitStableKey: current.pins.unitStableKey,
        unitNodeId: current.pins.unitStableKey,
        manifestVersionId: current.pins.manifestVersionId,
        sourceVersionId: current.pins.sourceVersionId,
      },
      activity: {
        placementId: activity.placementId,
        activityId: activity.activityId,
        activityVersionId: activity.activityVersionId,
        bindingRevision: current.pins.bindingRevision,
        pageGroupId: activity.pageGroupId,
        physicalPageNumber: activity.physicalPageNumber,
        completionAggregation: 'all-required',
      },
      titleSnapshot: {
        bookTitle: input.bookTitle,
        unitTitle: input.unitTitle,
        activityTitle: activity.title,
      },
      createdAt,
      expiresAt: input.expiresAt,
    };
    assertClassBookDeliveryBinding(binding);
    const deliveryStore = this.repository as ClassBookPlacementRepository & {
      writeBinding?: (binding: ClassBookDeliveryBinding, operationId: string) => 'created' | 'replayed' | 'conflict';
    };
    if (!deliveryStore.writeBinding) throw new ClassBookPlacementError('class_book_delivery_store_unavailable');
    const outcome = deliveryStore.writeBinding(binding, input.operationId);
    if (outcome === 'conflict') throw new ClassBookPlacementError('class_book_delivery_conflict');
    return cloneClassBook(binding);
  }

  resolveDelivery(input: {
    readonly studentId: string;
    readonly classId: string;
    readonly copyId: string;
    readonly classPlacementId: string;
    readonly classCourseMaterialId: string;
    readonly binding: ClassBookDeliveryBinding;
    readonly now?: string;
  }): ClassBookDeliveryProjection {
    this.gate.assertExistingBindingResolutionAllowed();
    for (const value of [input.studentId, input.classId, input.copyId, input.classPlacementId, input.classCourseMaterialId]) {
      assertClassBookSafeId(value, 'class_book_delivery_identity_invalid');
    }
    assertClassBookDeliveryBinding(input.binding);
    if (input.binding.studentId !== input.studentId || input.binding.context.surface !== 'class-course'
      || input.binding.context.contextId !== classBookBindingContextId(
        input.classId,
        input.copyId,
        input.classCourseMaterialId,
        input.classPlacementId,
      )) throw new ClassBookPlacementError('class_book_delivery_context_denied');
    assertActiveMember(this.authority, input.classId, input.studentId);
    const current = this.repository.readCurrent(classBookContextId(
      input.classId,
      input.copyId,
      input.classCourseMaterialId,
    ));
    if (!current || current.classPlacementId !== input.classPlacementId || current.status !== 'active') {
      throw new ClassBookPlacementError('class_book_placement_unavailable');
    }
    const activity = current.activities.find((candidate) => candidate.placementId === input.binding.activity.placementId);
    if (!activity
      || activity.activityId !== input.binding.activity.activityId
      || activity.activityVersionId !== input.binding.activity.activityVersionId
      || input.binding.activity.bindingRevision !== current.pins.bindingRevision
      || input.binding.book.bookId !== current.pins.bookId
      || input.binding.book.unitStableKey !== current.pins.unitStableKey
      || input.binding.book.manifestVersionId !== current.pins.manifestVersionId
      || input.binding.book.sourceVersionId !== current.pins.sourceVersionId) {
      throw new ClassBookPlacementError('class_book_delivery_pin_mismatch');
    }
    const now = input.now ?? new Date().toISOString();
    assertClassBookTimestamp(now);
    if (Date.parse(input.binding.expiresAt) <= Date.parse(now)) {
      throw new ClassBookPlacementError('class_book_delivery_expired');
    }
    return {
      projectionKind: 'class-book-delivery-v1',
      binding: cloneClassBook(input.binding),
      classId: input.classId,
      copyId: input.copyId,
      classPlacementId: input.classPlacementId,
      classCourseId: current.classCourseId,
      courseMaterialId: input.classCourseMaterialId,
      placementRevision: current.placementRevision,
      progressKey: classBookProgressKey({
        classId: input.classId,
        copyId: input.copyId,
        courseMaterialId: input.classCourseMaterialId,
        classPlacementId: input.classPlacementId,
        studentId: input.studentId,
        activityPlacementId: input.binding.activity.placementId,
        activityVersionId: input.binding.activity.activityVersionId,
        bindingId: input.binding.bindingId,
      }),
      resultKey: classBookResultKey({
        classId: input.classId,
        copyId: input.copyId,
        courseMaterialId: input.classCourseMaterialId,
        classPlacementId: input.classPlacementId,
        studentId: input.studentId,
        activityPlacementId: input.binding.activity.placementId,
        activityVersionId: input.binding.activity.activityVersionId,
        bindingId: input.binding.bindingId,
      }),
    };
  }

  getPlacement(input: {
    readonly classId: string;
    readonly copyId: string;
    readonly classCourseMaterialId: string;
    readonly classPlacementId: string;
  }): ClassBookPlacement {
    this.gate.assertReadAllowed();
    const current = this.repository.readCurrent(classBookContextId(
      input.classId,
      input.copyId,
      input.classCourseMaterialId,
    ));
    if (!current || current.classPlacementId !== input.classPlacementId) {
      throw new ClassBookPlacementError('class_book_placement_not_found');
    }
    return cloneClassBook(current);
  }
}

export class InMemoryClassBookAuthority implements ClassBookAuthorityPort {
  private readonly classes = new Map<string, ClassBookClassAuthority>();
  private readonly memberships = new Map<string, ClassBookMembershipAuthority>();
  private readonly locks = new Map<string, ClassBookLockAuthority>();

  setClass(value: ClassBookClassAuthority): void { this.classes.set(value.classId, cloneClassBook(value)); }
  setMembership(value: ClassBookMembershipAuthority): void {
    this.memberships.set(`${value.classId}/${value.studentId}`, cloneClassBook(value));
  }
  readClass(classId: string): ClassBookClassAuthority | null {
    const value = this.classes.get(classId);
    return value ? cloneClassBook(value) : null;
  }
  readMembership(classId: string, studentId: string): ClassBookMembershipAuthority | null {
    const value = this.memberships.get(`${classId}/${studentId}`);
    return value ? cloneClassBook(value) : null;
  }
  readLock(classId: string, classPlacementId: string): ClassBookLockAuthority | null {
    const value = this.locks.get(`${classId}/${classPlacementId}`);
    return value ? cloneClassBook(value) : null;
  }
  writeLock(value: ClassBookLockAuthority): 'written' | 'replayed' | 'conflict' {
    const key = `${value.classId}/${value.classPlacementId}`;
    const current = this.locks.get(key);
    if (current?.operationId === value.operationId) {
      return classBookFingerprint(current) === classBookFingerprint(value) ? 'replayed' : 'conflict';
    }
    if (current && current.revision + 1 !== value.revision) return 'conflict';
    this.locks.set(key, cloneClassBook(value));
    return 'written';
  }
  setLockForTest(value: ClassBookLockAuthority): void {
    this.locks.set(`${value.classId}/${value.classPlacementId}`, cloneClassBook(value));
  }
}

export class InMemoryClassBookPlacementRepository implements ClassBookPlacementRepository {
  private readonly copies = new Map<string, ClassBookCopyIdentity>();
  private readonly current = new Map<string, ClassBookPlacement>();
  private readonly versions = new Map<string, ClassBookPlacement>();
  private readonly operations = new Map<string, { readonly fingerprint: string; readonly kind: string }>();
  private readonly bindings = new Map<string, ClassBookDeliveryBinding>();

  readCopy(classId: string, copyId: string): ClassBookCopyIdentity | null {
    const value = this.copies.get(`${classId}/${copyId}`);
    return value ? cloneClassBook(value) : null;
  }
  readCurrent(contextId: string): ClassBookPlacement | null {
    const value = this.current.get(contextId);
    return value ? cloneClassBook(value) : null;
  }
  readVersion(contextId: string, placementRevision: number): ClassBookPlacement | null {
    const value = this.versions.get(`${contextId}/${placementRevision}`);
    return value ? cloneClassBook(value) : null;
  }
  createCopy(copy: ClassBookCopyIdentity): 'created' | 'replayed' | 'conflict' {
    const key = `${copy.classId}/${copy.copyId}`;
    const existing = this.copies.get(key);
    if (existing) return classBookFingerprint(existing) === classBookFingerprint(copy) ? 'replayed' : 'conflict';
    this.copies.set(key, cloneClassBook(copy));
    return 'created';
  }
  createPlacement(placement: ClassBookPlacement, operationId: string): 'created' | 'replayed' | 'conflict' {
    const contextId = classBookContextId(placement.classId, placement.copyId, placement.courseMaterialId);
    const existing = this.current.get(contextId);
    const operation = this.operations.get(operationId);
    const fingerprint = classBookFingerprint(placement);
    if (operation) return operation.fingerprint === fingerprint && operation.kind === 'placement-create' ? 'replayed' : 'conflict';
    if (existing) return classBookFingerprint(existing) === fingerprint ? 'replayed' : 'conflict';
    this.current.set(contextId, cloneClassBook(placement));
    this.versions.set(`${contextId}/${placement.placementRevision}`, cloneClassBook(placement));
    this.operations.set(operationId, { fingerprint, kind: 'placement-create' });
    return 'created';
  }
  appendPlacement(placement: ClassBookPlacement, operationId: string): 'created' | 'replayed' | 'conflict' {
    const contextId = classBookContextId(placement.classId, placement.copyId, placement.courseMaterialId);
    const current = this.current.get(contextId);
    const operation = this.operations.get(operationId);
    const fingerprint = classBookFingerprint(placement);
    if (operation) return operation.fingerprint === fingerprint && operation.kind === 'placement-append' ? 'replayed' : 'conflict';
    if (!current || placement.placementRevision !== current.placementRevision + 1) return 'conflict';
    this.current.set(contextId, cloneClassBook(placement));
    this.versions.set(`${contextId}/${placement.placementRevision}`, cloneClassBook(placement));
    this.operations.set(operationId, { fingerprint, kind: 'placement-append' });
    return 'created';
  }
  writeBinding(binding: ClassBookDeliveryBinding, operationId: string): 'created' | 'replayed' | 'conflict' {
    const existing = this.bindings.get(binding.bindingId);
    const fingerprint = classBookFingerprint(binding);
    const operation = this.operations.get(operationId);
    if (operation) return operation.fingerprint === fingerprint && operation.kind === 'binding' ? 'replayed' : 'conflict';
    if (existing) return classBookFingerprint(existing) === fingerprint ? 'replayed' : 'conflict';
    this.bindings.set(binding.bindingId, cloneClassBook(binding));
    this.operations.set(operationId, { fingerprint, kind: 'binding' });
    return 'created';
  }
  readBinding(bindingId: string): ClassBookDeliveryBinding | null {
    const value = this.bindings.get(bindingId);
    return value ? cloneClassBook(value) : null;
  }
  hasVersion(contextId: string, revision: number): boolean { return this.versions.has(`${contextId}/${revision}`); }
}

export const assertClassBookDeliveryBinding = (binding: ClassBookDeliveryBinding): void => {
  if (!isRecord(binding) || !exactKeys(binding, [
    'schemaVersion', 'bindingId', 'studentId', 'context', 'book', 'activity', 'titleSnapshot', 'createdAt', 'expiresAt',
  ]) || binding.schemaVersion !== 1) throw new ClassBookPlacementError('class_book_binding_invalid');
  for (const value of [binding.bindingId, binding.studentId]) assertClassBookSafeId(value, 'class_book_binding_identity_invalid');
  assertClassBookTimestamp(binding.createdAt, 'class_book_binding_created_at_invalid');
  assertClassBookTimestamp(binding.expiresAt, 'class_book_binding_expires_at_invalid');
  if (Date.parse(binding.expiresAt) <= Date.parse(binding.createdAt)
    || !isRecord(binding.context) || !exactKeys(binding.context, ['surface', 'contextId', 'entitlementId'])
    || binding.context.surface !== 'class-course') throw new ClassBookPlacementError('class_book_binding_context_invalid');
  for (const value of [binding.context.contextId, binding.context.entitlementId]) {
    assertClassBookSafeId(value, 'class_book_binding_context_identity_invalid');
  }
  if (!isRecord(binding.book) || !exactKeys(binding.book, [
    'bookId', 'unitStableKey', 'unitNodeId', 'manifestVersionId', 'sourceVersionId',
  ])) throw new ClassBookPlacementError('class_book_binding_book_invalid');
  for (const value of Object.values(binding.book)) assertClassBookSafeId(value, 'class_book_binding_book_identity_invalid');
  if (!isRecord(binding.activity) || !exactKeys(binding.activity, [
    'placementId', 'activityId', 'activityVersionId', 'bindingRevision', 'pageGroupId',
    'physicalPageNumber', 'completionAggregation',
  ]) || !['all-required', 'any-required', 'manual'].includes(binding.activity.completionAggregation)
    || !Number.isSafeInteger(binding.activity.physicalPageNumber) || binding.activity.physicalPageNumber < 1) {
    throw new ClassBookPlacementError('class_book_binding_activity_invalid');
  }
  for (const value of [
    binding.activity.placementId,
    binding.activity.activityId,
    binding.activity.activityVersionId,
    binding.activity.bindingRevision,
    binding.activity.pageGroupId,
  ]) assertClassBookSafeId(value, 'class_book_binding_activity_identity_invalid');
  if (!isRecord(binding.titleSnapshot) || !exactKeys(binding.titleSnapshot, ['bookTitle', 'unitTitle', 'activityTitle'])) {
    throw new ClassBookPlacementError('class_book_binding_title_invalid');
  }
  assertTitle(binding.titleSnapshot.bookTitle);
  assertTitle(binding.titleSnapshot.unitTitle);
  assertTitle(binding.titleSnapshot.activityTitle);
};

export const createClassBookPlacementService = (options: {
  readonly repository: ClassBookPlacementRepository;
  readonly authority: ClassBookAuthorityPort;
  readonly gate?: ClassBookRolloutGate;
}): ClassBookPlacementService => new ClassBookPlacementService(
  options.repository,
  options.authority,
  options.gate,
);

export const classBookPlacementIdentity = (placement: ClassBookPlacement): string =>
  classBookPlacementKey(placement.classId, placement.copyId, placement.courseMaterialId, placement.classPlacementId);
