import {
  deliverSessionIntentBatch,
} from './session-notification-action.ts';
import {
  FirebaseSessionNotificationActionStorage,
  type SessionNotificationActionStorage,
  type SessionNotificationEvent,
  type SessionNotificationQueueRecord,
} from './session-notification-action-store.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';

type Env = Readonly<Record<string, unknown>>;
const DONE_DUE_AT = 8_640_000_000_000_000;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const eventFor = async (
  queue: SessionNotificationQueueRecord,
  read: (path: string) => Promise<unknown>,
): Promise<SessionNotificationEvent | null> => {
  const session = record(await read(`game_sessions/${queue.sessionCode}`));
  const saved = record(record(session?.notificationEvents)?.[queue.eventId]);
  const event = record(queue.event);
  if (!event || !saved) return null;
  const sameSnapshot = ['eventId', 'kind', 'sessionCode', 'actorUid', 'classId', 'className', 'testId', 'testName', 'occurredAt', 'recipientCount']
    .every((key) => (event[key] ?? null) === (saved[key] ?? null));
  const recipients = record(event.recipients) ?? {};
  const savedRecipients = record(saved.recipients) ?? {};
  return sameSnapshot
    && Object.keys(recipients).sort().join(',') === Object.keys(savedRecipients).sort().join(',')
    && event.eventId === queue.eventId && event.actorUid === queue.actorUid
    && event.sessionCode === queue.sessionCode && event.classId === queue.classId
    && event.occurredAt === queue.occurredAt && event.recipientCount === queue.recipientCount
    && Object.keys(recipients).length === queue.recipientCount
    ? event as unknown as SessionNotificationEvent : null;
};

/** One bounded pass advances at most ten first attempts or ten one-time retries per event. */
export const retryDueSessionNotifications = async (
  env: Env,
  now = Date.now(),
  dependencies: {
    readonly storage?: SessionNotificationActionStorage;
    readonly repository?: NotificationCommandRepository;
  } = {},
): Promise<void> => {
  const storage = dependencies.storage ?? new FirebaseSessionNotificationActionStorage(env);
  const repository = dependencies.repository ?? new FirebaseRestNotificationCommandRepository({ env: env as NotificationCommandRepositoryEnv });
  const read = (path: string) => storage.read(path);
  for (const due of await storage.dueIntents(now, 1)) {
    const initial = due.state === 'initial_due' || due.state === 'initial_processing';
    const claimed = initial ? await storage.claimInitial(due.eventId, now)
      : await storage.claimRetry(due.eventId, now);
    if (!claimed) continue;
    let event: SessionNotificationEvent | null;
    try { event = await eventFor(claimed, read); } catch { break; }
    if (!event) {
      await storage.updateIntent({ ...claimed, state: 'failed', dueAt: DONE_DUE_AT });
      continue;
    }
    const progress = await deliverSessionIntentBatch({ ...claimed, event }, repository, now);
    await storage.updateIntent(progress);
    if (progress.state === 'failed') await storage.reportFailure(event, progress.finalFailedRecipientIds.length, now);
  }
};
