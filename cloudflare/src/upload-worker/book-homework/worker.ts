import {
  BookHomeworkAssignmentSaga,
  BookHomeworkSagaError,
  type BookHomeworkSagaResult,
} from './saga.ts';
import {
  FirebaseRestBookHomeworkCompletionRepository,
  type BookHomeworkCompletionProjection,
} from './completion-repository.ts';
import type {
  BookHomeworkSagaAssignmentIntent,
  BookHomeworkSagaCommand,
} from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
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
  BookHomeworkRuntimeUnavailableError,
  resolveBookHomeworkProductionFetch,
} from './runtime.ts';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeIfConfigured,
} from '../../book-pilot-scope.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { createFirebaseClaimTokenProvider } from '../book-activity-authoring/firebase-token.ts';
import { BookHomeworkCanonicalResolverError } from './canonical-resolver.ts';
import type { BookHomeworkContextResolverPort } from './context-resolver.ts';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_RECIPIENTS = 30;
const MAX_NODE_OVERRIDES = 256;
const MAX_STUDENT_EXTENSIONS = MAX_RECIPIENTS * MAX_NODE_OVERRIDES;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const ASSIGNMENT_ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9_:@-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PRESENTATION_TEXT_MAX_LENGTH = 512;

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
  readonly contextResolver?: BookHomeworkContextResolverPort;
  readonly contextResolverFactory?: (
    env: BookHomeworkWorkerEnv,
  ) => BookHomeworkContextResolverPort | Promise<BookHomeworkContextResolverPort>;
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

