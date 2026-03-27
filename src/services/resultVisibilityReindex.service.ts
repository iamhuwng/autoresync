import { ref, update } from 'firebase/database';
import { database } from './firebase';
import type { EnhancedTestResultRecord } from '../types/results.types';

export interface ResultVisibilityReindexDependencies {
    update: typeof update;
    rootRef: () => ReturnType<typeof ref>;
}

export interface ScopedIndexLocation {
    scopeId: string;
    studentId: string;
}

export interface TeacherIndexReindexPlan {
    updates: Record<string, Record<string, unknown> | null>;
    rebuiltCount: number;
    deletedCount: number;
    skippedCount: number;
    unresolvedCount: number;
    rebuiltCourseCount: number;
    deletedCourseCount: number;
    rebuiltClassCount: number;
    deletedClassCount: number;
}

export interface BuildTeacherIndexReindexPlanInput {
    results: Array<Pick<
        EnhancedTestResultRecord,
        | 'resultId'
        | 'sessionCode'
        | 'studentId'
        | 'studentName'
        | 'percentage'
        | 'bandScore'
        | 'submittedAt'
        | 'isGuest'
        | 'teacherId'
        | 'testTitle'
        | 'testSkill'
        | 'moduleId'
        | 'courseId'
        | 'classId'
        | 'visibility'
    >>;
    existingTeacherIdsByResultId?: Record<string, string[]>;
    existingClassLocationsByResultId?: Record<string, ScopedIndexLocation[]>;
    existingCourseLocationsByResultId?: Record<string, ScopedIndexLocation[]>;
}

const defaultDependencies: ResultVisibilityReindexDependencies = {
    update,
    rootRef: () => ref(database),
};

export function isTeacherIndexBackfillEligible(
    result: Pick<EnhancedTestResultRecord, 'teacherId' | 'visibility'>
): boolean {
    const visibility = result.visibility;

    return Boolean(
        visibility
        && visibility.ownershipResolved
        && visibility.visibilityOwnerTeacherId
        && visibility.contextType !== 'solo_practice'
    );
}

export function isScopedIndexBackfillEligible(
    result: Pick<EnhancedTestResultRecord, 'teacherId' | 'visibility'>
): boolean {
    const visibility = result.visibility;

    return Boolean(
        visibility
        && visibility.ownershipResolved
        && visibility.contextType !== 'solo_practice'
    );
}

export function detectStaleTeacherIndexTeacherIds(
    result: Pick<EnhancedTestResultRecord, 'resultId' | 'teacherId' | 'visibility'>,
    existingTeacherIds: string[] = []
): string[] {
    if (!isTeacherIndexBackfillEligible(result)) {
        return existingTeacherIds;
    }

    const canonicalTeacherId = result.visibility!.visibilityOwnerTeacherId!;
    return existingTeacherIds.filter((teacherId) => teacherId !== canonicalTeacherId);
}

export function getCanonicalCourseIndexId(
    result: Pick<EnhancedTestResultRecord, 'courseId' | 'visibility' | 'teacherId'>
): string | null {
    if (!isScopedIndexBackfillEligible(result)) {
        return null;
    }

    return result.visibility?.courseId ?? result.courseId ?? null;
}

export function getCanonicalClassIndexId(
    result: Pick<EnhancedTestResultRecord, 'classId' | 'visibility' | 'teacherId'>
): string | null {
    if (!isScopedIndexBackfillEligible(result)) {
        return null;
    }

    return result.visibility?.classId ?? result.classId ?? null;
}

