import type {
  Notification,
  StructuredNotificationMetadata,
} from '../../../../src/types/notification.types.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import type { NotificationCommand } from './command-schema.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface NotificationCommandRepositoryEnv extends RepositoryEnv {
  NOTIFICATION_COMMAND_SERVICE_IDENTITY?: string;
  NOTIFICATION_COMMAND_GOOGLE_SA_KEY?: string;
}

export interface NotificationCommandWrite {
  readonly operationId: string;
  readonly recipientId: string;
  readonly notification: NotificationCommand['notification'];
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
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
};
const semantic = (value: {
  readonly type: Notification['type'];
  readonly title: string;
  readonly message: string;
  readonly link?: string;
  readonly metadata?: StructuredNotificationMetadata;
}): string => JSON.stringify(canonical({
  type: value.type,
  title: value.title,
  message: value.message,
  ...(value.link === undefined ? {} : { link: value.link }),
  ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
}));
const validStored = (value: unknown, operationId: string): value is StoredNotification => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredNotification>;
  const allowed = new Set(['id', 'type', 'title', 'message', 'read', 'createdAt', 'link', 'metadata']);
  return Object.keys(value).every((key) => allowed.has(key))
    && candidate.id === operationId
    && typeof candidate.type === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.message === 'string'
    && (candidate.read === undefined || typeof candidate.read === 'boolean')
    && typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt);
};

export class InMemoryNotificationCommandRepository implements NotificationCommandRepository {
  private readonly rows = new Map<string, StoredNotification>();

  async create(input: NotificationCommandWrite): Promise<NotificationCommandWriteResult> {
    const key = pathFor(input.recipientId, input.operationId);
    const existing = this.rows.get(key);
    if (existing) {
      return {
        status: semantic(existing) === semantic(input.notification)
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
    env: NotificationCommandRepositoryEnv;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
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
      if (clientEmail !== identity) {
        throw new Error('notification_command_service_identity_mismatch');
      }
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      getAccessToken: options.getAccessToken,
      firebaseAuthToken: Boolean(options.getAccessToken),
    });
  }

  async create(input: NotificationCommandWrite): Promise<NotificationCommandWriteResult> {
    if (!ID.test(input.recipientId)) throw new Error('invalid_notification_recipient');
    if (!UUID.test(input.operationId)) throw new Error('invalid_notification_operation');
    const path = pathFor(input.recipientId, input.operationId);
    const next: StoredNotification = {
      id: input.operationId,
      ...clone(input.notification),
      read: false,
      createdAt: input.now,
    };
    if (await this.rtdb.writeIfMatch(path, next, 'null_etag')) {
      return { status: 'created', notificationId: input.operationId };
    }
    const current = await this.rtdb.readValue(path);
    if (current === null) throw new Error('notification_command_collision_unknown');
    return {
      status: validStored(current, input.operationId)
        && semantic(current) === semantic(input.notification)
        ? 'replayed'
        : 'idempotency-conflict',
      notificationId: input.operationId,
    };
  }
}
