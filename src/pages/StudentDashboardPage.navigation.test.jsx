import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentDashboardPage from './StudentDashboardPage';

const {
    navigateToMock,
    trackActionMock,
    markNotificationAsReadMock,
    getNotificationsMock,
    getStudentResultsMock,
    useResolvedStudentShellDataMock,
    cleanupExpiredProgressMock,
} = vi.hoisted(() => ({
    navigateToMock: vi.fn(),
    trackActionMock: vi.fn(),
    markNotificationAsReadMock: vi.fn(),
    getNotificationsMock: vi.fn(),
    getStudentResultsMock: vi.fn(),
    useResolvedStudentShellDataMock: vi.fn(),
    cleanupExpiredProgressMock: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'student-123',
            email: 'student@test.com',
            displayName: 'Test Student',
        },
        profile: {},
    }),
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: navigateToMock,
    }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({
        trackAction: trackActionMock,
    }),
}));

vi.mock('../hooks/useMediaQuery', () => ({
    useMediaQuery: () => false,
}));

vi.mock('../context/StudentShellDataContext', () => ({
    useResolvedStudentShellData: () => useResolvedStudentShellDataMock(),
}));

vi.mock('../services/testResults.service', () => ({
    getStudentResults: (...args) => getStudentResultsMock(...args),
}));

vi.mock('../services/notificationService', () => ({
    getPaginatedUserNotifications: (...args) => getNotificationsMock(...args),
    markNotificationAsRead: (...args) => markNotificationAsReadMock(...args),
    subscribeToNewNotifications: () => () => {},
}));

vi.mock('../services/classManager', () => ({
    enrollStudent: vi.fn(),
}));

vi.mock('../services/sessionService', () => ({
    sessionService: {
        setPlayerData: vi.fn(),
    },
}));

vi.mock('../services/firebase', () => ({
    database: {},
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    get: vi.fn(),
}));

vi.mock('../hooks/solo/useSoloAutoSave', () => ({
    cleanupExpiredProgress: (...args) => cleanupExpiredProgressMock(...args),
}));

vi.mock('../components/layout/StudentLayout', () => ({
    StudentLayout: ({ children, rightPanel }) => (
        <div>
            <div data-testid="student-layout">{children}</div>
            <div data-testid="student-right-rail">{rightPanel}</div>
        </div>
    ),
}));

vi.mock('../components/layout/StudentSidebar', () => ({
    StudentSidebar: () => <div data-testid="student-sidebar" />,
}));

vi.mock('../components/dashboard/PendingReviewsWidget', () => ({
    __esModule: true,
    default: () => <div data-testid="pending-reviews-widget">Pending reviews</div>,
}));

vi.mock('../components/results/DeferredResultSlidePanel', () => ({
    DeferredResultSlidePanel: () => null,
}));

vi.mock('../components/dashboard/StudentDashboardFeedView', () => ({
    __esModule: true,
    default: ({ feedRows = [], onOpenAcademicHistory }) => (
        <div>
            <button type="button" onClick={onOpenAcademicHistory}>
                Academic History
            </button>
            {feedRows.map(row => (
                <button key={row.id} type="button" onClick={row.onPress}>
                    {row.title}
                </button>
            ))}
        </div>
    ),
}));

const makeShellData = () => ({
    enrolledClasses: [],
    classLiveSessions: [],
    notStarted: [],
    sortedAssignments: [],
    completed: [],
    refreshClasses: vi.fn(),
    refreshHomeworkData: vi.fn(),
});

describe('StudentDashboardPage navigation portability', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useResolvedStudentShellDataMock.mockReturnValue(makeShellData());
        getStudentResultsMock.mockResolvedValue([]);
        getNotificationsMock.mockResolvedValue({
            notifications: [],
            hasMore: false,
            lastKey: undefined,
        });
        markNotificationAsReadMock.mockResolvedValue({ success: true });
    });

    it('routes internal notification links through useNavigation', async () => {
        getNotificationsMock.mockResolvedValue({
            notifications: [{
                id: 'notif-library',
                title: 'Open Library',
                message: 'Continue in the practice library.',
                link: '/student/library',
                createdAt: Date.now(),
                read: false,
                metadata: {},
            }],
            hasMore: false,
            lastKey: undefined,
        });

        render(<StudentDashboardPage />);

        fireEvent.click(await screen.findByRole('button', { name: 'Open Library' }));

        await waitFor(() => {
            expect(navigateToMock).toHaveBeenCalledWith(
                'STUDENT_LIBRARY',
                {},
                { reason: 'dashboard_notification_link' },
            );
        });
    });

    it('opens external notification links outside the SPA router', async () => {
        const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

        getNotificationsMock.mockResolvedValue({
            notifications: [{
                id: 'notif-external',
                title: 'External Resource',
                message: 'Open the official guide.',
                link: 'https://example.com/guide',
                createdAt: Date.now(),
                read: false,
                metadata: {},
            }],
            hasMore: false,
            lastKey: undefined,
        });

        render(<StudentDashboardPage />);

        fireEvent.click(await screen.findByRole('button', { name: 'External Resource' }));

        await waitFor(() => {
            expect(windowOpenSpy).toHaveBeenCalledWith(
                'https://example.com/guide',
                '_blank',
                'noopener,noreferrer',
            );
        });
        expect(navigateToMock).not.toHaveBeenCalled();

        windowOpenSpy.mockRestore();
    });

    it('routes the Academic Record CTA through useNavigation', async () => {
        render(<StudentDashboardPage />);

        fireEvent.click(await screen.findByRole('button', { name: 'Academic History' }));

        expect(navigateToMock).toHaveBeenCalledWith(
            'STUDENT_ACADEMIC_RECORD',
            undefined,
            { reason: 'dashboard_open_academic_history' },
        );
    });
});
