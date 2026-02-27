/**
 * Course Type Service
 * 
 * Service for managing course types and type requests.
 * This is a STUB implementation for Phase 3D completion.
 * Full implementation will be added in Phase 3E.
 */

export interface CourseType {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
}

export interface PendingTypeRequest {
    id: string;
    typeName: string;
    description?: string;
    requestedBy: string;
    requestedAt: number;
    status: 'pending';
}

/**
 * Get all approved course types
 * STUB: Returns empty array until full implementation
 */
export async function getCourseTypes(): Promise<CourseType[]> {
    console.warn('[courseTypeService] STUB: getCourseTypes()');
    return [];
}

/**
 * Get all pending type requests
 * STUB: Returns empty array until full implementation
 */
export async function getPendingTypeRequests(): Promise<PendingTypeRequest[]> {
    console.warn('[courseTypeService] STUB: getPendingTypeRequests()');
    return [];
}

/**
 * Approve a course type request
 * STUB: Logs action until full implementation
 */
export async function approveCourseType(requestId: string): Promise<void> {
    console.warn('[courseTypeService] STUB: approveCourseType()', requestId);
    return Promise.resolve();
}

/**
 * Reject a course type request
 * STUB: Logs action until full implementation
 */
export async function rejectCourseType(requestId: string): Promise<void> {
    console.warn('[courseTypeService] STUB: rejectCourseType()', requestId);
    return Promise.resolve();
}
