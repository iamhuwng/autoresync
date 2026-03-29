import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherStudentHistoryPage from './TeacherStudentHistoryPage';

const {
    getTeacherStudentResultsMock,
    signOutMock,
    trackActionMock,
    renderResultFiltersMock,
} = vi.hoisted(() => ({
    getTeacherStudentResultsMock: vi.fn(),
    signOutMock: vi.fn(),
    trackActionMock: vi.fn(),
    renderResultFiltersMock: vi.fn(),
}));

const { classifyTeacherResultVisibilityMock } = vi.hoisted(() => ({
    classifyTeacherResultVisibilityMock: vi.fn(),
}));

let ownershipCheckState: {
    allowed: boolean;
    loading: boolean;
    denialReason: string | undefined;
} = {
    allowed: true,
    loading: false,
    denialReason: undefined,
};

let currentUser: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
} | null = {
    uid: 'teacher-1',
    email: 'teacher@example.com',
    displayName: 'Teacher One',
    photoURL: null,
};

vi.mock('firebase/auth', () => ({
    getAuth: () => ({
        currentUser,
    }),
    signOut: signOutMock,
}));

vi.mock('../services/testResults.service', () => ({
    getTeacherStudentResults: getTeacherStudentResultsMock,
}));

vi.mock('../services/resultVisibility.service', () => ({
    classifyTeacherResultVisibility: classifyTeacherResultVisibilityMock,
}));

vi.mock('../hooks/useOwnershipCheck', () => ({
    useStudentDataAccessCheck: () => ownershipCheckState,
}));

vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({
        trackAction: trackActionMock,
    }),
}));

vi.mock('../components/navigation', () => ({
    TeacherHeader: ({ pageTitle }: { pageTitle: string }) => (
        <div>Teacher Header: {pageTitle}</div>
    ),
}));

