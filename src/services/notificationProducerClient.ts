import { get, ref, update } from 'firebase/database';
import { database } from './firebase';
import { FEATURE_IDS } from '../config/featureRegistry';
import { isRestoreInProgress } from './restoreGuard';
import { notifyCourseAnnouncementCommitted } from './courseAnnouncementActionClient';
import { reportingService } from './reportingService';
import { getAuth } from 'firebase/auth';
import { buildRoute } from '../constants/routes';
import type { NotificationType } from '../types/notification.types';
import {
    createNotificationCommandClient,
    NotificationCommandClientError,
    type NotificationCommandProducerFamily,
} from './notificationCommandClient';

export interface TrustedProducerNotificationInput {
    readonly producerFamily: NotificationCommandProducerFamily;
    readonly authorityRecordId: string;
    readonly recipientId: string;
    readonly operationKey: string;
    readonly type: NotificationType;
    readonly title: string;
    readonly message: string;
    readonly link?: string;
}

export interface TrustedProducerClientOptions {
    readonly workerOrigin?: string;
    readonly getIdToken?: (forceRefresh?: boolean) => Promise<string>;
    readonly fetchImpl?: typeof fetch;
}

export interface TrustedProducerNotificationResult {
    readonly success: boolean;
    readonly notificationId?: string;
    readonly error?: string;
}

export type NotificationDeliveryResult = {
    readonly status: 'written' | 'failed' | 'unknown' | 'skipped';
    readonly delivered: number;
    readonly failed: number;
    readonly unknown: number;
    readonly unattempted: number;
    readonly code?: string;
};

export type CommittedDomainEvent =
    | { readonly eventKind: 'homework-submitted'; readonly submissionId: string }
    | { readonly eventKind: 'homework-reset'; readonly eventId: string }
    | { readonly eventKind: 'homework-reminder'; readonly eventId: string }
    | { readonly eventKind: 'thcs-homework-assigned'; readonly homeworkId: string }
    | { readonly eventKind: 'result-completed'; readonly resultId: string }
    | { readonly eventKind: 'feedback-saved'; readonly resultId: string; readonly eventId: string }
    | { readonly eventKind: 'result-reviewed'; readonly resultId: string; readonly eventId: string }
    | { readonly eventKind: 'class-membership'; readonly action: 'join-pending' | 'direct-add' | 'approve' | 'reject'; readonly classId: string; readonly studentId: string; readonly occurredAt: number }
    | { readonly eventKind: 'course-announcement-posted'; readonly announcementId: string }
    | { readonly eventKind: 'course-request-decided'; readonly requestId: string; readonly decision: 'approved' | 'denied'; readonly occurredAt: number }
    | { readonly eventKind: 'assignment-approved'; readonly requestId: string; readonly occurredAt: number }
    | { readonly eventKind: 'course-type-decided'; readonly requestId: string; readonly decision: 'approved' | 'rejected'; readonly occurredAt: number }
    | { readonly eventKind: 'writing-submitted'; readonly submissionId: string; readonly occurredAt: number; readonly audience: 'student' | 'teacher' };

type BoundedEvent = Extract<CommittedDomainEvent, { eventKind: 'feedback-saved' | 'result-reviewed' | 'result-completed' | 'assignment-approved' | 'course-type-decided' }>;
type WritingEvent = Extract<CommittedDomainEvent, { eventKind: 'writing-submitted' }>;

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type DeliveryAttempt = { actor: string | undefined; signal: AbortSignal; started: boolean };
const activeDeliveries = new Map<string, { actor: string | undefined; promise: Promise<NotificationDeliveryResult> }>();
const failedDelivery = (code: string, count: number): NotificationDeliveryResult =>
    ({ status: 'failed', delivered: 0, failed: count, unknown: 0, unattempted: 0, code });
const unattemptedDelivery = (code: string, count: number): NotificationDeliveryResult =>
    ({ status: 'failed', delivered: 0, failed: 0, unknown: 0, unattempted: count, code });
const checkAttempt = (attempt: DeliveryAttempt): void => {
    if (attempt.signal.aborted) throw new Error('notification_timeout');
    if (getAuth().currentUser?.uid !== attempt.actor) throw new Error('notification_actor_changed');
};

