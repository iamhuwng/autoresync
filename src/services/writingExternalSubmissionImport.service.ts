import { get, push, ref } from 'firebase/database';
import { database } from './firebase';
import { getClass } from './classManager';
import { getEnrollmentsByCourse } from './enrollmentManager';
import { getUserById } from './userService';
import {
    getEffectiveHomeworkDueDate,
    getHomeworkById,
    getHomeworkByTeacher,
} from './homeworkManager';
import {
    getHomeworkSubmissions,
    getStudentSubmissionsForHomework,
    submitImportedHomeworkSubmission,
} from './homeworkSubmissionService';
import {
    createSubmission,
    getSubmission,
    materializeSubmissionResult,
} from './writingSubmissionService';
import { withRestoreGuard } from './restoreGuard';
import type { HomeworkAssignment, HomeworkSubmission } from '../types/homework.types';
import type {
    IELTSWritingTest,
    WritingSubmission,
    WritingSubmissionTask,
    WritingTask,
} from '../types/ielts-writing.types';

export type WritingExternalSubmissionImportErrorCode =
    | 'validation'
    | 'ownership'
    | 'not-writing'
    | 'material-not-found'
    | 'unassigned-student'
    | 'duplicate'
    | 'in-progress'
    | 'projection'
    | 'unknown';

export interface WritingImportTaskResponse {
    taskNumber: 1 | 2;
    essayText: string;
    activeTimeSeconds?: number;
}

export interface WritingExternalSubmissionImportInput {
    homeworkId: string;
    studentId: string;
    studentName?: string;
    taskResponses: WritingImportTaskResponse[];
    submittedAt: number;
    sourceNote?: string;
    importerTeacherId: string;
    confirmInProgressOverwrite?: boolean;
}

export interface WritingImportHomeworkOption {
    homeworkId: string;
    title: string;
    materialId: string;
    materialTitle: string;
    dueDate: number;
    status: HomeworkAssignment['status'];
}

export interface WritingImportStudentOption {
    studentId: string;
    studentName: string;
    source: 'homework-target' | 'existing-submission';
}

export interface WritingImportContext {
    homework: HomeworkAssignment;
    material: IELTSWritingTest;
    students: WritingImportStudentOption[];
}

export interface WritingExternalSubmissionImportResult {
    submissionId: string;
    homeworkSubmissionId: string;
    resultId: string;
    isLate: boolean;
    attemptNumber: number;
}

interface ServiceResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: WritingExternalSubmissionImportErrorCode;
}

