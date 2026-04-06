import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CriteriaScoringPanel from './CriteriaScoringPanel';

describe('CriteriaScoringPanel', () => {
    it('renders editing-mode scoring sliders with abbreviations and decimal score display', () => {
        const onChange = vi.fn();
        const { container } = render(
            <CriteriaScoringPanel
                taskNumber={2}
                scores={{ ta: 7, cc: 6, lr: 6, gra: 6 }}
                onChange={onChange}
            />,
        );

        expect(screen.getByLabelText('Task Response (TR)')).toBeInTheDocument();
        expect(screen.getByText('Task Response (TR)')).toBeInTheDocument();
        expect(screen.getByText('7.0')).toBeInTheDocument();
        expect(container.querySelectorAll('.criteria-scoring-panel__slider')).toHaveLength(4);
        expect(screen.queryByText('Task 2 Criteria')).toBeNull();
        expect(screen.queryByText('Band 6')).toBeNull();
    });

    it('updates criterion scores in 0.5 increments', () => {
        const onChange = vi.fn();
        render(
            <CriteriaScoringPanel
                taskNumber={1}
                scores={{ ta: null, cc: null, lr: null, gra: null }}
                onChange={onChange}
            />,
        );

        const taSlider = screen.getByLabelText('Task Achievement (TA)');
        fireEvent.change(taSlider, { target: { value: '6.5' } });

        expect(onChange).toHaveBeenCalledWith({
            ta: 6.5,
            cc: null,
            lr: null,
            gra: null,
        });
    });
});
