/**
 * #103 Class Book placement contract.
 *
 * This module is deliberately additive. It consumes the frozen #102 pins and
 * binding shape, but owns the Class boundary: class, immutable copy, exact
 * placement, lock, and membership are all required dimensions.
 */

export const CLASS_BOOK_SCHEMA_VERSION = 1 as const;
export const CLASS_BOOK_CONTEXT_SURFACE = 'class-course' as const;

export type ClassBookPlacementStatus = 'active' | 'superseded' | 'revoked';
export type ClassBookCopyStatus = 'active' | 'revoked';
export type ClassBookLockState = 'unlocked' | 'locked';

export interface ClassBookPlacementPins {
  readonly bookId: string;
  readonly publicationId: string;
  readonly unitStableKey: string;
  readonly unitVersionId: string;
  readonly manifestVersionId: string;
  readonly sourceVersionId: string;
  readonly bindingRevision: string;
}

export interface ClassBookActivitySelection {
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly unitStableKey: string;
  readonly unitVersionId: string;
  readonly sourceVersionId: string;
  readonly pageGroupId: string;
  readonly physicalPageNumber: number;
  readonly order: number;
  readonly title: string;
}

/** The exact subset selected from the source Course placement. */
export interface ClassBookSelection {
  readonly kind: 'subtree' | 'placements';
  readonly nodeKeys: readonly string[];
  readonly placementIds: readonly string[];
}

/** Frozen #102 Course placement consumed by #103; no bare materialId input. */
export interface ClassBookSourcePlacement {
  readonly courseId: string;
  readonly moduleId: string;
  readonly courseMaterialId: string;
  readonly ownerId: string;
  readonly placementRevision: number;
  readonly status: 'active' | 'revoked' | 'superseded';
  readonly pins: ClassBookPlacementPins;
  readonly selection: ClassBookSelection;
  readonly activities: readonly ClassBookActivitySelection[];
}

export interface ClassBookClassAuthority {
  readonly classId: string;
  readonly ownerId: string;
  readonly status: 'active' | 'paused' | 'archived' | 'deleted';
  readonly authorityRevision: number;
}

export interface ClassBookMembershipAuthority {
  readonly classId: string;
  readonly studentId: string;
  readonly status: 'active' | 'pending' | 'removed' | 'rejected';
  readonly membershipRevision: number;
}

export interface ClassBookLockAuthority {
  readonly classId: string;
  readonly classPlacementId: string;
  readonly state: ClassBookLockState;
  readonly revision: number;
  readonly changedBy: string;
  readonly changedAt: string;
  readonly operationId: string;
}

export interface ClassBookCopyIdentity {
  readonly schemaVersion: 1;
  readonly copyId: string;
  readonly classId: string;
  readonly classCourseId: string;
  readonly sourceCourseId: string;
  readonly sourceCourseMaterialId: string;
  readonly ownerId: string;
  readonly status: ClassBookCopyStatus;
  readonly copyRevision: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface ClassBookPlacement {
  readonly schemaVersion: 1;
  readonly classPlacementId: string;
  readonly classId: string;
  readonly copyId: string;
  readonly classCourseId: string;
  readonly sourceCourseId: string;
  readonly courseMaterialId: string;
  readonly sourceCourseMaterialId: string;
  readonly ownerId: string;
  readonly sourcePlacementRevision: number;
  readonly placementRevision: number;
  readonly status: ClassBookPlacementStatus;
  readonly pins: ClassBookPlacementPins;
  readonly selection: ClassBookSelection;
  readonly activities: readonly ClassBookActivitySelection[];
  readonly sourceFingerprint: string;
  readonly title: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly supersededByPlacementId?: string;
}

import type { BookDeliveryBinding } from './bookDelivery.types';

/** Exact #102 Book Delivery binding schema, narrowed to class-course. */
export type ClassBookDeliveryBinding = Omit<BookDeliveryBinding, 'context'> & {
  readonly context: {
    readonly surface: 'class-course';
    readonly contextId: string;
    readonly entitlementId: string;
  };
};

export interface ClassBookDeliveryProjection {
  readonly projectionKind: 'class-book-delivery-v1';
  readonly binding: ClassBookDeliveryBinding;
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseId: string;
  readonly courseMaterialId: string;
  readonly placementRevision: number;
  readonly progressKey: string;
  readonly resultKey: string;
}

export interface ClassBookAuthorityPort {
  readonly readClass: (classId: string) => ClassBookClassAuthority | null;
  readonly readMembership: (classId: string, studentId: string) => ClassBookMembershipAuthority | null;
  readonly readLock: (classId: string, classPlacementId: string) => ClassBookLockAuthority | null;
}

export interface ClassBookPlacementRepository {
  readonly readCopy: (classId: string, copyId: string) => ClassBookCopyIdentity | null;
  readonly readCurrent: (contextId: string) => ClassBookPlacement | null;
  readonly readVersion: (contextId: string, placementRevision: number) => ClassBookPlacement | null;
  readonly createCopy: (copy: ClassBookCopyIdentity) => 'created' | 'replayed' | 'conflict';
  readonly createPlacement: (placement: ClassBookPlacement, operationId: string) => 'created' | 'replayed' | 'conflict';
  readonly appendPlacement: (placement: ClassBookPlacement, operationId: string) => 'created' | 'replayed' | 'conflict';
}

export interface ClassBookOperationInput {
  readonly operationId: string;
  readonly actorId: string;
  readonly now?: string;
}

export class ClassBookPlacementError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ClassBookPlacementError';
    this.code = code;
  }
}

