
/**
 * Course Management Types
 */

// Course Visibility Level
export type CourseVisibility = 'private' | 'protected' | 'public';

// Course Type Definition
// Can be extended dynamically, but these are defaults
export type CourseType = 'IELTS' | 'THCS' | 'THPT' | 'TOEIC' | 'Communicative' | 'Other' | string;

export interface CourseTypeDefinition {
    id: string;
    name: string;
    isSystem: boolean;
    createdBy?: string;
    createdAt: number;
}

export interface CourseTypeRequest {
    id: string;
    teacherId: string;
    typeName: string;
    requestedAt: number;
    status: 'pending' | 'approved' | 'rejected';
    approvedBy?: string;
    approvedAt?: number;
    rejectionReason?: string;
}

// Main Course Interface
export interface Course {
    id: string;
    name: string;
    code: string; // Unique, e.g., IELTS-20260130-1430
    type: string; // CourseType string or custom
    ownerId: string; // Teacher UID

    // Duration: How long access lasts once enrolled/linked
    duration: {
        value: number;
        unit: 'days' | 'months' | 'years';
    };

    visibility: CourseVisibility;

    // Optional Metadata
    entranceRequirements?: string; // e.g. "IELTS 4.0+"
    graduateTarget?: string; // e.g. "IELTS 6.5"
    description?: string;
    note?: string; // Private teacher notes
    thumbnailUrl?: string;

    // Status
    createdAt: number;
    updatedAt?: number;
    archivedAt?: number | null; // Soft delete timestamp
    hardDeleteAt?: number | null; // Scheduled permanent delete

    // Request Settings
    autoApproveWithCode?: boolean; // If true, entering code auto-approves protected request

    // Linking / Cloning properties
    isClassInstance?: boolean; // True if this is a deep copy created specifically for a class
    originalName?: string;     // The clean original name of the course (without the class name appended)
}

// Module Access Type
export type ModuleAccessType = 'open' | 'sequential';

// Module Interface
export interface Module {
    id: string;
    courseId: string;
    name: string;
    order: number;
    accessType: ModuleAccessType;
    materialsCount?: number;
    // Sync tracking fields (set when module is a copy created by linkCourseToClass)
    originalModuleId?: string;  // ID of the source module in the original course template
    lastSyncedAt?: number;      // Timestamp of last sync check or dismiss
    // Optional: Completion criteria, etc.
}

// Course Material (Junction between Course/Module and Material/Test)
export interface CourseMaterial {
    id: string; // unique ID for this link
    courseId: string;
    moduleId: string;
    materialId: string; // ID of the test/quiz

    order: number;
    linkedAt?: number; // When this material was linked to the module

    // Linking logic
    isCopy: boolean; // true if it's a deep copy, false if linked
    originalMaterialId?: string; // if copy, points to source
    syncedAt?: number; // last sync timestamp
}

// Enrollment Type
export type EnrollmentType = 'class-based' | 'individual' | 'public';

// Course Enrollment
export interface CourseEnrollment {
    id: string;
    studentId: string;
    courseId: string;
    enrollmentType: EnrollmentType;
    sourceClassId?: string; // if class-based

    enrolledAt: number;
    expiresAt: number; // calculated from course duration

    status: 'active' | 'expired' | 'completed';
    completedAt?: number;
}

// Class-Course Link (for auto-enrollment)
export interface ClassCourseLink {
    id: string;
    classId: string;
    courseId: string; // References a COPIED course unique to this class usually, or the main course?
    // PRD 4.18.1 says "Courses are COPIED when linked to a class"
    // So this courseId points to the independent copy.
    originalCourseId: string; // Points to the template course

    linkedAt: number;
    expiresAt: number; // When the course access expires for this class linkage context? 
    // Or is it duration based? PRD 4.18.4 says "1-month course linked March 1 -> expires April 1 for that class"
    // So yes, the link itself might have expiration or the enrollments do.

    isAutoEnroll: boolean; // If true, new students in class get enrolled automatically
}

// Student Progress Tracking
export interface StudentCourseProgress {
    studentId: string;
    courseId: string;
    completedMaterials: Record<string, {
        completedAt: number;
        score?: number;
    }>;
    completedModules: Record<string, {
        completedAt: number;
    }>;
    lastAccessedAt: number;
}

/**
 * Course Enrollment Request (Join / Unenroll)
 */
export interface CourseRequest {
    id: string;
    studentId: string;
    studentName?: string; // Cache for display
    courseId: string;
    courseName?: string; // Cache for display
    teacherId: string; // Course owner
    type: 'join' | 'unenroll';
    status: 'pending' | 'approved' | 'denied' | 'expired';
    requestedAt: number;
    expiresAt: number; // 7 days from requestedAt
    rejectionReason?: string;
    processedAt?: number;
    processedBy?: string;
}
