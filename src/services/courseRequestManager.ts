import { ref, push, set, get, update, query, orderByChild, equalTo } from 'firebase/database';
import { database } from './firebase';
import type { CourseRequest } from '../types/course.types';
import { getAuth } from 'firebase/auth';
import { notifyCommittedEvent } from './notificationProducerClient';
import { notificationWorkerOrigin } from './notificationCommandClient';

const REQUESTS_REF = 'course_requests';

// Helper for IDs
function generateId(path: string) {
    return push(ref(database, path)).key;
}

const now = () => Date.now();

const readCommittedApproval = async (requestId: string, actorUid: string) => {
    if (getAuth().currentUser?.uid !== actorUid) return null;
    const source = (await get(ref(database, `${REQUESTS_REF}/${requestId}`))).val() as CourseRequest | null;
    return source?.id === requestId && source.status === 'approved' && source.processedBy === actorUid
        && Number.isSafeInteger(source.processedAt) && Number(source.processedAt) > 0
        ? source : null;
};

const dispatchApprovedRequestNotice = async (requestId: string, actorUid: string): Promise<void> => {
    try {
        const source = await readCommittedApproval(requestId, actorUid);
        if (!source) {
            console.warn('course_approval_notification_detached_unknown', { requestId });
            return;
        }
        const result = await notifyCommittedEvent({ eventKind: 'course-request-decided', requestId,
            decision: 'approved', occurredAt: Number(source.processedAt) });
        if (result.status === 'failed' || result.status === 'unknown' || result.status === 'skipped') {
            console.warn('course_approval_notification_detached_unknown', { requestId,
                status: result.status, code: result.code });
        }
    } catch {
        console.warn('course_approval_notification_detached_unknown', { requestId });
    }
};

/**
 * Create a new enrollment/unenrollment request
 */
export async function createCourseRequest(
    studentId: string,
    studentName: string,
    courseId: string,
    courseName: string,
    teacherId: string,
    type: 'join' | 'unenroll'
): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
        // Check for existing pending request of same type
        const allRequests = await getRequestsByStudent(studentId);
        const existing = allRequests.find(r => r.courseId === courseId && r.type === type && r.status === 'pending');

        if (existing) {
            return { success: false, error: `You already have a pending ${type} request for this course.` };
        }

        const requestId = generateId(REQUESTS_REF);
        const request: CourseRequest = {
            id: requestId!,
            studentId,
            studentName,
            courseId,
            courseName,
            teacherId,
            type,
            status: 'pending',
            requestedAt: now(),
            expiresAt: now() + (7 * 24 * 60 * 60 * 1000) // 7 days expiration
        };

        await set(ref(database, `${REQUESTS_REF}/${requestId}`), request);
        return { success: true, requestId };
    } catch (error) {
        console.error('Error creating course request:', error);
        return { success: false, error: 'Failed to submit request' };
    }
}

/**
 * Get requests for a specific teacher (pending view)
 */
export async function getRequestsByTeacher(teacherId: string): Promise<CourseRequest[]> {
    try {
        await cleanupExpiredRequests(); // Auto-cleanup on view
        const requestsRef = ref(database, REQUESTS_REF);
        const teacherQuery = query(requestsRef, orderByChild('teacherId'), equalTo(teacherId));
        const snapshot = await get(teacherQuery);

        if (snapshot.exists()) {
            const requests = Object.values(snapshot.val()) as CourseRequest[];
            // Sort by requestedAt desc
            return requests.sort((a, b) => b.requestedAt - a.requestedAt);
        }
        return [];
    } catch (error) {
        console.error('Error getting requests by teacher:', error);
        return [];
    }
}

/**
 * Get requests for a specific course
 */
export async function getRequestsByCourse(courseId: string): Promise<CourseRequest[]> {
    try {
        const requestsRef = ref(database, REQUESTS_REF);
        const courseQuery = query(requestsRef, orderByChild('courseId'), equalTo(courseId));
        const snapshot = await get(courseQuery);

        if (snapshot.exists()) {
            const requests = Object.values(snapshot.val()) as CourseRequest[];
            return requests.sort((a, b) => b.requestedAt - a.requestedAt);
        }
        return [];
    } catch (error) {
        console.error('Error getting requests by course:', error);
        return [];
    }
}

/**
 * Get requests for a specific student
 */
export async function getRequestsByStudent(studentId: string): Promise<CourseRequest[]> {
    try {
        await cleanupExpiredRequests(); // Auto-cleanup on view
        const requestsRef = ref(database, REQUESTS_REF);
        const studentQuery = query(requestsRef, orderByChild('studentId'), equalTo(studentId));
        const snapshot = await get(studentQuery);

        if (snapshot.exists()) {
            return Object.values(snapshot.val()) as CourseRequest[];
        }
        return [];
    } catch (error) {
        console.error('Error getting requests by student:', error);
        return [];
    }
}

/**
 * Process a request (approve/deny)
 */
