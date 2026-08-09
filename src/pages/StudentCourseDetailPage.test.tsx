import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentCourseDetailPage from './StudentCourseDetailPage';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { getCourse, getModulesByCourse, getMaterialsByCourse, getStudentCourseProgress } from '../services/courseManager';
import { getEnrollmentsByStudent } from '../services/enrollmentManager';
import { getClass } from '../services/classManager';
import { useResolvedStudentHomeworkList, useResolvedStudentShellData } from '../context/StudentShellDataContext';
import { get, ref } from 'firebase/database';

// Mock dependencies
vi.mock('../hooks/useAuth');
vi.mock('../hooks/useNavigation');
vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));
vi.mock('../services/courseManager');
vi.mock('../services/enrollmentManager');
vi.mock('../services/classManager');
vi.mock('../context/StudentShellDataContext');
vi.mock('../services/firebase', () => ({ database: {} }));
vi.mock('../services/draftCloudService', () => ({ testDraftService: {} }));
vi.mock('../services/writingSubmissionService', () => ({}));
const bookMocks = vi.hoisted(() => ({ enabled: false, prepare: vi.fn(), navigateTo: vi.fn() }));
vi.mock('../services/book-delivery/courseBookPlacement.browser', () => ({
    isCourseBookPlacementPresentationEnabled: () => bookMocks.enabled,
    createCourseBookPlacementBrowserClient: () => ({ prepare: bookMocks.prepare }),
}));
vi.mock('firebase/database', () => ({
    getDatabase: vi.fn(() => ({})),
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
        bookMocks.enabled = false;
        bookMocks.prepare.mockResolvedValue({ bindingId: 'binding-1' });
        (ref as any).mockImplementation((_database: unknown, path: string) => path);
        (get as any).mockImplementation(async (path: string) => ({
            exists: () => path.startsWith('tests/'),
            val: () => ({ title: 'Session Material', type: 'Test' }),
        }));
        (useAuth as any).mockReturnValue({
            user: { uid: 's1', displayName: 'Student User' }
        });
        (useNavigation as any).mockReturnValue({
            navigateTo: bookMocks.navigateTo,
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
                <StudentCourseDetailPage />
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

    it('prepares an exact direct-Course Book placement without using legacy material launch', async () => {
        bookMocks.enabled = true;
        (getMaterialsByCourse as any).mockResolvedValue([{
            id: 'course-material-1', courseId: 'c1', moduleId: 'm1', materialId: 'book-1',
            order: 1, isCopy: false, materialKind: 'book-delivery',
            bookDeliveryPlacement: { displayTitle: 'Unit 1: Progress', status: 'active' },
        }]);
        (getEnrollmentsByStudent as any).mockResolvedValue([{
            id: 'enrollment-1', studentId: 's1', courseId: 'c1', status: 'active', enrollmentType: 'individual',
        }]);
        renderPage();

        expect(await screen.findByText('Unit 1: Progress')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start →' })).toHaveStyle({ minHeight: '44px' });
        fireEvent.click(screen.getByRole('button', { name: 'Start →' }));
        await waitFor(() => expect(bookMocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
            courseMaterialId: 'course-material-1', legacyEnrollmentId: 'enrollment-1',
        })));
    });

    it('navigates a canonical Course Book projection with stable query identity', async () => {
        bookMocks.enabled = true;
        bookMocks.prepare.mockResolvedValue({
            projectionKind: 'book-runtime-delivery',
            bindingId: 'binding-1',
            context: { kind: 'course', contextId: 'course-material-1' },
        });
        (getMaterialsByCourse as any).mockResolvedValue([{
            id: 'course-material-1', courseId: 'c1', moduleId: 'm1', materialId: 'book-1',
            order: 1, isCopy: false, materialKind: 'book-delivery',
            bookDeliveryPlacement: { displayTitle: 'Unit 1: Progress', status: 'active' },
        }]);
        (getEnrollmentsByStudent as any).mockResolvedValue([{
            id: 'enrollment-1', studentId: 's1', courseId: 'c1', status: 'active', enrollmentType: 'individual',
        }]);
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Start →' }));
        await waitFor(() => expect(bookMocks.navigateTo).toHaveBeenCalledWith(
            'STUDENT_PRACTICE',
            expect.objectContaining({
                materialId: expect.stringContaining('bookSurface=course'),
            }),
            expect.objectContaining({ reason: 'course_book_runtime_launch' }),
        ));
        const params = bookMocks.navigateTo.mock.calls.at(-1)?.[1] as { materialId?: string };
        expect(params.materialId).toContain('courseMaterialId=course-material-1');
        expect(params.materialId).toContain('bindingId=binding-1');
    });

    it('falls back to legacy test metadata when the Reading V2 metadata probe is denied', async () => {
        (get as any).mockImplementation(async (path: string) => {
            if (path === 'reading_v2/material_metadata/test1') {
                throw new Error('Permission denied');
            }

            if (path === 'tests/test1') {
                return {
                    exists: () => true,
                    val: () => ({ title: 'Legacy Course Material', type: 'Test' }),
                };
            }

            return {
                exists: () => false,
                val: () => null,
            };
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Legacy Course Material')).toBeInTheDocument();
        });
        expect(screen.queryByText('Permission denied')).not.toBeInTheDocument();
    });

    it('should show class context alert', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Class A')).toBeInTheDocument();
            expect(screen.getByText(/Linked to class:/i)).toBeInTheDocument();
        });
    });

    it('enriches Reading V2 course materials from published metadata and student-safe projections', async () => {
        (getMaterialsByCourse as any).mockResolvedValue([
            { id: 'lm1', courseId: 'c1', moduleId: 'm1', materialId: 'reading-v2-1', order: 0, isCopy: false },
        ]);
        (get as any).mockImplementation(async (path: string) => {
            const valueByPath: Record<string, unknown> = {
                'reading_v2/material_metadata/reading-v2-1': {
                    materialId: 'reading-v2-1',
                    ownerId: 'teacher-1',
                    deliveryEngine: 'reading-v2',
                    productLabel: 'Reading V2',
                    title: 'Course Reading V2',
                    materialKind: 'full-test',
                    durationMinutes: 40,
                    difficulty: 'intermediate',
                    description: '',
                    tags: [],
                    visibility: 'assigned-only',
                    publishedSnapshotVersionId: 'snapshot-1',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                    relationshipSurfaces: ['course-material'],
                },
                'reading_v2/projections/student_safe_tests/reading-v2-1:snapshot-1': {
                    deliveryEngine: 'reading-v2',
                    plane: 'projection',
                    projectionKind: 'student-safe',
                    sourceSnapshotVersionId: 'snapshot-1',
                    content: {
                        taskGroups: [{ interactions: [{ interactionId: 'q1' }] }],
                    },
                },
            };
            const value = valueByPath[path];
            return {
                exists: () => value !== undefined,
                val: () => value,
            };
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Course Reading V2')).toBeInTheDocument();
        });
        expect((ref as any).mock.calls.map((call: unknown[]) => call[1])).not.toContain('tests/reading-v2-1');
    });
});
