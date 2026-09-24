import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import TeacherCourseProfilePage from './TeacherCourseProfilePage';
import { getCourse } from '../services/courseManager';
import { getRequestsByCourse } from '../services/courseRequestManager';
import { getClasses } from '../services/classManager';
import { createCourseAnnouncement, getCourseAnnouncements } from '../services/courseAnnouncementService';
import { ToastContainer } from '../components/modern';

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
        createCourseAnnouncement: vi.fn(),
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
        (getRequestsByCourse as any).mockResolvedValue([mockRequest]);
        (getClasses as any).mockResolvedValue([]);
        (createCourseAnnouncement as any).mockResolvedValue({ success: true });
        (getCourseAnnouncements as any).mockResolvedValue([]);
    });

    const renderPage = () => {
        return render(
            <BrowserRouter>
                <MantineProvider>
                    <TeacherCourseProfilePage />
                    <ToastContainer />
                </MantineProvider>
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

    it('says notifications are queued after saving an announcement', async () => {
        renderPage();

        await waitFor(() => expect(screen.getByText('Test Course')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('tab', { name: 'Announcements' }));
        fireEvent.click(screen.getByRole('button', { name: 'Post Announcement' }));
        fireEvent.change(screen.getByPlaceholderText('e.g., Midterm Exam Schedule Change'), { target: { value: 'Schedule update' } });
        fireEvent.change(screen.getByPlaceholderText('Write your announcement here...'), { target: { value: 'The exam starts at 9.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Post Announcement' }));

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Announcement saved. Student notifications are queued for delivery in the background.'
        );
        expect(createCourseAnnouncement).toHaveBeenCalledTimes(1);
    });
});
