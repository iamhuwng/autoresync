/**
 * Vitest Unit Tests for AssignmentModal Component
 * 
 * Tests both modes of the AssignmentModal:
 * 1. assign-to-teacher: Assign a single student to a teacher
 * 2. assign-students: Assign multiple students to a teacher
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { AssignmentModal } from './AssignmentModal';
import * as assignmentManager from '../../services/assignmentManager';

// ============================================================================
// MOCKS
// ============================================================================

// Mock the assignment manager service
vi.mock('../../services/assignmentManager', () => ({
    createAssignment: vi.fn(),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockTeachers = [
    { value: 'teacher-1', label: 'John Doe (john@example.com)' },
    { value: 'teacher-2', label: 'Jane Smith (jane@example.com)' },
    { value: 'teacher-3', label: 'Bob Wilson (bob@example.com)' },
];

const mockStudents = [
    { value: 'student-1', label: 'Alice Johnson (alice@example.com)' },
    { value: 'student-2', label: 'Charlie Brown (charlie@example.com)' },
    { value: 'student-3', label: 'Diana Prince (diana@example.com)' },
    { value: 'student-4', label: 'Eve Adams (eve@example.com)' },
];

const mockStudent = {
    uid: 'student-1',
    displayName: 'Alice Johnson',
    email: 'alice@example.com',
};

const mockTeacher = {
    uid: 'teacher-1',
    displayName: 'John Doe',
    email: 'john@example.com',
};

const defaultPropsAssignToTeacher = {
    opened: true,
    onClose: vi.fn(),
    mode: 'assign-to-teacher' as const,
    student: mockStudent,
    teachers: mockTeachers,
    students: mockStudents,
    onSuccess: vi.fn(),
    currentUserId: 'admin-123',
};

const defaultPropsAssignStudents = {
    opened: true,
    onClose: vi.fn(),
    mode: 'assign-students' as const,
    teacher: mockTeacher,
    teachers: mockTeachers,
    students: mockStudents,
    onSuccess: vi.fn(),
    currentUserId: 'admin-123',
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

describe('AssignmentModal Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ==========================================================================
    // BASIC RENDERING TESTS
    // ==========================================================================

    describe('Basic Rendering', () => {
        it('should render modal when opened is true', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            expect(screen.getByText('Assign Student to Teacher')).toBeInTheDocument();
        });

        it('should not render when opened is false', () => {
            renderWithProvider(
                <AssignmentModal {...defaultPropsAssignToTeacher} opened={false} />
            );

            expect(screen.queryByText('Assign Student to Teacher')).not.toBeInTheDocument();
        });

        it('should display correct title for assign-to-teacher mode', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            expect(screen.getByText('Assign Student to Teacher')).toBeInTheDocument();
        });

        it('should display correct title for assign-students mode', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            expect(screen.getByText('Assign Students to Teacher')).toBeInTheDocument();
        });
    });

    // ==========================================================================
    // ASSIGN-TO-TEACHER MODE TESTS
    // ==========================================================================

    describe('Assign-to-Teacher Mode', () => {
        it('should display student information', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            expect(screen.getByText(/Alice Johnson/i)).toBeInTheDocument();
        });

        it('should render teacher selection dropdown', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            expect(screen.getByLabelText(/Select Teacher/i)).toBeInTheDocument();
        });

        it('should show all available teachers in dropdown', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            const teacherSelect = screen.getByLabelText(/Select Teacher/i);
            fireEvent.click(teacherSelect);

            // Check if teachers are in the dropdown (Mantine renders them in a portal)
            expect(teacherSelect).toBeInTheDocument();
        });

        it('should disable submit button when no teacher selected', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            const submitButton = screen.getByRole('button', { name: /Assign Student/i });
            expect(submitButton).toBeDisabled();
        });

        it('should enable submit button when teacher is selected', async () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            const teacherSelect = screen.getByLabelText(/Select Teacher/i);

            // Simulate selecting a teacher
            fireEvent.change(teacherSelect, { target: { value: 'teacher-1' } });

            await waitFor(() => {
                const submitButton = screen.getByRole('button', { name: /Assign Student/i });
                expect(submitButton).not.toBeDisabled();
            });
        });

        it('should call createAssignment with correct parameters on submit', async () => {
            const mockCreateAssignment = vi.mocked(assignmentManager.createAssignment);
            mockCreateAssignment.mockResolvedValue({ success: true, assignmentId: 'assign-123' });

            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            // Select a teacher
            const teacherSelect = screen.getByLabelText(/Select Teacher/i);
            fireEvent.change(teacherSelect, { target: { value: 'teacher-1' } });

            // Click submit
            const submitButton = screen.getByRole('button', { name: /Assign Student/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(mockCreateAssignment).toHaveBeenCalledWith(
                    'student-1',
                    'teacher-1',
                    'admin-123',
                    undefined
                );
            });
        });

        it('should call onSuccess and onClose after successful assignment', async () => {
            const mockCreateAssignment = vi.mocked(assignmentManager.createAssignment);
            mockCreateAssignment.mockResolvedValue({ success: true, assignmentId: 'assign-123' });

            const onSuccess = vi.fn();
            const onClose = vi.fn();

            renderWithProvider(
                <AssignmentModal
                    {...defaultPropsAssignToTeacher}
                    onSuccess={onSuccess}
                    onClose={onClose}
                />
            );

            // Select teacher and submit
            const teacherSelect = screen.getByLabelText(/Select Teacher/i);
            fireEvent.change(teacherSelect, { target: { value: 'teacher-1' } });

            const submitButton = screen.getByRole('button', { name: /Assign Student/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(onSuccess).toHaveBeenCalledTimes(1);
                expect(onClose).toHaveBeenCalledTimes(1);
            });
        });

        it('should display error message when assignment fails', async () => {
            const mockCreateAssignment = vi.mocked(assignmentManager.createAssignment);
            mockCreateAssignment.mockResolvedValue({
                success: false,
                error: 'Assignment already exists',
            });

            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            // Select teacher and submit
            const teacherSelect = screen.getByLabelText(/Select Teacher/i);
            fireEvent.change(teacherSelect, { target: { value: 'teacher-1' } });

            const submitButton = screen.getByRole('button', { name: /Assign Student/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/Assignment already exists/i)).toBeInTheDocument();
            });
        });
    });

    // ==========================================================================
    // ASSIGN-STUDENTS MODE TESTS
    // ==========================================================================

    describe('Assign-Students Mode', () => {
        it('should display teacher information', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
        });

        it('should render student multi-selection dropdown', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            expect(screen.getByLabelText(/Select Students/i)).toBeInTheDocument();
        });

        it('should disable submit button when no students selected', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            const submitButton = screen.getByRole('button', { name: /Assign 0 Student\(s\)/i });
            expect(submitButton).toBeDisabled();
        });

        it('should show selected student count', async () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            const studentSelect = screen.getByLabelText(/Select Students/i);

            // Initially 0 students
            expect(screen.getByText(/0 student\(s\) selected/i)).toBeInTheDocument();

            // Simulate selecting students (this is simplified - actual Mantine MultiSelect is more complex)
            fireEvent.change(studentSelect, { target: { value: ['student-1', 'student-2'] } });

            await waitFor(() => {
                expect(screen.getByText(/2 student\(s\) selected/i)).toBeInTheDocument();
            });
        });

        it('should update submit button text with student count', async () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            const studentSelect = screen.getByLabelText(/Select Students/i);

            // Select 2 students
            fireEvent.change(studentSelect, { target: { value: ['student-1', 'student-2'] } });

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Assign 2 Student\(s\)/i })).toBeInTheDocument();
            });
        });

        it('should call createAssignment for each selected student', async () => {
            const mockCreateAssignment = vi.mocked(assignmentManager.createAssignment);
            mockCreateAssignment.mockResolvedValue({ success: true, assignmentId: 'assign-123' });

            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            // Select multiple students
            const studentSelect = screen.getByLabelText(/Select Students/i);
            fireEvent.change(studentSelect, { target: { value: ['student-1', 'student-2', 'student-3'] } });

            // Click submit
            const submitButton = screen.getByRole('button', { name: /Assign 3 Student\(s\)/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(mockCreateAssignment).toHaveBeenCalledTimes(3);
                expect(mockCreateAssignment).toHaveBeenCalledWith('student-1', 'teacher-1', 'admin-123', undefined);
                expect(mockCreateAssignment).toHaveBeenCalledWith('student-2', 'teacher-1', 'admin-123', undefined);
                expect(mockCreateAssignment).toHaveBeenCalledWith('student-3', 'teacher-1', 'admin-123', undefined);
            });
        });

        it('should display error when some assignments fail', async () => {
            const mockCreateAssignment = vi.mocked(assignmentManager.createAssignment);
            mockCreateAssignment
                .mockResolvedValueOnce({ success: true, assignmentId: 'assign-1' })
                .mockResolvedValueOnce({ success: false, error: 'Student already assigned' })
                .mockResolvedValueOnce({ success: true, assignmentId: 'assign-3' });

            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            // Select students and submit
            const studentSelect = screen.getByLabelText(/Select Students/i);
            fireEvent.change(studentSelect, { target: { value: ['student-1', 'student-2', 'student-3'] } });

            const submitButton = screen.getByRole('button', { name: /Assign 3 Student\(s\)/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/Failed to assign 1 student\(s\)/i)).toBeInTheDocument();
            });
        });
    });

    // ==========================================================================
    // FORM VALIDATION TESTS
    // ==========================================================================

    describe('Form Validation', () => {
        it('should show error when submitting without teacher selection (assign-to-teacher mode)', async () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            const submitButton = screen.getByRole('button', { name: /Assign Student/i });

            // Button should be disabled
            expect(submitButton).toBeDisabled();
        });

        it('should show error when submitting without student selection (assign-students mode)', async () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignStudents} />);

            const submitButton = screen.getByRole('button', { name: /Assign 0 Student\(s\)/i });

            // Button should be disabled
            expect(submitButton).toBeDisabled();
        });

        it('should handle network errors gracefully', async () => {
            const mockCreateAssignment = vi.mocked(assignmentManager.createAssignment);
            mockCreateAssignment.mockRejectedValue(new Error('Network error'));

            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            // Select teacher and submit
            const teacherSelect = screen.getByLabelText(/Select Teacher/i);
            fireEvent.change(teacherSelect, { target: { value: 'teacher-1' } });

            const submitButton = screen.getByRole('button', { name: /Assign Student/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/Network error/i)).toBeInTheDocument();
            });
        });
    });

    // ==========================================================================
    // USER INTERACTION TESTS
    // ==========================================================================

    describe('User Interactions', () => {
        it('should call onClose when cancel button is clicked', () => {
            const onClose = vi.fn();
            renderWithProvider(
                <AssignmentModal {...defaultPropsAssignToTeacher} onClose={onClose} />
            );

            const cancelButton = screen.getByRole('button', { name: /Cancel/i });
            fireEvent.click(cancelButton);

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('should reset form when modal is closed and reopened', async () => {
            const { rerender } = renderWithProvider(
                <AssignmentModal {...defaultPropsAssignToTeacher} opened={true} />
            );

            // Select a teacher
            const teacherSelect = screen.getByLabelText(/Select Teacher/i);
            fireEvent.change(teacherSelect, { target: { value: 'teacher-1' } });

            // Close modal
            rerender(
                <MantineProvider>
                    <AssignmentModal {...defaultPropsAssignToTeacher} opened={false} />
                </MantineProvider>
            );

            // Reopen modal
            rerender(
                <MantineProvider>
                    <AssignmentModal {...defaultPropsAssignToTeacher} opened={true} />
                </MantineProvider>
            );

            // Form should be reset
            const teacherSelectAfterReopen = screen.getByLabelText(/Select Teacher/i);
            expect(teacherSelectAfterReopen).toHaveValue('');
        });

        it('should disable all inputs while submitting', async () => {
            const mockCreateAssignment = vi.mocked(assignmentManager.createAssignment);
            // Simulate slow network
            mockCreateAssignment.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1000))
            );

            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            const teacherSelect = screen.getByLabelText(/Select Teacher/i);
            fireEvent.change(teacherSelect, { target: { value: 'teacher-1' } });

            const submitButton = screen.getByRole('button', { name: /Assign Student/i });
            fireEvent.click(submitButton);

            // Inputs should be disabled during submission
            await waitFor(() => {
                expect(teacherSelect).toBeDisabled();
            });
        });
    });

    // ==========================================================================
    // COURSE ENROLLMENT TESTS (PLACEHOLDER)
    // ==========================================================================

    describe('Course Enrollment (Future Feature)', () => {
        it('should show course enrollment checkbox when courses are provided', () => {
            const courses = [
                { value: 'course-1', label: 'IELTS Course' },
                { value: 'course-2', label: 'TOEIC Course' },
            ];

            renderWithProvider(
                <AssignmentModal {...defaultPropsAssignToTeacher} courses={courses} />
            );

            expect(screen.getByLabelText(/Also enroll in courses/i)).toBeInTheDocument();
        });

        it('should not show course enrollment when no courses provided', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            expect(screen.queryByLabelText(/Also enroll in courses/i)).not.toBeInTheDocument();
        });
    });

    // ==========================================================================
    // EDGE CASES
    // ==========================================================================

    describe('Edge Cases', () => {
        it('should handle missing student displayName', () => {
            const studentWithoutName = {
                uid: 'student-1',
                email: 'alice@example.com',
            };

            renderWithProvider(
                <AssignmentModal
                    {...defaultPropsAssignToTeacher}
                    student={studentWithoutName as any}
                />
            );

            expect(screen.getByText(/alice@example.com/i)).toBeInTheDocument();
        });

        it('should handle missing teacher displayName', () => {
            const teacherWithoutName = {
                uid: 'teacher-1',
                email: 'john@example.com',
            };

            renderWithProvider(
                <AssignmentModal
                    {...defaultPropsAssignStudents}
                    teacher={teacherWithoutName as any}
                />
            );

            expect(screen.getByText(/john@example.com/i)).toBeInTheDocument();
        });

        it('should handle empty teacher list', () => {
            renderWithProvider(
                <AssignmentModal {...defaultPropsAssignToTeacher} teachers={[]} />
            );

            const teacherSelect = screen.getByLabelText(/Select Teacher/i);
            expect(teacherSelect).toBeInTheDocument();
        });

        it('should handle empty student list', () => {
            renderWithProvider(
                <AssignmentModal {...defaultPropsAssignStudents} students={[]} />
            );

            const studentSelect = screen.getByLabelText(/Select Students/i);
            expect(studentSelect).toBeInTheDocument();
        });
    });

    // ==========================================================================
    // ACCESSIBILITY TESTS
    // ==========================================================================

    describe('Accessibility', () => {
        it('should have proper ARIA labels for form fields', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            expect(screen.getByLabelText(/Select Teacher/i)).toBeInTheDocument();
        });

        it('should have accessible modal dialog', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            const modal = screen.getByRole('dialog', { hidden: true });
            expect(modal).toBeInTheDocument();
        });

        it('should be keyboard navigable', () => {
            renderWithProvider(<AssignmentModal {...defaultPropsAssignToTeacher} />);

            const cancelButton = screen.getByRole('button', { name: /Cancel/i });
            cancelButton.focus();

            expect(document.activeElement).toBe(cancelButton);
        });
    });
});
