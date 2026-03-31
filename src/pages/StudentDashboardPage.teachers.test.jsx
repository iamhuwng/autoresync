import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import StudentDashboardPage from './StudentDashboardPage';
import * as resultsService from '../services/resultsService';
import * as notificationService from '../services/notificationService';
import * as studentShellHooks from '../hooks/useStudentShellData';

const { mockNavigateTo, mockRefreshClasses } = vi.hoisted(() => ({
    mockNavigateTo: vi.fn(),
    mockRefreshClasses: vi.fn(),
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
    useMediaQuery: vi.fn(() => false),
}));

vi.mock('../components/dashboard/PendingReviewsWidget', () => ({
    PendingReviewsWidget: () => <div data-testid="pending-reviews-widget">Pending reviews</div>,
}));

vi.mock('../components/results/DeferredResultSlidePanel', () => ({
    DeferredResultSlidePanel: ({ resultId, onClose }) => (
        <div data-testid="result-slide-panel" data-result-id={resultId}>
            <button onClick={onClose}>Close Panel</button>
        </div>
    ),
}));

vi.mock('../services/resultsService');
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
    overdue: [],
    sortedAssignments: [],
    isClassesLoading: false,
    refreshClasses: mockRefreshClasses,
    ...overrides,
});

describe('StudentDashboardPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRefreshClasses.mockResolvedValue(undefined);
        studentShellHooks.useStudentShellData.mockReturnValue(makeShellData());
        resultsService.getAvailablePublicSessions.mockResolvedValue([]);
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
            expect(screen.getByText('Feed')).toBeInTheDocument();
            expect(screen.getByText('Welcome to Kahoot!')).toBeInTheDocument();
            expect(screen.getByText('Ask your teacher for a class code to get started.')).toBeInTheDocument();
        });
    });

    it('renders shared right rail modules from shell data', async () => {
        studentShellHooks.useStudentShellData.mockReturnValue(makeShellData({
            enrolledClasses: [{ id: 'cls-1', name: 'IELTS Class', classCode: 'AB', studentCount: 12 }],
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
            expect(screen.getByText('Up Next')).toBeInTheDocument();
            expect(screen.getByText('Reading Practice')).toBeInTheDocument();
            expect(screen.getByText('My Classes')).toBeInTheDocument();
            expect(screen.getAllByText('AB').length).toBeGreaterThan(0);
        });
    });

    it('keeps dashboard-specific widgets under the shell rail and joins shared live sessions through waiting room', async () => {
        studentShellHooks.useStudentShellData.mockReturnValue(makeShellData({
            classLiveSessions: [{
                code: 'LIVE123',
                classId: 'cls-1',
                className: 'IELTS Class',
                createdAt: Date.now(),
                mode: 'test',
                status: 'waiting',
                title: 'Live IELTS Reading',
            }],
        }));

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('Live Now')).toBeInTheDocument();
            expect(screen.getByText('Live IELTS Reading')).toBeInTheDocument();
            expect(screen.getByTestId('pending-reviews-widget')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText(/Join Now/i));

        await waitFor(() => {
            expect(mockNavigateTo).toHaveBeenCalledWith(
                'STUDENT_WAITING',
                { gameSessionId: 'LIVE123' },
                { reason: 'student_shell_right_rail_join' },
            );
        });
    });

    it('renders public sessions as dashboard supplemental content and joins them through waiting room', async () => {
        resultsService.getAvailablePublicSessions.mockResolvedValue([
            { sessionCode: 'PUBLIC1', testTitle: 'Public Quiz', playerCount: 10, createdAt: Date.now() },
        ]);

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getAllByText(/Live Now/i).length).toBeGreaterThan(0);
            expect(screen.getAllByText('Public Quiz').length).toBeGreaterThan(0);
        });

        fireEvent.click(screen.getAllByText('Join')[0]);

        await waitFor(() => {
            expect(mockNavigateTo).toHaveBeenCalledWith(
                'STUDENT_WAITING',
                { gameSessionId: 'PUBLIC1' },
                { reason: 'dashboard_public_session_join' },
            );
        });
    });

    it('opens the join class modal from the dashboard', async () => {
        renderWithProviders(<StudentDashboardPage />);

        fireEvent.click(await screen.findByText('Join a Class'));

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/enter class code/i)).toBeInTheDocument();
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
});
