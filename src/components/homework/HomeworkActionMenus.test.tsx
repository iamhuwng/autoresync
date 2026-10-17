import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../../types/homework.types';
import { KebabActionMenu } from './KebabActionMenu';
import StudentActionMenu from './StudentActionMenu';

const noop = vi.fn();

function makeHomework(): HomeworkAssignment {
    return {
        id: 'homework-1',
        createdBy: 'teacher-1',
        createdAt: 1,
        updatedAt: 1,
        materialId: 'material-1',
        materialTitle: 'Homework one',
        materialType: 'reading',
        target: {
            type: 'students',
            studentIds: ['student-1'],
            studentNames: ['Student One'],
        },
        scheduling: {
            availableFrom: 1,
            dueDate: 2,
        },
        config: {
            timerMinutes: null,
            maxAttempts: 1,
            feedbackTiming: 'after_completion',
            lateSubmissionAllowed: false,
        },
        visibility: {
            showAttempts: true,
            showDueDate: true,
            showDuration: true,
            showQuestionCount: true,
            showTimer: true,
        },
        status: 'active',
        stats: {
            totalAssigned: 1,
            started: 0,
            submitted: 0,
            lateSubmissions: 0,
        },
    };
}

describe('Homework action menu overflow safety', () => {
    it('renders the homework kebab dropdown outside clipping card ancestors', () => {
        render(
            <div data-testid="clip-parent" style={{ overflow: 'hidden' }}>
                <KebabActionMenu
                    homework={makeHomework()}
                    onEdit={noop}
                    onDuplicate={noop}
                    onDelete={noop}
                    onExtendDeadline={noop}
                />
            </div>,
        );

        fireEvent.click(screen.getByTitle('More actions'));

        const dropdown = document.querySelector('.kebab-menu__dropdown');
        expect(dropdown).not.toBeNull();
        expect(dropdown?.parentElement).toBe(document.body);
    });

    it('renders the student actions dropdown outside scroll-container ancestors', () => {
        render(
            <div data-testid="scroll-parent" style={{ overflowX: 'auto' }}>
                <StudentActionMenu
                    studentName="Student One"
                    hasSubmitted={false}
                    isExempted={false}
                    reminderCount={0}
                    lastRemindedAt={null}
                    onExtendDeadline={noop}
                    onExempt={noop}
                    onAddNote={noop}
                    onSendReminder={noop}
                />
            </div>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Actions for Student One' }));

        const dropdown = document.querySelector('.action-menu-dropdown');
        expect(dropdown).not.toBeNull();
        expect(dropdown?.parentElement).toBe(document.body);
    });
});
