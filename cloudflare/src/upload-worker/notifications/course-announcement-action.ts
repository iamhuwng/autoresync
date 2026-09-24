import { buildRoute } from '../../../../src/constants/routes.ts';
import { createFirebaseVerifier } from '../firebase-verification.js';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import {
  FirebaseCourseAnnouncementActionStorage,
  type CourseAnnouncementActionStorage,
} from './course-announcement-action-store.ts';

const ACTION_PATH = '/course-announcements/actions';
const ALLOWED_ORIGINS = new Set(['https://kahut1.web.app', 'http://localhost:5173', 'http://localhost:5174']);
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const MAX_DUE_PER_PASS = 1;
const MAX_RECIPIENTS = 1_000;
const MAX_DELIVERIES_PER_PASS = 10;
const DONE_DUE_AT = 8_640_000_000_000_000;
export const COURSE_ANNOUNCEMENT_INTENT_DONE_DUE_AT = DONE_DUE_AT;

export interface CourseAnnouncementCommand {
  readonly schemaVersion: 1;
  readonly actionType: 'create-course-announcement';
  readonly actionId: string;
  readonly courseId: string;
  readonly targetClassIds: readonly string[];
  readonly title: string;
  readonly content: string;
  readonly attachments?: readonly {
    readonly name: string;
    readonly url: string;
    readonly type: string;
    readonly size: number;
  }[];
}

export interface CourseAnnouncementIntent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly kind: 'course-announcement-created';
  readonly courseId: string;
  readonly actorUid: string;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: 0 | 1 | 2;
  readonly state: 'due' | 'sending' | 'retry_due' | 'retrying' | 'done' | 'failed';
  readonly cursor: number;
  readonly failedRecipientIds: readonly string[];
  readonly retryCursor: number;
  readonly retryRecipientIds: readonly string[];
  readonly finalFailedRecipientIds: readonly string[];
  readonly batchRecipientIds?: readonly string[];
  readonly trustProof?: string;
}

export interface CourseAnnouncementRecord {
  readonly id: string;
  readonly courseId: string;
  readonly courseName: string;
  readonly teacherId: string;
  readonly teacherName: string;
  readonly targetClassIds: readonly string[];
  readonly title: string;
  readonly content: string;
  readonly attachments?: CourseAnnouncementCommand['attachments'];
  readonly createdAt: number;
  readonly sentToStudentIds: readonly string[];
  readonly notificationIntent?: CourseAnnouncementIntent;
}

type Env = Readonly<Record<string, unknown>>;
type FirebaseVerifier = ReturnType<typeof createFirebaseVerifier>;
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean } };

const record = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);
const required = (env: Env, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
};
const response = (request: Request, body: Record<string, unknown>, status: number): Response => {
  const headers = new Headers({
    'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  }
  return new Response(JSON.stringify(body), { status, headers });
};

const validAttachments = (value: unknown): value is NonNullable<CourseAnnouncementCommand['attachments']> => (
  Array.isArray(value) && value.length <= 20 && value.every((entry) => {
    const attachment = record(entry);
    return Boolean(attachment
      && Object.keys(attachment).sort().join(',') === 'name,size,type,url'
      && typeof attachment.name === 'string' && attachment.name.trim().length > 0 && attachment.name.length <= 200
      && typeof attachment.url === 'string' && attachment.url.length <= 2048
      && typeof attachment.type === 'string' && attachment.type.length <= 120
      && Number.isSafeInteger(attachment.size) && (attachment.size as number) >= 0);
  })
);

export const parseCourseAnnouncementAction = async (request: Request): Promise<CourseAnnouncementCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('content_type_required');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 65_536) throw new Error('course_announcement_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('course_announcement_invalid_json'); }
  const value = record(parsed);
  const keys = value ? Object.keys(value).sort().join(',') : '';
  const expected = value && Object.hasOwn(value, 'attachments')
    ? 'actionId,actionType,attachments,content,courseId,schemaVersion,targetClassIds,title'
    : 'actionId,actionType,content,courseId,schemaVersion,targetClassIds,title';
  if (!value || keys !== expected || value.schemaVersion !== 1
    || value.actionType !== 'create-course-announcement'
    || typeof value.actionId !== 'string' || !UUID.test(value.actionId)
    || request.headers.get('Idempotency-Key') !== value.actionId
    || typeof value.courseId !== 'string' || !ID.test(value.courseId)
    || !Array.isArray(value.targetClassIds) || value.targetClassIds.length > 100
    || !value.targetClassIds.every((id) => typeof id === 'string' && ID.test(id))
    || new Set(value.targetClassIds).size !== value.targetClassIds.length
    || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200
    || typeof value.content !== 'string' || !value.content.trim() || value.content.length > 60_000
    || (Object.hasOwn(value, 'attachments') && !validAttachments(value.attachments))) {
    throw new Error('course_announcement_invalid');
  }
  return value as unknown as CourseAnnouncementCommand;
};

const deterministicId = (key: string): string => {
  const hash = (value: string, seed: number): number => {
    let result = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619) >>> 0;
    return result;
  };
  const hex = [0, 1, 2, 3].map((seed) => hash(`${key}:${seed}`, seed).toString(16).padStart(8, '0')).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const teacherName = (user: Record<string, unknown>, actorUid: string): string => {
  for (const value of [user.displayName, user.name, user.fullName]) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 100);
  }
  return actorUid;
};

