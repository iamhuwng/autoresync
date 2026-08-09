import { createBookNotificationEmitter } from '../notifications/book-emitter.ts';
import type { NotificationCommandRepository } from '../notifications/repository.ts';
import { resolveBookUpdateNotificationDestination } from '../../../../src/services/book-delivery/bookUpdateNotification.destination.ts';
import type {
  BookUpdateNotificationEmissionPort,
  BookUpdateNotificationPlan,
} from '../../../../src/services/book-delivery/bookUpdateNotification.types.ts';

const deadlineClass = (plan: BookUpdateNotificationPlan, now: number) => {
  if (!plan.deadlineAt) return 'none' as const;
  return Date.parse(plan.deadlineAt) < now ? 'overdue' as const : 'upcoming' as const;
};

const messageFor = (plan: BookUpdateNotificationPlan): string => (
  plan.deadlineAt
    ? `${plan.actionSummary} Deadline: ${new Date(plan.deadlineAt).toLocaleString('en-US', { timeZone: 'UTC' })}.`
    : plan.actionSummary
);

export const createBookUpdateNotificationEmissionAdapter = (options: {
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
  readonly enabled?: boolean;
}): BookUpdateNotificationEmissionPort => Object.freeze({
  async emit(input: Parameters<BookUpdateNotificationEmissionPort['emit']>[0]) {
    const destination = resolveBookUpdateNotificationDestination(input.plan);
    if (!destination) throw new Error('book_update_notification_destination_invalid');
    const now = options.now?.() ?? Date.now();
    const action = {
      schemaVersion: 1 as const,
      actionId: input.actionId,
      authority: { kind: 'book-homework-assignment' as const, recordId: input.plan.homeworkId },
      committedAt: input.committedAt,
      commitState: 'committed' as const,
      affectedRecipientBoundary: {
        source: 'committed-action' as const,
        recipientIds: [input.plan.recipientId],
      },
      notification: {
        type: 'info' as const,
        title: 'Book activity updated',
        message: messageFor(input.plan),
        link: destination,
        metadata: {
          schemaVersion: 1 as const,
          kind: 'book' as const,
          contextType: 'book-homework' as const,
          contextId: input.plan.homeworkId,
          updateActionId: input.actionId,
          checkpointAvailable: input.plan.checkpointAvailable,
          deadlineClass: deadlineClass(input.plan, now),
          actionClass: input.plan.destinationView === 'previous-version' ? 'review' as const : 'open' as const,
        },
      },
    };
    const emitter = createBookNotificationEmitter({
      repository: options.repository,
      enabled: options.enabled ?? true,
      now: () => now,
      resolveCommittedAction: async () => action,
      resolveDestination: async () => destination,
    });
    const result = await emitter.emit({ actionId: input.actionId, authority: action.authority });
    return { status: result.status, created: result.created, replayed: result.replayed };
  },
});