vi.mock('../components/modern', () => ({
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardBody: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('../components/results/ProgressLineChart', () => ({
    ProgressLineChart: () => <div>Progress Chart</div>,
}));

vi.mock('../components/results/SkillRadarChart', () => ({
    SkillRadarChart: () => <div>Skill Radar</div>,
}));

vi.mock('../components/results/BandScoreProgress', () => ({
    BandScoreProgress: () => <div>Band Progress</div>,
}));

vi.mock('../components/results/ResultFilters', () => ({
    ResultFilters: (props: any) => {
        renderResultFiltersMock(props);
        return <div>Filters</div>;
    },
}));

describe('TeacherStudentHistoryPage', () => {
    const renderPage = () =>
        render(
            <MemoryRouter initialEntries={['/teacher/student/student-1/history']}>
                <Routes>
                    <Route path="/teacher/student/:studentId/history" element={<TeacherStudentHistoryPage />} />
                </Routes>
            </MemoryRouter>,
        );

    beforeEach(() => {
        vi.clearAllMocks();
        ownershipCheckState = {
            allowed: true,
            loading: false,
            denialReason: undefined,
        };

        currentUser = {
            uid: 'teacher-1',
            email: 'teacher@example.com',
            displayName: 'Teacher One',
            photoURL: null,
        };

        getTeacherStudentResultsMock.mockResolvedValue([
            {
                resultId: 'result-1',
                sessionCode: 'session-1',
                testId: 'test-1',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: 'teacher-1',
                totalScore: 18,
                maxScore: 20,
                percentage: 90,
                bandScore: 8,
                questionResults: [],
                correct: 18,
                incorrect: 2,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_000_000,
                timeElapsed: 900_000,
                testDuration: 3_600,
                createdAt: 1_700_000_000_000,
                testTitle: 'Reading Test',
                testType: 'test',
                testSkill: 'reading',
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'session-1',
                    sourceNameSnapshot: 'Reading Test',
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownerResolutionSource: 'session.createdByUserId',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'session-1',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            },
            {
                resultId: 'result-2',
                sessionCode: 'session-2',
                testId: 'test-2',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: 'teacher-2',
                totalScore: 16,
                maxScore: 20,
                percentage: 80,
                bandScore: 7,
                questionResults: [],
                correct: 16,
                incorrect: 4,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_100_000,
                timeElapsed: 850_000,
                testDuration: 3_600,
                createdAt: 1_700_000_100_000,
                testTitle: 'Listening Test',
                testType: 'homework',
                testSkill: 'listening',
                visibility: {
                    contextType: 'homework',
                    sourceType: 'homework',
                    sourceId: 'hw-2',
                    sourceNameSnapshot: 'Listening Test',
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownerResolutionSource: 'homework.createdBy',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: 'hw-2',
                    sessionCode: 'session-2',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            },
        ]);
        classifyTeacherResultVisibilityMock.mockImplementation(({ result }: any) => ({
            shouldDisplayInTeacherHistory: result.resultId === 'result-2',
        }));
    });

    it('renders the teacher shell while the history request is still loading', () => {
        getTeacherStudentResultsMock.mockReturnValue(new Promise(() => {}));

        renderPage();

        expect(screen.getByText('Teacher Header: Student History')).toBeInTheDocument();
        expect(screen.getByText('Loading student history...')).toBeInTheDocument();
    });

    it('keeps the loading shell up while assignment access is still resolving', () => {
        ownershipCheckState = {
            allowed: false,
            loading: true,
            denialReason: undefined,
        };

        renderPage();

        expect(screen.getByText('Teacher Header: Student History')).toBeInTheDocument();
        expect(screen.getByText('Loading student history...')).toBeInTheDocument();
        expect(getTeacherStudentResultsMock).not.toHaveBeenCalled();
    });

    it('loads canonical teacher-student results through the dedicated service path', async () => {
        getTeacherStudentResultsMock.mockResolvedValue([
            {
                resultId: 'teacher-owned-row',
                sessionCode: 'SESSION-TEACHER',
                testId: 'TEST-TEACHER',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: 'teacher-1',
                totalScore: 19,
                maxScore: 20,
                percentage: 95,
                bandScore: 8.5,
                questionResults: [],
                correct: 19,
                incorrect: 1,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_500_000,
                timeElapsed: 700_000,
                testDuration: 3_600,
                createdAt: 1_700_000_500_000,
                testTitle: 'Teacher-Owned Reading',
                testType: 'test',
                testSkill: 'reading',
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'SESSION-TEACHER',
                    sourceNameSnapshot: 'Teacher-Owned Reading',
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownerResolutionSource: 'session.createdByUserId',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'SESSION-TEACHER',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            },
        ]);
        classifyTeacherResultVisibilityMock.mockImplementation(({ result }: any) => ({
            shouldDisplayInTeacherHistory: result.resultId === 'teacher-owned-row',
            excludeFromAnalytics: false,
        }));

        renderPage();

        await screen.findByText("Student One's History");

        expect(getTeacherStudentResultsMock).toHaveBeenCalledWith(
            'teacher-1',
            'student-1',
            undefined,
            { hasAssignmentAccess: true },
        );
        expect(screen.getByText('Teacher-Owned Reading')).toBeInTheDocument();
    });

    it('uses the shared visibility classifier and passes only classified results to ResultFilters', async () => {
        renderPage();

        await screen.findByText("Student One's History");

        expect(screen.queryByText('Reading Test')).not.toBeInTheDocument();
        expect(screen.getByText('Listening Test')).toBeInTheDocument();
        expect(screen.getByText('Teacher Header: Student History')).toBeInTheDocument();

        expect(classifyTeacherResultVisibilityMock.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(classifyTeacherResultVisibilityMock).toHaveBeenCalledWith(
            expect.objectContaining({
                teacherId: 'teacher-1',
                hasAssignmentAccess: true,
                result: expect.objectContaining({ resultId: 'result-1' }),
            }),
        );
        expect(classifyTeacherResultVisibilityMock).toHaveBeenCalledWith(
            expect.objectContaining({
                teacherId: 'teacher-1',
                hasAssignmentAccess: true,
                result: expect.objectContaining({ resultId: 'result-2' }),
            }),
        );

        const latestResultFiltersCall = renderResultFiltersMock.mock.calls.at(-1)?.[0];
        expect(latestResultFiltersCall.results).toEqual([
            expect.objectContaining({ resultId: 'result-2' }),
        ]);
    });

    it('keeps solo-practice rows in the history list while excluding them from analytics cards', async () => {
        getTeacherStudentResultsMock.mockResolvedValue([
            {
                resultId: 'result-owned',
                sessionCode: 'session-owned',
                testId: 'test-owned',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: 'teacher-1',
                totalScore: 18,
                maxScore: 20,
                percentage: 90,
                bandScore: 8,
                questionResults: [],
                correct: 18,
                incorrect: 2,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_000_000,
                timeElapsed: 900_000,
                testDuration: 3_600,
                createdAt: 1_700_000_000_000,
                testTitle: 'Teacher-Owned Reading Test',
                testType: 'test',
                testSkill: 'reading',
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'session-owned',
                    sourceNameSnapshot: 'Teacher-Owned Reading Test',
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownerResolutionSource: 'session.createdByUserId',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'session-owned',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            },
            {
                resultId: 'result-solo',
                sessionCode: 'session-solo',
                testId: 'test-solo',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: 'legacy-raw-teacher',
                totalScore: 12,
                maxScore: 20,
                percentage: 60,
                bandScore: 6,
                questionResults: [],
                correct: 12,
                incorrect: 8,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_100_000,
                timeElapsed: 850_000,
                testDuration: 3_600,
                createdAt: 1_700_000_100_000,
                testTitle: 'Solo Practice Reading',
                testType: 'self_study',
                testSkill: 'reading',
                visibility: {
                    contextType: 'solo_practice',
                    sourceType: 'solo_practice',
                    sourceId: 'solo-source',
                    sourceNameSnapshot: 'Solo Practice Reading',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'solo_practice',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'session-solo',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            },
        ]);

        classifyTeacherResultVisibilityMock.mockImplementation(({ result }: any) => ({
            shouldDisplayInTeacherHistory: true,
            excludeFromAnalytics: result.visibility?.contextType === 'solo_practice',
        }));

        renderPage();

        await screen.findByText("Student One's History");

        expect(screen.getByText('Teacher-Owned Reading Test')).toBeInTheDocument();
        expect(screen.getByText('Solo Practice Reading')).toBeInTheDocument();
        expect(screen.getByTestId('teacher-history-total-tests')).toHaveTextContent('1');
        expect(screen.getByTestId('teacher-history-average-band')).toHaveTextContent('8');
        expect(screen.getByTestId('teacher-history-best-result')).toHaveTextContent('90% (8)');
    });

    it('renders solo-practice and deleted-source badges while unresolved rows remain excluded', async () => {
        getTeacherStudentResultsMock.mockResolvedValue([
            {
                resultId: 'solo-row',
                sessionCode: 'solo-session',
                testId: 'test-solo',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: null,
                totalScore: 15,
                maxScore: 20,
                percentage: 75,
                bandScore: 6.5,
                questionResults: [],
                correct: 15,
                incorrect: 5,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_200_000,
                timeElapsed: 800_000,
                testDuration: 3_600,
                createdAt: 1_700_000_200_000,
                testTitle: 'Solo Reading Practice',
                testType: 'self_study',
                testSkill: 'reading',
                visibility: {
                    contextType: 'solo_practice',
                    sourceType: 'solo_practice',
                    sourceId: 'material-1',
                    sourceNameSnapshot: 'Solo Reading Practice',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'solo_practice',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'solo-session',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                    sourceDeleted: false,
                    sourceArchived: false,
                },
            },
            {
                resultId: 'deleted-row',
                sessionCode: 'session-3',
                testId: 'test-deleted',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: 'teacher-1',
                totalScore: 17,
                maxScore: 20,
                percentage: 85,
                bandScore: 7.5,
                questionResults: [],
                correct: 17,
                incorrect: 3,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_300_000,
                timeElapsed: 700_000,
                testDuration: 3_600,
                createdAt: 1_700_000_300_000,
                testTitle: 'Deleted Homework Source',
                testType: 'homework',
                testSkill: 'listening',
                visibility: {
                    contextType: 'homework',
                    sourceType: 'homework',
                    sourceId: 'hw-deleted',
                    sourceNameSnapshot: 'Deleted Homework Source',
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownerResolutionSource: 'homework.createdBy',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: 'hw-deleted',
                    sessionCode: 'session-3',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                    sourceDeleted: true,
                    sourceArchived: false,
                },
            },
            {
                resultId: 'unresolved-row',
                sessionCode: 'session-4',
                testId: 'test-unresolved',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: null,
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                bandScore: 5,
                questionResults: [],
                correct: 10,
                incorrect: 10,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_400_000,
                timeElapsed: 650_000,
                testDuration: 3_600,
                createdAt: 1_700_000_400_000,
                testTitle: 'Unresolved Ownership Row',
                testType: 'test',
                testSkill: 'reading',
                visibility: {
                    contextType: 'course_material',
                    sourceType: 'course',
                    sourceId: 'course-1',
                    sourceNameSnapshot: 'Unresolved Ownership Row',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                    homeworkId: null,
                    sessionCode: 'session-4',
                    courseId: 'course-1',
                    classId: null,
                    assignmentId: null,
                    sourceDeleted: false,
                    sourceArchived: false,
                },
            },
        ]);

        classifyTeacherResultVisibilityMock.mockImplementation(({ result }: any) => ({
            shouldDisplayInTeacherHistory: result.resultId !== 'unresolved-row',
        }));

        render(
            <MemoryRouter initialEntries={['/teacher/student/student-1/history']}>
                <Routes>
                    <Route path="/teacher/student/:studentId/history" element={<TeacherStudentHistoryPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await screen.findByText("Student One's History");

        expect(screen.getByText('Solo Reading Practice')).toBeInTheDocument();
        expect(screen.getByText('Deleted Homework Source')).toBeInTheDocument();
        expect(screen.queryByText('Unresolved Ownership Row')).not.toBeInTheDocument();

        expect(screen.getByTestId('history-badge-solo-practice-solo-row')).toHaveTextContent('Solo Practice');
        expect(screen.getByTestId('history-badge-deleted-source-deleted-row')).toHaveTextContent('Deleted source');
        expect(screen.queryByText(/teacher-owned/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/legacy\/unverified/i)).not.toBeInTheDocument();
    });

    it('opens permanent result detail when a teacher clicks View', async () => {
        render(
            <MemoryRouter initialEntries={['/teacher/student/student-1/history']}>
                <Routes>
                    <Route path="/teacher/student/:studentId/history" element={<TeacherStudentHistoryPage />} />
                    <Route path="/result/:resultId" element={<div>Result Detail Route</div>} />
                </Routes>
            </MemoryRouter>,
        );

        await screen.findByText('Listening Test');

        fireEvent.click(screen.getByRole('button', { name: /view/i }));

        await screen.findByText('Result Detail Route');

        await waitFor(() => {
            expect(trackActionMock).toHaveBeenCalledWith('viewResults', {
                source: 'teacher_student_history',
                resultId: 'result-2',
                studentId: 'student-1',
                sessionCode: 'session-2',
            });
        });
    });

    it('keeps the teacher shell when auth is missing and shows the error state', async () => {
        currentUser = null;

        renderPage();

        await screen.findByText('Teacher authentication required.');

        expect(screen.getByText('Teacher Header: Student History')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back to Students' })).toBeInTheDocument();
        expect(getTeacherStudentResultsMock).not.toHaveBeenCalled();
        expect(screen.queryByText('Listening Test')).not.toBeInTheDocument();
    });

    it('renders solo-practice rows with canonical label and no generic legacy ownership badges', async () => {
        getTeacherStudentResultsMock.mockResolvedValue([
            {
                resultId: 'solo-visible',
                sessionCode: 'solo-session',
                testId: 'test-solo',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: null,
                totalScore: 12,
                maxScore: 20,
                percentage: 60,
                bandScore: 6,
                questionResults: [],
                correct: 12,
                incorrect: 8,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_200_000,
                timeElapsed: 600_000,
                testDuration: 3_600,
                createdAt: 1_700_000_200_000,
                testTitle: 'Solo Source Snapshot',
                testType: 'solo_practice',
                testSkill: 'reading',
                visibility: {
                    contextType: 'solo_practice',
                    sourceType: 'solo_practice',
                    sourceId: 'material-1',
                    sourceNameSnapshot: 'Solo Source Snapshot',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'solo_practice',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'solo-session',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            },
        ]);

        classifyTeacherResultVisibilityMock.mockReturnValue({
            shouldDisplayInTeacherHistory: true,
            excludeFromAnalytics: true,
        });

        renderPage();

        await screen.findByText("Student One's History");
        expect(screen.getByText('Solo Source Snapshot')).toBeInTheDocument();
        expect(screen.getByTestId('history-badge-solo-practice-solo-visible')).toHaveTextContent('Solo Practice');
        expect(screen.getByTestId('teacher-history-total-tests')).toHaveTextContent('0');
        expect(screen.queryByText(/teacher-owned/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/legacy\/unverified/i)).not.toBeInTheDocument();
    });

    it('excludes unresolved rows from teacher history while keeping resolved rows and deleted-source snapshot titles', async () => {
        getTeacherStudentResultsMock.mockResolvedValue([
            {
                resultId: 'resolved-deleted-source',
                sessionCode: 'session-resolved',
                testId: 'test-resolved',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: 'teacher-1',
                totalScore: 17,
                maxScore: 20,
                percentage: 85,
                bandScore: 7.5,
                questionResults: [],
                correct: 17,
                incorrect: 3,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_300_000,
                timeElapsed: 610_000,
                testDuration: 3_600,
                createdAt: 1_700_000_300_000,
                testTitle: 'Homework Name At Submission',
                testType: 'homework',
                testSkill: 'listening',
            },
            {
                resultId: 'unresolved-hidden',
                sessionCode: 'session-unresolved',
                testId: 'test-unresolved',
                studentId: 'student-1',
                studentName: 'Student One',
                teacherId: null,
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                bandScore: 5,
                questionResults: [],
                correct: 10,
                incorrect: 10,
                partialCredit: 0,
                totalQuestions: 20,
                submittedAt: 1_700_000_400_000,
                timeElapsed: 700_000,
                testDuration: 3_600,
                createdAt: 1_700_000_400_000,
                testTitle: 'Unresolved Row',
                testType: 'test',
                testSkill: 'reading',
            },
        ]);

        classifyTeacherResultVisibilityMock.mockImplementation(({ result }: any) => ({
            shouldDisplayInTeacherHistory: result.resultId === 'resolved-deleted-source',
        }));

        renderPage();

        await screen.findByText("Student One's History");
        expect(screen.getByText('Homework Name At Submission')).toBeInTheDocument();
        expect(screen.queryByText('Unresolved Row')).not.toBeInTheDocument();
    });

    it('shows an in-shell access-denied state when the teacher has no assignment', async () => {
        ownershipCheckState = {
            allowed: false,
            loading: false,
            denialReason: 'ownership',
        };

        renderPage();

        await screen.findByText('Access denied');
        expect(screen.getByText('Teacher Header: Student History')).toBeInTheDocument();
        expect(getTeacherStudentResultsMock).not.toHaveBeenCalled();
    });

    it('clears visible history and shows an in-shell access-revoked state after mid-view revocation', async () => {
        const view = renderPage();

        await screen.findByText("Student One's History");
        expect(screen.getByText('Listening Test')).toBeInTheDocument();

        ownershipCheckState = {
            allowed: false,
            loading: false,
            denialReason: 'ownership',
        };

        view.rerender(
            <MemoryRouter initialEntries={['/teacher/student/student-1/history']}>
                <Routes>
                    <Route path="/teacher/student/:studentId/history" element={<TeacherStudentHistoryPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await screen.findByText('Access revoked');
        expect(screen.queryByText('Listening Test')).not.toBeInTheDocument();
        expect(screen.getByText('Teacher Header: Student History')).toBeInTheDocument();
    });
});
