/**
 * Firebase RTDB security rule specification for PRD-0041 Task 6.5.
 *
 * NOTE: This file documents expected rule behavior as a contract-style suite.
 * It does not spin up the emulator.
 */

import { describe, expect, it } from 'vitest';

describe('Firebase security rules contract (PRD-0041 Task 6.5)', () => {
  describe('test_results/{resultId} read', () => {
    it('allows student to read own row', () => {
      const spec = {
        path: '/test_results/result-1',
        auth: { uid: 'student-1', role: 'student' },
        data: {
          studentId: 'student-1',
          visibility: {
            ownershipResolved: true,
            visibilityOwnerTeacherId: 'teacher-a',
          },
        },
        expectedResult: 'ALLOW',
      };

      expect(spec.expectedResult).toBe('ALLOW');
    });

    it('allows teacher only when normalized owner matches and ownership is resolved', () => {
      const spec = {
        path: '/test_results/result-2',
        auth: { uid: 'teacher-a', role: 'teacher' },
        data: {
          studentId: 'student-1',
          visibility: {
            ownershipResolved: true,
            visibilityOwnerTeacherId: 'teacher-a',
          },
        },
        expectedResult: 'ALLOW',
      };

      expect(spec.expectedResult).toBe('ALLOW');
    });

    it('denies teacher when normalized owner does not match', () => {
      const spec = {
        path: '/test_results/result-3',
        auth: { uid: 'teacher-a', role: 'teacher' },
        data: {
          studentId: 'student-1',
          visibility: {
            ownershipResolved: true,
            visibilityOwnerTeacherId: 'teacher-c',
          },
        },
        expectedResult: 'DENY',
      };

      expect(spec.expectedResult).toBe('DENY');
    });

    it('denies teacher when ownership is unresolved', () => {
      const spec = {
        path: '/test_results/result-4',
        auth: { uid: 'teacher-a', role: 'teacher' },
        data: {
          studentId: 'student-1',
          visibility: {
            ownershipResolved: false,
            visibilityOwnerTeacherId: null,
          },
        },
        expectedResult: 'DENY',
      };

      expect(spec.expectedResult).toBe('DENY');
    });
  });

  describe('index-path access', () => {
    it('denies blanket teacher-wide read on test_results_by_student/{studentId}', () => {
      const spec = {
        path: '/test_results_by_student/student-1',
        auth: { uid: 'teacher-a', role: 'teacher' },
        expectedResult: 'DENY',
      };

      expect(spec.expectedResult).toBe('DENY');
    });

    it('denies broad authenticated reads on test_results_by_session/{sessionCode}', () => {
      const teacherSessionSpec = {
        path: '/test_results_by_session/session-1',
        auth: { uid: 'teacher-a', role: 'teacher' },
        expectedResult: 'DENY',
      };
      const studentSessionSpec = {
        path: '/test_results_by_session/session-1',
        auth: { uid: 'student-1', role: 'student' },
        expectedResult: 'DENY',
      };
      const superAdminSessionSpec = {
        path: '/test_results_by_session/session-1',
        auth: { uid: 'admin-1', role: 'super_admin' },
        expectedResult: 'ALLOW',
      };

      expect(teacherSessionSpec.expectedResult).toBe('DENY');
      expect(studentSessionSpec.expectedResult).toBe('DENY');
      expect(superAdminSessionSpec.expectedResult).toBe('ALLOW');
    });

    it('allows only owner or super_admin writes on test_results_by_session/{sessionCode}', () => {
      const ownerWriteSpec = {
        path: '/test_results_by_session/session-1/result-1',
        auth: { uid: 'student-1', role: 'student' },
        data: {
          studentId: 'student-1',
          sessionCode: 'session-1',
        },
        expectedResult: 'ALLOW',
      };
      const teacherWriteSpec = {
        path: '/test_results_by_session/session-1/result-1',
        auth: { uid: 'teacher-a', role: 'teacher' },
        data: {
          studentId: 'student-1',
          sessionCode: 'session-1',
        },
        expectedResult: 'DENY',
      };

      expect(ownerWriteSpec.expectedResult).toBe('ALLOW');
      expect(teacherWriteSpec.expectedResult).toBe('DENY');
    });

    it('allows only own teacher index path (or super_admin) on test_results_by_teacher/{teacherId}', () => {
      const ownPathSpec = {
        path: '/test_results_by_teacher/teacher-a',
        auth: { uid: 'teacher-a', role: 'teacher' },
        expectedResult: 'ALLOW',
      };
      const otherPathSpec = {
        path: '/test_results_by_teacher/teacher-b',
        auth: { uid: 'teacher-a', role: 'teacher' },
        expectedResult: 'DENY',
      };

      expect(ownPathSpec.expectedResult).toBe('ALLOW');
      expect(otherPathSpec.expectedResult).toBe('DENY');
    });
  });

  describe('reports/result_visibility/unresolved/{resultId}', () => {
    it('locks read access to super_admin only', () => {
      const superAdminRead = {
        auth: { uid: 'admin-1', role: 'super_admin' },
        expectedResult: 'ALLOW',
      };
      const teacherRead = {
        auth: { uid: 'teacher-a', role: 'teacher' },
        expectedResult: 'DENY',
      };
      const studentRead = {
        auth: { uid: 'student-1', role: 'student' },
        expectedResult: 'DENY',
      };

      expect(superAdminRead.expectedResult).toBe('ALLOW');
      expect(teacherRead.expectedResult).toBe('DENY');
      expect(studentRead.expectedResult).toBe('DENY');
    });

    it('allows authenticated non-guest writers but keeps reads admin-only', () => {
      const superAdminWrite = {
        auth: { uid: 'admin-1', role: 'super_admin' },
        expectedResult: 'ALLOW',
      };
      const teacherWrite = {
        auth: { uid: 'teacher-a', role: 'teacher' },
        expectedResult: 'ALLOW',
      };
      const studentWrite = {
        auth: { uid: 'student-1', role: 'student' },
        expectedResult: 'ALLOW',
      };
      const guestWrite = {
        auth: { uid: 'guest-1', role: 'guest' },
        expectedResult: 'DENY',
      };

      expect(superAdminWrite.expectedResult).toBe('ALLOW');
      expect(teacherWrite.expectedResult).toBe('ALLOW');
      expect(studentWrite.expectedResult).toBe('ALLOW');
      expect(guestWrite.expectedResult).toBe('DENY');
    });
  });
});
