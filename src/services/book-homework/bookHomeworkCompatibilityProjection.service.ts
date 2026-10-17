import {
  BOOK_HOMEWORK_COMPATIBILITY_ASSIGNMENT_KIND,
  BOOK_HOMEWORK_COMPATIBILITY_SCHEMA_VERSION,
  type BookHomeworkCompatibilityProjection,
} from '../../types/homework.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9_:@-]{0,127}$/u;
const TITLE = /^.{1,512}$/su;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every((key) => allowed.has(key));
};

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const isRootId = (value: unknown): value is string => typeof value === 'string' && ROOT_ID.test(value);
const isTitle = (value: unknown): value is string => typeof value === 'string' && TITLE.test(value);

export const isBookHomeworkCompatibilityProjection = (
  value: unknown,
): value is BookHomeworkCompatibilityProjection => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'archived', 'assignmentKind', 'bookHomeworkCompatibility', 'config', 'createdAt',
    'createdBy', 'id', 'materialId', 'materialSkill', 'materialTitle', 'materialType',
    'scheduling', 'schemaVersion', 'tags', 'target', 'title', 'updatedAt', 'visibility',
  ], ['description'])) return false;
  if (value.schemaVersion !== BOOK_HOMEWORK_COMPATIBILITY_SCHEMA_VERSION
    || value.assignmentKind !== BOOK_HOMEWORK_COMPATIBILITY_ASSIGNMENT_KIND
    || !isRootId(value.id)
    || !isId(value.createdBy)
    || !isFiniteNumber(value.createdAt)
    || !isFiniteNumber(value.updatedAt)
    || !isId(value.materialId)
    || !isTitle(value.materialTitle)
    || value.materialType !== 'book'
    || value.materialSkill !== 'mixed'
    || !isTitle(value.title)
    || (value.description !== undefined && !isTitle(value.description))
    || value.archived !== false
    || !Array.isArray(value.tags)
    || value.tags.length !== 0) return false;

  if (!isRecord(value.target) || !hasExactKeys(value.target, ['studentIds', 'type'])
    || value.target.type !== 'students'
    || !Array.isArray(value.target.studentIds)
    || value.target.studentIds.length === 0
    || value.target.studentIds.some((studentId) => !isId(studentId))
    || new Set(value.target.studentIds).size !== value.target.studentIds.length) return false;

  if (!isRecord(value.scheduling) || !hasExactKeys(value.scheduling, ['dueDate'], ['availableFrom'])
    || !isFiniteNumber(value.scheduling.dueDate)
    || (value.scheduling.availableFrom !== undefined && !isFiniteNumber(value.scheduling.availableFrom))) return false;

  if (!isRecord(value.config) || !hasExactKeys(value.config, [
    'feedbackTiming', 'lateSubmissionAllowed', 'maxAttempts', 'timerMinutes',
  ])
    || value.config.timerMinutes !== null
    || value.config.maxAttempts !== null
    || value.config.feedbackTiming !== 'never'
    || value.config.lateSubmissionAllowed !== false) return false;

  if (!isRecord(value.visibility) || !hasExactKeys(value.visibility, [
    'showAttempts', 'showDueDate', 'showDuration', 'showQuestionCount', 'showTimer',
  ])
    || value.visibility.showTimer !== false
    || value.visibility.showAttempts !== false
    || value.visibility.showDueDate !== true
    || value.visibility.showQuestionCount !== false
    || value.visibility.showDuration !== false) return false;

  const marker = value.bookHomeworkCompatibility;
  return isRecord(marker)
    && hasExactKeys(marker, ['assignmentId', 'schemaVersion', 'sourceFingerprint', 'sourceSagaRevision'])
    && marker.schemaVersion === BOOK_HOMEWORK_COMPATIBILITY_SCHEMA_VERSION
    && marker.assignmentId === value.id
    && isRootId(marker.assignmentId)
    && typeof marker.sourceSagaRevision === 'number'
    && Number.isSafeInteger(marker.sourceSagaRevision)
    && marker.sourceSagaRevision >= 0
    && typeof marker.sourceFingerprint === 'string'
    && marker.sourceFingerprint.length > 0;
};

export const assertBookHomeworkCompatibilityProjection = (
  value: unknown,
): asserts value is BookHomeworkCompatibilityProjection => {
  if (!isBookHomeworkCompatibilityProjection(value)) {
    throw new Error('book_homework_compatibility_projection_invalid');
  }
};
