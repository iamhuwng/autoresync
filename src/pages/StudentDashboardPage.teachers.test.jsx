import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import StudentDashboardPage from './StudentDashboardPage';
import * as notificationService from '../services/notificationService';
import * as studentShellHooks from '../hooks/useStudentShellData';
import * as classManager from '../services/classManager';

const { mockNavigateTo, mockRefreshClasses, mockRefreshHomeworkData, useMediaQueryMock } = vi.hoisted(() => ({
    mockNavigateTo: vi.fn(),
    mockRefreshClasses: vi.fn(),
    mockRefreshHomeworkData: vi.fn(),
    useMediaQueryMock: vi.fn(),
}));

const renderWithProviders = (ui) => render(
    <MantineProvider>
        <BrowserRouter>{ui}</BrowserRouter>
    </MantineProvider>,
);

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'student-123',
            email: 'student@test.com',
            displayName: 'Test Student',
        },
        profile: {
            avatarUrl: null,
        },
    }),
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: mockNavigateTo,
    }),
}));

vi.mock('../hooks/useStudentShellData', () => ({
    useStudentShellData: vi.fn(),
}));

vi.mock('../hooks/useMediaQuery', () => ({
    useMediaQuery: (...args) => useMediaQueryMock(...args),
}));

vi.mock('../components/dashboard/PendingReviewsWidget', () => ({
    PendingReviewsWidget: () => <div data-testid="pending-reviews-widget">Pending reviews</div>,
    default: () => <div data-testid="pending-reviews-widget">Pending reviews</div>,
}));

vi.mock('../components/results/DeferredResultSlidePanel', () => ({
    DeferredResultSlidePanel: ({ resultId, onClose }) => (
        <div data-testid="result-slide-panel" data-result-id={resultId}>
            <button onClick={onClose}>Close Panel</button>
        </div>
    ),
}));

vi.mock('../services/classManager', () => ({
    enrollStudent: vi.fn(),
}));
vi.mock('../services/notificationService', () => ({
    getPaginatedUserNotifications: vi.fn(),
    markNotificationAsRead: vi.fn(),
    subscribeToNewNotifications: vi.fn(() => () => { }),
}));
vi.mock('../services/sessionService', () => ({
    sessionService: {
        setPlayerData: vi.fn(),
    },
}));
vi.mock('../hooks/solo/useSoloAutoSave', () => ({
    cleanupExpiredProgress: vi.fn(),
}));

const makeShellData = (overrides = {}) => ({
    enrolledClasses: [],
    classLiveSessions: [],
    notStarted: [],
    inProgress: [],
    completed: [],
    overdue: [],
    sortedAssignments: [],
    isClassesLoading: false,
    refreshClasses: mockRefreshClasses,
    refreshHomeworkData: mockRefreshHomeworkData,
    ...overrides,
});