export async function processCourseRequest(
    requestId: string,
    status: 'denied',
    processedBy: string,
    rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const requestRef = ref(database, `${REQUESTS_REF}/${requestId}`);
        const snapshot = await get(requestRef);
        if (!snapshot.exists()) return { success: false, error: 'Request not found' };
        const request = snapshot.val() as CourseRequest;
        if (getAuth().currentUser?.uid !== processedBy) {
            return { success: false, error: 'Only the authenticated course owner can process this request' };
        }
        if (request.status !== 'pending' || request.expiresAt <= now()) {
            return { success: false, error: 'Request is no longer pending' };
        }
        if (request.type !== 'join' && request.type !== 'unenroll') {
            return { success: false, error: 'Request type is invalid' };
        }
        const processedAt = now();
        const updates: Record<string, unknown> = {
            status,
            processedAt,
            processedBy,
            rejectionReason: status === 'denied' ? rejectionReason || null : null
        };

        await update(requestRef, updates);
        void notifyCommittedEvent({ eventKind: 'course-request-decided', requestId,
            decision: status, occurredAt: processedAt });
        return { success: true };
    } catch (error) {
        console.error('Error processing request:', error);
        return { success: false, error: 'Failed to process request' };
    }
}

/** Approve a current request through the existing atomic Course enrollment authority command. */
export async function approveCourseRequest(
    requestId: string,
    processedBy: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (getAuth().currentUser?.uid !== processedBy) {
            return { success: false, error: 'Only the authenticated course owner can process this request' };
        }
        if (!/^[A-Za-z0-9_-]{1,128}$/u.test(requestId)) throw new Error('invalid_course_request_id');
        const configuredEndpoint = import.meta.env.VITE_COURSE_ENROLLMENT_APPROVAL_URL?.trim();
        if (!configuredEndpoint) throw new Error('course_enrollment_approval_not_configured');
        const parsedEndpoint = new URL(configuredEndpoint);
        if (parsedEndpoint.pathname !== '/course-enrollment-approval' || parsedEndpoint.search || parsedEndpoint.hash
            || parsedEndpoint.username || parsedEndpoint.password) {
            throw new Error('course_enrollment_approval_url_invalid');
        }
        const endpoint = `${notificationWorkerOrigin(parsedEndpoint.origin)}/course-enrollment-approval`;
        const token = await getAuth().currentUser?.getIdToken(false);
        if (!token) throw new Error('course_request_unauthenticated');
        const response = await fetch(endpoint, {
            method: 'POST', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationId: crypto.randomUUID(), requestId }),
        });
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > 2048) throw new Error('course_request_response_invalid');
        const body = JSON.parse(text) as { status?: unknown };
        if (!response.ok || (body.status !== 'transitioned' && body.status !== 'replayed')) {
            throw new Error(typeof body.status === 'string' ? body.status : 'course_request_unconfirmed');
        }
        void dispatchApprovedRequestNotice(requestId, processedBy);
        return { success: true };
    } catch (error) {
        try {
            if (await readCommittedApproval(requestId, processedBy)) {
                void dispatchApprovedRequestNotice(requestId, processedBy);
                return { success: true };
            }
        } catch {
            // The route outcome stays unconfirmed when canonical recovery is unavailable.
        }
        console.error('Error approving course request:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to process request' };
    }
}

/**
 * Cancel a request (by student)
 */
export async function cancelCourseRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const reqRef = ref(database, `${REQUESTS_REF}/${requestId}`);
        const snapshot = await get(reqRef);
        if (!snapshot.exists()) return { success: false, error: 'Request not found' };

        const request = snapshot.val() as CourseRequest;
        if (request.status !== 'pending') {
            return { success: false, error: 'Only pending requests can be cancelled' };
        }

        // We could either delete it or mark as cancelled. Let's mark as cancelled for history? 
        // PRD says "cancellation", usually means removal or status change.
        // Let's mark as 'expired/cancelled' or just delete. Deleting is cleaner for Firebase rules.
        await set(reqRef, null);
        return { success: true };
    } catch (error) {
        console.error('Error cancelling request:', error);
        return { success: false, error: 'Failed to cancel request' };
    }
}

/**
 * Cleanup expired requests
 */
export async function cleanupExpiredRequests(): Promise<number> {
    try {
        const snapshot = await get(ref(database, REQUESTS_REF));
        if (!snapshot.exists()) return 0;

        const requests = snapshot.val();
        let expiredCount = 0;
        const updates: Record<string, any> = {};

        Object.keys(requests).forEach(id => {
            const req = requests[id] as CourseRequest;
            if (req.status === 'pending' && req.expiresAt < now()) {
                updates[`${id}/status`] = 'expired';
                expiredCount++;
            }
        });

        if (expiredCount > 0) {
            await update(ref(database, REQUESTS_REF), updates);
        }
        return expiredCount;
    } catch (error) {
        console.error('Error cleaning up expired requests:', error);
        return 0;
    }
}
