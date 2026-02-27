/**
 * courseMaterialAccessService.ts
 * 
 * Service for verifying course material access in solo mode.
 * Enforces sequential module unlock and teacher lock/unlock controls.
 * 
 * Per PRD-0016, Task 7.6:
 * - Respect sequential module unlock
 * - Respect teacher lock/unlock controls
 * - Use existing ModuleProgress system
 * 
 * @module services/courseMaterialAccessService
 */

import { ref, get } from 'firebase/database';
import { database } from './firebase';
import {
    getCourse,
    getModulesByCourse,
    getMaterialsByCourse,
    getMaterialsByModule,
    getStudentCourseProgress
} from './courseManager';
import type {
    Course,
    Module,
    CourseMaterial,
    StudentCourseProgress,
    ModuleAccessType
} from '../types/course.types';

// ============================================================================
// TYPES
// ============================================================================

export type MaterialAccessStatus =
    | 'accessible'           // Can be practiced
    | 'locked_sequential'    // Previous module not completed
    | 'locked_teacher'       // Teacher has locked this module
    | 'not_enrolled'         // Student not enrolled in course
    | 'course_expired'       // Enrollment expired
    | 'course_archived'      // Course has been archived
    | 'material_not_found';  // Material doesn't exist

export interface MaterialAccessResult {
    status: MaterialAccessStatus;
    canAccess: boolean;
    message: string;
    /** For sequential locks, which modules need completion */
    requiredModules?: string[];
    /** Module this material belongs to */
    moduleId?: string;
    /** Course this material belongs to */
    courseId?: string;
}

export interface ModuleAccessResult {
    moduleId: string;
    moduleName: string;
    accessType: ModuleAccessType;
    isAccessible: boolean;
    isCompleted: boolean;
    status: 'available' | 'locked' | 'completed';
    /** For sequential, index of this module (0-based) */
    order: number;
    /** Number of required previous modules not yet completed */
    prerequisitesMissing: number;
}

