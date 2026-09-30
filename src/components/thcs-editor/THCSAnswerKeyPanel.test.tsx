import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { THCSSection } from '../../types/thcs-test.types';
import THCSAnswerKeyPanel from './THCSAnswerKeyPanel';

it('shows the actual answer grid immediately and updates the selected question', () => {
    const onUpdateAnswer = vi.fn();
    const sections = [{ questions: [{ id: 'q1', type: 'mcq-grammar', questionNumber: 1, correctAnswer: '' }] }] as THCSSection[];
    render(<THCSAnswerKeyPanel sections={sections} onUpdateAnswer={onUpdateAnswer} />);
    const answer = screen.getByRole('radio', { name: 'Question 1: B' });
    expect(answer).toBeVisible();
    expect(screen.queryByRole('button', { name: /Answer Key/ })).not.toBeInTheDocument();
    fireEvent.click(answer);
    expect(onUpdateAnswer).toHaveBeenCalledWith(0, 0, 'B');
});


it('edits fill-in, writing and cloze answers with native controls without a provider', () => {
    const onUpdateFillInAnswers = vi.fn();
    const onUpdateModelAnswers = vi.fn();
    const onUpdateClozeMapping = vi.fn();
    const sections = [{ questions: [
        { id: 'fill', type: 'verb-form', questionNumber: 2, blankAnswers: [{ acceptedAnswers: [] }] },
        { id: 'writing', type: 'sentence-rewrite', questionNumber: 3, modelAnswers: [] },
        { id: 'cloze', type: 'reading-cloze-wordbank', questionNumber: 4,
            passageTemplate: '___(1)___', wordBank: ['cat', 'dog'], blankMapping: {} },
    ] }] as THCSSection[];
    render(<THCSAnswerKeyPanel sections={sections} onUpdateAnswer={vi.fn()}
        onUpdateFillInAnswers={onUpdateFillInAnswers} onUpdateModelAnswers={onUpdateModelAnswers}
        onUpdateClozeMapping={onUpdateClozeMapping} />);
    const fill = screen.getByRole('textbox', { name: 'Accepted answer for blank 1' });
    fireEvent.change(fill, { target: { value: 'went' } });
    fireEvent.keyDown(fill, { key: 'Enter' });
    expect(onUpdateFillInAnswers).toHaveBeenCalledWith(0, 0, 0, ['went']);
    const writing = screen.getByRole('textbox', { name: 'Model answer' });
    fireEvent.change(writing, { target: { value: 'He went home.' } });
    fireEvent.keyDown(writing, { key: 'Enter' });
    expect(onUpdateModelAnswers).toHaveBeenCalledWith(0, 1, ['He went home.']);
    const cloze = screen.getByRole('combobox', { name: 'Word for blank 1' });
    fireEvent.change(cloze, { target: { value: 'cat' } });
    expect(onUpdateClozeMapping).toHaveBeenCalledWith(0, 2, 1, 'cat');
    fireEvent.change(cloze, { target: { value: '' } });
    expect(onUpdateClozeMapping).toHaveBeenLastCalledWith(0, 2, 1, '');
});
