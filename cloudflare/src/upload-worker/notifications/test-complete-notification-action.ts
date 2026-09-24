import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const DONE_DUE_AT = 8_640_000_000_000_000;
type Row = Record<string, unknown>;
const row = (value: unknown): Row | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Row : null;

export interface TestCompleteNotificationIntent {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly kind: 'test-completed';
  readonly actorUid: string;
  readonly actorRole: 'student' | 'teacher';
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: 0 | 1 | 2;
  readonly state: 'pending' | 'sending' | 'retry_due' | 'retrying' | 'done' | 'failed';
}

export interface TestCompleteNotificationStorage {
  readResult(resultId: string): Promise<unknown>;
  readUser(userId: string): Promise<unknown>;
  readSession(sessionCode: string): Promise<unknown>;
  saveIntent(resultId: string, intent: TestCompleteNotificationIntent): Promise<void>;
  claimInitial(resultId: string, now: number): Promise<TestCompleteNotificationIntent | null>;
  claimRetry(resultId: string, now: number): Promise<TestCompleteNotificationIntent | null>;
  dueIntents(now: number, limit: number): Promise<Array<{ resultId: string; intent: TestCompleteNotificationIntent }>>;
  reportFailure(resultId: string, intent: TestCompleteNotificationIntent): Promise<void>;
}

export interface TestCompleteNotificationCommand {
  readonly schemaVersion: 1;
  readonly resultId: string;
}

export const parseTestCompleteNotificationAction = async (request: Request): Promise<TestCompleteNotificationCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('test_complete_content_type_required');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1024) throw new Error('test_complete_body_too_large');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('test_complete_invalid_json'); }
  const command = row(value);
  if (!command || Object.keys(command).sort().join(',') !== 'resultId,schemaVersion'
    || command.schemaVersion !== 1 || typeof command.resultId !== 'string' || !ID.test(command.resultId)
    || request.headers.get('Idempotency-Key') !== `test-completed:${command.resultId}`) {
    throw new Error('test_complete_invalid');
  }
  return command as unknown as TestCompleteNotificationCommand;
};

const validIntent = (value: unknown, resultId: string): TestCompleteNotificationIntent | null => {
  const intent = row(value);
  if (!intent || intent.schemaVersion !== 1 || intent.actionId !== resultId || intent.kind !== 'test-completed'
    || typeof intent.actorUid !== 'string' || !ID.test(intent.actorUid)
    || !['student', 'teacher'].includes(String(intent.actorRole))
    || !Number.isSafeInteger(intent.occurredAt) || !Number.isSafeInteger(intent.dueAt)
    || ![0, 1, 2].includes(Number(intent.attempts))
    || !['pending', 'sending', 'retry_due', 'retrying', 'done', 'failed'].includes(String(intent.state))) return null;
  return intent as unknown as TestCompleteNotificationIntent;
};

const resolveAuthority = async (resultId: string, actorUid: string, storage: TestCompleteNotificationStorage) => {
  const result = row(await storage.readResult(resultId));
  const intent = validIntent(result?.testCompleteNotificationIntent, resultId);
  if (!result || result.resultId !== resultId || !intent || result.isGuest === true
    || result.thcsData !== undefined || String(result.testType ?? '').toUpperCase() === 'THCS-THPT') return null;
  const actor = row(await storage.readUser(actorUid));
  if (!actor || intent.actorUid !== actorUid) return null;
  if (intent.actorRole === 'student') {
    if (actor.role !== 'student' || result.studentId !== actorUid) return null;
  } else {
    if (actor.role !== 'teacher' || result.context && row(result.context)?.type !== 'class_session'
      || row(row(result.context)?.configApplied)?.source !== 'teacher_override'
      || result.teacherId !== actorUid || typeof result.sessionCode !== 'string' || !ID.test(result.sessionCode)) return null;
    const session = row(await storage.readSession(result.sessionCode));
    const owner = session?.createdByUserId ?? session?.createdBy ?? session?.teacherId;
    if (owner !== actorUid) return null;
  }
  return { result, intent };
};

