import {
  assertClassBookId,
  assertClassBookSafeId,
  assertClassBookTimestamp,
  classBookFingerprint,
  classBookProgressKey,
  classBookResultKey,
  cloneClassBook,
  ClassBookPlacementError,
  type ClassBookAuthorityPort,
} from './classBookPlacement.types';
import { ClassBookRolloutGate } from './classBookRolloutGate';

export interface ClassBookAttemptScope {
  readonly surface: 'class-course';
  readonly classId: string;
  readonly copyId: string;
  readonly courseMaterialId: string;
  readonly classPlacementId: string;
  readonly studentId: string;
  readonly bindingId: string;
  readonly activityPlacementId: string;
  readonly activityVersionId: string;
}

export interface ClassBookProgressRecord {
  readonly schemaVersion: 1;
  readonly key: string;
  readonly scope: ClassBookAttemptScope;
  readonly revision: number;
  readonly state: 'draft' | 'submitted';
  readonly responseDigest: string;
  readonly updatedAt: string;
}

export interface ClassBookResultRecord {
  readonly schemaVersion: 1;
  readonly key: string;
  readonly scope: ClassBookAttemptScope;
  readonly submittedAt: string;
  readonly responseDigest: string;
  readonly status: 'complete';
}

export interface ClassBookProgressRepository {
  readonly readProgress: (key: string) => ClassBookProgressRecord | null;
  readonly writeProgress: (record: ClassBookProgressRecord) => 'created' | 'updated' | 'replayed' | 'conflict';
  readonly readResult: (key: string) => ClassBookResultRecord | null;
  readonly appendResult: (record: ClassBookResultRecord) => 'created' | 'replayed' | 'conflict';
}

const assertScope = (scope: ClassBookAttemptScope): void => {
  if (!scope || scope.surface !== 'class-course') throw new ClassBookPlacementError('class_book_attempt_surface_invalid');
  for (const value of [
    scope.classId,
    scope.copyId,
    scope.courseMaterialId,
    scope.classPlacementId,
    scope.studentId,
    scope.bindingId,
    scope.activityPlacementId,
    scope.activityVersionId,
  ]) assertClassBookSafeId(value, 'class_book_attempt_identity_invalid');
};

const assertDigest = (value: string): void => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/u.test(value)) {
    throw new ClassBookPlacementError('class_book_response_digest_invalid');
  }
};

const assertActorCanRead = (
  authority: ClassBookAuthorityPort,
  scope: ClassBookAttemptScope,
  actorId: string,
): void => {
  assertClassBookId(actorId, 'class_book_actor_invalid');
  if (actorId === scope.studentId) return;
  const classRecord = authority.readClass(scope.classId);
  if (!classRecord || classRecord.ownerId !== actorId) throw new ClassBookPlacementError('class_book_result_read_denied');
};

const assertStudentCanWrite = (
  authority: ClassBookAuthorityPort,
  scope: ClassBookAttemptScope,
  actorId: string,
): void => {
  if (actorId !== scope.studentId) throw new ClassBookPlacementError('class_book_student_write_denied');
  const member = authority.readMembership(scope.classId, scope.studentId);
  if (!member || member.status !== 'active') throw new ClassBookPlacementError('class_book_enrollment_denied');
};

export class ClassBookResultsService {
  constructor(
    private readonly repository: ClassBookProgressRepository,
    private readonly authority: ClassBookAuthorityPort,
    private readonly gate: ClassBookRolloutGate = new ClassBookRolloutGate(),
  ) {}