export function buildTeacherResultReindexPlan(
    input: BuildTeacherIndexReindexPlanInput
): TeacherIndexReindexPlan {
    const plan: TeacherIndexReindexPlan = {
        updates: {},
        rebuiltCount: 0,
        deletedCount: 0,
        skippedCount: 0,
        unresolvedCount: 0,
        rebuiltCourseCount: 0,
        deletedCourseCount: 0,
        rebuiltClassCount: 0,
        deletedClassCount: 0,
    };

    for (const result of input.results) {
        const existingTeacherIds = input.existingTeacherIdsByResultId?.[result.resultId] ?? [];
        const existingCourseLocations = input.existingCourseLocationsByResultId?.[result.resultId] ?? [];
        const existingClassLocations = input.existingClassLocationsByResultId?.[result.resultId] ?? [];
        const staleTeacherIds = detectStaleTeacherIndexTeacherIds(result, existingTeacherIds);
        const canonicalCourseId = getCanonicalCourseIndexId(result);
        const canonicalClassId = getCanonicalClassIndexId(result);

        for (const teacherId of staleTeacherIds) {
            plan.updates[getTeacherIndexPath(teacherId, result.resultId)] = null;
            plan.deletedCount += 1;
        }

        for (const location of existingCourseLocations) {
            if (
                location.scopeId === canonicalCourseId
                && location.studentId === result.studentId
            ) {
                continue;
            }

            plan.updates[getScopedIndexPath('course', location.scopeId, location.studentId, result.resultId)] = null;
            plan.deletedCount += 1;
            plan.deletedCourseCount += 1;
        }

        for (const location of existingClassLocations) {
            if (
                location.scopeId === canonicalClassId
                && location.studentId === result.studentId
            ) {
                continue;
            }

            plan.updates[getScopedIndexPath('class', location.scopeId, location.studentId, result.resultId)] = null;
            plan.deletedCount += 1;
            plan.deletedClassCount += 1;
        }

        if (!isTeacherIndexBackfillEligible(result)) {
            if (!result.visibility || !result.visibility.ownershipResolved) {
                plan.unresolvedCount += 1;
            } else {
                plan.skippedCount += 1;
            }
            continue;
        }

        const canonicalTeacherId = result.visibility!.visibilityOwnerTeacherId!;
        if (!existingTeacherIds.includes(canonicalTeacherId)) {
            plan.updates[getTeacherIndexPath(canonicalTeacherId, result.resultId)] = buildTeacherIndexRow(result);
            plan.rebuiltCount += 1;
        } else {
            plan.skippedCount += 1;
        }

        if (canonicalCourseId) {
            const hasCanonicalCourseLocation = existingCourseLocations.some(
                (location) =>
                    location.scopeId === canonicalCourseId
                    && location.studentId === result.studentId
            );

            if (!hasCanonicalCourseLocation) {
                plan.updates[getScopedIndexPath('course', canonicalCourseId, result.studentId, result.resultId)] =
                    buildCourseIndexRow(result);
                plan.rebuiltCount += 1;
                plan.rebuiltCourseCount += 1;
            }
        }

        if (canonicalClassId) {
            const hasCanonicalClassLocation = existingClassLocations.some(
                (location) =>
                    location.scopeId === canonicalClassId
                    && location.studentId === result.studentId
            );

            if (!hasCanonicalClassLocation) {
                plan.updates[getScopedIndexPath('class', canonicalClassId, result.studentId, result.resultId)] =
                    buildClassIndexRow(result, canonicalCourseId);
                plan.rebuiltCount += 1;
                plan.rebuiltClassCount += 1;
            }
        }
    }

    return plan;
}

export async function applyTeacherResultReindexPlan(
    plan: TeacherIndexReindexPlan,
    dependencies: ResultVisibilityReindexDependencies = defaultDependencies
): Promise<TeacherIndexReindexPlan> {
    if (Object.keys(plan.updates).length > 0) {
        await dependencies.update(dependencies.rootRef(), plan.updates);
    }

    return plan;
}

function buildTeacherIndexRow(
    result: Pick<
        EnhancedTestResultRecord,
        | 'resultId'
        | 'sessionCode'
        | 'studentId'
        | 'studentName'
        | 'percentage'
        | 'submittedAt'
        | 'isGuest'
    >
): Record<string, unknown> {
    return {
        resultId: result.resultId,
        sessionCode: result.sessionCode,
        studentId: result.studentId,
        studentName: result.studentName,
        percentage: result.percentage,
        submittedAt: result.submittedAt,
        isGuest: Boolean(result.isGuest),
    };
}

function buildCourseIndexRow(
    result: Pick<
        EnhancedTestResultRecord,
        | 'resultId'
        | 'studentId'
        | 'studentName'
        | 'percentage'
        | 'bandScore'
        | 'testTitle'
        | 'testSkill'
        | 'submittedAt'
        | 'moduleId'
    >
): Record<string, unknown> {
    return {
        resultId: result.resultId,
        studentId: result.studentId,
        studentName: result.studentName,
        percentage: result.percentage,
        bandScore: result.bandScore,
        testTitle: result.testTitle,
        testSkill: result.testSkill,
        submittedAt: result.submittedAt,
        moduleId: result.moduleId ?? null,
    };
}

function buildClassIndexRow(
    result: Pick<
        EnhancedTestResultRecord,
        | 'resultId'
        | 'studentId'
        | 'studentName'
        | 'percentage'
        | 'bandScore'
        | 'testTitle'
        | 'testSkill'
        | 'submittedAt'
    >,
    courseId: string | null
): Record<string, unknown> {
    return {
        resultId: result.resultId,
        studentId: result.studentId,
        studentName: result.studentName,
        percentage: result.percentage,
        bandScore: result.bandScore,
        testTitle: result.testTitle,
        testSkill: result.testSkill,
        submittedAt: result.submittedAt,
        courseId,
    };
}

function getTeacherIndexPath(teacherId: string, resultId: string): string {
    return `test_results_by_teacher/${teacherId}/${resultId}`;
}

function getScopedIndexPath(
    scopeType: 'course' | 'class',
    scopeId: string,
    studentId: string,
    resultId: string
): string {
    return `test_results_by_${scopeType}/${scopeId}/${studentId}/${resultId}`;
}
