import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WritingSuggestionsPanel from './WritingSuggestionsPanel';
import type { WritingSuggestionCacheDoc } from '../../types/ielts-writing.types';

function createReadyCache(): WritingSuggestionCacheDoc {
    return {
        submissionId: 'submission-1',
        status: 'ready',
        generatedAt: Date.now(),
        updatedAt: Date.now(),
        generatedFromEssayHashByTask: { 1: 'essay_hash' },
        reviewStateByTask: {
            1: {
                'comment-1': 'pending',
                'correction-1': 'approved',
                'correction-2': 'dismissed',
            },
        },
        perTask: {
            1: {
                taskNumber: 1,
                grammar: {
                    comments: [
                        {
                            id: 'comment-1',
                            reviewKey: 'comment-1',
                            reviewStatus: 'pending',
                            taskNumber: 1,
                            kind: 'comment',
                            focus: 'grammar',
                            issueFamily: 'agreement',
                            confidence: 90,
                            sentenceIndex: 0,
                            anchorText: 'show',
                            from: 4,
                            to: 8,
                            title: 'Verb agreement',
                            reason: 'The singular subject needs the singular verb.',
                            suggestedCommentText: 'Use the singular verb form here.',
                            categoryId: 'gra',
                        },
                    ],
                    corrections: [],
                },
                vocabularyExpression: {
                    comments: [],
                    corrections: [
                        {
                            id: 'correction-1',
                            reviewKey: 'correction-1',
                            reviewStatus: 'approved',
                            taskNumber: 1,
                            kind: 'correction',
                            focus: 'vocabulary-expression',
                            issueFamily: 'word-choice',
                            confidence: 88,
                            sentenceIndex: 1,
                            anchorText: 'increase',
                            from: 18,
                            to: 26,
                            title: 'Verb choice',
                            reason: 'Past reporting typically uses the past tense here.',
                            replacementText: 'increased',
                            categoryId: 'lr',
                        },
                        {
                            id: 'correction-2',
                            reviewKey: 'correction-2',
                            reviewStatus: 'dismissed',
                            taskNumber: 1,
                            kind: 'correction',
                            focus: 'vocabulary-expression',
                            issueFamily: 'word-choice',
                            confidence: 82,
                            sentenceIndex: 2,
                            anchorText: 'goodly',
                            from: 32,
                            to: 38,
                            title: 'Word choice',
                            reason: 'This is not natural written English.',
                            replacementText: 'well',
                            categoryId: 'lr',
                        },
                    ],
                },
            },
        },
    };
}

describe('WritingSuggestionsPanel', () => {
    it('renders summary counts and delegates review actions', () => {
        const onReload = vi.fn();
        const onOpenReview = vi.fn();

        render(
            <WritingSuggestionsPanel
                cache={createReadyCache()}
                taskNumber={1}
                loading={false}
                reloading={false}
                runState={null}
                canApprove
                canGenerateMore={false}
                approvalBlockedReason="Finish the open comment first."
                onReload={onReload}
                onGenerateMore={vi.fn()}
                onOpenReview={onOpenReview}
            />,
        );

        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getByText('Approved')).toBeInTheDocument();
        expect(screen.getByText('Dismissed')).toBeInTheDocument();
        expect(screen.getByText('Finish the open comment first.')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Open Review'));
        fireEvent.click(screen.getByText('Force Regenerate'));

        expect(onOpenReview).toHaveBeenCalledTimes(1);
        expect(onReload).toHaveBeenCalledTimes(1);
    });

    it('shows failed state with reload action', () => {
        const onReload = vi.fn();

        render(
            <WritingSuggestionsPanel
                cache={{
                    submissionId: 'submission-1',
                    status: 'failed',
                    updatedAt: Date.now(),
                    error: 'AI suggestions unavailable.',
                    perTask: {},
                    generatedFromEssayHashByTask: {},
                    reviewStateByTask: {},
                }}
                taskNumber={1}
                loading={false}
                reloading={false}
                canApprove={false}
                canGenerateMore={false}
                runState={null}
                approvalBlockedReason={null}
                onReload={onReload}
                onGenerateMore={vi.fn()}
                onOpenReview={vi.fn()}
            />,
        );

        expect(screen.getByText('AI suggestions unavailable.')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Force Regenerate'));
        expect(onReload).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Open Review' })).toBeDisabled();
    });

    it('disables review while suggestions are generating', () => {
        render(
            <WritingSuggestionsPanel
                cache={null}
                taskNumber={1}
                loading
                reloading={false}
                runState={{
                    status: 'generating',
                    updatedAt: Date.now(),
                    acceptedCount: 2,
                    phase: 'combined-scan',
                }}
                canApprove={false}
                canGenerateMore={false}
                approvalBlockedReason={null}
                onReload={vi.fn()}
                onGenerateMore={vi.fn()}
                onOpenReview={vi.fn()}
            />,
        );

        expect(screen.getByText('Scanning Task 1 suggestions in this browser.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Force Regenerate' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Open Review' })).toBeDisabled();
    });
});
