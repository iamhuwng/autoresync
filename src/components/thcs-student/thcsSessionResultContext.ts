import type { ResultContext } from '../../types/solo.types';

interface BuildThcsSessionResultContextArgs {
    sessionCode: string;
    title: string;
    duration: number;
    classId?: string;
    courseId?: string;
}

export function buildThcsSessionResultContext({
    sessionCode,
    title,
    duration,
    classId,
    courseId,
}: BuildThcsSessionResultContextArgs): ResultContext {
    return {
        type: 'class_session',
        source: {
            type: 'class',
            id: sessionCode,
            name: title,
            sessionCode,
            classId,
            courseId,
        },
        sessionCode,
        classId,
        courseId,
        configApplied: {
            timerMinutes: duration,
            feedbackTiming: 'after_completion',
            source: 'material_default',
        },
    };
}
