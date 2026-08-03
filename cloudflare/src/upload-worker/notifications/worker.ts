import {
  NotificationCommandSchemaError,
  readNotificationCommand,
  type NotificationCommand,
} from './command-schema.ts';
import type { NotificationCommandRepository } from './repository.ts';

export interface NotificationRecipientAuthorityResolver {
  (input: {
    readonly actorUid: string;
    readonly producerFamily: NotificationCommand['producerFamily'];
    readonly authority: NotificationCommand['authority'];
    readonly requestedRecipientId: string;
    readonly env: Record<string, unknown>;
  }): Promise<string | null>;
}

export const createNotificationCommandWorkerHandlers = (options: {
  readonly repository?: NotificationCommandRepository;
  readonly resolveRecipientAuthority?: NotificationRecipientAuthorityResolver;
  readonly now?: () => number;
} = {}) => ({
  command: async (input: {
    readonly request: Request;
    readonly env: Record<string, unknown>;
    readonly uid: string;
  }) => {
    const json = (body: Record<string, unknown>, status: number) => ({ body, init: { status } });
    try {
      if (!input.uid) return json({ code: 'notification_command_unauthenticated' }, 401);
      if (!options.repository || !options.resolveRecipientAuthority) {
        return json({ code: 'notification_command_unavailable' }, 503);
      }
      const command = await readNotificationCommand(input.request);
      const recipientId = await options.resolveRecipientAuthority({
        actorUid: input.uid,
        producerFamily: command.producerFamily,
        authority: command.authority,
        requestedRecipientId: command.recipientId,
        env: input.env,
      });
      if (!recipientId || recipientId !== command.recipientId) {
        return json({ code: 'notification_command_recipient_forbidden' }, 403);
      }
      const result = await options.repository.create({
        operationId: command.operationId,
        recipientId,
        notification: command.notification,
        now: (options.now ?? Date.now)(),
      });
      return json({
        status: result.status,
        operationId: command.operationId,
        notificationId: result.notificationId,
      }, result.status === 'idempotency-conflict' ? 409 : 200);
    } catch (error) {
      if (error instanceof NotificationCommandSchemaError) return json({ code: error.code }, error.status);
      return json({ code: 'notification_command_failed' }, 500);
    }
  },
});
