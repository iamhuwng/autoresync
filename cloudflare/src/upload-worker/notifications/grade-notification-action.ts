import type { NotificationCommandRepository } from './repository.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const DONE_DUE_AT = 8_640_000_000_000_000;
type Row = Record<string, unknown>;
const row = (value: unknown): Row | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Row : null;

export interface ManualGradeCommand {
  readonly schemaVersion: 1;
  readonly actionType: 'manual-question-grade';
  readonly eventId: string;
  readonly sessionCode: string;
  readonly studentId: string;
  readonly questionNumber: number;
  readonly pointsEarned: number;
  readonly feedback: string;
}

export interface GradeNotificationIntent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly kind: 'individual-question-graded';
  readonly sessionCode: string;
  readonly studentId: string;
  readonly actorUid: string;
  readonly testTitle: string;
  readonly questionNumber: number;
  readonly pointsEarned: number;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: 1 | 2;
  readonly state: 'sending' | 'retry_due' | 'retrying' | 'done' | 'failed';
}

export interface GradeNotificationStorage {
  readSession(sessionCode: string): Promise<unknown>;
  readTest(testId: string): Promise<unknown>;
  readUser(userId: string): Promise<unknown>;
  readIntent(eventId: string): Promise<GradeNotificationIntent | null>;
  commitManualGrade(input: {
    readonly command: ManualGradeCommand;
    readonly intent: GradeNotificationIntent;
    readonly questionResult: Row;
  }): Promise<void>;
  updateIntent(intent: GradeNotificationIntent): Promise<void>;
  dueIntents(now: number, limit: number): Promise<GradeNotificationIntent[]>;
  claimRetry(eventId: string, now: number): Promise<GradeNotificationIntent | null>;
  reportFailure(intent: GradeNotificationIntent, now: number): Promise<void>;
}

export const parseManualGradeCommand = async (request: Request): Promise<ManualGradeCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('grade_notification_content_type_required');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 2048) throw new Error('grade_notification_body_too_large');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('grade_notification_invalid_json'); }
  const command = row(value);
  const expected = 'actionType,eventId,feedback,pointsEarned,questionNumber,schemaVersion,sessionCode,studentId';
  if (!command || Object.keys(command).sort().join(',') !== expected
    || command.schemaVersion !== 1 || command.actionType !== 'manual-question-grade'
    || typeof command.eventId !== 'string' || !UUID.test(command.eventId)
    || typeof command.sessionCode !== 'string' || !ID.test(command.sessionCode)
    || typeof command.studentId !== 'string' || !ID.test(command.studentId)
    || !Number.isSafeInteger(command.questionNumber) || Number(command.questionNumber) < 1 || Number(command.questionNumber) > 500
    || typeof command.pointsEarned !== 'number' || !Number.isFinite(command.pointsEarned) || command.pointsEarned < 0 || command.pointsEarned > 100
    || typeof command.feedback !== 'string' || command.feedback.length > 2000
    || request.headers.get('Idempotency-Key') !== command.eventId) {
    throw new Error('grade_notification_invalid');
  }
  return command as unknown as ManualGradeCommand;
};

const intentMatchesCommand = (intent: GradeNotificationIntent, command: ManualGradeCommand, actorUid: string): boolean =>
  intent.eventId === command.eventId && intent.sessionCode === command.sessionCode
  && intent.studentId === command.studentId && intent.actorUid === actorUid
  && intent.questionNumber === command.questionNumber && intent.pointsEarned === command.pointsEarned;

const resolveAuthority = async (command: ManualGradeCommand, actorUid: string, storage: GradeNotificationStorage) => {
  const [sessionValue, actorValue, studentValue] = await Promise.all([
    storage.readSession(command.sessionCode), storage.readUser(actorUid), storage.readUser(command.studentId),
  ]);
  const session = row(sessionValue);
  const actor = row(actorValue);
  const student = row(studentValue);
  if (!session || !actor || actor.role !== 'teacher'
    || (session.createdByUserId !== actorUid && session.createdBy !== actorUid)
    || student?.role !== 'student'
    || typeof session.testId !== 'string' || !ID.test(session.testId)) return null;
  const results = row(session.results);
  const studentResult = row(results?.[command.studentId]);
  const questionResults = row(studentResult?.questionResults);
  const question = row(questionResults?.[String(command.questionNumber)]);
  if (!studentResult || !question || typeof question.studentAnswer !== 'string'
    || !Number.isFinite(question.pointsMax) || Number(command.pointsEarned) > Number(question.pointsMax)) return null;
  const test = row(await storage.readTest(session.testId));
  if (!test || test.testType !== 'THCS-THPT') return null;
  const testTitle = typeof test.title === 'string' && test.title.trim()
    ? test.title.trim() : typeof row(test.metadata)?.title === 'string' && String(row(test.metadata)?.title).trim()
      ? String(row(test.metadata)?.title).trim() : session.testId;
  return { session, question, testTitle: testTitle.slice(0, 160) };
};