export interface CourseAccessContext {
    studentId: string;
    courseId: string;
    /** From class link if applicable */
    classId?: string;
    /** Override for teacher control */
    teacherOverride?: {
        moduleId: string;
        forceUnlock: boolean;
    };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COURSE_ENROLLMENTS_REF = 'course_enrollments';
const CLASS_PROGRESS_REF = 'class_progress'; // For teacher-controlled module locks

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if student is enrolled in a course
 */
async function checkEnrollment(
    studentId: string,
    courseId: string
): Promise<{ enrolled: boolean; expired: boolean; enrollment: any | null }> {
    try {
        // Check direct course enrollment
        const enrollmentRef = ref(database, COURSE_ENROLLMENTS_REF);
        const snapshot = await get(enrollmentRef);

        if (!snapshot.exists()) {
            return { enrolled: false, expired: false, enrollment: null };
        }

        const allEnrollments = Object.values(snapshot.val()) as any[];
        const studentEnrollment = allEnrollments.find(
            e => e.studentId === studentId && e.courseId === courseId
        );

        if (!studentEnrollment) {
            return { enrolled: false, expired: false, enrollment: null };
        }

        const now = Date.now();
        const isExpired = studentEnrollment.expiresAt && studentEnrollment.expiresAt < now;
        const isActive = studentEnrollment.status === 'active' && !isExpired;

        return {
            enrolled: isActive,
            expired: isExpired,
            enrollment: studentEnrollment
        };
    } catch (error) {
        console.error('Error checking enrollment:', error);
        return { enrolled: false, expired: false, enrollment: null };
    }
}

/**
 * Get teacher-controlled module status for a class
 */
async function getTeacherModuleControl(
    classId: string,
    moduleId: string
): Promise<{ status: 'available' | 'locked' | 'completed' } | null> {
    try {
        const progressRef = ref(database, `${CLASS_PROGRESS_REF}/${classId}/modules/${moduleId}`);
        const snapshot = await get(progressRef);

        if (snapshot.exists()) {
            return snapshot.val();
        }
        return null;
    } catch (error) {
        console.error('Error getting teacher module control:', error);
        return null;
    }
}

/**
 * Check if all previous modules are completed (for sequential access)
 */
function checkSequentialAccess(
    targetModule: Module,
    allModules: Module[],
    completedModules: Record<string, { completedAt: number }> | undefined
): { accessible: boolean; prerequisitesMissing: number; requiredModules: string[] } {
    // Sort modules by order
    const sortedModules = [...allModules].sort((a, b) => a.order - b.order);
    const targetIndex = sortedModules.findIndex(m => m.id === targetModule.id);

    if (targetIndex <= 0) {
        // First module or not found - always accessible
        return { accessible: true, prerequisitesMissing: 0, requiredModules: [] };
    }

    // Check all previous modules
    const requiredModules: string[] = [];
    let prerequisitesMissing = 0;

    for (let i = 0; i < targetIndex; i++) {
        const previousModule = sortedModules[i];
        const isCompleted = completedModules && completedModules[previousModule.id];

        if (!isCompleted) {
            prerequisitesMissing++;
            requiredModules.push(previousModule.id);
        }
    }

    return {
        accessible: prerequisitesMissing === 0,
        prerequisitesMissing,
        requiredModules
    };
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if a student can access a specific course material in solo mode
 */
export async function checkMaterialAccess(
    studentId: string,
    materialId: string,
    context?: Partial<CourseAccessContext>
): Promise<MaterialAccessResult> {
    try {
        // 1. Find the material and its module/course
        const materialsRef = ref(database, 'course_materials');
        const snapshot = await get(materialsRef);

        if (!snapshot.exists()) {
            return {
                status: 'material_not_found',
                canAccess: false,
                message: 'Material not found in any course'
            };
        }

        const allMaterials = Object.values(snapshot.val()) as CourseMaterial[];
        const courseMaterial = allMaterials.find(m => m.materialId === materialId);

        if (!courseMaterial) {
            // Material might not be linked to a course - it's a standalone
            // Standalone materials are always accessible
            return {
                status: 'accessible',
                canAccess: true,
                message: 'Material is not linked to a course - no restrictions'
            };
        }

        const { courseId, moduleId } = courseMaterial;

        // 2. Check if course exists and is not archived
        const course = await getCourse(courseId);
        if (!course) {
            return {
                status: 'material_not_found',
                canAccess: false,
                message: 'Course not found',
                courseId,
                moduleId
            };
        }

        if (course.archivedAt) {
            return {
                status: 'course_archived',
                canAccess: false,
                message: 'This course has been archived',
                courseId,
                moduleId
            };
        }

        // 3. Check enrollment
        const { enrolled, expired, enrollment } = await checkEnrollment(studentId, courseId);

        if (!enrolled) {
            if (expired) {
                return {
                    status: 'course_expired',
                    canAccess: false,
                    message: 'Your enrollment in this course has expired',
                    courseId,
                    moduleId
                };
            }

            // Check if course is public
            if (course.visibility === 'public') {
                // Public courses don't require enrollment
            } else {
                return {
                    status: 'not_enrolled',
                    canAccess: false,
                    message: 'You are not enrolled in this course',
                    courseId,
                    moduleId
                };
            }
        }

        // 4. Get module info
        const modules = await getModulesByCourse(courseId);
        const module = modules.find(m => m.id === moduleId);

        if (!module) {
            return {
                status: 'material_not_found',
                canAccess: false,
                message: 'Module not found',
                courseId,
                moduleId
            };
        }

        // 5. Check teacher-controlled lock (if class context provided)
        if (context?.classId) {
            const teacherControl = await getTeacherModuleControl(context.classId, moduleId);

            if (teacherControl?.status === 'locked') {
                // Check for teacher override
                if (context.teacherOverride?.moduleId === moduleId && context.teacherOverride.forceUnlock) {
                    // Teacher explicitly unlocked for this student
                } else {
                    return {
                        status: 'locked_teacher',
                        canAccess: false,
                        message: 'This module is locked by your teacher',
                        courseId,
                        moduleId
                    };
                }
            }
        }

        // 6. Check sequential access
        if (module.accessType === 'sequential') {
            const progress = await getStudentCourseProgress(studentId, courseId);
            const sequentialCheck = checkSequentialAccess(
                module,
                modules,
                progress?.completedModules
            );

            if (!sequentialCheck.accessible) {
                return {
                    status: 'locked_sequential',
                    canAccess: false,
                    message: `Complete ${sequentialCheck.prerequisitesMissing} previous module(s) first`,
                    requiredModules: sequentialCheck.requiredModules,
                    courseId,
                    moduleId
                };
            }
        }

        // All checks passed
        return {
            status: 'accessible',
            canAccess: true,
            message: 'Material is accessible',
            courseId,
            moduleId
        };
    } catch (error) {
        console.error('Error checking material access:', error);
        return {
            status: 'material_not_found',
            canAccess: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get access status for all modules in a course
 */
export async function getCourseModuleAccessMap(
    studentId: string,
    courseId: string,
    classId?: string
): Promise<ModuleAccessResult[]> {
    try {
        const modules = await getModulesByCourse(courseId);
        const progress = await getStudentCourseProgress(studentId, courseId);
        const completedModules = progress?.completedModules || {};

        const results: ModuleAccessResult[] = [];
        const sortedModules = [...modules].sort((a, b) => a.order - b.order);

        for (const module of sortedModules) {
            const isCompleted = Boolean(completedModules[module.id]);

            // Check teacher lock
            let teacherLocked = false;
            if (classId) {
                const teacherControl = await getTeacherModuleControl(classId, module.id);
                teacherLocked = teacherControl?.status === 'locked';
            }

            // Check sequential access
            let sequentialLocked = false;
            let prerequisitesMissing = 0;

            if (module.accessType === 'sequential' && !isCompleted) {
                const sequentialCheck = checkSequentialAccess(
                    module,
                    sortedModules,
                    completedModules
                );
                sequentialLocked = !sequentialCheck.accessible;
                prerequisitesMissing = sequentialCheck.prerequisitesMissing;
            }

            // Determine final status
            let status: 'available' | 'locked' | 'completed';
            let isAccessible: boolean;

            if (isCompleted) {
                status = 'completed';
                isAccessible = true;
            } else if (teacherLocked || sequentialLocked) {
                status = 'locked';
                isAccessible = false;
            } else {
                status = 'available';
                isAccessible = true;
            }

            results.push({
                moduleId: module.id,
                moduleName: module.name,
                accessType: module.accessType,
                isAccessible,
                isCompleted,
                status,
                order: module.order,
                prerequisitesMissing
            });
        }

        return results;
    } catch (error) {
        console.error('Error getting module access map:', error);
        return [];
    }
}

/**
 * Get accessible materials for solo practice from a course
 */
export async function getAccessibleCourseMaterials(
    studentId: string,
    courseId: string,
    classId?: string
): Promise<{
    accessible: CourseMaterial[];
    locked: CourseMaterial[];
    moduleAccessMap: Map<string, ModuleAccessResult>;
}> {
    try {
        const materials = await getMaterialsByCourse(courseId);
        const moduleAccess = await getCourseModuleAccessMap(studentId, courseId, classId);

        // Create lookup map
        const moduleAccessMap = new Map<string, ModuleAccessResult>();
        moduleAccess.forEach(ma => moduleAccessMap.set(ma.moduleId, ma));

        const accessible: CourseMaterial[] = [];
        const locked: CourseMaterial[] = [];

        for (const material of materials) {
            const moduleStatus = moduleAccessMap.get(material.moduleId);

            if (moduleStatus?.isAccessible) {
                accessible.push(material);
            } else {
                locked.push(material);
            }
        }

        return {
            accessible,
            locked,
            moduleAccessMap
        };
    } catch (error) {
        console.error('Error getting accessible materials:', error);
        return {
            accessible: [],
            locked: [],
            moduleAccessMap: new Map()
        };
    }
}

/**
 * Quick check if a material can be accessed (for UI buttons)
 */
export async function canAccessMaterial(
    studentId: string,
    materialId: string,
    classId?: string
): Promise<boolean> {
    const result = await checkMaterialAccess(studentId, materialId, { classId });
    return result.canAccess;
}

export default {
    checkMaterialAccess,
    getCourseModuleAccessMap,
    getAccessibleCourseMaterials,
    canAccessMaterial
};
