
import { User } from 'firebase/auth';
import { UserRole } from '../types/security.types';

export interface AuthContextType {
    user: User | null;
    profile: any;
    loading: boolean;
    error: Error | null;
    login: () => Promise<any>;
    loginWithEmail: (email: string, password: string) => Promise<any>;
    registerWithEmail: (email: string, password: string, displayName: string) => Promise<any>;
    logout: () => Promise<void>;
    updateProfile?: (data: any) => Promise<void>;

    // Security state (Task 5.0)
    isBlocked: boolean;
    forceLogoutReason: string | null;

    // Multi-role context switching (Task 7.0)
    activeRole: UserRole | null;
    availableRoles: UserRole[];
    hasMultipleRoles: boolean;
    switchRole: (role: UserRole) => Promise<void>;
    getEffectiveRole: () => UserRole | null;
    primaryRole: UserRole | null;

    // Role helpers
    isAdmin: boolean;
    isTeacher: boolean;
    isStudent: boolean;

    // User status
    isActive: boolean;
}

export function useAuth(): AuthContextType;
