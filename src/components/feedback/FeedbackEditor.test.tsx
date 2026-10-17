import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FeedbackEditor } from './FeedbackEditor';
import { toast } from '../modern/ToastNotification';

it('announces only completed saves and preserves feedback after a rejected save', async () => {
    const success = vi.spyOn(toast, 'success');
    const failure = vi.spyOn(toast, 'error');
    let completeSave: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { completeSave = resolve; }))
        .mockRejectedValueOnce(new Error('Permission denied'));
    render(<FeedbackEditor isOverall onSave={save} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First feedback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Feedback' }));
    expect(success).not.toHaveBeenCalled();
    completeSave!();
    await waitFor(() => expect(success).toHaveBeenCalledWith('Overall feedback saved.'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Retry feedback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Feedback' }));
    await waitFor(() => expect(failure).toHaveBeenCalledWith('Could not save feedback: Permission denied'));
    expect(screen.getByRole('textbox')).toHaveValue('Retry feedback');
    expect(screen.getByRole('button', { name: 'Save Feedback' })).toBeEnabled();
    expect(success).toHaveBeenCalledTimes(1);
});
