import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { TeacherHeader } from './TeacherHeader';
import { getPaginatedUserNotifications } from '../../services/notificationService';

const { width } = vi.hoisted(() => ({ width: { value: 1440 } }));
vi.mock('../../core/platform', () => ({ useDocumentTitle: vi.fn(), useScreenSize: () => ({ width: width.value }) }));
vi.mock('../../hooks/useNavigationContext', () => ({ useNavigationContext: () => ({ isRoot: true, navigateToParent: vi.fn(), breadcrumbs: [] }) }));
vi.mock('../../hooks/useNavigation', () => ({ useNavigation: () => ({ currentPath: '/lobby', navigateTo: vi.fn() }) }));
vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: vi.fn() }) }));
vi.mock('../../services/firebase', () => ({ auth: { currentUser: { uid: 'teacher-1' } } }));
vi.mock('../../services/sessionService', () => ({ sessionService: { setPlayerData: vi.fn() } }));
vi.mock('../../services/notificationDestinationResolver', () => ({ resolveNotificationDestination: vi.fn() }));
vi.mock('../notifications/NotificationSettingsModal', () => ({ NotificationSettingsModal: () => null }));
vi.mock('../../services/notificationService', () => ({
    subscribeToNotifications: vi.fn(() => () => {}),
    getPaginatedUserNotifications: vi.fn(async () => ({ notifications: [], hasMore: false })),
    markNotificationAsRead: vi.fn(), markAllNotificationsAsRead: vi.fn(),
}));

describe('Teacher notification history menu entry', () => {
    it.each([1440, 375, 320])('opens the existing history panel from the account menu at %ipx and restores keyboard focus', async viewportWidth => {
        width.value = viewportWidth;
        vi.clearAllMocks();
        render(<MemoryRouter><TeacherHeader pageTitle="Materials" userId="teacher-1" onLogout={vi.fn()} /></MemoryRouter>);
        const trigger = screen.getByRole('button', { name: viewportWidth > 768 ? 'Open profile menu' : 'Toggle menu' });
        trigger.focus();
        fireEvent.click(trigger);
        const entry = screen.getByRole(viewportWidth > 768 ? 'menuitem' : 'button', { name: 'Notification history' });
        expect(entry.tagName).toBe('BUTTON');
        entry.focus();
        await userEvent.keyboard('{Enter}');
        const history = await screen.findByRole('dialog', { name: 'Notification history' });
        expect(history).toHaveFocus();
        if (viewportWidth <= 768) expect(history).toHaveStyle({ position: 'fixed', right: '12px' });
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(getPaginatedUserNotifications).toHaveBeenCalledWith('teacher-1', 20, undefined);
        fireEvent.keyDown(history, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notification history' })).not.toBeInTheDocument());
        expect(trigger).toHaveFocus();
    });
});
