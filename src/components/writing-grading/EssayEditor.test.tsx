import { fireEvent, render, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EssayEditor from './EssayEditor';

function renderEditor(overrides: Partial<ComponentProps<typeof EssayEditor>> = {}) {
    return render(
        <EssayEditor
            originalEssayText="Hello world"
            initialContent={null}
            wordCount={2}
            activeTimeSeconds={120}
            taskNumber={1}
            onAddComment={vi.fn()}
            onGutterDotClick={vi.fn()}
            onCommentMarkClick={vi.fn()}
            onViewModeChange={vi.fn()}
            {...overrides}
        />,
    );
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
            pendingCorrection: {
                action: 'apply',
                from: 1,
                to: 6,
                correctionText: 'Hi',
                nonce: 1,
            },
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        expect(container.querySelector('.correction-mark-original')?.textContent).toBe('Hello');
        expect(container.querySelector('.correction-mark-replacement')?.textContent).toBe(' -> Hi');
    });

    it('renders the visible replacement text as a non-editable span', async () => {
        const { container } = renderEditor({
            pendingCorrection: {
                action: 'apply',
                from: 1,
                to: 6,
                correctionText: 'Hi',
                nonce: 1,
            },
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark-replacement')).toBeTruthy();
        });

        expect(container.querySelector('.correction-mark-replacement')).toHaveAttribute('contenteditable', 'false');
        expect(container.querySelector('.correction-mark-replacement')?.textContent).toBe(' -> Hi');
    });

    it('preserves spacing after the replacement when the selection includes a trailing space', async () => {
        const { container } = renderEditor({
            pendingCorrection: {
                action: 'apply',
                from: 1,
                to: 7,
                correctionText: 'Hi',
                nonce: 1,
            },
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
            pendingCorrection: {
                action: 'apply',
                from: 1,
                to: 6,
                correctionText: 'Hi',
                nonce: 1,
            },
        });

        await waitFor(() => {
            expect(container.querySelector('.correction-mark')).toBeTruthy();
        });

        expect(container.querySelector('.ProseMirror p')?.textContent).toContain('Hi world');
        expect(container.querySelector('.correction-mark-replacement')?.textContent).toBe(' -> Hi ');
    });

    it('does not create a double space when the teacher enters a trailing space before an existing gap', async () => {
        const { container } = renderEditor({
            pendingCorrection: {
                action: 'apply',
                from: 1,
                to: 6,
                correctionText: 'Hi   ',
                nonce: 1,
            },
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
            pendingCorrection: {
                action: 'apply',
                from: 1,
                to: 6,
                correctionText: 'Hi',
                nonce: 1,
            },
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
});
