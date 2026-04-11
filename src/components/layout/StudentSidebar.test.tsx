import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StudentSidebar } from './StudentSidebar';

const navigateToMock = vi.fn();
const logoutMock = vi.fn();
const useMediaQueryMock = vi.fn();

vi.mock('../../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: navigateToMock,
    }),
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

        expect(screen.getByRole('button', { name: 'Dashboard' }).style.minHeight).toBe('44px');
        expect(screen.getByRole('button', { name: /Homework/ }).style.minHeight).toBe('44px');
        expect(screen.getByRole('button', { name: 'Courses' }).style.minHeight).toBe('44px');
    });

    it('re-opens Academic Record with reset state when Records is clicked again', () => {
        render(<StudentSidebar activePage="records" pendingHomeworkCount={0} />);

        fireEvent.click(screen.getByRole('button', { name: 'Records' }));

        expect(navigateToMock).toHaveBeenCalledWith(
            'STUDENT_ACADEMIC_RECORD',
            undefined,
            {
                force: true,
                reason: 'student_sidebar_reset_records_view',
                state: { resetRecordsView: true },
            },
        );
    });
});
