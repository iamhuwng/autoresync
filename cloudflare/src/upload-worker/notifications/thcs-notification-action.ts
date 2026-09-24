import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const DONE_DUE_AT = 8_640_000_000_000_000;
const MAX_RECIPIENTS = 120;
const MAX_RECIPIENTS_PER_INVOCATION = 10;
type Row = Record<string, unknown>;
const row = (value: unknown): Row | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Row : null;

export type ThcsNotificationKind = 'homework-assigned' | 'fully-graded';
export interface ThcsNotificationIntent {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly kind: ThcsNotificationKind;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: 0 | 1 | 2;
  readonly state: 'pending' | 'sending' | 'retry_due' | 'retrying' | 'done' | 'failed';
  readonly recipientIds?: readonly string[];
  readonly deliveredRecipientIds?: readonly string[];
  readonly nextRecipientIndex?: number;
  readonly retryRecipientIds?: readonly string[];
  readonly retryRecipientIndex?: number;
}
export interface ThcsNotificationCommand {
  readonly schemaVersion: 1;
  readonly kind: ThcsNotificationKind;
  readonly authorityRecordId: string;
}
export interface ThcsNotificationStorage {
  readHomework(homeworkId: string): Promise<unknown>;
  readResult(resultId: string): Promise<unknown>;
  readClass(classId: string): Promise<unknown>;
  readUser(userId: string): Promise<unknown>;
  saveIntent(kind: ThcsNotificationKind, recordId: string, intent: ThcsNotificationIntent): Promise<void>;
  dueIntents(now: number, limit: number): Promise<Array<{ kind: ThcsNotificationKind; recordId: string; intent: ThcsNotificationIntent }>>;
  reportFailure(kind: ThcsNotificationKind, recordId: string, intent: ThcsNotificationIntent): Promise<void>;
}

export const parseThcsNotificationAction = async (request: Request): Promise<ThcsNotificationCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('thcs_notification_content_type_required');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1024) throw new Error('thcs_notification_body_too_large');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('thcs_notification_invalid_json'); }
  const command = row(value);
  if (!command || Object.keys(command).sort().join(',') !== 'authorityRecordId,kind,schemaVersion'
    || command.schemaVersion !== 1
    || (command.kind !== 'homework-assigned' && command.kind !== 'fully-graded')
    || typeof command.authorityRecordId !== 'string' || !ID.test(command.authorityRecordId)
    || request.headers.get('Idempotency-Key') !== `${command.kind}:${command.authorityRecordId}`) {
    throw new Error('thcs_notification_invalid');
  }
  return command as unknown as ThcsNotificationCommand;
};

