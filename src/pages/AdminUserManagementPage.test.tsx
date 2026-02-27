import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import AdminUserManagementPage from './AdminUserManagementPage.jsx';
import * as useAuthModule from '../hooks/useAuth';
import * as userServiceModule from '../services/userService';
import * as assignmentManagerModule from '../services/assignmentManager';

// Mock dependencies
vi.mock('../hooks/useAuth');
vi.mock('../services/userService');
vi.mock('../services/assignmentManager', () => ({
    getAssignmentsByStudent: vi.fn(),
    getAssignmentsByTeacher: vi.fn(),
    removeAssignment: vi.fn(),
    getAllAssignmentRequests: vi.fn(),
    approveStudentRequest: vi.fn(),
    denyStudentRequest: vi.fn(),
    createStudentRequest: vi.fn(),
}));
vi.mock('../services/invitationService', () => ({
    generateTeacherInvite: vi.fn(),
    getInvitationsByAdmin: vi.fn().mockResolvedValue([]),
    revokeInvitation: vi.fn(),
}));

vi.mock('../services/courseManager', () => ({
    getCourseTypes: vi.fn().mockResolvedValue([]),
    getPendingTypeRequests: vi.fn().mockResolvedValue([]),
    approveCourseType: vi.fn(),
    rejectCourseType: vi.fn(),
}));
vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: vi.fn(),
        currentPath: '/admin/users',
        isNavigating: false,
        navigationHistory: [],
        context: {},
    }),
}));

describe('AdminUserManagementPage - Teacher Filter Integration', () => {
    const mockTeacherId = 'teacher-123';
    const mockSuperAdminId = 'admin-456';

    const mockUsers = [
        {
            uid: 'student-1',
            email: 'student1@test.com',
            displayName: 'Student One',
            role: 'student',
            status: 'active',
            createdAt: Date.now(),
        },
        {
            uid: 'student-2',
            email: 'student2@test.com',
            displayName: 'Student Two',
            role: 'student',
            status: 'active',
            createdAt: Date.now(),
        },
        {
            uid: 'student-3',
            email: 'student3@test.com',
            displayName: 'Student Three',
            role: 'student',
            status: 'active',
            createdAt: Date.now(),
        },
        {
            uid: mockTeacherId,
            email: 'teacher@test.com',
            displayName: 'Test Teacher',
            role: 'teacher',
            status: 'active',
            createdAt: Date.now(),
        },
    ] as any[]; // Cast as any[] to avoid strict type checks on role string literals

    const mockAssignments = {
        'student-1': [
            {
                id: 'assign-1',
                studentId: 'student-1',
                teacherId: mockTeacherId,
                assignedBy: mockSuperAdminId,
                assignedAt: Date.now(),
                status: 'active' as const,
                unassignedAt: null,
            },
        ],
        'student-2': [
            {
                id: 'assign-2',
                studentId: 'student-2',
                teacherId: mockTeacherId,
                assignedBy: mockSuperAdminId,
                assignedAt: Date.now(),
                status: 'active' as const,
                unassignedAt: null,
            },
        ],
        'student-3': [
            {
                id: 'assign-3',
                studentId: 'student-3',
                teacherId: 'other-teacher-789',
                assignedBy: mockSuperAdminId,
                assignedAt: Date.now(),
                status: 'active' as const,
                unassignedAt: null,
            },
        ],
    };

    const renderWithProviders = (ui: React.ReactElement, initialState = {}) => {
        return render(
            <MantineProvider>
                <MemoryRouter initialEntries={[{ pathname: '/admin/users', state: initialState }]}>
                    {ui}
                </MemoryRouter>
            </MantineProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock useAuth
        vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
            user: { uid: mockSuperAdminId, email: 'admin@test.com' },
            profile: { role: 'super_admin', displayName: 'Super Admin' },
            logout: vi.fn(),
            loading: false,
            error: null,
        } as any);

        // Mock getAllUsers
        vi.spyOn(userServiceModule, 'getAllUsers').mockResolvedValue(mockUsers);

        // Mock getAssignmentsByStudent
        vi.spyOn(assignmentManagerModule, 'getAssignmentsByStudent').mockImplementation(async (studentId: string) => {
            return mockAssignments[studentId as keyof typeof mockAssignments] || [];
        });

        // Mock getAssignmentsByTeacher
        vi.spyOn(assignmentManagerModule, 'getAssignmentsByTeacher').mockImplementation(async (teacherId: string) => {
            if (teacherId === mockTeacherId) {
                return [mockAssignments['student-1'][0], mockAssignments['student-2'][0]];
            }
            return [];
        });
    });

    it('should show ALL students when no teacherId filter is provided', async () => {
        renderWithProviders(<AdminUserManagementPage />, {});

        // Wait for data to load
        await waitFor(() => {
            expect(userServiceModule.getAllUsers).toHaveBeenCalled();
        });

        // Should show all 3 students
        await waitFor(() => {
            expect(screen.getByText('Student One')).toBeInTheDocument();
            expect(screen.getByText('Student Two')).toBeInTheDocument();
            expect(screen.getByText('Student Three')).toBeInTheDocument();
        }, { timeout: 3000 });
    });

    it('should show ONLY assigned students when teacherId filter is provided', async () => {
        // Simulate navigation from TeacherLobbyPage with teacherId parameter
        renderWithProviders(<AdminUserManagementPage />, { teacherId: mockTeacherId });

        // Wait for data to load
        await waitFor(() => {
            expect(userServiceModule.getAllUsers).toHaveBeenCalled();
            expect(assignmentManagerModule.getAssignmentsByStudent).toHaveBeenCalledWith('student-1');
            expect(assignmentManagerModule.getAssignmentsByStudent).toHaveBeenCalledWith('student-2');
            expect(assignmentManagerModule.getAssignmentsByStudent).toHaveBeenCalledWith('student-3');
        }, { timeout: 3000 });

        // Should show only students assigned to this teacher (student-1 and student-2)
        await waitFor(() => {
            expect(screen.getByText('Student One')).toBeInTheDocument();
            expect(screen.getByText('Student Two')).toBeInTheDocument();
        }, { timeout: 3000 });

        // Should NOT show student-3 (assigned to different teacher)
        expect(screen.queryByText('Student Three')).not.toBeInTheDocument();
    });

    it('should show empty state when teacher has no assigned students', async () => {
        // Mock a teacher with no students
        vi.spyOn(assignmentManagerModule, 'getAssignmentsByStudent').mockResolvedValue([]);

        renderWithProviders(<AdminUserManagementPage />, { teacherId: 'teacher-with-no-students' });

        // Wait for data to load
        await waitFor(() => {
            expect(userServiceModule.getAllUsers).toHaveBeenCalled();
        }, { timeout: 3000 });

        // Should show "No users found" message
        await waitFor(() => {
            expect(screen.getByText(/No users found matching your filters/i)).toBeInTheDocument();
        }, { timeout: 3000 });
    });


    it('should display correct assignment information for filtered students', async () => {
        renderWithProviders(<AdminUserManagementPage />, { teacherId: mockTeacherId });

        // Wait for data to load
        await waitFor(() => {
            expect(screen.getByText('Student One')).toBeInTheDocument();
        }, { timeout: 3000 });

        // Should show teacher name in "Assigned To" column
        await waitFor(() => {
            const teacherBadges = screen.getAllByText('Test Teacher');
            expect(teacherBadges.length).toBeGreaterThan(0);
        }, { timeout: 3000 });
    });
});


