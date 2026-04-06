import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnnotatedEssayReadOnly from './AnnotatedEssayReadOnly';

describe('AnnotatedEssayReadOnly', () => {
    it('renders fallback tooltips through a body portal and notifies the shared feedback rail', async () => {
        const onFeedbackSelect = vi.fn();
        const { container } = render(
            <AnnotatedEssayReadOnly
                essayText="wrong phrase"
                annotations={[{
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
                }]}
                onFeedbackSelect={onFeedbackSelect}
            />,
        );

        const commentMark = container.querySelector('span[title]') as HTMLElement;
        expect(commentMark).toBeTruthy();
        Object.defineProperty(commentMark, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                top: 100,
                right: 180,
                bottom: 120,
                left: 140,
                width: 40,
                height: 20,
                x: 140,
                y: 100,
                toJSON: () => ({}),
            }),
        });

        fireEvent.click(commentMark);

        await waitFor(() => {
            expect(document.body.querySelector('[data-comment-tooltip="true"]')).toBeTruthy();
        });

        expect(document.body.querySelector('[data-comment-tooltip="true"]')).toHaveAttribute('data-placement', 'right');
        expect(onFeedbackSelect).toHaveBeenCalledWith('comment-legacy', 100);
    });
});
