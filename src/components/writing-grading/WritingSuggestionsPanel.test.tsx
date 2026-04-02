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
        perTask: {
            1: {
                taskNumber: 1,
                grammar: {
                    comments: [
                        {
                            id: 'comment-1',
                            taskNumber: 1,
                            kind: 'comment',
                            focus: 'grammar',
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
                            taskNumber: 1,
                            kind: 'correction',
                            focus: 'vocabulary-expression',
                            sentenceIndex: 1,
                            anchorText: 'increase',
                            from: 18,
                            to: 26,
                            title: 'Verb choice',
                            reason: 'Past reporting typically uses the past tense here.',
                            replacementText: 'increased',
                            categoryId: 'lr',
                        },
                    ],
                },
            },
        },
    };
}

describe('WritingSuggestionsPanel', () => {
    it('renders ready suggestions and delegates button actions', () => {
        const onReload = vi.fn();
        const onFocusSuggestion = vi.fn();
        const onInjectComment = vi.fn();
        const onInjectCorrection = vi.fn();
        const cache = createReadyCache();

        render(
            <WritingSuggestionsPanel
                cache={cache}
                taskNumber={1}
                loading={false}
                reloading={false}
                canInject
                onReload={onReload}
                onFocusSuggestion={onFocusSuggestion}
                onInjectComment={onInjectComment}
                onInjectCorrection={onInjectCorrection}
            />,
        );

        expect(screen.getByText('Verb agreement')).toBeInTheDocument();
        expect(screen.getByText('Verb choice')).toBeInTheDocument();

        fireEvent.click(screen.getAllByText('Focus in Essay')[0] as HTMLElement);
        fireEvent.click(screen.getByText('Inject to Comment'));
        fireEvent.click(screen.getByText('Inject to Correction'));
        fireEvent.click(screen.getByText('Reload Suggestions'));

        expect(onFocusSuggestion).toHaveBeenCalledWith(cache.perTask[1]?.grammar.comments[0]);
        expect(onInjectComment).toHaveBeenCalledWith(cache.perTask[1]?.grammar.comments[0]);
        expect(onInjectCorrection).toHaveBeenCalledWith(cache.perTask[1]?.vocabularyExpression.corrections[0]);
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
                }}
                taskNumber={1}
                loading={false}
                reloading={false}
                canInject={false}
                onReload={onReload}
                onFocusSuggestion={vi.fn()}
                onInjectComment={vi.fn()}
                onInjectCorrection={vi.fn()}
            />,
        );

        expect(screen.getByText('AI suggestions unavailable.')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Reload Suggestions'));
        expect(onReload).toHaveBeenCalledTimes(1);
    });
});
