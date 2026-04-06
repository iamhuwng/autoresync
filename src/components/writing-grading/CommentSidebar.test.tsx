import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommentSidebar from './CommentSidebar';
import type { GradingComment } from '../../types/ielts-writing.types';

const scrollIntoViewMock = vi.fn();
const getConstrainedHeight = (element: HTMLElement | null | undefined, defaultHeight: number) => {
    const nextMaxHeight = Number.parseFloat(element?.style?.maxHeight || '');
    return Number.isFinite(nextMaxHeight)
        ? Math.min(defaultHeight, nextMaxHeight)
        : defaultHeight;
};

const comments: GradingComment[] = [
    {
        id: 'comment-1',
        taskNumber: 1,
        text: '<p>First comment</p>',
        categoryId: 'cc',
        categoryLabel: 'Coherence & Cohesion',
        color: '#3b82f6',
        status: 'active',
        anchorText: 'first phrase',
        from: 1,
        to: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'comment-2',
        taskNumber: 1,
        text: '<p>Second comment</p>',
        categoryId: 'gra',
        categoryLabel: 'Grammar',
        color: '#10b981',
        status: 'active',
        anchorText: 'second phrase',
        from: 6,
        to: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
];

describe('CommentSidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            writable: true,
            value: 900,
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoViewMock,
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() {
                if (this?.getAttribute?.('data-comment-header-id') === 'comment-2') {
                    return 20;
                }
                if (this?.getAttribute?.('data-pending-comment-header-id') === 'comment-pending') {
                    return 20;
                }
                return 80;
            },
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
            configurable: true,
            writable: true,
            value: 0,
        });
        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value() {
                if (this?.getAttribute?.('data-comments-viewport') === 'true') {
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

                if (this?.getAttribute?.('data-comments-stack') === 'true') {
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

                if (this?.getAttribute?.('data-comment-header-id') === 'comment-2') {
                    return {
                        x: 0,
                        y: 260,
                        width: 420,
                        height: 20,
                        top: 260,
                        left: 24,
                        right: 444,
                        bottom: 280,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-comment-id') === 'comment-2') {
                    return {
                        x: 0,
                        y: 244,
                        width: 440,
                        height: 96,
                        top: 244,
                        left: 20,
                        right: 460,
                        bottom: 340,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-pending-comment-header-id') === 'comment-pending') {
                    return {
                        x: 0,
                        y: 260,
                        width: 420,
                        height: 20,
                        top: 260,
                        left: 24,
                        right: 444,
                        bottom: 280,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-pending-comment-id') === 'comment-pending') {
                    const height = getConstrainedHeight(this, 96);
                    return {
                        x: 0,
                        y: 244,
                        width: 440,
                        height,
                        top: 244,
                        left: 20,
                        right: 460,
                        bottom: 244 + height,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-pending-comment-header-id') === 'comment-pending-fallback') {
                    return {
                        x: 0,
                        y: 560,
                        width: 420,
                        height: 20,
                        top: 560,
                        left: 24,
                        right: 444,
                        bottom: 580,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-pending-comment-id') === 'comment-pending-fallback') {
                    const height = getConstrainedHeight(this, 96);
                    return {
                        x: 0,
                        y: 544,
                        width: 440,
                        height,
                        top: 544,
                        left: 20,
                        right: 460,
                        bottom: 544 + height,
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

    it('treats a pending composer as an anchored rail item instead of a footer block', async () => {
        const { container } = render(
            <CommentSidebar
                comments={comments}
                taskNumber={1}
                focusedCommentId={null}
                hoveredCommentId={null}
                anchorPositions={[
                    { commentId: 'comment-1', anchorTop: 100, anchorRight: 20, anchorCenterY: 110, anchorViewportTop: 140 },
                    { commentId: 'comment-2', anchorTop: 200, anchorRight: 20, anchorCenterY: 210, anchorViewportTop: 180 },
                ]}
                editorScrollTop={0}
                pendingCommentDraft={{
                    commentId: 'comment-pending',
                    taskNumber: 1,
                    anchorText: 'pending phrase',
                    from: 5,
                    to: 6,
                    anchorViewportTop: 180,
                    categoryId: 'uncategorized',
                    html: '',
                }}
                onFocusComment={() => {}}
                onHoverComment={() => {}}
                onEditComment={() => {}}
                onResolveComment={() => {}}
                onReopenComment={() => {}}
                onDeleteComment={() => {}}
                onRecoverComment={() => {}}
                onCategoryChange={() => {}}
                onPendingCommentChange={() => {}}
                onPendingCommentCategoryChange={() => {}}
                onCancelPendingComment={() => {}}
                onSavePendingComment={() => {}}
            />,
        );

        const renderedOrder = Array.from(container.querySelectorAll('[data-rail-item-id]')).map((node) =>
            node.getAttribute('data-rail-item-id'),
        );
        const shiftedCommentsStack = container.querySelector('[data-comments-stack="true"]');

        expect(renderedOrder).toEqual(['comment-1', 'comment-pending', 'comment-2']);

        await waitFor(() => {
            expect(shiftedCommentsStack).toHaveStyle({
                transform: 'translateY(-54px)',
            });
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });
    });

    it('keeps a low-screen pending composer fully inside the rail-safe lane instead of only aligning its label', async () => {
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            writable: true,
            value: 360,
        });

        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value() {
                if (this?.getAttribute?.('data-comments-viewport') === 'true') {
                    return {
                        x: 0,
                        y: 100,
                        width: 480,
                        height: 320,
                        top: 100,
                        left: 0,
                        right: 480,
                        bottom: 420,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-comments-stack') === 'true') {
                    return {
                        x: 0,
                        y: 114,
                        width: 480,
                        height: 360,
                        top: 114,
                        left: 0,
                        right: 480,
                        bottom: 474,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-pending-comment-header-id') === 'comment-pending-low') {
                    return {
                        x: 0,
                        y: 330,
                        width: 420,
                        height: 20,
                        top: 330,
                        left: 24,
                        right: 444,
                        bottom: 350,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-pending-comment-id') === 'comment-pending-low') {
                    const height = getConstrainedHeight(this, 320);
                    return {
                        x: 0,
                        y: 314,
                        width: 440,
                        height,
                        top: 314,
                        left: 20,
                        right: 460,
                        bottom: 314 + height,
                        toJSON() {
                            return this;
                        },
                    };
                }

                return originalGetBoundingClientRect.call(this);
            },
        });

        const { container } = render(
            <CommentSidebar
                comments={comments}
                taskNumber={1}
                focusedCommentId={null}
                hoveredCommentId={null}
                anchorPositions={[]}
                editorScrollTop={0}
                pendingCommentDraft={{
                    commentId: 'comment-pending-low',
                    taskNumber: 1,
                    anchorText: 'low phrase',
                    from: 20,
                    to: 24,
                    anchorViewportTop: 392,
                    categoryId: 'uncategorized',
                    html: '',
                }}
                onFocusComment={() => {}}
                onHoverComment={() => {}}
                onEditComment={() => {}}
                onResolveComment={() => {}}
                onReopenComment={() => {}}
                onDeleteComment={() => {}}
                onRecoverComment={() => {}}
                onCategoryChange={() => {}}
                onPendingCommentChange={() => {}}
                onPendingCommentCategoryChange={() => {}}
                onCancelPendingComment={() => {}}
                onSavePendingComment={() => {}}
            />,
        );

        const shiftedCommentsStack = container.querySelector('[data-comments-stack="true"]');
        const pendingRow = container.querySelector('[data-pending-comment-id="comment-pending-low"]');

        await waitFor(() => {
            expect(shiftedCommentsStack).toHaveStyle({
                transform: 'translateY(-200px)',
            });
            expect(Number.parseFloat((pendingRow as HTMLElement | null)?.style.maxHeight || '0')).toBeGreaterThan(0);
            expect(Number.parseFloat((pendingRow as HTMLElement | null)?.style.maxHeight || '0')).toBeLessThan(320);
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });
    });

    it('keeps fallback pending-draft movement inside the rail viewport instead of calling scrollIntoView', async () => {
        const { container } = render(
            <CommentSidebar
                comments={comments}
                taskNumber={1}
                focusedCommentId={null}
                hoveredCommentId={null}
                anchorPositions={[
                    { commentId: 'comment-1', anchorTop: 100, anchorRight: 20, anchorCenterY: 110, anchorViewportTop: 140 },
                    { commentId: 'comment-2', anchorTop: 200, anchorRight: 20, anchorCenterY: 210, anchorViewportTop: 180 },
                ]}
                editorScrollTop={0}
                pendingCommentDraft={{
                    commentId: 'comment-pending-fallback',
                    taskNumber: 1,
                    anchorText: 'pending phrase',
                    from: 12,
                    to: 16,
                    anchorViewportTop: null,
                    categoryId: 'uncategorized',
                    html: '',
                }}
                onFocusComment={() => {}}
                onHoverComment={() => {}}
                onEditComment={() => {}}
                onResolveComment={() => {}}
                onReopenComment={() => {}}
                onDeleteComment={() => {}}
                onRecoverComment={() => {}}
                onCategoryChange={() => {}}
                onPendingCommentChange={() => {}}
                onPendingCommentCategoryChange={() => {}}
                onCancelPendingComment={() => {}}
                onSavePendingComment={() => {}}
            />,
        );

        const viewport = container.querySelector('[data-comments-viewport="true"]') as HTMLElement | null;

        await waitFor(() => {
            expect(viewport?.scrollTop).toBe(162);
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });
    });

    it('moves the whole comments rail while keeping the focused comment in list order', async () => {
        const { container } = render(
            <CommentSidebar
                comments={comments}
                taskNumber={1}
                focusedCommentId="comment-2"
                focusedCommentAnchorViewportTop={180}
                hoveredCommentId={null}
                anchorPositions={[
                    { commentId: 'comment-1', anchorTop: 100, anchorRight: 20, anchorCenterY: 110, anchorViewportTop: 140 },
                    { commentId: 'comment-2', anchorTop: 200, anchorRight: 20, anchorCenterY: 210, anchorViewportTop: 180 },
                ]}
                editorScrollTop={0}
                onFocusComment={() => {}}
                onHoverComment={() => {}}
                onEditComment={() => {}}
                onResolveComment={() => {}}
                onReopenComment={() => {}}
                onDeleteComment={() => {}}
                onRecoverComment={() => {}}
                onCategoryChange={() => {}}
                readOnly
            />,
        );

        const renderedOrder = Array.from(container.querySelectorAll('[data-comment-id]')).map((node) =>
            node.getAttribute('data-comment-id'),
        );
        const shiftedCommentsStack = container.querySelector('[data-comments-stack="true"]');

        expect(renderedOrder).toEqual(['comment-1', 'comment-2']);

        await waitFor(() => {
            expect(shiftedCommentsStack).toHaveStyle({
                transform: 'translateY(-54px)',
            });
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });
    });

    it('keeps the comments rail comment-only after correction/sidebar decoupling', async () => {
        const commentsWithResolved: GradingComment[] = [
            ...comments,
            {
                id: 'comment-3',
                taskNumber: 1,
                text: '<p>Resolved comment</p>',
                categoryId: 'lr',
                categoryLabel: 'Lexical Resource',
                color: '#f59e0b',
                status: 'resolved',
                anchorText: 'third phrase',
                from: 11,
                to: 16,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                resolvedAt: Date.now(),
            },
        ];

        const { getByText, queryByText } = render(
            <CommentSidebar
                comments={commentsWithResolved}
                taskNumber={1}
                focusedCommentId="comment-1"
                focusedCommentAnchorViewportTop={140}
                hoveredCommentId={null}
                anchorPositions={[
                    { commentId: 'comment-1', anchorTop: 100, anchorRight: 20, anchorCenterY: 110, anchorViewportTop: 140 },
                    { commentId: 'comment-2', anchorTop: 200, anchorRight: 20, anchorCenterY: 210, anchorViewportTop: 180 },
                    { commentId: 'comment-3', anchorTop: 300, anchorRight: 20, anchorCenterY: 310, anchorViewportTop: 220 },
                ]}
                editorScrollTop={0}
                onFocusComment={() => {}}
                onHoverComment={() => {}}
                onEditComment={() => {}}
                onResolveComment={() => {}}
                onReopenComment={() => {}}
                onDeleteComment={() => {}}
                onRecoverComment={() => {}}
                onCategoryChange={() => {}}
            />,
        );

        await waitFor(() => {
            expect(getByText('Open (2)')).toBeTruthy();
            expect(getByText('Resolved (1)')).toBeTruthy();
            expect(queryByText('Correction')).toBeNull();
        });
    });
});