/** Delivery is bounded and independent of the canonical product commit. */
function notifyBoundedEvent(event: BoundedEvent): Promise<NotificationDeliveryResult> {
    const feedback = event.eventKind === 'feedback-saved';
    const completed = event.eventKind === 'result-completed';
    const assignment = event.eventKind === 'assignment-approved';
    const courseType = event.eventKind === 'course-type-decided';
    const intended = assignment ? 2 : 1;
    const eventId = assignment ? `ordinary_assignment_approved_${event.requestId}_${event.occurredAt}`
        : courseType ? `ordinary_course_type_${event.decision}_${event.requestId}_${event.occurredAt}`
        : completed ? `ordinary_complete_${event.resultId}`
        : feedback ? `ordinary_feedback_${event.resultId}_${event.eventId}` : `ordinary_review_${event.resultId}_${event.eventId}`;
    let actor: string | undefined;
    try { actor = getAuth().currentUser?.uid; } catch { /* The async attempt reports unavailable auth. */ }
    const controller = new AbortController();
    const attempt: DeliveryAttempt = { actor, signal: controller.signal, started: false };
    let timer: ReturnType<typeof setTimeout>;
    const report = (result: NotificationDeliveryResult): NotificationDeliveryResult => {
        if (result.status === 'failed' || result.status === 'unknown') {
            try { reportingService.reportNotificationFailure({
                eventId, feature: assignment || courseType ? FEATURE_IDS.adminPanel : FEATURE_IDS.results,
                action: assignment ? 'approveStudentRequest' : courseType ? (event.decision === 'approved' ? 'approveCourseType' : 'rejectCourseType') : completed ? 'notification_delivery_failed' : feedback ? 'saveFeedback' : 'markAsReviewed', route: 'rtdb', status: result.status,
                code: result.code || result.status, occurredAt: assignment || courseType ? event.occurredAt : 0, attemptedAt: Date.now(),
                recipientCount: result.delivered + result.failed + result.unknown + result.unattempted,
                delivered: result.delivered, failed: result.failed, unknown: result.unknown, unattempted: result.unattempted,
            }); } catch { /* Reporting cannot reverse product success. */ }
        }
        return result;
    };
    const active = activeDeliveries.get(eventId);
    if (active) return active.actor === actor ? active.promise
        : Promise.resolve(report(unattemptedDelivery('notification_actor_changed', intended)));
    const operation = (assignment ? notifyAssignmentApproved(event, attempt) : courseType ? notifyCourseTypeDecision(event, attempt) : completed ? notifyResultCompleted(event, attempt) : feedback ? notifyFeedbackSaved(event, attempt) : notifyResultReviewed(event, attempt))
        .catch(error => attempt.started ? failedDelivery(error instanceof Error ? error.message : 'notification_failed', intended)
            : unattemptedDelivery(error instanceof Error ? error.message : 'notification_failed', intended));
    const promise = Promise.race([operation, new Promise<NotificationDeliveryResult>(resolve => {
        timer = setTimeout(() => {
            controller.abort();
            resolve(attempt.started
                ? { status: 'unknown', delivered: 0, failed: 0, unknown: intended, unattempted: 0, code: 'notification_timeout' }
                : unattemptedDelivery('notification_timeout', intended));
        }, 15_000);
    })]).then(report).finally(() => {
        clearTimeout(timer);
        if (activeDeliveries.get(eventId)?.promise === promise) activeDeliveries.delete(eventId);
    });
    activeDeliveries.set(eventId, { actor, promise });
    return promise;
}

async function notifyAssignmentApproved(event: Extract<CommittedDomainEvent, { eventKind: 'assignment-approved' }>, attempt: DeliveryAttempt): Promise<NotificationDeliveryResult> {
    const eventId = `ordinary_assignment_approved_${event.requestId}_${event.occurredAt}`;
    try {
        const [{ get, ref, update }, { database }, { isRestoreInProgress }] = await Promise.all([import('firebase/database'), import('./firebase'), import('./restoreGuard')]);
        if (!ID.test(event.requestId) || !Number.isSafeInteger(event.occurredAt) || event.occurredAt <= 0) {
            return unattemptedDelivery('notification_event_invalid', 2);
        }
        if (await isRestoreInProgress()) return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 2, code: 'restore_in_progress' };
        checkAttempt(attempt);
        const actor = attempt.actor;
        if (!actor) return unattemptedDelivery('notification_unauthenticated', 2);
        const role = (await get(ref(database, `users/${actor}/role`))).val();
        checkAttempt(attempt);
        if (role !== 'super_admin') return unattemptedDelivery('notification_actor_unauthorized', 2);
        const source = (await get(ref(database, `student_requests/${event.requestId}`))).val() as Record<string, unknown> | null;
        checkAttempt(attempt);
        if (!source || source.id !== event.requestId || source.status !== 'approved'
            || source.reviewedBy !== actor || source.reviewedAt !== event.occurredAt
            || typeof source.studentId !== 'string' || !ID.test(source.studentId)
            || typeof source.teacherId !== 'string' || !ID.test(source.teacherId)
            || typeof source.assignmentId !== 'string' || !ID.test(source.assignmentId)) {
            return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 2, code: 'source_not_current' };
        }
        const assignment = (await get(ref(database, `student_teacher_assignments/${source.assignmentId}`))).val() as Record<string, unknown> | null;
        checkAttempt(attempt);
        if (!assignment || assignment.status !== 'active' || assignment.id !== source.assignmentId
            || assignment.studentId !== source.studentId || assignment.teacherId !== source.teacherId) {
            return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 2, code: 'source_not_current' };
        }
        const metadata = { eventKind: 'ordinary-assignment', requestId: event.requestId, occurredAt: event.occurredAt };
        const recipients = [
            { id: source.teacherId, title: 'Student Request Approved', message: 'Your student request was approved.', link: buildRoute('TEACHER_STUDENTS') },
            { id: source.studentId, title: 'New Teacher Assigned', message: 'A teacher has been assigned to you.', link: buildRoute('STUDENT_DASHBOARD') },
        ];
        const patch: Record<string, unknown> = {};
        for (const recipient of recipients) {
            const body = { id: eventId, type: 'info', title: recipient.title, message: recipient.message,
                createdAt: event.occurredAt, link: recipient.link, metadata };
            for (const [field, value] of Object.entries(body)) patch[`notifications/${recipient.id}/${eventId}/${field}`] = value;
        }
        checkAttempt(attempt);
        attempt.started = true;
        await update(ref(database), patch);
        return { status: 'written', delivered: 2, failed: 0, unknown: 0, unattempted: 0 };
    } catch (error) {
        return attempt.started ? failedDelivery('notification_write_failed', 2)
            : unattemptedDelivery(error instanceof Error ? error.message : 'notification_failed', 2);
    }
}