const preview = (html: string): string => html
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
  .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/giu, ' ')
  .replace(/<[^>]*>/gu, '')
  .replace(/&nbsp;|&#160;/giu, ' ')
  .replace(/&amp;/giu, '&')
  .replace(/&lt;/giu, '<')
  .replace(/&gt;/giu, '>')
  .replace(/&quot;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/\s+/gu, ' ')
  .trim()
  .slice(0, 200);

export const courseAnnouncementNotice = (announcement: CourseAnnouncementRecord) => {
  const excerpt = preview(announcement.content);
  return {
    type: 'info' as const,
    title: `📢 ${announcement.courseName}: ${announcement.title}`.slice(0, 300),
    message: `${excerpt}${excerpt.length === 200 ? '…' : ''}`,
    link: buildRoute('STUDENT_COURSE_DETAIL', { courseId: announcement.courseId }),
  };
};

const eventIdForRecipient = (eventId: string, recipientId: string): string => deterministicId(`${eventId}:${recipientId}`);

const recipientsFor = (command: CourseAnnouncementCommand, enrollments: unknown): string[] => {
  if (!enrollments || typeof enrollments !== 'object' || Array.isArray(enrollments)) return [];
  const selectedClasses = new Set(command.targetClassIds);
  return [...new Set(Object.values(enrollments as Record<string, unknown>).flatMap((value) => {
    const enrollment = record(value);
    if (!enrollment || enrollment.courseId !== command.courseId || enrollment.status !== 'active'
      || typeof enrollment.studentId !== 'string' || !ID.test(enrollment.studentId)) return [];
    if (selectedClasses.size && (typeof enrollment.sourceClassId !== 'string' || !selectedClasses.has(enrollment.sourceClassId))) return [];
    return [enrollment.studentId];
  }))].sort();
};

const sameCommand = (announcement: CourseAnnouncementRecord, command: CourseAnnouncementCommand, actorUid: string): boolean => (
  announcement.id === command.actionId && announcement.courseId === command.courseId
  && announcement.teacherId === actorUid && announcement.title === command.title
  && announcement.content === command.content
  && JSON.stringify(announcement.targetClassIds) === JSON.stringify(command.targetClassIds)
  && JSON.stringify(announcement.attachments ?? []) === JSON.stringify(command.attachments ?? [])
);

const validIntent = (announcement: CourseAnnouncementRecord): CourseAnnouncementIntent | null => {
  if (!Array.isArray(announcement.sentToStudentIds)) return null;
  const intent = record(announcement.notificationIntent);
  if (!intent || intent.schemaVersion !== 1 || intent.eventId !== announcement.id
    || intent.kind !== 'course-announcement-created' || intent.courseId !== announcement.courseId
    || intent.actorUid !== announcement.teacherId || typeof intent.occurredAt !== 'number'
    || typeof intent.dueAt !== 'number' || ![0, 1, 2].includes(intent.attempts as number)
    || !Number.isSafeInteger(intent.cursor) || (intent.cursor as number) < 0
    || (intent.cursor as number) > announcement.sentToStudentIds.length
    || !Number.isSafeInteger(intent.retryCursor) || (intent.retryCursor as number) < 0
    || !Array.isArray(intent.failedRecipientIds) || !Array.isArray(intent.retryRecipientIds)
    || !Array.isArray(intent.finalFailedRecipientIds)
    || (intent.batchRecipientIds !== undefined && (!Array.isArray(intent.batchRecipientIds)
      || intent.batchRecipientIds.length > MAX_DELIVERIES_PER_PASS))
    || !['due', 'sending', 'retry_due', 'retrying', 'done', 'failed'].includes(String(intent.state))) return null;
  return intent as unknown as CourseAnnouncementIntent;
};

const authoritativeAnnouncement = (announcement: CourseAnnouncementRecord): boolean => (
  ID.test(announcement.id) && ID.test(announcement.courseId) && ID.test(announcement.teacherId)
  && typeof announcement.courseName === 'string' && typeof announcement.teacherName === 'string'
  && typeof announcement.title === 'string' && typeof announcement.content === 'string'
  && typeof announcement.createdAt === 'number'
  && Array.isArray(announcement.sentToStudentIds) && announcement.sentToStudentIds.length > 0
  && announcement.sentToStudentIds.length <= MAX_RECIPIENTS
  && announcement.sentToStudentIds.every((id) => typeof id === 'string' && ID.test(id))
  && new Set(announcement.sentToStudentIds).size === announcement.sentToStudentIds.length
);

const terminal = (intent: CourseAnnouncementIntent): CourseAnnouncementIntent => ({
  ...intent,
  dueAt: DONE_DUE_AT,
});

const markWith = async (
  storage: CourseAnnouncementActionStorage,
  announcementId: string,
  allowed: (intent: CourseAnnouncementIntent) => boolean,
  next: (intent: CourseAnnouncementIntent) => CourseAnnouncementIntent,
): Promise<CourseAnnouncementIntent | null> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await storage.readIntent(announcementId);
    if (!current.intent || !allowed(current.intent)) return null;
    const updated = next(current.intent);
    if (await storage.writeIntent(announcementId, updated, current.etag)) return updated;
  }
  return null;
};

