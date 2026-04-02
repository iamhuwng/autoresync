import { fireEvent, render, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EssayEditor from './EssayEditor';

const baseProps: ComponentProps<typeof EssayEditor> = {
    originalEssayText: 'Hello world',
    initialContent: null,
    wordCount: 2,
    activeTimeSeconds: 120,
    taskNumber: 1,
    onAddComment: vi.fn(),
    onGutterDotClick: vi.fn(),
    onCommentMarkClick: vi.fn(),
    onViewModeChange: vi.fn(),
};

function renderEditor(overrides: Partial<ComponentProps<typeof EssayEditor>> = {}) {
    return render(
        <EssayEditor
            {...baseProps}
            {...overrides}
        />,
    );
}

function buildPendingCorrection(
    overrides: Partial<NonNullable<ComponentProps<typeof EssayEditor>['pendingCorrection']>> = {},
): NonNullable<ComponentProps<typeof EssayEditor>['pendingCorrection']> {
    return {
        taskNumber: 1,
        action: 'apply',
        from: 1,
        to: 6,
        correctionText: 'Hi',
        nonce: 1,
        ...overrides,
    };
}

function buildPendingQuickComment(
    overrides: Partial<NonNullable<ComponentProps<typeof EssayEditor>['pendingQuickComment']>> = {},
): NonNullable<ComponentProps<typeof EssayEditor>['pendingQuickComment']> {
    return {
        taskNumber: 1,
        preset: {
            id: 'preset-1',
            text: 'Check cohesion',
            categoryId: 'cc',
            categoryLabel: 'CC',
            color: '#22c55e',
            isDefault: true,
        },
        from: 1,
        to: 6,
        selectedText: 'Hello',
        nonce: 1,
        ...overrides,
    };
}

function buildInitialContent(
    text: string,
    marks: Array<{ type: string; attrs?: Record<string, unknown> }> = [],
    trailingText = ' world',
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
                        text: trailingText,
                    },
                ],
            },
        ],
    };
}

const rect = {
    x: 0,
    y: 0,
    width: 120,
    height: 24,
    top: 0,
    left: 0,
    right: 120,
    bottom: 24,
    toJSON() {
        return this;
    },
};

