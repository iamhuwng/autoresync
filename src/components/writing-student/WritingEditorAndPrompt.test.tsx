import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WritingEditor from './WritingEditor';
import WritingPromptPanel from './WritingPromptPanel';
import SubmitToTeacherModal from '../writing-practice/SubmitToTeacherModal';

describe('WritingEditor, WritingPromptPanel, and SubmitToTeacherModal', () => {
    it('tracks word minimum status accurately for Task 2 (250 words) instead of hardcoded 150', () => {
        const text160 = Array(160).fill('essay').join(' ');
        const { rerender } = render(
            <WritingEditor
                value={text160}
                onChange={vi.fn()}
                disabled={false}
                wordMinimum={250}
                taskNumber={2}
            />,
        );

        expect(screen.getByLabelText('Task 2 essay editor')).toBeInTheDocument();
        const counter = screen.getByText(/160 words/i).closest('.wtp-word-count');
        expect(counter).toHaveClass('wtp-word-count--low');
        expect(counter).toHaveTextContent('/ 250 min');

        const text260 = Array(260).fill('essay').join(' ');
        rerender(
            <WritingEditor
                value={text260}
                onChange={vi.fn()}
                disabled={false}
                wordMinimum={250}
                taskNumber={2}
            />,
        );
        expect(screen.getByText(/260 words/i).closest('.wtp-word-count')).toHaveClass('wtp-word-count--met');
    });

    it('defaults Task 2 recommended time to 40 minutes, handles missing task, and opens image lightbox', () => {
        const { rerender } = render(<WritingPromptPanel task={undefined} taskNumber={2} />);
        expect(screen.getByText(/prompt unavailable for task 2/i)).toBeInTheDocument();

        rerender(
            <WritingPromptPanel
                taskNumber={2}
                task={{
                    taskNumber: 2,
                    taskType: 'opinion',
                    promptText: 'Write an essay about renewable energy.',
                    promptImageUrl: 'https://example.com/chart.png',
                    promptImageCaption: 'Global energy mix',
                    wordMinimum: 250,
                    recommendedTimeMinutes: 0,
                    showModelAnswerToStudent: false,
                }}
            />,
        );

        expect(screen.getByText(/spend about 40 minutes/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /zoom task image/i }));
        expect(screen.getByRole('button', { name: /close enlarged image/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /close enlarged image/i }));
        expect(screen.queryByRole('button', { name: /close enlarged image/i })).not.toBeInTheDocument();
    });

    it('respects custom wordMinimum per task in SubmitToTeacherModal', () => {
        render(
            <SubmitToTeacherModal
                isOpen={true}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
                studentTeachers={[{ id: 't1', name: 'Ms. Lan' }]}
                tasks={[{ taskNumber: 1, wordCount: 160, wordMinimum: 180 }]}
            />,
        );

        expect(screen.getByText('160 words (min 180)')).toBeInTheDocument();
    });
});
