/**
 * Profile Service Tests
 * 
 * Unit tests for profile CRUD operations and validation.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firebase BEFORE importing the service
vi.mock('./firebase', () => ({
    database: {},
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
}));

import {
    getProfile,
    updateProfile,
    isProfileComplete,
    markProfileComplete,
    createProfile,
    updateLastLogin,
    getProfileCompletionStatus,
    validateProfileData,
} from './profileService';
import { UserProfile } from '../types/user.types';
import { ref, get, update, set } from 'firebase/database';

describe('ProfileService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ============================================
    // GET PROFILE
    // ============================================

    describe('getProfile', () => {
        it('should fetch user profile successfully', async () => {
            const mockProfile: UserProfile = {
                uid: 'test-user-123',
                email: 'test@example.com',
                displayName: 'Test User',
                photoURL: null,
                role: 'student',
                createdAt: Date.now(),
                lastLoginAt: Date.now(),
                status: 'active',
                firstName: 'John',
                familyName: 'Doe',
            };

            const mockSnapshot = {
                exists: () => true,
                val: () => mockProfile,
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockSnapshot as any);

            const result = await getProfile('test-user-123');

            expect(result).toEqual(mockProfile);
            expect(ref).toHaveBeenCalledWith({}, 'users/test-user-123');
        });

        it('should return null if profile does not exist', async () => {
            const mockSnapshot = {
                exists: () => false,
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockSnapshot as any);

            const result = await getProfile('non-existent-user');

            expect(result).toBeNull();
        });

        it('should throw error on Firebase failure', async () => {
            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockRejectedValue(new Error('Firebase error'));

            await expect(getProfile('test-user-123')).rejects.toThrow(
                'Failed to fetch user profile'
            );
        });
    });

    // ============================================
    // UPDATE PROFILE
    // ============================================

    describe('updateProfile', () => {
        it('should update profile successfully', async () => {
            const updateData = {
                firstName: 'Jane',
                familyName: 'Smith',
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(update).mockResolvedValue(undefined);

            await updateProfile('test-user-123', updateData);

            expect(ref).toHaveBeenCalledWith({}, 'users/test-user-123');
            expect(update).toHaveBeenCalledWith({}, updateData);
        });

        it('should throw error on Firebase failure', async () => {
            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(update).mockRejectedValue(new Error('Firebase error'));

            await expect(
                updateProfile('test-user-123', { firstName: 'Jane' })
            ).rejects.toThrow('Failed to update user profile');
        });
    });

    // ============================================
    // IS PROFILE COMPLETE
    // ============================================

    describe('isProfileComplete', () => {
        it('should return true if profileCompletedAt is set', async () => {
            const mockProfile: Partial<UserProfile> = {
                uid: 'test-user-123',
                profileCompletedAt: Date.now(),
            };

            const mockSnapshot = {
                exists: () => true,
                val: () => mockProfile,
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockSnapshot as any);

            const result = await isProfileComplete('test-user-123');

            expect(result).toBe(true);
        });

        it('should return true if all required fields are present', async () => {
            const mockProfile: Partial<UserProfile> = {
                uid: 'test-user-123',
                firstName: 'John',
                familyName: 'Doe',
                dateOfBirth: '01/01/2000',
                phone: {
                    countryCode: '+84',
                    number: '123456789',
                },
                address: {
                    street: '123 Main St',
                    city: 'Hanoi',
                    province: 'Hanoi',
                    country: 'VN',
                },
            };

            const mockSnapshot = {
                exists: () => true,
                val: () => mockProfile,
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockSnapshot as any);

            const result = await isProfileComplete('test-user-123');

            expect(result).toBe(true);
        });

        it('should return false if required fields are missing', async () => {
            const mockProfile: Partial<UserProfile> = {
                uid: 'test-user-123',
                firstName: 'John',
                // Missing other required fields
            };

            const mockSnapshot = {
                exists: () => true,
                val: () => mockProfile,
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockSnapshot as any);

            const result = await isProfileComplete('test-user-123');

            expect(result).toBe(false);
        });

        it('should return false if profile does not exist', async () => {
            const mockSnapshot = {
                exists: () => false,
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockSnapshot as any);

            const result = await isProfileComplete('non-existent-user');

            expect(result).toBe(false);
        });

        it('should return false on error', async () => {
            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockRejectedValue(new Error('Firebase error'));

            const result = await isProfileComplete('test-user-123');

            expect(result).toBe(false);
        });
    });

    // ============================================
    // MARK PROFILE COMPLETE
    // ============================================

    describe('markProfileComplete', () => {
        it('should set profileCompletedAt timestamp', async () => {
            const beforeTime = Date.now();

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(update).mockResolvedValue(undefined);

            await markProfileComplete('test-user-123');

            expect(ref).toHaveBeenCalledWith({}, 'users/test-user-123');
            expect(update).toHaveBeenCalled();

            const updateCall = vi.mocked(update).mock.calls[0][1] as any;
            expect(updateCall.profileCompletedAt).toBeGreaterThanOrEqual(beforeTime);
        });

        it('should throw error on Firebase failure', async () => {
            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(update).mockRejectedValue(new Error('Firebase error'));

            await expect(markProfileComplete('test-user-123')).rejects.toThrow(
                'Failed to mark profile as complete'
            );
        });
    });

    // ============================================
    // CREATE PROFILE
    // ============================================

    describe('createProfile', () => {
        it('should create new profile with default values', async () => {
            const profileData = {
                email: 'test@example.com',
                displayName: 'Test User',
                role: 'student' as const,
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(set).mockResolvedValue(undefined);

            await createProfile('test-user-123', profileData);

            expect(ref).toHaveBeenCalledWith({}, 'users/test-user-123');
            expect(set).toHaveBeenCalled();

            const setCall = vi.mocked(set).mock.calls[0][1] as any;
            expect(setCall.uid).toBe('test-user-123');
            expect(setCall.email).toBe('test@example.com');
            expect(setCall.status).toBe('active');
            expect(setCall.profileCompletedAt).toBeNull();
            expect(setCall.createdAt).toBeDefined();
            expect(setCall.lastLoginAt).toBeDefined();
        });

        it('should throw error on Firebase failure', async () => {
            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(set).mockRejectedValue(new Error('Firebase error'));

            await expect(
                createProfile('test-user-123', { email: 'test@example.com' })
            ).rejects.toThrow('Failed to create user profile');
        });
    });

    // ============================================
    // UPDATE LAST LOGIN
    // ============================================

    describe('updateLastLogin', () => {
        it('should update lastLoginAt timestamp', async () => {
            const beforeTime = Date.now();

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(update).mockResolvedValue(undefined);

            await updateLastLogin('test-user-123');

            expect(ref).toHaveBeenCalledWith({}, 'users/test-user-123');
            expect(update).toHaveBeenCalled();

            const updateCall = vi.mocked(update).mock.calls[0][1] as any;
            expect(updateCall.lastLoginAt).toBeGreaterThanOrEqual(beforeTime);
        });

        it('should not throw error on Firebase failure', async () => {
            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(update).mockRejectedValue(new Error('Firebase error'));

            // Should not throw
            await expect(updateLastLogin('test-user-123')).resolves.toBeUndefined();
        });
    });

    // ============================================
    // GET PROFILE COMPLETION STATUS
    // ============================================

    describe('getProfileCompletionStatus', () => {
        it('should return completion status for multiple users', async () => {
            const uids = ['user1', 'user2', 'user3'];

            // Mock different completion statuses
            const mockProfiles = [
                { uid: 'user1', profileCompletedAt: Date.now() },
                { uid: 'user2', firstName: 'John' }, // Incomplete
                {
                    uid: 'user3',
                    firstName: 'Jane',
                    familyName: 'Doe',
                    dateOfBirth: '01/01/2000',
                    phone: { countryCode: '+84', number: '123456789' },
                    address: {
                        street: '123 Main St',
                        city: 'Hanoi',
                        province: 'Hanoi',
                        country: 'VN',
                    },
                },
            ];

            let callIndex = 0;
            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockImplementation(() => {
                const profile = mockProfiles[callIndex++];
                return Promise.resolve({
                    exists: () => true,
                    val: () => profile,
                } as any);
            });

            const result = await getProfileCompletionStatus(uids);

            expect(result.size).toBe(3);
            expect(result.get('user1')).toBe(true);
            expect(result.get('user2')).toBe(false);
            expect(result.get('user3')).toBe(true);
        });

        it('should handle errors gracefully', async () => {
            vi.mocked(get).mockRejectedValue(new Error('Firebase error'));

            const result = await getProfileCompletionStatus(['user1']);

            // When there's an error, isProfileComplete returns false
            // So the map will have the user with false status
            expect(result.size).toBe(1);
            expect(result.get('user1')).toBe(false);
        });
    });

    // ============================================
    // VALIDATE PROFILE DATA
    // ============================================

    describe('validateProfileData', () => {
        it('should return null for valid data', () => {
            const validData: Partial<UserProfile> = {
                firstName: 'John',
                familyName: 'Doe',
                dateOfBirth: '01/01/2000',
                phone: {
                    countryCode: '+84',
                    number: '123456789',
                },
                address: {
                    street: '123 Main St',
                    city: 'Hanoi',
                    province: 'Hanoi',
                    country: 'VN',
                },
            };

            const errors = validateProfileData(validData);

            expect(errors).toBeNull();
        });

        it('should return errors for empty firstName', () => {
            const invalidData: Partial<UserProfile> = {
                firstName: '',
            };

            const errors = validateProfileData(invalidData);

            expect(errors).toContain('First name is required');
        });

        it('should return errors for long firstName', () => {
            const invalidData: Partial<UserProfile> = {
                firstName: 'A'.repeat(51),
            };

            const errors = validateProfileData(invalidData);

            expect(errors).toContain('First name must be less than 50 characters');
        });

        it('should return errors for empty familyName', () => {
            const invalidData: Partial<UserProfile> = {
                familyName: '',
            };

            const errors = validateProfileData(invalidData);

            expect(errors).toContain('Family name is required');
        });

        it('should return errors for invalid dateOfBirth format', () => {
            const invalidData: Partial<UserProfile> = {
                dateOfBirth: '2000-01-01', // Wrong format
            };

            const errors = validateProfileData(invalidData);

            expect(errors).toContain('Date of birth must be in DD/MM/YYYY format');
        });

        it('should return errors for invalid phone number', () => {
            const invalidData: Partial<UserProfile> = {
                phone: {
                    countryCode: '+84',
                    number: 'abc123', // Contains letters
                },
            };

            const errors = validateProfileData(invalidData);

            expect(errors).toContain('Phone number must contain only digits');
        });

        it('should return errors for short phone number', () => {
            const invalidData: Partial<UserProfile> = {
                phone: {
                    countryCode: '+84',
                    number: '12345', // Too short
                },
            };

            const errors = validateProfileData(invalidData);

            expect(errors).toContain('Phone number must be between 6 and 15 digits');
        });

        it('should return errors for missing address fields', () => {
            const invalidData: Partial<UserProfile> = {
                address: {
                    street: '',
                    city: '',
                    province: '',
                    country: '',
                },
            };

            const errors = validateProfileData(invalidData);

            expect(errors).toContain('Street address is required');
            expect(errors).toContain('City is required');
            expect(errors).toContain('Province/State is required');
            expect(errors).toContain('Country is required');
        });

        it('should return multiple errors for multiple invalid fields', () => {
            const invalidData: Partial<UserProfile> = {
                firstName: '',
                familyName: '',
                dateOfBirth: 'invalid',
            };

            const errors = validateProfileData(invalidData);

            expect(errors).toHaveLength(3);
        });
    });
});
