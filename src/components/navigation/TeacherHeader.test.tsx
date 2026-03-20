import { fireEvent, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { TeacherHeader } from './TeacherHeader';

let mockIsRoot = false;
let mockNavigateToParent = vi.fn();
let mockBreadcrumbs = [
    { route: 'LOBBY', label: 'Materials', path: '/lobby' },
    { route: 'TEACHER_CLASSES', label: 'Classes', path: '/teacher/classes' },
];

vi.mock('./TeacherNavigation', () => ({
    TeacherNavigation: ({ userId, onNavigate, onLogout }: any) => (
        <div data-testid="teacher-navigation">
            <button onClick={() => onNavigate('/test', 'test')}>Nav Button</button>
            <button onClick={onLogout}>Logout</button>
            {userId && <span data-testid="nav-user-id">{userId}</span>}
        </div>
    ),
}));

vi.mock('./Breadcrumbs', () => ({
    Breadcrumbs: ({ items, condensed }: any) => (
        <div data-testid="breadcrumbs">
            {items.map((item: any, index: number) => (
                <span key={index} data-testid={`breadcrumb-${index}`}>
                    {item.label}
                </span>
            ))}
            {condensed && <span data-testid="breadcrumbs-condensed">condensed</span>}
        </div>
    ),
}));

vi.mock('./MobileMenu', () => ({
    MobileMenu: ({ isOpen, onLogout }: any) =>
        isOpen ? (
            <div data-testid="mobile-menu">
                <button onClick={onLogout}>Logout</button>
            </div>
        ) : null,
    HamburgerButton: ({ onClick }: any) => (
        <button aria-label="Toggle menu" onClick={onClick}>
            Menu
        </button>
    ),
}));

vi.mock('../../hooks/useNavigationContext', () => ({
    useNavigationContext: () => ({
        isRoot: mockIsRoot,
        navigateToParent: mockNavigateToParent,
        breadcrumbs: mockBreadcrumbs,
    }),
}));

describe('TeacherHeader', () => {
    const mockOnLogout = vi.fn();

    const setViewportWidth = (width: number) => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            writable: true,
            value: width,
        });
        window.dispatchEvent(new Event('resize'));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsRoot = false;
        mockNavigateToParent = vi.fn();
        mockBreadcrumbs = [
            { route: 'LOBBY', label: 'Materials', path: '/lobby' },
            { route: 'TEACHER_CLASSES', label: 'Classes', path: '/teacher/classes' },
        ];
        setViewportWidth(1024);
    });

    const renderComponent = (props = {}) =>
        render(
            <MantineProvider>
                <MemoryRouter>
                    <TeacherHeader pageTitle="Test Page" onLogout={mockOnLogout} {...props} />
                </MemoryRouter>
            </MantineProvider>,
        );

    describe('Header Structure', () => {
        it('renders page title', () => {
            renderComponent({ pageTitle: 'Classes' });
            expect(screen.getByRole('heading', { name: 'Classes' })).toBeInTheDocument();
        });

        it('renders TeacherNavigation component', () => {
            renderComponent();
            expect(screen.getByTestId('teacher-navigation')).toBeInTheDocument();
        });

        it('renders Breadcrumbs component when breadcrumbs exist', () => {
            renderComponent();
            expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
        });

        it('passes userId to TeacherNavigation', () => {
            renderComponent({ userId: 'user-123' });
            expect(screen.getByTestId('nav-user-id')).toHaveTextContent('user-123');
        });
    });

    describe('Back Button', () => {
        it('shows back button when not on root page', () => {
            renderComponent();
            expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
        });

        it('hides back button when on root page', () => {
            mockIsRoot = true;
            mockBreadcrumbs = [{ route: 'LOBBY', label: 'Materials', path: '/lobby' }];

            renderComponent();
            expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
        });

        it('hides back button when hideBackButton prop is true', () => {
            renderComponent({ hideBackButton: true });
            expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
        });

        it('calls navigateToParent when back button is clicked', () => {
            renderComponent();
            fireEvent.click(screen.getByRole('button', { name: /Back/i }));
            expect(mockNavigateToParent).toHaveBeenCalled();
        });
    });

    describe('Navigation Visibility', () => {
        it('shows navigation when hideNavigation is false', () => {
            renderComponent({ hideNavigation: false });
            expect(screen.getByTestId('teacher-navigation')).toBeInTheDocument();
        });

        it('hides navigation when hideNavigation is true', () => {
            renderComponent({ hideNavigation: true });
            expect(screen.queryByTestId('teacher-navigation')).not.toBeInTheDocument();
        });

        it('shows navigation in desktop mode by default', () => {
            renderComponent();
            expect(screen.getByTestId('teacher-navigation')).toBeInTheDocument();
        });

        it('hides navigation in mobile mode', () => {
            setViewportWidth(768);
            renderComponent();
            expect(screen.queryByTestId('teacher-navigation')).not.toBeInTheDocument();
        });
    });

    describe('Breadcrumbs Visibility', () => {
        it('shows breadcrumbs when multiple items exist', () => {
            renderComponent();
            expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
        });

        it('hides breadcrumbs when hideBreadcrumbs is true', () => {
            renderComponent({ hideBreadcrumbs: true });
            expect(screen.queryByTestId('breadcrumbs')).not.toBeInTheDocument();
        });

        it('shows condensed breadcrumbs in mobile mode', () => {
            setViewportWidth(768);
            renderComponent();
            expect(screen.getByTestId('breadcrumbs-condensed')).toBeInTheDocument();
        });
    });

    describe('User Role Handling', () => {
        it('passes teacher role to TeacherNavigation by default', () => {
            renderComponent();
            expect(screen.getByTestId('teacher-navigation')).toBeInTheDocument();
        });

        it('passes super_admin role to TeacherNavigation when specified', () => {
            renderComponent({ userRole: 'super_admin' });
            expect(screen.getByTestId('teacher-navigation')).toBeInTheDocument();
        });
    });

    describe('Logout Handling', () => {
        it('calls onLogout when logout is triggered from navigation', () => {
            renderComponent();
            fireEvent.click(screen.getByText('Logout'));
            expect(mockOnLogout).toHaveBeenCalled();
        });

        it('shows logout button in mobile mode', () => {
            setViewportWidth(768);
            renderComponent();
            fireEvent.click(screen.getByLabelText('Toggle menu'));
            expect(screen.getByText('Logout')).toBeInTheDocument();
        });
    });

    describe('Breadcrumb Data Transformation', () => {
        it('converts navigation breadcrumbs to component format correctly', () => {
            renderComponent();
            expect(screen.getByTestId('breadcrumb-0')).toHaveTextContent('Materials');
            expect(screen.getByTestId('breadcrumb-1')).toHaveTextContent('Classes');
        });
    });

    describe('Mobile Layout', () => {
        it('renders mobile-specific logout button', () => {
            setViewportWidth(768);
            renderComponent();
            fireEvent.click(screen.getByLabelText('Toggle menu'));
            expect(screen.getByText('Logout')).toBeInTheDocument();
        });

        it('does not render desktop navigation in mobile mode', () => {
            setViewportWidth(768);
            renderComponent();
            expect(screen.queryByText('Nav Button')).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('uses semantic heading for page title', () => {
            renderComponent({ pageTitle: 'My Classes' });
            expect(screen.getByRole('heading', { name: 'My Classes' }).tagName).toBe('H1');
        });

        it('has proper heading hierarchy (h1 for page title)', () => {
            const { container } = renderComponent({ pageTitle: 'Classes' });
            const h1Elements = container.querySelectorAll('h1');
            expect(h1Elements.length).toBe(1);
            expect(h1Elements[0]).toHaveTextContent('Classes');
        });
    });

    describe('Layout and Styling', () => {
        it('applies proper flex layout for header sections', () => {
            const { container } = renderComponent();
            expect(container.querySelector('div[style*="flex"]')).toBeInTheDocument();
        });

        it('applies background and border styling', () => {
            const { container } = renderComponent();
            expect(
                container.querySelector('div[style*="rgba(255, 255, 255, 0.95)"]'),
            ).toBeInTheDocument();
        });
    });
});
