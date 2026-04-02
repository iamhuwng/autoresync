import { describe, expect, it } from 'vitest';
import {
    buildWritingResultSurfaceData,
    buildWritingSubmissionFallbackFromResult,
} from './writingResultSurface';

describe('writingResultSurface', () => {
    it('builds a task2-only fallback submission when the saved result only has Task 2', () => {
        const submission = buildWritingSubmissionFallbackFromResult({
            resultId: 'result-1',
            testSkill: 'writing',
            submittedAt: 100,
            createdAt: 100,
            writingData: {
                tasks: [
                    {
                        taskNumber: 2,
                        promptText: 'Discuss both views.',
                        wordCount: 280,
                        activeTimeSeconds: 2400,
                    },
                ],
            },
            writingSubmission: {
                text: 'Task 2\nThis is the essay.',
                wordCount: 280,
            },
        } as any);

        expect(submission?.testMeta.format).toBe('task2-only');
        expect(submission?.tasks).toHaveLength(1);
        expect(submission?.tasks[0].taskNumber).toBe(2);
    });

    it('prefers explicit teacher metadata over the legacy compatibility label', () => {
        const submission = buildWritingSubmissionFallbackFromResult({
            resultId: 'result-2',
            testSkill: 'writing',
            markingStatus: 'graded',
            submittedAt: 100,
            createdAt: 100,
            overallFeedback: 'Published feedback',
            feedbackUpdatedAt: 200,
            feedbackUpdatedBy: 'Legacy Label',
            feedbackUpdatedByTeacherId: 'teacher-123',
            feedbackUpdatedByTeacherName: 'Ms. Explicit',
            bandScore: 7,
            writingData: {
                overallBand: 7,
                tasks: [
                    {
                        taskNumber: 2,
                        promptText: 'Discuss both views.',
                        wordCount: 280,
                        activeTimeSeconds: 2400,
                    },
                ],
            },
            writingSubmission: {
                text: 'Task 2\nThis is the essay.',
                wordCount: 280,
            },
        } as any);

        const surface = buildWritingResultSurfaceData(submission!, {
            viewerMode: 'teacher-read-only',
        });

        expect(surface.teacherId).toBe('teacher-123');
        expect(surface.teacherName).toBe('Ms. Explicit');
        expect(surface.phase).toBe('published');
    });
});
