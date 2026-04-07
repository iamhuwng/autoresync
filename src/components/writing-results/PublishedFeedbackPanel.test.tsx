import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishedFeedbackPanel from './PublishedFeedbackPanel';

const scrollIntoViewMock = vi.fn();

describe('PublishedFeedbackPanel', () => {
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
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
            configurable: true,
            writable: true,
            value: 0,
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() {
                if (this?.getAttribute?.('data-feedback-header-id') === 'comment-1') {
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

                if (this?.getAttribute?.('data-feedback-header-id') === 'comment-1') {
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

                if (this?.getAttribute?.('data-feedback-card-id') === 'comment-1') {
                    return {
                        x: 0,
                        y: 544,
                        width: 440,
                        height: 96,
                        top: 544,
                        left: 20,
                        right: 460,
                        bottom: 640,
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

    it('keeps fallback selection reveal inside the local viewport instead of calling scrollIntoView', async () => {
        const { container } = render(
            <PublishedFeedbackPanel
                comments={[{
                    kind: 'comment',
                    id: 'comment-1',
                    text: '<p>First comment</p>',
                    color: '#4f46e5',
                    anchorText: 'first phrase',
                    from: 1,
                    to: 5,
                    status: 'active',
                    categoryLabel: 'Task Response',
                }]}
                corrections={[]}
                selectedFeedbackId="comment-1"
                selectedFeedbackAnchorViewportTop={null}
                alignToEssay
            />,
        );

        const viewport = container.querySelector('[data-feedback-viewport="true"]') as HTMLElement | null;

        await waitFor(() => {
            expect(viewport?.scrollTop).toBe(152);
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });
    });

    it('keeps the selected feedback fully visible when the panel is cut off by the browser viewport', async () => {
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            writable: true,
            value: 360,
        });
        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value() {
                if (this?.getAttribute?.('data-feedback-viewport') === 'true') {
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

                if (this?.getAttribute?.('data-feedback-stack') === 'true') {
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

                if (this?.getAttribute?.('data-feedback-header-id') === 'comment-1') {
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

                if (this?.getAttribute?.('data-feedback-card-id') === 'comment-1') {
                    return {
                        x: 0,
                        y: 314,
                        width: 440,
                        height: 156,
                        top: 314,
                        left: 20,
                        right: 460,
                        bottom: 470,
                        toJSON() {
                            return this;
                        },
                    };
                }

                return originalGetBoundingClientRect.call(this);
            },
        });

        const { container } = render(
            <PublishedFeedbackPanel
                comments={[{
                    kind: 'comment',
                    id: 'comment-1',
                    text: '<p>First comment</p>',
                    color: '#4f46e5',
                    anchorText: 'first phrase',
                    from: 1,
                    to: 5,
                    status: 'active',
                    categoryLabel: 'Task Response',
                }]}
                corrections={[]}
                selectedFeedbackId="comment-1"
                selectedFeedbackAnchorViewportTop={392}
                alignToEssay
            />,
        );

        const shiftedFeedbackStack = container.querySelector('[data-feedback-stack="true"]');

        await waitFor(() => {
            expect(shiftedFeedbackStack).toHaveStyle({
                transform: 'translateY(-120px)',
            });
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });
    });

    it('replays rail alignment for the same selected feedback when a new selection request arrives', async () => {
        const { container, rerender } = render(
            <PublishedFeedbackPanel
                comments={[{
                    kind: 'comment',
                    id: 'comment-1',
                    text: '<p>First comment</p>',
                    color: '#4f46e5',
                    anchorText: 'first phrase',
                    from: 1,
                    to: 5,
                    status: 'active',
                    categoryLabel: 'Task Response',
                }]}
                corrections={[]}
                selectedFeedbackId="comment-1"
                selectedFeedbackAnchorViewportTop={392}
                selectionRequestKey={1}
                alignToEssay
            />,
        );

        const shiftedFeedbackStack = container.querySelector('[data-feedback-stack="true"]') as HTMLElement | null;

        await waitFor(() => {
            expect(shiftedFeedbackStack).toHaveStyle({
                transform: 'translateY(-140px)',
            });
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
                        y: 120,
                        width: 480,
                        height: 320,
                        top: 120,
                        left: 0,
                        right: 480,
                        bottom: 440,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-feedback-header-id') === 'comment-1') {
                    return {
                        x: 0,
                        y: 310,
                        width: 420,
                        height: 20,
                        top: 310,
                        left: 24,
                        right: 444,
                        bottom: 330,
                        toJSON() {
                            return this;
                        },
                    };
                }

                if (this?.getAttribute?.('data-feedback-card-id') === 'comment-1') {
                    return {
                        x: 0,
                        y: 294,
                        width: 440,
                        height: 96,
                        top: 294,
                        left: 20,
                        right: 460,
                        bottom: 390,
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

        rerender(
            <PublishedFeedbackPanel
                comments={[{
                    kind: 'comment',
                    id: 'comment-1',
                    text: '<p>First comment</p>',
                    color: '#4f46e5',
                    anchorText: 'first phrase',
                    from: 1,
                    to: 5,
                    status: 'active',
                    categoryLabel: 'Task Response',
                }]}
                corrections={[]}
                selectedFeedbackId="comment-1"
                selectedFeedbackAnchorViewportTop={392}
                selectionRequestKey={2}
                alignToEssay
            />,
        );

        await waitFor(() => {
            expect(shiftedFeedbackStack?.style.transform).not.toBe('translateY(-140px)');
            expect(scrollIntoViewMock).not.toHaveBeenCalled();
        });
    });
});
