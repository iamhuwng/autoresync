/**
 * Attendance Types
 * 
 * Types for module attendance tracking, completion status, and exceptions.
 */

/**
 * Record of a single student's attendance for a module
 */
export interface AttendeeRecord {
    studentId: string;
    studentName: string;
    joinedAt: number; // timestamp when student joined the session
    sessionId: string; // the session they attended
    testResultId?: string; // optional reference to their test result
}

/**
 * Attendance record for a specific module
 */
export interface ModuleAttendance {
    courseId: string;
    courseName: string;
    classId: string;
    className: string;
    moduleId: string;
    moduleName: string;
    attendees: AttendeeRecord[];
    totalStudentsInClass: number;
    attendancePercentage: number; // calculated: (attendees.length / totalStudentsInClass) * 100
    lastUpdated: number; // timestamp
}

/**
 * Module completion status set by teacher
 */
export interface ModuleCompletion {
    courseId: string;
    classId: string;
    moduleId: string;
    completedAt: number; // timestamp when teacher marked as complete
    completedBy: string; // teacher UID
    completedByName: string; // teacher name
    totalAttendees: number; // snapshot of attendance at completion time
    exceptions: string[]; // array of student UIDs with exceptions
}

/**
 * Exception record for a student who missed a module
 */
export interface ModuleException {
    studentId: string;
    studentName: string;
    courseId: string;
    classId: string;
    moduleId: string;
    reason: string; // e.g., "Sick leave", "Family emergency", "Excused absence"
    addedAt: number; // timestamp
    addedBy: string; // teacher UID
    addedByName: string; // teacher name
}

/**
 * Student's attendance summary for a course
 */
export interface StudentAttendanceSummary {
    studentId: string;
    courseId: string;
    totalModules: number; // total modules in the course
    attendedModules: number; // modules the student attended
    exceptedModules: number; // modules with exceptions
    attendancePercentage: number; // (attendedModules + exceptedModules) / totalModules * 100
    missedModules: number; // totalModules - attendedModules - exceptedModules
    lastUpdated: number;
}

/**
 * Options for calculating attendance
 */
export interface AttendanceCalculationOptions {
    includeExceptions?: boolean; // whether to count exceptions as attended (default: true)
    courseId?: string; // filter by specific course
    classId?: string; // filter by specific class
    startDate?: number; // filter by date range (timestamp)
    endDate?: number; // filter by date range (timestamp)
}
