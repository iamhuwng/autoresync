import { getAuth } from 'firebase/auth';
import { get, query, ref, orderByChild, equalTo, update } from 'firebase/database';
import { buildRoute } from '../constants/routes';
import type { CourseEnrollment } from '../types/course.types';
import { database } from './firebase';
import type { CourseAnnouncement } from './courseAnnouncementService';
import type { NotificationDeliveryResult } from './notificationProducerClient';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const BATCH_RECIPIENTS = 50;
const MAX_PATCH_BYTES = 128 * 1024;
// ponytail: cap each event at 500; add durable resume state if larger cohorts are needed.
const MAX_EVENT_RECIPIENTS = 500;
const BATCH_SPACING_MS = 200;
const TITLE = 'New course announcement';
const MESSAGE = 'Your teacher posted an announcement in your course.';

const unattempted = (code: string, count: number): NotificationDeliveryResult =>
    ({ status: 'failed', delivered: 0, failed: 0, unknown: 0, unattempted: count, code });

/** Private mapping for the public committed-event port. The caller supplies no audience or inbox content. */
export async function notifyCourseAnnouncementCommitted(
    announcementId: string,
    signal?: AbortSignal,
): Promise<NotificationDeliveryResult> {
    if (!ID.test(announcementId)) return unattempted('notification_event_invalid', 0);
    const actor = getAuth().currentUser?.uid;
    if (!actor) return unattempted('notification_unauthenticated', 0);
    const source = (await get(ref(database, `course_announcements/${announcementId}`))).val() as CourseAnnouncement | null;
    if (!source || source.id !== announcementId || !ID.test(source.courseId) || source.teacherId !== actor
        || !Number.isSafeInteger(source.createdAt) || source.createdAt <= 0) {
        return unattempted('source_not_current', 0);
    }
    const owner = (await get(ref(database, `courses/${source.courseId}/ownerId`))).val();
    if (owner !== actor) return unattempted('source_not_current', 0);
    const snapshot = await get(query(ref(database, 'course_enrollments'), orderByChild('courseId'), equalTo(source.courseId)));
    const audience = new Map<string, string>();
    const now = Date.now();
    for (const [enrollmentId, row] of Object.entries((snapshot.val() || {}) as Record<string, CourseEnrollment>)) {
        if (ID.test(enrollmentId) && typeof row?.studentId === 'string' && ID.test(row.studentId)
            && row.courseId === source.courseId && row.status === 'active'
            && (row.expiresAt === 0 || row.expiresAt > now)
            && (!source.targetClassIds || Boolean(row.sourceClassId && source.targetClassIds[row.sourceClassId]))
            && !audience.has(row.studentId)) audience.set(row.studentId, enrollmentId);
    }
    if (!audience.size) return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 0 };

    const recipients = [...audience].sort(([a], [b]) => a.localeCompare(b));
    const noticeId = `ordinary_course_announcement_${announcementId}`;
    const link = buildRoute('STUDENT_COURSE_DETAIL', { courseId: source.courseId });
    let delivered = 0;
    let attempted = 0;
    const encoder = new TextEncoder();
    while (attempted < Math.min(recipients.length, MAX_EVENT_RECIPIENTS)) {
        if (signal?.aborted || getAuth().currentUser?.uid !== actor) {
            return { status: 'failed', delivered, failed: 0, unknown: 0,
                unattempted: recipients.length - attempted, code: 'notification_actor_changed' };
        }
        const patch: Record<string, string | number> = {};
        let count = 0;
        for (let index = attempted; index < Math.min(recipients.length, MAX_EVENT_RECIPIENTS)
            && count < BATCH_RECIPIENTS; index += 1) {
            const [studentId, enrollmentId] = recipients[index]!;
            const prefix = `notifications/${studentId}/${noticeId}`;
            const fields = {
                [`${prefix}/id`]: noticeId,
                [`${prefix}/type`]: 'info',
                [`${prefix}/title`]: TITLE,
                [`${prefix}/message`]: MESSAGE,
                [`${prefix}/link`]: link,
                [`${prefix}/createdAt`]: source.createdAt,
                [`${prefix}/metadata/announcementId`]: announcementId,
                [`${prefix}/metadata/enrollmentId`]: enrollmentId,
            };
            if (encoder.encode(JSON.stringify({ ...patch, ...fields })).byteLength > MAX_PATCH_BYTES) break;
            Object.assign(patch, fields);
            count += 1;
        }
        if (!count) return { status: 'failed', delivered, failed: 0, unknown: 0,
            unattempted: recipients.length - attempted, code: 'notification_patch_too_large' };
        try {
            await update(ref(database), patch);
        } catch (error) {
            const definite = (error as { code?: string })?.code === 'PERMISSION_DENIED';
            return { status: definite ? 'failed' : 'unknown', delivered,
                failed: definite ? count : 0, unknown: definite ? 0 : count,
                unattempted: recipients.length - attempted - count,
                code: definite ? 'notification_permission_denied' : 'notification_write_unknown' };
        }
        delivered += count;
        attempted += count;
        if (attempted < Math.min(recipients.length, MAX_EVENT_RECIPIENTS)) {
            await new Promise(resolve => setTimeout(resolve, BATCH_SPACING_MS));
        }
    }
    const remainder = recipients.length - attempted;
    return { status: remainder ? 'failed' : 'written', delivered, failed: 0, unknown: 0, unattempted: remainder,
        ...(remainder ? { code: 'notification_event_budget' } : {}) };
}
