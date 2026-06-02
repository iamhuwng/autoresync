import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WritingPublishedMarkupViewer from './WritingPublishedMarkupViewer';

function buildMarkedContent(
    text: string,
    marks: Array<{ type: string; attrs?: Record<string, unknown> }> = [],
) {
    return {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text,
                        marks,
                    },
                    {
                        type: 'text',
                        text: ' world',
                    },
                ],
            },
        ],
    };
}

describe('WritingPublishedMarkupViewer', () => {
    it('renders the published hover tooltip through a body portal with adjacent placement', async () => {
        const { container } = render(
            <WritingPublishedMarkupViewer
                originalEssayText="Hello world"
                markedContent={buildMarkedContent('Hello', [
                    { type: 'commentMark', attrs: { commentId: 'comment-1', color: '#facc15' } },
                ])}
                comments={[{
                    kind: 'comment',
                    id: 'comment-1',
                    text: '<p>Published reason</p>',
                    color: '#facc15',
                    anchorText: 'Hello',
                    from: 1,
                    to: 6,
                    status: 'active',
                    categoryLabel: 'Grammar',
                }]}
                corrections={[]}
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('[data-comment-id="comment-1"]')).toBeTruthy();
        });

        const commentMark = container.querySelector('[data-comment-id="comment-1"]') as HTMLElement;
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

        fireEvent.mouseOver(commentMark);

        await waitFor(() => {
            expect(document.body.querySelector('[data-comment-tooltip="true"]')).toBeTruthy();
        });

        expect(document.body.querySelector('[data-comment-tooltip="true"]')).toHaveAttribute('data-placement', 'right');
        expect(container.querySelector('[data-comment-tooltip="true"]')).toBeNull();
    });

    it('renders fallback marked content with visible whitespace preserved', async () => {
        const { container } = render(
            <WritingPublishedMarkupViewer
                originalEssayText="product A    rose"
                markedContent={null}
                comments={[{
                    kind: 'comment',
                    id: 'comment-1',
                    text: '<p>Spacing note</p>',
                    color: '#facc15',
                    anchorText: 'product A    rose',
                    from: 1,
                    to: 18,
                    status: 'active',
                    categoryLabel: 'Grammar',
                }]}
                corrections={[]}
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror')).toBeTruthy();
        });

        expect(getComputedStyle(container.querySelector('.ProseMirror') as Element).whiteSpace).toBe('pre-wrap');
        expect(container.querySelector('.ProseMirror p')?.textContent).toBe('product A    rose');
    });
});
