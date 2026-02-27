/**
 * Attendance Service
 * 
 * Handles module attendance tracking, completion status, and exceptions.
 */

import { database } from './firebase';
import { ref, set, get, remove } from 'firebase/database';
import type {
    ModuleAttendance,
    AttendeeRecord,
    ModuleCompletion,
    ModuleException,
    StudentAttendanceSummary,
    AttendanceCalculationOptions
} from '../types/attendance.types';

/**
 * Record attendance for a student joining a module session
 */
export async function recordAttendance(
    courseId: string,
    classId: string,
    moduleId: string,
    studentId: string,
    studentName: string,
    sessionId: string
): Promise<void> {
    const attendanceRef = ref(
        database,
        `module_attendance/${courseId}/${classId}/${moduleId}/attendees/${studentId}`
    );

    const attendeeRecord: AttendeeRecord = {
        studentId,
        studentName,
        joinedAt: Date.now(),
        sessionId
    };

    await set(attendanceRef, attendeeRecord);

    // Update last updated timestamp
    const lastUpdatedRef = ref(
        database,
        `module_attendance/${courseId}/${classId}/${moduleId}/lastUpdated`
    );
    await set(lastUpdatedRef, Date.now());
}

/**
 * Update attendance record with test result reference
 */
export async function linkTestResultToAttendance(
    courseId: string,
    classId: string,
    moduleId: string,
    studentId: string,
    testResultId: string
): Promise<void> {
    const attendanceRef = ref(
        database,
        `module_attendance/${courseId}/${classId}/${moduleId}/attendees/${studentId}/testResultId`
    );

    await set(attendanceRef, testResultId);
}

/**
 * Get attendance record for a specific module
 */
export async function getModuleAttendance(
    courseId: string,
    classId: string,
    moduleId: string
): Promise<ModuleAttendance | null> {
    const attendanceRef = ref(
        database,
        `module_attendance/${courseId}/${classId}/${moduleId}`
    );

    const snapshot = await get(attendanceRef);

    if (!snapshot.exists()) {
        return null;
    }

    const data = snapshot.val();
    const attendeesObj = data.attendees || {};
    const attendees: AttendeeRecord[] = Object.values(attendeesObj);

    // Get class info to calculate total students
    const classRef = ref(database, `classes/${classId}`);
    const classSnapshot = await get(classRef);
    const classData = classSnapshot.val();
    const totalStudentsInClass = classData?.students ? Object.keys(classData.students).length : 0;

    // Get course and module names
    const courseRef = ref(database, `courses/${courseId}`);
    const courseSnapshot = await get(courseRef);
    const courseData = courseSnapshot.val();
    const courseName = courseData?.title || 'Unknown Course';
    const moduleName = courseData?.modules?.[moduleId]?.title || 'Unknown Module';

    const attendancePercentage = totalStudentsInClass > 0
        ? (attendees.length / totalStudentsInClass) * 100
        : 0;

    return {
        courseId,
        courseName,
        classId,
        className: classData?.name || 'Unknown Class',
        moduleId,
        moduleName,
        attendees,
        totalStudentsInClass,
        attendancePercentage,
        lastUpdated: data.lastUpdated || Date.now()
    };
}

/**
 * Mark a module as complete
 */
export async function markModuleComplete(
    courseId: string,
    classId: string,
    moduleId: string,
    teacherId: string,
    teacherName: string
): Promise<void> {
    // Get current attendance to snapshot the count
    const attendance = await getModuleAttendance(courseId, classId, moduleId);
    const totalAttendees = attendance?.attendees.length || 0;

    const completionRef = ref(
        database,
        `module_completions/${courseId}/${classId}/${moduleId}`
    );

    const completion: ModuleCompletion = {
        courseId,
        classId,
        moduleId,
        completedAt: Date.now(),
        completedBy: teacherId,
        completedByName: teacherName,
        totalAttendees,
        exceptions: []
    };

    await set(completionRef, completion);
}

/**
 * Check if a module is marked as complete
 */
export async function isModuleComplete(
    courseId: string,
    classId: string,
    moduleId: string
): Promise<boolean> {
    const completionRef = ref(
        database,
        `module_completions/${courseId}/${classId}/${moduleId}`
    );

    const snapshot = await get(completionRef);
    return snapshot.exists();
}

/**
 * Get module completion record
 */
export async function getModuleCompletion(
    courseId: string,
    classId: string,
    moduleId: string
): Promise<ModuleCompletion | null> {
    const completionRef = ref(
        database,
        `module_completions/${courseId}/${classId}/${moduleId}`
    );

    const snapshot = await get(completionRef);

    if (!snapshot.exists()) {
        return null;
    }

    return snapshot.val() as ModuleCompletion;
}

/**
 * Add an exception for a student who missed a module
 */
export async function addException(
    courseId: string,
    classId: string,
    moduleId: string,
    studentId: string,
    studentName: string,
    reason: string,
    teacherId: string,
    teacherName: string
): Promise<void> {
    const exceptionRef = ref(
        database,
        `module_exceptions/${courseId}/${classId}/${moduleId}/${studentId}`
    );

    const exception: ModuleException = {
        studentId,
        studentName,
        courseId,
        classId,
        moduleId,
        reason,
        addedAt: Date.now(),
        addedBy: teacherId,
        addedByName: teacherName
    };

    await set(exceptionRef, exception);

    // Add student ID to the exceptions array in module completion
    const completionRef = ref(
        database,
        `module_completions/${courseId}/${classId}/${moduleId}/exceptions`
    );

    const snapshot = await get(completionRef);
    const exceptions = snapshot.exists() ? snapshot.val() : [];

    if (!exceptions.includes(studentId)) {
        exceptions.push(studentId);
        await set(completionRef, exceptions);
    }
}

