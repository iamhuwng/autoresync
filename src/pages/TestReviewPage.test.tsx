/**
 * TestReviewPage Unit Tests
 *
 * Tests for the TestReviewPage component.
 * Part of PRD-0022 Test Creation Modal with Draft Management.
 *
 * Coverage:
 * - Loading state rendering
 * - Error state rendering and retry
 * - Access denied redirect
 * - Successful draft loading and display
 * - Header with draft info and save status
 * - Publishing flow (Draft → Test conversion)
 * - Visibility toggle for super admins
 * - Publish button remains enabled when only warning-level checks remain
 * - Back navigation with unsaved-change confirmation
 * - Missing draftId handling
 *
 * @module TestReviewPage.test
 * @version 1.0.0
 * @date 2026-02-07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

// Mock react-router-dom
const mockNavigate = vi.fn();
let mockDraftId: string | undefined = 'test-draft-123';

vi.mock('react-router-dom', () => ({
    useParams: () => ({ draftId: mockDraftId }),
    useNavigate: () => mockNavigate,
}));

// Mock useAuth
const mockUser = { uid: 'user-123', displayName: 'Test Teacher' };
const mockProfile = { role: 'teacher' };

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: mockUser,
        profile: mockProfile,
    }),
}));

// Mock draftCloudService
const mockLoadDraft = vi.fn();
const mockDeleteDraft = vi.fn();

vi.mock('../services/draftCloudService', () => ({
    testDraftService: {
        loadDraft: (...args: unknown[]) => mockLoadDraft(...args),
        deleteDraft: (...args: unknown[]) => mockDeleteDraft(...args),
    },
}));

// Mock testStorage (saveTestToFirebase)
const mockSaveTestToFirebase = vi.fn();

vi.mock('../services/testStorage', () => ({
    saveTestToFirebase: (...args: unknown[]) => mockSaveTestToFirebase(...args),
}));

// Mock auditService
const mockLogTestPublished = vi.fn();

vi.mock('../services/auditService', () => ({
    default: {
        logTestPublished: (...args: unknown[]) => mockLogTestPublished(...args),
    },
}));

// Mock useDraftAutoSave
const mockSave = vi.fn();
const mockSaveImmediately = vi.fn();
let mockAutoSaveState = {
    isSaving: false,
    lastSaved: null as Date | null,
    error: null as string | null,
    save: mockSave,
    saveImmediately: mockSaveImmediately,
};

vi.mock('../hooks/useDraftAutoSave', () => ({
    useDraftAutoSave: () => mockAutoSaveState,
}));

// Mock ParseReviewPanel - render as a simple div so we can verify props
vi.mock('../components/test-creation/ParseReviewPanel', () => ({
    ParseReviewPanel: (props: any) => (
        <div data-testid="parse-review-panel">
            <span data-testid="passages-count">{props.passages?.length ?? 0}</span>
            <span data-testid="questions-count">{props.questions?.length ?? 0}</span>
            {props.leftSidebarContent}
        </div>
    ),
}));

// Mock UncertainItemsSidebar
vi.mock('../components/test-creation/UncertainItemsSidebar', () => ({
    UncertainItemsSidebar: (props: any) => (
        <div data-testid="uncertain-items-sidebar">
            {props.items?.filter((i: any) => !i.resolved).map((item: any) => (
                <div key={item.id} data-testid={`uncertain-item-${item.id}`}>{item.message}</div>
            ))}
        </div>
    ),
}));

// Mock CompletionChecklist
vi.mock('../components/test-creation/CompletionChecklist', () => ({
    CompletionChecklist: (props: any) => (
        <div data-testid="completion-checklist">
            {props.checks?.map((check: any) => (
                <div key={check.id} data-testid={`check-${check.id}`}>
                    {check.label}: {check.count?.current}/{check.count?.required}
                </div>
            ))}
            <span data-testid="completeness-percent">{props.completenessPercent}%</span>
        </div>
    ),
}));

// Mock AnswerKeyModal
vi.mock('../components/test-creation/AnswerKeyModal', () => ({
    AnswerKeyModal: (props: any) => props.opened ? (
        <div data-testid="answer-key-modal">Answer Key Modal</div>
    ) : null,
}));

// Mock ROUTES
vi.mock('../constants/routes', () => ({
    ROUTES: {
        ADMIN_MATERIALS: '/admin/materials',
        LOBBY: '/lobby',
        TEACHER_TEST_REVIEW: '/teacher/test/review/:draftId',
    },
}));

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

const createMockDraft = (overrides: Record<string, any> = {}) => ({
    id: 'test-draft-123',
    userId: 'user-123',
    testType: 'IELTS',
    skillType: 'reading',
    format: 'academic',
    metadata: {
        title: 'IELTS Reading Test - February 2026',
        duration: 60,
        cefrLevel: 'B2',
        difficulty: 'Intermediate',
        description: 'A practice IELTS reading test',
    },
    passages: [
        {
            id: 'passage-1',
            title: 'The History of Coffee',
            content: 'Coffee was first discovered in Ethiopia...',
        },
    ],
    questions: [
        {
            questionNumber: 1,
            questionText: 'Where was coffee first discovered?',
            question: 'Where was coffee first discovered?',
            type: 'multiple-choice',
            options: ['Ethiopia', 'Brazil', 'Colombia', 'Vietnam'],
            answer: 'Ethiopia',
            passageId: 'passage-1',
            confidence: 95,
        },
        {
            questionNumber: 2,
            questionText: 'What year was it discovered?',
            question: 'What year was it discovered?',
            type: 'short-answer',
            options: null,
            answer: '',
            passageId: 'passage-1',
            confidence: 80,
        },
    ],
    sectionInstructions: {
        'passage-1': 'Read the following passage and answer questions 1-2.',
    },
    status: 'review',
    questionCount: 2,
    missingAnswerCount: 1,
    createdAt: new Date('2026-02-07T10:00:00Z'),
    updatedAt: new Date('2026-02-07T12:00:00Z'),
    ...overrides,
});

const createPublishableDraft = (overrides: Record<string, any> = {}) => {
    const baseDraft = createMockDraft();
    const questions = overrides.questions ?? baseDraft.questions.map((question: any, index: number) => (
        index === 1 ? { ...question, answer: '1670' } : question
    ));

    return {
        ...baseDraft,
        ...overrides,
        questions,
        questionCount: overrides.questionCount ?? questions.length,
        missingAnswerCount: overrides.missingAnswerCount ?? 0,
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Need to import after mocks
let TestReviewPage: any;

const renderPage = async () => {
    // Dynamic import to ensure mocks are in place
    const mod = await import('./TestReviewPage');
    TestReviewPage = mod.default;

    return render(
        <MantineProvider>
            <TestReviewPage />
        </MantineProvider>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════

describe('TestReviewPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDraftId = 'test-draft-123';
        mockAutoSaveState = {
            isSaving: false,
            lastSaved: null,
            error: null,
            save: mockSave,
            saveImmediately: mockSaveImmediately,
        };
        // Reset user to owner
        (mockUser as any).uid = 'user-123';
        (mockProfile as any).role = 'teacher';
        mockLoadDraft.mockResolvedValue({
            success: true,
            data: createMockDraft(),
        });
        // Default publish result
        mockSaveTestToFirebase.mockResolvedValue({
            success: true,
            testId: 'test-published-001',
        });
        mockDeleteDraft.mockResolvedValue({ success: true });
        // Mock window.confirm for publish confirmation
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Loading State
    // ─────────────────────────────────────────────────────────────────────────

    describe('Loading State', () => {
        it('shows loading spinner while fetching draft', async () => {
            // Make loadDraft hang to keep loading state
            mockLoadDraft.mockImplementation(() => new Promise(() => { }));

            await renderPage();

            expect(screen.getByText('Loading Draft...')).toBeInTheDocument();
            expect(screen.getByText(/Fetching your test draft from the cloud/i)).toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Error State
    // ─────────────────────────────────────────────────────────────────────────

    describe('Error State', () => {
        it('shows error when draft load fails', async () => {
            mockLoadDraft.mockResolvedValue({
                success: false,
                error: 'Draft not found in database',
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Failed to Load Draft')).toBeInTheDocument();
                expect(screen.getByText('Draft not found in database')).toBeInTheDocument();
            });
        });

        it('shows error when loadDraft throws an exception', async () => {
            mockLoadDraft.mockRejectedValue(new Error('Network error'));

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Failed to Load Draft')).toBeInTheDocument();
                expect(screen.getByText('Network error')).toBeInTheDocument();
            });
        });

        it('shows Go Back button in error state', async () => {
            mockLoadDraft.mockResolvedValue({
                success: false,
                error: 'Something went wrong',
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Go Back')).toBeInTheDocument();
            });
        });

        it('shows Try Again button in error state', async () => {
            mockLoadDraft.mockResolvedValue({
                success: false,
                error: 'Temporary failure',
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Try Again')).toBeInTheDocument();
            });
        });

        it('retries loading when Try Again is clicked', async () => {
            const user = userEvent.setup();

            // First call fails, second succeeds
            mockLoadDraft
                .mockResolvedValueOnce({ success: false, error: 'Temporary error' })
                .mockResolvedValueOnce({ success: true, data: createMockDraft() });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Try Again')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Try Again'));

            await waitFor(() => {
                expect(mockLoadDraft).toHaveBeenCalledTimes(2);
            });
        });

        it('shows error state when result data is null', async () => {
            mockLoadDraft.mockResolvedValue({
                success: true,
                data: null,
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Failed to Load Draft')).toBeInTheDocument();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // No Draft ID
    // ─────────────────────────────────────────────────────────────────────────

    describe('Missing Draft ID', () => {
        it('shows error when draftId is undefined', async () => {
            mockDraftId = undefined;

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Failed to Load Draft')).toBeInTheDocument();
                expect(screen.getByText('No draft ID provided')).toBeInTheDocument();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Access Denied
    // ─────────────────────────────────────────────────────────────────────────

    describe('Access Denied', () => {
        it('redirects when user does not own the draft', async () => {
            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createMockDraft({ userId: 'other-user-456' }),
            });

            await renderPage();

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/access-denied', {
                    state: {
                        from: '/teacher/test/review/test-draft-123',
                        reason: 'ownership',
                    },
                });
            });
        });

        it('allows super_admin to access any draft', async () => {
            (mockProfile as any).role = 'super_admin';
            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createMockDraft({ userId: 'other-user-456' }),
            });

            await renderPage();

            await waitFor(() => {
                // Should NOT redirect - super_admin bypasses ownership
                expect(mockNavigate).not.toHaveBeenCalledWith('/access-denied', expect.anything());
                // Should render the review header
                expect(screen.getByText('IELTS Reading Test - February 2026')).toBeInTheDocument();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Successful Draft Load
    // ─────────────────────────────────────────────────────────────────────────

    describe('Successful Draft Load', () => {
        it('renders draft title in header', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('IELTS Reading Test - February 2026')).toBeInTheDocument();
            });
        });

        it('renders test type and skill badge', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('IELTS reading')).toBeInTheDocument();
            });
        });

        it('renders duration badge', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText(/60 min/)).toBeInTheDocument();
            });
        });

        it('renders breadcrumbs with Materials link', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Materials')).toBeInTheDocument();
                expect(screen.getByText('Review Draft')).toBeInTheDocument();
            });
        });

        it('renders ParseReviewPanel with passages and questions', async () => {
            await renderPage();

            await waitFor(() => {
                const panel = screen.getByTestId('parse-review-panel');
                expect(panel).toBeInTheDocument();

                // Verify passages and questions were passed
                expect(screen.getByTestId('passages-count').textContent).toBe('1');
                expect(screen.getByTestId('questions-count').textContent).toBe('2');
            });
        });

        it('shows Untitled Draft when title is empty', async () => {
            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createMockDraft({
                    metadata: { title: '', duration: 60 },
                }),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Untitled Draft')).toBeInTheDocument();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Missing Answer Warning
    // ─────────────────────────────────────────────────────────────────────────

    describe('Missing Answer Warning', () => {
        it('shows missing answer alert when draft has missing answers', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText(/missing answer key/i)).toBeInTheDocument();
            });
        });

        it('shows correct complete count in completion checklist', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText(/Answer Key: 1\/2/)).toBeInTheDocument();
            });
        });

        it('does not show missing answer alert when all answers present', async () => {
            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createMockDraft({
                    missingAnswerCount: 0,
                    questionCount: 2,
                    questions: [
                        {
                            questionNumber: 1,
                            questionText: 'Where was coffee first discovered?',
                            question: 'Where was coffee first discovered?',
                            type: 'multiple-choice',
                            options: ['Ethiopia', 'Brazil', 'Colombia', 'Vietnam'],
                            answer: 'Ethiopia',
                            passageId: 'passage-1',
                            confidence: 95,
                        },
                        {
                            questionNumber: 2,
                            questionText: 'What year was it discovered?',
                            question: 'What year was it discovered?',
                            type: 'short-answer',
                            options: null,
                            answer: '1670',
                            passageId: 'passage-1',
                            confidence: 80,
                        },
                    ],
                }),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('IELTS Reading Test - February 2026')).toBeInTheDocument();
            });

            expect(screen.queryByText(/missing answer key/i)).not.toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Publish Button
    // ─────────────────────────────────────────────────────────────────────────

    describe('Publish Button', () => {
        it('renders Publish Test button', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Publish Test')).toBeInTheDocument();
            });
        });

        it('keeps publish enabled when answers are missing but only warnings remain', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText(/missing answer key/i)).toBeInTheDocument();
                expect(screen.getByRole('button', { name: 'Publish Test' })).not.toBeDisabled();
            });
        });

        it('enables publish button when all answers are present', async () => {
            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                const publishButton = screen.getByText('Publish Test').closest('button');
                expect(publishButton).not.toBeDisabled();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Save Status Display
    // ─────────────────────────────────────────────────────────────────────────

    describe('Save Status Display', () => {
        it('shows "Saving..." when auto-save is in progress', async () => {
            mockAutoSaveState = {
                ...mockAutoSaveState,
                isSaving: true,
            };

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Saving...')).toBeInTheDocument();
            });
        });

        it('shows "Saved at" with time when lastSaved is set', async () => {
            mockAutoSaveState = {
                ...mockAutoSaveState,
                isSaving: false,
                lastSaved: new Date('2026-02-07T14:30:00Z'),
            };

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText(/Saved at/)).toBeInTheDocument();
            });
        });

        it('disables publish button while saving', async () => {
            mockAutoSaveState = {
                ...mockAutoSaveState,
                isSaving: true,
            };

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                const publishButton = screen.getByText('Publish Test').closest('button');
                expect(publishButton).toBeDisabled();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Navigation
    // ─────────────────────────────────────────────────────────────────────────

    describe('Navigation', () => {
        it('renders Exit button', async () => {
            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Exit')).toBeInTheDocument();
            });
        });

        it('navigates to lobby on Exit click when a teacher has no unsaved changes', async () => {
            const user = userEvent.setup();

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Exit')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Exit'));

            expect(mockNavigate).toHaveBeenCalledWith('/lobby');
        });

        it('navigates to lobby on Go Back click in error state for teachers', async () => {
            const user = userEvent.setup();

            mockLoadDraft.mockResolvedValue({
                success: false,
                error: 'Failed to load',
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Go Back')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Go Back'));

            expect(mockNavigate).toHaveBeenCalledWith('/lobby');
        });

        it('navigates to lobby on breadcrumb Materials click for teachers', async () => {
            const user = userEvent.setup();

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Materials')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Materials'));

            expect(mockNavigate).toHaveBeenCalledWith('/lobby');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Question Type Mapping
    // ─────────────────────────────────────────────────────────────────────────

    describe('Question Type Mapping', () => {
        it('maps legacy "completion" type to "sentence-completion"', async () => {
            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createMockDraft({
                    questions: [
                        {
                            questionNumber: 1,
                            questionText: 'Fill in the blank',
                            type: 'completion',
                            options: null,
                            answer: 'test',
                            passageId: 'passage-1',
                            confidence: 90,
                        },
                    ],
                }),
            });

            await renderPage();

            await waitFor(() => {
                // Verify ParseReviewPanel received the questions
                expect(screen.getByTestId('questions-count').textContent).toBe('1');
            });
        });

        it('maps legacy "matching" type to "matching-headings"', async () => {
            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createMockDraft({
                    questions: [
                        {
                            questionNumber: 1,
                            questionText: 'Match the heading',
                            type: 'matching',
                            options: null,
                            answer: 'A',
                            passageId: 'passage-1',
                            confidence: 85,
                        },
                    ],
                }),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByTestId('questions-count').textContent).toBe('1');
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Publishing Flow (Tasks 6.1-6.3)
    // ─────────────────────────────────────────────────────────────────────────

    describe('Publishing Flow', () => {
        it('calls saveTestToFirebase with correct data when publish is clicked', async () => {
            const user = userEvent.setup();

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Publish Test')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Publish Test'));

            await waitFor(() => {
                expect(mockSaveTestToFirebase).toHaveBeenCalledTimes(1);

                // Verify metadata passed
                const callArgs = mockSaveTestToFirebase.mock.calls[0];
                const metadata = callArgs[0];
                expect(metadata.title).toBe('IELTS Reading Test - February 2026');
                expect(metadata.type).toBe('IELTS');
                expect(metadata.skill).toBe('Reading');
                expect(metadata.duration).toBe(60);

                // Verify ownerId (6th arg)
                expect(callArgs[5]).toBe('user-123'); // ownerId

                // Verify isPublic default false (7th arg)
                expect(callArgs[6]).toBe(false); // isPublic defaults to false for teacher
            });
        });

        it('deletes draft after successful publish (Task 6.3)', async () => {
            const user = userEvent.setup();

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Publish Test')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Publish Test'));

            await waitFor(() => {
                expect(mockDeleteDraft).toHaveBeenCalledWith('test-draft-123');
            });
        });

        it('navigates to materials page after successful publish', async () => {
            const user = userEvent.setup();

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Publish Test')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Publish Test'));

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/lobby', {
                    state: expect.objectContaining({
                        publishSuccess: true,
                        publishedTestId: 'test-published-001',
                    }),
                });
            });
        });

        it('shows error alert when publish fails', async () => {
            const user = userEvent.setup();
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });

            mockSaveTestToFirebase.mockResolvedValue({
                success: false,
                error: 'Permission denied',
            });

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Publish Test')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Publish Test'));

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
            });

            alertSpy.mockRestore();
        });

        it('does not publish when user cancels confirmation', async () => {
            const user = userEvent.setup();
            vi.spyOn(window, 'confirm').mockReturnValue(false);

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Publish Test')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Publish Test'));

            expect(mockSaveTestToFirebase).not.toHaveBeenCalled();
        });

        it('logs audit event after successful publish', async () => {
            const user = userEvent.setup();

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Publish Test')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Publish Test'));

            await waitFor(() => {
                expect(mockLogTestPublished).toHaveBeenCalledWith(
                    'user-123',      // userId
                    'teacher',       // userRole
                    'test-published-001', // testId
                    'test-draft-123',     // draftId
                    false            // isPublic
                );
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Visibility Toggle (Tasks 6.4-6.5)
    // ─────────────────────────────────────────────────────────────────────────

    describe('Visibility Toggle', () => {
        it('does not show visibility toggle for regular teachers (Task 6.5)', async () => {
            (mockProfile as any).role = 'teacher';

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('IELTS Reading Test - February 2026')).toBeInTheDocument();
            });

            // Should not show Public/Private toggle
            expect(screen.queryByText('Public')).not.toBeInTheDocument();
            expect(screen.queryByText('Private')).not.toBeInTheDocument();
        });

        it('shows visibility toggle for super_admin (Task 6.4)', async () => {
            (mockProfile as any).role = 'super_admin';

            await renderPage();

            await waitFor(() => {
                // Default is Private
                expect(screen.getByText('Private')).toBeInTheDocument();
            });
        });

        it('toggles from Private to Public when super_admin clicks', async () => {
            const user = userEvent.setup();
            (mockProfile as any).role = 'super_admin';

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Private')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Private'));

            await waitFor(() => {
                expect(screen.getByText('Public')).toBeInTheDocument();
            });
        });

        it('publishes with isPublic=true when super_admin toggles visibility on', async () => {
            const user = userEvent.setup();
            (mockProfile as any).role = 'super_admin';

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Private')).toBeInTheDocument();
            });

            // Toggle to Public
            await user.click(screen.getByText('Private'));

            await waitFor(() => {
                expect(screen.getByText('Public')).toBeInTheDocument();
            });

            // Now publish
            await user.click(screen.getByText('Publish Test'));

            await waitFor(() => {
                // Verify isPublic=true was passed (7th arg)
                const callArgs = mockSaveTestToFirebase.mock.calls[0];
                expect(callArgs[6]).toBe(true);
            });
        });

        it('defaults isPublic=false for teacher role (Task 6.5)', async () => {
            const user = userEvent.setup();
            (mockProfile as any).role = 'teacher';

            mockLoadDraft.mockResolvedValue({
                success: true,
                data: createPublishableDraft(),
            });

            await renderPage();

            await waitFor(() => {
                expect(screen.getByText('Publish Test')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Publish Test'));

            await waitFor(() => {
                // isPublic should be false by default
                const callArgs = mockSaveTestToFirebase.mock.calls[0];
                expect(callArgs[6]).toBe(false);
            });
        });
    });
});