export const CLASS_BOOK_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/u;
export const CLASS_BOOK_SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/u;

export function assertClassBookId(value: unknown, code = 'class_book_id_invalid'): asserts value is string {
  if (typeof value !== 'string' || !CLASS_BOOK_ID.test(value)) throw new ClassBookPlacementError(code);
}

export function assertClassBookSafeId(value: unknown, code = 'class_book_safe_id_invalid'): asserts value is string {
  if (typeof value !== 'string' || !CLASS_BOOK_SAFE_ID.test(value)) throw new ClassBookPlacementError(code);
}

export function assertClassBookRevision(value: unknown, code = 'class_book_revision_invalid'): void {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ClassBookPlacementError(code);
}

export function assertClassBookTimestamp(value: unknown, code = 'class_book_timestamp_invalid'): asserts value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    throw new ClassBookPlacementError(code);
  }
}

export const classBookContextId = (classId: string, copyId: string, courseMaterialId: string): string => {
  assertClassBookId(classId);
  assertClassBookId(copyId);
  assertClassBookId(courseMaterialId);
  const contextId = `class-${classId}-copy-${copyId}-material-${courseMaterialId}`;
  if (!CLASS_BOOK_SAFE_ID.test(contextId)) throw new ClassBookPlacementError('class_book_context_id_invalid');
  return contextId;
};

export const classBookPlacementKey = (
  classId: string,
  copyId: string,
  courseMaterialId: string,
  classPlacementId: string,
): string => [
  classBookContextId(classId, copyId, courseMaterialId),
  classPlacementId,
].join('-placement-');

export const classBookProgressKey = (input: {
  readonly classId: string;
  readonly copyId: string;
  readonly courseMaterialId: string;
  readonly classPlacementId: string;
  readonly studentId: string;
  readonly activityPlacementId: string;
  readonly activityVersionId: string;
  readonly bindingId: string;
}): string => [
  'class-book-progress',
  input.classId,
  input.copyId,
  input.courseMaterialId,
  input.classPlacementId,
  input.studentId,
  input.activityPlacementId,
  input.activityVersionId,
  input.bindingId,
].map((value) => {
  assertClassBookSafeId(value);
  return value;
}).join('/');

export const classBookResultKey = (input: Parameters<typeof classBookProgressKey>[0]): string => [
  'class-book-result',
  input.classId,
  input.copyId,
  input.courseMaterialId,
  input.classPlacementId,
  input.studentId,
  input.activityPlacementId,
  input.activityVersionId,
  input.bindingId,
].map((value) => {
  assertClassBookSafeId(value);
  return value;
}).join('/');

export const classBookBindingContextId = (
  classId: string,
  copyId: string,
  courseMaterialId: string,
  classPlacementId: string,
): string => {
  const contextId = `${classBookContextId(classId, copyId, courseMaterialId)}-placement-${classPlacementId}`;
  assertClassBookSafeId(contextId, 'class_book_binding_context_invalid');
  return contextId;
};

export const cloneClassBook = <T>(value: T): T => structuredClone(value);

const stableClassBookValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableClassBookValue).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableClassBookValue(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

export const classBookFingerprint = (value: unknown): string => stableClassBookValue(value);

export const classBookBindingKeys = [
  'schemaVersion', 'bindingId', 'studentId', 'context', 'book', 'activity', 'titleSnapshot', 'createdAt', 'expiresAt',
] as const;
