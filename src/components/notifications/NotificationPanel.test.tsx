import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import NotificationPanel from './NotificationPanel';
import type { Notification } from '../../types/notification.types';

const notification: Notification = {
    id: 'notification-1',
    type: 'info',
    title: 'Open book',
    message: 'A book changed',
    read: false,
    createdAt: 1,
    link: '/student/dashboard',
};

describe('NotificationPanel', () => {
    it('delegates legacy destination resolution before closing', async () => {
        const onMarkAsRead = vi.fn().mockResolvedValue(undefined);
        const onOpenNotification = vi.fn().mockResolvedValue({
            status: 'allowed' as const,
            destination: 'STUDENT_DASHBOARD' as const,
            params: {},
        });
        const onClose = vi.fn();

        render(
            <NotificationPanel
                notifications={[notification]}
                onMarkAsRead={onMarkAsRead}
                onMarkAllRead={vi.fn()}
                onOpenNotification={onOpenNotification}
                onClose={onClose}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open notification: Open book' }));

        await waitFor(() => {
            expect(onMarkAsRead).toHaveBeenCalledWith('notification-1');
            expect(onOpenNotification).toHaveBeenCalledWith(notification);
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    it('keeps stale destinations open and announces the blocked result', async () => {
        const onClose = vi.fn();

        render(
            <NotificationPanel
                notifications={[notification]}
                onMarkAsRead={vi.fn()}
                onMarkAllRead={vi.fn()}
                onOpenNotification={vi.fn().mockResolvedValue({
                    status: 'blocked' as const,
                    reason: 'stale-destination' as const,
                })}
                onClose={onClose}
            />,
        );

        fireEvent.keyDown(screen.getByRole('button', { name: 'Open notification: Open book' }), { key: 'Enter' });

        expect(await screen.findByRole('status')).toHaveTextContent('no longer available');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('uses the parent-owned See All route action', () => {
        const onSeeAll = vi.fn();

        render(
            <NotificationPanel
                notifications={[]}
                onMarkAsRead={vi.fn()}
                onMarkAllRead={vi.fn()}
                onSeeAll={onSeeAll}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /See All Activity/ }));
        expect(onSeeAll).toHaveBeenCalledTimes(1);
    });
});
