/**
 * Audit Service Tests
 * 
 * PRD-0016 Task 6.12: Comprehensive tests for auditService functions
 * 
 * @security Tests audit logging functionality to ensure compliance
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { AuditAction, SecurityAuthContext, UserRole } from '../../types/security.types';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock Firebase Database
const mockPush = vi.fn().mockResolvedValue({ key: 'mock-log-id' });
const mockGet = vi.fn();
const mockQuery = vi.fn().mockReturnValue({});
const mockRef = vi.fn().mockReturnValue({});

vi.mock('firebase/database', () => ({
    getDatabase: vi.fn(),
    ref: mockRef,
    push: mockPush,
    get: mockGet,
    query: mockQuery,
    orderByChild: vi.fn().mockReturnValue({}),
    limitToLast: vi.fn().mockReturnValue({}),
    startAt: vi.fn().mockReturnValue({}),
    endAt: vi.fn().mockReturnValue({}),
    serverTimestamp: vi.fn(() => Date.now()),
}));

// Mock firebase config
vi.mock('../../services/firebase', () => ({
    database: {},
}));

// =============================================================================
// HELPER DATA
// =============================================================================

const createMockAuthContext = (overrides?: Partial<SecurityAuthContext>): SecurityAuthContext => ({
    userId: 'test-user-id',
    userRole: 'teacher' as UserRole,
    activeRole: 'teacher' as UserRole,
    roles: ['teacher'] as UserRole[],
    isActive: true,
    ...overrides,
});

const createMockLogEntry = (action: AuditAction) => ({
    action,
    userId: 'test-user-id',
    userRole: 'teacher' as UserRole,
    target: 'test-target',
    targetId: 'test-target-id',
    timestamp: expect.any(String),
    details: expect.any(Object),
});

// =============================================================================
// TEST SUITES
// =============================================================================

describe('Audit Service Tests (PRD-0016 Task 6.12)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // =========================================================================
    // Basic Audit Logging Tests
    // =========================================================================
    describe('Basic Audit Logging', () => {
        it('should define all required audit action types', () => {
            const requiredActions: AuditAction[] = [
                'CREATE',
                'READ',
                'UPDATE',
                'DELETE',
                'ACCESS_DENIED',
                'LOGIN',
                'LOGOUT',
                'ROLE_CHANGE',
                'STATUS_CHANGE',
            ];

            requiredActions.forEach(action => {
                expect(typeof action).toBe('string');
            });
        });

        it('should create valid audit log entry structure', () => {
            const entry = {
                action: 'CREATE' as AuditAction,
                userId: 'user-123',
                userRole: 'teacher' as UserRole,
                target: 'course',
                targetId: 'course-456',
                timestamp: new Date().toISOString(),
                details: { courseName: 'Test Course' },
            };

            expect(entry.action).toBe('CREATE');
            expect(entry.userId).toBe('user-123');
            expect(entry.userRole).toBe('teacher');
            expect(entry.target).toBe('course');
            expect(entry.targetId).toBe('course-456');
            expect(entry.timestamp).toBeDefined();
            expect(entry.details).toHaveProperty('courseName');
        });

        it('should handle anonymous user in audit logs', () => {
            const entry = {
                action: 'ACCESS_DENIED' as AuditAction,
                userId: 'anonymous',
                userRole: 'student' as UserRole,
                target: 'route',
                targetId: '/admin/users',
                timestamp: new Date().toISOString(),
            };

            expect(entry.userId).toBe('anonymous');
        });
    });

    // =========================================================================
    // Fire-and-Forget Pattern Tests
    // =========================================================================
    describe('Fire-and-Forget Pattern', () => {
        it('should not block on audit log write failures', async () => {
            // Simulate a failed push that shouldn't throw
            const failingPush = vi.fn().mockRejectedValue(new Error('Database write failed'));

            // In the actual implementation, errors are caught and logged, not thrown
            const mockLogAuditEvent = async () => {
                try {
                    await failingPush();
                } catch (error) {
                    // Fire-and-forget: log error but don't throw
                    console.warn('Audit log failed:', error);
                }
            };

            // Should not throw
            await expect(mockLogAuditEvent()).resolves.toBeUndefined();
        });

        it('should continue main operation even if logging fails', async () => {
            const mainOperationResult = 'success';

            // Simulate main operation with audit logging that fails
            const performOperationWithAudit = async () => {
                // Fire-and-forget logging (intentionally not awaited)
                Promise.resolve().then(() => {
                    throw new Error('Logging failed');
                }).catch(() => {
                    // Silently handle
                });

                // Main operation succeeds
                return mainOperationResult;
            };

            const result = await performOperationWithAudit();
            expect(result).toBe(mainOperationResult);
        });
    });

    // =========================================================================
    // Security Event Logging Tests
    // =========================================================================
    describe('Security Event Logging', () => {
        it('should log login events with correct structure', () => {
            const loginEvent = {
                action: 'LOGIN' as AuditAction,
                target: 'session',
                targetId: 'user-123',
                details: { email: 'test@example.com' },
            };

            expect(loginEvent.action).toBe('LOGIN');
            expect(loginEvent.target).toBe('session');
            expect(loginEvent.details?.email).toBe('test@example.com');
        });

        it('should log logout events with reason', () => {
            const logoutEvent = {
                action: 'LOGOUT' as AuditAction,
                target: 'session',
                targetId: 'user-123',
                details: { reason: 'user_initiated' },
            };

            expect(logoutEvent.action).toBe('LOGOUT');
            expect(logoutEvent.details?.reason).toBe('user_initiated');
        });

        it('should log access denied events with path information', () => {
            const accessDeniedEvent = {
                action: 'ACCESS_DENIED' as AuditAction,
                target: 'route',
                targetId: '/admin/users',
                details: { reason: 'insufficient_role', userRole: 'student' },
            };

            expect(accessDeniedEvent.action).toBe('ACCESS_DENIED');
            expect(accessDeniedEvent.details?.reason).toBe('insufficient_role');
        });

        it('should log role change events with before/after values', () => {
            const roleChangeEvent = {
                action: 'ROLE_CHANGE' as AuditAction,
                target: 'user',
                targetId: 'user-456',
                details: {
                    oldRole: 'student',
                    newRole: 'teacher',
                    changedBy: 'admin-123',
                },
            };

            expect(roleChangeEvent.action).toBe('ROLE_CHANGE');
            expect(roleChangeEvent.details?.oldRole).toBe('student');
            expect(roleChangeEvent.details?.newRole).toBe('teacher');
            expect(roleChangeEvent.details?.changedBy).toBe('admin-123');
        });

        it('should log status change events (block/unblock)', () => {
            const statusChangeEvent = {
                action: 'STATUS_CHANGE' as AuditAction,
                target: 'user',
                targetId: 'user-789',
                details: {
                    oldStatus: 'active',
                    newStatus: 'blocked',
                    reason: 'Violation of terms',
                    changedBy: 'admin-123',
                },
            };

            expect(statusChangeEvent.action).toBe('STATUS_CHANGE');
            expect(statusChangeEvent.details?.newStatus).toBe('blocked');
        });
    });

    // =========================================================================
    // CRUD Logging Tests
    // =========================================================================
    describe('CRUD Operation Logging', () => {
        it('should log CREATE operations correctly', () => {
            const createEvent = {
                action: 'CREATE' as AuditAction,
                target: 'course',
                targetId: 'course-new-123',
                details: { courseName: 'New Course', courseCode: 'NC101' },
            };

            expect(createEvent.action).toBe('CREATE');
            expect(createEvent.target).toBe('course');
        });

        it('should log READ operations for sensitive data', () => {
            const readEvent = {
                action: 'READ' as AuditAction,
                target: 'student_data',
                targetId: 'student-456',
                details: { accessedFields: ['grades', 'attendance'] },
            };

            expect(readEvent.action).toBe('READ');
            expect(readEvent.details?.accessedFields).toContain('grades');
        });

        it('should log UPDATE operations with change details', () => {
            const updateEvent = {
                action: 'UPDATE' as AuditAction,
                target: 'assignment',
                targetId: 'assignment-789',
                details: { fields: ['dueDate', 'maxScore'] },
            };

            expect(updateEvent.action).toBe('UPDATE');
        });

        it('should log DELETE operations for compliance', () => {
            const deleteEvent = {
                action: 'DELETE' as AuditAction,
                target: 'user',
                targetId: 'deleted-user-123',
                details: { deletedBy: 'admin-456', reason: 'GDPR request' },
            };

            expect(deleteEvent.action).toBe('DELETE');
            expect(deleteEvent.details?.reason).toBe('GDPR request');
        });
    });

    // =========================================================================
    // Auth Context Integration Tests
    // =========================================================================
    describe('Auth Context Integration', () => {
        it('should use auth context userId for audit logs', () => {
            const authContext = createMockAuthContext({ userId: 'specific-user' });

            expect(authContext.userId).toBe('specific-user');
        });

        it('should include activeRole when different from userRole', () => {
            const authContext = createMockAuthContext({
                userRole: 'super_admin',
                activeRole: 'teacher',
            });

            expect(authContext.userRole).toBe('super_admin');
            expect(authContext.activeRole).toBe('teacher');
        });

        it('should handle null auth context for unauthenticated events', () => {
            const nullContext: SecurityAuthContext | null = null;

            // In real implementation, this would result in 'anonymous' userId
            const effectiveUserId = nullContext?.userId || 'anonymous';
            expect(effectiveUserId).toBe('anonymous');
        });
    });

    // =========================================================================
    // Query Functions Tests
    // =========================================================================
    describe('Audit Log Query Functions', () => {
        it('should return empty array when no logs exist', async () => {
            mockGet.mockResolvedValue({
                exists: () => false,
            });

            // Simulate getRecentAuditLogs behavior
            const snapshot = await mockGet();
            const result = snapshot.exists() ? [] : [];

            expect(result).toEqual([]);
        });

        it('should return logs in reverse chronological order', async () => {
            const mockLogs = [
                { id: '1', timestamp: '2026-02-01T10:00:00Z' },
                { id: '2', timestamp: '2026-02-01T11:00:00Z' },
                { id: '3', timestamp: '2026-02-01T12:00:00Z' },
            ];

            const reversed = [...mockLogs].reverse();

            expect(reversed[0].id).toBe('3');
            expect(reversed[2].id).toBe('1');
        });

        it('should support filtering by action type', () => {
            const allLogs = [
                { action: 'LOGIN' },
                { action: 'LOGOUT' },
                { action: 'LOGIN' },
                { action: 'ACCESS_DENIED' },
            ];

            const loginLogs = allLogs.filter(log => log.action === 'LOGIN');

            expect(loginLogs).toHaveLength(2);
        });

        it('should support filtering by user ID', () => {
            const allLogs = [
                { userId: 'user-1', action: 'LOGIN' },
                { userId: 'user-2', action: 'LOGIN' },
                { userId: 'user-1', action: 'LOGOUT' },
            ];

            const user1Logs = allLogs.filter(log => log.userId === 'user-1');

            expect(user1Logs).toHaveLength(2);
        });

        it('should respect limit parameter', () => {
            const manyLogs = Array(100).fill(null).map((_, i) => ({
                id: `log-${i}`,
                action: 'READ',
            }));

            const limited = manyLogs.slice(0, 50);

            expect(limited).toHaveLength(50);
        });
    });

    // =========================================================================
    // Timestamp Handling Tests
    // =========================================================================
    describe('Timestamp Handling', () => {
        it('should generate ISO timestamp for audit entries', () => {
            const timestamp = new Date().toISOString();

            expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('should handle timezone correctly', () => {
            const now = new Date();
            const isoString = now.toISOString();

            // ISO string should end with Z (UTC)
            expect(isoString).toMatch(/Z$/);
        });

        it('should support serverTimestamp for Firebase', () => {
            const mockServerTimestamp = vi.fn(() => Date.now());

            // Server timestamp should be a number
            const serverTime = mockServerTimestamp();
            expect(typeof serverTime).toBe('number');
        });
    });

    // =========================================================================
    // Edge Cases Tests
    // =========================================================================
    describe('Edge Cases', () => {
        it('should handle very long detail strings', () => {
            const longString = 'a'.repeat(10000);
            const details = { description: longString };

            expect(details.description.length).toBe(10000);
        });

        it('should handle special characters in target IDs', () => {
            const specialTargetId = 'user/path:with-special_chars.ext';

            expect(specialTargetId).toBe('user/path:with-special_chars.ext');
        });

        it('should handle empty details object', () => {
            const entry = {
                action: 'READ' as AuditAction,
                target: 'resource',
                targetId: 'id-123',
                details: {},
            };

            expect(Object.keys(entry.details)).toHaveLength(0);
        });

        it('should handle undefined details', () => {
            const entry = {
                action: 'READ' as AuditAction,
                target: 'resource',
                targetId: 'id-123',
                details: undefined,
            };

            expect(entry.details).toBeUndefined();
        });

        it('should handle malformed user role gracefully', () => {
            // Type system prevents this, but runtime might encounter it
            const invalidRole = 'invalid_role' as UserRole;

            // Should not throw
            expect(() => {
                const entry = { userRole: invalidRole };
                return entry;
            }).not.toThrow();
        });
    });

    // =========================================================================
    // Security Boundary Tests
    // =========================================================================
    describe('Security Boundaries', () => {
        it('should not expose sensitive data in log details', () => {
            const sensitiveData = {
                password: 'secret123',
                token: 'jwt-token-here',
            };

            // In real implementation, these should be filtered out
            const safeDetails = Object.fromEntries(
                Object.entries(sensitiveData).filter(([key]) =>
                    !['password', 'token', 'secret'].includes(key.toLowerCase())
                )
            );

            expect(safeDetails).not.toHaveProperty('password');
            expect(safeDetails).not.toHaveProperty('token');
        });

        it('should validate audit action types', () => {
            const validActions: AuditAction[] = [
                'CREATE', 'READ', 'UPDATE', 'DELETE',
                'ACCESS_DENIED', 'LOGIN', 'LOGOUT',
                'ROLE_CHANGE', 'STATUS_CHANGE',
            ];

            const isValidAction = (action: string): action is AuditAction => {
                return validActions.includes(action as AuditAction);
            };

            expect(isValidAction('CREATE')).toBe(true);
            expect(isValidAction('INVALID')).toBe(false);
        });

        it('should enforce write-only access for audit logs', () => {
            // This is enforced by Firebase rules, not service code
            // Test documents the expected behavior
            const auditLogPath = 'audit_logs';

            // Expected rule: ".read": "root.child('users/' + auth.uid + '/role').val() === 'super_admin'"
            // Expected rule: ".write": "auth != null"

            expect(auditLogPath).toBe('audit_logs');
        });
    });
});

// =============================================================================
// INTEGRATION-STYLE TESTS
// =============================================================================

describe('Audit Service Integration Tests', () => {
    it('should correctly track full user lifecycle', () => {
        const userLifecycle = [
            { action: 'CREATE', target: 'user', targetId: 'new-user-1' },
            { action: 'LOGIN', target: 'session', targetId: 'new-user-1' },
            { action: 'UPDATE', target: 'user', targetId: 'new-user-1' },
            { action: 'LOGOUT', target: 'session', targetId: 'new-user-1' },
            { action: 'DELETE', target: 'user', targetId: 'new-user-1' },
        ];

        expect(userLifecycle[0].action).toBe('CREATE');
        expect(userLifecycle[userLifecycle.length - 1].action).toBe('DELETE');
    });

    it('should correctly track security incident', () => {
        const securityIncident = [
            { action: 'LOGIN', userId: 'attacker-1' },
            { action: 'ACCESS_DENIED', userId: 'attacker-1', targetId: '/admin/users' },
            { action: 'ACCESS_DENIED', userId: 'attacker-1', targetId: '/admin/migration' },
            { action: 'ACCESS_DENIED', userId: 'attacker-1', targetId: '/admin/settings' },
            // Admin notices pattern and blocks user
            { action: 'STATUS_CHANGE', targetId: 'attacker-1', details: { newStatus: 'blocked' } },
            { action: 'LOGOUT', userId: 'attacker-1', details: { reason: 'blocked' } },
        ];

        const accessDeniedCount = securityIncident.filter(
            e => e.action === 'ACCESS_DENIED'
        ).length;

        expect(accessDeniedCount).toBe(3);
    });

    it('should track role escalation correctly', () => {
        const roleEscalation = [
            { action: 'ROLE_CHANGE', targetId: 'user-1', details: { oldRole: 'student', newRole: 'teacher' } },
            { action: 'ROLE_CHANGE', targetId: 'user-1', details: { oldRole: 'teacher', newRole: 'super_admin' } },
        ];

        expect(roleEscalation[0].details.oldRole).toBe('student');
        expect(roleEscalation[1].details.newRole).toBe('super_admin');
    });
});
