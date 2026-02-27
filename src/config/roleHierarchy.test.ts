/**
 * Role Hierarchy Tests
 * 
 * Tests for the role hierarchy and permission utility functions.
 * Part of RBAC Security Hardening (PRD-0016).
 */

import { describe, it, expect } from 'vitest';
import {
    hasPermission,
    getRoleLevel,
    canAccessAsRole,
    getInheritedRoles,
    hasCapability,
    getRolePermissions,
} from './roleHierarchy';
import type { UserRole, Permission } from '../types/security.types';

describe('Role Hierarchy', () => {
    describe('getRoleLevel', () => {
        it('should return correct level for student', () => {
            expect(getRoleLevel('student')).toBe(1);
        });

        it('should return correct level for teacher', () => {
            expect(getRoleLevel('teacher')).toBe(2);
        });

        it('should return correct level for super_admin', () => {
            expect(getRoleLevel('super_admin')).toBe(3);
        });

        it('should return 0 for invalid role', () => {
            expect(getRoleLevel('invalid' as UserRole)).toBe(0);
        });
    });

    describe('hasPermission', () => {
        describe('Direct role matching', () => {
            it('should allow student to access student routes', () => {
                expect(hasPermission('student', ['student'])).toBe(true);
            });

            it('should allow teacher to access teacher routes', () => {
                expect(hasPermission('teacher', ['teacher'])).toBe(true);
            });

            it('should allow super_admin to access admin routes', () => {
                expect(hasPermission('super_admin', ['super_admin'])).toBe(true);
            });
        });

        describe('Role hierarchy (higher can access lower)', () => {
            it('should allow super_admin to access teacher routes', () => {
                expect(hasPermission('super_admin', ['teacher'])).toBe(true);
            });

            it('should allow super_admin to access student routes', () => {
                expect(hasPermission('super_admin', ['student'])).toBe(true);
            });

            it('should allow teacher to access student routes', () => {
                expect(hasPermission('teacher', ['student'])).toBe(true);
            });
        });

        describe('Role hierarchy (lower cannot access higher)', () => {
            it('should deny student access to teacher routes', () => {
                expect(hasPermission('student', ['teacher'])).toBe(false);
            });

            it('should deny student access to admin routes', () => {
                expect(hasPermission('student', ['super_admin'])).toBe(false);
            });

            it('should deny teacher access to admin-only routes', () => {
                expect(hasPermission('teacher', ['super_admin'])).toBe(false);
            });
        });

        describe('Multiple required roles', () => {
            it('should allow if user matches any required role', () => {
                expect(hasPermission('student', ['student', 'teacher'])).toBe(true);
                expect(hasPermission('teacher', ['student', 'teacher'])).toBe(true);
            });

            it('should allow super_admin to access teacher+admin routes', () => {
                expect(hasPermission('super_admin', ['teacher', 'super_admin'])).toBe(true);
            });
        });

        describe('Empty required roles', () => {
            it('should allow any role when no roles specified', () => {
                expect(hasPermission('student', [])).toBe(true);
                expect(hasPermission('teacher', [])).toBe(true);
                expect(hasPermission('super_admin', [])).toBe(true);
            });
        });

        describe('Invalid roles', () => {
            it('should deny access for invalid user role', () => {
                expect(hasPermission('invalid' as UserRole, ['student'])).toBe(false);
            });
        });
    });

    describe('canAccessAsRole', () => {
        it('should allow super_admin to act as teacher', () => {
            expect(canAccessAsRole('super_admin', 'teacher')).toBe(true);
        });

        it('should allow super_admin to act as student', () => {
            expect(canAccessAsRole('super_admin', 'student')).toBe(true);
        });

        it('should allow teacher to act as student', () => {
            expect(canAccessAsRole('teacher', 'student')).toBe(true);
        });

        it('should deny teacher acting as super_admin', () => {
            expect(canAccessAsRole('teacher', 'super_admin')).toBe(false);
        });

        it('should deny student acting as teacher', () => {
            expect(canAccessAsRole('student', 'teacher')).toBe(false);
        });

        it('should allow role to act as itself', () => {
            expect(canAccessAsRole('student', 'student')).toBe(true);
            expect(canAccessAsRole('teacher', 'teacher')).toBe(true);
            expect(canAccessAsRole('super_admin', 'super_admin')).toBe(true);
        });
    });

    describe('getInheritedRoles', () => {
        it('should return only student for student role', () => {
            const roles = getInheritedRoles('student');
            expect(roles).toEqual(['student']);
        });

        it('should return student and teacher for teacher role', () => {
            const roles = getInheritedRoles('teacher');
            expect(roles).toContain('student');
            expect(roles).toContain('teacher');
            expect(roles).not.toContain('super_admin');
        });

        it('should return all roles for super_admin', () => {
            const roles = getInheritedRoles('super_admin');
            expect(roles).toContain('student');
            expect(roles).toContain('teacher');
            expect(roles).toContain('super_admin');
        });
    });

    describe('hasCapability (Permission-based)', () => {
        it('should give super_admin all permissions', () => {
            expect(hasCapability('super_admin', 'users:read')).toBe(true);
            expect(hasCapability('super_admin', 'admin:access')).toBe(true);
            expect(hasCapability('super_admin', 'students:read_all')).toBe(true);
        });

        it('should give student only student permissions', () => {
            expect(hasCapability('student', 'students:read_own')).toBe(true);
            expect(hasCapability('student', 'results:read_own')).toBe(true);
            expect(hasCapability('student', 'sessions:join')).toBe(true);
        });

        it('should deny student teacher permissions', () => {
            expect(hasCapability('student', 'sessions:create')).toBe(false);
            expect(hasCapability('student', 'courses:create')).toBe(false);
        });

        it('should give teacher teaching permissions', () => {
            expect(hasCapability('teacher', 'sessions:create')).toBe(true);
            expect(hasCapability('teacher', 'courses:create')).toBe(true);
            expect(hasCapability('teacher', 'students:read_assigned')).toBe(true);
        });

        it('should deny teacher admin permissions', () => {
            expect(hasCapability('teacher', 'admin:access')).toBe(false);
            expect(hasCapability('teacher', 'users:manage_roles')).toBe(false);
        });
    });

    describe('getRolePermissions', () => {
        it('should return student permissions for student role', () => {
            const permissions = getRolePermissions('student');
            expect(permissions).toContain('students:read_own');
            expect(permissions).toContain('sessions:join');
        });

        it('should return teacher permissions for teacher role', () => {
            const permissions = getRolePermissions('teacher');
            expect(permissions).toContain('sessions:create');
            expect(permissions).toContain('courses:create');
        });

        it('should return all permissions for super_admin', () => {
            const permissions = getRolePermissions('super_admin');
            expect(permissions).toContain('admin:access');
            expect(permissions).toContain('users:manage_roles');
        });

        it('should return empty array for invalid role', () => {
            const permissions = getRolePermissions('invalid' as UserRole);
            expect(permissions).toEqual([]);
        });
    });
});

