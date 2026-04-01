import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StudentDashboardRightRail } from './StudentDashboardRightRail';

describe('StudentDashboardRightRail', () => {
    it('keeps the dashboard rail quiet when up-next items already provide actions', () => {
        render(
            <StudentDashboardRightRail
                upNextItems={[
                    {
                        id: 'item-1',
                        title: 'Writing Lesson 5',
                        meta: 'Homework',
                        summary: 'Reopen first.',
                        dueLabel: 'Overdue',
                        actionLabel: 'Open',
                        onClick: vi.fn(),
                    },
                ]}
                onOpenHomework={vi.fn()}
            />,
        );

        expect(screen.queryByText('Join a waiting or active class session from your current classes.')).not.toBeInTheDocument();
        expect(screen.queryByText('Open rooms the student can join immediately.')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Open Homework' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    });
});