export const deliverCourseAnnouncement = async (
  announcement: CourseAnnouncementRecord,
  repository: NotificationCommandRepository,
  recipientIds: readonly string[] = announcement.sentToStudentIds,
): Promise<{ delivered: boolean; failedRecipientIds: string[]; backendFailure: boolean }> => {
  if (!authoritativeAnnouncement(announcement) || !validIntent(announcement)) {
    return { delivered: false, failedRecipientIds: [...recipientIds], backendFailure: false };
  }
  const notice = courseAnnouncementNotice(announcement);
  if (recipientIds.length > MAX_DELIVERIES_PER_PASS
    || recipientIds.some((recipientId) => !announcement.sentToStudentIds.includes(recipientId))) {
    return { delivered: false, failedRecipientIds: [...recipientIds], backendFailure: false };
  }
  for (let index = 0; index < recipientIds.length; index += 1) {
    const recipientId = recipientIds[index];
    try {
      const result = await repository.create({
        operationId: eventIdForRecipient(announcement.id, recipientId),
        recipientId,
        notification: notice,
        now: announcement.createdAt,
      });
      if (result.status === 'idempotency-conflict') {
        return { delivered: false, failedRecipientIds: recipientIds.slice(index), backendFailure: false };
      }
    } catch {
      return { delivered: false, failedRecipientIds: recipientIds.slice(index), backendFailure: true };
    }
  }
  return { delivered: true, failedRecipientIds: [], backendFailure: false };
};