async function notifyCourseTypeDecision(event: Extract<CommittedDomainEvent, { eventKind: 'course-type-decided' }>, attempt: DeliveryAttempt): Promise<NotificationDeliveryResult> {
    if (!ID.test(event.requestId) || !['approved', 'rejected'].includes(event.decision)
        || !Number.isSafeInteger(event.occurredAt) || event.occurredAt <= 0) return unattemptedDelivery('notification_event_invalid', 1);
    const [{ get, ref, update }, { database }, { isRestoreInProgress }] = await Promise.all([import('firebase/database'), import('./firebase'), import('./restoreGuard')]);
    if (await isRestoreInProgress()) return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 1, code: 'restore_in_progress' };
    checkAttempt(attempt);
    if (!attempt.actor || (await get(ref(database, `users/${attempt.actor}/role`))).val() !== 'super_admin') return unattemptedDelivery('notification_actor_unauthorized', 1);
    checkAttempt(attempt);
    const source = (await get(ref(database, `course_type_requests/${event.requestId}`))).val() as Record<string, unknown> | null;
    checkAttempt(attempt);
    const approved = event.decision === 'approved';
    if (!source || source.id !== event.requestId || source.status !== event.decision
        || source[approved ? 'approvedBy' : 'handledBy'] !== attempt.actor
        || source[approved ? 'approvedAt' : 'handledAt'] !== event.occurredAt
        || typeof source.teacherId !== 'string' || !ID.test(source.teacherId)) {
        return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 1, code: 'source_not_current' };
    }
    const id = `ordinary_course_type_${event.decision}_${event.requestId}_${event.occurredAt}`;
    const body = { id, type: 'info', title: approved ? 'Course Type Approved' : 'Course Type Rejected',
        message: approved ? 'Your course type request was approved.' : 'Your course type request was rejected.',
        createdAt: event.occurredAt, link: buildRoute('TEACHER_COURSES'),
        metadata: { eventKind: 'ordinary-course-type', requestId: event.requestId, decision: event.decision, occurredAt: event.occurredAt } };
    const patch = Object.fromEntries(Object.entries(body).map(([field, value]) => [`notifications/${source.teacherId}/${id}/${field}`, value]));
    checkAttempt(attempt);
    attempt.started = true;
    await update(ref(database), patch);
    return { status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 };
}

async function notifyResultCompleted(event: Extract<CommittedDomainEvent, { eventKind: 'result-completed' }>, attempt: DeliveryAttempt): Promise<NotificationDeliveryResult> {
    // RTDB keys are limited to 768 bytes including this deterministic prefix.
    if (!/^[A-Za-z0-9_%!~*'()-]{1,750}$/u.test(event.resultId)) return unattemptedDelivery('notification_event_invalid', 1);
    if (await isRestoreInProgress()) return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 1, code: 'restore_in_progress' };
    checkAttempt(attempt);
    if (!attempt.actor) return unattemptedDelivery('notification_unauthenticated', 1);
    const result = (await get(ref(database, `test_results/${event.resultId}`))).val();
    checkAttempt(attempt);
    if (!result || result.resultId !== event.resultId || !ID.test(result.studentId) || result.isGuest === true
        || !Number.isSafeInteger(result.submittedAt) || result.submittedAt <= 0) return unattemptedDelivery('completion_occurrence_unproven', 1);
    if (result.studentId !== attempt.actor) return unattemptedDelivery('completion_context_unqualified', 1);
    const id = `ordinary_complete_${event.resultId}`;
    const body = { id, type: 'success', title: 'Test Complete', message: 'You completed a test. View your result.',
        createdAt: result.submittedAt, link: buildRoute('RESULT_DETAIL', { resultId: event.resultId }),
        metadata: { eventKind: 'ordinary-result-completed', resultId: event.resultId } };
    const patch = Object.fromEntries(Object.entries(body).map(([field, value]) => [`notifications/${result.studentId}/${id}/${field}`, value]));
    checkAttempt(attempt);
    attempt.started = true;
    await update(ref(database), patch);
    return { status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 };
}

async function notifyResultReviewed(event: Extract<CommittedDomainEvent, { eventKind: 'result-reviewed' }>, attempt: DeliveryAttempt): Promise<NotificationDeliveryResult> {
    if (!ID.test(event.resultId) || !UUID.test(event.eventId)) return unattemptedDelivery('notification_event_invalid', 1);
    const { isRestoreInProgress } = await import('./restoreGuard');
    if (await isRestoreInProgress()) return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 1, code: 'restore_in_progress' };
    checkAttempt(attempt);
    const { getAuthorizedTeacherResult } = await import('./feedbackService');
    const { result } = await getAuthorizedTeacherResult(event.resultId, attempt.actor);
    checkAttempt(attempt);
    if (result.resultId !== event.resultId || !ID.test(result.studentId) || result.markingStatus !== 'reviewed'
        || result.reviewNotificationEventId !== event.eventId || result.reviewedBy !== attempt.actor
        || !Number.isSafeInteger(result.reviewedAt) || result.reviewedAt <= 0) {
        return unattemptedDelivery('review_occurrence_unproven', 1);
    }
    const id = `ordinary_review_${event.resultId}_${event.eventId}`;
    const body = { id, type: 'success', title: 'Test Reviewed', message: 'Your teacher reviewed your result. View your score.',
        createdAt: result.reviewedAt, link: buildRoute('RESULT_DETAIL', { resultId: event.resultId }),
        metadata: { eventKind: 'ordinary-result-reviewed', resultId: event.resultId, eventId: event.eventId } };
    const patch = Object.fromEntries(Object.entries(body).map(([field, value]) => [`notifications/${result.studentId}/${id}/${field}`, value]));
    const [{ ref, update }, { database }] = await Promise.all([import('firebase/database'), import('./firebase')]);
    checkAttempt(attempt);
    attempt.started = true;
    await update(ref(database), patch);
    return { status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 };
}

