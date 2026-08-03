import { buildRoute } from '../../../../src/constants/routes.ts';
import type { BookHomeworkSagaRecord } from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import {
  createBookNotificationEmitter,
  isBookNotificationEmissionEnabled,
  type BookCommittedNotificationAction,
  type BookNotificationActionIdentity,
  type BookNotificationEmissionContext,
  type BookNotificationEmissionResult,
} from '../notifications/book-emitter.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from '../notifications/repository.ts';
import {
  assertValidBookHomeworkSagaRecord,
  type BookHomeworkSagaRepository,
} from './sagaRepository.ts';

const NOTIFICATION_TITLE = 'New Book homework';
const NOTIFICATION_MESSAGE = 'A Book homework assignment is ready.';

export interface BookHomeworkNotificationEnvironment
  extends NotificationCommandRepositoryEnv {
  readonly BOOK_NOTIFICATIONS_EMISSION_ENABLED?: unknown;
}

export interface BookHomeworkCommittedNotificationSource {
  readCommittedAssignment(
    assignmentId: string,
  ): Promise<BookHomeworkSagaRecord | null>;
}

export const resolveCommittedBookHomeworkNotificationAction = async (
  source: Pick<BookHomeworkSagaRepository, 'read'>
    | BookHomeworkCommittedNotificationSource,
  identity: BookNotificationActionIdentity,
): Promise<BookCommittedNotificationAction | null> => {
  if (identity.authority.kind !== 'book-homework-assignment') return null;
  const record = 'readCommittedAssignment' in source
    ? await source.readCommittedAssignment(identity.authority.recordId)
    : await source.read(identity.authority.recordId);
  if (!record) return null;
  assertValidBookHomeworkSagaRecord(record);
  if (record.state !== 'committed'
    || record.visibility !== 'committed'
    || record.committedRecipientCount !== record.recipientCount
    || record.recipients.some((recipient) => recipient.state !== 'committed')
    || record.assignmentId !== identity.authority.recordId
    || record.contextId !== identity.authority.recordId
    || record.operationId !== identity.actionId) {
    return null;
  }
  const link = buildRoute('STUDENT_HOMEWORK_DETAIL', {
    homeworkId: record.contextId,
  });
  return {
    schemaVersion: 1,
    actionId: record.operationId,
    authority: {
      kind: 'book-homework-assignment',
      recordId: record.assignmentId,
    },
    committedAt: record.updatedAt,
    commitState: 'committed',
    affectedRecipientBoundary: {
      source: 'committed-action',
      recipientIds: record.recipients.map((recipient) => recipient.recipientId),
    },
    notification: {
      type: 'info',
      title: NOTIFICATION_TITLE,
      message: NOTIFICATION_MESSAGE,
      link,
      metadata: {
        schemaVersion: 1,
        kind: 'book',
        contextType: 'book-homework',
        contextId: record.contextId,
        updateActionId: record.operationId,
        checkpointAvailable: false,
        deadlineClass: 'none',
        actionClass: 'open',
      },
    },
  };
};

export const resolveBookHomeworkNotificationIdentity = (
  result: { readonly body: unknown },
): BookNotificationActionIdentity | null => {
  if (!result.body || typeof result.body !== 'object'
    || Array.isArray(result.body)) return null;
  const body = result.body as Record<string, unknown>;
  if (body.state !== 'committed'
    || typeof body.assignmentId !== 'string'
    || typeof body.operationId !== 'string') return null;
  return {
    actionId: body.operationId,
    authority: {
      kind: 'book-homework-assignment',
      recordId: body.assignmentId,
    },
  };
};

export const createBookHomeworkNotificationEmitter = (options: {
  readonly source: BookHomeworkCommittedNotificationSource;
  readonly repositoryFactory?: (
    env: BookHomeworkNotificationEnvironment,
  ) => NotificationCommandRepository;
}) => ({
  async emit(
    identity: BookNotificationActionIdentity,
    context: BookNotificationEmissionContext = {},
  ): Promise<BookNotificationEmissionResult> {
    const env = (context.env ?? {}) as BookHomeworkNotificationEnvironment;
    if (!isBookNotificationEmissionEnabled(undefined, env)) {
      return {
        status: 'disabled',
        created: 0,
        replayed: 0,
        notificationIds: [],
      };
    }
    const repository = options.repositoryFactory
      ? options.repositoryFactory(env)
      : new FirebaseRestNotificationCommandRepository({ env });
    return createBookNotificationEmitter({
      repository,
      enabled: true,
      resolveCommittedAction: (actionIdentity) =>
        resolveCommittedBookHomeworkNotificationAction(
          options.source,
          actionIdentity,
        ),
      resolveDestination: ({ action }) => buildRoute(
        'STUDENT_HOMEWORK_DETAIL',
        { homeworkId: action.notification.metadata.contextId },
      ),
    }).emit(identity, context);
  },
});
