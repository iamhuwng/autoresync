import {
  parseNotificationMetadata,
} from '../../../../src/services/notificationMetadata.ts';
import {
  isSafeInternalNotificationPath,
} from '../../../../src/services/notificationDestinationResolver.ts';
import type {
  BookNotificationMetadata,
  NotificationType,
} from '../../../../src/types/notification.types.ts';
import type {
  NotificationCommandNotification,
  NotificationCommandRepository,
} from './repository.ts';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'info',
  'success',
  'warning',
  'error',
  'feedback',
  'homework_reminder',
];

export interface BookCommittedRecipientBoundary {
  readonly source: 'committed-action';
  readonly recipientIds: readonly string[];
}

export interface BookCommittedNotificationAction {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly committedAt: string;
  readonly commitState: 'committed';
  readonly authority: {
    readonly kind: 'book';
    readonly recordId: string;
  };
  readonly affectedRecipientBoundary: BookCommittedRecipientBoundary;
  readonly notification: NotificationCommandNotification & {
    readonly metadata: BookNotificationMetadata;
  };
}

export interface BookNotificationEmissionEnvironment {
  readonly BOOK_NOTIFICATIONS_EMISSION_ENABLED?: unknown;
}

export interface BookNotificationDestinationContext {
  readonly action: BookCommittedNotificationAction;
  readonly recipientId: string;
}

export interface BookNotificationEmitterOptions {
  readonly repository: NotificationCommandRepository;
  /**
   * Re-reads the originating committed action record and its pinned recipient
   * boundary. The emitter never treats an in-memory action object as proof that
   * the mutation still exists or that its audience may be re-resolved.
   */
  readonly verifyCommittedAction: (
    action: BookCommittedNotificationAction,
  ) => boolean | Promise<boolean>;
  readonly now?: () => number;
  readonly enabled?: boolean | ((env?: BookNotificationEmissionEnvironment) => boolean);
  readonly resolveDestination: (
    input: BookNotificationDestinationContext,
  ) => string | null | Promise<string | null>;
}

export interface BookNotificationEmissionContext {
  readonly env?: BookNotificationEmissionEnvironment;
}

export interface BookNotificationEmissionResult {
  readonly status: 'disabled' | 'empty' | 'emitted';
  readonly created: number;
  readonly replayed: number;
  readonly notificationIds: readonly string[];
}

export class BookNotificationEmissionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookNotificationEmissionError';
  }
}

const canonicalTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
};

const allowedBookDestination = (path: string, metadata: BookNotificationMetadata): boolean => {
  const context = metadata.contextId;
  return metadata.contextType === 'book-homework'
    ? path === `/student/homework/${context}` || path === `/teacher/homework/${context}`
    : path === `/student/practice/${context}` || path === `/teacher/materials/books/${context}`;
};

const bytesToUuid = (bytes: Uint8Array): string => [
  [...bytes.slice(0, 4)],
  [...bytes.slice(4, 6)],
  [...bytes.slice(6, 8)],
  [...bytes.slice(8, 10)],
  [...bytes.slice(10, 16)],
].map((part) => part.map((value) => value.toString(16).padStart(2, '0')).join('')).join('-');

