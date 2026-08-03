import { buildRoute } from '../../../../src/constants/routes.ts';
import {
  parseNotificationMetadata,
} from '../../../../src/services/notificationMetadata.ts';
import type {
  BookNotificationMetadata,
  NotificationType,
} from '../../../../src/types/notification.types.ts';
import type { NotificationCommand } from './command-schema.ts';
import type { NotificationCommandRepository } from './repository.ts';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RECIPIENTS = 30;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'info',
  'success',
  'warning',
  'error',
  'feedback',
  'homework_reminder',
];

export interface BookNotificationActionIdentity {
  readonly actionId: string;
  readonly authority: {
    readonly kind: 'book-homework-assignment';
    readonly recordId: string;
  };
}

export interface BookCommittedRecipientBoundary {
  readonly source: 'committed-action';
  readonly recipientIds: readonly string[];
}

export interface BookCommittedNotificationAction extends BookNotificationActionIdentity {
  readonly schemaVersion: 1;
  readonly committedAt: string;
  readonly commitState: 'committed';
  readonly affectedRecipientBoundary: BookCommittedRecipientBoundary;
  readonly notification: NotificationCommand['notification'] & {
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
   * Re-reads the durable action from its stable identity. The returned action,
   * rather than caller or browser data, is the only recipient/content source.
   */
  readonly resolveCommittedAction: (
    identity: BookNotificationActionIdentity,
  ) => BookCommittedNotificationAction | null
    | Promise<BookCommittedNotificationAction | null>;
  readonly resolveDestination: (
    input: BookNotificationDestinationContext,
  ) => string | null | Promise<string | null>;
  readonly now?: () => number;
  readonly enabled?: boolean | (
    (env?: BookNotificationEmissionEnvironment) => boolean
  );
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

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean => Object.keys(value).every((key) => allowed.includes(key));

const isSafeId = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_ID.test(value);

const canonicalTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const canonical = new Date(parsed).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
};

const identityMatches = (
  action: BookCommittedNotificationAction,
  identity: BookNotificationActionIdentity,
): boolean => action.actionId === identity.actionId
  && action.authority.kind === identity.authority.kind
  && action.authority.recordId === identity.authority.recordId;

const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string'
  && value.length > 0
  && value.length <= max
  && value.trim() === value
  && !CONTROL_CHARACTER.test(value);

const assertIdentity = (
  identity: BookNotificationActionIdentity,
): void => {
  if (!identity || typeof identity !== 'object'
    || !isSafeId(identity.actionId)
    || !identity.authority
    || typeof identity.authority !== 'object'
    || identity.authority.kind !== 'book-homework-assignment'
    || !isSafeId(identity.authority.recordId)) {
    throw new BookNotificationEmissionError(
      'book_notification_action_identity_invalid',
    );
  }
};

const assertAction = (
  action: BookCommittedNotificationAction,
  identity: BookNotificationActionIdentity,
): BookNotificationMetadata => {
  if (!action || typeof action !== 'object'
    || action.schemaVersion !== 1
    || action.commitState !== 'committed'
    || !canonicalTimestamp(action.committedAt)
    || !action.authority
    || typeof action.authority !== 'object'
    || action.authority.kind !== 'book-homework-assignment'
    || !isSafeId(action.authority.recordId)
    || !identityMatches(action, identity)) {
    throw new BookNotificationEmissionError(
      'book_notification_action_not_committed',
    );
  }
  if (!action.affectedRecipientBoundary
    || typeof action.affectedRecipientBoundary !== 'object'
    || action.affectedRecipientBoundary.source !== 'committed-action'
    || !Array.isArray(action.affectedRecipientBoundary.recipientIds)) {
    throw new BookNotificationEmissionError(
      'book_notification_recipient_boundary_untrusted',
    );
  }
  const recipientIds = action.affectedRecipientBoundary.recipientIds;
  if (recipientIds.length > MAX_RECIPIENTS
    || new Set(recipientIds).size !== recipientIds.length
    || recipientIds.some((recipientId) => !isSafeId(recipientId))) {
    throw new BookNotificationEmissionError(
      'book_notification_recipient_invalid',
    );
  }
  if (!action.notification
    || typeof action.notification !== 'object'
    || Array.isArray(action.notification)) {
    throw new BookNotificationEmissionError('book_notification_type_invalid');
  }
  const notification = action.notification as unknown as Record<string, unknown>;
  if (!hasOnlyKeys(notification, [
    'type',
    'title',
    'message',
    'link',
    'metadata',
  ])
    || typeof notification.type !== 'string'
    || !NOTIFICATION_TYPES.includes(notification.type as NotificationType)) {
    throw new BookNotificationEmissionError('book_notification_type_invalid');
  }
  if (!boundedText(notification.title, 120)
    || !boundedText(notification.message, 1000)) {
    throw new BookNotificationEmissionError(
      'book_notification_content_invalid',
    );
  }
  if (notification.link !== undefined
    && typeof notification.link !== 'string') {
    throw new BookNotificationEmissionError(
      'book_notification_destination_invalid',
    );
  }
  const parsed = parseNotificationMetadata(notification.metadata);
  if (parsed.kind !== 'book'
    || parsed.metadata.contextType !== 'book-homework'
    || parsed.metadata.contextId !== identity.authority.recordId
    || parsed.metadata.updateActionId !== identity.actionId) {
    throw new BookNotificationEmissionError(
      'book_notification_metadata_invalid',
    );
  }
  return parsed.metadata;
};

const expectedDestination = (
  metadata: BookNotificationMetadata,
): string => buildRoute('STUDENT_HOMEWORK_DETAIL', {
  homeworkId: metadata.contextId,
});

const destinationFor = async (
  options: BookNotificationEmitterOptions,
  action: BookCommittedNotificationAction,
  recipientId: string,
  metadata: BookNotificationMetadata,
): Promise<string> => {
  const candidate = await options.resolveDestination({
    action,
    recipientId,
  });
  const expected = expectedDestination(metadata);
  if (candidate !== expected
    || (action.notification.link !== undefined
      && action.notification.link !== candidate)) {
    throw new BookNotificationEmissionError(
      'book_notification_destination_invalid',
    );
  }
  return candidate;
};

const bytesToUuid = (bytes: Uint8Array): string => [
  [...bytes.slice(0, 4)],
  [...bytes.slice(4, 6)],
  [...bytes.slice(6, 8)],
  [...bytes.slice(8, 10)],
  [...bytes.slice(10, 16)],
].map((part) => part
  .map((value) => value.toString(16).padStart(2, '0'))
  .join(''))
  .join('-');

export const deterministicBookNotificationId = async (
  identity: BookNotificationActionIdentity & { readonly recipientId: string },
): Promise<string> => {
  assertIdentity(identity);
  if (!isSafeId(identity.recipientId)) {
    throw new BookNotificationEmissionError(
      'book_notification_recipient_invalid',
    );
  }
  const value = [
    'book-notification-v1',
    identity.authority.kind,
    identity.authority.recordId,
    identity.actionId,
    identity.recipientId,
  ].join('\u001f');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytesToUuid(bytes);
};

export const isBookNotificationEmissionEnabled = (
  setting: BookNotificationEmitterOptions['enabled'],
  env?: BookNotificationEmissionEnvironment,
): boolean => {
  if (env?.BOOK_NOTIFICATIONS_EMISSION_ENABLED === false
    || env?.BOOK_NOTIFICATIONS_EMISSION_ENABLED === 'false') {
    return false;
  }
  if (typeof setting === 'function') return setting(env);
  if (typeof setting === 'boolean') return setting;
  return env?.BOOK_NOTIFICATIONS_EMISSION_ENABLED === true
    || env?.BOOK_NOTIFICATIONS_EMISSION_ENABLED === 'true';
};

export const createBookNotificationEmitter = (
  options: BookNotificationEmitterOptions,
) => ({
  async emit(
    identity: BookNotificationActionIdentity,
    context: BookNotificationEmissionContext = {},
  ): Promise<BookNotificationEmissionResult> {
    if (!isBookNotificationEmissionEnabled(options.enabled, context.env)) {
      return {
        status: 'disabled',
        created: 0,
        replayed: 0,
        notificationIds: [],
      };
    }
    assertIdentity(identity);
    const action = await options.resolveCommittedAction(identity);
    if (!action) {
      throw new BookNotificationEmissionError('book_notification_action_stale');
    }
    const metadata = assertAction(action, identity);
    const recipientIds = [
      ...action.affectedRecipientBoundary.recipientIds,
    ].sort();
    if (recipientIds.length === 0) {
      return {
        status: 'empty',
        created: 0,
        replayed: 0,
        notificationIds: [],
      };
    }

    const destinations = new Map<string, string>();
    for (const recipientId of recipientIds) {
      destinations.set(
        recipientId,
        await destinationFor(options, action, recipientId, metadata),
      );
    }

    let created = 0;
    let replayed = 0;
    const notificationIds: string[] = [];
    for (const recipientId of recipientIds) {
      const operationId = await deterministicBookNotificationId({
        ...identity,
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
        throw new BookNotificationEmissionError(
          'book_notification_idempotency_conflict',
        );
      }
      if (result.status === 'created') created += 1;
      if (result.status === 'replayed') replayed += 1;
      notificationIds.push(result.notificationId);
    }
    return {
      status: 'emitted',
      created,
      replayed,
      notificationIds,
    };
  },
});
