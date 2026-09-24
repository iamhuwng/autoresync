import { describe, expect, it } from 'vitest';
import {
  createCourseAnnouncementHandlers,
  deliverCourseAnnouncement,
  parseCourseAnnouncementAction,
  type CourseAnnouncementCommand,
  type CourseAnnouncementIntent,
  type CourseAnnouncementRecord,
} from '../src/upload-worker/notifications/course-announcement-action.ts';
import { FirebaseCourseAnnouncementActionStorage, type CourseAnnouncementActionStorage } from '../src/upload-worker/notifications/course-announcement-action-store.ts';
import { InMemoryNotificationCommandRepository, type NotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

const eventId = '11111111-1111-4111-8111-111111111111';
const command: CourseAnnouncementCommand = {
  schemaVersion: 1,
  actionType: 'create-course-announcement',
  actionId: eventId,
  courseId: 'course-1',
  targetClassIds: ['class-1'],
  title: 'Exam moved',
  content: '<p>Exam moved to <strong>Friday</strong>.</p><script>private()</script>',
};

class MemoryStorage implements CourseAnnouncementActionStorage {
  readonly rows = new Map<string, unknown>();
  readonly reports: unknown[] = [];
  private version = 0;

  constructor() {
    this.rows.set('users/teacher-1', { role: 'teacher', displayName: 'Ms Teacher' });
    this.rows.set('courses/course-1', { ownerId: 'teacher-1', name: 'English' });
    this.rows.set('course_enrollments', {
      e1: { courseId: 'course-1', studentId: 'student-2', status: 'active', sourceClassId: 'class-1' },
      e2: { courseId: 'course-1', studentId: 'student-1', status: 'active', sourceClassId: 'class-1' },
      e3: { courseId: 'course-1', studentId: 'student-3', status: 'active', sourceClassId: 'class-2' },
      e4: { courseId: 'other-course', studentId: 'student-4', status: 'active', sourceClassId: 'class-1' },
      e5: { courseId: 'course-1', studentId: 'student-5', status: 'expired', sourceClassId: 'class-1' },
    });
  }

  async read(path: string): Promise<unknown> { return this.rows.get(path) ?? null; }
  async enrollmentsForCourse(): Promise<unknown> { return this.rows.get('course_enrollments'); }
  async readAnnouncement(id: string): Promise<CourseAnnouncementRecord | null> {
    return (this.rows.get(`course_announcements/${id}`) as CourseAnnouncementRecord | undefined) ?? null;
  }
  async readIntent(id: string): Promise<{ intent: CourseAnnouncementIntent | null; etag: string }> {
    const row = this.rows.get(`course_announcements/${id}`) as CourseAnnouncementRecord | undefined;
    return { intent: row?.notificationIntent ?? null, etag: String(this.version) };
  }
  async commit(input: { command: CourseAnnouncementCommand; actorUid: string; record: CourseAnnouncementRecord }): Promise<void> {
    this.rows.set(`course_announcements/${input.command.actionId}`, structuredClone(input.record));
    this.version += 1;
  }
  async signRecord(): Promise<string> { return 'a'.repeat(64); }
  async verifyRecord(announcement: CourseAnnouncementRecord): Promise<boolean> {
    return announcement.notificationIntent?.trustProof === 'a'.repeat(64);
  }
  async writeIntent(id: string, intent: CourseAnnouncementIntent, etag: string): Promise<boolean> {
    if (etag !== String(this.version)) return false;
    const path = `course_announcements/${id}`;
    const row = this.rows.get(path) as CourseAnnouncementRecord | undefined;
    if (!row) return false;
    this.rows.set(path, { ...row, notificationIntent: structuredClone(intent) });
    this.version += 1;
    return true;
  }
  async dueAnnouncements(limit: number): Promise<CourseAnnouncementRecord[]> {
    return [...this.rows.entries()]
      .filter(([path]) => path.startsWith('course_announcements/'))
      .map(([, row]) => row as CourseAnnouncementRecord)
      .filter((row) => row.notificationIntent && row.notificationIntent.dueAt < 8_640_000_000_000_000)
      .sort((a, b) => a.notificationIntent!.dueAt - b.notificationIntent!.dueAt)
      .slice(0, limit);
  }
  async reportFailure(_announcement: CourseAnnouncementRecord, intent: CourseAnnouncementIntent, count: number): Promise<void> {
    this.reports.push({ eventId: intent.eventId, count });
  }
}

describe('course announcement notification action', () => {
  it('creates an owner-authenticated announcement with the server enrollment snapshot', async () => {
    const storage = new MemoryStorage();
    const repository = new InMemoryNotificationCommandRepository();
    const result = await createCourseAnnouncementHandlers({ storage, repository, now: () => 1000 })
      .dispatch(command, 'teacher-1');
    expect(result).toMatchObject({ status: 200, body: { status: 'committed', announcementId: eventId, notificationStatus: 'done' } });
    expect(storage.rows.get(`course_announcements/${eventId}`)).toMatchObject({
      id: eventId,
      courseName: 'English',
      teacherId: 'teacher-1',
      teacherName: 'Ms Teacher',
      sentToStudentIds: ['student-1', 'student-2'],
      notificationIntent: { actorUid: 'teacher-1', attempts: 1, state: 'done' },
    });
    expect(Object.values(repository.snapshot())).toHaveLength(2);
    expect(Object.values(repository.snapshot())[0]).toMatchObject({
      createdAt: 1000,
      title: '📢 English: Exam moved',
      message: 'Exam moved to Friday.',
      link: '/student/courses/course-1',
    });
  });

  it('delivers large rosters in bounded Worker passes without dropping recipients', async () => {
    const storage = new MemoryStorage();
    storage.rows.set('course_enrollments', Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`large-${index}`, {
      courseId: 'course-1', studentId: `large-student-${index}`, status: 'active', sourceClassId: 'class-1',
    }])));
    const repository = new InMemoryNotificationCommandRepository();
    const handlers = createCourseAnnouncementHandlers({ storage, repository, now: () => 1000 });
    await handlers.dispatch({ ...command, targetClassIds: [] }, 'teacher-1');
    expect(Object.values(repository.snapshot())).toHaveLength(10);
    expect((await storage.readAnnouncement(eventId))?.sentToStudentIds).toHaveLength(21);
    expect((await storage.readAnnouncement(eventId))?.notificationIntent).toMatchObject({ cursor: 10, state: 'due' });
    expect(await handlers.runRetryBatch()).toEqual({ processed: 1 });
    expect(Object.values(repository.snapshot())).toHaveLength(20);
    expect((await storage.readAnnouncement(eventId))?.notificationIntent).toMatchObject({ cursor: 20, state: 'due' });
    expect(await handlers.runRetryBatch()).toEqual({ processed: 1 });
    expect(Object.values(repository.snapshot())).toHaveLength(21);
    expect((await storage.readAnnouncement(eventId))?.notificationIntent).toMatchObject({ cursor: 21, state: 'done' });
  });

  it('rejects a non-owner and parser payloads that try to supply recipients', async () => {
    const storage = new MemoryStorage();
    const repository = new InMemoryNotificationCommandRepository();
    const result = await createCourseAnnouncementHandlers({ storage, repository, now: () => 1000 })
      .dispatch(command, 'someone-else');
    expect(result.status).toBe(403);
    expect(await storage.readAnnouncement(eventId)).toBeNull();

    const invalid = { ...command, recipientIds: ['attacker'] };
    await expect(parseCourseAnnouncementAction(new Request('https://worker.test/course-announcements/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': eventId }, body: JSON.stringify(invalid),
    }))).rejects.toThrow('course_announcement_invalid');
  });

  it('does not deliver a forged legacy retry-shaped record without a Worker proof', async () => {
    const storage = new MemoryStorage();
    const forged: CourseAnnouncementRecord = {
      id: eventId, courseId: 'course-1', courseName: 'English', teacherId: 'teacher-1', teacherName: 'Ms Teacher',
      targetClassIds: [], title: 'Forged', content: 'Forged content', createdAt: 10, sentToStudentIds: ['student-1'],
      notificationIntent: {
        schemaVersion: 1, eventId, kind: 'course-announcement-created', courseId: 'course-1', actorUid: 'teacher-1',
        occurredAt: 10, dueAt: 10, attempts: 1, state: 'retry_due', cursor: 1,
        failedRecipientIds: ['student-1'], retryCursor: 0, retryRecipientIds: ['student-1'], finalFailedRecipientIds: [],
      },
    };
    storage.rows.set(`course_announcements/${eventId}`, forged);
    const repository = new InMemoryNotificationCommandRepository();
    expect(await createCourseAnnouncementHandlers({ storage, repository, now: () => 20 }).runRetryBatch()).toEqual({ processed: 0 });
    expect(Object.values(repository.snapshot())).toHaveLength(0);
  });

  it('signs the immutable snapshot and rejects changes to recipients or content', async () => {
    const storage = new FirebaseCourseAnnouncementActionStorage({
      FIREBASE_DB_URL: 'https://example-default-rtdb.firebaseio.com',
      FIREBASE_PROJECT_ID: 'example',
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({ private_key: 'test-only-worker-signing-key' }),
    });
    const unsigned: CourseAnnouncementRecord = {
      id: eventId, courseId: 'course-1', courseName: 'English', teacherId: 'teacher-1', teacherName: 'Ms Teacher',
      targetClassIds: ['class-1'], title: 'Saved title', content: 'Saved body', createdAt: 55,
      sentToStudentIds: ['student-1'], notificationIntent: {
        schemaVersion: 1, eventId, kind: 'course-announcement-created', courseId: 'course-1', actorUid: 'teacher-1',
        occurredAt: 55, dueAt: 55, attempts: 0, state: 'due', cursor: 0, failedRecipientIds: [],
        retryCursor: 0, retryRecipientIds: [], finalFailedRecipientIds: [],
      },
    };
    const sealed: CourseAnnouncementRecord = {
      ...unsigned,
      notificationIntent: { ...unsigned.notificationIntent!, trustProof: await storage.signRecord(unsigned) },
    };
    expect(await storage.verifyRecord(sealed)).toBe(true);
    expect(await storage.verifyRecord({ ...sealed, content: 'Forged body' })).toBe(false);
    expect(await storage.verifyRecord({ ...sealed, sentToStudentIds: ['attacker'] })).toBe(false);
  });

  it('makes one later attempt and reports one terminal issue after a second failure', async () => {
    const storage = new MemoryStorage();
    let now = 1000;
    const failingRepository: NotificationCommandRepository = {
      async create() { throw new Error('temporary inbox outage'); },
    };
    const handlers = createCourseAnnouncementHandlers({ storage, repository: failingRepository, now: () => now });
    const first = await handlers.dispatch(command, 'teacher-1');
    expect(first).toMatchObject({ status: 200, body: { status: 'committed', notificationStatus: 'retry_due' } });
    expect((await storage.readAnnouncement(eventId))?.notificationIntent).toMatchObject({ attempts: 1, state: 'retry_due' });
    now += 60 * 60 * 1000;
    expect(await handlers.runRetryBatch()).toEqual({ processed: 1 });
    expect((await storage.readAnnouncement(eventId))?.notificationIntent).toMatchObject({ attempts: 2, state: 'failed' });
    expect(storage.reports).toHaveLength(1);
    expect(storage.reports[0]).toEqual({ eventId, count: 2 });
  });

  it('uses stable inbox IDs and the saved content for a replay', async () => {
    const announcement: CourseAnnouncementRecord = {
      id: eventId, courseId: 'course-1', courseName: 'English', teacherId: 'teacher-1', teacherName: 'Ms Teacher',
      targetClassIds: ['class-1'], title: 'Exam moved', content: 'Saved announcement body.', createdAt: 55,
      sentToStudentIds: ['student-1'], notificationIntent: {
        schemaVersion: 1, eventId, kind: 'course-announcement-created', courseId: 'course-1', actorUid: 'teacher-1',
        occurredAt: 55, dueAt: 55, attempts: 1, state: 'sending', trustProof: 'a'.repeat(64), cursor: 0,
        cursor: 0, failedRecipientIds: [], retryCursor: 0, retryRecipientIds: [], finalFailedRecipientIds: [],
      },
    };
    const repository = new InMemoryNotificationCommandRepository();
    expect(await deliverCourseAnnouncement(announcement, repository)).toMatchObject({ delivered: true });
    expect(await deliverCourseAnnouncement(announcement, repository)).toMatchObject({ delivered: true });
    expect(Object.values(repository.snapshot())).toHaveLength(1);
    expect(Object.values(repository.snapshot())[0]).toMatchObject({ message: 'Saved announcement body.', createdAt: 55, link: '/student/courses/course-1' });
  });
});
