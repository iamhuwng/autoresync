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

    it('keeps bullet list markup after the parent re-renders with controlled feedback state', async () => {
        const { container } = render(
            <ControlledTabbedFeedbackEditor initialFeedback={buildFeedback('List draft')} />,
        );

        const bulletButton = container.querySelector('[title="Bullet List"]') as HTMLButtonElement;
        fireEvent.mouseDown(bulletButton);
        fireEvent.click(bulletButton);

        await waitFor(() => {
            expect(container.querySelector('.ProseMirror ul li')).toBeTruthy();
            expect(container.querySelector('.ProseMirror ul li')?.textContent).toContain('List draft summary');
        });
    });
});
