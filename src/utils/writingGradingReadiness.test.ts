import { describe, expect, it } from 'vitest';
import {
    evaluateWritingSubmissionReadiness,
    evaluateWritingTaskReadiness,
    isMeaningfulHtml,
} from './writingGradingReadiness';

describe('writingGradingReadiness', () => {
    it('treats whitespace-only rich text as not meaningful', () => {
        expect(isMeaningfulHtml('<p>&nbsp;</p>')).toBe(false);
        expect(isMeaningfulHtml('<p>Real summary</p>')).toBe(true);
    });

    it('blocks a task when a pending comment draft is still open', () => {
        const readiness = evaluateWritingTaskReadiness({
            taskNumber: 1,
            isVoided: false,
            responseScore: 6,
            ccScore: 6,
            lrScore: 6,
            graScore: 6,
            summaryHtml: '<p>Task summary</p>',
            hasPendingCommentDraft: true,
        });

        expect(readiness.publishReady).toBe(false);
        expect(readiness.commentDraftClear).toBe(false);
        expect(readiness.blockingReasons).toContain('Finish or cancel the open comment composer before publishing.');
    });

    it('tracks submission readiness separately from the currently healthy task', () => {
        const readiness = evaluateWritingSubmissionReadiness([
            {
                taskNumber: 1,
                isVoided: false,
                responseScore: 6,
                ccScore: 6,
                lrScore: 6,
                graScore: 6,
                summaryHtml: '<p>Ready summary</p>',
                hasPendingCommentDraft: false,
            },
            {
                taskNumber: 2,
                isVoided: false,
                responseScore: 7,
                ccScore: 7,
                lrScore: 7,
                graScore: 7,
                summaryHtml: '<p>&nbsp;</p>',
                hasPendingCommentDraft: false,
            },
        ]);

        expect(readiness.tasks[1]?.publishReady).toBe(true);
        expect(readiness.tasks[2]?.publishReady).toBe(false);
        expect(readiness.readyTaskCount).toBe(1);
        expect(readiness.canPublish).toBe(false);
        expect(readiness.firstBlockingReason).toBe('Task 2 summary is required before publishing.');
    });
});
