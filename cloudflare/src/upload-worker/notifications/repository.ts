import type {
  Notification,
  NotificationType,
  StructuredNotificationMetadata,
} from '../../../../src/types/notification.types.ts';
import { isSafeInternalNotificationPath } from '../../../../src/services/notificationDestinationResolver.ts';
import { parseNotificationMetadata } from '../../../../src/services/notificationMetadata.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';

const MAX_RETRIES = 5;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'info', 'success', 'warning', 'error', 'feedback', 'homework_reminder',
];

export interface NotificationCommandRepositoryEnv extends RepositoryEnv {
  readonly NOTIFICATION_COMMAND_SERVICE_IDENTITY?: string;
  readonly NOTIFICATION_COMMAND_GOOGLE_SA_KEY?: string;
}
export interface NotificationCommandNotification {
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly link?: string;
  readonly metadata?: StructuredNotificationMetadata;
}

export interface NotificationCommandWrite {
  readonly operationId: string;
  readonly recipientId: string;
  readonly notification: NotificationCommandNotification;
  readonly now: number;
}

export interface NotificationCommandWriteResult {
  readonly status: 'created' | 'replayed' | 'idempotency-conflict';
  readonly notificationId: string;
}

export interface NotificationCommandRepository {
  create(input: NotificationCommandWrite): Promise<NotificationCommandWriteResult>;
}

type StoredNotification = Omit<Notification, 'metadata'> & {
  readonly metadata?: StructuredNotificationMetadata;
};

const clone = <T>(value: T): T => structuredClone(value);
const pathFor = (recipientId: string, operationId: string): string =>
  `notifications/${recipientId}/${operationId}`;

const semantic = (value: NotificationCommandNotification | StoredNotification): string => JSON.stringify({
  type: value.type,
  title: value.title,
  message: value.message,
  ...(value.link === undefined ? {} : { link: value.link }),
  ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
});

const validStored = (value: unknown, operationId: string): value is StoredNotification => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredNotification>;
  const allowed = new Set(['id', 'type', 'title', 'message', 'read', 'createdAt', 'link', 'metadata']);
  return Object.keys(value).every((key) => allowed.has(key))
    && candidate.id === operationId
    && typeof candidate.type === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.read === 'boolean'
    && typeof candidate.createdAt === 'number'
    && Number.isFinite(candidate.createdAt);
};

const assertWrite = (input: NotificationCommandWrite): void => {
  if (!UUID.test(input.operationId)) throw new Error('invalid_notification_operation_id');
  if (!SAFE_ID.test(input.recipientId)) throw new Error('invalid_notification_recipient');
  if (!Number.isFinite(input.now)) throw new Error('invalid_notification_timestamp');
  const notification = input.notification as unknown as Record<string, unknown>;
  const allowedKeys = new Set(['type', 'title', 'message', 'link', 'metadata']);
  if (Object.keys(notification).some((key) => !allowedKeys.has(key))) {
    throw new Error('invalid_notification_fields');
  }
  if (typeof notification.type !== 'string'
    || !NOTIFICATION_TYPES.includes(notification.type as NotificationType)) {
    throw new Error('invalid_notification_type');
  }
  const textBounds: readonly (readonly [string, number])[] = [
    ['title', 120],
    ['message', 1000],
  ];
  for (const [key, max] of textBounds) {
    const value = notification[key];
    if (typeof value !== 'string' || value.length < 1 || value.length > max
      || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new Error(`invalid_notification_${key}`);
    }
  }
  if (notification.link !== undefined
    && !isSafeInternalNotificationPath(notification.link)) {
    throw new Error('invalid_notification_link');
  }
  if (notification.metadata !== undefined
    && parseNotificationMetadata(notification.metadata).kind !== 'book') {
    throw new Error('invalid_notification_metadata');
  }
};

export class InMemoryNotificationCommandRepository implements NotificationCommandRepository {
  private readonly rows = new Map<string, StoredNotification>();

  async create(input: NotificationCommandWrite): Promise<NotificationCommandWriteResult> {
    assertWrite(input);
    const key = pathFor(input.recipientId, input.operationId);
    const existing = this.rows.get(key);
    if (existing) {
      return {
        status: validStored(existing, input.operationId)
          && semantic(existing) === semantic(input.notification)
          ? 'replayed'
          : 'idempotency-conflict',
        notificationId: input.operationId,
      };
    }
    this.rows.set(key, {
      id: input.operationId,
      ...clone(input.notification),
      read: false,
      createdAt: input.now,
    });
    return { status: 'created', notificationId: input.operationId };
  }

  snapshot(): Record<string, StoredNotification> {
    return Object.fromEntries([...this.rows].map(([key, value]) => [key, clone(value)]));
  }
}

export class FirebaseRestNotificationCommandRepository implements NotificationCommandRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: NotificationCommandRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.NOTIFICATION_COMMAND_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_notification_command_service_identity');
    const keyJson = options.env.NOTIFICATION_COMMAND_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new Error('missing_notification_command_google_sa_key');
    }
    if (keyJson) {
      let clientEmail: unknown;
      try {
        clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
      } catch {
        throw new Error('invalid_notification_command_google_sa_key');
      }
      if (clientEmail !== identity) throw new Error('notification_command_service_identity_mismatch');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      getAccessToken: options.getAccessToken,
    });
  }

  async create(input: NotificationCommandWrite): Promise<NotificationCommandWriteResult> {
    assertWrite(input);
    const path = pathFor(input.recipientId, input.operationId);
    for (let attempt = 0; attempt < (this.options.maxRetries ?? MAX_RETRIES); attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      if (current.data !== null) {
        return {
          status: validStored(current.data, input.operationId)
            && semantic(current.data) === semantic(input.notification)
            ? 'replayed'
            : 'idempotency-conflict',
          notificationId: input.operationId,
        };
      }
      const next: StoredNotification = {
        id: input.operationId,
        ...clone(input.notification),
        read: false,
        createdAt: input.now,
      };
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) {
        return { status: 'created', notificationId: input.operationId };
      }
    }
    throw new Error('notification_command_cas_retries_exhausted');
  }
}
