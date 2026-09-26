import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { THCSSection } from '../../types/thcs-test.types';
import THCSAnswerKeyStep from './THCSAnswerKeyStep';

vi.mock('./THCSAnswerKeyPanel', () => ({ default: () => null }));
vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: vi.fn() }) }));
vi.mock('../modern/ToastNotification', () => ({ toast: { success: vi.fn() } }));

beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
});

it('opens bulk answers in the top layer and applies matched keys across sections', () => {
    const onUpdateAnswer = vi.fn();
    const sections = [
        { questions: [{ type: 'mcq-grammar', questionNumber: 1, correctAnswer: '' }] },
        { questions: [{ type: 'mcq-grammar', questionNumber: 2, correctAnswer: '' }] },
    ] as THCSSection[];
    render(<THCSAnswerKeyStep sections={sections} onUpdateAnswer={onUpdateAnswer}
        onUpdateFillInAnswers={vi.fn()} onUpdateModelAnswers={vi.fn()} onUpdateClozeMapping={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Bulk Input/ }));
    expect(screen.getByRole('dialog', { name: 'Bulk Answer Key Input' })).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer key' }), { target: { value: '1.A 2.B 99.C' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply 2 Answers' }));
    expect(onUpdateAnswer.mock.calls).toEqual([[0, 0, 'A'], [1, 0, 'B']]);
    expect(screen.queryByRole('dialog', { name: 'Bulk Answer Key Input' })).not.toBeInTheDocument();
});
