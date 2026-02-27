/**
 * Vitest Integration Tests for AdminUserManagementPage Assignment Flows
 * 
 * Tests the integration between AdminUserManagementPage and AssignmentModal:
 * 1. Student-based flow: Click student → "Assign to Teacher" button → Modal opens
 * 2. Teacher-based flow: Click teacher → "Assign Students" button → Modal opens
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
import AdminUserManagementPage from './AdminUserManagementPage';
import * as userService from '../services/userService';
import * as assignmentManager from '../services/assignmentManager';
import * as invitationService from '../services/invitationService';
import * as classManager from '../services/classManager';
import * as courseManager from '../services/courseManager';

// ============================================================================
// MOCKS
// ============================================================================

// Mock the auth hook
vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'admin-123', email: 'admin@test.com' },
        profile: { role: 'super_admin', displayName: 'Admin User' },
        logout: vi.fn(),
    }),
}));

// Mock the navigation hook
vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: vi.fn(),
    }),
}));

// Mock user service
vi.mock('../services/userService', () => ({
    getAllUsers: vi.fn(),
    updateUserProfile: vi.fn(),
    deleteUserProfile: vi.fn(),
    toggleUserStatus: vi.fn(),
}));

// Mock assignment manager
vi.mock('../services/assignmentManager', () => ({
    getAssignmentsByTeacher: vi.fn(),
    getAssignmentsByStudent: vi.fn(),
    createAssignment: vi.fn(),
    removeAssignment: vi.fn(),
}));

// Mock invitation service
vi.mock('../services/invitationService', () => ({
    generateTeacherInvite: vi.fn(),
    getInvitationsByAdmin: vi.fn(),
    revokeInvitation: vi.fn(),
}));

// Mock class manager
vi.mock('../services/classManager', () => ({
    getClasses: vi.fn(),
    enrollStudent: vi.fn(),
}));

// Mock course manager
vi.mock('../services/courseManager', () => ({
    getAllCourses: vi.fn(),
    getCoursesByOwner: vi.fn(),
    getCourseTypes: vi.fn(),
    getPendingTypeRequests: vi.fn(),
    approveCourseType: vi.fn(),
    rejectCourseType: vi.fn(),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockStudents = [
    {
        uid: 'student-1',
        email: 'alice@test.com',
        displayName: 'Alice Johnson',
        role: 'student',
        status: 'active',
        studentGroup: 'Group A',
        lastLoginAt: Date.now(),
    },
    {
        uid: 'student-2',
        email: 'bob@test.com',
        displayName: 'Bob Smith',
        role: 'student',
        status: 'active',
        studentGroup: 'Group B',
        lastLoginAt: Date.now(),
    },
    {
        uid: 'student-3',
        email: 'charlie@test.com',
        displayName: 'Charlie Brown',
        role: 'student',
        status: 'active',
        studentGroup: null,
        lastLoginAt: Date.now(),
    },
];

const mockTeachers = [
    {
        uid: 'teacher-1',
        email: 'john@test.com',
        displayName: 'John Doe',
        role: 'teacher',
        status: 'active',
        lastLoginAt: Date.now(),
    },
    {
        uid: 'teacher-2',
        email: 'jane@test.com',
        displayName: 'Jane Smith',
        role: 'teacher',
        status: 'active',
        lastLoginAt: Date.now(),
    },
];

const mockAssignments = [
    {
        id: 'assign-1',
        studentId: 'student-1',
        teacherId: 'teacher-1',
        assignedBy: 'admin-123',
        assignedAt: Date.now(),
        status: 'active',
    },
];

const mockClasses = [
    { id: 'class-1', name: 'Class 101', classCode: 'C101' },
    { id: 'class-2', name: 'Class 102', classCode: 'C102' }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const renderWithProviders = (ui) => {
    return render(
        <BrowserRouter>
            <MantineProvider>{ui}</MantineProvider>
        </BrowserRouter>
    );
};

// ============================================================================
// TEST SUITES
// ============================================================================

describe('AdminUserManagementPage - Assignment Flows', () => {
    // ... existing beforeEach ...
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default mock implementations
        vi.mocked(userService.getAllUsers).mockResolvedValue([...mockStudents, ...mockTeachers]);
        vi.mocked(invitationService.getInvitationsByAdmin).mockResolvedValue([]);
        vi.mocked(assignmentManager.getAssignmentsByStudent).mockResolvedValue([]);
        vi.mocked(assignmentManager.getAssignmentsByTeacher).mockResolvedValue([]);

        // Mock new services
        vi.mocked(courseManager.getAllCourses).mockResolvedValue([]);
        vi.mocked(courseManager.getCoursesByOwner).mockResolvedValue([]);
        vi.mocked(classManager.getClasses).mockResolvedValue(mockClasses);
        vi.mocked(courseManager.getCourseTypes).mockResolvedValue([]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ==========================================================================
    // STUDENT-BASED ASSIGNMENT FLOW TESTS
    // ==========================================================================

    describe('Student-Based Assignment Flow (Task 2.5)', () => {
        it('should display "Assign to Teacher" button for students in Students tab', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            // Wait for users to load
            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Switch to Students tab (should be default, but let's be explicit)
            const studentsTab = screen.getByRole('tab', { name: /students/i });
            fireEvent.click(studentsTab);

            // Check if "Assign to Teacher" buttons are present
            const assignButtons = screen.getAllByLabelText(/Assign to Teacher/i);
            expect(assignButtons.length).toBeGreaterThan(0);
        });

        it('should open AssignmentModal in assign-to-teacher mode when clicking student assign button', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            // Wait for users to load
            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Find and click the "Assign to Teacher" button for Alice
            const assignButtons = screen.getAllByLabelText(/Assign to Teacher/i);
            fireEvent.click(assignButtons[0]);

            // Modal should open with correct title
            await waitFor(() => {
                expect(screen.getByText('Assign Student to Teacher')).toBeInTheDocument();
            });

            // Should display student information
            expect(screen.getAllByText(/Alice Johnson/i).length).toBeGreaterThan(0);
        });

        it('should pre-select the clicked student in the modal', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Click assign button for Alice
            const assignButtons = screen.getAllByLabelText(/Assign to Teacher/i);
            fireEvent.click(assignButtons[0]);

            // Wait for modal
            await waitFor(() => {
                expect(screen.getByText('Assign Student to Teacher')).toBeInTheDocument();
            });

            // Alice should be shown as the student being assigned
            const studentInfos = screen.getAllByText(/Alice Johnson/i);
            expect(studentInfos.length).toBeGreaterThan(0);
        });

        it('should close modal when cancel is clicked', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Open modal
            const assignButtons = screen.getAllByLabelText(/Assign to Teacher/i);
            fireEvent.click(assignButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Assign Student to Teacher')).toBeInTheDocument();
            });

            // Click cancel
            const cancelButton = screen.getByRole('button', { name: /Cancel/i });
            fireEvent.click(cancelButton);

            // Modal should close
            await waitFor(() => {
                expect(screen.queryByText('Assign Student to Teacher')).not.toBeInTheDocument();
            });
        });

        it('should not show "Assign to Teacher" button in Teachers tab', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Switch to Teachers tab
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            await waitFor(() => {
                expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
            });

            // "Assign to Teacher" buttons should not be present
            const assignToTeacherButtons = screen.queryAllByLabelText(/Assign to Teacher/i);
            expect(assignToTeacherButtons.length).toBe(0);
        });
    });

    // ==========================================================================
    // TEACHER-BASED ASSIGNMENT FLOW TESTS
    // ==========================================================================

    describe('Teacher-Based Assignment Flow (Task 2.6)', () => {
        it('should display "Assign Students" button for teachers in Teachers tab', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            // Wait for users to load
            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Switch to Teachers tab
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            await waitFor(() => {
                expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
            });

            // Check if "Assign Students" buttons are present
            const assignButtons = screen.getAllByLabelText(/Assign Students/i);
            expect(assignButtons.length).toBeGreaterThan(0);
        });

        it('should open AssignmentModal in assign-students mode when clicking teacher assign button', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Switch to Teachers tab
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            await waitFor(() => {
                expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
            });

            // Find and click the "Assign Students" button for John
            const assignButtons = screen.getAllByLabelText(/Assign Students/i);
            fireEvent.click(assignButtons[0]);

            // Modal should open with correct title
            await waitFor(() => {
                expect(screen.getByText('Assign Students to Teacher')).toBeInTheDocument();
            });

            // Should display teacher information
            expect(screen.getAllByText(/John Doe/i).length).toBeGreaterThan(0);
        });

        it('should pre-select the clicked teacher in the modal', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Switch to Teachers tab
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            // Click assign button for John
            const assignButtons = screen.getAllByLabelText(/Assign Students/i);
            fireEvent.click(assignButtons[0]);

            // Wait for modal
            await waitFor(() => {
                expect(screen.getByText('Assign Students to Teacher')).toBeInTheDocument();
            });

            // John should be shown as the teacher
            const teacherInfos = screen.getAllByText(/John Doe/i);
            expect(teacherInfos.length).toBeGreaterThan(0);
        });

        it('should not show "Assign Students" button in Students tab', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Should be in Students tab by default
            const studentsTab = screen.getByRole('tab', { name: /students/i });
            fireEvent.click(studentsTab);

            // "Assign Students" buttons should not be present
            const assignStudentsButtons = screen.queryAllByLabelText(/Assign Students/i);
            expect(assignStudentsButtons.length).toBe(0);
        });
    });

    // ==========================================================================
    // MODAL INTEGRATION TESTS
    // ==========================================================================

    describe('Modal Integration', () => {
        it('should populate teacher dropdown with all teachers', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Open modal for student
            const assignButtons = screen.getAllByLabelText(/Assign to Teacher/i);
            fireEvent.click(assignButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Assign Student to Teacher')).toBeInTheDocument();
            });

            // Teacher select should be present
            const teacherSelects = screen.getAllByLabelText(/Select Teacher/i);
            expect(teacherSelects.length).toBeGreaterThan(0);
        });

        it('should populate student multi-select with all students', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Switch to Teachers tab
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            // Open modal for teacher
            const assignButtons = screen.getAllByLabelText(/Assign Students/i);
            fireEvent.click(assignButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Assign Students to Teacher')).toBeInTheDocument();
            });

            // Student multi-select should be present
            const studentSelects = screen.getAllByLabelText(/Select Students/i);
            expect(studentSelects.length).toBeGreaterThan(0);
        });

        it('should reload users and assignments after successful assignment', async () => {
            const mockCreateAssignment = vi.mocked(assignmentManager.createAssignment);
            mockCreateAssignment.mockResolvedValue({ success: true, assignmentId: 'new-assign' });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Open modal
            const assignButtons = screen.getAllByLabelText(/Assign to Teacher/i);
            fireEvent.click(assignButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Assign Student to Teacher')).toBeInTheDocument();
            });

            // Select a teacher (simplified - actual Mantine interaction is more complex)
            const teacherSelects = screen.getAllByLabelText(/Select Teacher/i);
            fireEvent.change(teacherSelects[0], { target: { value: 'teacher-1' } });

            // Submit
            const submitButton = screen.getByRole('button', { name: /Assign Student/i });
            fireEvent.click(submitButton);

            // Should reload data
            await waitFor(() => {
                expect(userService.getAllUsers).toHaveBeenCalled();
                expect(assignmentManager.getAssignmentsByStudent).toHaveBeenCalled();
            });
        });
    });

    // ==========================================================================
    // ASSIGNMENT DISPLAY TESTS
    // ==========================================================================

    describe('Assignment Display', () => {
        it('should show assigned teacher names for students', async () => {
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockImplementation((studentId) => {
                if (studentId === 'student-1') return Promise.resolve(mockAssignments);
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Alice is assigned to teacher-1 (John Doe) in mockAssignments
            // Should display teacher name in "Assigned To" column
            await waitFor(() => {
                const teacherBadges = screen.getAllByText(/John Doe/i);
                expect(teacherBadges.length).toBeGreaterThan(0);
            });
        });

        it('should show "Unassigned" badge for students without assignments', async () => {
            // Mock no assignments for student-2
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockResolvedValue([]);

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Bob Smith')).toBeInTheDocument();
            });

            // Should show "Unassigned" badge
            const unassignedBadges = screen.getAllByText(/Unassigned/i);
            expect(unassignedBadges.length).toBeGreaterThan(0);
        });

        it('should show student count for teachers', async () => {
            vi.mocked(assignmentManager.getAssignmentsByTeacher).mockImplementation((teacherId) => {
                if (teacherId === 'teacher-1') return Promise.resolve(mockAssignments);
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Switch to Teachers tab
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            // Should show student count (1 student from mockAssignments)
            await waitFor(() => {
                expect(screen.getByText(/1 student/i)).toBeInTheDocument();
            });
        });
    });

    // ==========================================================================
    // EDGE CASES
    // ==========================================================================

    describe('Edge Cases', () => {
        it('should handle empty user list gracefully', async () => {
            vi.mocked(userService.getAllUsers).mockResolvedValue([]);

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText(/No users found/i)).toBeInTheDocument();
            });
        });

        it('should handle API errors when loading users', async () => {
            vi.mocked(userService.getAllUsers).mockRejectedValue(new Error('API Error'));

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText(/error/i)).toBeInTheDocument();
            });
        });

        it('should handle users without displayName', async () => {
            const usersWithoutNames = [
                {
                    uid: 'student-no-name',
                    email: 'noname@test.com',
                    role: 'student',
                    status: 'active',
                },
            ];

            vi.mocked(userService.getAllUsers).mockResolvedValue(usersWithoutNames);

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('noname@test.com')).toBeInTheDocument();
            });
        });
    });

    // ==========================================================================
    // ASSIGNMENT FILTER TABS TESTS (Task 2.10)
    // ==========================================================================

    describe('Assignment Filter Tabs (Task 2.10)', () => {
        it('should display filter tabs only in Students tab', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Should be in Students tab by default - filter tabs should be visible
            expect(screen.getByText('Filter by:')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^All$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^Assigned$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^Unassigned$/i })).toBeInTheDocument();

            // Switch to Teachers tab - filter tabs should not be visible
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            await waitFor(() => {
                expect(screen.queryByText('Filter by:')).not.toBeInTheDocument();
            });
        });

        it('should have "All" filter active by default', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // "All" button should be in filled variant (active state)
            const allButton = screen.getByRole('button', { name: /^All$/i });
            expect(allButton).toHaveClass('mantine-Button-filled');
        });

        it('should filter to show only assigned students when "Assigned" is clicked', async () => {
            // Setup: student-1 is assigned, student-2 and student-3 are not
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockImplementation((studentId) => {
                if (studentId === 'student-1') {
                    return Promise.resolve(mockAssignments);
                }
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Initially, all students should be visible
            expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            expect(screen.getByText('Bob Smith')).toBeInTheDocument();
            expect(screen.getByText('Charlie Brown')).toBeInTheDocument();

            // Click "Assigned" filter
            const assignedButton = screen.getByRole('button', { name: /^Assigned$/i });
            fireEvent.click(assignedButton);

            // Wait for filter to apply
            await waitFor(() => {
                // Only Alice (student-1) should be visible
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
                expect(screen.queryByText('Charlie Brown')).not.toBeInTheDocument();
            });
        });

        it('should filter to show only unassigned students when "Unassigned" is clicked', async () => {
            // Setup: student-1 is assigned, student-2 and student-3 are not
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockImplementation((studentId) => {
                if (studentId === 'student-1') {
                    return Promise.resolve(mockAssignments);
                }
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Click "Unassigned" filter
            const unassignedButton = screen.getByRole('button', { name: /^Unassigned$/i });
            fireEvent.click(unassignedButton);

            // Wait for filter to apply
            await waitFor(() => {
                // Only Bob and Charlie should be visible
                expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
                expect(screen.getByText('Bob Smith')).toBeInTheDocument();
                expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
            });
        });

        it('should show all students when "All" is clicked after filtering', async () => {
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockImplementation((studentId) => {
                if (studentId === 'student-1') {
                    return Promise.resolve(mockAssignments);
                }
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Click "Assigned" filter
            const assignedButton = screen.getByRole('button', { name: /^Assigned$/i });
            fireEvent.click(assignedButton);

            await waitFor(() => {
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
            });

            // Click "All" filter
            const allButton = screen.getByRole('button', { name: /^All$/i });
            fireEvent.click(allButton);

            // All students should be visible again
            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.getByText('Bob Smith')).toBeInTheDocument();
                expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
            });
        });

        it('should update user count when filter changes', async () => {
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockImplementation((studentId) => {
                if (studentId === 'student-1') {
                    return Promise.resolve(mockAssignments);
                }
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Initially should show 3 users
            expect(screen.getByText('3 users found')).toBeInTheDocument();

            // Click "Assigned" filter
            const assignedButton = screen.getByRole('button', { name: /^Assigned$/i });
            fireEvent.click(assignedButton);

            // Should show 1 user
            await waitFor(() => {
                expect(screen.getByText('1 users found')).toBeInTheDocument();
            });

            // Click "Unassigned" filter
            const unassignedButton = screen.getByRole('button', { name: /^Unassigned$/i });
            fireEvent.click(unassignedButton);

            // Should show 2 users
            await waitFor(() => {
                expect(screen.getByText('2 users found')).toBeInTheDocument();
            });
        });

        it('should work correctly with search filter', async () => {
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockImplementation((studentId) => {
                if (studentId === 'student-1') {
                    return Promise.resolve(mockAssignments);
                }
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Click "Assigned" filter (should show only Alice)
            const assignedButton = screen.getByRole('button', { name: /^Assigned$/i });
            fireEvent.click(assignedButton);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
            });

            // Now search for "Bob" - should show no results (Bob is unassigned)
            const searchInput = screen.getByPlaceholderText(/Search by name/i);
            fireEvent.change(searchInput, { target: { value: 'Bob' } });

            await waitFor(() => {
                expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
                expect(screen.getByText(/No users found/i)).toBeInTheDocument();
            });

            // Search for "Alice" - should show Alice
            fireEvent.change(searchInput, { target: { value: 'Alice' } });

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });
        });

        it('should reset filter to "All" when switching tabs', async () => {
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockImplementation((studentId) => {
                if (studentId === 'student-1') {
                    return Promise.resolve(mockAssignments);
                }
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Click "Assigned" filter
            const assignedButton = screen.getByRole('button', { name: /^Assigned$/i });
            fireEvent.click(assignedButton);

            await waitFor(() => {
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
            });

            // Switch to Teachers tab
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            await waitFor(() => {
                expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
            });

            // Switch back to Students tab
            const studentsTab = screen.getByRole('tab', { name: /students/i });
            fireEvent.click(studentsTab);

            // Filter should be reset to "All" - all students visible
            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.getByText('Bob Smith')).toBeInTheDocument();
                expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
            });

            // "All" button should be active
            const allButton = screen.getByRole('button', { name: /^All$/i });
            expect(allButton).toHaveClass('mantine-Button-filled');
        });

        it('should handle empty assigned students list', async () => {
            // All students are unassigned
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockResolvedValue([]);

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Click "Assigned" filter
            const assignedButton = screen.getByRole('button', { name: /^Assigned$/i });
            fireEvent.click(assignedButton);

            // Should show "No users found"
            await waitFor(() => {
                expect(screen.getByText(/No users found/i)).toBeInTheDocument();
            });
        });

        it('should handle all students assigned', async () => {
            // All students are assigned
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockResolvedValue(mockAssignments);

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Click "Unassigned" filter
            const unassignedButton = screen.getByRole('button', { name: /^Unassigned$/i });
            fireEvent.click(unassignedButton);

            // Should show "No users found"
            await waitFor(() => {
                expect(screen.getByText(/No users found/i)).toBeInTheDocument();
            });
        });

        it('should visually indicate active filter button', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            const allButton = screen.getByRole('button', { name: /^All$/i });
            const assignedButton = screen.getByRole('button', { name: /^Assigned$/i });
            const unassignedButton = screen.getByRole('button', { name: /^Unassigned$/i });

            // Initially "All" should be filled
            expect(allButton).toHaveClass('mantine-Button-filled');
            expect(assignedButton).toHaveClass('mantine-Button-light');
            expect(unassignedButton).toHaveClass('mantine-Button-light');

            // Click "Assigned"
            fireEvent.click(assignedButton);

            await waitFor(() => {
                expect(assignedButton).toHaveClass('mantine-Button-filled');
                expect(allButton).toHaveClass('mantine-Button-light');
                expect(unassignedButton).toHaveClass('mantine-Button-light');
            });

            // Click "Unassigned"
            fireEvent.click(unassignedButton);

            await waitFor(() => {
                expect(unassignedButton).toHaveClass('mantine-Button-filled');
                expect(allButton).toHaveClass('mantine-Button-light');
                expect(assignedButton).toHaveClass('mantine-Button-light');
            });
        });
    });

    // ==========================================================================
    // RELEASE STUDENT FLOW TESTS (Task 3.9)
    // ==========================================================================

    describe('Release Student Flow (Task 3.9)', () => {
        it('should display "Release from Teacher(s)" button only for assigned students', async () => {
            // Alice (student-1) is assigned in mockData setup
            // Bob (student-2) will be mocked as unassigned
            vi.mocked(assignmentManager.getAssignmentsByStudent).mockImplementation((studentId) => {
                if (studentId === 'student-1') return Promise.resolve(mockAssignments);
                return Promise.resolve([]);
            });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Alice should have the release button
            const aliceRow = screen.getByText('Alice Johnson').closest('tr');
            expect(aliceRow.querySelector('button[aria-label="Release from Teacher(s)"]')).toBeInTheDocument();

            // Bob should NOT have the release button
            const bobRow = screen.getByText('Bob Smith').closest('tr');
            expect(bobRow.querySelector('button[aria-label="Release from Teacher(s)"]')).not.toBeInTheDocument();
        });

        it('should open ReleaseStudentModal when clicking release button', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            const releaseButtons = screen.getAllByLabelText(/Release from Teacher\(s\)/i);
            fireEvent.click(releaseButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Release Student')).toBeInTheDocument();
            });

            expect(screen.getAllByText(/Alice Johnson/i).length).toBeGreaterThan(0);
        });

        it('should call removeAssignment with correct parameters on confirm', async () => {
            const mockRemoveAssignment = vi.mocked(assignmentManager.removeAssignment);
            mockRemoveAssignment.mockResolvedValue({ success: true });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Open release modal
            const releaseButtons = screen.getAllByLabelText(/Release from Teacher\(s\)/i);
            fireEvent.click(releaseButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Release Student')).toBeInTheDocument();
            });

            // Click confirm
            const confirmButton = screen.getByRole('button', { name: /Confirm Release/i });
            fireEvent.click(confirmButton);

            await waitFor(() => {
                expect(mockRemoveAssignment).toHaveBeenCalledWith('assign-1', expect.any(String), expect.any(Array));
            });
        });

        it('should reload data and show success message after successful release', async () => {
            vi.mocked(assignmentManager.removeAssignment).mockResolvedValue({ success: true });

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            const releaseButtons = screen.getAllByLabelText(/Release from Teacher\(s\)/i);
            fireEvent.click(releaseButtons[0]);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Confirm Release/i })).toBeInTheDocument();
            });

            fireEvent.click(screen.getByRole('button', { name: /Confirm Release/i }));

            await waitFor(() => {
                expect(screen.getAllByText(/Successfully released/i).length).toBeGreaterThan(0);
                expect(userService.getAllUsers).toHaveBeenCalled();
                expect(assignmentManager.getAssignmentsByStudent).toHaveBeenCalled();
            });
        });
    });

    // ==========================================================================
    // ACCESSIBILITY TESTS
    // ==========================================================================

    describe('Accessibility', () => {
        it('should have accessible button labels', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // All action buttons should have accessible labels
            const assignButtons = screen.getAllByLabelText(/Assign to Teacher/i);
            expect(assignButtons.length).toBeGreaterThan(0);

            assignButtons.forEach(button => {
                expect(button).toHaveAccessibleName();
            });
        });

        it('should be keyboard navigable', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            const assignButtons = screen.getAllByLabelText(/Assign to Teacher/i);
            const firstButton = assignButtons[0];

            // Should be focusable
            firstButton.focus();
            expect(document.activeElement).toBe(firstButton);
        });
    });
});

describe('Teacher Actions - Add to Class', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(userService.getAllUsers).mockResolvedValue([mockStudents[0]]);
        vi.mocked(assignmentManager.getAssignmentsByStudent).mockResolvedValue([]);
        vi.mocked(assignmentManager.getAssignmentsByTeacher).mockResolvedValue([]);
        vi.mocked(classManager.getClasses).mockResolvedValue(mockClasses);
        vi.mocked(courseManager.getCoursesByOwner).mockResolvedValue([]);
        vi.mocked(invitationService.getInvitationsByAdmin).mockResolvedValue([]);

        // Mock generic auth as teacher
        const useAuthMock = vi.mocked(require('../hooks/useAuth').useAuth);
        useAuthMock.mockReturnValue({
            user: { uid: 'teacher-1', email: 'teacher@test.com' },
            profile: { role: 'teacher', displayName: 'Teacher User' },
        });
    });

    it('should display "Add to Class" button and open modal', async () => {
        renderWithProviders(<AdminUserManagementPage />);

        // Wait for user to appear
        await waitFor(() => {
            expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
        });

        // Find "Add to Class" button
        const addButtons = screen.getAllByLabelText('Add to Class');
        expect(addButtons.length).toBeGreaterThan(0);

        fireEvent.click(addButtons[0]);

        // Verify modal opens
        await waitFor(() => {
            expect(screen.getByText('Add Student to Class')).toBeInTheDocument();
        });
    });
});