const notificationFor = (intent: GradeNotificationIntent) => ({
  type: 'success' as const,
  title: 'Grade Updated',
  message: `Your answer for Q${intent.questionNumber} in "${intent.testTitle}" has been graded: ${intent.pointsEarned} points.`,
});

const deliver = async (intent: GradeNotificationIntent, repository: NotificationCommandRepository, now: number) => {
  try {
    const result = await repository.create({
      operationId: intent.eventId,
      recipientId: intent.studentId,
      notification: notificationFor(intent),
      now: intent.occurredAt,
    });
    return result.status === 'idempotency-conflict' ? 'retry_due' as const : 'done' as const;
  } catch {
    return 'retry_due' as const;
  }
};

export const performManualGradeAction = async (input: {
  readonly command: ManualGradeCommand;
  readonly actorUid: string;
  readonly storage: GradeNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<{ status: number; body: Row }> => {
  const { command, actorUid, storage } = input;
  const existing = await storage.readIntent(command.eventId);
  if (existing) {
    if (!intentMatchesCommand(existing, command, actorUid)) return { status: 409, body: { code: 'grade_notification_event_conflict' } };
    return { status: 200, body: { status: 'replayed', eventId: command.eventId, notificationStatus: existing.state } };
  }

  const authority = await resolveAuthority(command, actorUid, storage);
  if (!authority) return { status: 403, body: { code: 'grade_notification_authority_invalid' } };
  const now = input.now ?? Date.now;
  const occurredAt = now();
  const questionResult: Row = {
    ...authority.question,
    pointsEarned: command.pointsEarned,
    isCorrect: command.pointsEarned > 0,
    writingResult: {
      ...row(authority.question.writingResult),
      teacherScore: command.pointsEarned,
      teacherFeedback: command.feedback || null,
      gradingTier: 'teacher-graded',
    },
  };
  const intent: GradeNotificationIntent = {
    schemaVersion: 1, eventId: command.eventId, kind: 'individual-question-graded',
    sessionCode: command.sessionCode, studentId: command.studentId, actorUid,
    testTitle: authority.testTitle, questionNumber: command.questionNumber,
    pointsEarned: command.pointsEarned, occurredAt, dueAt: occurredAt + RETRY_DELAY_MS,
    attempts: 1, state: 'sending',
  };
  try {
    await storage.commitManualGrade({ command, intent, questionResult });
  } catch {
    const committed = await storage.readIntent(command.eventId);
    if (!committed || !intentMatchesCommand(committed, command, actorUid)) {
      return { status: 409, body: { code: 'grade_notification_commit_failed' } };
    }
  }

  const delivery = await deliver(intent, input.repository, occurredAt);
  const finalIntent = delivery === 'done'
    ? { ...intent, state: 'done' as const, dueAt: DONE_DUE_AT }
    : { ...intent, state: 'retry_due' as const, dueAt: occurredAt + RETRY_DELAY_MS };
  await storage.updateIntent(finalIntent);
  return { status: 200, body: {
    status: 'committed', eventId: command.eventId,
    notificationStatus: delivery === 'done' ? 'delivered' : 'retry_due',
  } };
};

export const retryDueGradeNotifications = async (input: {
  readonly storage: GradeNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<void> => {
  const now = input.now ?? Date.now;
  for (const due of await input.storage.dueIntents(now(), 2)) {
    if (!(due.attempts === 0 && ['pending', 'sending'].includes(due.state)
      || due.attempts === 1 && due.state === 'retry_due'
      || due.attempts === 2 && due.state === 'retrying')) continue;
    const claimed = await input.storage.claimRetry(due.eventId, now());
    if (!claimed) continue;
    const delivery = await deliver(claimed, input.repository, now());
    if (delivery === 'done') {
      await input.storage.updateIntent({ ...claimed, state: 'done', dueAt: DONE_DUE_AT });
    } else {
      const failed = { ...claimed, state: 'failed' as const, dueAt: DONE_DUE_AT };
      await input.storage.reportFailure(failed, now());
      await input.storage.updateIntent(failed);
    }
  }
};
