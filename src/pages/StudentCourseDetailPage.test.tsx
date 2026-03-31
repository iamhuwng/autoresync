import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import StudentCourseDetailPage from './StudentCourseDetailPage';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { getCourse, getModulesByCourse, getMaterialsByCourse, getStudentCourseProgress } from '../services/courseManager';
import { getEnrollmentsByStudent } from '../services/enrollmentManager';
import { getClass } from '../services/classManager';
import { useResolvedStudentHomeworkList, useResolvedStudentShellData } from '../context/StudentShellDataContext';

// Mock dependencies
vi.mock('../hooks/useAuth');
vi.mock('../hooks/useNavigation');
vi.mock('../services/courseManager');
vi.mock('../services/enrollmentManager');
vi.mock('../services/classManager');
vi.mock('../context/StudentShellDataContext');
vi.mock('../services/firebase', () => ({ database: {} }));
vi.mock('../services/draftCloudService', () => ({ testDraftService: {} }));
vi.mock('../services/writingSubmissionService', () => ({}));
vi.mock('firebase/database', () => ({
    ref: vi.fn((_database: unknown, path: string) => path),
    get: vi.fn(async () => ({
        exists: () => true,
        val: () => ({ title: 'Session Material', type: 'Test' }),
    })),
    update: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
    push: vi.fn(() => ({ key: 'mock-key' })),
    onValue: vi.fn(),
    off: vi.fn(),
}));
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ courseId: 'c1' })
    };
});

const mockCourse = {
    id: 'c1',
    name: 'Advanced Math',
    type: 'THPT',
    ownerId: 't1'
};

const mockModules = [
    { id: 'm1', name: 'Module 1', order: 0, courseId: 'c1', accessType: 'open' },
    { id: 'm2', name: 'Module 2', order: 1, courseId: 'c1', accessType: 'sequential' }
];

const mockMaterials = [
    { id: 'lm1', courseId: 'c1', moduleId: 'm1', materialId: 'test1', order: 0, isCopy: false }
];

const mockEnrollments = [
    { id: 'e1', studentId: 's1', courseId: 'c1', status: 'active', sourceClassId: 'class1', enrollmentType: 'class-based' }
];

const mockClass = {
    id: 'class1',
    name: 'Class A',
    moduleProgress: {
        'm2': { status: 'locked' }
    }
};

const mockShellData = {
    enrolledClasses: [],
    classLiveSessions: [],
    sortedAssignments: [],
    notStarted: [],
    inProgress: [],
    overdue: [],
    homeworkItems: [],
    completed: [],
    isClassesLoading: false,
    isHomeworkLoading: false,
    homeworkError: null,
    refreshClasses: vi.fn(),
    refreshHomeworkData: vi.fn(),
};

const mockHomeworkList = {
    homeworkItems: [],
    notStarted: [],
    inProgress: [],
    completed: [],
    overdue: [],
    isLoading: false,
    error: null,
    refreshData: vi.fn(),
};

describe('StudentCourseDetailPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({
            user: { uid: 's1', displayName: 'Student User' }
        });
        (useNavigation as any).mockReturnValue({
            navigateTo: vi.fn()
        });
        (getCourse as any).mockResolvedValue(mockCourse);
        (getModulesByCourse as any).mockResolvedValue(mockModules);
        (getMaterialsByCourse as any).mockResolvedValue(mockMaterials);
        (getEnrollmentsByStudent as any).mockResolvedValue(mockEnrollments);
        (getStudentCourseProgress as any).mockResolvedValue({ completedMaterials: {} });
        (getClass as any).mockResolvedValue(mockClass);
        (useResolvedStudentHomeworkList as any).mockReturnValue(mockHomeworkList);
        (useResolvedStudentShellData as any).mockReturnValue(mockShellData);
    });

    const renderPage = () => {
        return render(
            <BrowserRouter>
                <MantineProvider>
                    <StudentCourseDetailPage />
                </MantineProvider>
            </BrowserRouter>
        );
    };

    it('should display course details and modules', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Advanced Math')).toBeInTheDocument();
            expect(screen.getByText('Module 1')).toBeInTheDocument();
            expect(screen.getByText('Module 2')).toBeInTheDocument();
        });
    });

    it('should show module status (Locked/Available)', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Locked')).toBeInTheDocument();
            expect(screen.getByText('Available')).toBeInTheDocument();
        });
    });

    it('should show materials within an expanded module', async () => {
        renderPage();

        await waitFor(() => {
            const module1 = screen.getByText('Module 1');
            module1.click();
        });

        await waitFor(() => {
            expect(screen.getByText('Session Material')).toBeInTheDocument();
        });
    });

    it('should show class context alert', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Class A')).toBeInTheDocument();
            expect(screen.getByText(/Linked to class:/i)).toBeInTheDocument();
        });
    });
});
