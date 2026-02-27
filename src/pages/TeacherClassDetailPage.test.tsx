
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TeacherClassDetailPage from './TeacherClassDetailPage';
import { classManager } from '../services/classManager';
import { getLinkedCourses } from '../services/enrollmentManager';
import { getCourse, getCoursesByOwner, getModulesByCourse } from '../services/courseManager';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';

// Mock dependencies
vi.mock('../services/classManager', () => ({
    classManager: {
        getClass: vi.fn(),
        subscribeToClass: vi.fn(() => () => { }),
        updateModuleProgress: vi.fn()
    }
}));

vi.mock('../services/enrollmentManager', () => ({
    getLinkedCourses: vi.fn(),
    unlinkCourseFromClass: vi.fn(),
    syncCourseWithOriginal: vi.fn()
}));

vi.mock('../services/courseManager', () => ({
    getCourse: vi.fn(),
    getCoursesByOwner: vi.fn(),
    getModulesByCourse: vi.fn()
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({ navigateTo: vi.fn() })
}));

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 'teacher1', email: 'teacher@test.com' } })
}));

vi.mock('@mantine/notifications', () => ({
    notifications: { show: vi.fn() }
}));

const renderWithProviders = (classId = 'class1') => {
    return render(
        <MantineProvider>
            <MemoryRouter initialEntries={[`/teacher/classes/${classId}`]}>
                <Routes>
                    <Route path="/teacher/classes/:classId" element={<TeacherClassDetailPage />} />
                </Routes>
            </MemoryRouter>
        </MantineProvider>
    );
};

describe('TeacherClassDetailPage', () => {
    const mockClass = {
        id: 'class1',
        name: 'Math Class',
        classCode: 'MATH101',
        students: {},
        assignments: {},
        stats: { activeStudents: 0, completedAssignments: 0 }
    };

    const mockLink = {
        id: 'link1',
        classId: 'class1',
        courseId: 'copy1',
        linkedAt: Date.now(),
        expiresAt: Date.now() + 100000
    };

    const mockCourse = {
        id: 'copy1',
        name: 'Math Course',
        code: 'MATH-COURSE',
        duration: { value: 1, unit: 'months' }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (classManager.getClass as any).mockResolvedValue(mockClass);
        (getLinkedCourses as any).mockResolvedValue([mockLink]);
        (getCourse as any).mockResolvedValue(mockCourse);
        (getCoursesByOwner as any).mockResolvedValue([]);
    });

    it('should show Courses tab and load linked courses', async () => {
        renderWithProviders();

        // Wait for class load
        await waitFor(() => expect(screen.getByText('Math Class')).toBeInTheDocument());

        // Find Courses tab
        const coursesTab = screen.getByText('📚 Courses');
        fireEvent.click(coursesTab);

        // Verify loading courses called
        await waitFor(() => {
            expect(getLinkedCourses).toHaveBeenCalledWith('class1');
            expect(screen.getByText('Math Course')).toBeInTheDocument();
        });

        expect(screen.getByText('MATH-COURSE')).toBeInTheDocument();
        expect(screen.getByText('+ Link Course')).toBeInTheDocument();
    });

    it('should expand course to show modules and allow marking complete', async () => {
        const mockModules = [
            { id: 'mod1', name: 'Module 1', accessType: 'sequential' }
        ];
        (getModulesByCourse as any).mockResolvedValue(mockModules);
        (classManager.updateModuleProgress as any).mockResolvedValue(true);

        renderWithProviders();
        await waitFor(() => expect(screen.getByText('Math Class')).toBeInTheDocument());

        fireEvent.click(screen.getByText('📚 Courses'));
        await waitFor(() => expect(screen.getByText('Math Course')).toBeInTheDocument());

        // Click on the course row to expand
        fireEvent.click(screen.getByText('Math Course'));

        // Verify modules loaded
        await waitFor(() => {
            expect(getModulesByCourse).toHaveBeenCalledWith('copy1');
            expect(screen.getByText('Module 1')).toBeInTheDocument();
            expect(screen.getByText('Unlock')).toBeInTheDocument();
        });

        // Click Unlock
        fireEvent.click(screen.getByText('Unlock'));

        await waitFor(() => {
            expect(classManager.updateModuleProgress).toHaveBeenCalledWith('class1', 'mod1', 'available');
        });
    });
});
