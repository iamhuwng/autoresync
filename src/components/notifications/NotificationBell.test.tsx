import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NotificationBell } from './NotificationBell';
import * as notificationService from '../../services/notificationService';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../../services/notificationService');

describe('NotificationBell', () => {
    const mockSubscribe = vi.fn();
    const mockMarkRead = vi.fn();
    const mockMarkAllRead = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (notificationService.subscribeToNotifications as any).mockImplementation((userId: string, cb: any) => {
            mockSubscribe(userId, cb);
            return () => { }; // unsubscribe function
        });
        (notificationService.markNotificationAsRead as any).mockImplementation(mockMarkRead);
        (notificationService.markAllNotificationsAsRead as any).mockImplementation(mockMarkAllRead);
    });

    it('renders bell icon', () => {
        render(
            <NotificationBell userId="user123" />
        );
        expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    });

    it('subscribes to notifications on mount', () => {
        render(
            <NotificationBell userId="user123" />
        );
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

        render(
            <NotificationBell userId="user123" />
        );
        // The unread badge wrapper should render the text content '2'
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('opens panel on click', async () => {
        render(
            <MemoryRouter>
                <NotificationBell userId="user123" />
            </MemoryRouter>
        );
        const button = screen.getByLabelText('Notifications');
        fireEvent.click(button);
        // Expect panel content (e.g., "Notifications" header from panel)
        await waitFor(() => {
            expect(screen.getByText('Mark all read')).toBeInTheDocument();
        });
    });
});