function failure<T>(
    code: WritingExternalSubmissionImportErrorCode,
    error: string
): ServiceResult<T> {
    return { success: false, code, error };
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function countWords(text: string): number {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

function getActiveWritingTasks(material: IELTSWritingTest): WritingTask[] {
    return material.tasks.filter((task) => {
        if (material.metadata.format === 'task1-only') return task.taskNumber === 1;
        if (material.metadata.format === 'task2-only') return task.taskNumber === 2;
        return task.taskNumber === 1 || task.taskNumber === 2;
    });
}

function isWritingMaterial(value: unknown): value is IELTSWritingTest {
    const material = value as Partial<IELTSWritingTest> | null;
    return Boolean(
        material
        && material.testType === 'IELTS'
        && material.skill === 'Writing'
        && material.metadata
        && typeof material.metadata.title === 'string'
        && typeof material.metadata.duration === 'number'
        && Array.isArray(material.tasks)
    );
}

function addUniqueStudent(
    studentsById: Map<string, WritingImportStudentOption>,
    studentId: string | undefined,
    studentName: string | undefined,
    source: WritingImportStudentOption['source']
) {
    const normalizedId = normalizeText(studentId);
    if (!normalizedId || studentsById.has(normalizedId)) {
        return;
    }

    studentsById.set(normalizedId, {
        studentId: normalizedId,
        studentName: normalizeText(studentName) || normalizedId,
        source,
    });
}

async function getHomeworkTargetStudents(
    homework: HomeworkAssignment
): Promise<WritingImportStudentOption[]> {
    const studentsById = new Map<string, WritingImportStudentOption>();

    if (homework.target.type === 'students' || homework.target.type === 'group') {
        homework.target.studentIds.forEach((studentId, index) => {
            addUniqueStudent(
                studentsById,
                studentId,
                homework.target.type === 'students'
                    ? homework.target.studentNames?.[index]
                    : undefined,
                'homework-target'
            );
        });
    }

    if (homework.target.type === 'class') {
        const classData = await getClass(homework.target.classId);
        Object.entries(classData?.students ?? {}).forEach(([fallbackId, student]) => {
            if (student.status && student.status !== 'active') {
                return;
            }

            addUniqueStudent(
                studentsById,
                student.uid || student.id || fallbackId,
                student.name || student.email,
                'homework-target'
            );
        });
    }

    if (homework.target.type === 'course') {
        const enrollments = await getEnrollmentsByCourse(homework.target.courseId);
        for (const enrollment of enrollments) {
            if (enrollment.status !== 'active') {
                continue;
            }

            const user = await getUserById(enrollment.studentId);
            addUniqueStudent(
                studentsById,
                enrollment.studentId,
                user?.displayName || user?.email,
                'homework-target'
            );
        }
    }

    const existingSubmissions = await getHomeworkSubmissions(homework.id);
    existingSubmissions.forEach((submission) => {
        addUniqueStudent(
            studentsById,
            submission.studentId,
            submission.studentName,
            'existing-submission'
        );
    });

    return [...studentsById.values()].sort((left, right) =>
        left.studentName.localeCompare(right.studentName, 'vi', { sensitivity: 'base' })
    );
}

async function validateHomeworkForImport(
    homeworkId: string,
    importerTeacherId: string
): Promise<ServiceResult<HomeworkAssignment>> {
    const homework = await getHomeworkById(homeworkId);
    if (!homework) {
        return failure('validation', 'Homework not found');
    }

    if (homework.createdBy !== importerTeacherId) {
        return failure('ownership', 'Homework does not belong to this teacher');
    }

    if (homework.materialSkill !== 'writing') {
        return failure('not-writing', 'Only Writing homework can be imported here');
    }

    return { success: true, data: homework };
}

async function loadWritingMaterial(materialId: string): Promise<ServiceResult<IELTSWritingTest>> {
    const snapshot = await get(ref(database, `tests/${materialId}`));
    if (!snapshot.exists()) {
        return failure('material-not-found', 'Writing material not found');
    }

    const value = snapshot.val();
    if (!isWritingMaterial(value)) {
        return failure('not-writing', 'Homework material is not an IELTS Writing test');
    }

    return { success: true, data: value };
}

function buildSubmissionTasks(
    material: IELTSWritingTest,
    responses: WritingImportTaskResponse[]
): ServiceResult<WritingSubmissionTask[]> {
    const activeTasks = getActiveWritingTasks(material);
    const responseByTask = new Map<1 | 2, WritingImportTaskResponse>();
    responses.forEach((response) => responseByTask.set(response.taskNumber, response));

    const submissionTasks: WritingSubmissionTask[] = [];
    for (const task of activeTasks) {
        const response = responseByTask.get(task.taskNumber);
        const essayText = normalizeText(response?.essayText);
        if (!essayText) {
            return failure('validation', `Task ${task.taskNumber} response is required`);
        }

        submissionTasks.push({
            taskNumber: task.taskNumber,
            taskType: task.taskType,
            promptText: task.promptText,
            ...(task.promptImageUrl ? { promptImageUrl: task.promptImageUrl } : {}),
            wordMinimum: task.wordMinimum,
            essayText,
            wordCount: countWords(essayText),
            activeTimeSeconds: Math.max(0, Math.round(response?.activeTimeSeconds ?? 0)),
        });
    }

    if (submissionTasks.length === 0) {
        return failure('validation', 'At least one task response is required');
    }

    return { success: true, data: submissionTasks };
}

export async function listWritingImportHomeworkOptions(
    importerTeacherId: string
): Promise<ServiceResult<WritingImportHomeworkOption[]>> {
    try {
        const homework = await getHomeworkByTeacher(importerTeacherId);
        return {
            success: true,
            data: homework
                .filter((item) => item.materialSkill === 'writing' && item.archived !== true)
                .map((item) => ({
                    homeworkId: item.id,
                    title: item.title || item.materialTitle,
                    materialId: item.materialId,
                    materialTitle: item.materialTitle,
                    dueDate: item.scheduling.dueDate,
                    status: item.status,
                })),
        };
    } catch (error) {
        return failure(
            'unknown',
            error instanceof Error ? error.message : 'Failed to load Writing homework'
        );
    }
}

export async function getWritingImportContext(
    homeworkId: string,
    importerTeacherId: string
): Promise<ServiceResult<WritingImportContext>> {
    try {
        const homeworkResult = await validateHomeworkForImport(homeworkId, importerTeacherId);
        if (!homeworkResult.success || !homeworkResult.data) {
            return homeworkResult as ServiceResult<WritingImportContext>;
        }

        const materialResult = await loadWritingMaterial(homeworkResult.data.materialId);
        if (!materialResult.success || !materialResult.data) {
            return materialResult as ServiceResult<WritingImportContext>;
        }

        return {
            success: true,
            data: {
                homework: homeworkResult.data,
                material: materialResult.data,
                students: await getHomeworkTargetStudents(homeworkResult.data),
            },
        };
    } catch (error) {
        return failure(
            'unknown',
            error instanceof Error ? error.message : 'Failed to load import context'
        );
    }
}

export const importExternalWritingSubmission = withRestoreGuard<
    ServiceResult<WritingExternalSubmissionImportResult>
>(
    'WritingExternalSubmissionImport',
    { success: false, code: 'unknown', error: 'Blocked by restore guard' }
)(async (
    input: WritingExternalSubmissionImportInput
): Promise<ServiceResult<WritingExternalSubmissionImportResult>> => {
    try {
        const submittedAt = Number(input.submittedAt);
        if (!Number.isFinite(submittedAt) || submittedAt <= 0 || submittedAt > Date.now() + 60_000) {
            return failure('validation', 'Submitted time is required and cannot be in the future');
        }

        const homeworkResult = await validateHomeworkForImport(input.homeworkId, input.importerTeacherId);
        if (!homeworkResult.success || !homeworkResult.data) {
            return homeworkResult as ServiceResult<WritingExternalSubmissionImportResult>;
        }
        const homework = homeworkResult.data;

        const materialResult = await loadWritingMaterial(homework.materialId);
        if (!materialResult.success || !materialResult.data) {
            return materialResult as ServiceResult<WritingExternalSubmissionImportResult>;
        }
        const material = materialResult.data;

        const students = await getHomeworkTargetStudents(homework);
        const selectedStudent = students.find((student) => student.studentId === input.studentId);
        if (!selectedStudent) {
            return failure('unassigned-student', 'Student is not assigned to this homework');
        }

        const taskResult = buildSubmissionTasks(material, input.taskResponses);
        if (!taskResult.success || !taskResult.data) {
            return taskResult as ServiceResult<WritingExternalSubmissionImportResult>;
        }

        const previousAttempts = await getStudentSubmissionsForHomework(homework.id, input.studentId);
        const latestAttempt = previousAttempts[previousAttempts.length - 1] ?? null;
        if (latestAttempt?.status === 'submitted' || latestAttempt?.status === 'graded') {
            return failure('duplicate', 'This student already has submitted or graded work for this homework');
        }
        if (latestAttempt?.status === 'in_progress' && input.confirmInProgressOverwrite !== true) {
            return failure(
                'in-progress',
                'This student has an in-progress attempt. Confirm before replacing it with imported work'
            );
        }

        const generatedId = push(ref(database)).key;
        if (!generatedId) {
            return failure('unknown', 'Failed to generate submission ID');
        }

        const submissionId = latestAttempt?.status === 'in_progress' ? latestAttempt.id : generatedId;
        const existingWritingSubmission = await getSubmission(submissionId);
        if (existingWritingSubmission.success) {
            return failure('duplicate', 'A writing submission already exists for this homework attempt');
        }

        const completedAttempts = previousAttempts.filter(
            (submission: HomeworkSubmission) => submission.status === 'submitted' || submission.status === 'graded'
        );
        const attemptNumber = latestAttempt?.attemptNumber ?? completedAttempts.length + 1;
        const isLate = submittedAt > getEffectiveHomeworkDueDate(homework, input.studentId);
        const importedAt = Date.now();
        const totalElapsedTimeSeconds = taskResult.data.reduce(
            (sum, task) => sum + (task.activeTimeSeconds || 0),
            0
        );
        const importMetadata = {
            source: 'external-admin-import' as const,
            importedByTeacherId: input.importerTeacherId,
            importedAt,
            ...(input.sourceNote?.trim() ? { sourceNote: input.sourceNote.trim() } : {}),
        };

        const writingSubmission: WritingSubmission = {
            id: submissionId,
            studentId: input.studentId,
            studentName: normalizeText(input.studentName) || selectedStudent.studentName,
            context: {
                type: 'homework',
                homeworkId: homework.id,
                homeworkSubmissionId: submissionId,
                assigningTeacherId: homework.createdBy,
                isLate,
                attemptNumber,
                ...(homework.target.type === 'class' ? {
                    classId: homework.target.classId,
                    className: homework.target.className,
                } : {}),
                ...(homework.target.type === 'course' ? {
                    courseId: homework.target.courseId,
                    courseName: homework.target.courseName,
                } : {}),
                externalImport: importMetadata,
            },
            testMeta: {
                testId: material.id || homework.materialId,
                testTitle: material.metadata.title || homework.materialTitle,
                format: material.metadata.format,
                duration: material.metadata.duration,
            },
            tasks: taskResult.data,
            submittedAt,
            totalElapsedTimeSeconds,
            pasteAttemptCount: 0,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        };

        const createResult = await createSubmission(writingSubmission);
        if (!createResult.success) {
            return failure('unknown', createResult.error || 'Failed to create writing submission');
        }

        const homeworkSubmission = await submitImportedHomeworkSubmission({
            submissionId,
            homeworkId: homework.id,
            studentId: input.studentId,
            studentName: writingSubmission.studentName,
            resultId: submissionId,
            submittedAt,
            timeSpent: totalElapsedTimeSeconds,
            isLate,
            importedByTeacherId: input.importerTeacherId,
            importedAt,
            sourceNote: input.sourceNote,
            confirmInProgressOverwrite: input.confirmInProgressOverwrite,
        });

        const materializeResult = await materializeSubmissionResult(writingSubmission);
        if (!materializeResult.success) {
            return failure('projection', materializeResult.error || 'Failed to materialize writing result');
        }

        return {
            success: true,
            data: {
                submissionId,
                homeworkSubmissionId: homeworkSubmission.id,
                resultId: submissionId,
                isLate,
                attemptNumber,
            },
        };
    } catch (error) {
        return failure(
            'unknown',
            error instanceof Error ? error.message : 'Failed to import external Writing submission'
        );
    }
});
