import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WritingSubmission } from '../../types/ielts-writing.types';
import type { WritingResultSurfaceData } from './writingResultSurface';
import WritingTeacherResultSurface from './WritingTeacherResultSurface';

vi.mock('./WritingPublishedMarkupViewer', () => ({
    __esModule: true,
    default: ({
        comments,
        corrections,
        onFeedbackSelect,
    }: {
        comments: Array<{ id: string }>;
        corrections: Array<{ id: string }>;
        onFeedbackSelect?: (feedbackId: string, anchorViewportTop: number | null) => void;
    }) => (
        <>
            <div data-testid="viewer-props">{`comments:${comments.length};corrections:${corrections.length}`}</div>
            <button type="button" onClick={() => onFeedbackSelect?.('correction-1', 210)}>
                Focus published correction
            </button>
        </>
    ),
}));

vi.mock('../writing-grading/GradingAuditTrail', () => ({
    __esModule: true,
    default: () => null,
}));

describe('WritingTeacherResultSurface', () => {
    beforeEach(() => {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() {
                if (this?.getAttribute?.('data-feedback-header-id') === 'correction-1') {
                    return 20;
                }
                return 80;
            },
        });
        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value() {
                if (this?.getAttribute?.('data-feedback-viewport') === 'true') {
                    return {
                        x: 0,
                        y: 100,
                        width: 480,
                        height: 400,
                        top: 100,
                        left: 0,
                        right: 480,
                        bottom: 500,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-feedback-stack') === 'true') {
                    return {
                        x: 0,
                        y: 140,
                        width: 480,
                        height: 320,
                        top: 140,
                        left: 0,
                        right: 480,
                        bottom: 460,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-feedback-header-id') === 'correction-1') {
                    return {
                        x: 0,
                        y: 300,
                        width: 420,
                        height: 20,
                        top: 300,
                        left: 24,
                        right: 444,
                        bottom: 320,
                        toJSON() {
                            return this;
                        },
                    };
                }

                return {
                    x: 0,
                    y: 0,
                    width: 480,
                    height: 320,
                    top: 0,
                    left: 0,
                    right: 480,
                    bottom: 320,
                    toJSON() {
                        return this;
                    },
                };
            },
        });
    });

    it('passes corrections into the published viewer and exposes them in the teacher feedback rail', async () => {
        const data: WritingResultSurfaceData = {
            submissionId: 'submission-1',
            phase: 'published',
            viewerMode: 'teacher-read-only',
            testTitle: 'IELTS Writing',
            formatLabel: 'IELTS Academic',
            contextLabel: 'Saved Result',
            studentName: 'Student One',
            studentId: 'student-1',
            submittedAt: Date.UTC(2026, 2, 30),
            totalElapsedTimeSeconds: 2400,
            totalWordCount: 190,
            teacherName: 'Teacher One',
            teacherId: 'teacher-1',
            gradedAt: Date.UTC(2026, 2, 30),
            updatedAt: Date.UTC(2026, 2, 30),
            overallBand: 6.5,
            overallSummary: '<p>Overall summary</p>',
            auditVersion: 2,
            activeTaskCount: 1,
            hasPublishedMarkup: true,
            hasAnyFeedback: true,
            usesLegacyProjection: false,
            draftOwnerTeacherId: null,
            bandSummaryItems: [
                { key: 'overall', label: 'Overall', band: 6.5, tone: 'overall' },
            ],
            tasks: [{
                taskNumber: 1,
                taskType: 'report',
                promptText: 'Summarize the chart.',
                wordMinimum: 150,
                essayText: 'Essay text',
                wordCount: 190,
                activeTimeSeconds: 900,
                isVoided: false,
                taskBand: 6,
                criteriaScores: { TA: 6, CC: 6, LR: 6, GRA: 6 },
                taskSummary: '<p>Task summary</p>',
                criteriaFeedback: { TA: '<p>TA feedback</p>' },
                markedContent: { type: 'doc', content: [] },
                comments: [{
                    kind: 'comment',
                    id: 'comment-1',
                    text: '<p>First comment</p>',
                    color: '#4f46e5',
                    anchorText: 'first phrase',
                    from: 1,
                    to: 5,
                    status: 'active',
                    categoryLabel: 'Task Response',
                }],
                corrections: [{
                    kind: 'correction',
                    id: 'correction-1',
                    anchorText: 'wrong phrase',
                    correctionText: 'improved phrase',
                    from: 11,
                    to: 22,
                    label: 'Correction',
                }],
                fallbackAnnotations: [],
                usesLegacyProjection: false,
            }],
        };

        render(
            <WritingTeacherResultSurface
                data={data}
                submission={{
                    studentName: 'Student One',
                    auditTrail: [],
                } as WritingSubmission}
            />,
        );

        expect(screen.getByTestId('viewer-props')).toHaveTextContent('comments:1;corrections:1');
        expect(screen.getByText('Comments')).toBeInTheDocument();
        expect(screen.getByText('Corrections')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Focus published correction' }));

        const correctionCard = await screen.findByText('improved phrase');
        expect(correctionCard.closest('article')).toHaveAttribute('data-highlighted', 'true');

        await waitFor(() => {
            expect(correctionCard.closest('[data-feedback-stack="true"]')).toHaveStyle({
                transform: 'translateY(-50px)',
            });
        });
    });
});