async function notifyFeedbackSaved(event: Extract<CommittedDomainEvent, { eventKind: 'feedback-saved' }>, attempt: DeliveryAttempt): Promise<NotificationDeliveryResult> {
    if (!ID.test(event.resultId) || !UUID.test(event.eventId)) return unattemptedDelivery('notification_event_invalid', 1);
    const { isRestoreInProgress } = await import('./restoreGuard');
    if (await isRestoreInProgress()) return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 1, code: 'restore_in_progress' };
    checkAttempt(attempt);
    const { getAuthorizedTeacherResult } = await import('./feedbackService');
    const { result } = await getAuthorizedTeacherResult(event.resultId, attempt.actor);
    checkAttempt(attempt);
    const occurrence = result.feedbackHistory?.[event.eventId];
    if (!occurrence || occurrence.eventId !== event.eventId || occurrence.resultId !== event.resultId
        || occurrence.studentId !== result.studentId || occurrence.teacherId !== attempt.actor
        || !['question', 'overall'].includes(occurrence.type) || !Number.isSafeInteger(occurrence.timestamp) || occurrence.timestamp <= 0
        || !Number.isSafeInteger(occurrence.expectedRevision) || occurrence.expectedRevision < 0
        || occurrence.revision !== occurrence.expectedRevision + 1 || result.feedbackRevision < occurrence.revision) {
        return unattemptedDelivery('feedback_occurrence_unproven', 1);
    }
    const id = `ordinary_feedback_${event.resultId}_${event.eventId}`;
    const body = { id, type: 'info', title: 'New Teacher Feedback', message: 'Your teacher left feedback on your result.',
        createdAt: occurrence.timestamp, link: buildRoute('RESULT_DETAIL', { resultId: event.resultId }),
        metadata: { eventKind: 'ordinary-feedback', resultId: event.resultId, eventId: event.eventId } };
    const patch = Object.fromEntries(Object.entries(body).map(([field, value]) => [`notifications/${result.studentId}/${id}/${field}`, value]));
    const [{ ref, update }, { database }] = await Promise.all([import('firebase/database'), import('./firebase')]);
    checkAttempt(attempt);
    attempt.started = true;
    await update(ref(database), patch);
    return { status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 };
}

const CLASS_ID = /^[A-Za-z0-9_-]{1,64}$/u;
const CLASS_NOTICE = {
    'join-pending': {
        student: ['Class request pending', 'Your class request is awaiting approval.'],
        teacher: ['New class request', 'A student requested to join your class.'],
    },
    'direct-add': { student: ['Added to class', 'You were added to a class.'] },
    approve: { student: ['Class request approved', 'Your class request was approved.'] },
    reject: { student: ['Class request declined', 'Your class request was declined.'] },
} as const;

