import type {
  BookHomeworkAuthorityRecord,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type {
  BookHomeworkCompatibilityProjection,
} from '../../../../src/types/homework.types.ts';
import type {
  BookHomeworkSagaRecord,
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
  const children = root.recipients.map((entry, index) => committedChild(root, entry, authorities[index] ?? null));
  const first = children[0];
  if (children.some((child) => child.bookManifest.book.bookId !== first.bookManifest.book.bookId
    || child.schedule.finalDueAt !== first.schedule.finalDueAt
    || child.schedule.availableFrom !== first.schedule.availableFrom)) {
    throw new BookHomeworkCompatibilityBridgeError('invalid-committed-child', 'Committed child authorities disagree on projection fields.');
  }
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
    materialId: first.bookManifest.book.bookId,
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
      ...(first.schedule.availableFrom === undefined
        ? {}
        : { availableFrom: epoch(first.schedule.availableFrom, 'schedule.availableFrom') }),
      dueDate: epoch(first.schedule.finalDueAt, 'schedule.finalDueAt'),
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
      sourceSagaRevision: root.revision,
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
  const projection = deriveBookHomeworkCompatibilityProjection(root, authorities);
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
