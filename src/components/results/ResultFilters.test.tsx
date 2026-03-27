import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultFilters } from './ResultFilters';

vi.mock('../modern', () => ({
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardBody: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

describe('ResultFilters', () => {
    it('derives test type and skill options from the classified results provided by the parent', () => {
        render(
            <ResultFilters
                filters={{ scoreMin: 0, scoreMax: 100 }}
                results={[
                    { testType: 'course_material', testSkill: 'grammar' },
                    { testType: 'homework', testSkill: 'reading' },
                    { testType: 'course_material', testSkill: 'reading' },
                ]}
                onChange={vi.fn()}
                onClear={vi.fn()}
            />,
        );

        const testTypeSelect = screen.getByLabelText('Test Type');
        const skillSelect = screen.getByLabelText('Skill');

        expect(within(testTypeSelect).getAllByRole('option').map((option) => option.textContent)).toEqual([
            'All Types',
            'Course Material',
            'Homework',
        ]);
        expect(within(skillSelect).getAllByRole('option').map((option) => option.textContent)).toEqual([
            'All Skills',
            'Grammar',
            'Reading',
        ]);
    });

    it('emits selected dynamic options and preserves the clear action', () => {
        const onChange = vi.fn();
        const onClear = vi.fn();

        render(
            <ResultFilters
                filters={{ scoreMin: 0, scoreMax: 100 }}
                results={[
                    { testType: 'solo_practice', testSkill: 'writing' },
                    { testType: 'homework', testSkill: 'reading' },
                ]}
                onChange={onChange}
                onClear={onClear}
            />,
        );

        fireEvent.change(screen.getByLabelText('Test Type'), {
            target: { value: 'solo_practice' },
        });
        fireEvent.change(screen.getByLabelText('Skill'), {
            target: { value: 'writing' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));

        expect(onChange).toHaveBeenNthCalledWith(1, {
            scoreMin: 0,
            scoreMax: 100,
            testType: 'solo_practice',
        });
        expect(onChange).toHaveBeenNthCalledWith(2, {
            scoreMin: 0,
            scoreMax: 100,
            skill: 'writing',
        });
        expect(onClear).toHaveBeenCalledTimes(1);
    });
});
