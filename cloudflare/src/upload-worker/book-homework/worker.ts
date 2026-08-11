import {
  BookHomeworkAssignmentSaga,
  BookHomeworkSagaError,
  type BookHomeworkSagaResult,
} from './saga.ts';
import {
  FirebaseRestBookHomeworkCompletionRepository,
  type BookHomeworkCompletionProjection,
} from './completion-repository.ts';
import type { BookHomeworkSagaCommand } from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import {
  createBookHomeworkNotificationEmitter,
  resolveBookHomeworkNotificationIdentity,
  type BookHomeworkNotificationEnvironment,
} from './notification.ts';
import type { NotificationCommandRepository } from '../notifications/repository.ts';
import {
  runBookMutationWithPostCommitNotification,
} from '../notifications/post-commit.ts';
import type {
  BookHomeworkTrustedSaga,
  BookHomeworkTrustedSagaFactory,
} from './runtime.ts';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeIfConfigured,
} from '../../book-pilot-scope.ts';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_FINGERPRINT_BYTES = 128 * 1024;
const MAX_RECIPIENTS = 30;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface BookHomeworkWorkerEnv {
  readonly [key: string]: unknown;
  readonly readDatabaseValue?: (path: string) => Promise<unknown>;
}

export class BookHomeworkWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookHomeworkWorkerError';
  }
}

export type BookHomeworkSagaPort = BookHomeworkTrustedSaga;

export interface BookHomeworkWorkerHandlersOptions {
  readonly saga?: BookHomeworkSagaPort;
  readonly sagaFactory?: BookHomeworkTrustedSagaFactory;
  readonly notificationRepositoryFactory?: (
    env: BookHomeworkNotificationEnvironment,
  ) => NotificationCommandRepository;
  readonly resolveCompletionProjection?: (input: {
    readonly assignmentId: string;
    readonly studentId: string;
    readonly authority: NonNullable<
      Awaited<ReturnType<BookHomeworkAssignmentSaga['resolveStudentProjection']>>
    >['completionAuthority'];
    readonly delivery: NonNullable<
      Awaited<ReturnType<BookHomeworkAssignmentSaga['resolveStudentProjection']>>
    >['delivery'];
    readonly env: BookHomeworkWorkerEnv;
  }) => Promise<Record<string, unknown> | null>;
  readonly completionRepositoryFactory?: (
    env: BookHomeworkWorkerEnv,
  ) => {
    readonly resolveCurrentProjection: (input: {
      readonly authority: NonNullable<
        Awaited<ReturnType<BookHomeworkAssignmentSaga['resolveStudentProjection']>>
      >['completionAuthority'];
      readonly binding: NonNullable<
        Awaited<ReturnType<BookHomeworkAssignmentSaga['resolveStudentProjection']>>
      >['delivery']['record']['binding'];
    }) => Promise<BookHomeworkCompletionProjection>;
  };
  readonly now?: () => string;
}

type BookHomeworkCommandInput = Omit<BookHomeworkSagaCommand, 'ownerId' | 'createdAt'>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const readBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new BookHomeworkWorkerError('content_type_required');
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null
    && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new BookHomeworkWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BookHomeworkWorkerError('body_too_large', 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BookHomeworkWorkerError('invalid_json');
  }
};

const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!isRecord(value)) throw new BookHomeworkWorkerError('invalid_request');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new BookHomeworkWorkerError('invalid_request');
  }
  return value;
};

const safeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  return value;
};

const completionMatchesContext = (
  value: Record<string, unknown>,
  assignmentId: string,
  studentId: string,
  binding: NonNullable<
    Awaited<ReturnType<BookHomeworkAssignmentSaga['resolveStudentProjection']>>
  >['delivery']['record']['binding'],
): boolean => value.contextId === assignmentId
  && value.recipientId === studentId
  && value.deliveryBindingId === binding.bindingId
  && value.bindingRevision === binding.revision;

const routeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ROUTE_ID.test(value)) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  return value;
};