describe('Security Scenarios', () => {
    describe('Route Access Scenarios', () => {
        it('Scenario: Student tries to access /admin/users', () => {
            // Admin routes require super_admin
            const allowedRoles: UserRole[] = ['super_admin'];
            expect(hasPermission('student', allowedRoles)).toBe(false);
        });

        it('Scenario: Student tries to access /teacher/students', () => {
            // Teacher student management requires teacher role
            const allowedRoles: UserRole[] = ['teacher'];
            expect(hasPermission('student', allowedRoles)).toBe(false);
        });

        it('Scenario: Teacher tries to access /admin/users', () => {
            // Admin routes require super_admin only
            const allowedRoles: UserRole[] = ['super_admin'];
            expect(hasPermission('teacher', allowedRoles)).toBe(false);
        });

        it('Scenario: Super admin accesses /teacher/students', () => {
            // Teacher routes should be accessible by super_admin via hierarchy
            const allowedRoles: UserRole[] = ['teacher'];
            expect(hasPermission('super_admin', allowedRoles)).toBe(true);
        });

        it('Scenario: Teacher accesses route open to teacher+admin', () => {
            const allowedRoles: UserRole[] = ['teacher', 'super_admin'];
            expect(hasPermission('teacher', allowedRoles)).toBe(true);
        });
    });
});