describe('StudentDashboardPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useMediaQueryMock.mockReturnValue(false);
        mockRefreshClasses.mockResolvedValue(undefined);
        mockRefreshHomeworkData.mockResolvedValue(undefined);
        studentShellHooks.useStudentShellData.mockReturnValue(makeShellData());
        classManager.enrollStudent.mockResolvedValue({ success: true, classId: 'ABC123' });
        notificationService.getPaginatedUserNotifications.mockResolvedValue({
            notifications: [],
            hasMore: false,
            lastKey: undefined,
        });
        notificationService.markNotificationAsRead.mockResolvedValue({ success: true });
    });

    it('renders student shell navigation and empty dashboard state', async () => {
        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
            expect(screen.getByText('Your workspace is ready.')).toBeInTheDocument();
            expect(screen.getByText('Join a class to unlock live sessions, coursework, and result tracking in this academic shell.')).toBeInTheDocument();
        });
    });

    it('renders the screenshot-era dashboard summary row and shared up-next module', async () => {
        studentShellHooks.useStudentShellData.mockReturnValue(makeShellData({
            enrolledClasses: [
                { id: 'cls-1', name: 'IELTS Class', classCode: 'AB', studentCount: 12 },
                { id: 'cls-2', name: 'THCS Class', classCode: 'CD', studentCount: 18 },
            ],
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

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Reading Practice').length).toBeGreaterThan(0);
            expect(screen.getByText('My Classes')).toBeInTheDocument();
            expect(screen.getByText('IELTS Class')).toBeInTheDocument();
            expect(screen.getByText('THCS Class')).toBeInTheDocument();
        });
    });

    it('keeps dashboard right rail aligned to shared live and up-next modules with pending review', async () => {
        studentShellHooks.useStudentShellData.mockReturnValue(makeShellData({
            enrolledClasses: [{ id: 'cls-1', name: 'IELTS Class', classCode: 'AB', studentCount: 12 }],
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

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getAllByText('Live Now').length).toBeGreaterThan(0);
            expect(screen.getByText('Live IELTS Reading')).toBeInTheDocument();
            expect(screen.getByText('Deadlines')).toBeInTheDocument();
            expect(screen.getAllByText('Reading Practice').length).toBeGreaterThan(0);
            expect(screen.getByText('My Classes')).toBeInTheDocument();
            expect(screen.getByTestId('pending-reviews-widget')).toBeInTheDocument();
            expect(screen.queryByText('Public Sessions')).not.toBeInTheDocument();
        });
    });

    it('opens the join class modal from the dashboard', async () => {
        renderWithProviders(<StudentDashboardPage />);

        fireEvent.click(await screen.findByText('Join a Class'));

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/enter class code/i)).toBeInTheDocument();
        });
    });

    it('keeps the join flow pending until teacher approval', async () => {
        renderWithProviders(<StudentDashboardPage />);

        fireEvent.click(await screen.findByText('Join a Class'));
        const classCodeInput = screen.getByPlaceholderText(/enter class code/i);

        fireEvent.change(classCodeInput, {
            target: { value: 'abc123' },
        });
        fireEvent.submit(classCodeInput.closest('form'));

        await waitFor(() => {
            expect(classManager.enrollStudent).toHaveBeenCalledWith(
                'ABC123',
                'student-123',
                'Test Student',
                'student@test.com',
            );
            expect(mockRefreshClasses).toHaveBeenCalledTimes(1);
            expect(mockRefreshHomeworkData).not.toHaveBeenCalled();
            expect(screen.getByText('Join request sent for ABC123. Waiting for teacher approval.')).toBeInTheDocument();
        });
    });

    it('opens the result slide panel when a result notification is clicked', async () => {
        notificationService.getPaginatedUserNotifications.mockResolvedValue({
            notifications: [{
                id: 'notif-result',
                type: 'success',
                title: 'Result Ready',
                message: 'Your result is ready.',
                read: false,
                createdAt: Date.now(),
                metadata: {
                    resultId: 'result-1',
                    score: 7,
                    maxScore: 10,
                },
            }],
            hasMore: false,
            lastKey: undefined,
        });

        renderWithProviders(<StudentDashboardPage />);

        fireEvent.click(await screen.findByText('Result Ready'));

        await waitFor(() => {
            expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'result-1');
        });
    });

    it('opens the result slide panel for result-detail links without metadata.resultId', async () => {
        notificationService.getPaginatedUserNotifications.mockResolvedValue({
            notifications: [{
                id: 'notif-result-link',
                type: 'success',
                title: 'Writing Test Reviewed',
                message: 'Your writing result is ready.',
                link: '/result/result-legacy',
                read: false,
                createdAt: Date.now(),
                metadata: {
                    writingId: 'writing-1',
                },
            }],
            hasMore: false,
            lastKey: undefined,
        });

        renderWithProviders(<StudentDashboardPage />);

        fireEvent.click(await screen.findByText('Writing Test Reviewed'));

        await waitFor(() => {
            expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'result-legacy');
        });
    });

    it('opens the result slide panel for writing notifications that link to academic record', async () => {
        notificationService.getPaginatedUserNotifications.mockResolvedValue({
            notifications: [{
                id: 'notif-writing-graded',
                type: 'success',
                title: 'Writing Graded',
                message: 'Your teacher graded your essay.',
                link: '/student/academic-record',
                read: false,
                createdAt: Date.now(),
                metadata: {
                    submissionId: 'submission-123',
                    testTitle: 'Writing Mock 1',
                    overallBand: 6.5,
                },
            }],
            hasMore: false,
            lastKey: undefined,
        });

        renderWithProviders(<StudentDashboardPage />);

        fireEvent.click(await screen.findByText('Writing Graded'));

        await waitFor(() => {
            expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'submission-123');
        });
    });

    it('stacks the join class modal actions and touch targets on mobile', async () => {
        useMediaQueryMock.mockReturnValue(true);

        renderWithProviders(<StudentDashboardPage />);

        fireEvent.click(await screen.findByText('Join a Class'));

        const modalHeading = await screen.findByRole('heading', { name: 'Join a Class' });
        const modalCard = modalHeading.parentElement;
        const actionRow = screen.getByRole('button', { name: 'Cancel' }).parentElement;

        expect(modalCard).toHaveStyle({
            padding: '16px',
            maxHeight: '80vh',
            overflowY: 'auto',
        });
        expect(actionRow).toHaveStyle({ flexDirection: 'column' });
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
        expect(within(modalCard).getByRole('button', { name: 'Join Class' })).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
    });
});
