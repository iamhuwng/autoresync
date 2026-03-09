import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { TeacherNavigation } from './TeacherNavigation';
import { ROUTES } from '../../constants/routes';

// Mock NotificationBell component
vi.mock('../notifications/NotificationBell', () => ({
    NotificationBell: ({ userId }: { userId: string }) => (
        <div data-testid="notification-bell">{userId}</div>
    ),
}));

describe('TeacherNavigation', () => {
    const mockOnNavigate = vi.fn();
    const mockOnLogout = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderComponent = (props = {}, route = '/lobby') => {
        return render(
            <MantineProvider>
                <MemoryRouter initialEntries={[route]}>
                    <TeacherNavigation
                        userId="test-user-123"
                        userDisplayName="Ms Linh"
                        userEmail="ms.linh@example.com"
                        onNavigate={mockOnNavigate}
                        onLogout={mockOnLogout}
                        {...props}
                    />
                </MemoryRouter>
            </MantineProvider>
        );
    };

    it('renders all navigation buttons and profile trigger', () => {
        renderComponent();

        expect(screen.getByText('Materials')).toBeInTheDocument();
        expect(screen.getByText('Students')).toBeInTheDocument();
        expect(screen.getByText('Classes')).toBeInTheDocument();
        expect(screen.getByText('Courses')).toBeInTheDocument();
        expect(screen.getByText('Sessions')).toBeInTheDocument();
        expect(screen.getByText('Ms Linh')).toBeInTheDocument();
    });

    it('renders notification bell when userId is provided', () => {
        renderComponent({ userId: 'user-123' });
        expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    });

    it('does not render notification bell when userId is not provided', () => {
        renderComponent({ userId: undefined });
        expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument();
    });

    it('calls onNavigate when Materials button is clicked', () => {
        renderComponent();

        const materialsButton = screen.getByText('Materials');
        fireEvent.click(materialsButton);

        expect(mockOnNavigate).toHaveBeenCalledWith(ROUTES.LOBBY, 'nav_to_materials');
    });

    it('calls onNavigate when Students button is clicked (teacher role)', () => {
        renderComponent({ userRole: 'teacher' });

        const studentsButton = screen.getByText('Students');
        fireEvent.click(studentsButton);

        expect(mockOnNavigate).toHaveBeenCalledWith(ROUTES.TEACHER_STUDENTS, 'nav_to_students');
    });

    it('calls onNavigate with admin route when Students button is clicked (super_admin role)', () => {
        renderComponent({ userRole: 'super_admin' });

        const studentsButton = screen.getByText('Students');
        fireEvent.click(studentsButton);

        expect(mockOnNavigate).toHaveBeenCalledWith(ROUTES.ADMIN_USERS, 'nav_to_users');
    });

    it('calls onNavigate when Classes button is clicked', () => {
        renderComponent();

        const classesButton = screen.getByText('Classes');
        fireEvent.click(classesButton);

        expect(mockOnNavigate).toHaveBeenCalledWith(ROUTES.TEACHER_CLASSES, 'nav_to_classes');
    });

    it('calls onNavigate when Courses button is clicked', () => {
        renderComponent();

        const coursesButton = screen.getByText('Courses');
        fireEvent.click(coursesButton);

        expect(mockOnNavigate).toHaveBeenCalledWith(ROUTES.TEACHER_COURSES, 'nav_to_courses');
    });

    it('calls onNavigate when Sessions button is clicked', () => {
        renderComponent();

        const sessionsButton = screen.getByText('Sessions');
        fireEvent.click(sessionsButton);

        expect(mockOnNavigate).toHaveBeenCalledWith(ROUTES.SESSIONS, 'nav_to_sessions');
    });

    it('calls onLogout when Logout menu item is clicked', () => {
        renderComponent();

        const profileMenuTrigger = screen.getByRole('button', { name: /open profile menu/i });
        fireEvent.click(profileMenuTrigger);

        const logoutButton = screen.getByRole('menuitem', { name: 'Logout' });
        fireEvent.click(logoutButton);

        expect(mockOnLogout).toHaveBeenCalled();
    });

    it('navigates to profile when Profile menu item is clicked', () => {
        renderComponent();

        const profileMenuTrigger = screen.getByRole('button', { name: /open profile menu/i });
        fireEvent.click(profileMenuTrigger);

        const profileMenuItem = screen.getByRole('menuitem', { name: 'Profile' });
        fireEvent.click(profileMenuItem);

        expect(mockOnNavigate).toHaveBeenCalledWith(ROUTES.PROFILE, 'nav_to_profile');
    });

    it('highlights Materials button when on lobby route', () => {
        renderComponent({}, '/lobby');

        const materialsButton = screen.getByText('Materials');
        const buttonElement = materialsButton.closest('button');

        // Check if it has primary variant (active state)
        // The Button component applies CSS classes
        expect(buttonElement?.className).toContain('btn-primary');
    });

    it('highlights Classes button when on classes route', () => {
        renderComponent({}, ROUTES.TEACHER_CLASSES);

        const classesButton = screen.getByText('Classes');
        const buttonElement = classesButton.closest('button');

        expect(buttonElement?.className).toContain('btn-primary');
    });

    it('renders visual dividers between navigation groups', () => {
        const { container } = renderComponent();

        // There should be 3 dividers (after Materials, after Management group, after Sessions)
        const dividers = container.querySelectorAll('div[style*="rgba(203, 213, 225, 0.5)"]');
        expect(dividers.length).toBeGreaterThanOrEqual(3);
    });

    it('uses text-only buttons (no icons) as per PRD requirements', () => {
        renderComponent();

        // Check that button text content doesn't contain common icon indicators
        const materialsButton = screen.getByText('Materials');
        expect(materialsButton.textContent).toBe('Materials'); // No icon prefixes/suffixes

        const classesButton = screen.getByText('Classes');
        expect(classesButton.textContent).toBe('Classes');
    });
});