describe('AdminUserManagementPage - Request Management', () => {
    const mockRequest = {
        id: 'request-123',
        teacherId: 'teacher-123',
        studentEmail: 'student@example.com',
        requestedAt: Date.now(),
        status: 'pending' as const
    };

    const renderWithProviders = (ui: React.ReactElement) => {
        return render(
            <MantineProvider>
                <MemoryRouter initialEntries={['/admin/users']}>
                    {ui}
                </MemoryRouter>
            </MantineProvider>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
            user: { uid: 'admin-1', email: 'admin@test.com' },
            profile: { role: 'super_admin' },
            logout: vi.fn(),
            loading: false,
            error: null,
        } as any);

        vi.spyOn(userServiceModule, 'getAllUsers').mockResolvedValue([]);
        (assignmentManagerModule.getAllAssignmentRequests as any).mockResolvedValue([mockRequest]);
        (assignmentManagerModule.approveStudentRequest as any).mockResolvedValue({ success: true });
        (assignmentManagerModule.denyStudentRequest as any).mockResolvedValue({ success: true });
    });

    it('should display pending requests in Requests tab', async () => {
        renderWithProviders(<AdminUserManagementPage />);

        // Find tab by role (better accessibility practice and cleaner selection)
        const requestsTab = await screen.findByRole('tab', { name: /Requests/i });
        fireEvent.click(requestsTab);

        await waitFor(() => {
            expect(assignmentManagerModule.getAllAssignmentRequests).toHaveBeenCalled();
        });

        // Verify request is shown
        await waitFor(() => {
            expect(screen.getByText('student@example.com')).toBeInTheDocument();
            expect(screen.getByText('pending')).toBeInTheDocument();
        });
    });

    it('should handle approve request', async () => {
        renderWithProviders(<AdminUserManagementPage />);

        const requestsTab = await screen.findByRole('tab', { name: /Requests/i });
        fireEvent.click(requestsTab);

        await waitFor(() => expect(screen.getByText('student@example.com')).toBeInTheDocument());

        // Click Approve
        const approveBtn = screen.getByText('Approve');
        fireEvent.click(approveBtn);

        await waitFor(() => {
            expect(assignmentManagerModule.approveStudentRequest).toHaveBeenCalledWith('request-123', 'admin-1');
        });
    });

    it('should handle deny request', async () => {
        // Mock confirm
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        renderWithProviders(<AdminUserManagementPage />);

        const requestsTab = await screen.findByRole('tab', { name: /Requests/i });
        fireEvent.click(requestsTab);

        await waitFor(() => expect(screen.getByText('student@example.com')).toBeInTheDocument());

        // Click Deny
        const denyBtn = screen.getByText('Deny');
        fireEvent.click(denyBtn);

        await waitFor(() => {
            expect(assignmentManagerModule.denyStudentRequest).toHaveBeenCalledWith('request-123', 'admin-1');
        });
    });
});
