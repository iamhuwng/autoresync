import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import CourseCatalogPage from './CourseCatalogPage';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { getPublicCourses, getCourseByCode } from '../services/courseManager';
import { getEnrollmentsByStudent, enrollStudentInCourse } from '../services/enrollmentManager';
import { getUserById } from '../services/userService';

// Mock dependencies
vi.mock('../hooks/useAuth');
vi.mock('../hooks/useNavigation');
vi.mock('../services/courseManager');
vi.mock('../services/enrollmentManager');
vi.mock('../services/userService');

const mockCourses = [
    {
        id: 'c1',
        name: 'Public Math',
        type: 'THPT',
        ownerId: 't1',
        visibility: 'public',
        description: 'Learn math',
        duration: { value: 1, unit: 'months' }
    },
    {
        id: 'c2',
        name: 'Public English',
        type: 'IELTS',
        ownerId: 't2',
        visibility: 'public',
        description: 'Learn english',
        duration: { value: 1, unit: 'months' }
    }
];

const mockUser = { uid: 's1', displayName: 'Student User' };

describe('CourseCatalogPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({ user: mockUser });
        (useNavigation as any).mockReturnValue({ navigateTo: vi.fn() });
        (getPublicCourses as any).mockResolvedValue(mockCourses);
        (getEnrollmentsByStudent as any).mockResolvedValue([]);
        (getUserById as any).mockResolvedValue({ displayName: 'Teacher A' });
        (enrollStudentInCourse as any).mockResolvedValue({ success: true });
    });

    const renderPage = () => {
        return render(
            <BrowserRouter>
                <MantineProvider>
                    <CourseCatalogPage />
                </MantineProvider>
            </BrowserRouter>
        );
    };

    it('should display public courses and their details', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Public Math')).toBeInTheDocument();
            expect(screen.getByText('Public English')).toBeInTheDocument();
            expect(screen.getAllByText(/Instructor: Teacher A/i)).toHaveLength(2);
        });
    });

    it('should filter courses by search text', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Public Math')).toBeInTheDocument();
        });

        const searchInput = screen.getByPlaceholderText('Search courses...');
        fireEvent.change(searchInput, { target: { value: 'Math' } });

        expect(screen.getByText('Public Math')).toBeInTheDocument();
        expect(screen.queryByText('Public English')).not.toBeInTheDocument();
    });

    it('should handle enrollment logic', async () => {
        renderPage();

        await waitFor(() => {
            const enrollButtons = screen.getAllByText('Enroll');
            fireEvent.click(enrollButtons[0]);
        });

        await waitFor(() => {
            expect(enrollStudentInCourse).toHaveBeenCalledWith(
                mockUser.uid,
                mockCourses[0].id,
                'public',
                undefined,
                expect.any(Number)
            );
            expect(screen.getByText('Enrolled')).toBeInTheDocument();
        });
    });

    it('should show already enrolled status', async () => {
        (getEnrollmentsByStudent as any).mockResolvedValue([
            { courseId: 'c1', status: 'active' }
        ]);

        renderPage();

        await waitFor(() => {
            const enrolledBadges = screen.getAllByText('Enrolled');
            expect(enrolledBadges).toHaveLength(1);
            expect(screen.getByText('Enroll')).toBeInTheDocument(); // for c2
        });
    });

    it('should handle join by code', async () => {
        (getCourseByCode as any).mockResolvedValue(mockCourses[1]);

        renderPage();

        const codeInput = screen.getByPlaceholderText('Course Code');
        const joinButton = screen.getByText('Join');

        fireEvent.change(codeInput, { target: { value: 'ENGLISH101' } });
        fireEvent.click(joinButton);

        await waitFor(() => {
            expect(getCourseByCode).toHaveBeenCalledWith('ENGLISH101');
            expect(enrollStudentInCourse).toHaveBeenCalled();
        });
    });
});
