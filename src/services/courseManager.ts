
/**
 * Course Manager Service
 * Manages courses, modules, and material linking.
 */

import { ref, push, set, get, update, query, orderByChild, equalTo, remove } from 'firebase/database';
import { database } from './firebase';
import type { Course, Module, CourseMaterial, StudentCourseProgress } from '../types/course.types';
import { createTrustedBulkNotifications, createTrustedNotification } from './notificationProducerClient';
import { logCreate, logUpdate, logDelete } from './auditService';

const COURSES_REF = 'courses';
const MODULES_REF = 'course_modules';
const COURSE_MATERIALS_REF = 'course_materials';
const COURSE_TYPES_REF = 'course_types';
const COURSE_TYPE_REQUESTS_REF = 'course_type_requests';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const generateId = (path: string) => push(ref(database, path)).key;
const now = () => Date.now();

/**
 * Generate a unique course code
 * Format: [TYPE]-[YYYYMMDD]-[HHMM]
 * Example: IELTS-20260130-1430
 */
export function generateCourseCode(type: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // Sanitize type (remove spaces, uppercase)
    const cleanType = type.replace(/\s+/g, '').toUpperCase();

    return `${cleanType}-${year}${month}${day}-${hours}${minutes}`;
}

/**
 * Validate course code uniqueness
 */
export async function validateCourseCode(code: string): Promise<boolean> {
    try {
        const coursesRef = ref(database, COURSES_REF);
        const codeQuery = query(coursesRef, orderByChild('code'), equalTo(code));
        const snapshot = await get(codeQuery);
        return !snapshot.exists();
    } catch (error) {
        console.error('Error validating course code:', error);
        return false; // Assume unsafe if error
    }
}

// ============================================================================
// COURSE CRUD
// ============================================================================

/**
 * Create a new course
 */
