import { ref, push, set, get, update, query, orderByChild, equalTo } from 'firebase/database';
import { database } from './firebase';
import type { CourseRequest } from '../types/course.types';

const REQUESTS_REF = 'course_requests';

// Helper for IDs
function generateId(path: string) {
    return push(ref(database, path)).key;
}

const now = () => Date.now();

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
    status: 'approved' | 'denied',
    processedBy: string,
    rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const updates: Partial<CourseRequest> = {
            status,
            processedAt: now(),
            processedBy,
            rejectionReason: status === 'denied' ? rejectionReason : undefined
        };

        await update(ref(database, `${REQUESTS_REF}/${requestId}`), updates);
        return { success: true };
    } catch (error) {
        console.error('Error processing request:', error);
        return { success: false, error: 'Failed to process request' };
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
