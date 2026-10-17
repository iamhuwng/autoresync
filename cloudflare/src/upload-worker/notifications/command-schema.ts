import type {
  NotificationType,
  StructuredNotificationMetadata,
} from '../../../../src/types/notification.types.ts';
import { parseNotificationMetadata } from '../../../../src/services/notificationMetadata.ts';
import {
  NOTIFICATION_COMMAND_PRODUCER_FAMILIES,
  type NotificationCommandProducerFamily,
} from '../../../../src/services/notificationCommandClient.ts';

const MAX_BODY_BYTES = 16 * 1024;
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INTERNAL_PATH = /^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,511}$/u;
const TYPES = new Set<NotificationType>([
  'info', 'success', 'warning', 'error', 'feedback', 'homework_reminder',
]);

export type NotificationProducerFamily = NotificationCommandProducerFamily;
export type NotificationAuthorityKind = NotificationProducerFamily;

export interface NotificationCommand {
  readonly schemaVersion: 1;
  readonly commandType: 'create-notification';
  readonly operationId: string;
  readonly producerFamily: NotificationProducerFamily;
  readonly recipientId: string;
  readonly authority: {
    readonly kind: NotificationAuthorityKind;
    readonly recordId: string;
  };
  readonly notification: {
    readonly type: NotificationType;
    readonly title: string;
    readonly message: string;
    readonly link?: string;
    readonly metadata?: StructuredNotificationMetadata;
  };
}

export class NotificationCommandSchemaError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'NotificationCommandSchemaError';
  }
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const keys = (
  value: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[] = required,
): void => {
  if (required.some((key) => !Object.prototype.propertyIsEnumerable.call(value, key))) {
    throw new NotificationCommandSchemaError('notification_command_missing_field');
  }
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new NotificationCommandSchemaError('notification_command_unknown_field');
  }
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new NotificationCommandSchemaError(code);
  }
  return value;
};

const boundedText = (value: unknown, max: number, code: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new NotificationCommandSchemaError(code);
  }
  return value;
};

export const readNotificationCommand = async (request: Request): Promise<NotificationCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new NotificationCommandSchemaError('content_type_required');
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null
    && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new NotificationCommandSchemaError('notification_command_body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new NotificationCommandSchemaError('notification_command_body_too_large', 413);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new NotificationCommandSchemaError('notification_command_invalid_json');
  }
  const command = record(raw);
  if (!command) throw new NotificationCommandSchemaError('notification_command_invalid');
  keys(command, [
    'schemaVersion',
    'commandType',
    'operationId',
    'producerFamily',
    'recipientId',
    'authority',
    'notification',
  ]);
  if (command.schemaVersion !== 1 || command.commandType !== 'create-notification') {
    throw new NotificationCommandSchemaError('notification_command_unsupported');
  }
  if (typeof command.operationId !== 'string' || !UUID.test(command.operationId)) {
    throw new NotificationCommandSchemaError('notification_command_invalid_operation');
  }
  if (request.headers.get('Idempotency-Key') !== command.operationId) {
    throw new NotificationCommandSchemaError('notification_command_idempotency_mismatch');
  }
  if (typeof command.producerFamily !== 'string'
    || !(NOTIFICATION_COMMAND_PRODUCER_FAMILIES as readonly string[]).includes(command.producerFamily)) {
    throw new NotificationCommandSchemaError('notification_command_invalid_producer');
  }
  const authority = record(command.authority);
  if (!authority) throw new NotificationCommandSchemaError('notification_command_invalid_authority');
  keys(authority, ['kind', 'recordId']);
  if (authority.kind !== command.producerFamily) {
    throw new NotificationCommandSchemaError('notification_command_authority_mismatch');
  }
  const notification = record(command.notification);
  if (!notification) throw new NotificationCommandSchemaError('notification_command_invalid_content');
  keys(notification, ['type', 'title', 'message'], ['type', 'title', 'message', 'link', 'metadata']);
  if (typeof notification.type !== 'string' || !TYPES.has(notification.type as NotificationType)) {
    throw new NotificationCommandSchemaError('notification_command_invalid_type');
  }
  if (notification.link !== undefined
    && (typeof notification.link !== 'string' || !INTERNAL_PATH.test(notification.link)
      || notification.link.includes('..'))) {
    throw new NotificationCommandSchemaError('notification_command_invalid_link');
  }
  let metadata: StructuredNotificationMetadata | undefined;
  if (notification.metadata !== undefined) {
    const parsed = parseNotificationMetadata(notification.metadata);
    if (parsed.kind !== 'book') {
      throw new NotificationCommandSchemaError('notification_command_invalid_metadata');
    }
    metadata = parsed.metadata;
  }
  return {
    schemaVersion: 1,
    commandType: 'create-notification',
    operationId: command.operationId,
    producerFamily: command.producerFamily as NotificationProducerFamily,
    recipientId: id(command.recipientId, 'notification_command_invalid_recipient'),
    authority: {
      kind: command.producerFamily as NotificationAuthorityKind,
      recordId: id(authority.recordId, 'notification_command_invalid_authority'),
    },
    notification: {
      type: notification.type as NotificationType,
      title: boundedText(notification.title, 120, 'notification_command_invalid_title'),
      message: boundedText(notification.message, 1000, 'notification_command_invalid_message'),
      ...(notification.link === undefined ? {} : { link: notification.link }),
      ...(metadata === undefined ? {} : { metadata }),
    },
  };
};
