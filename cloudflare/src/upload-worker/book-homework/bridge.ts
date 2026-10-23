import type {
  BookHomeworkAuthorityRecord,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type {
  BookHomeworkCompatibilityProjection,
} from '../../../../src/types/homework.types.ts';
import type {
  BookHomeworkSagaRecord,
  BookHomeworkCompatibilitySource,
} from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import type {
  BookHomeworkCompatibilityProjectionResult,
  BookHomeworkCompatibilityRepository,
} from './compatibility-repository.ts';
import {
  BookHomeworkProjectionDiagnosticError,
  type BookHomeworkProjectionDiagnostic,
} from './projection-diagnostics.ts';

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

const epoch = (value: string, label: string): number => {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new BookHomeworkCompatibilityBridgeError('invalid-committed-child', `${label} is invalid.`);
  return result;
};

const same = (left: unknown, right: unknown): boolean => stable(left) === stable(right);

export class BookHomeworkCompatibilityBridgeError extends BookHomeworkProjectionDiagnosticError {
  constructor(
    readonly code: 'invalid-committed-child' | 'projection-conflict' | 'projection-readback-mismatch',
    message: string = code,
  ) {
    const diagnostic: BookHomeworkProjectionDiagnostic = code === 'invalid-committed-child'
      ? { stage: 'derived_projection_validation', errorClass: 'invalid-derived-projection' }
      : code === 'projection-conflict'
        ? { stage: 'cas_precondition', errorClass: 'cas-precondition-conflict' }
        : { stage: 'readback', errorClass: 'readback-mismatch' };
    super(diagnostic, message);
    this.name = 'BookHomeworkCompatibilityBridgeError';
  }
}

export interface BookHomeworkCompatibilityRepositoryPort
  extends Pick<BookHomeworkCompatibilityRepository, 'ensureCommittedProjection' | 'read'> {}

const committedChild = (
  root: BookHomeworkSagaRecord,
  entry: BookHomeworkSagaRecord['recipients'][number],
  authority: BookHomeworkAuthorityRecord | null,
): BookHomeworkAuthorityRecord => {
  if (entry.state !== 'committed' || !authority
    || authority.assignmentId !== entry.authorityId
    || authority.ownerId !== root.ownerId
    || authority.saga.sagaId !== root.assignmentId
    || authority.bookManifest.ownerId !== root.ownerId
    || authority.bookManifest.context.contextId !== root.assignmentId
    || authority.bookManifest.context.recipientId !== entry.recipientId
    || authority.bookManifest.manifestVersionId !== root.manifestVersionId
    || (entry.authorityRevision !== undefined && authority.revision !== entry.authorityRevision)
    || authority.visibility.status !== 'committed'
    || authority.saga.state !== 'committed') {
    throw new BookHomeworkCompatibilityBridgeError(
      'invalid-committed-child',
      `Committed child authority is invalid for ${entry.recipientId}.`,
    );
  }
  return authority;
};

export const deriveBookHomeworkCompatibilityProjection = (
  root: BookHomeworkSagaRecord,
  authorities: readonly (BookHomeworkAuthorityRecord | null)[],
): BookHomeworkCompatibilityProjection => {
  if (root.state !== 'committed' || root.visibility !== 'committed'
    || root.recipients.length === 0
    || root.recipients.length !== authorities.length
    || root.recipients.some((entry) => entry.state !== 'committed')) {
    throw new BookHomeworkCompatibilityBridgeError('invalid-committed-child', 'Projection source is not fully committed.');
  }
  return deriveCheckedBookHomeworkCompatibilityProjection(root, validateBookHomeworkCompatibilityBatch(root, 0, authorities));
};

export const validateBookHomeworkCompatibilityBatch = (
  root: BookHomeworkSagaRecord,
  start: number,
  authorities: readonly (BookHomeworkAuthorityRecord | null)[],
  source?: BookHomeworkCompatibilitySource,
): BookHomeworkCompatibilitySource => {
  if (root.state !== 'committed' || root.visibility !== 'committed' || start < 0
    || authorities.length === 0 || start + authorities.length > root.recipientCount) {
    throw new BookHomeworkCompatibilityBridgeError('invalid-committed-child');
  }
  const children = authorities.map((authority, index) => committedChild(root, root.recipients[start + index], authority));
  const first = children[0];
  const expected = source ?? { bookId: first.bookManifest.book.bookId,
    finalDueAt: first.schedule.finalDueAt, committedRevision: root.revision,
    ...(first.schedule.availableFrom === undefined ? {} : { availableFrom: first.schedule.availableFrom }) };
  if (expected.committedRevision !== root.revision
    || children.some(child => child.bookManifest.book.bookId !== expected.bookId
    || child.schedule.finalDueAt !== expected.finalDueAt || child.schedule.availableFrom !== expected.availableFrom)) {
    throw new BookHomeworkCompatibilityBridgeError('invalid-committed-child', 'Committed child authorities disagree on projection fields.');
  }
  return expected;
};

const deriveCheckedBookHomeworkCompatibilityProjection = (
  root: BookHomeworkSagaRecord,
  source: BookHomeworkCompatibilitySource,
): BookHomeworkCompatibilityProjection => {
  const createdAt = epoch(root.createdAt, 'root.createdAt');
  const updatedAt = epoch(root.updatedAt, 'root.updatedAt');
  const presentation = root.presentation;
  const projection: BookHomeworkCompatibilityProjection = {
    schemaVersion: 1,
    assignmentKind: 'book_homework_compatibility',
    id: root.assignmentId,
    createdBy: root.ownerId,
    createdAt,
    updatedAt,
    materialId: source.bookId,
    materialTitle: presentation.title,
    materialType: 'book',
    materialSkill: 'mixed',
    title: presentation.title,
    ...(presentation.description === undefined ? {} : { description: presentation.description }),
    target: {
      type: 'students',
      studentIds: root.recipients.map((entry) => entry.recipientId),
    },
    scheduling: {
      ...(source.availableFrom === undefined
        ? {}
        : { availableFrom: epoch(source.availableFrom, 'schedule.availableFrom') }),
      dueDate: epoch(source.finalDueAt, 'schedule.finalDueAt'),
    },
    config: {
      timerMinutes: null,
      maxAttempts: null,
      feedbackTiming: 'never',
      lateSubmissionAllowed: false,
    },
    visibility: {
      showTimer: false,
      showAttempts: false,
      showDueDate: true,
      showQuestionCount: false,
      showDuration: false,
    },
    archived: false,
    tags: [],
    bookHomeworkCompatibility: {
      schemaVersion: 1,
      assignmentId: root.assignmentId,
      sourceSagaRevision: source.committedRevision,
      sourceFingerprint: root.fingerprint,
    },
  };
  return projection;
};

export const ensureBookHomeworkCompatibilityProjection = async (
  repository: BookHomeworkCompatibilityRepositoryPort,
  root: BookHomeworkSagaRecord,
  authorities: readonly (BookHomeworkAuthorityRecord | null)[],
): Promise<BookHomeworkCompatibilityProjectionResult> => {
  return ensureProjection(repository, root, deriveBookHomeworkCompatibilityProjection(root, authorities));
};

export const ensureCheckedBookHomeworkCompatibilityProjection = (
  repository: BookHomeworkCompatibilityRepositoryPort,
  root: BookHomeworkSagaRecord,
  source: BookHomeworkCompatibilitySource,
): Promise<BookHomeworkCompatibilityProjectionResult> => ensureProjection(
  repository, root, deriveCheckedBookHomeworkCompatibilityProjection(root, source),
);

const ensureProjection = async (
  repository: BookHomeworkCompatibilityRepositoryPort,
  root: BookHomeworkSagaRecord,
  projection: BookHomeworkCompatibilityProjection,
): Promise<BookHomeworkCompatibilityProjectionResult> => {
  const result = await repository.ensureCommittedProjection({ projection });
  if (result === 'conflict') {
    throw new BookHomeworkCompatibilityBridgeError('projection-conflict', 'Compatibility projection CAS conflicted.');
  }
  const readback = await repository.read(root.assignmentId, root.ownerId);
  if (!readback || !same(readback, projection)) {
    throw new BookHomeworkCompatibilityBridgeError('projection-readback-mismatch', 'Compatibility projection readback differs.');
  }
  return result;
};