async function notifyClassMembership(event: Extract<CommittedDomainEvent, { eventKind: 'class-membership' }>): Promise<NotificationDeliveryResult> {
    const intended = event.action === 'join-pending' ? 2 : 1;
    const eventId = `ordinary_class_${event.action}_${event.classId}_${event.studentId}_${event.occurredAt}`;
    try {
        if (!CLASS_ID.test(event.classId) || !/^[A-Za-z0-9_-]{1,128}$/u.test(event.studentId)
            || !Number.isSafeInteger(event.occurredAt) || event.occurredAt <= 0) {
            return unattemptedDelivery('notification_event_invalid', intended);
        }
        if (await isRestoreInProgress()) {
            return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: intended, code: 'restore_in_progress' };
        }

        const actor = getAuth().currentUser?.uid;
        if (!actor) return unattemptedDelivery('notification_unauthenticated', intended);
        const role = (await get(ref(database, `users/${actor}/role`))).val();
        if (event.action === 'join-pending' ? role !== 'student' : !['teacher', 'super_admin'].includes(role)) {
            return unattemptedDelivery('notification_actor_unauthorized', intended);
        }

        const owner = (await get(ref(database, `classes/${event.classId}/createdBy`))).val();
        const sourcePath = event.action === 'reject'
            ? `classes/${event.classId}/membershipDecisions/${event.studentId}`
            : `classes/${event.classId}/students/${event.studentId}`;
        const source = (await get(ref(database, sourcePath))).val() as Record<string, unknown> | null;
        const expectedAt = event.action === 'approve' ? source?.approvedAt
            : event.action === 'reject' ? source?.decidedAt : source?.joinedAt;
        const expectedStatus = event.action === 'join-pending' ? 'pending_approval'
            : event.action === 'reject' ? 'rejected' : 'active';
        if (!source || source.status !== expectedStatus || expectedAt !== event.occurredAt
            || typeof owner !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(owner)
            || (event.action === 'join-pending' ? actor !== event.studentId
                : actor !== owner && role !== 'super_admin')) {
            return unattemptedDelivery('notification_source_not_current', intended);
        }

        const metadata = {
            eventKind: 'ordinary-class', action: event.action, classId: event.classId,
            studentId: event.studentId, occurredAt: event.occurredAt,
        };
        const recipients = event.action === 'join-pending'
            ? [
                { id: event.studentId, content: CLASS_NOTICE['join-pending'].student, link: buildRoute('STUDENT_DASHBOARD') },
                { id: owner, content: CLASS_NOTICE['join-pending'].teacher, link: buildRoute('TEACHER_CLASS_DETAIL', { classId: event.classId }) },
            ]
            : [{
                id: event.studentId,
                content: CLASS_NOTICE[event.action].student,
                link: buildRoute('STUDENT_DASHBOARD'),
            }];
        const patch: Record<string, unknown> = {};
        for (const recipient of recipients) {
            const body = {
                id: eventId,
                type: 'info',
                title: recipient.content[0],
                message: recipient.content[1],
                createdAt: event.occurredAt,
                link: recipient.link,
                metadata,
            };
            if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 1024) {
                return unattemptedDelivery('notification_content_too_large', intended);
            }
            for (const [field, value] of Object.entries(body)) {
                patch[`notifications/${recipient.id}/${eventId}/${field}`] = value;
            }
        }
        if (new TextEncoder().encode(JSON.stringify(patch)).byteLength > 128 * 1024) {
            return unattemptedDelivery('notification_patch_too_large', intended);
        }
        if (getAuth().currentUser?.uid !== actor) {
            return unattemptedDelivery('notification_actor_changed', intended);
        }
        await update(ref(database), patch);
        return { status: 'written', delivered: recipients.length, failed: 0, unknown: 0, unattempted: 0 };
    } catch (error) {
        const rawCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
            ? error.code
            : '';
        const code = rawCode.replace(/[^A-Za-z0-9_.:-]/gu, '_').slice(0, 80) || 'notification_write_failed';
        const ambiguous = /network|timeout|timed_out|disconnected|unavailable|cancelled/iu.test(code);
        return ambiguous
            ? { status: 'unknown', delivered: 0, failed: 0, unknown: intended, unattempted: 0, code }
            : failedDelivery(code, intended);
    }
}

