import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { THCSSection } from '../../types/thcs-test.types';
import THCSAnswerKeyStep from './THCSAnswerKeyStep';

vi.mock('./THCSAnswerKeyPanel', () => ({ default: () => null }));

it('counts only answerable questions and leaves correction to the teacher', () => {
    const sections = [{ questions: [
        { type: 'mcq-grammar', questionNumber: 1, correctAnswer: '' },
        { type: 'mcq-grammar', questionNumber: 2, correctAnswer: 'B' },
        { type: 'raw-text-fallback', questionNumber: 3, correctAnswer: '' },
    ] }] as THCSSection[];
    render(<THCSAnswerKeyStep sections={sections} onUpdateAnswer={vi.fn()}
        onUpdateFillInAnswers={vi.fn()} onUpdateModelAnswers={vi.fn()} onUpdateClozeMapping={vi.fn()} />);
    expect(screen.getByText('1/2 answers completed · 1 missing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Auto-fill/ })).not.toBeInTheDocument();
});
