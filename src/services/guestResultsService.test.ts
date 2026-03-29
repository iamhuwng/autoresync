/**
 * Unit Tests for Guest Results Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, push, get, set, remove, update } from 'firebase/database';
import {
    saveGuestResult,
    getGuestResults,
    generateUniqueGuestName,
    claimGuestResults,
    migrateLegacyClaimedGuestResults,
    checkClaimableResults,
    deleteGuestResults,
    getGuestResultCount
} from './guestResultsService';

const { mockResolveResultOwnership } = vi.hoisted(() => ({
    mockResolveResultOwnership: vi.fn(),
}));

// Mock Firebase
vi.mock('./firebase', () => ({
    database: {}
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn((_: unknown, path?: string) => path ?? '__root__'),
    push: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
}));

vi.mock('./resultOwnershipResolver', () => ({
    resolveResultOwnership: mockResolveResultOwnership,
}));

describe('guestResultsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (update as any).mockResolvedValue(undefined);
        mockResolveResultOwnership.mockImplementation(async ({ result }: any) => ({
            visibility: {
                contextType: 'class_session',
                sourceType: 'session',
                sourceId: result?.sessionCode ?? 'session-1',
                sourceNameSnapshot: result?.testTitle ?? 'Claimed Result',
                visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'session.createdByUserId',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: result?.sessionCode ?? 'session-1',
                courseId: result?.courseId ?? null,
                classId: result?.classId ?? null,
                assignmentId: null,
            },
            sourceLookupAttempted: true,
            strongestKnownSourceClue: `session:${result?.sessionCode ?? 'session-1'}`,
        }));
    });

    // ========================================
    // saveGuestResult tests
    // ========================================

    describe('saveGuestResult', () => {
        it('should save a guest result successfully', async () => {
            const mockResult = {
                testId: 'test-123',
                studentId: 'guest',
                score: 85,
                maxScore: 100,
                submittedAt: Date.now()
            } as any;

            const mockResultRef = { key: 'result-abc' };

            // Mock unique name check (name is available)
            (get as any).mockResolvedValueOnce({ exists: () => false });

            // Mock push and set
            (push as any).mockReturnValue(mockResultRef);
            (set as any).mockResolvedValue(undefined);

            const resultId = await saveGuestResult('John', mockResult);

            expect(resultId).toBe('result-abc');
            expect(push).toHaveBeenCalled();
            expect(set).toHaveBeenCalledWith(
                mockResultRef,
                expect.objectContaining({
                    ...mockResult,
                    guestName: 'John',
                    isGuestResult: true,
                    savedAt: expect.any(Number)
                })
            );
        });

        it('should throw error if guest name is empty', async () => {
            const mockResult = { testId: 'test-123' } as any;

            await expect(saveGuestResult('', mockResult)).rejects.toThrow('Guest name is required');
            await expect(saveGuestResult('   ', mockResult)).rejects.toThrow('Guest name is required');
        });

        it('should throw error if result ID generation fails', async () => {
            const mockResult = { testId: 'test-123' } as any;

            // Mock unique name check
            (get as any).mockResolvedValueOnce({ exists: () => false });

            // Mock push returning null key
            (push as any).mockReturnValue({ key: null });

            await expect(saveGuestResult('John', mockResult)).rejects.toThrow('Failed to generate result ID');
        });

        it('should generate unique name if base name exists', async () => {
            const mockResult = { testId: 'test-123' } as any;
            const mockResultRef = { key: 'result-abc' };

            // Mock unique name check - base name exists, John_1 is available
            (get as any)
                .mockResolvedValueOnce({ exists: () => true })  // John exists
                .mockResolvedValueOnce({ exists: () => false }); // John_1 available

            (push as any).mockReturnValue(mockResultRef);
            (set as any).mockResolvedValue(undefined);

            await saveGuestResult('John', mockResult);

            expect(set).toHaveBeenCalledWith(
                mockResultRef,
                expect.objectContaining({
                    guestName: 'John_1'
                })
            );
        });
    });

    // ========================================
    // getGuestResults tests
    // ========================================

    describe('getGuestResults', () => {
        it('should return all results for a guest', async () => {
            const mockData = {
                'result-1': { testId: 'test-1', score: 80, submittedAt: 1000 },
                'result-2': { testId: 'test-2', score: 90, submittedAt: 2000 }
            };

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    Object.entries(mockData).forEach(([key, val]) => {
                        callback({ key, val: () => val });
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const results = await getGuestResults('John');

            expect(results).toHaveLength(2);
            expect(results[0]).toMatchObject({ testId: 'test-2', resultId: 'result-2' }); // Newest first
            expect(results[1]).toMatchObject({ testId: 'test-1', resultId: 'result-1' });
        });

        it('should return empty array if no results found', async () => {
            const mockSnapshot = {
                exists: () => false
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const results = await getGuestResults('John');

            expect(results).toEqual([]);
        });

        it('should throw error if guest name is empty', async () => {
            await expect(getGuestResults('')).rejects.toThrow('Guest name is required');
        });

        it('should sort results by submission time (newest first)', async () => {
            const mockData = {
                'result-1': { testId: 'test-1', submittedAt: 1000 },
                'result-2': { testId: 'test-2', submittedAt: 3000 },
                'result-3': { testId: 'test-3', submittedAt: 2000 }
            };

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    Object.entries(mockData).forEach(([key, val]) => {
                        callback({ key, val: () => val });
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const results = await getGuestResults('John');

            expect(results[0].submittedAt).toBe(3000); // Newest
            expect(results[1].submittedAt).toBe(2000);
            expect(results[2].submittedAt).toBe(1000); // Oldest
        });
    });

    // ========================================
    // generateUniqueGuestName tests
    // ========================================

    describe('generateUniqueGuestName', () => {
        it('should return base name if available', async () => {
            (get as any).mockResolvedValue({ exists: () => false });

            const uniqueName = await generateUniqueGuestName('John');

            expect(uniqueName).toBe('John');
        });

        it('should add suffix _1 if base name exists', async () => {
            (get as any)
                .mockResolvedValueOnce({ exists: () => true })  // John exists
                .mockResolvedValueOnce({ exists: () => false }); // John_1 available

            const uniqueName = await generateUniqueGuestName('John');

            expect(uniqueName).toBe('John_1');
        });

        it('should increment suffix until unique name found', async () => {
            (get as any)
                .mockResolvedValueOnce({ exists: () => true })  // John exists
                .mockResolvedValueOnce({ exists: () => true })  // John_1 exists
                .mockResolvedValueOnce({ exists: () => true })  // John_2 exists
                .mockResolvedValueOnce({ exists: () => false }); // John_3 available

            const uniqueName = await generateUniqueGuestName('John');

            expect(uniqueName).toBe('John_3');
        });

        it('should trim whitespace from base name', async () => {
            (get as any).mockResolvedValue({ exists: () => false });

            const uniqueName = await generateUniqueGuestName('  John  ');

            expect(uniqueName).toBe('John');
        });

        it('should throw error if too many duplicates (safety limit)', async () => {
            // Mock all names as existing (up to suffix 100)
            (get as any).mockResolvedValue({ exists: () => true });

            await expect(generateUniqueGuestName('John')).rejects.toThrow('Too many guest accounts');
        });
    });

    // ========================================
    // claimGuestResults tests
    // ========================================

    describe('claimGuestResults', () => {
        it('should claim all guest results and transfer to user', async () => {
            const mockGuestResults = [
                {
                    testId: 'test-1',
                    sessionCode: 'session-1',
                    studentId: 'guest_1',
                    studentName: 'John',
                    percentage: 80,
                    testTitle: 'Reading 1',
                    testSkill: 'reading',
                    teacherId: 'teacher-1',
                    guestName: 'John',
                    isGuestResult: true,
                    isGuest: true,
                    savedAt: 1000,
                    resultId: 'result-1',
                    submittedAt: 1000
                },
                {
                    testId: 'test-2',
                    sessionCode: 'session-2',
                    studentId: 'guest_1',
                    studentName: 'John',
                    percentage: 90,
                    testTitle: 'Reading 2',
                    testSkill: 'reading',
                    teacherId: 'teacher-1',
                    guestName: 'John',
                    isGuestResult: true,
                    isGuest: true,
                    savedAt: 2000,
                    resultId: 'result-2',
                    submittedAt: 2000
                }
            ];

            // Mock getGuestResults (already tested above)
            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    mockGuestResults.forEach((result, index) => {
                        callback({
                            key: result.resultId,
                            val: () => result
                        });
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);
            (remove as any).mockResolvedValue(undefined);

            const count = await claimGuestResults('John', 'user-123');

            expect(count).toBe(2);
            expect(update).toHaveBeenCalledTimes(1);
            expect(remove).toHaveBeenCalled();

            const claimUpdates = (update as any).mock.calls[0][1];
            const firstCallData = claimUpdates['test_results/result-2'];
            const secondCallData = claimUpdates['test_results/result-1'];

            expect(firstCallData.testId).toBe('test-2'); // Newest first
            expect(firstCallData.percentage).toBe(90);
            expect(firstCallData.studentId).toBe('user-123');
            expect(firstCallData.claimedFrom).toBe('John');
            expect(firstCallData.claimedAt).toBeTypeOf('number');
            expect(firstCallData.visibility).toEqual(
                expect.objectContaining({
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownershipResolved: true,
                }),
            );
            expect(claimUpdates['test_results_by_student/user-123/result-2']).toEqual(
                expect.objectContaining({
                    resultId: 'result-2',
                    sessionCode: 'session-2',
                    testId: 'test-2',
                    percentage: 90,
                    submittedAt: 2000,
                }),
            );
            expect(claimUpdates['test_results_by_teacher/teacher-1/result-2']).toEqual(
                expect.objectContaining({
                    resultId: 'result-2',
                    studentId: 'user-123',
                }),
            );
            expect(claimUpdates['reports/result_visibility/unresolved/result-2']).toBeNull();

            expect(secondCallData.testId).toBe('test-1'); // Oldest second
            expect(secondCallData.percentage).toBe(80);
            expect(secondCallData.studentId).toBe('user-123');
            expect(secondCallData.claimedFrom).toBe('John');
            expect(secondCallData.claimedAt).toBeTypeOf('number');
        });

        it('should return 0 if no results to claim', async () => {
            const mockSnapshot = {
                exists: () => false
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const count = await claimGuestResults('John', 'user-123');

            expect(count).toBe(0);
            expect(update).not.toHaveBeenCalled();
            expect(remove).not.toHaveBeenCalled();
        });

        it('should throw error if guest name or user ID missing', async () => {
            await expect(claimGuestResults('', 'user-123')).rejects.toThrow('Guest name and user ID are required');
            await expect(claimGuestResults('John', '')).rejects.toThrow('Guest name and user ID are required');
        });

        it('should remove guest-specific metadata when claiming', async () => {
            const mockGuestResult = {
                testId: 'test-1',
                sessionCode: 'session-1',
                studentId: 'guest_1',
                studentName: 'John',
                percentage: 80,
                isGuest: true,
                guestName: 'John',
                isGuestResult: true,
                savedAt: 1000,
                resultId: 'result-1',
                submittedAt: 1000
            };

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    callback({ key: 'result-1', val: () => mockGuestResult });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);
            (remove as any).mockResolvedValue(undefined);

            await claimGuestResults('John', 'user-123');

            const setCall = (update as any).mock.calls[0][1]['test_results/result-1'];
            expect(setCall).not.toHaveProperty('guestName');
            expect(setCall).not.toHaveProperty('isGuestResult');
            expect(setCall).not.toHaveProperty('savedAt');
            expect(setCall).toHaveProperty('resultId', 'result-1');
            expect(setCall).toHaveProperty('studentId', 'user-123');
            expect(setCall).toHaveProperty('claimedAt');
            expect(setCall).toHaveProperty('claimedFrom', 'John');
        });

        it('should keep unresolved claimed rows out of teacher indexes and report them', async () => {
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'course_material',
                    sourceType: 'course',
                    sourceId: 'course-1',
                    sourceNameSnapshot: 'Course 1',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                    homeworkId: null,
                    sessionCode: 'session-1',
                    courseId: 'course-1',
                    classId: null,
                    assignmentId: null,
                },
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'course:course-1',
            });

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    callback({
                        key: 'result-1',
                        val: () => ({
                            testId: 'test-1',
                            sessionCode: 'session-1',
                            studentId: 'guest_1',
                            studentName: 'John',
                            percentage: 80,
                            testTitle: 'Reading 1',
                            testSkill: 'reading',
                            teacherId: 'teacher-1',
                            guestName: 'John',
                            isGuestResult: true,
                            isGuest: true,
                            savedAt: 1000,
                            resultId: 'result-1',
                            submittedAt: 1000,
                            courseId: 'course-1',
                        }),
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);
            (remove as any).mockResolvedValue(undefined);

            await claimGuestResults('John', 'user-123');

            const claimUpdates = (update as any).mock.calls[0][1];
            expect(claimUpdates['test_results_by_teacher/teacher-1/result-1']).toBeUndefined();
            expect(claimUpdates['test_results_by_course/course-1/user-123/result-1']).toBeUndefined();
            expect(claimUpdates['reports/result_visibility/unresolved/result-1']).toEqual(
                expect.objectContaining({
                    resultId: 'result-1',
                    studentId: 'user-123',
                    unresolvedReason: 'owner_not_resolved',
                    strongestKnownSourceClue: 'course:course-1',
                }),
            );
        });

        it('should skip teacher index creation for solo-practice claims even when raw teacherId exists', async () => {
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'solo_practice',
                    sourceType: 'solo_practice',
                    sourceId: 'material-1',
                    sourceNameSnapshot: 'Solo Practice',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'solo_practice',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'solo-session',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
                sourceLookupAttempted: false,
                strongestKnownSourceClue: 'solo_practice:material-1',
            });

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    callback({
                        key: 'result-solo',
                        val: () => ({
                            testId: 'test-solo',
                            sessionCode: 'solo-session',
                            studentId: 'guest_1',
                            studentName: 'John',
                            percentage: 80,
                            testTitle: 'Solo Practice',
                            testSkill: 'reading',
                            teacherId: 'teacher-1',
                            guestName: 'John',
                            isGuestResult: true,
                            isGuest: true,
                            savedAt: 1000,
                            resultId: 'result-solo',
                            submittedAt: 1000,
                        }),
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);
            (remove as any).mockResolvedValue(undefined);

            await claimGuestResults('John', 'user-123');

            const claimUpdates = (update as any).mock.calls[0][1];
            expect(claimUpdates['test_results_by_teacher/teacher-1/result-solo']).toBeUndefined();
            expect(claimUpdates['test_results_solo_practice_by_student/user-123/result-solo']).toEqual(
                expect.objectContaining({
                    resultId: 'result-solo',
                    testId: 'test-solo',
                    submittedAt: 1000,
                }),
            );
            expect(claimUpdates['reports/result_visibility/unresolved/result-solo']).toBeNull();
        });

        it('should rebuild guest claim teacher index from normalized owner instead of raw teacherId', async () => {
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'session-1',
                    sourceNameSnapshot: 'Reading 1',
                    visibilityOwnerTeacherId: 'teacher-2',
                    ownerResolutionSource: 'session.createdByUserId',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'session-1',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'session:session-1',
            });

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    callback({
                        key: 'result-mismatch',
                        val: () => ({
                            testId: 'test-1',
                            sessionCode: 'session-1',
                            studentId: 'guest_1',
                            studentName: 'John',
                            percentage: 80,
                            testTitle: 'Reading 1',
                            testSkill: 'reading',
                            teacherId: 'teacher-1',
                            guestName: 'John',
                            isGuestResult: true,
                            isGuest: true,
                            savedAt: 1000,
                            resultId: 'result-mismatch',
                            submittedAt: 1000,
                        }),
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);
            (remove as any).mockResolvedValue(undefined);

            await claimGuestResults('John', 'user-123');

            const claimUpdates = (update as any).mock.calls[0][1];
            expect(claimUpdates['test_results_by_teacher/teacher-1/result-mismatch']).toBeUndefined();
            expect(claimUpdates['test_results_by_teacher/teacher-2/result-mismatch']).toEqual(
                expect.objectContaining({
                    resultId: 'result-mismatch',
                    studentId: 'user-123',
                }),
            );
        });
    });

    describe('migrateLegacyClaimedGuestResults', () => {
        it('should migrate legacy claimed rows into canonical result storage', async () => {
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => ({
                    'user-123': {
                        'result-1': {
                            resultId: 'result-1',
                            testId: 'test-1',
                            sessionCode: 'session-1',
                            studentId: 'guest_1',
                            studentName: 'John',
                            percentage: 88,
                            submittedAt: 1234,
                            teacherId: 'teacher-1',
                            isGuest: true,
                            claimedAt: 1500,
                            claimedFrom: 'John',
                        },
                    },
                    'result-live': {
                        resultId: 'result-live',
                        testId: 'live-test',
                        studentId: 'student-live',
                        sessionCode: 'live-session',
                        submittedAt: 9999,
                    },
                }),
            });

            const migrated = await migrateLegacyClaimedGuestResults();

            expect(migrated).toBe(1);
            expect(update).toHaveBeenCalledTimes(1);

            const migrationUpdates = (update as any).mock.calls[0][1];
            expect(migrationUpdates['test_results/result-1']).toEqual(
                expect.objectContaining({
                    resultId: 'result-1',
                    studentId: 'user-123',
                    claimedFrom: 'John',
                    claimedAt: 1500,
                    visibility: expect.objectContaining({
                        visibilityOwnerTeacherId: 'teacher-1',
                        ownershipResolved: true,
                    }),
                }),
            );
            expect(migrationUpdates['test_results_by_student/user-123/result-1']).toEqual(
                expect.objectContaining({
                    resultId: 'result-1',
                    sessionCode: 'session-1',
                    testId: 'test-1',
                    percentage: 88,
                    submittedAt: 1234,
                }),
            );
            expect(migrationUpdates['test_results_by_teacher/teacher-1/result-1']).toEqual(
                expect.objectContaining({
                    resultId: 'result-1',
                    studentId: 'user-123',
                }),
            );
            expect(migrationUpdates['reports/result_visibility/unresolved/result-1']).toBeNull();
            expect(migrationUpdates['test_results/user-123']).toBeNull();
        });

        it('should ignore already-canonical result rows', async () => {
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => ({
                    'result-1': {
                        resultId: 'result-1',
                        testId: 'test-1',
                        studentId: 'student-1',
                        sessionCode: 'session-1',
                        submittedAt: 1234,
                    },
                }),
            });

            const migrated = await migrateLegacyClaimedGuestResults();

            expect(migrated).toBe(0);
            expect(update).not.toHaveBeenCalled();
        });
    });

    // ========================================
    // checkClaimableResults tests
    // ========================================

    describe('checkClaimableResults', () => {
        it('should find guest names matching email prefix', async () => {
            const mockData = {
                'john': { testId: 'test-1' },
                'john_1': { testId: 'test-2' },
                'john_2': { testId: 'test-3' },
                'jane': { testId: 'test-4' },
                'johnny': { testId: 'test-5' }
            };

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    Object.keys(mockData).forEach(key => {
                        callback({ key });
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const claimable = await checkClaimableResults('john@example.com');

            expect(claimable).toContain('john');
            expect(claimable).toContain('john_1');
            expect(claimable).toContain('john_2');
            expect(claimable).not.toContain('jane');
            expect(claimable).not.toContain('johnny'); // Doesn't match exact pattern
        });

        it('should return empty array if no matches found', async () => {
            const mockSnapshot = {
                exists: () => false
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const claimable = await checkClaimableResults('john@example.com');

            expect(claimable).toEqual([]);
        });

        it('should throw error if invalid email provided', async () => {
            await expect(checkClaimableResults('')).rejects.toThrow('Valid email is required');
            await expect(checkClaimableResults('notanemail')).rejects.toThrow('Valid email is required');
        });

        it('should match case-insensitively', async () => {
            const mockData = {
                'John': { testId: 'test-1' },
                'JOHN_1': { testId: 'test-2' }
            };

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    Object.keys(mockData).forEach(key => {
                        callback({ key });
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const claimable = await checkClaimableResults('john@example.com');

            expect(claimable).toContain('John');
            expect(claimable).toContain('JOHN_1');
        });
    });

    // ========================================
    // deleteGuestResults tests
    // ========================================

    describe('deleteGuestResults', () => {
        it('should delete all results for a guest', async () => {
            (remove as any).mockResolvedValue(undefined);

            await deleteGuestResults('John');

            expect(remove).toHaveBeenCalled();
        });

        it('should throw error if guest name is empty', async () => {
            await expect(deleteGuestResults('')).rejects.toThrow('Guest name is required');
        });

        it('should handle errors when deleting', async () => {
            (remove as any).mockRejectedValue(new Error('Permission denied'));

            await expect(deleteGuestResults('John')).rejects.toThrow('Permission denied');
        });
    });

    // ========================================
    // getGuestResultCount tests
    // ========================================

    describe('getGuestResultCount', () => {
        it('should return count of guest results', async () => {
            const mockData = {
                'result-1': { testId: 'test-1', submittedAt: 1000 },
                'result-2': { testId: 'test-2', submittedAt: 2000 },
                'result-3': { testId: 'test-3', submittedAt: 3000 }
            };

            const mockSnapshot = {
                exists: () => true,
                forEach: (callback: any) => {
                    Object.entries(mockData).forEach(([key, val]) => {
                        callback({ key, val: () => val });
                    });
                }
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const count = await getGuestResultCount('John');

            expect(count).toBe(3);
        });

        it('should return 0 if no results found', async () => {
            const mockSnapshot = {
                exists: () => false
            };

            (get as any).mockResolvedValue(mockSnapshot);

            const count = await getGuestResultCount('John');

            expect(count).toBe(0);
        });

        it('should return 0 on error', async () => {
            (get as any).mockRejectedValue(new Error('Network error'));

            const count = await getGuestResultCount('John');

            expect(count).toBe(0);
        });
    });
});