const exactOptional = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> => {
  if (!isRecord(value)) throw new BookHomeworkWorkerError('invalid_request');
  const actual = Object.keys(value);
  if (required.some((key) => !actual.includes(key))
    || actual.some((key) => !required.includes(key) && !optional.includes(key))) {
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

const assignmentRouteId = (value: unknown): string => {
  if (typeof value !== 'string' || !ASSIGNMENT_ROUTE_ID.test(value)) {
    throw new BookHomeworkWorkerError('invalid_assignment_id');
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

const canonicalIso = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  return value;
};

const presentationText = (value: unknown, label: string, required: boolean): string | undefined => {
  if (value === undefined) {
    if (required) throw new BookHomeworkWorkerError(`invalid_${label}`);
    return undefined;
  }
  if (typeof value !== 'string') throw new BookHomeworkWorkerError(`invalid_${label}`);
  const normalized = value.trim();
  if (!normalized) {
    if (required) throw new BookHomeworkWorkerError(`invalid_${label}`);
    return undefined;
  }
  if (normalized.length > PRESENTATION_TEXT_MAX_LENGTH) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  return normalized;
};

export const parseBookHomeworkAssignmentIntent = (value: unknown): BookHomeworkSagaAssignmentIntent => {
  const input = exact(value, ['bookId', 'target', 'schedule', 'policy', 'expectedPublication', 'presentation']);
  const bookId = safeId(input.bookId, 'book_id');
  const targetValue = exactOptional(input.target, ['kind', 'bookId', 'classId'], ['nodeKey', 'activityId', 'placementId']);
  const targetBookId = safeId(targetValue.bookId, 'target_book_id');
  const classId = safeId(targetValue.classId, 'class_id');
  if (targetBookId !== bookId) throw new BookHomeworkWorkerError('book_target_mismatch', 409);
  let target: BookHomeworkSagaAssignmentIntent['target'];
  if (targetValue.kind === 'book' && Object.keys(targetValue).length === 3) {
    target = { kind: 'book', bookId, classId };
  } else if (['section', 'chapter', 'unit', 'test'].includes(String(targetValue.kind))
    && Object.keys(targetValue).length === 4) {
    target = {
      kind: targetValue.kind as 'section' | 'chapter' | 'unit' | 'test',
      bookId,
      classId,
      nodeKey: safeId(targetValue.nodeKey, 'target_node_key'),
    };
  } else if (targetValue.kind === 'activity'
    && (Object.keys(targetValue).length === 4 || Object.keys(targetValue).length === 5)) {
    target = {
      kind: 'activity',
      bookId,
      classId,
      activityId: safeId(targetValue.activityId, 'target_activity_id'),
      ...(targetValue.placementId === undefined
        ? {}
        : { placementId: safeId(targetValue.placementId, 'target_placement_id') }),
    };
  } else {
    throw new BookHomeworkWorkerError('invalid_assignment_target');
  }

  const scheduleValue = exactOptional(input.schedule, ['finalDueAt', 'nodeOverrides'], ['availableFrom', 'studentExtensions']);
  if (!Array.isArray(scheduleValue.nodeOverrides) || scheduleValue.nodeOverrides.length > MAX_NODE_OVERRIDES) {
    throw new BookHomeworkWorkerError('invalid_node_overrides');
  }
  const seenNodes = new Set<string>();
  const nodeOverrides = scheduleValue.nodeOverrides.map((entry) => {
    const row = exactOptional(entry, ['nodeKey'], ['availableFrom', 'dueAt']);
    const nodeKey = safeId(row.nodeKey, 'schedule_node_key');
    if (seenNodes.has(nodeKey) || (row.availableFrom === undefined && row.dueAt === undefined)) {
      throw new BookHomeworkWorkerError('invalid_node_overrides');
    }
    seenNodes.add(nodeKey);
    return {
      nodeKey,
      ...(row.availableFrom === undefined ? {} : { availableFrom: canonicalIso(row.availableFrom, 'node_available_from') }),
      ...(row.dueAt === undefined ? {} : { dueAt: canonicalIso(row.dueAt, 'node_due_at') }),
    };
  });
  let studentExtensions: BookHomeworkSagaAssignmentIntent['schedule']['studentExtensions'];
  if (scheduleValue.studentExtensions !== undefined) {
    if (!Array.isArray(scheduleValue.studentExtensions)
      || scheduleValue.studentExtensions.length > MAX_STUDENT_EXTENSIONS) {
      throw new BookHomeworkWorkerError('invalid_student_extensions');
    }
    const seen = new Set<string>();
    studentExtensions = scheduleValue.studentExtensions.map((entry) => {
      const row = exact(entry, ['studentId', 'nodeKey', 'dueAt']);
      const studentId = safeId(row.studentId, 'extension_student_id');
      const nodeKey = safeId(row.nodeKey, 'extension_node_key');
      const key = `${studentId}:${nodeKey}`;
      if (seen.has(key)) throw new BookHomeworkWorkerError('invalid_student_extensions');
      seen.add(key);
      return { studentId, nodeKey, dueAt: canonicalIso(row.dueAt, 'extension_due_at') };
    });
  }

  const policyValue = exact(input.policy, [
    'intent', 'integrityCapture', 'integrityOverride', 'activityPolicies',
  ]);
  if ((policyValue.intent !== 'accountable' && policyValue.intent !== 'practice')
    || typeof policyValue.integrityCapture !== 'boolean'
    || typeof policyValue.integrityOverride !== 'boolean'
    || !Array.isArray(policyValue.activityPolicies)
    || policyValue.activityPolicies.length === 0
    || policyValue.activityPolicies.length > MAX_NODE_OVERRIDES) {
    throw new BookHomeworkWorkerError('invalid_assignment_policy');
  }
  const seenPlacements = new Set<string>();
  const feedback = new Set(['immediate', 'after_completion', 'after_deadline', 'never', 'manual']);
  const activityPolicies = policyValue.activityPolicies.map((entry) => {
    const row = exact(entry, ['placementId', 'maxAttempts', 'feedbackRelease', 'lateSubmissionAllowed']);
    const placementId = safeId(row.placementId, 'policy_placement_id');
    if (seenPlacements.has(placementId)
      || (row.maxAttempts !== null && (!Number.isSafeInteger(row.maxAttempts) || Number(row.maxAttempts) < 1))
      || !feedback.has(String(row.feedbackRelease))
      || typeof row.lateSubmissionAllowed !== 'boolean') {
      throw new BookHomeworkWorkerError('invalid_assignment_policy');
    }
    seenPlacements.add(placementId);
    return {
      placementId,
      maxAttempts: row.maxAttempts as number | null,
      feedbackRelease: row.feedbackRelease as BookHomeworkSagaAssignmentIntent['policy']['activityPolicies'][number]['feedbackRelease'],
      lateSubmissionAllowed: row.lateSubmissionAllowed,
    };
  });
  const expected = exact(input.expectedPublication, ['publicationId', 'publicationRevision', 'manifestVersionId']);
  if (!Number.isSafeInteger(expected.publicationRevision) || Number(expected.publicationRevision) < 1) {
    throw new BookHomeworkWorkerError('invalid_publication_revision');
  }
  const presentationValue = exactOptional(input.presentation, ['title'], ['description']);
  const title = presentationText(presentationValue.title, 'presentation_title', true) as string;
  const description = presentationText(presentationValue.description, 'presentation_description', false);
  return {
    bookId,
    target,
    schedule: {
      finalDueAt: canonicalIso(scheduleValue.finalDueAt, 'final_due_at'),
      ...(scheduleValue.availableFrom === undefined ? {} : { availableFrom: canonicalIso(scheduleValue.availableFrom, 'available_from') }),
      nodeOverrides,
      ...(studentExtensions === undefined ? {} : { studentExtensions }),
    },
    policy: {
      intent: policyValue.intent,
      integrityCapture: policyValue.integrityCapture,
      integrityOverride: policyValue.integrityOverride,
      activityPolicies,
    },
    expectedPublication: {
      publicationId: safeId(expected.publicationId, 'publication_id'),
      publicationRevision: Number(expected.publicationRevision),
      manifestVersionId: safeId(expected.manifestVersionId, 'publication_manifest_version_id'),
    },
    presentation: {
      title,
      ...(description === undefined ? {} : { description }),
    },
  };
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
    'intent',
    'selectedRecipientIds',
  ]);
  const assignmentId = assignmentRouteId(input.assignmentId);
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
  const manifestVersionId = safeId(input.manifestVersionId, 'manifest_version_id');
  const intent = parseBookHomeworkAssignmentIntent(input.intent);
  if (intent.expectedPublication.manifestVersionId !== manifestVersionId) {
    throw new BookHomeworkWorkerError('manifest_version_mismatch', 409);
  }
  return {
    assignmentId,
    operationId,
    idempotencyKey,
    manifestVersionId,
    intent,
    selectedRecipientIds: recipients(input.selectedRecipientIds),
  };
};

const teacherRole = (value: unknown): boolean => {
  if (!isRecord(value) || value.forceReauth === true) return false;
  if (['blocked', 'inactive', 'suspended'].includes(String(value.status ?? ''))) return false;
  return value.role === 'teacher' || value.role === 'super_admin';
};

export const createBookHomeworkOwnerReader = (
  env: BookHomeworkWorkerEnv,
  ownerId: string,
): ((path: string) => Promise<unknown>) => {
  const injected = env.readDatabaseValue;
  if (typeof injected === 'function') return injected;
  const serviceAccountJson = typeof env.BOOK_HOMEWORK_GOOGLE_SA_KEY === 'string'
    ? env.BOOK_HOMEWORK_GOOGLE_SA_KEY.trim() : '';
  const serviceIdentity = typeof env.BOOK_HOMEWORK_SERVICE_IDENTITY === 'string'
    ? env.BOOK_HOMEWORK_SERVICE_IDENTITY.trim() : '';
  const firebaseProjectId = typeof env.FIREBASE_PROJECT_ID === 'string'
    ? env.FIREBASE_PROJECT_ID.trim() : '';
  const firebaseWebApiKey = typeof env.FIREBASE_WEB_API_KEY === 'string'
    ? env.FIREBASE_WEB_API_KEY.trim() : '';
  if (!serviceAccountJson || !serviceIdentity || !firebaseProjectId || !firebaseWebApiKey) {
    throw new BookHomeworkWorkerError('actor_reader_unavailable', 503);
  }
  const fetchImpl = resolveBookHomeworkProductionFetch();
  const tokenProvider = createFirebaseClaimTokenProvider({
    serviceAccountJson,
    serviceIdentity,
    firebaseProjectId,
    firebaseWebApiKey,
    fetchImpl,
  });
  const client = new FirebaseRtdbRestClient({
    env,
    fetchImpl,
    firebaseAuthToken: true,
    getFirebaseAuthToken: () => tokenProvider({ service: 'book_homework', ownerId }),
  });
  return (path) => client.readValue(path);
};

const assertTeacher = async (env: BookHomeworkWorkerEnv, uid: string): Promise<void> => {
  if (!teacherRole(await createBookHomeworkOwnerReader(env, uid)(`users/${uid}`))) {
    throw new BookHomeworkWorkerError('teacher_required', 403);
  }
};

const statusFor = (status: BookHomeworkSagaResult['status']): number => {
  if (status === 'committed') return 200;
  if (status === 'compensated' || status === 'failed_terminal') return 409;
  if (status === 'committed_projection_pending') return 202;
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
  const resolveContextResolver = async (
    env: BookHomeworkWorkerEnv,
  ): Promise<BookHomeworkContextResolverPort | undefined> =>
    options.contextResolver ?? await options.contextResolverFactory?.(env);
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
        assignmentRouteId(input.assignmentId),
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
          if (result.status === 'committed_projection_pending' && result.projectionDiagnostic) {
            console.error('book_homework_committed_projection_pending', {
              assignmentId: result.record.assignmentId,
              operationId: result.record.operationId,
              stage: result.projectionDiagnostic.stage,
              errorClass: result.projectionDiagnostic.errorClass,
            });
          }
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
      if (error instanceof BookHomeworkRuntimeUnavailableError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      if (error instanceof BookHomeworkCanonicalResolverError) {
        return {
          body: { code: `book_homework_${error.code}` },
          init: { status: error.status },
        };
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
      const assignmentId = assignmentRouteId(input.assignmentId);
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
      const assignmentId = assignmentRouteId(input.assignmentId);
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
        let completion: Record<string, unknown> | null = null;
        try {
          const candidate = await resolveCompletionProjection({
            assignmentId,
            studentId: resolution.studentId,
            authority: resolution.completionAuthority,
            delivery: resolution.delivery,
            env: input.env ?? {},
          });
          if (candidate
            && completionMatchesContext(candidate, assignmentId, resolution.studentId, resolution.delivery.record.binding)) {
            completion = candidate;
          }
        } catch {
          // Completion is derived enrichment. Preserve the already-validated
          // committed recipient row, but never expose an untrusted completion.
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

  const homeworkStudentLaunch = async (input: {
    readonly request: Request;
    readonly assignmentId: string;
    readonly uid: string;
    readonly env?: BookHomeworkWorkerEnv;
  }): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    try {
      const assignmentId = assignmentRouteId(input.assignmentId);
      const requestBody = exact(await readBody(input.request), ['placementIds']);
      if (!Array.isArray(requestBody.placementIds)
        || requestBody.placementIds.length < 1
        || requestBody.placementIds.length > 64) {
        throw new BookHomeworkWorkerError('invalid_placement_ids');
      }
      const placementIds = requestBody.placementIds.map((value) => safeId(value, 'placement_id'));
      if (new Set(placementIds).size !== placementIds.length) {
        throw new BookHomeworkWorkerError('duplicate_placement_id');
      }
      const resolver = await resolveContextResolver(input.env ?? {});
      if (!resolver) throw new BookHomeworkWorkerError('book_homework_context_unavailable', 503);
      const contexts = await Promise.all(placementIds.map((placementId) => resolver.resolve({
        assignmentId,
        actorUid: safeId(input.uid, 'student_id'),
        action: { kind: 'student-launch', placementId },
      })));
      if (contexts.some((context) => context === null)) {
        return { body: { code: 'book_homework_launch_denied' }, init: { status: 403 } };
      }
      return {
        body: {
          activities: contexts.map((context) => ({
            activityId: context!.activityId,
            activityVersionId: context!.activityVersionId,
            projection: context!.trustedBookProjection,
          })),
        },
        init: { status: 200, headers: { 'Cache-Control': 'no-store' } },
      };
    } catch (error) {
      if (error instanceof BookHomeworkWorkerError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      if (error instanceof BookHomeworkRuntimeUnavailableError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      return { body: { code: 'book_homework_context_failed' }, init: { status: 503 } };
    }
  };

  return {
    homeworkAssignmentCommand,
    homeworkStudentProjection,
    homeworkTeacherStudentProjection,
    homeworkTeacherProjection,
    homeworkStudentLaunch,
  };
};

export default createBookHomeworkWorkerHandlers;
