import type { ResultContext } from '../../types/solo.types';
import type { PracticeContext } from './IELTSPracticeView';

export interface ThcsPracticePersistenceContext {
    academicContext?: {
        courseId: string;
        moduleId: string;
    };
    resultContext: ResultContext;
}

interface BuildThcsPracticePersistenceContextArgs {
    materialId: string;
    practiceContext: PracticeContext;
    title: string;
    duration: number;
}

export function buildThcsPracticePersistenceContext({
    materialId,
    practiceContext,
    title,
    duration,
}: BuildThcsPracticePersistenceContextArgs): ThcsPracticePersistenceContext {
    if (practiceContext.type === 'homework') {
        return {
            resultContext: {
                type: 'homework',
                source: {
                    type: 'homework',
                    id: practiceContext.homeworkId || materialId,
                    name: title,
                    submissionId: practiceContext.submissionId,
                },
                assignment: practiceContext.homeworkId
                    ? {
                        homeworkId: practiceContext.homeworkId,
                        attemptNumber: 1,
                    }
                    : undefined,
                configApplied: {
                    timerMinutes: duration,
                    feedbackTiming: 'after_completion',
                    source: 'material_default',
                },
            },
        };
    }

    if (practiceContext.courseId && practiceContext.moduleId) {
        return {
            academicContext: {
                courseId: practiceContext.courseId,
                moduleId: practiceContext.moduleId,
            },
            resultContext: {
                type: 'course_material',
                source: {
                    type: 'course',
                    id: practiceContext.courseId,
                    name: practiceContext.courseName || title,
                    courseId: practiceContext.courseId,
                },
                courseId: practiceContext.courseId,
                configApplied: {
                    timerMinutes: duration,
                    feedbackTiming: 'after_completion',
                    source: 'material_default',
                },
            },
        };
    }

    return {
        resultContext: {
            type: 'self_study',
            source: {
                type: 'library',
                id: materialId,
                name: title,
            },
            configApplied: {
                timerMinutes: duration,
                feedbackTiming: 'after_completion',
                source: 'material_default',
            },
        },
    };
}
