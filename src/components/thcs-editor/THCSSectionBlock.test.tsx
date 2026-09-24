import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { THCSSection } from '../../types/thcs-test.types';
import THCSSectionBlock from './THCSSectionBlock';

vi.mock('./THCSBulkPasteModal', () => ({ THCSBulkPasteModal: () => null }));
vi.mock('./THCSQuestionBlock', () => ({
    default: ({ globalNumber, canMoveDown, onMoveDown }: {
        globalNumber: number;
        canMoveDown: boolean;
        onMoveDown: () => void;
    }) => (
        <div data-testid="question">
            Question {globalNumber}
            <button type="button" aria-label={`Move down question ${globalNumber}`} disabled={!canMoveDown} onClick={onMoveDown} />
        </div>
    ),
}));

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

describe('THCSSectionBlock question batching', () => {
    const manyQuestions = (): THCSSection => ({
        ...section,
        id: 'question-batching',
        questions: Array.from({ length: 45 }, (_, index) => ({
            id: `question-${index + 1}`,
            questionNumber: index + 1,
            type: 'mcq-grammar',
            intent: 'mcq-grammar',
            questionText: `Question ${index + 1}`,
            options: ['', '', '', ''],
            correctAnswer: '' as any,
        })),
    });

    it('reveals batches near the list end and restores the per-section count and scroll position', () => {
        const view = render(<THCSSectionBlock section={manyQuestions()} sectionIndex={0} totalSections={1}
            globalQuestionOffset={0} draftId={null} onUpdate={vi.fn()} onDelete={vi.fn()}
            onMoveUp={vi.fn()} onMoveDown={vi.fn()} />);
        const list = screen.getByRole('region', { name: 'Dialogue Response questions' });
        Object.defineProperties(list, {
            scrollHeight: { configurable: true, value: 1000 },
            clientHeight: { configurable: true, value: 500 },
        });
        list.scrollTop = 400;
        fireEvent.scroll(list);

        expect(screen.getAllByTestId('question')).toHaveLength(40);
        expect(screen.getByText('Showing 40 of 45 questions. Scroll down to load more.')).toBeInTheDocument();
        view.unmount();

        render(<THCSSectionBlock section={manyQuestions()} sectionIndex={0} totalSections={1}
            globalQuestionOffset={0} draftId={null} onUpdate={vi.fn()} onDelete={vi.fn()}
            onMoveUp={vi.fn()} onMoveDown={vi.fn()} />);
        expect(screen.getAllByTestId('question')).toHaveLength(40);
        expect(screen.getByRole('region', { name: 'Dialogue Response questions' })).toHaveProperty('scrollTop', 400);
    });

    it('allows moving the last visible question down across the loaded boundary', () => {
        const onUpdate = vi.fn();
        render(<THCSSectionBlock section={manyQuestions()} sectionIndex={0} totalSections={1}
            globalQuestionOffset={0} draftId={null} onUpdate={onUpdate} onDelete={vi.fn()}
            onMoveUp={vi.fn()} onMoveDown={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Move down question 20' }));
        const moved = onUpdate.mock.lastCall?.[0] as THCSSection;
        expect(moved.questions[19]?.id).toBe('question-21');
        expect(moved.questions[20]?.id).toBe('question-20');
        expect(moved.questions).toHaveLength(45);
    });

    it('restores the revealed list and scroll position when the same editor switches sections', () => {
        const first = { ...manyQuestions(), id: 'switch-first', name: 'First' };
        const second = { ...manyQuestions(), id: 'switch-second', name: 'Second' };
        const props = { sectionIndex: 0, totalSections: 2, globalQuestionOffset: 0,
            draftId: null, onUpdate: vi.fn(), onDelete: vi.fn(), onMoveUp: vi.fn(), onMoveDown: vi.fn() };
        const view = render(<THCSSectionBlock {...props} section={first} />);
        const list = screen.getByRole('region', { name: 'First questions' });
        Object.defineProperties(list, {
            scrollHeight: { configurable: true, value: 1000 },
            clientHeight: { configurable: true, value: 500 },
        });
        list.scrollTop = 400;
        fireEvent.scroll(list);
        expect(screen.getAllByTestId('question')).toHaveLength(40);

        view.rerender(<THCSSectionBlock {...props} section={second} />);
        expect(screen.getAllByTestId('question')).toHaveLength(20);
        view.rerender(<THCSSectionBlock {...props} section={first} />);
        expect(screen.getAllByTestId('question')).toHaveLength(40);
        expect(screen.getByRole('region', { name: 'First questions' })).toHaveProperty('scrollTop', 400);
    });

    it('shows a newly appended question even when earlier questions were batched', () => {
        const onUpdate = vi.fn();
        const props = { sectionIndex: 0, totalSections: 1, globalQuestionOffset: 0,
            draftId: null, onUpdate, onDelete: vi.fn(), onMoveUp: vi.fn(), onMoveDown: vi.fn() };
        const view = render(<THCSSectionBlock {...props} section={manyQuestions()} />);
        fireEvent.click(screen.getByRole('button', { name: '+ Add Question' }));
        view.rerender(<THCSSectionBlock {...props} section={onUpdate.mock.lastCall?.[0] as THCSSection} />);
        expect(screen.getAllByTestId('question')).toHaveLength(46);
    });
});
