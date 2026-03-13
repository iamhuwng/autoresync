import { ref, push, set, get, update, query, orderByChild, equalTo, remove } from 'firebase/database';
import { database } from './firebase';
import type {
    ClassCourseLink,
    CourseEnrollment,
    Course,
} from '../types/course.types';
import {
    getCourse,
    getModulesByCourse,
    createModule,
    updateCourse
} from './courseManager';
import {
    getMaterialsByModule,
    linkMaterialToModule
} from './materialLinkManager';
import { getClass } from './classManager';
import { createNotification } from './notificationService';

const LINK_REF = 'class_course_links';
const ENROLLMENTS_REF = 'course_enrollments';

// Helper for IDs
const generateId = (path: string) => push(ref(database, path)).key;
const now = () => Date.now();

/**
 * Link a course to a class (Creates a copy of the course)
 */
export async function linkCourseToClass(
    classId: string,
    originalCourseId: string,
    duration?: { value: number; unit: 'days' | 'months' | 'years' },
    isAutoEnroll: boolean = true
): Promise<{ success: boolean; linkId?: string; linkedCourseId?: string; error?: string }> {
    try {
        // 1. Fetch original course
        const originalCourse = await getCourse(originalCourseId);
        if (!originalCourse) {
            return { success: false, error: 'Original course not found' };
        }

        // 2. Fetch Class to verify existence and get name for context
        const classData = await getClass(classId);
        if (!classData) {
            return { success: false, error: 'Class not found' };
        }

        // 3. Create a deep copy of the course
        // We create a new course record that serves as the "Class Instance" of the course
        // This allows independent modification if needed, but primarily serves to track this specific linkage
        const courseCopyId = generateId('courses');
        if (!courseCopyId) return { success: false, error: 'Failed to generate course ID' };

        const newCourseData: Course = {
            ...originalCourse,
            id: courseCopyId,
            name: `${originalCourse.name} (${classData.name})`, // Differentiate name
            code: `${originalCourse.code}-${classData.classCode}`, // Unique code per class instance
            ownerId: originalCourse.ownerId,
            // Class instances must never appear in public discovery even if original was public.
            // This is defense-in-depth: the isClassInstance filter in query functions is the primary
            // guard, but setting visibility: 'private' here ensures no query bypass can leak them.
            visibility: 'private' as const,
            isClassInstance: true,
            originalName: originalCourse.name,
            createdAt: now(),
            updatedAt: now(),
            archivedAt: null,
            hardDeleteAt: null
        };

        // Use direct set instead of createCourse to bypass unique name/code checks if needed, 
        // or just to ensure we set the ID we generated. 
        // createCourse() in courseManager generates its own ID.
        // We can manually save it here.
        await set(ref(database, `courses/${courseCopyId}`), newCourseData);


        // 4. Copy Modules and Links
        const modules = await getModulesByCourse(originalCourseId);

        for (const module of modules) {
            // Create Module Copy with lineage tracking
            const newModuleResult = await createModule(courseCopyId, {
                name: module.name,
                accessType: module.accessType,
                originalModuleId: module.id,   // Track which original module this was copied from
                lastSyncedAt: now(),            // Mark as synced at creation time
            });

            if (newModuleResult.success && newModuleResult.moduleId) {
                const newModuleId = newModuleResult.moduleId;

                // Fetch materials for this module
                const materials = await getMaterialsByModule(module.id);

                // Link materials to new module (linkedAt is set automatically by linkMaterialToModule)
                for (const materialLink of materials) {
                    await linkMaterialToModule(courseCopyId, newModuleId, materialLink.materialId);
                }
            }
        }

        // 5. Calculate Expiration
        let expiresAt = 0;
        const durationToUse = duration || originalCourse.duration; // Override or use default

        if (durationToUse) {
            const date = new Date();
            if (durationToUse.unit === 'days') date.setDate(date.getDate() + durationToUse.value);
            if (durationToUse.unit === 'months') date.setMonth(date.getMonth() + durationToUse.value);
            if (durationToUse.unit === 'years') date.setFullYear(date.getFullYear() + durationToUse.value);
            expiresAt = date.getTime();
        }

        // 6. Create ClassCourseLink record
        const linkId = generateId(LINK_REF);
        if (!linkId) return { success: false, error: 'Failed to generate link ID' };

        const link: ClassCourseLink = {
            id: linkId,
            classId,
            courseId: courseCopyId,
            originalCourseId,
            linkedAt: now(),
            expiresAt,
            isAutoEnroll
        };

        await set(ref(database, `${LINK_REF}/${linkId}`), link);

        // 7. Auto-enroll students if enabled
        if (isAutoEnroll && classData.students) {
            const studentIds = Object.keys(classData.students);
            // This is async but we don't necessarily have to await all of them if long list?
            // Safer to await.
            await Promise.all(studentIds.map(studentId =>
                enrollStudentInCourse(studentId, courseCopyId, 'class-based', classId, expiresAt)
            ));
        }

        return { success: true, linkId, linkedCourseId: courseCopyId };
    } catch (error) {
        console.error('Error linking course to class:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Auto-enroll a student in all courses linked to a class
 */
export async function autoEnrollStudentInClassCourses(classId: string, studentId: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
        const links = await getLinkedCourses(classId);
        let count = 0;

        for (const link of links) {
            if (link.isAutoEnroll) {
                const result = await enrollStudentInCourse(
                    studentId,
                    link.courseId,
                    'class-based',
                    classId,
                    link.expiresAt
                );
                if (result.success) count++;
            }
        }

        return { success: true, count };
    } catch (error) {
        console.error('Error in auto-enrollment:', error);
        return { success: false, count: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Enroll a student in a course
 */
export async function enrollStudentInCourse(
    studentId: string,
    courseId: string,
    enrollmentType: 'class-based' | 'individual' | 'public',
    sourceClassId?: string,
    expiresAt?: number
): Promise<{ success: boolean; enrollmentId?: string; error?: string }> {
    try {
        // Check if already enrolled?
        // Query enrollments by studentId and courseId
        // For simplicity, we just create a new one or overwrite if ID is deterministic?
        // Better to check.

        // Check active enrollments (use raw DB query, not enriched version)
        const allEnrollments = await _getRawEnrollments(studentId);
        const existing = allEnrollments.find(e => e.courseId === courseId && e.status === 'active');

        if (existing) {
            // Already enrolled. Maybe update expiration if this one is longer?
            // For now, return success.
            return { success: true, enrollmentId: existing.id };
        }

        const enrollmentId = generateId(ENROLLMENTS_REF);
        const enrollment: CourseEnrollment = {
            id: enrollmentId!,
            studentId,
            courseId,
            enrollmentType,
            sourceClassId,
            enrolledAt: now(),
            expiresAt: expiresAt || 0, // 0 = never? Or required?
            status: 'active'
        };

        await set(ref(database, `${ENROLLMENTS_REF}/${enrollmentId}`), enrollment);
        return { success: true, enrollmentId: enrollmentId };

    } catch (error) {
        console.error('Error enrolling student:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Unenroll a student from a course
 */
export async function unenrollStudent(studentId: string, courseId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const createQuery = query(ref(database, ENROLLMENTS_REF), orderByChild('studentId'), equalTo(studentId));
        const snapshot = await get(createQuery);

        if (snapshot.exists()) {
            const data = snapshot.val() as Record<string, CourseEnrollment>;
            const enrollment = Object.values(data).find(e => e.courseId === courseId);

            if (enrollment) {
                await remove(ref(database, `${ENROLLMENTS_REF}/${enrollment.id}`));
                return { success: true };
            }
        }

        return { success: false, error: 'Enrollment not found' };
    } catch (error) {
        console.error('Error unenrolling student:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Internal: Get raw enrollments from DB only (no class enrichment).
 * Used by write operations to avoid expensive class scans during enrollment.
 */
async function _getRawEnrollments(studentId: string): Promise<CourseEnrollment[]> {
    const enrollQuery = query(ref(database, ENROLLMENTS_REF), orderByChild('studentId'), equalTo(studentId));
    const snapshot = await get(enrollQuery);
    if (snapshot.exists()) {
        return Object.values(snapshot.val()) as CourseEnrollment[];
    }
    return [];
}

/**
 * Get enrollments by student (enriched with class-linked courses).
 * Use this for read/display operations. For write checks, use _getRawEnrollments.
 */
export async function getEnrollmentsByStudent(studentId: string): Promise<CourseEnrollment[]> {
    try {
        const explicitEnrollments = await _getRawEnrollments(studentId);

        // Enrich: also include class-linked courses that may lack explicit enrollment records.
        // NOTE: isAutoEnroll controls whether enrollment records are auto-written on class join.
        // It does NOT control visibility — any student in a class can see ALL courses linked to it.
        try {
            const { getStudentClasses } = await import('./classManager');
            const classes = await getStudentClasses(studentId);
            for (const cls of classes) {
                const links = await getLinkedCourses(cls.id);
                for (const link of links) {
                    if (!explicitEnrollments.find(e => e.courseId === link.courseId)) {
                        explicitEnrollments.push({
                            id: `auto-${link.id}`,
                            studentId,
                            courseId: link.courseId,
                            enrollmentType: 'class-based',
                            sourceClassId: cls.id,
                            enrolledAt: link.linkedAt,
                            expiresAt: link.expiresAt || 0,
                            status: 'active'
                        });
                    }
                }
            }
        } catch (autoEnrollErr) {
            console.warn('Failed to fetch dynamic class enrollments:', autoEnrollErr);
        }

        return explicitEnrollments;
    } catch (error) {
        console.error('Error getting student enrollments:', error);
        return [];
    }
}

/**
 * Get enrollments by course
 */
export async function getEnrollmentsByCourse(courseId: string): Promise<CourseEnrollment[]> {
    try {
        const enrollQuery = query(ref(database, ENROLLMENTS_REF), orderByChild('courseId'), equalTo(courseId));
        const snapshot = await get(enrollQuery);

        if (snapshot.exists()) {
            return Object.values(snapshot.val()) as CourseEnrollment[];
        }
        return [];
    } catch (error) {
        console.error('Error getting course enrollments:', error);
        return [];
    }
}

/**
 * Get linked courses for a class
 */
export async function getLinkedCourses(classId: string): Promise<ClassCourseLink[]> {
    try {
        const linkQuery = query(ref(database, LINK_REF), orderByChild('classId'), equalTo(classId));
        const snapshot = await get(linkQuery);

        if (snapshot.exists()) {
            return Object.values(snapshot.val()) as ClassCourseLink[];
        }
        return [];
    } catch (error) {
        console.error('Error getting linked courses:', error);
        return [];
    }
}

/**
 * Get linked classes for a course (Template)
 */
export async function getLinkedClasses(originalCourseId: string): Promise<ClassCourseLink[]> {
    try {
        const linkQuery = query(ref(database, LINK_REF), orderByChild('originalCourseId'), equalTo(originalCourseId));
        const snapshot = await get(linkQuery);

        if (snapshot.exists()) {
            return Object.values(snapshot.val()) as ClassCourseLink[];
        }
        return [];
    } catch (error) {
        console.error('Error getting linked classes:', error);
        return [];
    }
}

/**
 * Unlink course from class (removes access)
 */
export async function unlinkCourseFromClass(classId: string, courseId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Find the link
        // We have to query by classId and courseId or just filter
        const linkQuery = query(ref(database, LINK_REF), orderByChild('classId'), equalTo(classId));
        const snapshot = await get(linkQuery);

        if (!snapshot.exists()) return { success: false, error: 'Link not found' };

        const links = Object.values(snapshot.val()) as ClassCourseLink[];
        const targetLink = links.find(l => l.courseId === courseId);

        if (!targetLink) return { success: false, error: 'Link not found' };

        // 2. Remove the link
        await remove(ref(database, `${LINK_REF}/${targetLink.id}`));

        // 3. Unenroll all students associated with this class link
        // We find all enrollments for this courseId with sourceClassId === classId
        // Or just courseId if the course is dedicated to this class (which it is, per copy logic)

        // Since we created a COPY for this class, removing the link implies we should probably 
        // ARCHIVE or DELETE the copied course too?
        // PRD 16.6 says "Keep course intact for reuse with other classes" -> This likely refers to ORIGINAL course.
        // The COPY course is specific to the class. If unlinked, nobody can access it.
        // We should probably archive/delete the copy to avoid junk.

        // Let's first expire/remove enrollments.
        const enrollQuery = query(ref(database, ENROLLMENTS_REF), orderByChild('courseId'), equalTo(courseId));
        const enrollSnapshot = await get(enrollQuery);

        if (enrollSnapshot.exists()) {
            const updates: Record<string, null> = {};
            Object.values(enrollSnapshot.val() as Record<string, CourseEnrollment>).forEach(e => {
                if (e.sourceClassId === classId) {
                    updates[`${ENROLLMENTS_REF}/${e.id}`] = null;
                }
            });
            await update(ref(database), updates);
        }

        // Should we delete the copied course?
        // If it was a unique copy for this class, yes.
        // Task 14.8 test says "link removed, enrollments cleaned".
        // Let's assume we clean up enrollments. Leaving the course copy might be useful for history?
        // But likely we should soft delete it.
        // For now, let's stick to unlinking and removing enrollments.

        return { success: true };

    } catch (error) {
        console.error('Error unlinking course:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// EXPIRATION MANAGEMENT
// ============================================================================

/**
 * Check and handle course expirations
 */
export async function checkCourseExpirations(): Promise<{ processed: number; errors: number }> {
    try {
        const now = Date.now();
        // Query enrollments expiring before now
        const snapshot = await get(ref(database, ENROLLMENTS_REF));
        if (!snapshot.exists()) return { processed: 0, errors: 0 };

        const enrollments = Object.values(snapshot.val()) as CourseEnrollment[];

        let processed = 0;
        let errors = 0;

        const updates: Record<string, any> = {};

        for (const enrollment of enrollments) {
            if (enrollment.status === 'active' && enrollment.expiresAt > 0 && enrollment.expiresAt <= now) {
                updates[`${ENROLLMENTS_REF}/${enrollment.id}/status`] = 'expired';
                processed++;
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(database), updates);
        }

        return { processed, errors };
    } catch (error) {
        console.error('Error checking expirations:', error);
        return { processed: 0, errors: 1 };
    }
}

/**
 * Send expiration warning (e.g. 7 days before)
 */
export async function sendExpirationWarning(classId: string, courseId: string): Promise<void> {
    try {
        const linkQuery = query(ref(database, LINK_REF), orderByChild('classId'), equalTo(classId));
        const snapshot = await get(linkQuery);

        if (snapshot.exists()) {
            const links = Object.values(snapshot.val()) as ClassCourseLink[];
            const link = links.find(l => l.courseId === courseId);

            if (link) {
                const classData = await getClass(classId);
                if (classData) {
                    await createNotification({
                        userId: classData.createdBy,
                        type: 'warning',
                        title: 'Course Expiration Warning',
                        message: `Course for class ${classData.name} will expire soon.`,
                        link: `/teacher/classes/${classId}`
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error sending expiration warning:', error);
    }
}

/**
 * Extend course duration for a class
 */
export async function extendCourseDuration(
    classCourseId: string,
    additionalDuration: { value: number; unit: 'days' | 'months' | 'years' }
): Promise<{ success: boolean; error?: string }> {
    try {
        const linkRef = ref(database, `${LINK_REF}/${classCourseId}`);
        const linkSnapshot = await get(linkRef);

        if (!linkSnapshot.exists()) return { success: false, error: 'Link not found' };

        const link = linkSnapshot.val() as ClassCourseLink;

        if (link.expiresAt > 0 && link.expiresAt < Date.now()) {
            return { success: false, error: 'Course link has already expired. Please re-link.' };
        }

        const currentExp = new Date(link.expiresAt || Date.now());
        if (additionalDuration.unit === 'days') currentExp.setDate(currentExp.getDate() + additionalDuration.value);
        if (additionalDuration.unit === 'months') currentExp.setMonth(currentExp.getMonth() + additionalDuration.value);
        if (additionalDuration.unit === 'years') currentExp.setFullYear(currentExp.getFullYear() + additionalDuration.value);

        const newExpiresAt = currentExp.getTime();

        await update(linkRef, { expiresAt: newExpiresAt });

        const enrollQuery = query(ref(database, ENROLLMENTS_REF), orderByChild('courseId'), equalTo(link.courseId));
        const enrollSnapshot = await get(enrollQuery);

        if (enrollSnapshot.exists()) {
            const updates: Record<string, any> = {};
            Object.values(enrollSnapshot.val() as Record<string, CourseEnrollment>).forEach(e => {
                if (e.status === 'active' || e.status === 'expired') {
                    updates[`${ENROLLMENTS_REF}/${e.id}/expiresAt`] = newExpiresAt;
                }
            });

            if (Object.keys(updates).length > 0) {
                await update(ref(database), updates);
            }
        }

        return { success: true };

    } catch (error) {
        console.error('Error extending course duration:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}


/**
 * Sync class course with original course updates
 * Updates the copy (class course) with metadata from the original course.
 * Does NOT sync modules/content to avoid breaking student progress/customizations.
 */
export async function syncCourseWithOriginal(linkId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Get the link
        const linkSnapshot = await get(ref(database, `${LINK_REF}/${linkId}`));
        if (!linkSnapshot.exists()) {
            return { success: false, error: 'Link not found' };
        }
        const link = linkSnapshot.val() as ClassCourseLink;

        // 2. Get original course
        const originalCourse = await getCourse(link.originalCourseId);
        if (!originalCourse) {
            return { success: false, error: 'Original course not found' };
        }

        // 3. Get linked course (copy)
        const linkedCourse = await getCourse(link.courseId);
        if (!linkedCourse) {
            return { success: false, error: 'Linked class course not found' };
        }

        // 4. Update fields
        // We preserve name and code as they are unique to the class instance
        // We update metadata descriptions and settings
        const updates: Partial<Course> = {
            description: originalCourse.description,
            type: originalCourse.type,
            visibility: linkedCourse.visibility, // Keep class course visibility
            entranceRequirements: originalCourse.entranceRequirements,
            graduateTarget: originalCourse.graduateTarget,
            thumbnailUrl: originalCourse.thumbnailUrl
        };

        const result = await updateCourse(link.courseId, updates);
        return result;

    } catch (error) {
        console.error('Error syncing course:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
