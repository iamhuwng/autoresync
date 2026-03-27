import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnhancedTestResultRecord } from '../types/results.types';
import {
    applyTeacherResultReindexPlan,
    buildTeacherResultReindexPlan,
    detectStaleTeacherIndexTeacherIds,
    isTeacherIndexBackfillEligible,
} from './resultVisibilityReindex.service';

function createResult(
    overrides: Partial<EnhancedTestResultRecord> = {}
): EnhancedTestResultRecord {
    return {
        resultId: 'result-1',
        sessionCode: 'SESSION-1',
        testId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student',
        isGuest: false,
        teacherId: 'legacy-teacher',
        totalScore: 8,
        maxScore: 10,
        percentage: 80,
        bandScore: 6.5,
        testTitle: 'Test',
        testType: 'test',
        testSkill: 'reading',
        testDuration: 30,
        questionResults: [],
        correct: 8,
        incorrect: 2,
        partialCredit: 0,
        totalQuestions: 10,
        submittedAt: 1000,
        timeElapsed: 1200,
        createdAt: 1000,
        markingStatus: 'auto-marked',
        visibility: {
            contextType: 'homework',
            sourceType: 'homework',
            sourceId: 'hw-1',
            sourceNameSnapshot: 'Homework 1',
            visibilityOwnerTeacherId: 'teacher-1',
            ownerResolutionSource: 'homework.createdBy',
            ownershipResolved: true,
            unresolvedReason: null,
            homeworkId: 'hw-1',
            sessionCode: 'SESSION-1',
            courseId: null,
            classId: null,
            assignmentId: null,
        },
        ...overrides,
    };
}