const boundedString = (value: unknown, label: string, maxBytes: number): string => {
  if (typeof value !== 'string' || value.length === 0
    || new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  return value;
};

const recipients = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECIPIENTS) {
    throw new BookHomeworkWorkerError('invalid_selected_recipient_ids');
  }
  const result = value.map((entry) => safeId(entry, 'selected_recipient_id'));
  if (new Set(result).size !== result.length) {
    throw new BookHomeworkWorkerError('duplicate_selected_recipient_ids');
  }
  return result;
};

const parseCommand = (
  value: unknown,
  pathAssignmentId: string,
  idempotencyHeader: string | null,
): BookHomeworkCommandInput => {
  const input = exact(value, [
    'assignmentId',
    'operationId',
    'idempotencyKey',
    'manifestVersionId',
    'selectedRecipientIds',
    'expectedManifestFingerprint',
    'expectedPublicationFingerprint',
    'expectedExposureApprovalFingerprint',
    'expectedPolicyFingerprint',
  ]);
  const assignmentId = routeId(input.assignmentId, 'assignment_id');
  if (assignmentId !== pathAssignmentId) {
    throw new BookHomeworkWorkerError('assignment_id_mismatch', 409);
  }
  const idempotencyKey = safeId(input.idempotencyKey, 'idempotency_key');
  if (!idempotencyHeader || idempotencyHeader.trim() !== idempotencyKey) {
    throw new BookHomeworkWorkerError('idempotency_key_mismatch', 409);
  }
  const operationId = input.operationId;
  if (typeof operationId !== 'string' || !UUID.test(operationId)) {
    throw new BookHomeworkWorkerError('invalid_operation_id');
  }
  return {
    assignmentId,
    operationId,
    idempotencyKey,
    manifestVersionId: safeId(input.manifestVersionId, 'manifest_version_id'),
    selectedRecipientIds: recipients(input.selectedRecipientIds),
    expectedManifestFingerprint: boundedString(
      input.expectedManifestFingerprint,
      'manifest_fingerprint',
      MAX_FINGERPRINT_BYTES,
    ),
    expectedPublicationFingerprint: boundedString(
      input.expectedPublicationFingerprint,
      'publication_fingerprint',
      MAX_FINGERPRINT_BYTES,
    ),
    expectedExposureApprovalFingerprint: boundedString(
      input.expectedExposureApprovalFingerprint,
      'exposure_approval_fingerprint',
      MAX_FINGERPRINT_BYTES,
    ),
    expectedPolicyFingerprint: boundedString(
      input.expectedPolicyFingerprint,
      'policy_fingerprint',
      MAX_FINGERPRINT_BYTES,
    ),
  };
};

const teacherRole = (value: unknown): boolean => {
  if (!isRecord(value) || value.forceReauth === true) return false;
  if (['blocked', 'inactive', 'suspended'].includes(String(value.status ?? ''))) return false;
  return value.role === 'teacher' || value.role === 'super_admin';
};

const assertTeacher = async (env: BookHomeworkWorkerEnv, uid: string): Promise<void> => {
  if (typeof env.readDatabaseValue !== 'function') {
    throw new BookHomeworkWorkerError('actor_reader_unavailable', 503);
  }
  if (!teacherRole(await env.readDatabaseValue(`users/${uid}`))) {
    throw new BookHomeworkWorkerError('teacher_required', 403);
  }
};

const statusFor = (status: BookHomeworkSagaResult['status']): number => {
  if (status === 'committed') return 200;
  if (status === 'compensated' || status === 'failed_terminal') return 409;
  return 202;
};

const resultBody = (result: BookHomeworkSagaResult): Record<string, unknown> => ({
  status: result.status,
  assignmentId: result.record.assignmentId,
  operationId: result.record.operationId,
  state: result.record.state,
  visibility: result.record.visibility,
  recipientCount: result.record.recipientCount,
  committedRecipientCount: result.record.committedRecipientCount,
  revision: result.record.revision,
});