export const createCourseAnnouncementHandlers = (options: {
  readonly storage: CourseAnnouncementActionStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}) => {
  const now = options.now ?? Date.now;

  const completeBatch = async (
    announcement: CourseAnnouncementRecord,
    claimed: CourseAnnouncementIntent,
    failedRecipientIds: readonly string[],
  ): Promise<boolean> => {
    const isInitial = claimed.state === 'sending';
    const batch = claimed.batchRecipientIds ?? [];
    const terminalRetryFailures = !isInitial
      && claimed.retryCursor + batch.length >= claimed.retryRecipientIds.length
      ? [...new Set([...claimed.finalFailedRecipientIds, ...failedRecipientIds])]
      : [];
    if (terminalRetryFailures.length) {
      await options.storage.reportFailure(announcement, terminal(claimed), terminalRetryFailures.length);
    }
    const updated = await markWith(options.storage, announcement.id,
      (current) => current.state === claimed.state && current.attempts === claimed.attempts
        && current.cursor === claimed.cursor && current.retryCursor === claimed.retryCursor
        && JSON.stringify(current.batchRecipientIds) === JSON.stringify(batch),
      (current) => {
        const failed = isInitial
          ? [...new Set([...current.failedRecipientIds, ...failedRecipientIds])]
          : current.failedRecipientIds;
        const nextCursor = isInitial ? current.cursor + batch.length : current.cursor;
        const nextRetryCursor = isInitial ? current.retryCursor : current.retryCursor + batch.length;
        const finalFailed = isInitial
          ? current.finalFailedRecipientIds
          : [...new Set([...current.finalFailedRecipientIds, ...failedRecipientIds])];
        if (isInitial && nextCursor < announcement.sentToStudentIds.length) {
          return { ...current, cursor: nextCursor, failedRecipientIds: failed, batchRecipientIds: undefined, state: 'due', dueAt: now() };
        }
        if (isInitial && failed.length) {
          return {
            ...current, cursor: nextCursor, failedRecipientIds: failed, retryRecipientIds: failed,
            retryCursor: 0, batchRecipientIds: undefined, state: 'retry_due', dueAt: now() + RETRY_DELAY_MS,
          };
        }
        if (isInitial) return { ...terminal(current), cursor: nextCursor, batchRecipientIds: undefined, state: 'done' };
        if (nextRetryCursor < current.retryRecipientIds.length) {
          return {
            ...current, retryCursor: nextRetryCursor, finalFailedRecipientIds: finalFailed,
            batchRecipientIds: undefined, state: 'retry_due', dueAt: now(),
          };
        }
        return { ...terminal(current), retryCursor: nextRetryCursor, finalFailedRecipientIds: finalFailed,
          batchRecipientIds: undefined, state: finalFailed.length ? 'failed' : 'done' };
      });
    if (!updated) throw new Error('course_announcement_intent_update_failed');
    return failedRecipientIds.length === 0;
  };

  const attempt = async (announcement: CourseAnnouncementRecord, intent: CourseAnnouncementIntent): Promise<boolean> => {
    const batch = intent.batchRecipientIds ?? [];
    const result = await deliverCourseAnnouncement({ ...announcement, notificationIntent: intent }, options.repository, batch);
    return completeBatch(announcement, intent, result.failedRecipientIds);
  };

  const claimBatch = async (announcement: CourseAnnouncementRecord, retry: boolean): Promise<CourseAnnouncementIntent | null> =>
    markWith(options.storage, announcement.id,
      (current) => current.dueAt <= now() && (retry
        ? current.state === 'retry_due' && current.attempts >= 1 && current.retryCursor < current.retryRecipientIds.length
        : current.state === 'due' && current.cursor < announcement.sentToStudentIds.length),
      (current) => {
        const ids = retry ? current.retryRecipientIds : announcement.sentToStudentIds;
        const offset = retry ? current.retryCursor : current.cursor;
        return {
          ...current,
          state: retry ? 'retrying' : 'sending',
          attempts: retry ? 2 : 1,
          batchRecipientIds: ids.slice(offset, offset + MAX_DELIVERIES_PER_PASS),
          dueAt: now() + LEASE_MS,
        };
      });

  const recoverLease = async (announcement: CourseAnnouncementRecord, intent: CourseAnnouncementIntent): Promise<void> => {
    const batch = intent.batchRecipientIds ?? [];
    const failed: string[] = [];
    for (const recipientId of batch) {
      if (!options.repository.exists
        || !await options.repository.exists(recipientId, eventIdForRecipient(intent.eventId, recipientId))) failed.push(recipientId);
    }
    await completeBatch(announcement, intent, failed);
  };

  const dispatch = async (command: CourseAnnouncementCommand, actorUid: string): Promise<{
    status: number; body: Record<string, unknown>;
  }> => {
    const existing = await options.storage.readAnnouncement(command.actionId);
    if (existing) {
      const intent = validIntent(existing);
      if (!intent || intent.actorUid !== actorUid || !sameCommand(existing, command, actorUid)
        || !await options.storage.verifyRecord(existing)) {
        return { status: 409, body: { code: 'course_announcement_action_conflict' } };
      }
      if (intent.state === 'due' && intent.dueAt <= now()) {
        const claimed = await claimBatch(existing, false);
        if (claimed) {
          try { await attempt(existing, claimed); } catch { /* The saved lease remains eligible for recovery. */ }
        }
      }
      const current = await options.storage.readIntent(existing.id);
      return { status: 200, body: {
        status: 'replayed', announcementId: existing.id,
        notificationStatus: current.intent?.state ?? 'failed',
        notificationIds: existing.sentToStudentIds.map((recipientId) => eventIdForRecipient(existing.id, recipientId)),
      } };
    }

    const actor = record(await options.storage.read(`users/${actorUid}`));
    if (!actor || !['teacher', 'super_admin'].includes(String(actor.role))) {
      return { status: 403, body: { code: 'course_announcement_forbidden' } };
    }
    const course = record(await options.storage.read(`courses/${command.courseId}`));
    if (!course || (actor.role !== 'super_admin' && course.ownerId !== actorUid)) {
      return { status: 403, body: { code: 'course_announcement_course_forbidden' } };
    }
    const recipients = recipientsFor(command, await options.storage.enrollmentsForCourse(command.courseId));
    if (!recipients.length) return { status: 409, body: { code: 'course_announcement_no_recipients' } };
    if (recipients.length > MAX_RECIPIENTS) return { status: 413, body: { code: 'course_announcement_roster_too_large' } };
    const at = now();
    const draft: CourseAnnouncementRecord = {
      id: command.actionId,
      courseId: command.courseId,
      courseName: typeof course.name === 'string' && course.name.trim() ? course.name.trim().slice(0, 160) : command.courseId,
      teacherId: actorUid,
      teacherName: teacherName(actor, actorUid),
      targetClassIds: [...command.targetClassIds],
      title: command.title,
      content: command.content,
      ...(command.attachments === undefined ? {} : { attachments: command.attachments.map((item) => ({ ...item })) }),
      createdAt: at,
      sentToStudentIds: recipients,
      notificationIntent: {
        schemaVersion: 1,
        eventId: command.actionId,
        kind: 'course-announcement-created',
        courseId: command.courseId,
        actorUid,
        occurredAt: at,
        dueAt: at,
        attempts: 0,
        state: 'due',
        cursor: 0,
        failedRecipientIds: [],
        retryCursor: 0,
        retryRecipientIds: [],
        finalFailedRecipientIds: [],
      },
    };
    const announcement: CourseAnnouncementRecord = {
      ...draft,
      notificationIntent: { ...draft.notificationIntent!, trustProof: await options.storage.signRecord(draft) },
    };
    try {
      await options.storage.commit({ command, actorUid, record: announcement });
    } catch {
      const committed = await options.storage.readAnnouncement(command.actionId);
      const intent = committed && validIntent(committed);
      if (!committed || !intent || intent.actorUid !== actorUid || !sameCommand(committed, command, actorUid)
        || !await options.storage.verifyRecord(committed)) {
        return { status: 409, body: { code: 'course_announcement_commit_failed' } };
      }
      return { status: 200, body: {
        status: 'replayed', announcementId: committed.id, notificationStatus: intent.state,
        notificationIds: committed.sentToStudentIds.map((recipientId) => eventIdForRecipient(committed.id, recipientId)),
      } };
    }
    const claimed = await claimBatch(announcement, false);
    if (claimed) {
      try { await attempt(announcement, claimed); } catch { /* The committed announcement remains successful and recoverable. */ }
    }
    const current = await options.storage.readIntent(announcement.id);
    return { status: 200, body: {
      status: 'committed', announcementId: announcement.id,
      notificationStatus: current.intent?.state ?? 'retry_due',
      notificationIds: recipients.map((recipientId) => eventIdForRecipient(announcement.id, recipientId)),
    } };
  };

  const runRetryBatch = async (): Promise<{ processed: number }> => {
    const due = await options.storage.dueAnnouncements(MAX_DUE_PER_PASS);
    let processed = 0;
    for (const announcement of due) {
      if (!authoritativeAnnouncement(announcement) || !await options.storage.verifyRecord(announcement)) continue;
      const current = await options.storage.readIntent(announcement.id);
      const intent = current.intent;
      if (!intent || intent.dueAt > now() || intent.state === 'done' || intent.state === 'failed') continue;
      if (intent.state === 'sending' || intent.state === 'retrying') {
        await recoverLease(announcement, intent);
        processed += 1;
        continue;
      }
      const retry = intent.state === 'retry_due';
      if (intent.state !== 'due' && !retry) continue;
      const claimed = await claimBatch(announcement, retry);
      if (!claimed) continue;
      const delivered = await attempt(announcement, claimed);
      processed += 1;
      if (!delivered) break;
    }
    return { processed };
  };

  return { dispatch, runRetryBatch };
};

