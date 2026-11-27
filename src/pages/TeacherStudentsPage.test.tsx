import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import TeacherStudentsPage from './TeacherStudentsPage';
import { ToastContainer, toast } from '../components/modern/ToastNotification';
import { FEATURE_IDS, FEATURE_REGISTRY } from '../config/featureRegistry';

const mocks = vi.hoisted(() => ({
    navigateTo: vi.fn(),
    logout: vi.fn(),
    trackAction: vi.fn(),
    trackPageView: vi.fn(),
    getAssignmentsByTeacher: vi.fn(),
    getAssignmentRequestsByTeacher: vi.fn(),
    removeAssignments: vi.fn(),
    createStudentRequest: vi.fn(),
    getUserById: vi.fn(),
    getTeacherClassesWithMembers: vi.fn(),
    enrollStudent: vi.fn(),
    getCoursesByOwner: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'teacher-1', email: 'teacher@test.com', displayName: 'Ms. Teacher' },
        profile: { role: 'teacher', displayName: 'Ms. Teacher', email: 'teacher@test.com', status: 'active' },
        loading: false,
        logout: mocks.logout,
    }),
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: mocks.navigateTo,
        currentPath: '/teacher/students',
    }),
}));

vi.mock('../services/reportingService', () => ({
    reportingService: {
        trackAction: mocks.trackAction,
        trackPageView: mocks.trackPageView,
    },
}));

vi.mock('../components/navigation', () => ({
    TeacherHeader: ({ pageTitle }: { pageTitle: string }) => <header data-testid="teacher-header">{pageTitle}</header>,
}));

vi.mock('../services/assignmentManager', () => ({
    getAssignmentsByTeacher: mocks.getAssignmentsByTeacher,
    getAssignmentRequestsByTeacher: mocks.getAssignmentRequestsByTeacher,
    removeAssignments: mocks.removeAssignments,
    createStudentRequest: mocks.createStudentRequest,
}));

vi.mock('../services/userService', () => ({
    getUserById: mocks.getUserById,
}));

vi.mock('../services/classManager', () => ({
    getTeacherClassesWithMembers: mocks.getTeacherClassesWithMembers,
    enrollStudent: mocks.enrollStudent,
}));

vi.mock('../services/courseManager', () => ({
    getCoursesByOwner: mocks.getCoursesByOwner,
}));

const alice = {
    uid: 'student-1',
    displayName: 'Alice Nguyen',
    email: 'alice@student.test',
    role: 'student' as const,
    status: 'active' as const,
    createdAt: 200,
};

const bob = {
    uid: 'student-2',
    displayName: 'Bob Tran',
    email: 'bob@student.test',
    role: 'student' as const,
    status: 'active' as const,
    createdAt: 100,
};

const activeAssignments = [
    {
        id: 'assign-1',
        studentId: 'student-1',
        teacherId: 'teacher-1',
        assignedBy: 'admin-1',
        assignedAt: 1000,
        unassignedAt: null,
        status: 'active' as const,
        coursesEnrolled: ['course-1'],
    },
    {
        id: 'assign-2',
        studentId: 'student-2',
        teacherId: 'teacher-1',
        assignedBy: 'admin-1',
        assignedAt: 900,
        unassignedAt: null,
        status: 'active' as const,
        coursesEnrolled: [],
    },
];

const teacherClasses = [
    {
        id: 'class-1',
        classCode: 'IELTS1',
        name: 'IELTS Morning',
        status: 'active' as const,
        createdAt: 500,
        studentCount: 1,
        activeAssignments: 0,
        completedAssignments: 0,
        studentIds: ['student-1'],
    },
    {
        id: 'class-2',
        classCode: 'IELTS2',
        name: 'IELTS Evening',
        status: 'active' as const,
        createdAt: 400,
        studentCount: 0,
        activeAssignments: 0,
        completedAssignments: 0,
        studentIds: [],
    },
];

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/teacher/students']}>
            <TeacherStudentsPage />
            <ToastContainer />
        </MemoryRouter>
    );

