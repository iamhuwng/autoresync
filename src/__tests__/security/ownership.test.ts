/**
 * PRD-0041 ownership security contract tests.
 *
 * These tests intentionally avoid raw `result.teacherId` assumptions.
 * Teacher result visibility is derived from normalized `result.visibility`
 * plus the outer assignment gate.
 */

import { describe, expect, it } from 'vitest';

type UserRole = 'student' | 'teacher' | 'super_admin';

interface ResultVisibilitySnapshot {
  contextType: 'class_session' | 'homework' | 'course_material' | 'solo_practice';
  ownershipResolved: boolean;
  visibilityOwnerTeacherId: string | null;
  unresolvedReason: string | null;
}

interface ResultRecord {
  resultId: string;
  studentId: string;
  visibility: ResultVisibilitySnapshot;
}

function canTeacherViewResult(args: {
  normalizedOwnerTeacherId: string;
  hasAssignmentAccess: boolean;
  result: ResultRecord;
}): boolean {
  const { normalizedOwnerTeacherId, hasAssignmentAccess, result } = args;

  // Outer gate remains required.
  if (!hasAssignmentAccess) {
    return false;
  }

  // Unresolved rows are never visible to teacher surfaces.
  if (!result.visibility.ownershipResolved || result.visibility.unresolvedReason) {
    return false;
  }

  // Solo-practice rows are visible after assignment gate, but not teacher-owned.
  if (result.visibility.contextType === 'solo_practice') {
    return true;
  }

  // All teacher-owned contexts must match normalized owner.
  return result.visibility.visibilityOwnerTeacherId === normalizedOwnerTeacherId;
}

function canReadUnresolvedReport(role: UserRole): boolean {
  return role === 'super_admin';
}

function canReadSessionIndex(role: UserRole): boolean {
  return role === 'super_admin';
}

describe('Ownership security contract (PRD-0041 Task 6.5)', () => {
  it('allows teacher visibility only when normalized owner matches and assignment gate passes', () => {
    const visible = canTeacherViewResult({
      normalizedOwnerTeacherId: 'teacher-a',
      hasAssignmentAccess: true,
      result: {
        resultId: 'r-1',
        studentId: 'student-1',
        visibility: {
          contextType: 'class_session',
          ownershipResolved: true,
          visibilityOwnerTeacherId: 'teacher-a',
          unresolvedReason: null,
        },
      },
    });

    expect(visible).toBe(true);
  });

  it('denies teacher visibility when normalized owner differs, even if assignment gate passes', () => {
    const hidden = canTeacherViewResult({
      normalizedOwnerTeacherId: 'teacher-a',
      hasAssignmentAccess: true,
      result: {
        resultId: 'r-2',
        studentId: 'student-1',
        visibility: {
          contextType: 'course_material',
          ownershipResolved: true,
          visibilityOwnerTeacherId: 'teacher-c',
          unresolvedReason: null,
        },
      },
    });

    expect(hidden).toBe(false);
  });

  it('denies unresolved rows for teacher history and detail surfaces', () => {
    const hidden = canTeacherViewResult({
      normalizedOwnerTeacherId: 'teacher-a',
      hasAssignmentAccess: true,
      result: {
        resultId: 'r-3',
        studentId: 'student-1',
        visibility: {
          contextType: 'homework',
          ownershipResolved: false,
          visibilityOwnerTeacherId: null,
          unresolvedReason: 'owner_not_resolved',
        },
      },
    });

    expect(hidden).toBe(false);
  });

  it('allows solo-practice rows as view-only after assignment gate', () => {
    const visible = canTeacherViewResult({
      normalizedOwnerTeacherId: 'teacher-a',
      hasAssignmentAccess: true,
      result: {
        resultId: 'r-4',
        studentId: 'student-1',
        visibility: {
          contextType: 'solo_practice',
          ownershipResolved: true,
          visibilityOwnerTeacherId: null,
          unresolvedReason: null,
        },
      },
    });

    expect(visible).toBe(true);
  });

  it('immediately denies result visibility when assignment access is revoked', () => {
    const denied = canTeacherViewResult({
      normalizedOwnerTeacherId: 'teacher-a',
      hasAssignmentAccess: false,
      result: {
        resultId: 'r-5',
        studentId: 'student-1',
        visibility: {
          contextType: 'class_session',
          ownershipResolved: true,
          visibilityOwnerTeacherId: 'teacher-a',
          unresolvedReason: null,
        },
      },
    });

    expect(denied).toBe(false);
  });

  it('locks unresolved-report diagnostics to super_admin only', () => {
    expect(canReadUnresolvedReport('super_admin')).toBe(true);
    expect(canReadUnresolvedReport('teacher')).toBe(false);
    expect(canReadUnresolvedReport('student')).toBe(false);
  });

  it('denies broad session-index access to teachers and students', () => {
    expect(canReadSessionIndex('super_admin')).toBe(true);
    expect(canReadSessionIndex('teacher')).toBe(false);
    expect(canReadSessionIndex('student')).toBe(false);
  });

  it('denies broad session-index writes unless the row owner matches or the user is super_admin', () => {
    const canWriteSessionIndex = (role: UserRole, ownsRow: boolean): boolean => {
      return role === 'super_admin' || ownsRow;
    };

    expect(canWriteSessionIndex('super_admin', false)).toBe(true);
    expect(canWriteSessionIndex('teacher', false)).toBe(false);
    expect(canWriteSessionIndex('student', false)).toBe(false);
    expect(canWriteSessionIndex('student', true)).toBe(true);
  });
});
