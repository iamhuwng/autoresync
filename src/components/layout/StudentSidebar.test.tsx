import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StudentSidebar } from './StudentSidebar';

const navigateMock = vi.fn();
const logoutMock = vi.fn();
const useMediaQueryMock = vi.fn();

vi.mock('react-router-dom', () => ({
    useNavigate: () => navigateMock,
}));

vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            displayName: 'Student One',
            email: 'student@test.com',
        },
        profile: {
            displayName: 'Student One',
            email: 'student@test.com',
        },
        logout: logoutMock,
    }),
}));

vi.mock('../../hooks/useMediaQuery', () => ({
    useMediaQuery: (...args: unknown[]) => useMediaQueryMock(...args),
}));

describe('StudentSidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useMediaQueryMock.mockReturnValue(false);
    });

    it('raises mobile navigation buttons to a 44px minimum height', () => {
        useMediaQueryMock.mockReturnValue(true);

        render(<StudentSidebar activePage="feed" pendingHomeworkCount={2} />);

        expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveStyle({ minHeight: '44px' });
        expect(screen.getByRole('button', { name: /Homework/ })).toHaveStyle({ minHeight: '44px' });
        expect(screen.getByRole('button', { name: 'Courses' })).toHaveStyle({ minHeight: '44px' });
    });
});
