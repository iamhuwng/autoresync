import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NotificationBell } from './NotificationBell';
import * as notificationService from '../../services/notificationService';
import { toast } from '../modern/ToastNotification';
import { MemoryRouter } from 'react-router-dom';

const { mockNavigateTo, mockResolveDestination } = vi.hoisted(() => ({
    mockNavigateTo: vi.fn(),
    mockResolveDestination: vi.fn(),
}));

// Mock dependencies
vi.mock('../../services/notificationService');
vi.mock('../../services/firebase', () => ({ auth: { currentUser: { displayName: 'Test Student' } } }));
vi.mock('../../services/sessionService', () => ({ sessionService: { setPlayerData: vi.fn() } }));
vi.mock('../../components/modern/ToastNotification', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: vi.fn() }) }));
vi.mock('./NotificationSettingsModal', () => ({ NotificationSettingsModal: () => null }));
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
        mockMarkRead.mockResolvedValue({ success: true });
        mockMarkAllRead.mockResolvedValue({ success: true });
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

    it.each(['student', 'teacher'] as const)('caps the %s bell at 30 and opens paged history beyond 30', async role => {
        const records = Array.from({ length: 45 }, (_, index) => ({ id: String(index), title: 'Notice ' + index, message: 'History', type: 'info', createdAt: 100 - index, read: false }));
        vi.mocked(notificationService.subscribeToNotifications).mockImplementation((_user, callback, limit = 10) => { callback(records.slice(0, limit + 1) as any); return () => {}; });
        vi.mocked(notificationService.getPaginatedUserNotifications).mockResolvedValueOnce({ notifications: records.slice(0, 20) as any, hasMore: true, cursor: { createdAt: 81, id: '19' } }).mockResolvedValueOnce({ notifications: records.slice(20, 40) as any, hasMore: true, cursor: { createdAt: 61, id: '39' } });
        render(<MemoryRouter><NotificationBell userId="user123" role={role} /></MemoryRouter>);
        fireEvent.click(screen.getByLabelText('Notifications'));
        expect(screen.getAllByRole('button', { name: /^Read notification:/ })).toHaveLength(10);
        fireEvent.click(screen.getByText('Load 10 more'));
        expect(screen.getAllByRole('button', { name: /^Read notification:/ })).toHaveLength(20);
        fireEvent.click(screen.getByText('Load 10 more'));
        expect(screen.getAllByRole('button', { name: /^Read notification:/ })).toHaveLength(30);
        expect(screen.queryByText('Load 10 more')).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveFocus();
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Notifications'));
        fireEvent.click(screen.getByText('View notification history'));
        await screen.findByText('Notification history');
        expect(screen.getAllByRole('button', { name: /^Read notification:/ })).toHaveLength(20);
        fireEvent.click(screen.getByText('Load 20 more'));
        await screen.findByText('Notice 39');
        expect(notificationService.getPaginatedUserNotifications).toHaveBeenLastCalledWith('user123', 20, { createdAt: 81, id: '19' });
        fireEvent.click(screen.getByRole('button', { name: 'Read notification: Notice 35' }));
        await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith('user123', '35'));
        fireEvent.click(screen.getByText('Mark displayed read'));
        await waitFor(() => expect(screen.queryByText('Mark displayed read')).not.toBeInTheDocument());
        expect(screen.getByRole('dialog', { name: 'Notification history' })).toHaveFocus();
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Notification history' })).not.toBeInTheDocument();
    });

    it('keeps the badge scoped to latest 10 when older unread notices expand to 20 and 30', () => {
        const records = Array.from({ length: 31 }, (_, index) => ({ id: String(index), title: 'Notice ' + index, message: 'History', type: 'info', createdAt: 100 - index, read: index > 0 && index < 10 }));
        vi.mocked(notificationService.subscribeToNotifications).mockImplementation((_user, callback, limit = 10) => { callback(records.slice(0, limit + 1) as any); return () => {}; });
        renderBell();
        const badge = () => screen.getByTitle('Unread among the latest 10 notifications');
        expect(badge()).toHaveTextContent('1');
        fireEvent.click(screen.getByLabelText('Notifications'));
        fireEvent.click(screen.getByText('Load 10 more'));
        expect(screen.getAllByRole('button', { name: /^Read notification:/ })).toHaveLength(20);
        expect(badge()).toHaveTextContent('1');
        fireEvent.click(screen.getByText('Load 10 more'));
        expect(screen.getAllByRole('button', { name: /^Read notification:/ })).toHaveLength(30);
        expect(badge()).toHaveTextContent('1');
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

        await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('This notification is not available for the current account.'));
        expect(mockNavigateTo).not.toHaveBeenCalled();
    });
});
