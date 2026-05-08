import { fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import TabbedFeedbackEditor, { type FeedbackContent } from './TabbedFeedbackEditor';

function buildFeedback(prefix: string): FeedbackContent {
    return {
        taskSummary: `<p>${prefix} summary</p>`,
        ta: `<p>${prefix} task response</p>`,
        cc: `<p>${prefix} coherence</p>`,
        lr: `<p>${prefix} lexical</p>`,
        gra: `<p>${prefix} grammar</p>`,
    };
}

function ControlledTabbedFeedbackEditor({ initialFeedback }: { initialFeedback: FeedbackContent }) {
    const [feedback, setFeedback] = useState(initialFeedback);

    return (
        <TabbedFeedbackEditor
            taskNumber={1}
            feedback={feedback}
            onChange={setFeedback}
        />
    );
}

describe('TabbedFeedbackEditor', () => {
    it('resets to task summary and reloads content when the task changes', async () => {
        const onChange = vi.fn();
        const onTabChange = vi.fn();
        const { container, rerender } = render(
            <TabbedFeedbackEditor
                taskNumber={1}
                feedback={buildFeedback('Task 1')}
                onChange={onChange}
                onTabChange={onTabChange}
            />,
        );

        fireEvent.click(container.querySelector('#feedback-tab-ta') as Element);

        await waitFor(() => {
            expect(container.querySelector('.feedback-tab.active')?.textContent).toBe('TA');
            expect(container.querySelector('.ProseMirror')?.textContent).toContain('Task 1 task response');
        });

        rerender(
            <TabbedFeedbackEditor
                taskNumber={2}
                feedback={buildFeedback('Task 2')}
                onChange={onChange}
                onTabChange={onTabChange}
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('.feedback-tab.active')?.textContent).toBe('Task Summary');
            expect(container.querySelector('.ProseMirror')?.textContent).toContain('Task 2 summary');
        });

        expect(onTabChange).toHaveBeenCalledWith('taskSummary');
    });

    it('reloads the active tab when incoming feedback changes for the same task', async () => {
        const { container, rerender } = render(
            <TabbedFeedbackEditor
                taskNumber={1}
                feedback={buildFeedback('Draft A')}
                onChange={vi.fn()}
            />,
        );

        fireEvent.click(container.querySelector('#feedback-tab-ta') as Element);

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror')?.textContent).toContain('Draft A task response');
        });

        rerender(
            <TabbedFeedbackEditor
                taskNumber={1}
                feedback={buildFeedback('Draft B')}
                onChange={vi.fn()}
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('.feedback-tab.active')?.textContent).toBe('TA');
            expect(container.querySelector('.ProseMirror')?.textContent).toContain('Draft B task response');
        });
    });

    it('renders the feedback toolbar and reports toolbar actions', () => {
        const onEditorAction = vi.fn();
        const { container } = render(
            <TabbedFeedbackEditor
                taskNumber={1}
                feedback={buildFeedback('Draft')}
                onChange={vi.fn()}
                onEditorAction={onEditorAction}
            />,
        );

        expect(container.querySelector('#feedback-toolbar')).toBeTruthy();
        const bulletButton = container.querySelector('[title="Bullet List"]') as HTMLButtonElement;
        expect(bulletButton).toBeTruthy();

        fireEvent.mouseDown(bulletButton);
        fireEvent.click(bulletButton);

        expect(onEditorAction).toHaveBeenCalledWith('bulletList', 'taskSummary');
    });

    it('uses edit-mode workspace placeholder copy for each tab', async () => {
        const { container } = render(
            <TabbedFeedbackEditor
                taskNumber={2}
                feedback={buildFeedback('Draft')}
                onChange={vi.fn()}
            />,
        );

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror')?.getAttribute('data-placeholder-text'))
                .toBe('Type detailed feedback for the Task Summary here...');
        });

        fireEvent.click(container.querySelector('#feedback-tab-ta') as Element);

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror')?.getAttribute('data-placeholder-text'))
                .toBe('Type detailed feedback for the TR here...');
        });
    });

    it('preserves incoming list markup with the live toolbar restored', async () => {
        const feedback = buildFeedback('List draft');
        feedback.taskSummary = '<ul><li>List draft summary</li></ul>';

        const { container } = render(
            <ControlledTabbedFeedbackEditor initialFeedback={feedback} />,
        );

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror ul li')).toBeTruthy();
            expect(container.querySelector('.ProseMirror ul li')?.textContent).toContain('List draft summary');
        });
    });

    it('keeps the task summary tab active when its pill is clicked again', async () => {
        render(
            <TabbedFeedbackEditor
                taskNumber={1}
                feedback={buildFeedback('Draft')}
                onChange={vi.fn()}
            />,
        );

        const summaryTab = document.querySelector('#feedback-tab-taskSummary') as HTMLButtonElement;
        fireEvent.click(summaryTab);

        await waitFor(() => {
            expect(summaryTab).toHaveClass('active');
        });
    });
});