  saveProgress(input: {
    readonly actorId: string;
    readonly scope: ClassBookAttemptScope;
    readonly expectedRevision: number;
    readonly responseDigest: string;
    readonly updatedAt: string;
  }): ClassBookProgressRecord {
    this.gate.assertMutationAllowed();
    assertScope(input.scope);
    assertStudentCanWrite(this.authority, input.scope, input.actorId);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new ClassBookPlacementError('class_book_progress_revision_invalid');
    }
    assertDigest(input.responseDigest);
    assertClassBookTimestamp(input.updatedAt);
    const key = classBookProgressKey(input.scope);
    const current = this.repository.readProgress(key);
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== input.expectedRevision) throw new ClassBookPlacementError('class_book_progress_stale');
    const record: ClassBookProgressRecord = {
      schemaVersion: 1,
      key,
      scope: cloneClassBook(input.scope),
      revision: currentRevision + 1,
      state: 'draft',
      responseDigest: input.responseDigest,
      updatedAt: input.updatedAt,
    };
    const outcome = this.repository.writeProgress(record);
    if (outcome === 'conflict') throw new ClassBookPlacementError('class_book_progress_conflict');
    return cloneClassBook(this.repository.readProgress(key) ?? record);
  }

  submitResult(input: {
    readonly actorId: string;
    readonly scope: ClassBookAttemptScope;
    readonly responseDigest: string;
    readonly submittedAt: string;
  }): ClassBookResultRecord {
    this.gate.assertMutationAllowed();
    assertScope(input.scope);
    assertStudentCanWrite(this.authority, input.scope, input.actorId);
    assertDigest(input.responseDigest);
    assertClassBookTimestamp(input.submittedAt);
    const key = classBookResultKey(input.scope);
    const record: ClassBookResultRecord = {
      schemaVersion: 1,
      key,
      scope: cloneClassBook(input.scope),
      submittedAt: input.submittedAt,
      responseDigest: input.responseDigest,
      status: 'complete',
    };
    const outcome = this.repository.appendResult(record);
    if (outcome === 'conflict') throw new ClassBookPlacementError('class_book_result_conflict');
    return cloneClassBook(this.repository.readResult(key) ?? record);
  }

  readProgress(input: { readonly actorId: string; readonly scope: ClassBookAttemptScope }): ClassBookProgressRecord | null {
    this.gate.assertExistingBindingResolutionAllowed();
    assertScope(input.scope);
    assertActorCanRead(this.authority, input.scope, input.actorId);
    return cloneClassBook(this.repository.readProgress(classBookProgressKey(input.scope)));
  }

  readResult(input: { readonly actorId: string; readonly scope: ClassBookAttemptScope }): ClassBookResultRecord | null {
    this.gate.assertExistingBindingResolutionAllowed();
    assertScope(input.scope);
    assertActorCanRead(this.authority, input.scope, input.actorId);
    return cloneClassBook(this.repository.readResult(classBookResultKey(input.scope)));
  }
}

export class InMemoryClassBookProgressRepository implements ClassBookProgressRepository {
  private readonly progress = new Map<string, ClassBookProgressRecord>();
  private readonly results = new Map<string, ClassBookResultRecord>();

  readProgress(key: string): ClassBookProgressRecord | null {
    const record = this.progress.get(key);
    return record ? cloneClassBook(record) : null;
  }
  writeProgress(record: ClassBookProgressRecord): 'created' | 'updated' | 'replayed' | 'conflict' {
    const current = this.progress.get(record.key);
    if (!current) {
      this.progress.set(record.key, cloneClassBook(record));
      return 'created';
    }
    if (classBookFingerprint(current) === classBookFingerprint(record)) return 'replayed';
    if (record.revision !== current.revision + 1) return 'conflict';
    this.progress.set(record.key, cloneClassBook(record));
    return 'updated';
  }
  readResult(key: string): ClassBookResultRecord | null {
    const record = this.results.get(key);
    return record ? cloneClassBook(record) : null;
  }
  appendResult(record: ClassBookResultRecord): 'created' | 'replayed' | 'conflict' {
    const current = this.results.get(record.key);
    if (current) return classBookFingerprint(current) === classBookFingerprint(record) ? 'replayed' : 'conflict';
    this.results.set(record.key, cloneClassBook(record));
    return 'created';
  }
}

export const createClassBookResultsService = (options: {
  readonly repository: ClassBookProgressRepository;
  readonly authority: ClassBookAuthorityPort;
  readonly gate?: ClassBookRolloutGate;
}): ClassBookResultsService => new ClassBookResultsService(
  options.repository,
  options.authority,
  options.gate,
);