/** Private source mapping for a saved course decision. */
async function notifyCourseRequestDecision(
    input: Extract<CommittedDomainEvent, { eventKind: 'course-request-decided' }>,
): Promise<NotificationDeliveryResult> {
    try {
        if (!/^[A-Za-z0-9_-]{1,128}$/u.test(input.requestId)
            || !Number.isSafeInteger(input.occurredAt) || input.occurredAt <= 0) {
            return { status: 'failed', delivered: 0, failed: 0, unknown: 0,
                unattempted: 1, code: 'notification_event_invalid' };
        }
        if (await isRestoreInProgress()) return { status: 'skipped', delivered: 0, failed: 0,
            unknown: 0, unattempted: 1, code: 'restore_in_progress' };
        const actor = getAuth().currentUser?.uid;
        if (!actor) return { status: 'failed', delivered: 0, failed: 0, unknown: 0,
            unattempted: 1, code: 'notification_unauthenticated' };
        const request = (await get(ref(database, `course_requests/${input.requestId}`))).val() as Record<string, unknown> | null;
        if (!request || request.id !== input.requestId || request.status !== input.decision
            || request.processedBy !== actor || request.processedAt !== input.occurredAt
            || (request.type !== 'join' && request.type !== 'unenroll')
            || typeof request.studentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(request.studentId)
            || typeof request.courseId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(request.courseId)
            || typeof request.teacherId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(request.teacherId)) {
            return { status: 'skipped', delivered: 0, failed: 0, unknown: 0,
                unattempted: 1, code: 'source_not_current' };
        }
        const [role, owner] = await Promise.all([
            get(ref(database, `users/${actor}/role`)),
            get(ref(database, `courses/${request.courseId}/ownerId`)),
        ]);
        if ((role.val() !== 'teacher' && role.val() !== 'super_admin')
            || owner.val() !== request.teacherId
            || (role.val() === 'teacher' && owner.val() !== actor)
            || getAuth().currentUser?.uid !== actor) {
            return { status: 'failed', delivered: 0, failed: 0, unknown: 0,
                unattempted: 1, code: 'notification_actor_unauthorized' };
        }
        const notificationId = `ordinary_course_request_${input.decision}_${input.requestId}_${input.occurredAt}`;
        const approved = input.decision === 'approved';
        const body = {
            id: notificationId,
            type: 'info',
            title: approved ? 'Course Request Approved' : 'Course Request Declined',
            message: `Your request to ${request.type === 'join' ? 'join' : 'leave'} the course was ${approved ? 'approved' : 'declined'}.`,
            createdAt: input.occurredAt,
            link: buildRoute('STUDENT_COURSES'),
            metadata: { eventKind: 'ordinary-course-request', requestId: input.requestId,
                decision: input.decision, occurredAt: input.occurredAt },
        };
        const patch = Object.fromEntries(Object.entries(body).map(([field, value]) =>
            [`notifications/${request.studentId}/${notificationId}/${field}`, value]));
        await update(ref(database), patch);
        return { status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 };
    } catch (error) {
        const definite = (error as { code?: string })?.code === 'PERMISSION_DENIED';
        return { status: definite ? 'failed' : 'unknown', delivered: 0, failed: definite ? 1 : 0,
            unknown: definite ? 0 : 1, unattempted: 0,
            code: definite ? 'notification_permission_denied' : 'notification_write_unknown' };
    }
}

const homeworkNoticeStarts: number[] = [];
let homeworkNoticeBusy = false;

type HomeworkEvent = Extract<CommittedDomainEvent, { eventKind: 'homework-submitted' | 'homework-reset' | 'homework-reminder' | 'thcs-homework-assigned' }>;

