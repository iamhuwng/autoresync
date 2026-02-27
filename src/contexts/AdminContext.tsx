import React, { createContext, useContext, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../components/admin/admin.types';

/**
 * Admin Context - Shared state and utilities for admin pages
 * 
 * Provides:
 * - User authentication and permissions
 * - Shared data (users, courses, classes)
 * - Select options (teachers, students)
 * - Notification actions
 * - Navigation utilities
 */

export interface SelectOption {
    value: string;
    label: string;
}

export interface AdminContextValue {
    // Authentication & Permissions
    currentUser: any | null;
    isSuperAdmin: boolean;
    isTeacher: boolean;

    // Shared Data
    users: User[];
    courses: SelectOption[];
    classes: SelectOption[];

    // Select Options (derived from users)
    teacherOptions: SelectOption[];
    studentOptions: SelectOption[];

    // Notification Actions
    showSuccess: (message: string) => void;
    showError: (message: string) => void;

    // Navigation
    navigateTo: (route: string, state?: any) => void;
}

const AdminContext = createContext<AdminContextValue | undefined>(undefined);

export interface AdminProviderProps {
    children: ReactNode;

    // User & Auth
    currentUser: any | null;
    isSuperAdmin: boolean;
    isTeacher: boolean;

    // Data
    users: User[];
    courses: SelectOption[];
    classes: SelectOption[];

    // Options
    teacherOptions: SelectOption[];
    studentOptions: SelectOption[];

    // Actions
    onShowSuccess: (message: string) => void;
    onShowError: (message: string) => void;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({
    children,
    currentUser,
    isSuperAdmin,
    isTeacher,
    users,
    courses,
    classes,
    teacherOptions,
    studentOptions,
    onShowSuccess,
    onShowError,
}) => {
    const navigate = useNavigate();

    const navigateTo = (route: string, state?: any) => {
        const routes: Record<string, string> = {
            LOBBY: '/',
            ADMIN: '/admin',
            PROFILE: '/profile',
            CLASSES: '/teacher-classes',
        };

        const path = routes[route] || route;
        navigate(path, { state });
    };

    const value: AdminContextValue = {
        // Authentication & Permissions
        currentUser,
        isSuperAdmin,
        isTeacher,

        // Shared Data
        users,
        courses,
        classes,

        // Select Options
        teacherOptions,
        studentOptions,

        // Notification Actions
        showSuccess: onShowSuccess,
        showError: onShowError,

        // Navigation
        navigateTo,
    };

    return (
        <AdminContext.Provider value={value}>
            {children}
        </AdminContext.Provider>
    );
};

/**
 * Hook to access admin context
 * @throws Error if used outside AdminProvider
 */
export const useAdminContext = (): AdminContextValue => {
    const context = useContext(AdminContext);

    if (context === undefined) {
        throw new Error('useAdminContext must be used within an AdminProvider');
    }

    return context;
};

// Export context for testing purposes
export { AdminContext };