/** Stable UUID-like identity derived only from the committed action and recipient. */
export const deterministicBookNotificationId = async (input: {
  readonly actionId: string;
  readonly recipientId: string;
}): Promise<string> => {
  const value = `book-notification-v1\u001f${input.actionId}\u001f${input.recipientId}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytesToUuid(bytes);
};

const assertNotification = (action: BookCommittedNotificationAction): BookNotificationMetadata => {
  if (!action || typeof action !== 'object') {
    throw new BookNotificationEmissionError('book_notification_action_not_committed');
  }
  if (action.schemaVersion !== 1 || action.commitState !== 'committed'
    || !SAFE_ID.test(action.actionId) || !canonicalTimestamp(action.committedAt)) {
    throw new BookNotificationEmissionError('book_notification_action_not_committed');
  }
  if (!action.authority || typeof action.authority !== 'object'
    || action.authority.kind !== 'book' || !SAFE_ID.test(action.authority.recordId)) {
    throw new BookNotificationEmissionError('book_notification_authority_invalid');
  }
  if (!action.affectedRecipientBoundary || typeof action.affectedRecipientBoundary !== 'object'
    || action.affectedRecipientBoundary.source !== 'committed-action'
    || !Array.isArray(action.affectedRecipientBoundary.recipientIds)) {
    throw new BookNotificationEmissionError('book_notification_recipient_boundary_untrusted');
  }
  const ids = action.affectedRecipientBoundary.recipientIds;
  if (new Set(ids).size !== ids.length || ids.some((id) => !SAFE_ID.test(id))) {
    throw new BookNotificationEmissionError('book_notification_recipient_invalid');
  }
  if (!action.notification || typeof action.notification !== 'object'
    || Array.isArray(action.notification)) {
    throw new BookNotificationEmissionError('book_notification_type_invalid');
  }
  const notification = action.notification as unknown as Record<string, unknown>;
  const allowedNotificationKeys = new Set(['type', 'title', 'message', 'link', 'metadata']);
  if (Object.keys(notification).some((key) => !allowedNotificationKeys.has(key))
    || typeof notification.type !== 'string'
    || !NOTIFICATION_TYPES.includes(notification.type as NotificationType)) {
    throw new BookNotificationEmissionError('book_notification_type_invalid');
  }
  if (typeof notification.title !== 'string' || notification.title.length < 1 || notification.title.length > 120
    || notification.title.trim() !== notification.title
    || /[\u0000-\u001f\u007f]/u.test(notification.title)
    || typeof notification.message !== 'string' || notification.message.length < 1 || notification.message.length > 1000
    || notification.message.trim() !== notification.message
    || /[\u0000-\u001f\u007f]/u.test(notification.message)) {
    throw new BookNotificationEmissionError('book_notification_content_invalid');
  }
  if (notification.link !== undefined && typeof notification.link !== 'string') {
    throw new BookNotificationEmissionError('book_notification_destination_invalid');
  }
  const parsed = parseNotificationMetadata(notification.metadata);
  if (parsed.kind !== 'book' || parsed.metadata.updateActionId !== action.actionId) {
    throw new BookNotificationEmissionError('book_notification_metadata_invalid');
  }
  if (notification.link !== undefined
    && (!isSafeInternalNotificationPath(notification.link)
      || !allowedBookDestination(notification.link, parsed.metadata))) {
    throw new BookNotificationEmissionError('book_notification_destination_invalid');
  }
  return parsed.metadata;
};

const destinationFor = async (
  options: BookNotificationEmitterOptions,
  action: BookCommittedNotificationAction,
  recipientId: string,
): Promise<string> => {
  const candidate = await options.resolveDestination({ action, recipientId });
  if (candidate !== undefined && candidate !== null && isSafeInternalNotificationPath(candidate)
    && allowedBookDestination(candidate, action.notification.metadata)) {
    if (action.notification.link !== undefined && action.notification.link !== candidate) {
      throw new BookNotificationEmissionError('book_notification_destination_invalid');
    }
    return candidate;
  }
  throw new BookNotificationEmissionError('book_notification_destination_invalid');
};

const isEnabled = (
  setting: BookNotificationEmitterOptions['enabled'],
  env: BookNotificationEmissionEnvironment | undefined,
): boolean => {
  if (env?.BOOK_NOTIFICATIONS_EMISSION_ENABLED === false
    || env?.BOOK_NOTIFICATIONS_EMISSION_ENABLED === 'false') return false;
  if (typeof setting === 'function') return setting(env);
  if (typeof setting === 'boolean') return setting;
  return env?.BOOK_NOTIFICATIONS_EMISSION_ENABLED === true
    || env?.BOOK_NOTIFICATIONS_EMISSION_ENABLED === 'true';
};

export const createBookNotificationEmitter = (options: BookNotificationEmitterOptions) => ({
  async emit(
    action: BookCommittedNotificationAction,
    context: BookNotificationEmissionContext = {},
  ): Promise<BookNotificationEmissionResult> {
    if (!isEnabled(options.enabled, context.env)) {
      return {
        status: 'disabled',
        created: 0,
        replayed: 0,
        notificationIds: [],
      };
    }
    if (!await options.verifyCommittedAction(action)) {
      throw new BookNotificationEmissionError('book_notification_action_stale');
    }
    const metadata = assertNotification(action);
    const recipientIds = [...action.affectedRecipientBoundary.recipientIds].sort();
    if (recipientIds.length === 0) {
      return { status: 'empty', created: 0, replayed: 0, notificationIds: [] };
    }

    const destinations = new Map<string, string>();
    for (const recipientId of recipientIds) {
      destinations.set(recipientId, await destinationFor(options, action, recipientId));
    }

    let created = 0;
    let replayed = 0;
    const notificationIds: string[] = [];
    for (const recipientId of recipientIds) {
      const operationId = await deterministicBookNotificationId({
        actionId: action.actionId,
        recipientId,
      });
      const result = await options.repository.create({
        operationId,
        recipientId,
        notification: {
          type: action.notification.type,
          title: action.notification.title,
          message: action.notification.message,
          link: destinations.get(recipientId),
          metadata,
        },
        now: options.now?.() ?? Date.now(),
      });
      if (result.status === 'idempotency-conflict') {
        throw new BookNotificationEmissionError('book_notification_idempotency_conflict');
      }
      if (result.status === 'created') created += 1;
      if (result.status === 'replayed') replayed += 1;
      notificationIds.push(result.notificationId);
    }
    return { status: 'emitted', created, replayed, notificationIds };
  },
});
