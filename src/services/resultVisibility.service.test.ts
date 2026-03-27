import { describe, expect, it } from 'vitest';
import type { ResultVisibilitySnapshot } from '../types/results.types';
import {
    buildDeletedSourceDisplayMetadata,
    classifyTeacherResultVisibility,
} from './resultVisibility.service';

function createVisibility(
    overrides: Partial<ResultVisibilitySnapshot> = {}
): ResultVisibilitySnapshot {
    return {
        contextType: 'homework',
        sourceType: 'homework',
        sourceId: 'hw-1',
        sourceNameSnapshot: 'Homework 1',
        visibilityOwnerTeacherId: 'teacher-1',
        ownerResolutionSource: 'homework.createdBy',
        ownershipResolved: true,
        unresolvedReason: null,
        homeworkId: 'hw-1',
        sessionCode: null,
        courseId: null,
        classId: null,
        assignmentId: null,
        ...overrides,
    };
}

describe('resultVisibility.service', () => {
    it('returns a visible teacher-owned verdict when owner and assignment access match', () => {
        const verdict = classifyTeacherResultVisibility({
            result: {
                visibility: createVisibility(),
            },
            teacherId: 'teacher-1',
            hasAssignmentAccess: true,
        });

        expect(verdict).toMatchObject({
            isVisibleToTeacher: true,
            isTeacherOwned: true,
            shouldDisplayInTeacherHistory: true,
            shouldDisplayInTeacherDetail: true,
            shouldAllowTeacherActions: true,
            excludeFromAnalytics: false,
            isUnresolved: false,
            exclusionReason: 'visible',
        });
        expect(verdict.soloPractice).toMatchObject({
            isSoloPractice: false,
            tagLabel: null,
        });
    });

    it('uses the normalized owner for public-library assignments instead of raw authored teacher fields', () => {
        const result = {
            teacherId: 'teacher-c',
            context: {
                type: 'course_material',
                source: {
                    type: 'library',
                    id: 'material-1',
                    name: 'Shared Library Test',
                },
            },
            visibility: createVisibility({
                contextType: 'course_material',
                sourceType: 'course',
                sourceId: 'course-1',
                sourceNameSnapshot: 'Teacher A Assignment',
                visibilityOwnerTeacherId: 'teacher-a',
                ownerResolutionSource: 'course.ownerId',
                homeworkId: null,
                sessionCode: null,
                courseId: 'course-1',
            }),
        } as any;

        const assignedTeacherVerdict = classifyTeacherResultVisibility({
            result,
            teacherId: 'teacher-a',
            hasAssignmentAccess: true,
        });
        const authorTeacherVerdict = classifyTeacherResultVisibility({
            result,
            teacherId: 'teacher-c',
            hasAssignmentAccess: true,
        });

        expect(assignedTeacherVerdict).toMatchObject({
            isVisibleToTeacher: true,
            isTeacherOwned: true,
            visibilityOwnerTeacherId: 'teacher-a',
            exclusionReason: 'visible',
        });
        expect(authorTeacherVerdict).toMatchObject({
            isVisibleToTeacher: false,
            isTeacherOwned: false,
            visibilityOwnerTeacherId: 'teacher-a',
            exclusionReason: 'teacher_not_owner',
        });
    });

    it('excludes unresolved rows from teacher visibility and analytics', () => {
        const verdict = classifyTeacherResultVisibility({
            result: {
                visibility: createVisibility({
                    contextType: 'unresolved',
                    sourceType: 'session',
                    sourceId: 'SESSION-1',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                }),
            },
            teacherId: 'teacher-1',
            hasAssignmentAccess: true,
        });

        expect(verdict).toMatchObject({
            isVisibleToTeacher: false,
            isTeacherOwned: false,
            shouldDisplayInTeacherHistory: false,
            shouldDisplayInTeacherDetail: false,
            excludeFromAnalytics: true,
            isUnresolved: true,
            exclusionReason: 'unresolved',
        });
    });

    it('keeps solo practice visible but view-only and analytics-excluded', () => {
        const verdict = classifyTeacherResultVisibility({
            result: {
                visibility: createVisibility({
                    contextType: 'solo_practice',
                    sourceType: 'solo_practice',
                    sourceId: 'material-1',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'solo_practice',
                }),
            },
            teacherId: 'teacher-1',
            hasAssignmentAccess: true,
        });

        expect(verdict).toMatchObject({
            isVisibleToTeacher: true,
            isTeacherOwned: false,
            shouldAllowTeacherActions: false,
            excludeFromAnalytics: true,
            isUnresolved: false,
        });
        expect(verdict.soloPractice).toMatchObject({
            isSoloPractice: true,
            teacherCanView: true,
            teacherActionsAllowed: false,
            tagLabel: 'Solo Practice',
            excludeFromAnalytics: true,
        });
    });

    it('clears visibility immediately when assignment access is revoked', () => {
        const verdict = classifyTeacherResultVisibility({
            result: {
                visibility: createVisibility(),
            },
            teacherId: 'teacher-1',
            hasAssignmentAccess: false,
        });

        expect(verdict).toMatchObject({
            isVisibleToTeacher: false,
            exclusionReason: 'assignment_gate_denied',
        });
    });

    it('restores teacher-owned visibility once assignment access returns', () => {
        const result = {
            visibility: createVisibility(),
        };

        const denied = classifyTeacherResultVisibility({
            result,
            teacherId: 'teacher-1',
            hasAssignmentAccess: false,
        });
        const restored = classifyTeacherResultVisibility({
            result,
            teacherId: 'teacher-1',
            hasAssignmentAccess: true,
        });

        expect(denied.isVisibleToTeacher).toBe(false);
        expect(restored.isVisibleToTeacher).toBe(true);
        expect(restored.isTeacherOwned).toBe(true);
    });

    it('returns deleted-source metadata while keeping resolved teacher-owned rows visible', () => {
        const visibility = createVisibility({
            contextType: 'course_material',
            sourceType: 'course',
            sourceId: 'course-1',
            sourceNameSnapshot: 'Archived Course',
            ownerResolutionSource: 'course.ownerId',
            courseId: 'course-1',
            sourceDeleted: false,
            sourceArchived: true,
            currentSourceName: 'Archived Course',
        });

        const verdict = classifyTeacherResultVisibility({
            result: {
                visibility,
            },
            teacherId: 'teacher-1',
            hasAssignmentAccess: true,
        });

        expect(verdict.isVisibleToTeacher).toBe(true);
        expect(verdict.deletedSource).toEqual({
            sourceType: 'course',
            sourceId: 'course-1',
            snapshotName: 'Archived Course',
            currentName: 'Archived Course',
            isDeleted: false,
            isArchived: true,
        });
        expect(buildDeletedSourceDisplayMetadata(visibility)).toEqual(verdict.deletedSource);
    });

    it('keeps deleted-source metadata hidden from teacher surfaces when ownership was never proven', () => {
        const visibility = createVisibility({
            contextType: 'course_material',
            sourceType: 'course',
            sourceId: 'course-deleted',
            sourceNameSnapshot: 'Deleted Course Snapshot',
            visibilityOwnerTeacherId: null,
            ownerResolutionSource: 'unresolved',
            ownershipResolved: false,
            unresolvedReason: 'owner_not_resolved',
            courseId: 'course-deleted',
            sourceDeleted: true,
            currentSourceName: null,
        });

        const verdict = classifyTeacherResultVisibility({
            result: {
                visibility,
            },
            teacherId: 'teacher-1',
            hasAssignmentAccess: true,
        });

        expect(verdict).toMatchObject({
            isVisibleToTeacher: false,
            shouldDisplayInTeacherHistory: false,
            shouldDisplayInTeacherDetail: false,
            isUnresolved: true,
            exclusionReason: 'unresolved',
        });
        expect(verdict.deletedSource).toEqual({
            sourceType: 'course',
            sourceId: 'course-deleted',
            snapshotName: 'Deleted Course Snapshot',
            currentName: null,
            isDeleted: true,
            isArchived: false,
        });
    });

    it('hides teacher-owned rows from non-owners even when assignment access is valid', () => {
        const verdict = classifyTeacherResultVisibility({
            result: {
                visibility: createVisibility({
                    visibilityOwnerTeacherId: 'teacher-1',
                }),
            },
            teacherId: 'teacher-2',
            hasAssignmentAccess: true,
        });

        expect(verdict).toMatchObject({
            isVisibleToTeacher: false,
            exclusionReason: 'teacher_not_owner',
        });
    });
});