function notifyHomeworkEvent(event: HomeworkEvent): Promise<NotificationDeliveryResult> {
    const sourceId = event.eventKind === 'homework-submitted' ? event.submissionId
        : event.eventKind === 'thcs-homework-assigned' ? event.homeworkId : event.eventId;
    const id = `ordinary_${event.eventKind}_${sourceId}`;
    let actor: string | undefined;
    try { actor = getAuth().currentUser?.uid; } catch { /* The result reports unavailable auth. */ }
    const active = activeDeliveries.get(id);
    if (active) return active.actor === actor ? active.promise : Promise.resolve(unattemptedDelivery('notification_actor_changed', 1));
    let stopped = false, intended = 1, delivered = 0, failed = 0, unknown = 0, inFlight = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
        if (stopped || getAuth().currentUser?.uid !== actor) throw Error(stopped ? 'homework_notification_timeout' : 'notification_actor_changed');
    };
    const operation = async (): Promise<NotificationDeliveryResult> => {
        if (!actor || !ID.test(sourceId)) return unattemptedDelivery('notification_event_invalid', 1);
        if (!import.meta.env.VITE_HOMEWORK_NOTIFICATION_URL?.trim()) return unattemptedDelivery('homework_notification_not_qualified', 1);
        if (await isRestoreInProgress()) return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 1, code: 'restore_in_progress' };
        const { notifyHomeworkCommitted } = await import('./homeworkNotificationClient');
        check();
        if (event.eventKind !== 'thcs-homework-assigned') {
            const now = Date.now();
            while (homeworkNoticeStarts.length && homeworkNoticeStarts[0] <= now - 60000) homeworkNoticeStarts.shift();
            if (homeworkNoticeStarts.length >= 20) return unattemptedDelivery('notification_rate_limited', 1);
            homeworkNoticeStarts.push(now);
            inFlight = 1;
            return notifyHomeworkCommitted(event.eventKind, sourceId);
        }
        const [{ doc, getDoc }, { firestore }] = await Promise.all([import('firebase/firestore'), import('./firebase')]);
        const source = (await getDoc(doc(firestore, 'homework_assignments', sourceId))).data();
        check();
        if (!source || source.id !== sourceId || source.createdBy !== actor || source.materialType !== 'thcs-test') return unattemptedDelivery('homework_source_unproven', 1);
        let recipients: string[];
        if (source.target?.type === 'students') recipients = source.target.studentIds ?? [];
        else if (source.target?.type === 'class' && ID.test(source.target.classId)) {
            const roster = (await get(ref(database, `classes/${source.target.classId}/students`))).val() ?? {};
            recipients = Object.keys(roster).filter(uid => roster[uid]?.status === 'active');
        } else if (source.target?.type === 'group' && ID.test(source.target.groupId)) {
            const group = (await getDoc(doc(firestore, 'student_groups', source.target.groupId))).data();
            recipients = group?.teacherId === actor ? group.studentIds ?? [] : [];
        } else return unattemptedDelivery('homework_target_unqualified', 1);
        check();
        recipients = [...new Set(recipients.filter(uid => typeof uid === 'string' && ID.test(uid)))].sort();
        intended = recipients.length;
        if (!recipients.length) return { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 0, code: 'notification_empty_audience' };
        if (homeworkNoticeBusy) return unattemptedDelivery('notification_delivery_busy', recipients.length);
        homeworkNoticeBusy = true;
        try {
            const now = Date.now();
            while (homeworkNoticeStarts.length && homeworkNoticeStarts[0] <= now - 60000) homeworkNoticeStarts.shift();
            const selected = recipients.slice(0, Math.max(0, 20 - homeworkNoticeStarts.length));
            const result = { status: 'written' as NotificationDeliveryResult['status'], delivered: 0, failed: 0,
                unknown: 0, unattempted: recipients.length, code: undefined as string | undefined };
            for (let index = 0; index < selected.length; index += 2) {
                check();
                if (getAuth().currentUser?.uid !== actor) { result.code = 'notification_actor_changed'; break; }
                const page = selected.slice(index, index + 2);
                inFlight = page.length;
                homeworkNoticeStarts.push(...page.map(() => Date.now()));
                const outcomes = await Promise.all(page.map(uid => notifyHomeworkCommitted('thcs-homework-assigned', sourceId, uid)));
                for (const outcome of outcomes) {
                    result.delivered += outcome.delivered;
                    result.failed += outcome.failed;
                    result.unknown += outcome.unknown;
                    result.unattempted -= outcome.delivered + outcome.failed + outcome.unknown;
                }
                delivered = result.delivered; failed = result.failed; unknown = result.unknown; inFlight = 0;
                const stopped = outcomes.find(outcome => outcome.status !== 'written');
                if (stopped) { result.code = stopped.code; break; }
            }
            if (result.unknown) result.status = 'unknown';
            else if (result.failed || result.unattempted) result.status = 'failed';
            if (result.unattempted && !result.code) result.code = 'notification_rate_limited';
            return result;
        } finally { homeworkNoticeBusy = false; }
    };
    const promise = Promise.race([
        operation().catch(() => ({ status: (unknown || inFlight ? 'unknown' : 'failed') as NotificationDeliveryResult['status'],
            delivered, failed, unknown: unknown + inFlight, unattempted: Math.max(0, intended - delivered - failed - unknown - inFlight), code: 'homework_source_unknown' })),
        new Promise<NotificationDeliveryResult>(resolve => { timer = setTimeout(() => {
            stopped = true;
            resolve({ status: unknown || inFlight ? 'unknown' : 'failed', delivered, failed, unknown: unknown + inFlight,
                unattempted: Math.max(0, intended - delivered - failed - unknown - inFlight), code: 'homework_notification_timeout' });
        }, 15000); }),
    ]).then(result => {
        if (result.status === 'failed' || result.status === 'unknown') {
            try { reportingService.reportNotificationFailure({ eventId: id, feature: FEATURE_IDS.homework,
                action: 'notification_delivery_failed', route: 'firestore-do', ...result,
                status: result.status as 'failed' | 'unknown',
                code: result.code || result.status,
                recipientCount: result.delivered + result.failed + result.unknown + result.unattempted,
                occurredAt: 0, attemptedAt: Date.now() }); } catch { /* Reporting never changes product success. */ }
        }
        return result;
    }).finally(() => { clearTimeout(timer); activeDeliveries.delete(id); });
    activeDeliveries.set(id, { actor, promise });
    return promise;
}

/** Sole ordinary committed-event port; existing Book/trusted exports remain intact. */
export function notifyCommittedEvent(event: CommittedDomainEvent): Promise<NotificationDeliveryResult> {
    if (event.eventKind === 'writing-submitted') {
        return import('./writingNotificationClient').then(({ notifyWritingCommitted }) => notifyWritingCommitted(event));
    }
    if (event.eventKind === 'homework-submitted' || event.eventKind === 'homework-reset'
        || event.eventKind === 'homework-reminder' || event.eventKind === 'thcs-homework-assigned') return notifyHomeworkEvent(event);
    if (event.eventKind === 'feedback-saved' || event.eventKind === 'result-reviewed' || event.eventKind === 'result-completed'
        || event.eventKind === 'assignment-approved' || event.eventKind === 'course-type-decided') return notifyBoundedEvent(event);
    return notifyOtherEvent(event);
}

