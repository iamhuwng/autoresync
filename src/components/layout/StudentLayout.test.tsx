import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StudentLayout } from './StudentLayout';
import * as mediaQueryHooks from '../../hooks/useMediaQuery';
import * as studentShellHooks from '../../hooks/useStudentShellData';

const { mockNavigateTo } = vi.hoisted(() => ({
    mockNavigateTo: vi.fn(),
}));

vi.mock('../../hooks/useMediaQuery', () => ({
    useMediaQuery: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'student-1',
            email: 'student@test.com',
            displayName: 'Student One',
        },
    }),
}));

vi.mock('../../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: mockNavigateTo,
    }),
}));

vi.mock('../../hooks/useStudentShellData', () => ({
    useStudentShellData: vi.fn(),
}));

vi.mock('../../services/reportingService', () => ({
    reportingService: {
        trackAction: vi.fn(),
    },
}));

vi.mock('../../services/sessionService', () => ({
    sessionService: {
        setPlayerData: vi.fn(),
    },
}));

const makeShellData = (overrides = {}) => ({
    enrolledClasses: [],
    classLiveSessions: [],
    notStarted: [],
    inProgress: [],
    overdue: [],
    sortedAssignments: [],
    isClassesLoading: false,
    refreshClasses: vi.fn(),
    ...overrides,
});

