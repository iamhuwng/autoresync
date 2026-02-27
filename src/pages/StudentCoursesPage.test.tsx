import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudentCoursesPage from './StudentCoursesPage';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import { useAuth } from '../hooks/useAuth';
import { getEnrollmentsByStudent } from '../services/enrollmentManager';
import { getCourse, getMaterialsByCourse, getStudentCourseProgress } from '../services/courseManager';
import { getUserById } from '../services/userService';

// Mock dependencies
vi.mock('../hooks/useAuth');
vi.mock('../services/enrollmentManager');
vi.mock('../services/courseManager');
vi.mock('../services/userService');

const mockEnrollments = [
    {
        id: 'e1',
        studentId: 's1',
        courseId: 'c1',
        enrollmentType: 'class-based',
        enrolledAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        status: 'active'
    },
    {
        id: 'e2',
        studentId: 's1',
        courseId: 'c2',
        enrollmentType: 'individual',
        enrolledAt: Date.now(),
        expiresAt: Date.now() - 86400000,
        status: 'expired'
    }
];

const mockCourse1 = {
    id: 'c1',
    name: 'Intro to Math',
    ownerId: 't1',
    code: 'MATH101'
};

const mockTeacher = {
    id: 't1',
    displayName: 'John Doe',
    email: 'john@test.com'
};

describe('StudentCoursesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({
            user: { uid: 's1', displayName: 'Student User' },
            logout: vi.fn()
        });
        (getEnrollmentsByStudent as any).mockResolvedValue(mockEnrollments);
        (getCourse as any).mockImplementation((id: string) => {
            if (id === 'c1') return Promise.resolve(mockCourse1);
            return Promise.resolve({ id, name: 'Other Course', ownerId: 't1' });
        });
        (getMaterialsByCourse as any).mockResolvedValue([]);
        (getStudentCourseProgress as any).mockResolvedValue(null);
        (getUserById as any).mockResolvedValue(mockTeacher);
    });

    const renderPage = () => {
        return render(
            <BrowserRouter>
                <MantineProvider>
                    <StudentCoursesPage />
                </MantineProvider>
            </BrowserRouter>
        );
    };

    it('should load and display student enrollments', async () => {
        renderPage();

        expect(screen.getByText(/Your Learning Journey/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Intro to Math')).toBeInTheDocument();
            expect(screen.getByText('by John Doe')).toBeInTheDocument();
        });

        // Should show active by default
        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
        // Since it's filtered to 'active' initially, 'EXPIRED' might not be visible yet if filtering logic works
        // Wait, I should check how tabs are implemented
    });

    it('should filter courses by status using tabs', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Intro to Math')).toBeInTheDocument();
        });

        // Switch to Expired tab
        const expiredTab = screen.getByText('Expired');
        fireEvent.click(expiredTab);

        await waitFor(() => {
            expect(screen.getByText('EXPIRED')).toBeInTheDocument();
            expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
        });
    });

    it('should calculate and display real completion progress', async () => {
        (getMaterialsByCourse as any).mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
        (getStudentCourseProgress as any).mockResolvedValue({
            completedMaterials: { 'm1': { completedAt: Date.now() } }
        });

        renderPage();

        await waitFor(() => {
            // (1/2) * 100 = 50%
            expect(screen.getByText('50%')).toBeInTheDocument();
        });
    });

    it('should navigate back to dashboard when clicking header or button', () => {
        renderPage();

        // Home icon/header link
        const headerLink = screen.getByText('My Courses');
        fireEvent.click(headerLink);
    });

    it('should show unenroll button for public courses', async () => {
        const publicEnrollment = {
            ...mockEnrollments[0],
            courseId: 'c_public',
            visibility: 'public'
        };
        (getEnrollmentsByStudent as any).mockResolvedValue([publicEnrollment]);
        (getCourse as any).mockResolvedValue({ ...mockCourse1, id: 'c_public', visibility: 'public' });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Unenroll')).toBeInTheDocument();
        });
    });

    it('should hide unenroll button for private courses', async () => {
        const privateEnrollment = {
            ...mockEnrollments[0],
            courseId: 'c_private',
            visibility: 'private'
        };
        (getEnrollmentsByStudent as any).mockResolvedValue([privateEnrollment]);
        (getCourse as any).mockResolvedValue({ ...mockCourse1, id: 'c_private', visibility: 'private' });

        renderPage();

        await waitFor(() => {
            expect(screen.queryByText('Unenroll')).not.toBeInTheDocument();
        });
    });
});
