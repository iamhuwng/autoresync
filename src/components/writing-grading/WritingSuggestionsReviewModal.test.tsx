import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WritingSuggestionsReviewModal from './WritingSuggestionsReviewModal';
import type { WritingSuggestionCacheDoc } from '../../types/ielts-writing.types';

function createCache(): WritingSuggestionCacheDoc {
    return {
        submissionId: 'submission-1',
        status: 'ready',
        generatedAt: Date.now(),
        updatedAt: Date.now(),
        generatedFromEssayHashByTask: { 1: 'essay_hash' },
        reviewStateByTask: {
            1: {
                'pending-suggestion': 'pending',
                'approved-suggestion': 'approved',
            },
        },
        perTask: {
            1: {
                taskNumber: 1,
                grammar: {
                    comments: [
                        {
                            id: 'pending-suggestion',
                            reviewKey: 'pending-suggestion',
                            reviewStatus: 'pending',
                            taskNumber: 1,
                            kind: 'comment',
                            focus: 'grammar',
                            issueFamily: 'agreement',
                            confidence: 90,
                            sentenceIndex: 0,
                            anchorText: 'show',
                            from: 0,
                            to: 4,
                            title: 'Verb agreement',
                            reason: 'Use the singular verb form.',
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
                            id: 'approved-suggestion',
                            reviewKey: 'approved-suggestion',
                            reviewStatus: 'approved',
                            taskNumber: 1,
                            kind: 'correction',
                            focus: 'vocabulary-expression',
                            issueFamily: 'word-choice',
                            confidence: 88,
                            sentenceIndex: 1,
                            anchorText: 'increase',
                            from: 6,
                            to: 14,
                            title: 'Verb tense',
                            reason: 'Use the past tense for reported data.',
                            replacementText: 'increased',
                            categoryId: 'lr',
                        },
                    ],
                },
            },
        },
    };
}

describe('WritingSuggestionsReviewModal', () => {
    it('renders pending suggestions and delegates approve/dismiss actions', () => {
        const onApproveSuggestion = vi.fn();
        const onDismissSuggestion = vi.fn();

        render(
            <WritingSuggestionsReviewModal
                open
                cache={createCache()}
                taskNumber={1}
                loading={false}
                reloading={false}
                runState={null}
                canApprove
                canGenerateMore={false}
                approvalBlocked={false}
                approvalBlockedReason={null}
                onClose={vi.fn()}
                onReload={vi.fn()}
                onGenerateMore={vi.fn()}
                onApproveSuggestion={onApproveSuggestion}
                onDismissSuggestion={onDismissSuggestion}
                onRestoreSuggestion={vi.fn()}
            />,
        );

        expect(screen.getByText('Verb agreement')).toBeInTheDocument();
        expect(screen.getByText('Review Status')).toBeInTheDocument();
        expect(screen.getByText('Focus Area')).toBeInTheDocument();
        expect(screen.getByText('Edit Type')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Approve'));
        fireEvent.click(screen.getByText('Dismiss'));

        expect(onApproveSuggestion).toHaveBeenCalledTimes(1);
        expect(onDismissSuggestion).toHaveBeenCalledTimes(1);
    });

    it('filters to approved suggestions and exposes restore', () => {
        const onRestoreSuggestion = vi.fn();

        render(
            <WritingSuggestionsReviewModal
                open
                cache={createCache()}
                taskNumber={1}
                loading={false}
                reloading={false}
                runState={null}
                canApprove
                canGenerateMore={false}
                approvalBlocked={false}
                approvalBlockedReason={null}
                onClose={vi.fn()}
                onReload={vi.fn()}
                onGenerateMore={vi.fn()}
                onApproveSuggestion={vi.fn()}
                onDismissSuggestion={vi.fn()}
                onRestoreSuggestion={onRestoreSuggestion}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Approved 1' }));

        const approvedCard = screen.getByText('Verb tense').closest('.wsm-card');
        expect(approvedCard).toBeTruthy();
        expect(within(approvedCard as HTMLElement).getByText('Lexical')).toBeInTheDocument();
        expect(within(approvedCard as HTMLElement).getByText('Correction')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Restore to Pending'));
        expect(onRestoreSuggestion).toHaveBeenCalledTimes(1);
    });

    it('groups suggestions in sentence order so the list follows essay progression', () => {
        render(
            <WritingSuggestionsReviewModal
                open
                cache={createCache()}
                taskNumber={1}
                loading={false}
                reloading={false}
                runState={null}
                canApprove
                canGenerateMore={false}
                approvalBlocked={false}
                approvalBlockedReason={null}
                onClose={vi.fn()}
                onReload={vi.fn()}
                onGenerateMore={vi.fn()}
                onApproveSuggestion={vi.fn()}
                onDismissSuggestion={vi.fn()}
                onRestoreSuggestion={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'All 2' }));

        const sentenceLabels = screen.getAllByText(/Sentence \d+/).map((node) => node.textContent);
        expect(sentenceLabels).toContain('Sentence 1');
        expect(sentenceLabels).toContain('Sentence 2');
        expect(sentenceLabels.indexOf('Sentence 1')).toBeLessThan(sentenceLabels.indexOf('Sentence 2'));
    });
});
