/**
 * Vitest Unit Tests for ReleaseStudentModal Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReleaseStudentModal } from './ReleaseStudentModal';
import { StudentTeacherAssignment } from '../../types/assignment.types';

const mockStudent = {
    uid: 'student-1',
    displayName: 'Alice Johnson',
    email: 'alice@example.com',
};

const mockAssignments: StudentTeacherAssignment[] = [
    {
        id: 'assign-1',
        studentId: 'student-1',
        teacherId: 'teacher-1',
        assignedBy: 'admin-1',
        assignedAt: Date.now(),
        unassignedAt: null,
        status: 'active',
        coursesEnrolled: ['course-1', 'course-2']
    }
];

const defaultProps = {
    opened: true,
    onClose: vi.fn(),
    student: mockStudent,
    assignments: mockAssignments,
    currentTeacherId: 'teacher-1',
    onConfirm: vi.fn(),
};

describe('ReleaseStudentModal Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders modal and clarifies that course enrollments are not automatically removed', () => {
        render(<ReleaseStudentModal {...defaultProps} />);
        expect(screen.getByText('Release Student')).toBeInTheDocument();
        expect(screen.getAllByText(/Alice Johnson/i).length).toBeGreaterThan(0);
        expect(
            screen.getByText(/does not automatically unenroll the student from courses/i)
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('checkbox', { name: /Also unenroll from courses\?/i })
        ).not.toBeInTheDocument();
    });

    it('calls onConfirm with relevant assignment IDs for the current teacher', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(<ReleaseStudentModal {...defaultProps} onConfirm={onConfirm} />);

        fireEvent.click(screen.getByRole('button', { name: /Confirm Release/i }));

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledWith(['assign-1']);
        });
    });

    it('warns admin when releasing a student with multiple active teacher assignments', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        const multiAssignments: StudentTeacherAssignment[] = [
            ...mockAssignments,
            {
                id: 'assign-2',
                studentId: 'student-1',
                teacherId: 'teacher-2',
                assignedBy: 'admin-1',
                assignedAt: Date.now(),
                unassignedAt: null,
                status: 'active',
                coursesEnrolled: [],
            },
        ];

        render(
            <ReleaseStudentModal
                {...defaultProps}
                currentTeacherId={null}
                assignments={multiAssignments}
                onConfirm={onConfirm}
            />
        );

        expect(screen.getByText(/assigned to 2 teachers/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Confirm Release/i }));

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledWith(['assign-1', 'assign-2']);
        });
    });

    it('handles errors during confirmation and keeps modal open', async () => {
        const onConfirm = vi.fn().mockRejectedValue(new Error('API Error'));
        render(<ReleaseStudentModal {...defaultProps} onConfirm={onConfirm} />);

        fireEvent.click(screen.getByRole('button', { name: /Confirm Release/i }));

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('API Error');
        });
        expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
});