/**
 * Remove an exception for a student
 */
export async function removeException(
    courseId: string,
    classId: string,
    moduleId: string,
    studentId: string
): Promise<void> {
    const exceptionRef = ref(
        database,
        `module_exceptions/${courseId}/${classId}/${moduleId}/${studentId}`
    );

    await remove(exceptionRef);

    // Remove student ID from the exceptions array in module completion
    const completionRef = ref(
        database,
        `module_completions/${courseId}/${classId}/${moduleId}/exceptions`
    );

    const snapshot = await get(completionRef);
    if (snapshot.exists()) {
        const exceptions: string[] = snapshot.val();
        const updatedExceptions = exceptions.filter(id => id !== studentId);
        await set(completionRef, updatedExceptions);
    }
}

/**
 * Get all exceptions for a module
 */
export async function getModuleExceptions(
    courseId: string,
    classId: string,
    moduleId: string
): Promise<ModuleException[]> {
    const exceptionsRef = ref(
        database,
        `module_exceptions/${courseId}/${classId}/${moduleId}`
    );

    const snapshot = await get(exceptionsRef);

    if (!snapshot.exists()) {
        return [];
    }

    const exceptionsObj = snapshot.val();
    return Object.values(exceptionsObj);
}

/**
 * Get a student's attendance percentage for a course
 */
export async function getStudentAttendance(
    studentId: string,
    courseId: string,
    options: AttendanceCalculationOptions = {}
): Promise<number> {
    const { includeExceptions = true } = options;

    // Get all modules in the course
    const courseRef = ref(database, `courses/${courseId}/modules`);
    const courseSnapshot = await get(courseRef);

    if (!courseSnapshot.exists()) {
        return 0;
    }

    const modules = courseSnapshot.val();
    const moduleIds = Object.keys(modules);
    const totalModules = moduleIds.length;

    if (totalModules === 0) {
        return 0;
    }

    let attendedCount = 0;
    let exceptedCount = 0;

    // Check attendance for each module
    for (const moduleId of moduleIds) {
        // Check if student attended
        const attendanceRef = ref(
            database,
            `module_attendance/${courseId}/${studentId}/attendees/${studentId}`
        );
        const attendanceSnapshot = await get(attendanceRef);

        if (attendanceSnapshot.exists()) {
            attendedCount++;
            continue;
        }

        // Check if student has exception
        if (includeExceptions) {
            const exceptionRef = ref(
                database,
                `module_exceptions/${courseId}/${studentId}/${moduleId}/${studentId}`
            );
            const exceptionSnapshot = await get(exceptionRef);

            if (exceptionSnapshot.exists()) {
                exceptedCount++;
            }
        }
    }

    const effectiveAttendance = includeExceptions
        ? attendedCount + exceptedCount
        : attendedCount;

    return (effectiveAttendance / totalModules) * 100;
}

/**
 * Get detailed attendance summary for a student in a course
 */
export async function getStudentAttendanceSummary(
    studentId: string,
    courseId: string,
    options: AttendanceCalculationOptions = {}
): Promise<StudentAttendanceSummary> {
    const { includeExceptions = true } = options;

    // Get all modules in the course
    const courseRef = ref(database, `courses/${courseId}/modules`);
    const courseSnapshot = await get(courseRef);

    const modules = courseSnapshot.exists() ? courseSnapshot.val() : {};
    const moduleIds = Object.keys(modules);
    const totalModules = moduleIds.length;

    let attendedModules = 0;
    let exceptedModules = 0;

    // Check attendance for each module
    for (const moduleId of moduleIds) {
        // Check if student attended
        const attendanceRef = ref(
            database,
            `module_attendance/${courseId}/${studentId}/attendees/${studentId}`
        );
        const attendanceSnapshot = await get(attendanceRef);

        if (attendanceSnapshot.exists()) {
            attendedModules++;
            continue;
        }

        // Check if student has exception
        const exceptionRef = ref(
            database,
            `module_exceptions/${courseId}/${studentId}/${moduleId}/${studentId}`
        );
        const exceptionSnapshot = await get(exceptionRef);

        if (exceptionSnapshot.exists()) {
            exceptedModules++;
        }
    }

    const effectiveAttendance = includeExceptions
        ? attendedModules + exceptedModules
        : attendedModules;

    const attendancePercentage = totalModules > 0
        ? (effectiveAttendance / totalModules) * 100
        : 0;

    const missedModules = totalModules - attendedModules - exceptedModules;

    return {
        studentId,
        courseId,
        totalModules,
        attendedModules,
        exceptedModules,
        attendancePercentage,
        missedModules,
        lastUpdated: Date.now()
    };
}

/**
 * Get all students who attended a specific module
 */
export async function getModuleAttendees(
    courseId: string,
    classId: string,
    moduleId: string
): Promise<AttendeeRecord[]> {
    const attendance = await getModuleAttendance(courseId, classId, moduleId);
    return attendance?.attendees || [];
}

/**
 * Check if a student attended a specific module
 */
export async function hasStudentAttended(
    courseId: string,
    classId: string,
    moduleId: string,
    studentId: string
): Promise<boolean> {
    const attendanceRef = ref(
        database,
        `module_attendance/${courseId}/${classId}/${moduleId}/attendees/${studentId}`
    );

    const snapshot = await get(attendanceRef);
    return snapshot.exists();
}
