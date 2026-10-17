import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import TeacherCourseProfilePage from './TeacherCourseProfilePage';
import { getCourse, updateCourse } from '../services/courseManager';
import { getRequestsByCourse } from '../services/courseRequestManager';
import { getClasses } from '../services/classManager';
import { getCourseAnnouncements } from '../services/courseAnnouncementService';

vi.mock('../components/navigation', () => ({ TeacherHeader: ({ pageTitle }: { pageTitle: string }) => <h1>{pageTitle}</h1> }));
vi.mock('../components/course/ModuleList', () => ({ ModuleList: () => null }));

// Mock dependencies
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ courseId: 'c1' }),
        useNavigate: () => vi.fn()
    };
});

vi.mock('../services/courseManager');
vi.mock('../services/courseRequestManager');
vi.mock('../services/classManager');
vi.mock('../services/courseAnnouncementService', async () => {
    const actual = await vi.importActual('../services/courseAnnouncementService');
    return {
        ...actual,
        getCourseAnnouncements: vi.fn(),
    };
});
vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 't1' } })
}));

const mockCourse = {
    id: 'c1',
    name: 'Test Course',
    code: 'TEST101',
    type: 'THPT',
    visibility: 'public'
};

const mockRequest = {
    id: 'req1',
    studentId: 's1',
    studentName: 'Student X',
    courseId: 'c1',
    type: 'join',
    status: 'pending',
    requestedAt: Date.now(),
    expiresAt: Date.now() + 100000
};

describe('TeacherCourseProfilePage - Requests Tab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (getCourse as any).mockResolvedValue(mockCourse);
        (updateCourse as any).mockResolvedValue({ success: true });
        (getRequestsByCourse as any).mockResolvedValue([mockRequest]);
        (getClasses as any).mockResolvedValue([]);
        (getCourseAnnouncements as any).mockResolvedValue([]);
    });

    const renderPage = () => {
        return render(
            <BrowserRouter>
                    <TeacherCourseProfilePage />
            </BrowserRouter>
        );
    };

    it('should render course details and tabs', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Test Course')).toBeInTheDocument();
        });

        expect(screen.getByText('Course Overview')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Modules' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Announcements' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Students' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Requests' })).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('tab', { name: 'Modules' }), { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Announcements' })).toHaveFocus();
        expect(screen.getByRole('tab', { name: 'Announcements' })).toHaveAttribute('aria-selected', 'true');
    });

    it('should show pending requests when clicking Requests tab', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Test Course')).toBeInTheDocument();
        });

        const requestsTab = screen.getByText('Requests');
        fireEvent.click(requestsTab);

        await waitFor(() => {
            expect(screen.getByText('Student X')).toBeInTheDocument();
            expect(screen.getByText('Enrollment')).toBeInTheDocument();
        });
    });

    it('updates the native enrollment switch and restores it when the save fails', async () => {
        renderPage();
        await waitFor(() => expect(screen.getByText('Test Course')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
        const approval = screen.getByRole('switch', { name: 'Auto-approve with code' });
        expect(approval).not.toBeChecked();
        fireEvent.click(approval);
        await waitFor(() => expect(updateCourse).toHaveBeenCalledWith('c1', { autoApproveWithCode: true }));
        expect(approval).toBeChecked();

        (updateCourse as any).mockResolvedValueOnce({ success: false, error: 'Denied' });
        fireEvent.click(approval);
        await waitFor(() => {
            expect(updateCourse).toHaveBeenCalledTimes(2);
            expect(approval).toBeChecked();
        });
    });
});