export const performCourseAnnouncementAction = async (input: {
  readonly command: CourseAnnouncementCommand;
  readonly actorUid: string;
  readonly storage: CourseAnnouncementActionStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<{ status: number; body: Record<string, unknown> }> => createCourseAnnouncementHandlers(input).dispatch(input.command, input.actorUid);

export const retryDueCourseAnnouncementNotifications = async (
  env: Env,
  now = Date.now(),
): Promise<{ processed: number }> => createCourseAnnouncementHandlers({
  storage: new FirebaseCourseAnnouncementActionStorage(env),
  repository: new FirebaseRestNotificationCommandRepository({
    env: env as NotificationCommandRepositoryEnv,
  }),
  now: () => now,
}).runRetryBatch();

export const createCourseAnnouncementNotificationWorker = (options: {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly storageFactory?: (env: Env) => CourseAnnouncementActionStorage;
  readonly repositoryFactory?: (env: Env) => NotificationCommandRepository;
  readonly now?: () => number;
} = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseCourseAnnouncementActionStorage(env));
  const repositoryFactory = options.repositoryFactory ?? ((env) => new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    } as NotificationCommandRepositoryEnv,
  }));
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) return response(request, { code: 'course_announcement_not_found' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) return response(request, { code: 'course_announcement_unauthenticated' }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiter || typeof limiter.limit !== 'function') return response(request, { code: 'notification_command_unavailable' }, 503);
      if (!(await limiter.limit({ key: `course-announcement:${auth.uid}` })).success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const command = await parseCourseAnnouncementAction(request);
        const result = await performCourseAnnouncementAction({
          command, actorUid: auth.uid, storage: storageFactory(env), repository: repositoryFactory(env), now: options.now,
        });
        return response(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && (error.message === 'content_type_required' || error.message.startsWith('course_announcement_'))) {
          return response(request, { code: error.message }, 400);
        }
        return response(request, { code: 'course_announcement_action_failed' }, 500);
      }
    },
  };
};