describe('TeacherStudentsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});

        mocks.getAssignmentsByTeacher.mockResolvedValue(activeAssignments);
        mocks.getUserById.mockImplementation(async (uid: string) => {
            if (uid === 'student-1') return alice;
            if (uid === 'student-2') return bob;
            return null;
        });
        mocks.getTeacherClassesWithMembers.mockResolvedValue(teacherClasses);
        mocks.getCoursesByOwner.mockResolvedValue([
            { id: 'course-1', name: 'IELTS Academic', code: 'IELTS-01' },
        ]);
        mocks.getAssignmentRequestsByTeacher.mockResolvedValue([
            {
                id: 'req-1',
                teacherId: 'teacher-1',
                studentEmail: 'pending@student.test',
                requestedAt: 1700000000000,
                status: 'pending',
            },
        ]);
        mocks.enrollStudent.mockResolvedValue({ success: true, classId: 'class-2' });
        mocks.removeAssignments.mockResolvedValue({ success: true, releasedIds: ['assign-1'], failed: [] });
        mocks.createStudentRequest.mockResolvedValue({ success: true, requestId: 'req-2' });
    });

    afterEach(() => {
        cleanup();
        toast.clear();
        vi.restoreAllMocks();
    });

    it('loads students in parallel with real enrolled classes, oversight badge, and hides dead Edit button', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Alice Nguyen')).toBeInTheDocument();
            expect(screen.getByText('Bob Tran')).toBeInTheDocument();
        });

        expect(mocks.getAssignmentsByTeacher).toHaveBeenCalledWith('teacher-1');
        expect(mocks.getUserById).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('stat-active-students')).toHaveTextContent('2');
        expect(screen.getByTestId('stat-active-classes')).toHaveTextContent('2');
        expect(screen.getByTestId('stat-pending-requests')).toHaveTextContent('1');

        const aliceCard = screen.getByRole('article', { name: 'Student Alice Nguyen' });
        expect(within(aliceCard).getByText('IELTS Morning')).toBeInTheDocument();
        expect(within(aliceCard).getByText('You')).toBeInTheDocument();
        expect(within(aliceCard).queryByRole('button', { name: /Edit Alice Nguyen/i })).not.toBeInTheDocument();

        const bobCard = screen.getByRole('article', { name: 'Student Bob Tran' });
        expect(within(bobCard).getByText('No Class')).toBeInTheDocument();
    });

    it('filters students by search text and class selector', async () => {
        renderPage();
        await screen.findByText('Alice Nguyen');

        const classSelect = screen.getByLabelText('Filter by class');
        fireEvent.change(classSelect, { target: { value: 'class-1' } });
        expect(screen.getByText('Alice Nguyen')).toBeInTheDocument();
        expect(screen.queryByText('Bob Tran')).not.toBeInTheDocument();

        fireEvent.change(classSelect, { target: { value: 'none' } });
        expect(screen.queryByText('Alice Nguyen')).not.toBeInTheDocument();
        expect(screen.getByText('Bob Tran')).toBeInTheDocument();

        fireEvent.change(classSelect, { target: { value: 'all' } });
        fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'IELTS Morning' } });
        expect(screen.getByText('Alice Nguyen')).toBeInTheDocument();
        expect(screen.queryByText('Bob Tran')).not.toBeInTheDocument();
    });

    it('navigates to student history when Analytics is clicked', async () => {
        renderPage();
        await screen.findByText('Alice Nguyen');

        fireEvent.click(screen.getByRole('button', { name: 'View analytics for Alice Nguyen' }));

        expect(mocks.navigateTo).toHaveBeenCalledWith(
            'TEACHER_STUDENT_HISTORY',
            { studentId: 'student-1' },
            { reason: 'view_student_history' }
        );
        expect(mocks.trackAction).toHaveBeenCalledWith(
            FEATURE_IDS.teacherStudents,
            'openStudentAnalytics',
            { studentId: 'student-1' }
        );
    });

    it('adds a student to a class, updates card badge, and announces toast success', async () => {
        renderPage();
        await screen.findByText('Alice Nguyen');

        mocks.getTeacherClassesWithMembers.mockResolvedValueOnce([
            teacherClasses[0],
            { ...teacherClasses[1], studentIds: ['student-1'] },
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Add Alice Nguyen to class' }));

        const select = await screen.findByLabelText('Select Class');
        const alreadyEnrolledOption = within(select).getByRole('option', {
            name: /IELTS Morning \(IELTS1\) \(Already enrolled\)/i,
        }) as HTMLOptionElement;
        expect(alreadyEnrolledOption.disabled).toBe(true);

        fireEvent.change(select, { target: { value: 'class-2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add to Class' }));

        await waitFor(() => {
            expect(mocks.enrollStudent).toHaveBeenCalledWith(
                'class-2',
                'student-1',
                'Alice Nguyen',
                'alice@student.test',
                { approvalMode: 'active' }
            );
        });

        expect(await screen.findByRole('status')).toHaveTextContent('Added Alice Nguyen to IELTS Evening.');
        await waitFor(() => {
            const aliceCard = screen.getByRole('article', { name: 'Student Alice Nguyen' });
            expect(within(aliceCard).getByText('IELTS Evening')).toBeInTheDocument();
        });
    });

    it('keeps Add to Class modal open and announces toast error on enrollment failure', async () => {
        mocks.enrollStudent.mockResolvedValueOnce({ success: false, error: 'Class is full' });

        renderPage();
        await screen.findByText('Bob Tran');

        fireEvent.click(screen.getByRole('button', { name: 'Add Bob Tran to class' }));
        fireEvent.change(await screen.findByLabelText('Select Class'), { target: { value: 'class-2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add to Class' }));

        await waitFor(() => {
            expect(screen.getAllByRole('alert').some((el) => el.textContent?.includes('Class is full'))).toBe(true);
        });
        expect(screen.getByText('Add Student to Class')).toBeInTheDocument();
    });

    it('releases a student, refreshes roster, and announces toast success', async () => {
        renderPage();
        await screen.findByText('Alice Nguyen');

        mocks.getAssignmentsByTeacher.mockResolvedValueOnce([activeAssignments[1]]);

        fireEvent.click(screen.getByRole('button', { name: 'Release Alice Nguyen' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Confirm Release' }));

        await waitFor(() => {
            expect(mocks.removeAssignments).toHaveBeenCalledWith(['assign-1'], 'Released by teacher');
        });

        expect(await screen.findByRole('status')).toHaveTextContent('Released Alice Nguyen from your oversight.');
        await waitFor(() => {
            expect(screen.queryByText('Alice Nguyen')).not.toBeInTheDocument();
        });
        expect(screen.getByText('Bob Tran')).toBeInTheDocument();
    });

    it('refreshes roster and reports explicit partial failure when releasing multiple assignments partially fails', async () => {
        mocks.getAssignmentsByTeacher.mockResolvedValue([
            activeAssignments[0],
            {
                ...activeAssignments[0],
                id: 'assign-1b',
            },
            activeAssignments[1],
        ]);

        renderPage();
        await screen.findByText('Alice Nguyen');

        mocks.removeAssignments.mockResolvedValueOnce({
            success: false,
            releasedIds: ['assign-1'],
            failed: [{ assignmentId: 'assign-1b', error: 'Permission denied' }],
        });
        mocks.getAssignmentsByTeacher.mockResolvedValueOnce([
            { ...activeAssignments[0], id: 'assign-1b' },
            activeAssignments[1],
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Release Alice Nguyen' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Confirm Release' }));

        await waitFor(() => {
            expect(mocks.removeAssignments).toHaveBeenCalledWith(
                ['assign-1', 'assign-1b'],
                'Released by teacher'
            );
            expect(mocks.getAssignmentsByTeacher).toHaveBeenCalledTimes(2);
            expect(
                screen.getAllByRole('alert').some((el) =>
                    el.textContent?.includes('Released 1 of 2 assignments for Alice Nguyen')
                )
            ).toBe(true);
        });
    });

    it('surfaces load errors without rendering misleading empty-roster states and allows retry', async () => {
        mocks.getAssignmentsByTeacher.mockRejectedValueOnce(new Error('Network offline'));
        mocks.getTeacherClassesWithMembers.mockRejectedValueOnce(new Error('Classes offline'));
        mocks.getAssignmentRequestsByTeacher.mockRejectedValueOnce(new Error('Requests offline'));

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/Could not load your students/i)).toBeInTheDocument();
            expect(screen.getByText(/Could not load your classes/i)).toBeInTheDocument();
        });
        expect(screen.queryByText('No students assigned yet')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /My Requests/i }));
        await waitFor(() => {
            expect(screen.getByText(/Could not load your student requests/i)).toBeInTheDocument();
        });
        expect(screen.queryByText('No student requests yet')).not.toBeInTheDocument();

        mocks.getAssignmentRequestsByTeacher.mockResolvedValueOnce([
            {
                id: 'req-recovered',
                teacherId: 'teacher-1',
                studentEmail: 'recovered@student.test',
                requestedAt: 1700000000000,
                status: 'pending',
            },
        ]);
        fireEvent.click(screen.getByRole('button', { name: 'Retry requests' }));
        expect(await screen.findByText('recovered@student.test')).toBeInTheDocument();
    });

    it('tracks clearStudentSearch and clearStudentFilters and uses responsive grid columns', async () => {
        renderPage();
        await screen.findByText('Alice Nguyen');

        const grid = screen.getByTestId('student-grid');
        expect(grid).toHaveClass('student-grid');
        expect(grid.style.gridTemplateColumns).toBe('');

        fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'Alice' } });
        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(mocks.trackAction).toHaveBeenCalledWith(FEATURE_IDS.teacherStudents, 'clearStudentSearch', undefined);

        fireEvent.change(screen.getByLabelText('Filter by class'), { target: { value: 'class-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
        expect(mocks.trackAction).toHaveBeenCalledWith(FEATURE_IDS.teacherStudents, 'clearStudentFilters', undefined);
    });

    it('submits a student request with canonicalized email and shows it in My Requests tab', async () => {
        renderPage();
        await screen.findByText('Alice Nguyen');

        mocks.getAssignmentRequestsByTeacher.mockResolvedValueOnce([
            {
                id: 'req-2',
                teacherId: 'teacher-1',
                studentEmail: 'new@student.test',
                requestedAt: 1700000100000,
                status: 'pending',
            },
            {
                id: 'req-1',
                teacherId: 'teacher-1',
                studentEmail: 'pending@student.test',
                requestedAt: 1700000000000,
                status: 'pending',
            },
        ]);

        fireEvent.click(screen.getByRole('button', { name: /Add Student/i }));
        fireEvent.change(await screen.findByLabelText('Student Email'), {
            target: { value: '  New@Student.TEST ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send Request' }));

        await waitFor(() => {
            expect(mocks.createStudentRequest).toHaveBeenCalledWith('teacher-1', 'new@student.test');
        });
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Requested access to new@student.test. Pending admin approval.'
        );
        await waitFor(() => {
            expect(screen.getByTestId('stat-pending-requests')).toHaveTextContent('2');
        });

        fireEvent.click(screen.getByRole('tab', { name: /My Requests/i }));
        expect(await screen.findByText('new@student.test')).toBeInTheDocument();
        expect(screen.getByText('pending@student.test')).toBeInTheDocument();
    });

    it('registers all tracked actions in FEATURE_REGISTRY', () => {
        const entry = FEATURE_REGISTRY.find((f) => f.id === FEATURE_IDS.teacherStudents);
        expect(entry).toBeDefined();
        expect(entry?.routes).toContain('/teacher/students');
        expect(entry?.actions).toEqual(
            expect.arrayContaining([
                'syncStudents',
                'switchStudentsTab',
                'filterStudentsByClass',
                'clearStudentSearch',
                'clearStudentFilters',
                'openStudentAnalytics',
                'openAddToClassModal',
                'addStudentToClass',
                'openReleaseStudentModal',
                'releaseStudent',
                'openRequestStudentModal',
                'requestStudent',
            ])
        );
    });
});