describe('resultVisibilityReindex.service', () => {
    const updateMock = vi.fn();
    const dependencies = {
        update: updateMock,
        rootRef: () => '__root__' as any,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        updateMock.mockResolvedValue(undefined);
    });

    it('treats resolved teacher-owned rows as safe backfill candidates', () => {
        expect(isTeacherIndexBackfillEligible(createResult())).toBe(true);
        expect(isTeacherIndexBackfillEligible(createResult({
            visibility: {
                ...createResult().visibility!,
                contextType: 'solo_practice',
                sourceType: 'solo_practice',
                visibilityOwnerTeacherId: null,
                ownerResolutionSource: 'solo_practice',
            },
        }))).toBe(false);
        expect(isTeacherIndexBackfillEligible(createResult({
            visibility: {
                ...createResult().visibility!,
                ownershipResolved: false,
                visibilityOwnerTeacherId: null,
                ownerResolutionSource: 'unresolved',
                unresolvedReason: 'owner_not_resolved',
            },
        }))).toBe(false);
    });

    it('detects stale teacher index rows from old raw teacherId semantics', () => {
        const result = createResult();

        expect(detectStaleTeacherIndexTeacherIds(result, ['legacy-teacher', 'teacher-1'])).toEqual([
            'legacy-teacher',
        ]);
    });

    it('plans stale teacher index deletion plus normalized rebuild for resolved rows', () => {
        const plan = buildTeacherResultReindexPlan({
            results: [createResult({
                resultId: 'result-2',
                sessionCode: 'SESSION-2',
                submittedAt: 2000,
            })],
            existingTeacherIdsByResultId: {
                'result-2': ['legacy-teacher'],
            },
        });

        expect(plan).toMatchObject({
            rebuiltCount: 1,
            deletedCount: 1,
            skippedCount: 0,
            unresolvedCount: 0,
        });
        expect(plan.updates['test_results_by_teacher/legacy-teacher/result-2']).toBeNull();
        expect(plan.updates['test_results_by_teacher/teacher-1/result-2']).toEqual(
            expect.objectContaining({
                resultId: 'result-2',
                studentId: 'student-1',
                studentName: 'Student',
                percentage: 80,
            }),
        );
    });

    it('removes existing teacher indexes for solo practice rows without rebuilding them', () => {
        const plan = buildTeacherResultReindexPlan({
            results: [createResult({
                resultId: 'result-3',
                visibility: {
                    ...createResult().visibility!,
                    contextType: 'solo_practice',
                    sourceType: 'solo_practice',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'solo_practice',
                },
            })],
            existingTeacherIdsByResultId: {
                'result-3': ['legacy-teacher'],
            },
        });

        expect(plan).toMatchObject({
            rebuiltCount: 0,
            deletedCount: 1,
        });
        expect(plan.updates['test_results_by_teacher/legacy-teacher/result-3']).toBeNull();
    });

    it('flags unresolved rows for reporting-style follow-up and clears stale indexes', () => {
        const plan = buildTeacherResultReindexPlan({
            results: [createResult({
                resultId: 'result-4',
                visibility: {
                    ...createResult().visibility!,
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'SESSION-4',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                },
            })],
            existingTeacherIdsByResultId: {
                'result-4': ['legacy-teacher'],
            },
        });

        expect(plan).toMatchObject({
            rebuiltCount: 0,
            deletedCount: 1,
            unresolvedCount: 1,
        });
        expect(plan.updates['test_results_by_teacher/legacy-teacher/result-4']).toBeNull();
    });

    it('rebuilds canonical class and course indexes while deleting stale nested buckets', () => {
        const plan = buildTeacherResultReindexPlan({
            results: [createResult({
                resultId: 'result-7',
                courseId: 'course-root',
                classId: 'class-root',
                moduleId: 'module-7',
                visibility: {
                    ...createResult().visibility!,
                    contextType: 'course_material',
                    sourceType: 'course_material',
                    sourceId: 'material-7',
                    courseId: 'course-7',
                    classId: 'class-7',
                },
            })],
            existingTeacherIdsByResultId: {
                'result-7': ['teacher-1'],
            },
            existingCourseLocationsByResultId: {
                'result-7': [
                    { scopeId: 'course-root', studentId: 'student-1' },
                    { scopeId: 'course-7', studentId: 'legacy-student' },
                ],
            },
            existingClassLocationsByResultId: {
                'result-7': [
                    { scopeId: 'class-root', studentId: 'student-1' },
                ],
            },
        });

        expect(plan).toMatchObject({
            rebuiltCount: 2,
            deletedCount: 3,
            rebuiltCourseCount: 1,
            deletedCourseCount: 2,
            rebuiltClassCount: 1,
            deletedClassCount: 1,
        });
        expect(plan.updates['test_results_by_course/course-root/student-1/result-7']).toBeNull();
        expect(plan.updates['test_results_by_course/course-7/legacy-student/result-7']).toBeNull();
        expect(plan.updates['test_results_by_class/class-root/student-1/result-7']).toBeNull();
        expect(plan.updates['test_results_by_course/course-7/student-1/result-7']).toEqual(
            expect.objectContaining({
                resultId: 'result-7',
                moduleId: 'module-7',
            }),
        );
        expect(plan.updates['test_results_by_class/class-7/student-1/result-7']).toEqual(
            expect.objectContaining({
                resultId: 'result-7',
                courseId: 'course-7',
            }),
        );
    });

    it('removes stale class and course indexes for unresolved rows without backfilling them', () => {
        const plan = buildTeacherResultReindexPlan({
            results: [createResult({
                resultId: 'result-8',
                courseId: 'course-8',
                classId: 'class-8',
                visibility: {
                    ...createResult().visibility!,
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'SESSION-8',
                    ownershipResolved: false,
                    visibilityOwnerTeacherId: null,
                    unresolvedReason: 'owner_not_resolved',
                    courseId: 'course-8',
                    classId: 'class-8',
                    ownerResolutionSource: 'unresolved',
                },
            })],
            existingCourseLocationsByResultId: {
                'result-8': [
                    { scopeId: 'course-8', studentId: 'student-1' },
                ],
            },
            existingClassLocationsByResultId: {
                'result-8': [
                    { scopeId: 'class-8', studentId: 'student-1' },
                ],
            },
        });

        expect(plan).toMatchObject({
            rebuiltCourseCount: 0,
            rebuiltClassCount: 0,
            deletedCourseCount: 1,
            deletedClassCount: 1,
            unresolvedCount: 1,
        });
        expect(plan.updates['test_results_by_course/course-8/student-1/result-8']).toBeNull();
        expect(plan.updates['test_results_by_class/class-8/student-1/result-8']).toBeNull();
    });

    it('never treats legacy raw teacherId alone as safe backfill authority', () => {
        const result = createResult({
            visibility: undefined,
        });

        expect(isTeacherIndexBackfillEligible(result)).toBe(false);
    });

    it('applies the batched reindex plan through one root update map', async () => {
        const plan = buildTeacherResultReindexPlan({
            results: [
                createResult({
                    resultId: 'result-5',
                    submittedAt: 5000,
                }),
                createResult({
                    resultId: 'result-6',
                    visibility: {
                        ...createResult().visibility!,
                        contextType: 'class_session',
                        sourceType: 'session',
                        sourceId: 'SESSION-6',
                        visibilityOwnerTeacherId: null,
                        ownerResolutionSource: 'unresolved',
                        ownershipResolved: false,
                        unresolvedReason: 'owner_not_resolved',
                    },
                }),
            ],
            existingTeacherIdsByResultId: {
                'result-5': ['legacy-teacher'],
                'result-6': ['legacy-teacher'],
            },
        });

        const summary = await applyTeacherResultReindexPlan(plan, dependencies);

        expect(updateMock).toHaveBeenCalledWith('__root__', plan.updates);
        expect(summary).toMatchObject({
            rebuiltCount: 1,
            deletedCount: 2,
            unresolvedCount: 1,
        });
    });
});
