import { FirebaseRtdbRestClient, type FirebaseRtdbQuery } from '../listening-authoring/rtdb.ts';
import type {
  CourseAnnouncementCommand,
  CourseAnnouncementIntent,
  CourseAnnouncementRecord,
} from './course-announcement-action.ts';

type Env = Readonly<Record<string, unknown>>;
const required = (env: Env, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
};
const record = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
};

export const courseAnnouncementProofPayload = (announcement: CourseAnnouncementRecord): string => JSON.stringify(canonical({
  purpose: 'course-announcement-notification-v1',
  id: announcement.id,
  courseId: announcement.courseId,
  courseName: announcement.courseName,
  teacherId: announcement.teacherId,
  teacherName: announcement.teacherName,
  targetClassIds: announcement.targetClassIds,
  title: announcement.title,
  content: announcement.content,
  attachments: announcement.attachments ?? [],
  createdAt: announcement.createdAt,
  sentToStudentIds: announcement.sentToStudentIds,
  eventId: announcement.notificationIntent?.eventId,
  kind: announcement.notificationIntent?.kind,
  intentCourseId: announcement.notificationIntent?.courseId,
  actorUid: announcement.notificationIntent?.actorUid,
  occurredAt: announcement.notificationIntent?.occurredAt,
}));

export interface CourseAnnouncementActionStorage {
  read(path: string): Promise<unknown>;
  enrollmentsForCourse(courseId: string): Promise<unknown>;
  readAnnouncement(announcementId: string): Promise<CourseAnnouncementRecord | null>;
  readIntent(announcementId: string): Promise<{ intent: CourseAnnouncementIntent | null; etag: string }>;
  commit(input: {
    command: CourseAnnouncementCommand;
    actorUid: string;
    record: CourseAnnouncementRecord;
  }): Promise<void>;
  signRecord(announcement: CourseAnnouncementRecord): Promise<string>;
  verifyRecord(announcement: CourseAnnouncementRecord): Promise<boolean>;
  writeIntent(announcementId: string, intent: CourseAnnouncementIntent, etag: string): Promise<boolean>;
  dueAnnouncements(limit: number): Promise<CourseAnnouncementRecord[]>;
  reportFailure(announcement: CourseAnnouncementRecord, intent: CourseAnnouncementIntent, failedRecipientCount: number): Promise<void>;
}

export class FirebaseCourseAnnouncementActionStorage implements CourseAnnouncementActionStorage {
  private readonly admin: FirebaseRtdbRestClient;
  private readonly signingSecret: string;
  private signingKey?: Promise<CryptoKey>;

  constructor(env: Env, fetchImpl: typeof fetch = globalThis.fetch) {
    let serviceAccount: { private_key?: unknown };
    try { serviceAccount = JSON.parse(required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY')) as { private_key?: unknown }; }
    catch { throw new Error('invalid_notification_command_google_sa_key'); }
    if (typeof serviceAccount.private_key !== 'string' || !serviceAccount.private_key.trim()) {
      throw new Error('invalid_notification_command_google_sa_key');
    }
    this.signingSecret = serviceAccount.private_key;
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    }, fetchImpl });
  }

  read(path: string): Promise<unknown> { return this.admin.readValue(path); }

  enrollmentsForCourse(courseId: string): Promise<unknown> {
    const query: FirebaseRtdbQuery = { orderBy: 'courseId', equalTo: courseId };
    return this.admin.readValue('course_enrollments', query);
  }

  async readAnnouncement(announcementId: string): Promise<CourseAnnouncementRecord | null> {
    return record(await this.admin.readValue(`course_announcements/${announcementId}`)) as CourseAnnouncementRecord | null;
  }

  async readIntent(announcementId: string): Promise<{ intent: CourseAnnouncementIntent | null; etag: string }> {
    const result = await this.admin.readWithEtag<CourseAnnouncementIntent | null>(
      `course_announcements/${announcementId}/notificationIntent`,
    );
    return { intent: result.data, etag: result.etag };
  }

  async commit(input: {
    command: CourseAnnouncementCommand;
    actorUid: string;
    record: CourseAnnouncementRecord;
  }): Promise<void> {
    const path = `course_announcements/${input.command.actionId}`;
    const current = await this.admin.readWithEtag<unknown>(path);
    if (current.data !== null) throw new Error('course_announcement_exists');
    if (!await this.admin.writeIfMatch(path, input.record, current.etag)) {
      throw new Error('course_announcement_commit_conflict');
    }
  }

  writeIntent(announcementId: string, intent: CourseAnnouncementIntent, etag: string): Promise<boolean> {
    return this.admin.writeIfMatch(`course_announcements/${announcementId}/notificationIntent`, intent, etag);
  }

  private hmacKey(): Promise<CryptoKey> {
    this.signingKey ??= crypto.subtle.importKey(
      'raw', new TextEncoder().encode(this.signingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
    );
    return this.signingKey;
  }

  async signRecord(announcement: CourseAnnouncementRecord): Promise<string> {
    const signature = await crypto.subtle.sign(
      'HMAC', await this.hmacKey(), new TextEncoder().encode(courseAnnouncementProofPayload(announcement)),
    );
    return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async verifyRecord(announcement: CourseAnnouncementRecord): Promise<boolean> {
    const proof = announcement.notificationIntent?.trustProof;
    if (typeof proof !== 'string' || !/^[0-9a-f]{64}$/u.test(proof)) return false;
    const signature = Uint8Array.from(proof.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
    return crypto.subtle.verify(
      'HMAC', await this.hmacKey(), signature, new TextEncoder().encode(courseAnnouncementProofPayload(announcement)),
    );
  }

  async dueAnnouncements(limit: number): Promise<CourseAnnouncementRecord[]> {
    const rows = await this.admin.readValue('course_announcements', {
      orderBy: 'notificationIntent/dueAt', startAt: 0, limitToFirst: limit,
    });
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return [];
    return Object.values(rows as Record<string, unknown>)
      .map(record)
      .filter((row): row is Record<string, unknown> => Boolean(row)) as CourseAnnouncementRecord[];
  }

  async reportFailure(announcement: CourseAnnouncementRecord, intent: CourseAnnouncementIntent, failedRecipientCount: number): Promise<void> {
    const day = new Date(intent.occurredAt).toISOString().slice(0, 10);
    const path = `reports/errors/${day}/course-announcement-${intent.eventId}`;
    const current = await this.admin.readWithEtag<unknown>(path);
    if (current.data !== null) return;
    await this.admin.writeIfMatch(path, {
      id: `course-announcement-${intent.eventId}`,
      timestamp: Date.now(),
      feature: 'courses',
      severity: 'error',
      message: `Course announcement notification delivery failed; ${failedRecipientCount} recipient(s) remain.`,
      userId: intent.actorUid,
      userName: 'Notification Worker',
      userRole: 'service',
      duplicateCount: 1,
      contextData: {
        actionId: intent.eventId,
        announcementId: announcement.id,
        courseId: intent.courseId,
        failedRecipientCount,
      },
    }, current.etag);
  }
}