const sagaStatus = (code: string): number => {
  if (code === 'owner-mismatch') return 403;
  if (code === 'invalid-command') return 400;
  if (code === 'not-ready' || code === 'stale-roster' || code === 'stale-publication'
    || code === 'stale-input' || code === 'source-unavailable' || code.endsWith('conflict')
    || code.endsWith('failed') || code.endsWith('missing')) return 409;
  return 503;
};

export const createBookHomeworkWorkerHandlers = (
  options: BookHomeworkWorkerHandlersOptions = {},
) => {
  if (options.saga && options.sagaFactory) {
    throw new Error('book_homework_runtime_ambiguous');
  }
  const resolveSaga = async (
    env: BookHomeworkWorkerEnv,
  ): Promise<BookHomeworkSagaPort | undefined> =>
    options.saga ?? await options.sagaFactory?.(env);
  const resolveCompletionProjection = options.resolveCompletionProjection
    ?? (async (input: Parameters<NonNullable<BookHomeworkWorkerHandlersOptions['resolveCompletionProjection']>>[0]) => {
      try {
        if (input.env.BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED !== 'enabled') {
          throw new BookHomeworkWorkerError('book_homework_completion_unavailable', 503);
        }
        const repository = options.completionRepositoryFactory
          ? options.completionRepositoryFactory(input.env)
          : new FirebaseRestBookHomeworkCompletionRepository({ env: input.env });
        const projection = await repository.resolveCurrentProjection({
          authority: input.authority,
          binding: input.delivery.record.binding,
        });
        return projection as unknown as Record<string, unknown>;
      } catch (error) {
        if (error instanceof BookHomeworkWorkerError) throw error;
        throw new BookHomeworkWorkerError('book_homework_completion_unavailable', 503);
      }
    });
  const now = options.now ?? (() => new Date().toISOString());
  const homeworkAssignmentCommand = async (input: {
    readonly request: Request;
    readonly env: BookHomeworkWorkerEnv;
    readonly uid: string;
    readonly assignmentId: string;
  }): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    try {
      await assertTeacher(input.env, input.uid);
      const command = parseCommand(
        await readBody(input.request),
        routeId(input.assignmentId, 'assignment_id'),
        input.request.headers.get('idempotency-key'),
      );
      await enforceBookPilotScopeIfConfigured({
        env: input.env,
        uid: input.uid,
        request: input.request,
        operation: 'assign-place',
        actorKind: 'teacher',
        assignmentId: command.assignmentId,
        contextKind: 'homework',
        selectedStudentIds: command.selectedRecipientIds,
        count: command.selectedRecipientIds.length,
        requireAssignment: true,
        requireStudents: true,
      });
      const saga = await resolveSaga(input.env);
      const notificationEmitter = saga?.readCommittedAssignment
        ? createBookHomeworkNotificationEmitter({
          source: {
            readCommittedAssignment: (assignmentId) =>
              saga.readCommittedAssignment!(assignmentId),
          },
          repositoryFactory: options.notificationRepositoryFactory,
        })
        : undefined;
      return await runBookMutationWithPostCommitNotification({
        env: input.env,
        emitter: notificationEmitter,
        resolveActionIdentity: ({ result }) =>
          resolveBookHomeworkNotificationIdentity(result),
        commit: async () => {
          if (!saga) {
            throw new BookHomeworkWorkerError('saga_unavailable', 503);
          }
          const result = await saga.execute({
            ...command,
            ownerId: input.uid,
            createdAt: now(),
          });
          return {
            body: resultBody(result),
            init: { status: statusFor(result.status) },
          };
        },
      });
    } catch (error) {
      if (error instanceof BookPilotScopeDeniedError) {
        return { body: { code: error.message, decision: error.decision }, init: { status: error.status } };
      }
      if (error instanceof BookHomeworkWorkerError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      if (error instanceof BookHomeworkSagaError) {
        return { body: { code: `book_homework_${error.code}` }, init: { status: sagaStatus(error.code) } };
      }
      console.error('book_homework_command_failed', {
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : 'unknown',
      });
      return {
        body: { code: 'book_homework_command_failed' },
        init: { status: 500 },
      };
    }
  };

  const exactProjection = async (input: {
    readonly assignmentId: string;
    readonly uid: string;
    readonly studentId: string;
    readonly env?: BookHomeworkWorkerEnv;
    readonly teacherRead: boolean;
  }): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    try {
      const assignmentId = routeId(input.assignmentId, 'assignment_id');
      const studentId = safeId(input.studentId, 'student_id');
      if (input.teacherRead) await assertTeacher(input.env ?? {}, input.uid);
      const saga = await resolveSaga(input.env ?? {});
      if (!saga?.resolveStudentProjection) {
        return { body: { code: 'saga_unavailable' }, init: { status: 503 } };
      }
      const projection = await saga.resolveStudentProjection(assignmentId, studentId);
      if (!projection) {
        return { body: { code: 'book_homework_not_found' }, init: { status: 404 } };
      }
      if (input.teacherRead
        && projection.delivery.record.binding.issuer.ownerId !== input.uid) {
        return { body: { code: 'book_homework_owner_required' }, init: { status: 403 } };
      }
      const completion = await resolveCompletionProjection({
        assignmentId,
        studentId,
        authority: projection.completionAuthority,
        delivery: projection.delivery,
        env: input.env ?? {},
      });
      if (!completion || !completionMatchesContext(completion, assignmentId, studentId, projection.delivery.record.binding)) {
        return { body: { code: 'book_homework_completion_unavailable' }, init: { status: 503 } };
      }
      return {
        body: {
          assignmentId,
          authority: projection.authority,
          delivery: projection.delivery,
          ...(completion ? { completion } : {}),
        },
        init: { status: 200 },
      };
    } catch (error) {
      if (error instanceof BookHomeworkWorkerError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      return { body: { code: 'book_homework_projection_failed' }, init: { status: 500 } };
    }
  };

  const homeworkStudentProjection = (input: {
    readonly assignmentId: string;
    readonly uid: string;
    readonly env?: BookHomeworkWorkerEnv;
  }) => exactProjection({
    ...input,
    studentId: input.uid,
    teacherRead: false,
  });

  const homeworkTeacherStudentProjection = (input: {
    readonly assignmentId: string;
    readonly studentId: string;
    readonly uid: string;
    readonly env?: BookHomeworkWorkerEnv;
  }) => exactProjection({ ...input, teacherRead: true });

  const homeworkTeacherProjection = async (input: {
    readonly assignmentId: string;
    readonly uid: string;
    readonly env?: BookHomeworkWorkerEnv;
  }): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    try {
      await assertTeacher(input.env ?? {}, input.uid);
      const assignmentId = routeId(input.assignmentId, 'assignment_id');
      const saga = await resolveSaga(input.env ?? {});
      if (!saga?.resolveTeacherProjections) {
        return { body: { code: 'book_homework_teacher_projection_unavailable' }, init: { status: 503 } };
      }
      const resolutions = await saga.resolveTeacherProjections(
        assignmentId,
        safeId(input.uid, 'teacher_id'),
      );
      if (!resolutions) {
        return { body: { code: 'book_homework_not_found' }, init: { status: 404 } };
      }
      const students = await Promise.all(resolutions.map(async (resolution) => {
        const completion = await resolveCompletionProjection({
          assignmentId,
          studentId: resolution.studentId,
          authority: resolution.completionAuthority,
          delivery: resolution.delivery,
          env: input.env ?? {},
        });
        if (!completion
          || !completionMatchesContext(completion, assignmentId, resolution.studentId, resolution.delivery.record.binding)) {
          throw new BookHomeworkWorkerError('book_homework_completion_missing', 503);
        }
        return { studentId: resolution.studentId, completion };
      }));
      return { body: { assignmentId, students }, init: { status: 200 } };
    } catch (error) {
      if (error instanceof BookHomeworkWorkerError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      return { body: { code: 'book_homework_projection_failed' }, init: { status: 500 } };
    }
  };

  return {
    homeworkAssignmentCommand,
    homeworkStudentProjection,
    homeworkTeacherStudentProjection,
    homeworkTeacherProjection,
  };
};

export default createBookHomeworkWorkerHandlers;
