import { getAuth } from 'firebase/auth';
import { DEFAULT_NOTIFICATION_WORKER_ORIGIN } from './notificationCommandClient';

export type SessionNotificationKind = 'session-opened' | 'test-started' | 'test-ended';
export interface SessionNotificationEvent {
  readonly eventId: string;
  readonly kind: SessionNotificationKind;
  readonly sessionCode: string;
  readonly actorUid: string;
  readonly classId: string;
  readonly className: string;
  readonly testId: string | null;
  readonly testName: string;
  readonly occurredAt: number;
  readonly recipientCount: number;
  readonly recipients: Readonly<Record<string, true>>;
}
export interface SessionNotificationQueueRecord {
  readonly eventId: string;
  readonly sessionCode: string;
  readonly classId: string;
  readonly actorUid: string;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly recipientCount: number;
  readonly event: SessionNotificationEvent;
  readonly attempts: 1;
  readonly initialCursor: 0;
  readonly retryRecipientIds: readonly string[];
  readonly retryCursor: 0;
  readonly finalFailedRecipientIds: readonly string[];
  readonly state: 'initial_due';
}

const hash32 = (value: string, seed: number): number => {
  let result = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619) >>> 0;
  return result;
};

export const sessionNotificationEventId = (
  kind: SessionNotificationKind,
  sessionCode: string,
  marker: number,
): string => {
  const key = `${kind}:${sessionCode}:${marker}`;
  const hex = [0, 1, 2, 3].map((seed) => hash32(`${key}:${seed}`, seed).toString(16).padStart(8, '0')).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

export const buildSessionNotificationWrites = (input: {
  readonly kind: SessionNotificationKind;
  readonly sessionCode: string;
  readonly actorUid: string;
  readonly classId: string;
  readonly className: string;
  readonly testId?: string | null;
  readonly testName?: string;
  readonly marker: number;
  readonly recipientIds: readonly string[];
}): { readonly event: SessionNotificationEvent; readonly queue: SessionNotificationQueueRecord } => {
  if (!Number.isSafeInteger(input.marker) || input.marker < 0 || !input.classId || !input.sessionCode || !input.actorUid) {
    throw new Error('session_notification_event_invalid');
  }
  const recipientIds = [...new Set(input.recipientIds.filter(Boolean))].sort();
  // The Worker processes at most this many inbox writes for a single intent.
  // Larger classes fail the lifecycle action instead of committing without an intent.
  if (recipientIds.length > 500) throw new Error('session_notification_roster_too_large');
  const eventId = sessionNotificationEventId(input.kind, input.sessionCode, input.marker);
  const recipients = Object.fromEntries(recipientIds.map((id) => [id, true])) as Record<string, true>;
  const event: SessionNotificationEvent = {
    eventId, kind: input.kind, sessionCode: input.sessionCode, actorUid: input.actorUid,
    classId: input.classId, className: input.className.trim().slice(0, 120) || input.classId,
    testId: input.testId ?? null, testName: input.testName?.trim().slice(0, 160) || input.testId || 'Test',
    occurredAt: input.marker, recipientCount: recipientIds.length, recipients,
  };
  return { event, queue: { eventId, sessionCode: input.sessionCode, classId: input.classId, actorUid: input.actorUid,
    occurredAt: input.marker, dueAt: input.marker, recipientCount: recipientIds.length,
    event, attempts: 1, initialCursor: 0, retryRecipientIds: [], retryCursor: 0,
    finalFailedRecipientIds: [], state: 'initial_due' } };
};

export const deliverSessionNotificationNow = async (
  eventId: string,
  options: { readonly workerOrigin?: string; readonly getIdToken?: () => Promise<string>; readonly fetchImpl?: typeof fetch } = {},
): Promise<void> => {
  const user = getAuth().currentUser;
  const token = (await (options.getIdToken ?? (() => user ? user.getIdToken() : Promise.resolve('')))()).trim();
  if (!token) throw new Error('session_notification_unauthenticated');
  const origin = (options.workerOrigin?.trim() || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
    || DEFAULT_NOTIFICATION_WORKER_ORIGIN).replace(/\/+$/u, '');
  const parsed = new URL(origin);
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost'))
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('session_notification_origin_invalid');
  }
  const response = await (options.fetchImpl ?? globalThis.fetch)(`${parsed.origin}/session-notifications/action`, {
    method: 'POST', credentials: 'omit', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': eventId },
    body: JSON.stringify({ schemaVersion: 1, actionType: 'deliver-session-notification', eventId }),
  });
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 4096) throw new Error('session_notification_response_too_large');
  let body: Record<string, unknown>;
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    body = value as Record<string, unknown>;
  } catch { throw new Error('session_notification_response_invalid'); }
  if (!response.ok) throw new Error(typeof body.code === 'string' ? body.code : `http_${response.status}`);
  if ((body.status !== 'committed' && body.status !== 'replayed') || body.eventId !== eventId) {
    throw new Error('session_notification_response_invalid');
  }
};
