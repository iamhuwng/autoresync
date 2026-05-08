import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetPendingSubmissions,
    mockNavigateTo,
    mockTrackAction,
    mockUseLocation,
    mockUseNavigate,
} = vi.hoisted(() => ({
    mockGetPendingSubmissions: vi.fn(),
    mockNavigateTo: vi.fn(),
    mockTrackAction: vi.fn(),
    mockUseLocation: vi.fn(),
    mockUseNavigate: vi.fn(),
}));

vi.mock('@mantine/core', () => {
    const AppShell = ({ children }: { children: ReactNode }) => <div>{children}</div>;
    AppShell.Main = ({ children }: { children: ReactNode }) => <main>{children}</main>;

    return {
        AppShell,
        Center: ({ children }: { children: ReactNode }) => <div>{children}</div>,
        Loader: () => <span>Loading</span>,
        Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
        Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    };
});

vi.mock('react-router-dom', () => ({
    useLocation: () => mockUseLocation(),
    useNavigate: () => mockUseNavigate,
}));

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'teacher-1', email: 'teacher@test.com' },
        profile: { role: 'teacher', displayName: 'Teacher One', email: 'teacher@test.com' },
        logout: vi.fn(),
    }),
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({ navigateTo: mockNavigateTo }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({ trackAction: mockTrackAction }),
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    getDocs: vi.fn(async () => ({ docs: [] })),
    query: vi.fn(),
    where: vi.fn(),
}));

vi.mock('firebase/database', () => ({
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    ref: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
    database: {},
    firestore: {},
}));

vi.mock('../services/writingSubmissionService', () => ({
    getPendingSubmissions: (...args: unknown[]) => mockGetPendingSubmissions(...args),
}));

vi.mock('../components/modern', () => ({
    Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...props}>{children}</button>
    ),
    Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
    CardBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('../components/navigation', () => ({
    TeacherHeader: () => <header>Teacher header</header>,
}));

vi.mock('../components/thcs-grading/GradingTestCard', () => ({
    GradingTestCard: () => <div>THCS grading card</div>,
}));

vi.mock('../components/writing-grading/ImportWritingSubmissionModal', () => ({
    default: (props: any) => (
        props.isOpen ? (
            <div role="dialog" aria-label="Import modal">
                <button
                    type="button"
                    onClick={() => props.onImported(
                        {
                            submissionId: 'shared-submission-id',
                            homeworkSubmissionId: 'shared-submission-id',
                            resultId: 'shared-submission-id',
                            isLate: false,
                            attemptNumber: 1,
                        },
                        { gradeNow: true }
                    )}
                >
                    Complete mocked import
                </button>
            </div>
        ) : null
    ),
}));

import { TeacherGradingPage } from './TeacherGradingPage';

describe('TeacherGradingPage import submission wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseLocation.mockReturnValue({
            pathname: '/teacher/grading/writing',
            state: { tab: 'writing' },
        });
        mockGetPendingSubmissions.mockResolvedValue({ success: true, data: [] });
    });

    it('shows Import submission in the IELTS Writing tab and tracks modal open', async () => {
        const user = userEvent.setup();
        render(<TeacherGradingPage />);

        const importButton = await screen.findByRole('button', { name: 'Import submission' });
        await user.click(importButton);

        expect(mockTrackAction).toHaveBeenCalledWith(
            'importSubmissionOpen',
            { source: 'teacher_grading_writing_tab' }
        );
        expect(screen.getByRole('dialog', { name: 'Import modal' })).toBeTruthy();
    });

    it('opens IELTS Writing by default on the base grading route', async () => {
        mockUseLocation.mockReturnValue({
            pathname: '/teacher/grading',
            state: null,
        });

        render(<TeacherGradingPage />);

        expect(await screen.findByRole('button', { name: 'Import submission' })).toBeTruthy();
        expect(mockGetPendingSubmissions).toHaveBeenCalledWith('teacher-1');
    });

    it('refreshes queue and routes grade-now imports through TEACHER_GRADING_DETAIL', async () => {
        const user = userEvent.setup();
        render(<TeacherGradingPage />);

        await user.click(await screen.findByRole('button', { name: 'Import submission' }));
        await user.click(screen.getByRole('button', { name: 'Complete mocked import' }));

        await waitFor(() => {
            expect(mockNavigateTo).toHaveBeenCalledWith(
                'TEACHER_GRADING_DETAIL',
                { submissionId: 'shared-submission-id' },
                { reason: 'teacher_import_writing_submission_grade_now' },
            );
        });
        expect(mockGetPendingSubmissions).toHaveBeenCalledWith('teacher-1');
    });
});