export const testCompleteNotificationId = (resultId: string, recipientId: string): string => {
  const value = `${resultId}:${recipientId}`;
  const hashes = [0, 1, 2, 3].map((seed) => {
    let hash = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }).join('');
  const versioned = `${hashes.slice(0, 12)}5${hashes.slice(13, 16)}8${hashes.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const notificationFor = (result: Row, resultId: string, recipientId: string) => {
  if (typeof result.resultId !== 'string' || !result.resultId || result.resultId !== resultId) return null;
  return {
    recipientId,
    notification: {
      type: 'success' as const,
      title: 'Test Complete',
      message: 'Your test result is ready.',
      link: buildRoute('RESULT_DETAIL', { resultId }),
    },
  };
};

const deliver = async (resultId: string, result: Row, intent: TestCompleteNotificationIntent,
  storage: TestCompleteNotificationStorage, repository: NotificationCommandRepository, now: number) => {
  const notice = notificationFor(result, resultId, String(result.studentId ?? ''));
  if (!notice || !ID.test(notice.recipientId)) return { ...intent, state: 'failed' as const, dueAt: DONE_DUE_AT };
  try {
    const response = await repository.create({
      operationId: testCompleteNotificationId(resultId, notice.recipientId),
      recipientId: notice.recipientId,
      notification: notice.notification,
      now: intent.occurredAt,
    });
    if (response.status !== 'idempotency-conflict') return { ...intent, state: 'done' as const, dueAt: DONE_DUE_AT };
  } catch { /* Keep the saved result intent due for its single delayed retry. */ }
  const failed = { ...intent, attempts: intent.attempts === 0 ? 1 as const : intent.attempts,
    state: 'retry_due' as const, dueAt: now + RETRY_DELAY_MS };
  await storage.saveIntent(resultId, failed);
  return failed;
};

export const performTestCompleteNotificationAction = async (input: {
  readonly resultId: string;
  readonly actorUid: string;
  readonly storage: TestCompleteNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const resolved = await resolveAuthority(input.resultId, input.actorUid, input.storage);
  if (!resolved) return { status: 403, body: { code: 'test_complete_forbidden' } };
  if (resolved.intent.state === 'done') return { status: 200, body: { status: 'replayed', resultId: input.resultId } };
  if (resolved.intent.state !== 'pending' || resolved.intent.attempts !== 0) {
    return { status: 200, body: { status: 'committed', resultId: input.resultId } };
  }
  const claimed = await input.storage.claimInitial(input.resultId, (input.now ?? Date.now)());
  if (!claimed) return { status: 200, body: { status: 'committed', resultId: input.resultId } };
  const progress = await deliver(input.resultId, resolved.result, claimed, input.storage, input.repository, (input.now ?? Date.now)());
  await input.storage.saveIntent(input.resultId, progress);
  return { status: 200, body: { status: progress.state === 'done' ? 'delivered' : 'retry_scheduled', resultId: input.resultId } };
};

export const retryDueTestCompleteNotifications = async (input: {
  readonly storage: TestCompleteNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<void> => {
  const now = (input.now ?? Date.now)();
  for (const due of await input.storage.dueIntents(now, 2)) {
    if (due.intent.kind !== 'test-completed'
      || !((due.intent.state === 'retry_due' && due.intent.attempts === 1)
        || (due.intent.state === 'sending' && due.intent.attempts === 0))) continue;
    const claimed = await input.storage.claimRetry(due.resultId, now);
    if (!claimed) continue;
    const resolved = await resolveAuthority(due.resultId, claimed.actorUid, input.storage);
    if (!resolved || resolved.intent.actionId !== claimed.actionId) {
      const failed = { ...claimed, state: 'failed' as const, dueAt: DONE_DUE_AT };
      await input.storage.saveIntent(due.resultId, failed);
      await input.storage.reportFailure(due.resultId, failed);
      continue;
    }
    const progress = await deliver(due.resultId, resolved.result, claimed, input.storage, input.repository, now);
    const final = progress.state === 'retry_due' ? { ...progress, state: 'failed' as const, dueAt: DONE_DUE_AT } : progress;
    await input.storage.saveIntent(due.resultId, final);
    if (final.state === 'failed') await input.storage.reportFailure(due.resultId, final);
  }
};
