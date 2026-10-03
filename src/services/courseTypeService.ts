/** Admin course-type view adapts the canonical course service. */
import * as courses from './courseManager';
import type { CourseType, PendingTypeRequest } from '../types/admin.types';
export type { CourseType, PendingTypeRequest } from '../types/admin.types';
export async function getCourseTypes(): Promise<CourseType[]> {
    return (await courses.getCourseTypes()).map(type => ({
        id: type.id, name: type.name, createdBy: type.createdBy || '', createdAt: type.createdAt, status: 'active',
    }));
}
export async function getPendingTypeRequests(): Promise<PendingTypeRequest[]> {
    return (await courses.getPendingTypeRequests()).map(request => ({
        id: request.id, name: request.typeName, requestedBy: request.teacherId,
        requestedAt: request.requestedAt, status: request.status,
    }));
}
export async function approveCourseType(requestId: string): Promise<void> {
    const result = await courses.approveCourseType(requestId);
    if (!result.success) throw new Error(result.error || 'Course type approval failed');
}
export async function rejectCourseType(requestId: string): Promise<void> {
    const result = await courses.rejectCourseType(requestId);
    if (!result.success) throw new Error(result.error || 'Course type rejection failed');
}
