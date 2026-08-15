import type { ClassSummary } from '../../types/class.types';
import type { HomeworkAssignment } from '../../types/homework.types';
import { getHomeworkForStudent } from '../homeworkManager';
import {
    buildStudentHomeworkListRecords,
    getStudentSubmissions,
    type StudentHomeworkListRecord,
} from '../homeworkSubmissionService';
import { isBookHomeworkCompatibilityProjection } from './bookHomeworkCompatibilityProjection.service';

export interface GetBookCompatibleStudentHomeworkListOptions {
    studentClasses?: readonly Pick<ClassSummary, 'id'>[];
}

const buildBookHomeworkListRecord = (
    homework: HomeworkAssignment,
): StudentHomeworkListRecord => ({
    homework,
    submission: null,
    attemptsUsed: 0,
    attemptsRemaining: null,
    attemptsNullified: false,
    isOverdue: false,
    canSubmit: false,
    canViewFeedback: false,
    effectiveDueDate: homework.scheduling.dueDate,
    reminderCount: 0,
    isExempted: false,
});

export async function getBookCompatibleStudentHomeworkList(
    studentId: string,
    options: GetBookCompatibleStudentHomeworkListOptions = {},
): Promise<StudentHomeworkListRecord[]> {
    const homeworks = await getHomeworkForStudent(studentId, {
        studentClasses: options.studentClasses,
    });
    const legacyHomeworks = homeworks.filter(
        (homework) => !isBookHomeworkCompatibilityProjection(homework),
    );
    const legacyRecords = legacyHomeworks.length === 0
        ? []
        : buildStudentHomeworkListRecords(
            legacyHomeworks,
            await getStudentSubmissions(studentId),
            studentId,
        );
    const legacyRecordsById = new Map(
        legacyRecords.map((record) => [record.homework.id, record]),
    );

    return homeworks.map((homework) => (
        isBookHomeworkCompatibilityProjection(homework)
            ? buildBookHomeworkListRecord(homework)
            : legacyRecordsById.get(homework.id)!
    ));
}
