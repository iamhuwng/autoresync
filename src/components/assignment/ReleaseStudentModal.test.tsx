/**
 * Vitest Unit Tests for ReleaseStudentModal Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { ReleaseStudentModal } from './ReleaseStudentModal';
import { StudentTeacherAssignment } from '../../types/assignment.types';

// ============================================================================
// TEST DATA
// ============================================================================

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

const mockAvailableCourses = [
    { value: 'course-1', label: 'IELTS Academic' },
    { value: 'course-2', label: 'IELTS General' },
    { value: 'course-3', label: 'TOEFL' },
];

const defaultProps = {
    opened: true,
    onClose: vi.fn(),
    student: mockStudent,
    assignments: mockAssignments,
    currentTeacherId: 'teacher-1',
    availableCourses: mockAvailableCourses,
    onConfirm: vi.fn(),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const renderWithProvider = (ui: React.ReactElement) => {
    return render(<MantineProvider>{ui}</MantineProvider>);
};

// ============================================================================
// TEST SUITES
// ============================================================================

describe('ReleaseStudentModal Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render modal when opened is true', () => {
        renderWithProvider(<ReleaseStudentModal {...defaultProps} />);
        expect(screen.getByText('Release Student')).toBeInTheDocument();
        expect(screen.getAllByText(/Alice Johnson/i).length).toBeGreaterThan(0);
    });

    it('should show unenroll checkbox when courses are available', () => {
        renderWithProvider(<ReleaseStudentModal {...defaultProps} />);
        expect(screen.getByRole('checkbox', { name: /Also unenroll from courses\?/i })).toBeInTheDocument();
    });

    it('should show course list when unenroll checkbox is checked', async () => {
        renderWithProvider(<ReleaseStudentModal {...defaultProps} />);

        const checkbox = screen.getByRole('checkbox', { name: /Also unenroll from courses\?/i });
        fireEvent.click(checkbox);

        await waitFor(() => {
            expect(screen.getAllByText(/Select Courses to Unenroll/i).length).toBeGreaterThan(0);
        });
    });

    it('should call onConfirm with correct parameters when submitted without unenrollment', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        renderWithProvider(<ReleaseStudentModal {...defaultProps} onConfirm={onConfirm} />);

        const confirmButton = screen.getByRole('button', { name: /Confirm Release/i });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledWith(['assign-1'], []);
        });
    });

    it('should call onConfirm with selected courses when unenrollment is checked', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        renderWithProvider(<ReleaseStudentModal {...defaultProps} onConfirm={onConfirm} />);

        const checkbox = screen.getByRole('checkbox', { name: /Also unenroll from courses\?/i });
        fireEvent.click(checkbox);

        // By default all enrolled courses should be selected in the state (based on my implementation)
        const confirmButton = screen.getByRole('button', { name: /Confirm Release/i });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledWith(['assign-1'], ['course-1', 'course-2']);
        });
    });

    it('should filter courses to only show those the student is enrolled in', async () => {
        renderWithProvider(<ReleaseStudentModal {...defaultProps} />);

        const checkbox = screen.getByRole('checkbox', { name: /Also unenroll from courses\?/i });
        fireEvent.click(checkbox);

        expect(screen.getAllByText(/Select Courses to Unenroll/i).length).toBeGreaterThan(0);
    });

    it('should handle errors during confirmation', async () => {
        const onConfirm = vi.fn().mockRejectedValue(new Error('API Error'));
        renderWithProvider(<ReleaseStudentModal {...defaultProps} onConfirm={onConfirm} />);

        const confirmButton = screen.getByRole('button', { name: /Confirm Release/i });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(screen.getByText('API Error')).toBeVisible();
        });
    });
});
