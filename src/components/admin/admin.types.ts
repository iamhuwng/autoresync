/**
 * Shared type definitions for Admin components
 */

export interface User {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
    role: 'student' | 'teacher' | 'super_admin';
    status?: 'active' | 'blocked';
    studentGroup?: string;
    createdAt?: number;
    updatedAt?: number;
}

export interface Assignment {
    id: string;
    studentId: string;
    teacherId: string;
    courseId?: string;
    classId?: string;
    assignedAt: number;
    assignedBy?: string;
    status?: 'active' | 'completed' | 'removed';
}

export interface SelectOption {
    value: string;
    label: string;
}