describe('EssayEditor', () => {
    beforeEach(() => {
        Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: () => rect,
        });
        Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
            configurable: true,
            value: () => ({
                length: 1,
                item: () => rect,
                [Symbol.iterator]: function* iterator() {
                    yield rect;
                },
            }),
        });
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: () => rect,
        });
        Object.defineProperty(Range.prototype, 'getClientRects', {
            configurable: true,
            value: () => ({
                length: 1,
                item: () => rect,
                [Symbol.iterator]: function* iterator() {
                    yield rect;
                },
            }),
        });
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: () => document.querySelector('.ProseMirror'),
        });
    });

    it('renders correction replacement text outside the struck-through original span', async () => {
        const { container } = renderEditor({
            pendingCorrection: buildPendingCorrection(),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        expect(container.querySelector('.correction-mark-original')?.textContent).toBe('Hello');
        expect(container.querySelector('.correction-mark-replacement')?.textContent).toBe(' -> Hi');
    });

    it('renders the visible replacement text as a non-editable span', async () => {
        const { container } = renderEditor({
            pendingCorrection: buildPendingCorrection(),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark-replacement')).toBeTruthy();
        });

        expect(container.querySelector('.correction-mark-replacement')).toHaveAttribute('contenteditable', 'false');
        expect(container.querySelector('.correction-mark-replacement')?.textContent).toBe(' -> Hi');
    });

    it('preserves spacing after the replacement when the selection includes a trailing space', async () => {
        const { container } = renderEditor({
            pendingCorrection: buildPendingCorrection({ to: 7 }),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        expect(container.querySelector('.correction-mark-original')?.textContent).toBe('Hello');
        expect(container.querySelector('.ProseMirror p')?.textContent).toContain('Hi world');
    });

    it('adds exactly one separating space when the replacement would otherwise glue to the next word', async () => {
        const { container } = renderEditor({
            originalEssayText: 'Helloworld',
            pendingCorrection: buildPendingCorrection(),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        expect(container.querySelector('.ProseMirror p')?.textContent).toContain('Hi world');
        expect(container.querySelector('.correction-mark-replacement')?.textContent).toBe(' -> Hi ');
    });

    it('does not create a double space when the teacher enters a trailing space before an existing gap', async () => {
        const { container } = renderEditor({
            pendingCorrection: buildPendingCorrection({ correctionText: 'Hi   ' }),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        expect(container.querySelector('.ProseMirror p')?.textContent).toContain('Hi world');
        expect(container.querySelector('.ProseMirror p')?.textContent).not.toContain('Hi  world');
    });

    it('opens correction mark editing when the replacement text is clicked', async () => {
        const onCorrectionMarkClick = vi.fn();
        const { container } = renderEditor({
            onCorrectionMarkClick,
            pendingCorrection: buildPendingCorrection(),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark-replacement')).toBeTruthy();
        });

        fireEvent.click(container.querySelector('.correction-mark-replacement') as Element);

        await waitFor(() => {
            expect(onCorrectionMarkClick).toHaveBeenCalledWith(expect.objectContaining({
                from: 1,
                to: 6,
                selectedText: 'Hello',
                correctionText: 'Hi',
            }));
        });
    });

    it('removes the correction mark without deleting the student text', async () => {
        const { container, rerender } = renderEditor({
            pendingCorrection: buildPendingCorrection(),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        rerender(
            <EssayEditor
                {...baseProps}
                pendingCorrection={buildPendingCorrection({
                    action: 'remove',
                    nonce: 2,
                    correctionText: undefined,
                })}
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeNull();
        });

        expect(container.querySelector('.ProseMirror p')?.textContent).toBe('Hello world');
    });

    it('rehydrates the editor state when the task source changes', async () => {
        const { container, rerender } = renderEditor({
            pendingCorrection: buildPendingCorrection(),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        fireEvent.click(container.querySelector('#view-toggle-original') as Element);

        expect(container.querySelector('#view-toggle-original')?.className).toContain('active');

        rerender(
            <EssayEditor
                {...baseProps}
                taskNumber={2}
                originalEssayText="Second task response"
                pendingCorrection={null}
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeNull();
            expect(container.querySelector('.ProseMirror p')?.textContent).toBe('Second task response');
            expect(container.querySelector('#view-toggle-marked')?.className).toContain('active');
        });
    });

    it('ignores correction commands queued for another task', async () => {
        const { container } = renderEditor({
            pendingCorrection: buildPendingCorrection({ taskNumber: 2 }),
        });

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror p')?.textContent).toBe('Hello world');
        });

        expect(container.querySelector('.correction-mark')).toBeNull();
    });

    it('replays quick comments against the anchored selection provided by the page', async () => {
        const onAddComment = vi.fn();

        renderEditor({
            onAddComment,
            pendingQuickComment: buildPendingQuickComment(),
        });

        await waitFor(() => {
            expect(onAddComment).toHaveBeenCalledWith(
                'Hello',
                1,
                6,
                expect.stringMatching(/^comment-/),
                expect.objectContaining({ id: 'preset-1' }),
            );
        });
    });

    it('does not apply queued tool commands while read-only', async () => {
        const { container } = renderEditor({
            readOnly: true,
            pendingCorrection: buildPendingCorrection(),
            pendingQuickComment: buildPendingQuickComment(),
        });

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror p')?.textContent).toBe('Hello world');
        });

        expect(container.querySelector('.correction-mark')).toBeNull();
        expect(container.querySelector('#toolbar-comment')).toBeDisabled();
        expect(container.querySelector('#toolbar-correction')).toBeDisabled();
        expect(container.querySelector('#toolbar-highlight')).toBeDisabled();
    });

    it('strips highlight, strike, and text color from a range before applying a correction', async () => {
        const { container } = renderEditor({
            initialContent: buildInitialContent('Hello', [
                { type: 'highlight', attrs: { color: '#fef08a' } },
                { type: 'strike' },
                { type: 'textStyle', attrs: { color: '#ef4444' } },
            ]),
            pendingCorrection: buildPendingCorrection(),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        expect(container.querySelector('.correction-mark-original mark')).toBeNull();
        expect(container.querySelector('.correction-mark-original s')).toBeNull();
        expect(container.querySelector('.correction-mark-original span[style*="color"]')).toBeNull();
        expect(container.querySelector('.ProseMirror p')?.textContent).toContain('Hi world');
    });

    it('keeps comment and highlight overlap available when no correction mark is involved', async () => {
        const { container } = renderEditor({
            initialContent: buildInitialContent('Hello', [
                { type: 'highlight', attrs: { color: '#fef08a' } },
            ]),
            pendingCommentMutation: {
                action: 'apply',
                taskNumber: 1,
                from: 1,
                to: 6,
                commentId: 'comment-1',
                color: '#22c55e',
                nonce: 1,
            },
        });

        await waitFor(() => {
            expect(container.querySelector('[data-comment-id="comment-1"]')).toBeTruthy();
        });

        expect(container.querySelector('[data-comment-id="comment-1"] mark, mark [data-comment-id="comment-1"]')).toBeTruthy();
    });

    it('prefers correction editing over comment clicks when old overlapping marks already exist', async () => {
        const onCommentMarkClick = vi.fn();
        const onCorrectionMarkClick = vi.fn();
        const { container } = renderEditor({
            onCommentMarkClick,
            onCorrectionMarkClick,
            comments: [{
                id: 'comment-1',
                taskNumber: 1,
                text: 'Keep this precise.',
                categoryId: 'cc',
                categoryLabel: 'CC',
                color: '#22c55e',
                status: 'active',
                anchorText: 'Hello',
                from: 1,
                to: 6,
                createdAt: 1,
                updatedAt: 1,
            }],
            initialContent: buildInitialContent('Hello', [
                { type: 'commentMark', attrs: { commentId: 'comment-1', color: '#22c55e' } },
                { type: 'correctionMark', attrs: { correctionText: 'Hi' } },
            ]),
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark-replacement')).toBeTruthy();
        });

        fireEvent.click(container.querySelector('.correction-mark-replacement') as Element);

        await waitFor(() => {
            expect(onCorrectionMarkClick).toHaveBeenCalledWith(expect.objectContaining({
                selectedText: 'Hello',
                correctionText: 'Hi',
            }));
        });

        expect(onCommentMarkClick).not.toHaveBeenCalled();
    });
});
