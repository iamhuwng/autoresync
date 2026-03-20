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

const mockAuthState = {
    user: { uid: 'admin-123', email: 'admin@test.com' },
    profile: { role: 'super_admin', displayName: 'Admin User' },
    logout: vi.fn(),
};

const mockNavigationState = {
    navigateTo: vi.fn(),
};

// Mock the auth hook
vi.mock('../hooks/useAuth', () => ({
    useAuth: () => mockAuthState,
}));

// Mock the navigation hook
vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => mockNavigationState,
}));

vi.mock('../services/firebase', () => ({
    database: {},
    auth: {},
    firestore: {},
    googleProvider: {},
    analytics: null,
}));

// Mock user service
vi.mock('../services/userService', () => ({
    getAllUsers: vi.fn(),
    getAllUsersSecure: vi.fn(),
    getTeacherStudents: vi.fn(),
    updateUserProfile: vi.fn(),
    deleteUserProfile: vi.fn(),
    toggleUserStatus: vi.fn(),
}));

// Mock assignment manager
vi.mock('../services/assignmentManager', () => ({
    getAllAssignments: vi.fn(),
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

const resetAuthState = ({
    user = { uid: 'admin-123', email: 'admin@test.com' },
    profile = { role: 'super_admin', displayName: 'Admin User' },
} = {}) => {
    mockAuthState.user = user;
    mockAuthState.profile = profile;
    mockAuthState.logout = vi.fn();
    sessionStorage.setItem('activeRole', profile.role);
};

const buildAssignmentBatch = (assignments = mockAssignments) => {
    const activeAssignments = assignments.filter(
        (assignment) => (assignment.status ?? 'active') === 'active'
    );
    const byStudent = {};
    const byTeacher = {};

    activeAssignments.forEach((assignment) => {
        byStudent[assignment.studentId] ??= [];
        byTeacher[assignment.teacherId] ??= [];
        byStudent[assignment.studentId].push(assignment);
        byTeacher[assignment.teacherId].push(assignment);
    });

    return {
        all: activeAssignments,
        byStudent,
        byTeacher,
    };
};

const setAssignmentBatch = (assignments = mockAssignments) => {
    vi.mocked(assignmentManager.getAllAssignments).mockResolvedValue(buildAssignmentBatch(assignments));
};

const getStudentScopeRoot = () => screen.getByTestId('student-scope-filter');

const selectStudentScope = async (label) => {
    const [option] = await screen.findAllByRole('option', { name: label, hidden: true });
    fireEvent.click(option);
};

const getResultsSummary = () =>
    screen.getAllByText(
        (_, node) => node?.tagName?.toLowerCase() === 'p' && (node.textContent?.startsWith('Showing ') ?? false)
    )[0];

// ============================================================================
// TEST SUITES
// ============================================================================

describe('AdminUserManagementPage - Assignment Flows', () => {
    // ... existing beforeEach ...
    beforeEach(() => {
        vi.clearAllMocks();
        resetAuthState();

        // Setup default mock implementations
        vi.mocked(userService.getAllUsers).mockResolvedValue([...mockStudents, ...mockTeachers]);
        vi.mocked(userService.getAllUsersSecure).mockResolvedValue([...mockStudents, ...mockTeachers]);
        vi.mocked(userService.getTeacherStudents).mockResolvedValue([...mockStudents]);
        vi.mocked(invitationService.getInvitationsByAdmin).mockResolvedValue([]);
        setAssignmentBatch(mockAssignments);
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

            await waitFor(() => {
                expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
            });

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

            await waitFor(() => {
                expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
            });

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
                expect(userService.getAllUsersSecure).toHaveBeenCalled();
                expect(assignmentManager.getAllAssignments).toHaveBeenCalled();
            });
        });
    });

    // ==========================================================================
    // ASSIGNMENT DISPLAY TESTS
    // ==========================================================================

    describe('Assignment Display', () => {
        it('should show assigned teacher names for students', async () => {
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

        it('should show "Floating (Unlinked)" badge for students without assignments', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Bob Smith')).toBeInTheDocument();
            });

            const unassignedBadges = screen.getAllByText(/Floating \(Unlinked\)/i);
            expect(unassignedBadges.length).toBeGreaterThan(0);
        });

        it('should show student count for teachers', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Switch to Teachers tab
            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            // Should show student count (1 student from mockAssignments)
            await waitFor(() => {
                expect(screen.getByText(/1 Assigned Students/i)).toBeInTheDocument();
            });
        });
    });

    // ==========================================================================
    // EDGE CASES
    // ==========================================================================

    describe('Edge Cases', () => {
        it('should handle empty user list gracefully', async () => {
            vi.mocked(userService.getAllUsersSecure).mockResolvedValue([]);

            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText(/No users match your search/i)).toBeInTheDocument();
            });
        });

        it('should handle API errors when loading users', async () => {
            vi.mocked(userService.getAllUsersSecure).mockRejectedValue(new Error('API Error'));

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

            vi.mocked(userService.getAllUsersSecure).mockResolvedValue(usersWithoutNames);

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
        it('should display the student scope filter only in Students tab', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            expect(getStudentScopeRoot()).toBeInTheDocument();

            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            await waitFor(() => {
                expect(screen.queryByTestId('student-scope-filter')).not.toBeInTheDocument();
            });
        });

        it('should show all students by default', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            expect(screen.getByText('Bob Smith')).toBeInTheDocument();
            expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
        });

        it('should filter to show only assigned students when Managed Only is selected', async () => {
            setAssignmentBatch(mockAssignments);
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            await selectStudentScope('Managed Only');

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
                expect(screen.queryByText('Charlie Brown')).not.toBeInTheDocument();
            });
        });

        it('should filter to show only unassigned students when Floating (Unlinked) is selected', async () => {
            setAssignmentBatch(mockAssignments);
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            await selectStudentScope('Floating (Unlinked)');

            await waitFor(() => {
                expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
                expect(screen.getByText('Bob Smith')).toBeInTheDocument();
                expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
            });
        });

        it('should show all students when All Students is re-selected after filtering', async () => {
            setAssignmentBatch(mockAssignments);
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            await selectStudentScope('Managed Only');

            await waitFor(() => {
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
            });

            await selectStudentScope('All Students');

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.getByText('Bob Smith')).toBeInTheDocument();
                expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
            });
        });

        it('should update user count when filter changes', async () => {
            setAssignmentBatch(mockAssignments);
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            expect(getResultsSummary()).toHaveTextContent('Showing 3 students');

            await selectStudentScope('Managed Only');

            await waitFor(() => {
                expect(getResultsSummary()).toHaveTextContent('Showing 1 students (assigned)');
            });

            await selectStudentScope('Floating (Unlinked)');

            await waitFor(() => {
                expect(getResultsSummary()).toHaveTextContent('Showing 2 students (unassigned)');
            });
        });

        it('should work correctly with search filter', async () => {
            setAssignmentBatch(mockAssignments);
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            await selectStudentScope('Managed Only');

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
            });

            const searchInput = screen.getByPlaceholderText(/Search students/i);
            fireEvent.change(searchInput, { target: { value: 'Bob' } });

            await waitFor(() => {
                expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
                expect(screen.getByText(/No users match your search/i)).toBeInTheDocument();
            });

            fireEvent.change(searchInput, { target: { value: 'Alice' } });

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });
        });

        it('should reset filter to "All" when switching tabs', async () => {
            setAssignmentBatch(mockAssignments);
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            await selectStudentScope('Managed Only');

            await waitFor(() => {
                expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
            });

            const teachersTab = screen.getByRole('tab', { name: /teachers/i });
            fireEvent.click(teachersTab);

            await waitFor(() => {
                expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
            });

            const studentsTab = screen.getByRole('tab', { name: /students/i });
            fireEvent.click(studentsTab);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.getByText('Bob Smith')).toBeInTheDocument();
                expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
            });
        });

        it('should handle empty assigned students list', async () => {
            setAssignmentBatch([]);
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            await selectStudentScope('Managed Only');

            await waitFor(() => {
                expect(screen.getByText(/No users match your search/i)).toBeInTheDocument();
            });
        });

        it('should handle all students assigned', async () => {
            setAssignmentBatch([
                { ...mockAssignments[0], studentId: 'student-1' },
                { ...mockAssignments[0], id: 'assign-2', studentId: 'student-2' },
                { ...mockAssignments[0], id: 'assign-3', studentId: 'student-3' },
            ]);
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            await selectStudentScope('Floating (Unlinked)');

            await waitFor(() => {
                expect(screen.getByText(/No users match your search/i)).toBeInTheDocument();
            });
        });

        it('should reflect the selected filter in the control value', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            await selectStudentScope('Managed Only');

            await waitFor(() => {
                expect(getResultsSummary()).toHaveTextContent('Showing 1 students (assigned)');
            });

            await selectStudentScope('Floating (Unlinked)');

            await waitFor(() => {
                expect(getResultsSummary()).toHaveTextContent('Showing 2 students (unassigned)');
            });
        });
    });

    // ==========================================================================
    // RELEASE STUDENT FLOW TESTS (Task 3.9)
    // ==========================================================================

    describe('Release Student Flow (Task 3.9)', () => {
        it('should display accessible release actions for student cards', async () => {
            renderWithProviders(<AdminUserManagementPage />);

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            expect(screen.getAllByLabelText(/Release from Teacher\(s\)/i)).toHaveLength(mockStudents.length);
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
                expect(userService.getAllUsersSecure).toHaveBeenCalled();
                expect(assignmentManager.getAllAssignments).toHaveBeenCalled();
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
        resetAuthState({
            user: { uid: 'teacher-1', email: 'teacher@test.com' },
            profile: { role: 'teacher', displayName: 'Teacher User' },
        });
        vi.mocked(userService.getTeacherStudents).mockResolvedValue([mockStudents[0]]);
        vi.mocked(userService.getAllUsersSecure).mockResolvedValue([mockStudents[0]]);
        vi.mocked(assignmentManager.getAssignmentsByStudent).mockResolvedValue([]);
        vi.mocked(assignmentManager.getAssignmentsByTeacher).mockResolvedValue([]);
        setAssignmentBatch([
            {
                ...mockAssignments[0],
                teacherId: 'teacher-1',
                studentId: 'student-1',
            },
        ]);
        vi.mocked(classManager.getClasses).mockResolvedValue(mockClasses);
        vi.mocked(courseManager.getCoursesByOwner).mockResolvedValue([]);
        vi.mocked(invitationService.getInvitationsByAdmin).mockResolvedValue([]);
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