const hash32 = (value: string, seed: number): number => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  return hash;
};
export const thcsNotificationId = (eventId: string, recipientId: string): string => {
  const value = `${eventId}:${recipientId}`;
  const hex = [0, 1, 2, 3].map(seed => hash32(`${value}:${seed}`, seed).toString(16).padStart(8, '0')).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const validIntent = (value: unknown, id: string, kind: ThcsNotificationKind): ThcsNotificationIntent | null => {
  const intent = row(value);
  if (!intent || intent.schemaVersion !== 1 || intent.actionId !== id || intent.kind !== kind
    || !Number.isSafeInteger(intent.occurredAt) || !Number.isSafeInteger(intent.dueAt)
    || ![0, 1, 2].includes(Number(intent.attempts))
    || !['pending', 'sending', 'retry_due', 'retrying', 'done', 'failed'].includes(String(intent.state))) return null;
  if (intent.recipientIds !== undefined && (!Array.isArray(intent.recipientIds)
    || intent.recipientIds.length > MAX_RECIPIENTS
    || intent.recipientIds.some(idValue => typeof idValue !== 'string' || !ID.test(idValue)))) return null;
  if (intent.deliveredRecipientIds !== undefined && (!Array.isArray(intent.deliveredRecipientIds)
    || intent.deliveredRecipientIds.some(idValue => typeof idValue !== 'string' || !ID.test(idValue)))) return null;
  if ((intent.nextRecipientIndex !== undefined && (!Number.isSafeInteger(intent.nextRecipientIndex)
      || Number(intent.nextRecipientIndex) < 0 || Number(intent.nextRecipientIndex) > MAX_RECIPIENTS))
    || (intent.retryRecipientIds !== undefined && (!Array.isArray(intent.retryRecipientIds)
      || intent.retryRecipientIds.some(idValue => typeof idValue !== 'string' || !ID.test(idValue))))
    || (intent.retryRecipientIndex !== undefined && (!Number.isSafeInteger(intent.retryRecipientIndex)
      || Number(intent.retryRecipientIndex) < 0 || Number(intent.retryRecipientIndex) > MAX_RECIPIENTS))) return null;
  return intent as unknown as ThcsNotificationIntent;
};

const recipientsForHomework = async (homework: Row, teacherUid: string, storage: ThcsNotificationStorage): Promise<string[] | null> => {
  const target = row(homework.target);
  if (!target) return null;
  let ids: string[];
  if (target.type === 'class' && typeof target.classId === 'string' && ID.test(target.classId)) {
    const classRecord = row(await storage.readClass(target.classId));
    if (!classRecord || classRecord.createdBy !== teacherUid || !row(classRecord.students)) return null;
    ids = Object.keys(classRecord.students as Row).filter(id => ID.test(id));
  } else if ((target.type === 'students' || target.type === 'group') && Array.isArray(target.studentIds)) {
    ids = target.studentIds.filter((id): id is string => typeof id === 'string' && ID.test(id));
  } else return null;
  const unique = [...new Set(ids)].sort();
  return unique.length > 0 && unique.length <= MAX_RECIPIENTS ? unique : null;
};

const noticeFor = (kind: ThcsNotificationKind, authority: Row, recipientId: string) => {
  if (kind === 'homework-assigned') {
    const id = String(authority.id);
    const title = (typeof authority.title === 'string' && authority.title.trim())
      || (typeof authority.materialTitle === 'string' && authority.materialTitle.trim());
    const dueAt = Number(row(authority.scheduling)?.dueDate);
    if (!title || !Number.isSafeInteger(dueAt)) return null;
    const due = new Date(dueAt).toISOString().slice(0, 10);
    return { recipientId, notification: {
      type: 'info' as const, title: 'New THCS Homework Assigned',
      message: `Your teacher has assigned "${title.slice(0, 160)}". Due: ${due}`,
      link: buildRoute('STUDENT_HOMEWORK_DETAIL', { homeworkId: id }),
    } };
  }
  const resultId = String(authority.resultId);
  const title = typeof authority.testTitle === 'string' && authority.testTitle.trim()
    ? authority.testTitle.trim() : 'your test';
  const score = Number(row(authority.thcsData)?.scaledScore);
  if (!Number.isFinite(score)) return null;
  return { recipientId, notification: {
    type: 'success' as const, title: 'Test Fully Graded',
    message: `All answers in "${title.slice(0, 160)}" have been graded. Your score: ${score}/10.`,
    link: buildRoute('RESULT_DETAIL', { resultId }),
  } };
};

const resolveAuthority = async (kind: ThcsNotificationKind, id: string, actorUid: string, storage: ThcsNotificationStorage) => {
  const authority = row(kind === 'homework-assigned'
    ? await storage.readHomework(id) : await storage.readResult(id));
  const intent = authority && validIntent(authority.notificationIntent, id, kind);
  if (!authority || !intent || authority.id !== id && authority.resultId !== id) return null;
  const actor = row(await storage.readUser(actorUid));
  if (kind === 'homework-assigned') {
    if (authority.materialType !== 'thcs-test' || authority.createdBy !== actorUid || actor?.role !== 'teacher') return null;
  } else if (authority.studentId !== actorUid || actor?.role !== 'student'
    || row(authority.thcsData)?.gradingStatus !== 'fully-graded') return null;
  return { authority, intent };
};

const resolveRecipients = async (kind: ThcsNotificationKind, id: string, actorUid: string,
  authority: Row, intent: ThcsNotificationIntent, storage: ThcsNotificationStorage): Promise<ThcsNotificationIntent | null> => {
  if (intent.recipientIds) return intent;
  if (kind === 'fully-graded') {
    return typeof authority.studentId === 'string' && ID.test(authority.studentId)
      ? { ...intent, recipientIds: [authority.studentId], deliveredRecipientIds: [] }
      : null;
  }
  const recipientIds = kind === 'homework-assigned'
    ? await recipientsForHomework(authority, actorUid, storage) : null;
  if (!recipientIds) return null;
  const first = recipientIds[0];
  const recipient = first ? row(noticeFor(kind, authority, first)) : null;
  if (!recipient) return null;
  const resolved = { ...intent, recipientIds, deliveredRecipientIds: [], nextRecipientIndex: 0 };
  if (kind === 'homework-assigned') await storage.saveIntent(kind, id, resolved);
  return resolved;
};

const deliver = async (kind: ThcsNotificationKind, id: string, actorUid: string,
  authority: Row, intent: ThcsNotificationIntent, storage: ThcsNotificationStorage,
  repository: NotificationCommandRepository, now: number): Promise<ThcsNotificationIntent> => {
  const withRecipients = await resolveRecipients(kind, id, actorUid, authority, intent, storage);
  if (!withRecipients?.recipientIds) return { ...intent, state: 'failed', dueAt: DONE_DUE_AT };
  if (kind === 'fully-graded') {
    const notice = noticeFor(kind, authority, withRecipients.recipientIds[0]!);
    if (!notice) return { ...intent, state: 'failed', dueAt: DONE_DUE_AT };
    try {
      const result = await repository.create({
        operationId: thcsNotificationId(`${kind}:${id}`, withRecipients.recipientIds[0]!),
        recipientId: withRecipients.recipientIds[0]!,
        notification: notice.notification,
        now: intent.occurredAt,
      });
      if (result.status !== 'idempotency-conflict') return { ...intent, state: 'done', dueAt: DONE_DUE_AT };
    } catch { /* The saved result intent remains due for its one retry. */ }
    return intent.attempts >= 2
      ? { ...intent, attempts: 2, state: 'failed', dueAt: DONE_DUE_AT }
      : { ...intent, attempts: 1, state: 'retry_due', dueAt: now + RETRY_DELAY_MS };
  }
  const delivered = new Set(withRecipients.deliveredRecipientIds ?? []);
  const retryPhase = withRecipients.attempts >= 1;
  const candidates = retryPhase
    ? (withRecipients.retryRecipientIds ?? [])
    : withRecipients.recipientIds;
  let cursor = retryPhase ? (withRecipients.retryRecipientIndex ?? 0) : (withRecipients.nextRecipientIndex ?? 0);
  const end = Math.min(cursor + MAX_RECIPIENTS_PER_INVOCATION, candidates.length);
  for (; cursor < end; cursor += 1) {
    const recipientId = candidates[cursor]!;
    if (!retryPhase && delivered.has(recipientId)) continue;
    const notice = noticeFor(kind, authority, recipientId);
    if (!notice) continue;
    try {
      const result = await repository.create({
        operationId: thcsNotificationId(`${kind}:${id}`, recipientId), recipientId,
        notification: notice.notification, now: withRecipients.occurredAt,
      });
      if (result.status !== 'idempotency-conflict') delivered.add(recipientId);
    } catch { /* Persist the bounded cursor; a later pass gets the one permitted retry. */ }
  }
  const remainingInitial = !retryPhase && cursor < candidates.length;
  if (remainingInitial) return {
    ...withRecipients, nextRecipientIndex: cursor, deliveredRecipientIds: [...delivered].sort(),
    state: 'pending', dueAt: now + 60_000,
  };
  if (retryPhase) {
    if (cursor < candidates.length) return {
      ...withRecipients, retryRecipientIndex: cursor, deliveredRecipientIds: [...delivered].sort(),
      attempts: 2, state: 'retrying', dueAt: now + 60_000,
    };
    const complete = delivered.size === withRecipients.recipientIds.length;
    return { ...withRecipients, deliveredRecipientIds: [...delivered].sort(), attempts: 2,
      state: complete ? 'done' : 'failed', dueAt: DONE_DUE_AT };
  }
  const complete = delivered.size === withRecipients.recipientIds.length;
  if (complete) return { ...withRecipients, deliveredRecipientIds: [...delivered].sort(), state: 'done', dueAt: DONE_DUE_AT };
  const retryRecipientIds = withRecipients.recipientIds.filter(recipientId => !delivered.has(recipientId));
  return { ...withRecipients, deliveredRecipientIds: [...delivered].sort(), retryRecipientIds,
    retryRecipientIndex: 0, attempts: 1, state: 'retry_due', dueAt: now + RETRY_DELAY_MS };
};

export const performThcsNotificationAction = async (input: {
  readonly command: ThcsNotificationCommand;
  readonly actorUid: string;
  readonly storage: ThcsNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<{ status: number; body: Row }> => {
  const now = input.now ?? Date.now;
  const { command, storage } = input;
  const resolved = await resolveAuthority(command.kind, command.authorityRecordId, input.actorUid, storage);
  if (!resolved) return { status: 403, body: { code: 'thcs_notification_authority_invalid' } };
  const { authority, intent } = resolved;
  if (intent.state === 'done') return { status: 200, body: { status: 'replayed', notificationStatus: 'delivered' } };
  if (intent.attempts !== 0 || !['pending', 'sending'].includes(intent.state)) {
    return { status: 200, body: { status: 'replayed', notificationStatus: intent.state } };
  }
  const sending: ThcsNotificationIntent = { ...intent, state: 'sending', dueAt: now() };
  await storage.saveIntent(command.kind, command.authorityRecordId, sending);
  const result = await deliver(command.kind, command.authorityRecordId, input.actorUid, authority,
    sending, storage, input.repository, now());
  await storage.saveIntent(command.kind, command.authorityRecordId, result);
  if (result.state === 'failed') await storage.reportFailure(command.kind, command.authorityRecordId, result);
  return { status: 200, body: { status: 'committed', notificationStatus: result.state } };
};

export const retryDueThcsNotifications = async (input: {
  readonly storage: ThcsNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<void> => {
  const now = input.now ?? Date.now;
  for (const item of await input.storage.dueIntents(now(), 1)) {
    const resolved = await resolveAuthority(item.kind, item.recordId,
      item.kind === 'homework-assigned' ? String(row(await input.storage.readHomework(item.recordId))?.createdBy ?? '')
        : String(row(await input.storage.readResult(item.recordId))?.studentId ?? ''), input.storage);
    if (!resolved || item.intent.attempts >= 2 && item.intent.state !== 'retrying') {
      await input.storage.reportFailure(item.kind, item.recordId, item.intent);
      await input.storage.saveIntent(item.kind, item.recordId, { ...item.intent, state: 'failed', dueAt: DONE_DUE_AT });
      continue;
    }
    const previous = item.intent.attempts === 0
      ? { ...item.intent, state: 'sending' as const }
      : { ...item.intent, attempts: 2 as const, state: 'retrying' as const };
    const result = await deliver(item.kind, item.recordId, String(resolved.authority.studentId ?? resolved.authority.createdBy),
      resolved.authority, previous, input.storage, input.repository, now());
    const terminal = result.state === 'failed';
    if (result.state === 'failed' || terminal) await input.storage.reportFailure(item.kind, item.recordId, result);
    await input.storage.saveIntent(item.kind, item.recordId, terminal
      ? { ...result, state: 'failed', dueAt: DONE_DUE_AT }
      : result);
    if (result.state === 'retry_due' || result.state === 'pending' || result.state === 'retrying') break;
  }
};
