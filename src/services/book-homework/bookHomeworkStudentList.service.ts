import type { ClassSummary } from '../../types/class.types';
import type { HomeworkAssignment } from '../../types/homework.types';
import { getHomeworkForStudent } from '../homeworkManager';
import {
    buildStudentHomeworkListRecords,
    getStudentSubmissions,
    type StudentHomeworkListRecord,
} from '../homeworkSubmissionService';
import { isBookHomeworkCompatibilityProjection } from './bookHomeworkCompatibilityProjection.service';
import { getStudentBookHomeworkSummaries } from './studentBookHomeworkSummary.service';
import type { StudentBookHomeworkSummaryRecord } from './studentBookHomeworkSummary.types';

export interface GetBookCompatibleStudentHomeworkListOptions {
    studentClasses?: readonly Pick<ClassSummary, 'id'>[];
    fetchBookSummaries?: (
        studentId: string,
    ) => Promise<ReadonlyMap<string, StudentBookHomeworkSummaryRecord>>;
}

export const buildBookHomeworkListRecord = (
    homework: HomeworkAssignment,
    now: number = Date.now(),
    summary: StudentBookHomeworkSummaryRecord | null = null,
): StudentHomeworkListRecord => {
    const effectiveDueDate = homework.scheduling.dueDate;
    const isComplete = summary?.isComplete === true || summary?.status === 'completed';
    const isOverdue = !isComplete
        && typeof effectiveDueDate === 'number'
        && Number.isFinite(effectiveDueDate)
        && effectiveDueDate < now;
    const submittedCount = summary?.submittedCount ?? 0;

    return {
        homework,
        submission: null,
        attemptsUsed: submittedCount,
        attemptsRemaining: null,
        attemptsNullified: false,
        isOverdue,
        canSubmit: false,
        canViewFeedback: submittedCount > 0,
        effectiveDueDate,
        reminderCount: 0,
        isExempted: false,
        bookProgressSummary: summary ?? null,
    };
};

export async function getBookCompatibleStudentHomeworkList(
    studentId: string,
    options: GetBookCompatibleStudentHomeworkListOptions = {},
): Promise<StudentHomeworkListRecord[]> {
    const homeworks = await getHomeworkForStudent(studentId, {
        studentClasses: options.studentClasses,
    });
    const fetchBookSummaries = options.fetchBookSummaries ?? getStudentBookHomeworkSummaries;
    const hasBookHomeworks = homeworks.some((homework) =>
        isBookHomeworkCompatibilityProjection(homework),
    );
    const legacyHomeworks = homeworks.filter(
        (homework) => !isBookHomeworkCompatibilityProjection(homework),
    );

    const [allSubmissions, bookSummaries] = await Promise.all([
        legacyHomeworks.length === 0
            ? Promise.resolve([])
            : getStudentSubmissions(studentId),
        hasBookHomeworks
            ? fetchBookSummaries(studentId).catch(
                () => new Map<string, StudentBookHomeworkSummaryRecord>(),
            )
            : Promise.resolve(new Map<string, StudentBookHomeworkSummaryRecord>()),
    ]);

    const legacyRecords = legacyHomeworks.length === 0
        ? []
        : buildStudentHomeworkListRecords(
            legacyHomeworks,
            allSubmissions,
            studentId,
        );
    const legacyRecordsById = new Map(
        legacyRecords.map((record) => [record.homework.id, record]),
    );
    const now = Date.now();

    return homeworks.map((homework) => {
        const homeworkCandidate: unknown = homework;
        return isBookHomeworkCompatibilityProjection(homeworkCandidate)
            ? buildBookHomeworkListRecord(
                homework,
                now,
                bookSummaries.get(homeworkCandidate.id) ?? null,
            )
            : legacyRecordsById.get(homework.id)!;
    });
}
