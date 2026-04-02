import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';

import TeacherClassDetailPage from './TeacherClassDetailPage';
import { classManager } from '../services/classManager';
import { getLinkedCourses } from '../services/enrollmentManager';
import { getCourse } from '../services/courseManager';
import { useHomeworkList } from '../hooks/useHomeworkList';

vi.mock('../services/classManager', () => ({
    classManager: {
        getClass: vi.fn(),
        subscribeToClass: vi.fn(() => () => {}),
    },
    removeStudentFromClass: vi.fn(),
    approveClassStudent: vi.fn(),
    rejectClassStudent: vi.fn(),
}));

vi.mock('../services/enrollmentManager', () => ({
    getLinkedCourses: vi.fn(),
    unlinkCourseFromClass: vi.fn(),
    syncCourseWithOriginal: vi.fn(),
}));

vi.mock('../services/courseManager', () => ({
    getCourse: vi.fn(),
}));

vi.mock('../services/courseSyncService', () => ({
    detectSyncUpdates: vi.fn(),
    applySyncMaterials: vi.fn(),
    applySyncNewModule: vi.fn(),
}));

vi.mock('../hooks/useHomeworkList', () => ({
    useHomeworkList: vi.fn(),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({ navigateTo: vi.fn() }),
}));

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'teacher1', email: 'teacher@test.com' },
        profile: { role: 'teacher', displayName: 'Teacher Test', email: 'teacher@test.com' },
    }),
}));

vi.mock('@mantine/notifications', () => ({
    notifications: { show: vi.fn() },
}));

vi.mock('../components/navigation', () => ({
    TeacherHeader: ({ pageTitle }: { pageTitle: string }) => <div>{pageTitle}</div>,
}));

vi.mock('../components/course/LinkCourseModal', () => ({
    LinkCourseModal: () => null,
}));

vi.mock('../components/course/ExtendCourseModal', () => ({
    ExtendCourseModal: () => null,
}));

vi.mock('../components/course/CourseCreateModal', () => ({
    CourseCreateModal: () => null,
}));

vi.mock('../components/course/ModuleList', () => ({
    ModuleList: ({ courseId }: { courseId: string }) => <div>Module list for {courseId}</div>,
}));

vi.mock('../components/homework', () => ({
    HomeworkCard: ({
        homework,
        onClick,
    }: {
        homework: { title?: string; materialTitle: string };
        onClick?: () => void;
    }) => (
        <button type="button" onClick={onClick}>
            {homework.title || homework.materialTitle}
        </button>
    ),
    HomeworkCreateModal: ({ isOpen }: { isOpen: boolean }) => (
        isOpen ? <div>Create homework modal</div> : null
    ),
}));

const renderWithProviders = (classId = 'class1') => render(
    <MantineProvider>
        <MemoryRouter initialEntries={[`/teacher/classes/${classId}`]}>
            <Routes>
                <Route path="/teacher/classes/:classId" element={<TeacherClassDetailPage />} />
            </Routes>
        </MemoryRouter>
    </MantineProvider>
);

describe('TeacherClassDetailPage', () => {
    const mockClass = {
        id: 'class1',
        name: 'Math Class',
        classCode: 'MATH101',
        createdBy: 'teacher1',
        students: {},
        assignments: {},
        stats: { activeStudents: 0, completedAssignments: 0 },
    };

    const mockCourseLink = {
        id: 'link1',
        classId: 'class1',
        courseId: 'copy1',
        linkedAt: Date.now(),
        expiresAt: Date.now() + 100000,
    };

    const mockCourse = {
        id: 'copy1',
        name: 'Math Course',
        code: 'MATH-COURSE',
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (classManager.getClass as any).mockResolvedValue(mockClass);
        (getLinkedCourses as any).mockResolvedValue([mockCourseLink]);
        (getCourse as any).mockResolvedValue(mockCourse);
        (useHomeworkList as any).mockReturnValue({
            filteredHomework: [],
            loading: false,
            error: null,
            refetch: vi.fn(),
            statusCounts: {
                draft: 0,
                scheduled: 0,
                active: 0,
                past_due: 0,
                closed: 0,
            },
        });
    });

    it('loads linked courses when the courses tab opens', async () => {
        renderWithProviders();

        await waitFor(() => expect(screen.getByText('Math Class')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Courses'));

        await waitFor(() => {
            expect(getLinkedCourses).toHaveBeenCalledWith('class1');
            expect(screen.getByText('Math Course')).toBeInTheDocument();
        });
    });

    it('renders class homework from the homework hook', async () => {
        (useHomeworkList as any).mockReturnValue({
            filteredHomework: [
                {
                    id: 'hw-1',
                    title: 'Essay Revision',
                    materialTitle: 'Essay Revision',
                    scheduling: { dueDate: Date.now() + 86400000 },
                    status: 'active',
                    target: { type: 'class', classId: 'class1', className: 'Math Class' },
                    stats: { totalAssigned: 10, started: 4, submitted: 3, lateSubmissions: 0 },
                    config: {
                        timerMinutes: null,
                        maxAttempts: 1,
                        feedbackTiming: 'after_completion',
                        lateSubmissionAllowed: false,
                    },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    createdBy: 'teacher1',
                    materialId: 'mat-1',
                    materialType: 'test',
                    materialSkill: 'writing',
                    visibility: {
                        showTimer: true,
                        showAttempts: true,
                        showDueDate: true,
                        showQuestionCount: true,
                        showDuration: true,
                    },
                },
            ],
            loading: false,
            error: null,
            refetch: vi.fn(),
            statusCounts: {
                draft: 0,
                scheduled: 0,
                active: 1,
                past_due: 0,
                closed: 0,
            },
        });

        renderWithProviders();
        await waitFor(() => expect(screen.getByText('Math Class')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Homework'));

        await waitFor(() => {
            expect(useHomeworkList).toHaveBeenCalled();
            expect(screen.getByText('Essay Revision')).toBeInTheDocument();
        });
    });

    it('opens the class-scoped homework create modal from the homework tab', async () => {
        renderWithProviders();
        await waitFor(() => expect(screen.getByText('Math Class')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Homework'));
        fireEvent.click(screen.getByText('Assign Homework'));

        expect(screen.getByText('Create homework modal')).toBeInTheDocument();
    });
});
