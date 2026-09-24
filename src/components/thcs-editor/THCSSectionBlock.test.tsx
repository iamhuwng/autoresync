import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { THCSSection } from '../../types/thcs-test.types';
import THCSSectionBlock from './THCSSectionBlock';

vi.mock('./THCSBulkPasteModal', () => ({ THCSBulkPasteModal: () => null }));

const section: THCSSection = {
    id: 'dialogue',
    name: 'Dialogue Response',
    order: 1,
    totalPoints: 1,
    pointMode: 'auto',
    instructionText: '',
    isCustomInstruction: false,
    layout: 'single-column',
    questions: [],
};

beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new Event('close'));
    };
});

afterEach(() => {
    cleanup();
});

describe('THCSSectionBlock delete confirmation', () => {
    it('opens a native modal and only removes the section after confirmation', () => {
        const onDelete = vi.fn();
        render(
            <THCSSectionBlock
                section={section}
                sectionIndex={1}
                totalSections={2}
                globalQuestionOffset={0}
                draftId={null}
                onUpdate={vi.fn()}
                onDelete={onDelete}
                onMoveUp={vi.fn()}
                onMoveDown={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete Dialogue Response' }));
        const dialog = screen.getByRole('dialog', { name: 'Delete Section' });
        expect(dialog).toHaveAttribute('open');
        const outerEscape = vi.fn();
        document.addEventListener('keydown', outerEscape);
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(outerEscape).not.toHaveBeenCalled();
        document.removeEventListener('keydown', outerEscape);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onDelete).not.toHaveBeenCalled();
        expect(dialog).not.toHaveAttribute('open');

        fireEvent.click(screen.getByRole('button', { name: 'Delete Dialogue Response' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onDelete).toHaveBeenCalledOnce();
    });

    it('keeps section field edits wired to the draft update callback', () => {
        const onUpdate = vi.fn();
        render(<THCSSectionBlock section={section} sectionIndex={1} totalSections={2}
            globalQuestionOffset={0} draftId={null} onUpdate={onUpdate} onDelete={vi.fn()}
            onMoveUp={vi.fn()} onMoveDown={vi.fn()} />);

        fireEvent.change(screen.getByRole('textbox', { name: 'Section name' }), { target: { value: 'New name' } });
        expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'New name' }));

        fireEvent.click(screen.getByRole('radio', { name: '2 Col' }));
        expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ layout: 'two-column', isCustomLayout: true }));

        fireEvent.change(screen.getByRole('spinbutton', { name: 'Points' }), { target: { value: '1.5' } });
        expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ totalPoints: 1.5 }));
    });
});