export async function createCourse(
    courseData: Omit<Course, 'id' | 'createdAt'>,
    ownerId: string
): Promise<{ success: boolean; courseId?: string; error?: string }> {
    try {
        if (!courseData.name || !courseData.type || !ownerId) {
            return { success: false, error: 'Missing required fields' };
        }

        // Generate code if not provided or valid
        let code = courseData.code;
        if (!code) {
            code = generateCourseCode(courseData.type);
        }

        // Check uniqueness
        const isUnique = await validateCourseCode(code);
        if (!isUnique) {
            return { success: false, error: 'Course code already exists' };
        }

        const courseId = generateId(COURSES_REF);
        if (!courseId) return { success: false, error: 'Failed to generate ID' };

        const newCourse: Course = {
            ...courseData,
            id: courseId,
            code,
            ownerId,
            createdAt: now(),
            updatedAt: now(),
            archivedAt: null,
            hardDeleteAt: null
        };

        await set(ref(database, `${COURSES_REF}/${courseId}`), newCourse);

        // Log audit event (Task 6.7)
        logCreate(null, 'course', courseId, {
            name: courseData.name,
            type: courseData.type,
            ownerId,
            code
        });

        return { success: true, courseId };
    } catch (error) {
        console.error('Error creating course:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Update existing course
 */
export async function updateCourse(
    courseId: string,
    updates: Partial<Course>
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!courseId) return { success: false, error: 'Course ID missing' };

        const updatesWithTimestamp = {
            ...updates,
            updatedAt: now()
        };

        // If code is being updated, validate uniqueness
        if (updates.code) {
            // We need to check if it's the SAME course, but `validateCourseCode` returns false if ANY match found.
            // So we must fetch the existing course to compare IDs or improve validation logic.
            // For now, simpler check: get course by code, if ID differs => duplicate.
            const coursesRef = ref(database, COURSES_REF);
            const codeQuery = query(coursesRef, orderByChild('code'), equalTo(updates.code));
            const snapshot = await get(codeQuery);
            if (snapshot.exists()) {
                const matchingCourse = Object.values(snapshot.val())[0] as Course;
                if (matchingCourse.id !== courseId) {
                    return { success: false, error: 'Course code already in use by another course' };
                }
            }
        }

        await update(ref(database, `${COURSES_REF}/${courseId}`), updatesWithTimestamp);

        // Log audit event (Task 6.7)
        logUpdate(null, 'course', courseId, {
            fields: Object.keys(updates)
        });

        return { success: true };
    } catch (error) {
        console.error('Error updating course:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get single course by ID
 */
export async function getCourse(courseId: string): Promise<Course | null> {
    try {
        const snapshot = await get(ref(database, `${COURSES_REF}/${courseId}`));
        if (snapshot.exists()) {
            return snapshot.val() as Course;
        }
        return null;
    } catch (error) {
        console.error('Error getting course:', error);
        return null;
    }
}

/**
 * Get single course by Code
 */
export async function getCourseByCode(code: string): Promise<Course | null> {
    try {
        const coursesRef = ref(database, COURSES_REF);
        const codeQuery = query(coursesRef, orderByChild('code'), equalTo(code));
        const snapshot = await get(codeQuery);

        if (snapshot.exists()) {
            const data = snapshot.val();
            const course = Object.values(data)[0] as Course;
            return course;
        }
        return null;
    } catch (error) {
        console.error('Error getting course by code:', error);
        return null;
    }
}

/**
 * Get all courses owned by a teacher
 */
export async function getCoursesByOwner(ownerId: string): Promise<Course[]> {
    try {
        const coursesRef = ref(database, COURSES_REF);
        const ownerQuery = query(coursesRef, orderByChild('ownerId'), equalTo(ownerId));
        const snapshot = await get(ownerQuery);

        if (snapshot.exists()) {
            const courses = Object.values(snapshot.val()) as Course[];
            // Filter out class instances to prevent dashboard pollution
            const templates = courses.filter(c => !c.isClassInstance);
            // Sort by createdAt desc
            return templates.sort((a, b) => b.createdAt - a.createdAt);
        }
        return [];
    } catch (error) {
        console.error('Error getting courses by owner:', error);
        return [];
    }
}

/**
 * Get all courses (Admin)
 * NOTE: intentionally includes class instances so admins can debug and manage them.
 */
export async function getAllCourses(): Promise<Course[]> {
    try {
        const snapshot = await get(ref(database, COURSES_REF));
        if (snapshot.exists()) {
            const courses = Object.values(snapshot.val()) as Course[];
            return courses.sort((a, b) => b.createdAt - a.createdAt);
        }
        return [];
    } catch (error) {
        console.error('Error getting all courses:', error);
        return [];
    }
}

/**
 * Get all public courses
 */
export async function getPublicCourses(): Promise<Course[]> {
    try {
        const coursesRef = ref(database, COURSES_REF);
        const visibilityQuery = query(coursesRef, orderByChild('visibility'), equalTo('public'));
        const snapshot = await get(visibilityQuery);

        if (snapshot.exists()) {
            const courses = Object.values(snapshot.val()) as Course[];
            // Filter out archived and class instances
            return courses
                .filter(c => !c.archivedAt && !c.isClassInstance)
                .sort((a, b) => b.createdAt - a.createdAt);
        }
        return [];
    } catch (error) {
        console.error('Error getting public courses:', error);
        return [];
    }
}

/**
 * Archive a course (Soft Delete)
 */
export async function archiveCourse(courseId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Validation: Check for enrolled students first (Task 26.4)
        const enrollmentsRef = ref(database, 'course_enrollments');
        const enrollQuery = query(enrollmentsRef, orderByChild('courseId'), equalTo(courseId));
        const snapshot = await get(enrollQuery);

        if (snapshot.exists()) {
            const enrollments = Object.values(snapshot.val()) as any[];
            const hasActiveEnrollments = enrollments.some(e => e.status === 'active');
            if (hasActiveEnrollments) {
                return {
                    success: false,
                    error: 'Cannot archive course with active enrollments. Please unenroll all students first.'
                };
            }
        }

        const hardDeleteDate = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days later

        await update(ref(database, `${COURSES_REF}/${courseId}`), {
            archivedAt: Date.now(),
            hardDeleteAt: hardDeleteDate
        });

        // Task 26.8: Notify enrolled students
        if (snapshot.exists()) {
            const enrollments = Object.values(snapshot.val()) as any[];
            const studentIds = enrollments
                .filter(e => e.status === 'active')
                .map(e => e.studentId);

            if (studentIds.length > 0) {
                // Get course name for notification
                const courseSnap = await get(ref(database, `${COURSES_REF}/${courseId}`));
                const courseName = courseSnap.val()?.name || 'Untitled Course';

                await createTrustedBulkNotifications(studentIds, {
                    producerFamily: 'course',
                    authorityRecordId: courseId,
                    operationKey: `course-archived:${courseId}`,
                    title: 'Course Archived',
                    message: `The course "${courseName}" has been archived by the teacher and is no longer accessible.`,
                    type: 'info',
                });
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Error archiving course:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Restore an archived course
 */
export async function restoreCourse(courseId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await update(ref(database, `${COURSES_REF}/${courseId}`), {
            archivedAt: null,
            hardDeleteAt: null
        });
        return { success: true };
    } catch (error) {
        console.error('Error restoring course:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Permanently delete a course and its associated content
 */
export async function hardDeleteCourse(courseId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Remove course record
        await remove(ref(database, `${COURSES_REF}/${courseId}`));

        // 2. Remove modules
        const modulesRef = ref(database, MODULES_REF);
        const modulesQuery = query(modulesRef, orderByChild('courseId'), equalTo(courseId));
        const modulesSnapshot = await get(modulesQuery);
        if (modulesSnapshot.exists()) {
            const updates: Record<string, null> = {};
            Object.keys(modulesSnapshot.val()).forEach(id => {
                updates[`${MODULES_REF}/${id}`] = null;
            });
            await update(ref(database), updates);
        }

        // 3. Remove material links
        const materialsRef = ref(database, COURSE_MATERIALS_REF);
        const materialsQuery = query(materialsRef, orderByChild('courseId'), equalTo(courseId));
        const materialsSnapshot = await get(materialsQuery);
        if (materialsSnapshot.exists()) {
            const updates: Record<string, null> = {};
            Object.keys(materialsSnapshot.val()).forEach(id => {
                updates[`${COURSE_MATERIALS_REF}/${id}`] = null;
            });
            await update(ref(database), updates);
        }

        // Log audit event (Task 6.7)
        logDelete(null, 'course', courseId, {
            action: 'hard_delete',
            modulesDeleted: modulesSnapshot.exists() ? Object.keys(modulesSnapshot.val()).length : 0,
            materialsDeleted: materialsSnapshot.exists() ? Object.keys(materialsSnapshot.val()).length : 0
        });

        return { success: true };
    } catch (error) {
        console.error('Error hard deleting course:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// COURSE TYPE MANAGEMENT
// ============================================================================

import type { CourseTypeDefinition, CourseTypeRequest } from '../types/course.types';

/**
 * Get all available course types
 */
export async function getCourseTypes(): Promise<CourseTypeDefinition[]> {
    try {
        const snapshot = await get(ref(database, COURSE_TYPES_REF));
        if (snapshot.exists()) {
            return Object.values(snapshot.val()) as CourseTypeDefinition[];
        }
        return [];
    } catch (error) {
        console.error('Error getting course types:', error);
        return [];
    }
}

/**
 * Request a new course type
 */
export async function requestCourseType(teacherId: string, typeName: string): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
        if (!typeName || typeName.trim().length < 2) {
            return { success: false, error: 'Type name too short' };
        }

        // Check if type already exists (case insensitive)
        const types = await getCourseTypes();
        const exists = types.some(t => t.name.toLowerCase() === typeName.toLowerCase());
        if (exists) {
            return { success: false, error: 'Course type already exists' };
        }

        const requestId = generateId(COURSE_TYPE_REQUESTS_REF);
        if (!requestId) return { success: false, error: 'Failed to generate ID' };

        const newRequest: CourseTypeRequest = {
            id: requestId,
            teacherId,
            typeName: typeName.trim(),
            requestedAt: now(),
            status: 'pending'
        };

        await set(ref(database, `${COURSE_TYPE_REQUESTS_REF}/${requestId}`), newRequest);
        return { success: true, requestId };
    } catch (error) {
        console.error('Error requesting course type:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get pending course type requests (Admin)
 */
export async function getPendingTypeRequests(): Promise<CourseTypeRequest[]> {
    try {
        const requestsRef = ref(database, COURSE_TYPE_REQUESTS_REF);
        const pendingQuery = query(requestsRef, orderByChild('status'), equalTo('pending'));
        const snapshot = await get(pendingQuery);

        if (snapshot.exists()) {
            return Object.values(snapshot.val()) as CourseTypeRequest[];
        }
        return [];
    } catch (error) {
        console.error('Error getting pending type requests:', error);
        return [];
    }
}

/**
 * Approve a course type request
 */
export async function approveCourseType(requestId: string, approvedBy: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Get the request
        const requestSnapshot = await get(ref(database, `${COURSE_TYPE_REQUESTS_REF}/${requestId}`));
        if (!requestSnapshot.exists()) {
            return { success: false, error: 'Request not found' };
        }
        const request = requestSnapshot.val() as CourseTypeRequest;

        if (request.status !== 'pending') {
            return { success: false, error: 'Request is handled' };
        }

        // 2. Create the course type
        const typeId = generateId(COURSE_TYPES_REF);
        if (!typeId) return { success: false, error: 'Failed to generate type ID' };

        const newType: CourseTypeDefinition = {
            id: typeId,
            name: request.typeName,
            isSystem: false,
            createdBy: request.teacherId,
            createdAt: now()
        };

        await set(ref(database, `${COURSE_TYPES_REF}/${typeId}`), newType);

        await update(ref(database, `${COURSE_TYPE_REQUESTS_REF}/${requestId}`), {
            status: 'approved',
            approvedBy,
            approvedAt: now()
        });

        // Send notification to teacher
        try {
            await createTrustedNotification({
                producerFamily: 'course',
                authorityRecordId: requestId,
                recipientId: request.teacherId,
                operationKey: `course-type-approved:${requestId}`,
                type: 'success',
                title: 'Course Type Approved',
                message: `Your request for course type "${request.typeName}" has been approved. You can now use it when creating courses.`,
                link: '/teacher/courses' // Or to create page?
            });
        } catch (notifyErr) {
            console.error('Failed to send approval notification', notifyErr);
        }

        return { success: true };
    } catch (error) {
        console.error('Error approving course type:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Reject a course type request
 */
export async function rejectCourseType(requestId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Send notification to teacher
        try {
            // Get original request details if needed, but we don't have it here unless queried again 
            // or passed in. Usually good to get request first. But update doesn't need read first?
            // Wait, we need teacherId to notify. The update call didn't fetch the request.
            // Let's refactor slightly to read first.
            const requestSnapshot = await get(ref(database, `${COURSE_TYPE_REQUESTS_REF}/${requestId}`));
            if (requestSnapshot.exists()) {
                const request = requestSnapshot.val() as CourseTypeRequest;
                await createTrustedNotification({
                    producerFamily: 'course',
                    authorityRecordId: requestId,
                    recipientId: request.teacherId,
                    operationKey: `course-type-rejected:${requestId}`,
                    type: 'error',
                    title: 'Course Type Rejected',
                    message: `Your request for course type "${request.typeName}" was rejected${reason ? ': ' + reason : '.'}`,
                    link: '/teacher/courses'
                });
            }
        } catch (notifyErr) {
            console.error('Failed to send rejection notification', notifyErr);
        }

        await update(ref(database, `${COURSE_TYPE_REQUESTS_REF}/${requestId}`), {
            status: 'rejected',
            rejectionReason: reason || 'Admin rejected',
            approvedAt: now() // using approvedAt as 'handledAt' essentially
        });
        return { success: true };
    } catch (error) {
        console.error('Error rejecting course type:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// MODULE MANAGEMENT
// ============================================================================

/**
 * Create a new module
 */
export async function createModule(
    courseId: string,
    moduleData: Omit<Module, 'id' | 'courseId' | 'order'>
): Promise<{ success: boolean; moduleId?: string; error?: string }> {
    try {
        if (!courseId || !moduleData.name) {
            return { success: false, error: 'Missing required fields' };
        }

        // Get current modules to determine order
        const modules = await getModulesByCourse(courseId);
        const order = modules.length; // Append to end

        const moduleId = generateId(MODULES_REF);
        if (!moduleId) return { success: false, error: 'Failed to generate ID' };

        const newModule: Module = {
            ...moduleData,
            id: moduleId,
            courseId,
            order,
            // Default accessType if not provided
            accessType: moduleData.accessType || 'open'
        };

        await set(ref(database, `${MODULES_REF}/${moduleId}`), newModule);

        return { success: true, moduleId };
    } catch (error) {
        console.error('Error creating module:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Update a module
 */
export async function updateModule(
    moduleId: string,
    updates: Partial<Module>
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!moduleId) return { success: false, error: 'Module ID missing' };

        await update(ref(database, `${MODULES_REF}/${moduleId}`), updates);
        return { success: true };
    } catch (error) {
        console.error('Error updating module:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Delete a module and unlink materials
 */
export async function deleteModule(moduleId: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!moduleId) return { success: false, error: 'Module ID missing' };

        // 1. Delete the module
        await remove(ref(database, `${MODULES_REF}/${moduleId}`));

        // 2. Cascade delete materials linked to this module
        const materialsRef = ref(database, COURSE_MATERIALS_REF);
        const materialsQuery = query(materialsRef, orderByChild('moduleId'), equalTo(moduleId));
        const snapshot = await get(materialsQuery);

        if (snapshot.exists()) {
            const updates: Record<string, null> = {};
            Object.keys(snapshot.val()).forEach(key => {
                updates[`${COURSE_MATERIALS_REF}/${key}`] = null;
            });
            await update(ref(database), updates);
        }

        return { success: true };
    } catch (error) {
        console.error('Error deleting module:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Get modules by course
 */
export async function getModulesByCourse(courseId: string): Promise<Module[]> {
    try {
        const modulesRef = ref(database, MODULES_REF);
        const courseQuery = query(modulesRef, orderByChild('courseId'), equalTo(courseId));
        const snapshot = await get(courseQuery);

        if (snapshot.exists()) {
            const modulesMap = snapshot.val() as Record<string, Module>;
            const modules = Object.values(modulesMap);

            // Fetch material counts for each module
            const materialsRef = ref(database, COURSE_MATERIALS_REF);
            const materialsSnapshot = await get(materialsRef);

            let materials: any[] = [];
            if (materialsSnapshot.exists()) {
                materials = Object.values(materialsSnapshot.val());
            }

            const modulesWithCounts = modules.map(module => ({
                ...module,
                materialsCount: materials.filter((m: any) => m.moduleId === module.id).length
            }));

            return modulesWithCounts.sort((a, b) => a.order - b.order);
        }
        return [];
    } catch (error) {
        console.error('Error getting modules:', error);
        return [];
    }
}

/**
 * Reorder modules
 */
export async function reorderModules(_courseId: string, moduleIds: string[]): Promise<{ success: boolean; error?: string }> {
    try {
        const updates: Record<string, any> = {};

        moduleIds.forEach((id, index) => {
            updates[`${MODULES_REF}/${id}/order`] = index;
        });

        await update(ref(database), updates);
        return { success: true };
    } catch (error) {
        console.error('Error reordering modules:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// MATERIAL LINKING & PROGRESS
// ============================================================================

const COURSE_PROGRESS_REF = 'course_progress';

/**
 * Get all materials for a course
 */
export async function getMaterialsByCourse(courseId: string): Promise<CourseMaterial[]> {
    try {
        const materialsRef = ref(database, COURSE_MATERIALS_REF);
        const courseQuery = query(materialsRef, orderByChild('courseId'), equalTo(courseId));
        const snapshot = await get(courseQuery);

        if (snapshot.exists()) {
            const materialsMap = snapshot.val() as Record<string, CourseMaterial>;
            return Object.values(materialsMap).sort((a, b) => a.order - b.order);
        }
        return [];
    } catch (error) {
        console.error('Error getting materials by course:', error);
        return [];
    }
}

/**
 * Get materials by module
 */
export async function getMaterialsByModule(moduleId: string): Promise<CourseMaterial[]> {
    try {
        const materialsRef = ref(database, COURSE_MATERIALS_REF);
        const moduleQuery = query(materialsRef, orderByChild('moduleId'), equalTo(moduleId));
        const snapshot = await get(moduleQuery);

        if (snapshot.exists()) {
            const materialsMap = snapshot.val() as Record<string, CourseMaterial>;
            return Object.values(materialsMap).sort((a, b) => a.order - b.order);
        }
        return [];
    } catch (error) {
        console.error('Error getting materials by module:', error);
        return [];
    }
}

/**
 * Get student progress for a course
 */
export async function getStudentCourseProgress(studentId: string, courseId: string): Promise<StudentCourseProgress | null> {
    try {
        const snapshot = await get(ref(database, `${COURSE_PROGRESS_REF}/${studentId}/${courseId}`));
        if (snapshot.exists()) {
            return snapshot.val() as StudentCourseProgress;
        }
        return null;
    } catch (error) {
        console.error('Error getting student progress:', error);
        return null;
    }
}

/**
 * Update student material completion
 */
export async function markMaterialComplete(studentId: string, courseId: string, materialId: string, score?: number): Promise<{ success: boolean; error?: string }> {
    try {
        const progressRef = ref(database, `${COURSE_PROGRESS_REF}/${studentId}/${courseId}`);
        const snapshot = await get(progressRef);

        const nowMs = now();
        let progress: Partial<StudentCourseProgress> = {};

        if (snapshot.exists()) {
            progress = snapshot.val();
        }

        const completedMaterials = {
            ...(progress.completedMaterials || {}),
            [materialId]: { completedAt: nowMs, score }
        };

        await update(progressRef, {
            studentId,
            courseId,
            completedMaterials,
            lastAccessedAt: nowMs
        });

        return { success: true };
    } catch (error) {
        console.error('Error marking material complete:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
