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

    it('derives published corrections from marked content for the student result surface', () => {
        const submission = {
            id: 'submission-1',
            studentId: 'student-1',
            studentName: 'Student One',
            context: { type: 'solo-practice' },
            testMeta: {
                testId: 'test-1',
                testTitle: 'IELTS Writing',
                format: 'task1-only',
                duration: 20,
            },
            tasks: [
                {
                    taskNumber: 1,
                    taskType: 'bar-chart',
                    promptText: 'Summarize the chart.',
                    wordMinimum: 150,
                    essayText: 'wrong phrase in essay',
                    wordCount: 180,
                    activeTimeSeconds: 900,
                },
            ],
            submittedAt: 100,
            totalElapsedTimeSeconds: 900,
            pasteAttemptCount: 0,
            markingStatus: 'graded',
            publishedGrading: {
                teacherId: 'teacher-1',
                teacherName: 'Teacher One',
                gradedAt: 200,
                updatedAt: 210,
                overallBand: 6.5,
                overallSummary: '<p>Overall summary</p>',
                auditVersion: 1,
                perTask: {
                    1: {
                        taskNumber: 1,
                        markedContent: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        { type: 'text', text: 'wrong phrase', marks: [{ type: 'correctionMark', attrs: { correctionId: 'correction-1', correctionText: 'improved phrase' } }] },
                                        { type: 'text', text: ' in essay' },
                                    ],
                                },
                            ],
                        },
                        comments: [],
                        isVoided: false,
                        criteriaScores: { TA: 6, CC: 6, LR: 6, GRA: 6 },
                        taskBand: 6,
                        taskSummary: '<p>Task summary</p>',
                        perCriteriaFeedback: { TA: '<p>TA</p>', CC: '', LR: '', GRA: '' },
                    },
                },
            },
            gradingDraftMeta: null,
            grading: null,
            annotations: [],
            auditTrail: [],
        } as any;

        const surface = buildWritingResultSurfaceData(submission, {
            viewerMode: 'student',
        });

        expect(surface.phase).toBe('published');
        expect(surface.tasks[0].corrections).toEqual([
            {
                kind: 'correction',
                id: 'correction-1',
                anchorText: 'wrong phrase',
                correctionText: 'improved phrase',
                from: 0,
                to: 12,
                label: 'Correction',
            },
        ]);
    });

    it('prefers canonical persisted corrections over markup extraction when available', () => {
        const submission = {
            id: 'submission-1',
            studentId: 'student-1',
            studentName: 'Student One',
            context: { type: 'solo-practice' },
            testMeta: {
                testId: 'test-1',
                testTitle: 'IELTS Writing',
                format: 'task1-only',
                duration: 20,
            },
            tasks: [
                {
                    taskNumber: 1,
                    taskType: 'bar-chart',
                    promptText: 'Summarize the chart.',
                    wordMinimum: 150,
                    essayText: 'wrong phrase in essay',
                    wordCount: 180,
                    activeTimeSeconds: 900,
                },
            ],
            submittedAt: 100,
            totalElapsedTimeSeconds: 900,
            pasteAttemptCount: 0,
            markingStatus: 'graded',
            publishedGrading: {
                teacherId: 'teacher-1',
                teacherName: 'Teacher One',
                gradedAt: 200,
                updatedAt: 210,
                overallBand: 6.5,
                overallSummary: '<p>Overall summary</p>',
                auditVersion: 1,
                perTask: {
                    1: {
                        taskNumber: 1,
                        markedContent: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        { type: 'text', text: 'wrong phrase', marks: [{ type: 'correctionMark', attrs: { correctionId: 'markup-correction', correctionText: 'markup fallback' } }] },
                                    ],
                                },
                            ],
                        },
                        comments: [],
                        corrections: [
                            {
                                id: 'canonical-correction',
                                taskNumber: 1,
                                anchorText: 'wrong phrase',
                                correctionText: 'canonical correction',
                                from: 0,
                                to: 12,
                                createdAt: 205,
                                updatedAt: 210,
                            },
                        ],
                        isVoided: false,
                        criteriaScores: { TA: 6, CC: 6, LR: 6, GRA: 6 },
                        taskBand: 6,
                        taskSummary: '<p>Task summary</p>',
                        perCriteriaFeedback: { TA: '<p>TA</p>', CC: '', LR: '', GRA: '' },
                    },
                },
            },
            gradingDraftMeta: null,
            grading: null,
            annotations: [],
            auditTrail: [],
        } as any;

        const surface = buildWritingResultSurfaceData(submission, {
            viewerMode: 'student',
        });

        expect(surface.tasks[0].corrections).toEqual([
            {
                kind: 'correction',
                id: 'canonical-correction',
                anchorText: 'wrong phrase',
                correctionText: 'canonical correction',
                from: 0,
                to: 12,
                label: 'Correction',
            },
        ]);
    });

    it('maps legacy fallback annotations into the shared published feedback shape', () => {
        const submission = {
            id: 'submission-2',
            studentId: 'student-1',
            studentName: 'Student One',
            context: { type: 'solo-practice' },
            testMeta: {
                testId: 'test-1',
                testTitle: 'IELTS Writing',
                format: 'task1-only',
                duration: 20,
            },
            tasks: [
                {
                    taskNumber: 1,
                    taskType: 'bar-chart',
                    promptText: 'Summarize the chart.',
                    wordMinimum: 150,
                    essayText: 'wrong phrase in essay',
                    wordCount: 180,
                    activeTimeSeconds: 900,
                },
            ],
            submittedAt: 100,
            totalElapsedTimeSeconds: 900,
            pasteAttemptCount: 0,
            markingStatus: 'graded',
            publishedGrading: null,
            gradingDraftMeta: null,
            grading: {
                teacherId: 'teacher-1',
                teacherName: 'Teacher One',
                gradedAt: 200,
                overallBand: 6.5,
                perTask: [],
                feedback: {
                    overall: '<p>Overall</p>',
                    perCriteria: { TA: '', CC: '', LR: '', GRA: '' },
                },
            },
            annotations: [
                {
                    id: 'comment-legacy',
                    taskNumber: 1,
                    type: 'comment',
                    startOffset: 0,
                    endOffset: 5,
                    color: '#facc15',
                    categoryId: 'cc',
                    categoryLabel: 'Coherence & Cohesion',
                    commentText: '<p>Legacy comment</p>',
                    createdAt: 100,
                },
                {
                    id: 'correction-legacy',
                    taskNumber: 1,
                    type: 'correction',
                    startOffset: 0,
                    endOffset: 12,
                    color: '#facc15',
                    categoryId: 'gra',
                    categoryLabel: 'Correction',
                    correctionText: 'improved phrase',
                    createdAt: 100,
                },
            ],
            auditTrail: [],
        } as any;

        const surface = buildWritingResultSurfaceData(submission, {
            viewerMode: 'student',
        });

        expect(surface.tasks[0].fallbackAnnotations).toHaveLength(2);
        expect(surface.tasks[0].comments).toEqual([
            {
                kind: 'comment',
                id: 'comment-legacy',
                text: '<p>Legacy comment</p>',
                color: '#facc15',
                anchorText: 'wrong',
                from: 0,
                to: 5,
                status: 'active',
                categoryLabel: 'Coherence & Cohesion',
            },
        ]);
        expect(surface.tasks[0].corrections).toEqual([
            {
                kind: 'correction',
                id: 'correction-legacy',
                anchorText: 'wrong phrase',
                correctionText: 'improved phrase',
                from: 0,
                to: 12,
                label: 'Correction',
            },
        ]);
    });
});