async function notifyOtherEvent(event: Exclude<CommittedDomainEvent, BoundedEvent | HomeworkEvent | WritingEvent>): Promise<NotificationDeliveryResult> {
    let result: NotificationDeliveryResult;
    try {
        if (event.eventKind === 'class-membership') result = await notifyClassMembership(event);
        else if (event.eventKind === 'course-request-decided') result = await notifyCourseRequestDecision(event);
        else result = await isRestoreInProgress()
            ? { status: 'skipped', delivered: 0, failed: 0, unknown: 0, unattempted: 0, code: 'restore_in_progress' }
            : await notifyCourseAnnouncementCommitted(event.announcementId);
    } catch {
        result = { status: 'unknown', delivered: 0, failed: 0, unknown: 1, unattempted: 0, code: 'notification_source_unknown' };
    }
    if (result.status === 'failed' || result.status === 'unknown') {
        const classEvent = event.eventKind === 'class-membership';
        const announcement = event.eventKind === 'course-announcement-posted';
        try { reportingService.reportNotificationFailure({
            eventId: classEvent ? `ordinary_class_${event.action}_${event.classId}_${event.studentId}_${event.occurredAt}`
                : announcement ? `ordinary_course_announcement_${event.announcementId}`
                    : `ordinary_course_request_${event.decision}_${event.requestId}_${event.occurredAt}`,
            feature: classEvent ? FEATURE_IDS.classes : FEATURE_IDS.courses,
            action: classEvent ? 'notification_delivery_failed' : announcement ? 'addAnnouncement'
                : event.decision === 'approved' ? 'approveCourseRequest' : 'denyCourseRequest',
            route: 'rtdb', status: result.status, code: result.code || result.status,
            occurredAt: announcement ? 0 : event.occurredAt, attemptedAt: Date.now(),
            recipientCount: result.delivered + result.failed + result.unknown + result.unattempted,
            delivered: result.delivered, failed: result.failed, unknown: result.unknown, unattempted: result.unattempted,
        }); } catch { /* Reporting cannot reverse product success. */ }
    }
    return result;
}

const hash32 = (value: string, seed: number): number => {
    let hash = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    }
    return hash;
};

export const notificationOperationId = (operationKey: string): string => {
    const normalized = operationKey.trim();
    if (!normalized) throw new Error('notification_operation_key_required');
    const hex = [0, 1, 2, 3]
        .map((seed) => hash32(`${normalized}:${seed}`, seed).toString(16).padStart(8, '0'))
        .join('');
    const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
    return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const defaultGetIdToken = async (forceRefresh = false): Promise<string> => {
    const user = getAuth().currentUser;
    return user ? user.getIdToken(forceRefresh) : '';
};

const createClient = (options: TrustedProducerClientOptions) => {
    const workerOrigin = options.workerOrigin?.trim()
        || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim();
    if (!workerOrigin) return null;
    return createNotificationCommandClient({
        workerOrigin,
        getIdToken: options.getIdToken ?? defaultGetIdToken,
        fetchImpl: options.fetchImpl,
    });
};

export async function createTrustedNotification(
    input: TrustedProducerNotificationInput,
    options: TrustedProducerClientOptions = {},
): Promise<TrustedProducerNotificationResult> {
    try {
        const client = createClient(options);
        if (!client) return { success: false, error: 'notification_command_unavailable' };
        const operationId = notificationOperationId(`${input.operationKey}:${input.recipientId}`);
        const result = await client.create({
            schemaVersion: 1,
            commandType: 'create-notification',
            operationId,
            producerFamily: input.producerFamily,
            recipientId: input.recipientId,
            authority: {
                kind: input.producerFamily,
                recordId: input.authorityRecordId,
            },
            notification: {
                type: input.type,
                title: input.title,
                message: input.message,
                ...(input.link === undefined ? {} : { link: input.link }),
            },
        });
        return { success: true, notificationId: result.notificationId };
    } catch (error) {
        return {
            success: false,
            error: error instanceof NotificationCommandClientError
                ? error.code
                : error instanceof Error ? error.message : 'notification_command_failed',
        };
    }
}

export async function createTrustedBulkNotifications(
    recipientIds: readonly string[],
    input: Omit<TrustedProducerNotificationInput, 'recipientId'>,
    options: TrustedProducerClientOptions = {},
): Promise<{ success: boolean; notificationIds?: string[]; error?: string }> {
    const uniqueRecipientIds = [...new Set(recipientIds.filter(Boolean))];
    if (uniqueRecipientIds.length === 0) {
        return { success: false, error: 'notification_recipients_required' };
    }
    const results = await Promise.all(uniqueRecipientIds.map((recipientId) => createTrustedNotification({
        ...input,
        recipientId,
    }, options)));
    const notificationIds = results.flatMap((result) => result.notificationId ? [result.notificationId] : []);
    const failed = results.find((result) => !result.success);
    return failed
        ? { success: false, notificationIds, error: failed.error }
        : { success: true, notificationIds };
}

export const sendTrustedHomeworkReminderNotification = (
    studentId: string,
    homeworkId: string,
    homeworkTitle: string,
    teacherName?: string,
    reminderKey = String(Date.now()),
): Promise<TrustedProducerNotificationResult> => createTrustedNotification({
    producerFamily: 'deadline',
    authorityRecordId: homeworkId,
    recipientId: studentId,
    operationKey: `teacher-manual-reminder:${homeworkId}:${reminderKey}`,
    type: 'homework_reminder',
    title: '⚡ Homework Reminder',
    message: `${teacherName || 'Your teacher'} sent you a reminder for "${homeworkTitle}".`,
    link: buildRoute('STUDENT_HOMEWORK_DETAIL', { homeworkId }),
});
