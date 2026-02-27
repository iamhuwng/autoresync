/**
 * TypeScript declarations for AuthContext
 * Provides type safety for the authentication context
 */

import { User } from 'firebase/auth';
import { UserCredential } from 'firebase/auth';
import { ReactNode } from 'react';

/**
 * User profile stored in Firebase Realtime Database
 */
export interface UserProfile {
    uid: string;
    email: string;
    displayName?: string | null;
    photoURL?: string | null;
    role: 'student' | 'teacher' | 'super_admin';
    createdAt?: any; // Firebase ServerTimestamp
    lastLoginAt?: any; // Firebase ServerTimestamp
    status?: 'active' | 'inactive' | 'suspended';

    // Optional profile fields (from Profile Completion)
    firstName?: string;
    familyName?: string;
    dateOfBirth?: string;
    phone?: {
        countryCode: string;
        number: string;
    };
    address?: {
        street?: string;
        city?: string;
        province?: string;
        country?: string;
    };
    school?: string;
    job?: string;
    avatarUrl?: string;
    profileCompletedAt?: number;
}

/**
 * Authentication context value
 */
export interface AuthContextValue {
    /** Current Firebase Auth user */
    user: User | null;

    /** User profile from database */
    profile: UserProfile | null;

    /** Loading state during initial auth check */
    loading: boolean;

    /** Authentication error if any */
    error: Error | null;

    /** Login with Google popup */
    login: () => Promise<UserCredential>;

    /** Login with email and password */
    loginWithEmail: (email: string, password: string) => Promise<UserCredential>;

    /** Register new user with email and password */
    registerWithEmail: (
        email: string,
        password: string,
        role?: 'student' | 'teacher',
        displayName?: string
    ) => Promise<UserCredential>;

    /** Logout current user */
    logout: () => Promise<void>;

    /** Helper: Check if user is super admin */
    isAdmin: boolean;

    /** Helper: Check if user is teacher or super admin */
    isTeacher: boolean;
}

/**
 * Auth Provider props
 */
export interface AuthProviderProps {
    children: ReactNode;
}

/**
 * Auth Provider Component
 */
export function AuthProvider(props: AuthProviderProps): JSX.Element;

/**
 * useAuth Hook
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextValue;

/**
 * Auth Context (for advanced use cases)
 */
declare const AuthContext: React.Context<AuthContextValue | undefined>;
export default AuthContext;
