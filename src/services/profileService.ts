/**
 * Profile Service
 * 
 * Handles CRUD operations for user profiles in Firebase Realtime Database.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { ref, get, update, set } from 'firebase/database';
import { database } from './firebase';
import { UserProfile } from '../types/user.types';

// ============================================
// PROFILE CRUD OPERATIONS
// ============================================

/**
 * Get user profile from Firebase
 * @param uid User ID
 * @returns User profile or null if not found
 */
export async function getProfile(uid: string): Promise<UserProfile | null> {
    try {
        const profileRef = ref(database, `users/${uid}`);
        const snapshot = await get(profileRef);

        if (!snapshot.exists()) {
            return null;
        }

        return snapshot.val() as UserProfile;
    } catch (error) {
        console.error('Error fetching profile:', error);
        throw new Error('Failed to fetch user profile');
    }
}

/**
 * Update user profile in Firebase
 * @param uid User ID
 * @param data Partial profile data to update
 */
export async function updateProfile(
    uid: string,
    data: Partial<UserProfile>
): Promise<void> {
    try {
        const profileRef = ref(database, `users/${uid}`);
        await update(profileRef, data);
    } catch (error) {
        console.error('Error updating profile:', error);
        throw new Error('Failed to update user profile');
    }
}

/**
 * Check if user profile is complete
 * A profile is considered complete if it has all required fields filled
 * @param uid User ID
 * @returns True if profile is complete
 */
export async function isProfileComplete(uid: string): Promise<boolean> {
    try {
        const profile = await getProfile(uid);

        if (!profile) {
            return false;
        }

        // Check if profileCompletedAt is set
        if (profile.profileCompletedAt) {
            return true;
        }

        // Check required fields
        const hasRequiredFields = !!(
            profile.firstName &&
            profile.familyName &&
            profile.dateOfBirth &&
            profile.phone?.countryCode &&
            profile.phone?.number &&
            profile.address?.street &&
            profile.address?.city &&
            profile.address?.province &&
            profile.address?.country
        );

        return hasRequiredFields;
    } catch (error) {
        console.error('Error checking profile completion:', error);
        return false;
    }
}

/**
 * Mark user profile as complete
 * Sets the profileCompletedAt timestamp
 * @param uid User ID
 */
export async function markProfileComplete(uid: string): Promise<void> {
    try {
        const profileRef = ref(database, `users/${uid}`);
        await update(profileRef, {
            profileCompletedAt: Date.now(),
        });
    } catch (error) {
        console.error('Error marking profile as complete:', error);
        throw new Error('Failed to mark profile as complete');
    }
}

/**
 * Create a new user profile
 * Used during initial registration
 * @param uid User ID
 * @param profileData Initial profile data
 */
export async function createProfile(
    uid: string,
    profileData: Partial<UserProfile>
): Promise<void> {
    try {
        const profileRef = ref(database, `users/${uid}`);

        const defaultProfile: Partial<UserProfile> = {
            uid,
            createdAt: Date.now(),
            lastLoginAt: Date.now(),
            status: 'active',
            profileCompletedAt: null,
            ...profileData,
        };

        await set(profileRef, defaultProfile);
    } catch (error) {
        console.error('Error creating profile:', error);
        throw new Error('Failed to create user profile');
    }
}

/**
 * Update last login timestamp
 * @param uid User ID
 */
export async function updateLastLogin(uid: string): Promise<void> {
    try {
        const profileRef = ref(database, `users/${uid}`);
        await update(profileRef, {
            lastLoginAt: Date.now(),
        });
    } catch (error) {
        console.error('Error updating last login:', error);
        // Don't throw - this is not critical
    }
}

/**
 * Get profile completion status for multiple users
 * Useful for admin/teacher views
 * @param uids Array of user IDs
 * @returns Map of uid -> completion status
 */
export async function getProfileCompletionStatus(
    uids: string[]
): Promise<Map<string, boolean>> {
    const statusMap = new Map<string, boolean>();

    try {
        const promises = uids.map(async (uid) => {
            const isComplete = await isProfileComplete(uid);
            statusMap.set(uid, isComplete);
        });

        await Promise.all(promises);

        return statusMap;
    } catch (error) {
        console.error('Error fetching profile completion status:', error);
        return statusMap;
    }
}

/**
 * Validate profile data before saving
 * @param data Profile data to validate
 * @returns Validation errors or null if valid
 */
export function validateProfileData(
    data: Partial<UserProfile>
): string[] | null {
    const errors: string[] = [];

    // Validate firstName
    if (data.firstName !== undefined) {
        if (!data.firstName || data.firstName.trim().length === 0) {
            errors.push('First name is required');
        } else if (data.firstName.length > 50) {
            errors.push('First name must be less than 50 characters');
        }
    }

    // Validate familyName
    if (data.familyName !== undefined) {
        if (!data.familyName || data.familyName.trim().length === 0) {
            errors.push('Family name is required');
        } else if (data.familyName.length > 50) {
            errors.push('Family name must be less than 50 characters');
        }
    }

    // Validate dateOfBirth
    if (data.dateOfBirth !== undefined) {
        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!datePattern.test(data.dateOfBirth)) {
            errors.push('Date of birth must be in DD/MM/YYYY format');
        }
    }

    // Validate phone
    if (data.phone !== undefined) {
        if (!data.phone.countryCode || !data.phone.number) {
            errors.push('Phone number is required');
        } else {
            const phonePattern = /^[0-9]+$/;
            if (!phonePattern.test(data.phone.number)) {
                errors.push('Phone number must contain only digits');
            }
            if (data.phone.number.length < 6 || data.phone.number.length > 15) {
                errors.push('Phone number must be between 6 and 15 digits');
            }
        }
    }

    // Validate address
    if (data.address !== undefined) {
        if (!data.address.street || data.address.street.trim().length === 0) {
            errors.push('Street address is required');
        }
        if (!data.address.city || data.address.city.trim().length === 0) {
            errors.push('City is required');
        }
        if (!data.address.province || data.address.province.trim().length === 0) {
            errors.push('Province/State is required');
        }
        if (!data.address.country || data.address.country.trim().length === 0) {
            errors.push('Country is required');
        }
    }

    return errors.length > 0 ? errors : null;
}
