export interface WritingReadinessTaskInput {
    taskNumber: 1 | 2;
    isVoided: boolean;
    responseScore: number | null | undefined;
    ccScore: number | null | undefined;
    lrScore: number | null | undefined;
    graScore: number | null | undefined;
    summaryHtml: string;
    hasPendingCommentDraft?: boolean;
}

export interface WritingTaskReadinessResult {
    taskNumber: 1 | 2;
    isVoided: boolean;
    scoresReady: boolean;
    summaryReady: boolean;
    commentDraftClear: boolean;
    publishReady: boolean;
    blockingReasons: string[];
}

export interface WritingSubmissionReadinessResult {
    tasks: Record<1 | 2, WritingTaskReadinessResult>;
    activeTaskCount: number;
    readyTaskCount: number;
    hasAnyPendingCommentDraft: boolean;
    canPublish: boolean;
    blockingReasons: string[];
    firstBlockingReason: string | null;
}

export function isMeaningfulHtml(content?: string | null): boolean {
    return typeof content === 'string'
        && content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim().length > 0;
}

export function evaluateWritingTaskReadiness(
    task: WritingReadinessTaskInput,
): WritingTaskReadinessResult {
    const commentDraftClear = !task.hasPendingCommentDraft;

    if (task.isVoided) {
        const blockingReasons = commentDraftClear
            ? []
            : ['Finish or cancel the open comment composer before publishing.'];

        return {
            taskNumber: task.taskNumber,
            isVoided: true,
            scoresReady: true,
            summaryReady: true,
            commentDraftClear,
            publishReady: blockingReasons.length === 0,
            blockingReasons,
        };
    }

    const scoresReady = (
        typeof task.responseScore === 'number'
        && typeof task.ccScore === 'number'
        && typeof task.lrScore === 'number'
        && typeof task.graScore === 'number'
    );
    const summaryReady = isMeaningfulHtml(task.summaryHtml);
    const blockingReasons: string[] = [];

    if (!scoresReady) {
        blockingReasons.push(`Task ${task.taskNumber} must include all non-voided criterion scores before publishing.`);
    }

    if (!summaryReady) {
        blockingReasons.push(`Task ${task.taskNumber} summary is required before publishing.`);
    }

    if (!commentDraftClear) {
        blockingReasons.push('Finish or cancel the open comment composer before publishing.');
    }

    return {
        taskNumber: task.taskNumber,
        isVoided: false,
        scoresReady,
        summaryReady,
        commentDraftClear,
        publishReady: blockingReasons.length === 0,
        blockingReasons,
    };
}

export function evaluateWritingSubmissionReadiness(
    tasks: WritingReadinessTaskInput[],
): WritingSubmissionReadinessResult {
    const taskResults = tasks.reduce((acc, task) => {
        acc[task.taskNumber] = evaluateWritingTaskReadiness(task);
        return acc;
    }, {} as Record<1 | 2, WritingTaskReadinessResult>);

    const orderedResults = tasks
        .map((task) => taskResults[task.taskNumber])
        .filter(Boolean)
        .sort((left, right) => left.taskNumber - right.taskNumber);
    const activeResults = orderedResults.filter((task) => !task.isVoided);
    const hasAnyPendingCommentDraft = orderedResults.some((task) => !task.commentDraftClear);
    const blockingReasons = Array.from(new Set(orderedResults.flatMap((task) => task.blockingReasons)));

    return {
        tasks: taskResults,
        activeTaskCount: activeResults.length,
        readyTaskCount: activeResults.filter((task) => task.publishReady).length,
        hasAnyPendingCommentDraft,
        canPublish: activeResults.every((task) => task.publishReady) && !hasAnyPendingCommentDraft,
        blockingReasons,
        firstBlockingReason: blockingReasons[0] ?? null,
    };
}
