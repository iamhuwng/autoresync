// File: src/services/courseProgressService.ts
import { database } from './firebase';
import { ref, set } from 'firebase/database';

/**
 * Update a student's progress for a specific material within a course.
 * Writes to: course_progress/{studentId}/{courseId}/materials/{materialId}
 */
export async function updateStudentCourseProgress(
    courseId: string,
    studentId: string,
    materialId: string,
    data: { completed: boolean; score: number; resultId: string }
): Promise<void> {
    const path = `course_progress/${studentId}/${courseId}/materials/${materialId}`;
    await set(ref(database, path), {
        ...data,
        completedAt: Date.now(),
    });
}
