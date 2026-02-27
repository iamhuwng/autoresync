import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import TeacherCourseProfilePage from './TeacherCourseProfilePage';
import { getCourse } from '../services/courseManager';
import { getRequestsByCourse } from '../services/courseRequestManager';

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
    });

    const renderPage = () => {
        return render(
            <BrowserRouter>
                <MantineProvider>
                    <TeacherCourseProfilePage />
                </MantineProvider>
            </BrowserRouter>
        );
    };

    it('should render course details and tabs', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Test Course')).toBeInTheDocument();
        });

        expect(screen.getByText('Overview')).toBeInTheDocument();
        expect(screen.getByText('Modules')).toBeInTheDocument();
        expect(screen.getByText('Requests')).toBeInTheDocument();
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
});
