/**
 * StudentDashboardPage - Activity Stream Tests
 * Tests the new 3-column Activity Stream dashboard layout (PRD-0002)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import StudentDashboardPage from './StudentDashboardPage';
import * as classManager from '../services/classManager';
import * as resultsService from '../services/resultsService';
import * as homeworkHooks from '../hooks/useHomeworkSubmission';
import * as notificationService from '../services/notificationService';

const renderWithProviders = (ui) => render(
    <MantineProvider>
        <BrowserRouter>
            {ui}
        </BrowserRouter>
    </MantineProvider>
);

// Mock hooks
vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'student-123',
            email: 'student@test.com',
            displayName: 'Test Student'
        },
        logout: vi.fn()
    })
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: vi.fn()
    })
}));

vi.mock('../components/navigation', () => ({
    StudentHeader: ({ pageTitle }) => <div data-testid="student-header">{pageTitle}</div>
}));

vi.mock('../components/dashboard/PendingReviewsWidget', () => ({
    PendingReviewsWidget: () => <div data-testid="pending-reviews-widget" />
}));

// Mock useMediaQuery since window.matchMedia is missing in JSDOM
vi.mock('../hooks/useMediaQuery', () => ({
    useMediaQuery: vi.fn(() => false)
}));

// Mock services
vi.mock('../services/classManager');
vi.mock('../services/resultsService');
vi.mock('../hooks/useHomeworkSubmission', () => ({
    useStudentHomeworkList: vi.fn()
}));
vi.mock('../services/notificationService', () => ({
    getPaginatedUserNotifications: vi.fn().mockResolvedValue({
        notifications: [],
        hasMore: false,
        lastKey: undefined
    }),
    subscribeToNotifications: vi.fn((_userId, cb) => {
        cb([]);
        return () => { };
    }),
    subscribeToNewNotifications: vi.fn((_userId, _sinceMs, _cb) => () => { }),
    markNotificationAsRead: vi.fn().mockResolvedValue({ success: true }),
    markAllNotificationsAsRead: vi.fn().mockResolvedValue({ success: true }),
}));

describe('StudentDashboardPage - Activity Stream', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mocks — empty states
        vi.spyOn(classManager, 'getStudentClasses').mockResolvedValue([]);
        vi.spyOn(classManager, 'subscribeToActiveSessions').mockImplementation(() => () => { });
        vi.spyOn(resultsService, 'getStudentHistory').mockResolvedValue([]);
        vi.spyOn(resultsService, 'getAvailablePublicSessions').mockResolvedValue([]);
        homeworkHooks.useStudentHomeworkList.mockReturnValue({
            notStarted: [],
            inProgress: [],
            overdue: []
        });

        // Reset notification service factory mock defaults after clearAllMocks
        notificationService.getPaginatedUserNotifications.mockResolvedValue({
            notifications: [],
            hasMore: false,
            lastKey: undefined
        });
        notificationService.subscribeToNotifications.mockImplementation((_userId, cb) => {
            cb([]);
            return () => { };
        });
        notificationService.subscribeToNewNotifications.mockImplementation((_userId, _sinceMs, _cb) => () => { });
        notificationService.markNotificationAsRead.mockResolvedValue({ success: true });
        notificationService.markAllNotificationsAsRead.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        cleanup();
    });

    it('should render the 3-column layout with sidebar navigation', async () => {
        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            // Left sidebar navigation items
            expect(screen.getByText('Feed')).toBeInTheDocument();
            expect(screen.getAllByText('Classes').length).toBeGreaterThan(0);
        });

        // Group 2 navigation links (use getAllByText for items that may appear elsewhere)
        expect(screen.getAllByText('Courses').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Homework').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Library')).toBeInTheDocument();
        expect(screen.getByText('Records')).toBeInTheDocument();
        expect(screen.getByText('Profile')).toBeInTheDocument();
    });

    it('should show empty state when no notifications or classes', async () => {
        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('Welcome to Kahoot!')).toBeInTheDocument();
            expect(screen.getByText('Ask your teacher for a class code to get started.')).toBeInTheDocument();
        });
    });

    it('should display feed items when notifications exist', async () => {
        notificationService.getPaginatedUserNotifications.mockResolvedValue({
            notifications: [
                {
                    id: 'notif-1',
                    type: 'success',
                    title: '✅ Test Complete',
                    message: 'You completed "IELTS Reading". Score: 7/10',
                    read: false,
                    createdAt: Date.now() - 60000,
                    link: '/result/test-1',
                    metadata: { resultId: 'test-1', testName: 'IELTS Reading' }
                },
                {
                    id: 'notif-2',
                    type: 'success',
                    title: '🏫 Joined Class',
                    message: 'You joined IELTS Mastery!',
                    read: true,
                    createdAt: Date.now() - 120000,
                    link: '/student/dashboard',
                    metadata: { className: 'IELTS Mastery' }
                }
            ],
            hasMore: false,
            lastKey: undefined
        });

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('✅ Test Complete')).toBeInTheDocument();
            expect(screen.getByText('🏫 Joined Class')).toBeInTheDocument();
        });
    });

    it('should display filter tabs in feed view', async () => {
        notificationService.getPaginatedUserNotifications.mockResolvedValue({
            notifications: [
                { id: 'n1', type: 'success', title: 'Test', message: 'msg', read: false, createdAt: Date.now() }
            ],
            hasMore: false,
            lastKey: undefined
        });

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('All')).toBeInTheDocument();
            expect(screen.getAllByText('Tests').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Classes').length).toBeGreaterThan(0);
        });

        // Homework tab should also exist
        expect(screen.getAllByText('Homework').length).toBeGreaterThanOrEqual(1);
    });

    it('should show "Load More" button when hasMoreNotifs is true', async () => {
        notificationService.getPaginatedUserNotifications.mockResolvedValue({
            notifications: Array.from({ length: 20 }, (_, i) => ({
                id: `n-${i}`,
                type: 'success',
                title: `Notification ${i}`,
                message: `Message ${i}`,
                read: false,
                createdAt: Date.now() - i * 1000
            })),
            hasMore: true,
            lastKey: 'n-19'
        });

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('Load More')).toBeInTheDocument();
        });
    });

    it('should switch to classes view when sidebar "Classes" is clicked', async () => {
        vi.spyOn(classManager, 'getStudentClasses').mockResolvedValue([
            { id: 'cls-1', name: 'IELTS Class', classCode: 'ABC123', studentCount: 15 }
        ]);

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getAllByText('Classes').length).toBeGreaterThan(0);
        });

        fireEvent.click(screen.getAllByText('Classes')[0]);

        await waitFor(() => {
            expect(screen.getByText('IELTS Class')).toBeInTheDocument();
            expect(screen.getByText('ABC123')).toBeInTheDocument();
        });
    });

    it('should render "Up Next" section in right panel', async () => {
        homeworkHooks.useStudentHomeworkList.mockReturnValue({
            notStarted: [
                {
                    status: 'not_started',
                    homework: {
                        id: 'hw-1',
                        title: 'Reading Practice',
                        scheduling: { dueDate: Date.now() + 86400000 } // tomorrow
                    }
                }
            ],
            inProgress: [],
            overdue: []
        });

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('Up Next')).toBeInTheDocument();
            expect(screen.getByText('Reading Practice')).toBeInTheDocument();
        });
    });

    it('should show empty "Up Next" state when no assignments', async () => {
        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('No upcoming deadlines 🎉')).toBeInTheDocument();
        });
    });

    it('should mark overdue assignments with red badge', async () => {
        homeworkHooks.useStudentHomeworkList.mockReturnValue({
            notStarted: [],
            inProgress: [],
            overdue: [
                {
                    status: 'overdue',
                    homework: {
                        id: 'hw-overdue',
                        title: 'Late Assignment',
                        scheduling: { dueDate: Date.now() - 86400000 } // yesterday
                    }
                }
            ]
        });

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('Late Assignment')).toBeInTheDocument();
            expect(screen.getAllByText(/Overdue/i).length).toBeGreaterThan(0);
        });
    });

    it('should render Join Class modal when button is clicked', async () => {
        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('Join a Class')).toBeInTheDocument();
        });

        fireEvent.click(screen.getAllByText('Join a Class')[0]);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/enter class code/i)).toBeInTheDocument();
            expect(screen.getAllByText(/join class/i).length).toBeGreaterThan(0);
        });
    });

    it('should show "Live Now" section when public sessions exist', async () => {
        vi.spyOn(resultsService, 'getAvailablePublicSessions').mockResolvedValue([
            { sessionCode: 'SESS-1', testTitle: 'Live Quiz', playerCount: 10, createdAt: Date.now() }
        ]);

        renderWithProviders(<StudentDashboardPage />);

        await waitFor(() => {
            expect(screen.getByText('Live Now 🔥')).toBeInTheDocument();
            expect(screen.getAllByText('Live Quiz').length).toBeGreaterThanOrEqual(1);
        });
    });
});