describe('StudentLayout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(mediaQueryHooks.useMediaQuery).mockReturnValue(false);
        vi.mocked(studentShellHooks.useStudentShellData).mockReturnValue(makeShellData());
    });

    it('renders the shared desktop right rail modules and supplemental content', () => {
        vi.mocked(studentShellHooks.useStudentShellData).mockReturnValue(makeShellData({
            enrolledClasses: [{ id: 'cls-1', name: 'IELTS Class', classCode: 'AB', studentCount: 12, activeAssignments: 3 }],
            classLiveSessions: [{
                code: 'LIVE123',
                classId: 'cls-1',
                className: 'IELTS Class',
                createdAt: Date.now(),
                mode: 'test',
                status: 'waiting',
                title: 'Live IELTS Reading',
            }],
            sortedAssignments: [{
                status: 'not_started',
                homework: {
                    id: 'hw-1',
                    title: 'Reading Practice',
                    scheduling: { dueDate: Date.now() + 86400000 },
                    target: { className: 'IELTS Class' },
                },
            }],
        }));

        render(
            <StudentLayout
                mobileTitle="Dashboard"
                sidebar={<div>Sidebar</div>}
                rightPanel={<div>Supplemental Widget</div>}
            >
                <div>Main Content</div>
            </StudentLayout>,
        );

        expect(screen.getByTestId('student-layout-container')).toBeInTheDocument();
        expect(screen.getByText('Live Now')).toBeInTheDocument();
        expect(screen.getByText('Live IELTS Reading')).toBeInTheDocument();
        expect(screen.getByText('Deadlines')).toBeInTheDocument();
        expect(screen.getByText('Reading Practice')).toBeInTheDocument();
        expect(screen.getByText('My Classes')).toBeInTheDocument();
        expect(screen.getByText('Supplemental Widget')).toBeInTheDocument();
    });

    it('shows every enrolled class in the shared right rail', () => {
        vi.mocked(studentShellHooks.useStudentShellData).mockReturnValue(makeShellData({
            enrolledClasses: [
                { id: 'cls-1', name: 'IELTS Class 1', classCode: 'A1', studentCount: 12, activeAssignments: 3 },
                { id: 'cls-2', name: 'IELTS Class 2', classCode: 'A2', studentCount: 11, activeAssignments: 2 },
                { id: 'cls-3', name: 'IELTS Class 3', classCode: 'A3', studentCount: 10, activeAssignments: 1 },
                { id: 'cls-4', name: 'IELTS Class 4', classCode: 'A4', studentCount: 9, activeAssignments: 4 },
                { id: 'cls-5', name: 'IELTS Class 5', classCode: 'A5', studentCount: 8, activeAssignments: 2 },
            ],
        }));

        render(
            <StudentLayout mobileTitle="Dashboard" sidebar={<div>Sidebar</div>}>
                <div>Main Content</div>
            </StudentLayout>,
        );

        expect(screen.getAllByText('A5')).toHaveLength(2);
        expect(screen.getByText('8 students - 2 active')).toBeInTheDocument();
    });

    it('uses the shared live and up-next module pattern for the dashboard right rail', () => {
        render(
            <StudentLayout
                mobileTitle="Dashboard"
                sidebar={<div>Sidebar</div>}
                rightRailVariant="dashboard"
                shellData={makeShellData({
                    enrolledClasses: [{ id: 'cls-1', name: 'IELTS Class', classCode: 'AB', studentCount: 12, activeAssignments: 3 }],
                    classLiveSessions: [{
                        code: 'LIVE123',
                        classId: 'cls-1',
                        className: 'IELTS Class',
                        createdAt: Date.now(),
                        mode: 'test',
                        status: 'waiting',
                        title: 'Live IELTS Reading',
                    }],
                    sortedAssignments: [{
                        status: 'not_started',
                        homework: {
                            id: 'hw-1',
                            title: 'Reading Practice',
                            scheduling: { dueDate: Date.now() + 86400000 },
                            target: { className: 'IELTS Class' },
                        },
                    }],
                })}
                rightPanel={<div>Supplemental Widget</div>}
            >
                <div>Main Content</div>
            </StudentLayout>,
        );

        expect(screen.getByText('Live Now')).toBeInTheDocument();
        expect(screen.getByText('Live IELTS Reading')).toBeInTheDocument();
        expect(screen.getByText('Deadlines')).toBeInTheDocument();
        expect(screen.getByText('Reading Practice')).toBeInTheDocument();
        expect(screen.getByText('My Classes')).toBeInTheDocument();
        expect(screen.getByText('Supplemental Widget')).toBeInTheDocument();
    });

    it('preserves the screenshot-era dashboard center spacing', () => {
        render(
            <StudentLayout
                mobileTitle="Dashboard"
                sidebar={<div>Sidebar</div>}
                rightRailVariant="dashboard"
            >
                <div>Main Content</div>
            </StudentLayout>,
        );

        expect(screen.getByText('Main Content').closest('main')).toHaveStyle({
            padding: '0 48px 48px',
        });
    });

    it('uses provided shell data instead of the connected shell-data hook', () => {
        const providedShellData = makeShellData({
            sortedAssignments: [{
                status: 'not_started',
                homework: {
                    id: 'hw-2',
                    title: 'Provided Practice',
                    scheduling: { dueDate: Date.now() + 86400000 },
                    target: { className: 'IELTS Class' },
                },
            }],
        });

        render(
            <StudentLayout
                mobileTitle="Dashboard"
                sidebar={<div>Sidebar</div>}
                shellData={providedShellData}
            >
                <div>Main Content</div>
            </StudentLayout>,
        );

        expect(studentShellHooks.useStudentShellData).not.toHaveBeenCalled();
        expect(screen.getByText('Provided Practice')).toBeInTheDocument();
    });

    it('renders empty shared rail states when there is no live work', () => {
        render(
            <StudentLayout mobileTitle="Dashboard" sidebar={<div>Sidebar</div>}>
                <div>Main Content</div>
            </StudentLayout>,
        );

        expect(screen.queryByText('Live Now')).not.toBeInTheDocument();
        expect(screen.getByText('Deadlines')).toBeInTheDocument();
        expect(screen.getByText(/No upcoming deadlines/i)).toBeInTheDocument();
        expect(screen.getByText('My Classes')).toBeInTheDocument();
        expect(screen.getByText('No classes joined yet.')).toBeInTheDocument();
    });

    it('opens the shared right rail drawer on mobile', () => {
        vi.mocked(mediaQueryHooks.useMediaQuery).mockReturnValue(true);
        vi.mocked(studentShellHooks.useStudentShellData).mockReturnValue(makeShellData({
            sortedAssignments: [{
                status: 'not_started',
                homework: {
                    id: 'hw-1',
                    title: 'Mobile Reading Practice',
                    scheduling: { dueDate: Date.now() + 86400000 },
                    target: { className: 'IELTS Class' },
                },
            }],
        }));

        render(
            <StudentLayout mobileTitle="Dashboard" sidebar={<div>Sidebar</div>}>
                <div>Main Content</div>
            </StudentLayout>,
        );

        const rightRail = screen.getByTestId('student-layout-right-rail');
        expect(rightRail).toHaveStyle({ transform: 'translateX(100%)' });

        fireEvent.click(screen.getByRole('button', { name: /open right rail/i }));

        expect(rightRail).toHaveStyle({ transform: 'translateX(0)' });
        expect(screen.getByText('Mobile Reading Practice')).toBeInTheDocument();
    });
});
