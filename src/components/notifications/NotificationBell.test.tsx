import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NotificationBell } from './NotificationBell';
import * as notificationService from '../../services/notificationService';
import { MemoryRouter } from 'react-router-dom';

const { mockNavigateTo, mockResolveDestination } = vi.hoisted(() => ({
    mockNavigateTo: vi.fn(),
    mockResolveDestination: vi.fn(),
}));

// Mock dependencies
vi.mock('../../services/notificationService');
vi.mock('../../services/notificationDestinationResolver', () => ({
    resolveNotificationDestination: mockResolveDestination,
}));
vi.mock('../../hooks/useNavigation', () => ({
    useNavigation: () => ({
        currentPath: '/lobby',
        navigateTo: mockNavigateTo,
    }),
}));

describe('NotificationBell', () => {
    const mockSubscribe = vi.fn();
    const mockMarkRead = vi.fn();
    const mockMarkAllRead = vi.fn();
    const renderBell = () => render(
        <MemoryRouter>
            <NotificationBell userId="user123" />
        </MemoryRouter>
    );

    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveDestination.mockResolvedValue({
            status: 'allowed',
            destination: 'TEACHER_GRADING_DETAIL',
            params: { submissionId: '-submission-1' },
        });
        (notificationService.subscribeToNotifications as any).mockImplementation((userId: string, cb: any) => {
            mockSubscribe(userId, cb);
            return () => { }; // unsubscribe function
        });
        (notificationService.markNotificationAsRead as any).mockImplementation(mockMarkRead);
        (notificationService.markAllNotificationsAsRead as any).mockImplementation(mockMarkAllRead);
    });

    it('renders bell icon', () => {
        renderBell();
        expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    });

    it('subscribes to notifications on mount', () => {
        renderBell();
        expect(mockSubscribe).toHaveBeenCalledWith('user123', expect.any(Function));
    });

    it('shows badge when unread notifications exist', () => {
        // Mock subscription callback to return unread notifications immediately
        (notificationService.subscribeToNotifications as any).mockImplementation((userId: string, cb: any) => {
            cb([
                { id: '1', read: false },
                { id: '2', read: false }
            ]);
            return () => { };
        });

        renderBell();
        // The unread badge wrapper should render the text content '2'
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('opens panel on click', async () => {
        renderBell();
        const button = screen.getByLabelText('Notifications');
        fireEvent.click(button);
        // Expect empty panel content when no notifications are loaded.
        await waitFor(() => {
            expect(screen.getByText('No notifications yet')).toBeInTheDocument();
        });
    });

    it('passes explicit teacher role and opens the resolved destination', async () => {
        (notificationService.subscribeToNotifications as any).mockImplementation((_userId: string, cb: any) => {
            cb([{
                id: 'notification-1',
                type: 'info',
                title: 'New Writing Submission',
                message: 'Open grading',
                link: '/teacher/grading/writing/-submission-1',
                read: false,
                createdAt: 1,
            }]);
            return () => {};
        });

        render(
            <MemoryRouter>
                <NotificationBell userId="teacher-1" role="teacher" />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByLabelText('Notifications'));
        fireEvent.click(await screen.findByRole('button', {
            name: 'Open notification: New Writing Submission',
        }));

        await waitFor(() => {
            expect(mockResolveDestination).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'notification-1' }),
                expect.objectContaining({
                    userId: 'teacher-1',
                    currentPath: '/lobby',
                    role: 'teacher',
                }),
            );
            expect(mockNavigateTo).toHaveBeenCalledWith(
                'TEACHER_GRADING_DETAIL',
                { submissionId: '-submission-1' },
                { reason: 'notification_open' },
            );
        });
    });

    it('keeps blocked destinations in place', async () => {
        mockResolveDestination.mockResolvedValue({
            status: 'blocked',
            reason: 'unauthorized',
        });
        (notificationService.subscribeToNotifications as any).mockImplementation((_userId: string, cb: any) => {
            cb([{
                id: 'notification-2',
                type: 'info',
                title: 'Book update',
                message: 'Unavailable fixture',
                metadata: {
                    schemaVersion: 1,
                    kind: 'book',
                    contextType: 'book',
                    contextId: 'book-1',
                    updateActionId: 'update-1',
                    checkpointAvailable: false,
                    deadlineClass: 'none',
                    actionClass: 'open',
                },
                read: false,
                createdAt: 1,
            }]);
            return () => {};
        });

        render(
            <MemoryRouter>
                <NotificationBell userId="student-1" role="student" />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByLabelText('Notifications'));
        fireEvent.click(await screen.findByRole('button', {
            name: 'Open notification: Book update',
        }));

        expect(await screen.findByRole('status')).toHaveTextContent(
            'This notification is not available for the current account.',
        );
        expect(mockNavigateTo).not.toHaveBeenCalled();
    });
});
