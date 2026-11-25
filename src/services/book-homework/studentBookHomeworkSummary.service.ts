import { get, ref } from 'firebase/database';
import { database } from '../firebase';
import {
    normalizeStudentBookHomeworkSummaryMap,
    type StudentBookHomeworkSummaryRecord,
} from './studentBookHomeworkSummary.types';

const VALID_STUDENT_SUMMARY_ID = /^[A-Za-z0-9][A-Za-z0-9_:@-]{0,159}$/u;

/**
 * Performs ONE bounded RTDB read (`student_book_homework_summaries/{studentId}`)
 * for student list and Academic Record summary surfaces.
 * Never mutates or repairs persistent state on read (Student Data-Loading Rule §5).
 */
export async function getStudentBookHomeworkSummaries(
    studentId: string,
): Promise<ReadonlyMap<string, StudentBookHomeworkSummaryRecord>> {
    const normalizedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
    if (!VALID_STUDENT_SUMMARY_ID.test(normalizedStudentId)) {
        return new Map();
    }

    try {
        const snapshot = await get(
            ref(database, `student_book_homework_summaries/${normalizedStudentId}`),
        );
        if (!snapshot.exists()) {
            return new Map();
        }
        const parsed = normalizeStudentBookHomeworkSummaryMap(snapshot.val());
        const verified = new Map<string, StudentBookHomeworkSummaryRecord>();
        for (const [homeworkId, record] of parsed.entries()) {
            if (record.studentId === normalizedStudentId) {
                verified.set(homeworkId, record);
            }
        }
        return verified;
    } catch {
        return new Map();
    }
}
