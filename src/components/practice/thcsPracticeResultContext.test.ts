import { describe, expect, it } from 'vitest';
import { buildThcsPracticePersistenceContext } from './thcsPracticeResultContext';

describe('buildThcsPracticePersistenceContext', () => {
    it('builds canonical self-study context from material id and title', () => {
        const result = buildThcsPracticePersistenceContext({
            materialId: 'material-1',
            practiceContext: {
                type: 'self_study',
            },
            title: 'Library Test',
            duration: 45,
        });

        expect(result.academicContext).toBeUndefined();
        expect(result.resultContext).toEqual(
            expect.objectContaining({
                type: 'self_study',
                source: expect.objectContaining({
                    type: 'library',
                    id: 'material-1',
                    name: 'Library Test',
                }),
            }),
        );
    });

    it('builds canonical course-material context from course metadata', () => {
        const result = buildThcsPracticePersistenceContext({
            materialId: 'material-1',
            practiceContext: {
                type: 'course_material',
                courseId: 'course-1',
                moduleId: 'module-1',
                courseName: 'Course One',
            },
            title: 'Course Test',
            duration: 60,
        });

        expect(result.academicContext).toEqual({
            courseId: 'course-1',
            moduleId: 'module-1',
        });
        expect(result.resultContext).toEqual(
            expect.objectContaining({
                type: 'course_material',
                courseId: 'course-1',
                source: expect.objectContaining({
                    type: 'course',
                    id: 'course-1',
                    name: 'Course One',
                    courseId: 'course-1',
                }),
            }),
        );
    });

    it('builds canonical homework context from homework identifiers', () => {
        const result = buildThcsPracticePersistenceContext({
            materialId: 'material-1',
            practiceContext: {
                type: 'homework',
                homeworkId: 'hw-1',
                submissionId: 'submission-1',
            },
            title: 'Homework Test',
            duration: 30,
        });

        expect(result.academicContext).toBeUndefined();
        expect(result.resultContext).toEqual(
            expect.objectContaining({
                type: 'homework',
                assignment: expect.objectContaining({
                    homeworkId: 'hw-1',
                    attemptNumber: 1,
                }),
                source: expect.objectContaining({
                    type: 'homework',
                    id: 'hw-1',
                    name: 'Homework Test',
                    submissionId: 'submission-1',
                }),
            }),
        );
    });
});
