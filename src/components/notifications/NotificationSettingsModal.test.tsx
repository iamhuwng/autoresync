import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import * as userService from '../../services/userService';
import { MantineProvider } from '@mantine/core';

// Mock userService
vi.mock('../../services/userService', () => ({
    getUserById: vi.fn(),
    updateUserProfile: vi.fn(),
}));

// Mock notifications to avoid issues
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn()
    }
}));

// Components using Mantine need to be wrapped in MantineProvider
const renderWithMantine = (component: React.ReactNode) => {
    return render(
        <MantineProvider>
            {component}
        </MantineProvider>
    );
};

describe('NotificationSettingsModal', () => {
    const mockUserId = 'user123';
    const mockOnClose = vi.fn();
    const mockUser = {
        uid: 'user123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'student',
        preferences: {
            notifications: {
                emailResults: false,
                weeklyReport: true,
                teacherAlerts: false
            }
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (userService.getUserById as any).mockResolvedValue(mockUser);
    });

    it('renders correctly when opened', async () => {
        renderWithMantine(
            <NotificationSettingsModal
                userId={mockUserId}
                opened={true}
                onClose={mockOnClose}
            />
        );

        // Should retrieve user data
        expect(userService.getUserById).toHaveBeenCalledWith(mockUserId);

        // Should display title
        expect(screen.getByText('Notification Preferences')).toBeInTheDocument();

        // Should display preference labels
        await waitFor(() => {
            expect(screen.getByText('Email Results')).toBeInTheDocument();
            expect(screen.getByText('Weekly Report')).toBeInTheDocument();
            expect(screen.getByText('Teacher Alerts')).toBeInTheDocument();
        });
    });

    it('calls updateUserProfile when save button is clicked', async () => {
        (userService.updateUserProfile as any).mockResolvedValue(undefined);

        renderWithMantine(
            <NotificationSettingsModal
                userId={mockUserId}
                opened={true}
                onClose={mockOnClose}
            />
        );

        // Wait for form to load
        await waitFor(() => {
            expect(screen.getByText('Save Preferences')).toBeInTheDocument();
        });

        // Click Save (without modifying anything, should save current state)
        const saveButton = screen.getByText('Save Preferences');
        fireEvent.click(saveButton);

        // Should call updateUserProfile
        await waitFor(() => {
            expect(userService.updateUserProfile).toHaveBeenCalledWith(
                mockUserId,
                expect.objectContaining({
                    preferences: expect.objectContaining({
                        notifications: expect.any(Object)
                    })
                })
            );
        });
    });

    it('closes modal when cancel is clicked', async () => {
        renderWithMantine(
            <NotificationSettingsModal
                userId={mockUserId}
                opened={true}
                onClose={mockOnClose}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Cancel')).toBeInTheDocument();
        });

        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);

        expect(mockOnClose).toHaveBeenCalled();
    });
});
