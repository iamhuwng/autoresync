import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';

const mockNotificationsShow = vi.fn();
const mockParseThcsText = vi.fn();
const mockConvertParsedToThcsDraft = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useParams: () => ({}),
    };
});

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'teacher-1' },
        profile: { role: 'teacher', displayName: 'Teacher' },
        logout: vi.fn(),
    }),
}));

vi.mock('../hooks/thcs/useThcsDraft', () => ({
    useThcsDraft: () => ({
        draft: null,
        loading: false,
        error: null,
    }),
}));

vi.mock('../hooks/thcs/useThcsAutoSave', () => ({
    useThcsAutoSave: () => ({
        isSaving: false,
        lastSavedAt: null,
        error: null,
        saveNow: vi.fn(),
    }),
}));

vi.mock('../hooks/thcs/useThcsValidation', () => ({
    useThcsValidation: () => ({
        errors: [],
        warnings: [],
        isValid: true,
    }),
}));

vi.mock('@mantine/hooks', () => ({
    useMediaQuery: () => false,
}));

vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: (...args: unknown[]) => mockNotificationsShow(...args),
    },
}));

vi.mock('../services/thcsDraftService', () => ({
    createThcsDraft: vi.fn(),
}));

vi.mock('../services/thcsTestStorage', () => ({
    generateThcsTestId: vi.fn(),
    saveThcsTestToFirebase: vi.fn(),
}));

vi.mock('../services/r2Storage', () => ({
    default: {},
}));

vi.mock('../services/test-creation/thcsDocumentParser.service', () => ({
    convertParsedToThcsDraft: (...args: unknown[]) => mockConvertParsedToThcsDraft(...args),
    parseThcsText: (...args: unknown[]) => mockParseThcsText(...args),
}));

vi.mock('../services/test-creation/thcs-pdf-extraction-prompt.txt?raw', () => ({
    default: 'prompt text',
}));

vi.mock('../components/thcs-editor/THCSWizardLayout', () => ({
    default: ({
        currentStep,
        children,
        footer,
        steps,
    }: {
        currentStep: number;
        children: React.ReactNode;
        footer: React.ReactNode;
        steps?: Array<{ label: string }>;
    }) => (
        <div>
            <div data-testid="wizard-step">{currentStep}</div>
            <div data-testid="wizard-label">{steps?.[currentStep]?.label}</div>
            <div>{children}</div>
            <div>{footer}</div>
        </div>
    ),
}));

vi.mock('../components/thcs-editor/THCSSetupStep', () => ({
    default: ({
        metadata,
        onMetadataChange,
        onStartPasteText,
        onStartBlank,
    }: {
        metadata?: { title?: string; duration?: number; gradeLevel?: number; examType?: string };
        onMetadataChange?: (field: string, value: unknown) => void;
        onStartPasteText?: () => void;
        onStartBlank?: () => void;
    }) => (
        <div>
            <label>
                Title
                <input
                    aria-label="Test Title"
                    value={metadata?.title || ''}
                    onChange={(event) => onMetadataChange?.('title', event.target.value)}
                />
            </label>
            <label>
                Duration
                <input
                    aria-label="Test Duration"
                    type="number"
                    value={metadata?.duration || 0}
                    onChange={(event) => onMetadataChange?.('duration', Number(event.target.value))}
                />
            </label>
            <label>
                Grade Level
                <input
                    aria-label="Grade Level"
                    type="number"
                    value={metadata?.gradeLevel || 0}
                    onChange={(event) => onMetadataChange?.('gradeLevel', Number(event.target.value))}
                />
            </label>
            <label>
                Exam Type
                <input
                    aria-label="Exam Type"
                    value={metadata?.examType || ''}
                    onChange={(event) => onMetadataChange?.('examType', event.target.value)}
                />
            </label>
            <button onClick={onStartPasteText}>Paste Text</button>
            <button onClick={onStartBlank}>Start Blank</button>
        </div>
    ),
}));

vi.mock('../components/thcs-editor/THCSQuestionsStep', () => ({
    default: () => <div>Questions Step</div>,
}));

vi.mock('../components/thcs-editor/THCSAnswerKeyStep', () => ({
    default: () => <div>Answer Key Step</div>,
}));

vi.mock('../components/thcs-editor/THCSReviewStep', () => ({
    default: ({
        metadata,
        parsedMetadataConflicts,
        onApplyParsedMetadata,
        onDismissParsedMetadataConflicts,
    }: {
        metadata: { title?: string; duration?: number; gradeLevel?: number; examType?: string };
        parsedMetadataConflicts?: Array<{ field: string; label: string; currentValue: string; parsedValue: string }>;
        onApplyParsedMetadata?: () => void;
        onDismissParsedMetadataConflicts?: () => void;
    }) => (
        <div>
            <div>Review Step</div>
            <div data-testid="review-title">{metadata?.title}</div>
            <div data-testid="review-duration">{metadata?.duration}</div>
            <div data-testid="review-grade">{metadata?.gradeLevel}</div>
            <div data-testid="review-exam-type">{metadata?.examType}</div>
            <div data-testid="review-conflict-count">{parsedMetadataConflicts?.length || 0}</div>
            {parsedMetadataConflicts?.map((conflict) => (
                <div key={conflict.field}>
                    {conflict.label}: {conflict.currentValue} {'->'} {conflict.parsedValue}
                </div>
            ))}
            <button onClick={onDismissParsedMetadataConflicts}>Keep Current Setup</button>
            <button onClick={onApplyParsedMetadata}>Apply Parsed Values</button>
        </div>
    ),
}));

vi.mock('../components/thcs-editor/THCSPreviewOverlay', () => ({
    THCSPreviewOverlay: () => null,
}));

vi.mock('../components/thcs-editor/THCSParseReviewPanel', () => ({
    THCSParseReviewPanel: () => <div>Parse Review Step</div>,
}));

vi.mock('../components/ai/AIMaintenanceBanner', () => ({
    default: () => null,
}));

import { THCSTestEditorSurface } from './THCSTestEditorPage';

const renderSurface = (props: Partial<React.ComponentProps<typeof THCSTestEditorSurface>> = {}) => {
    const defaultProps = {
        onExit: vi.fn(),
        presentation: 'embedded' as const,
        onStepChange: vi.fn(),
        onWideLayoutChange: vi.fn(),
    };

    return render(
        <BrowserRouter>
            <MantineProvider>
                <THCSTestEditorSurface {...defaultProps} {...props} />
            </MantineProvider>
        </BrowserRouter>
    );
};

describe('THCSTestEditorSurface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockConvertParsedToThcsDraft.mockReset();
    });

    it('advances the shared wizard progress when Paste Text starts', async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();

        renderSurface({ onStepChange });

        await user.click(screen.getByText('Paste Text'));

        await waitFor(() => {
            expect(screen.getByTestId('wizard-step')).toHaveTextContent('1');
            expect(screen.getByTestId('wizard-label')).toHaveTextContent('Paste Text');
            expect(screen.getByText('Paste Test Content')).toBeInTheDocument();
        });

        expect(onStepChange).toHaveBeenLastCalledWith(1);
    });

    it('uses the shared footer action for paste parsing instead of inline parse buttons', async () => {
        const user = userEvent.setup();

        renderSurface();

        await user.click(screen.getByText('Paste Text'));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Parse & Review' })).toBeInTheDocument();
        });

        expect(screen.getByRole('button', { name: /Back: Setup/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Parse & Import' })).not.toBeInTheDocument();
    });

    it('only requests wide layout for the questions editor step', async () => {
        const user = userEvent.setup();
        const onWideLayoutChange = vi.fn();

        renderSurface({ onWideLayoutChange });

        expect(onWideLayoutChange).toHaveBeenCalledWith(false);

        await user.click(screen.getByText('Start Blank'));

        await waitFor(() => {
            expect(screen.getByText('Questions Step')).toBeInTheDocument();
        });

        expect(onWideLayoutChange).toHaveBeenLastCalledWith(true);

        await user.click(screen.getByRole('button', { name: /Next: Answer Key/i }));

        await waitFor(() => {
            expect(screen.getByText('Answer Key Step')).toBeInTheDocument();
        });

        expect(onWideLayoutChange).toHaveBeenLastCalledWith(false);

        await user.click(screen.getByRole('button', { name: /Next: Review/i }));

        await waitFor(() => {
            expect(screen.getByText('Review Step')).toBeInTheDocument();
        });

        expect(onWideLayoutChange).toHaveBeenLastCalledWith(false);
    });

    it('restores the standard step label after continuing from paste text into questions', async () => {
        const user = userEvent.setup();

        mockParseThcsText.mockResolvedValueOnce({
            success: true,
            data: {
                metadata: { title: 'Imported test', duration: 45, gradeLevel: 9, examType: 'midterm' },
                sections: [],
            },
        });
        mockConvertParsedToThcsDraft.mockReturnValue({
            metadata: { title: 'Imported test', duration: 45, gradeLevel: 9, examType: 'midterm' },
            sections: [],
        });

        renderSurface();

        await user.click(screen.getByText('Paste Text'));

        await waitFor(() => {
            expect(screen.getByTestId('wizard-label')).toHaveTextContent('Paste Text');
        });

        await user.type(screen.getByPlaceholderText(/I\. MULTIPLE CHOICE QUESTIONS/i), 'Question 1');
        await user.click(screen.getByRole('button', { name: 'Parse & Review' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Continue to Questions/i })).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /Continue to Questions/i }));

        await waitFor(() => {
            expect(screen.getByText('Questions Step')).toBeInTheDocument();
            expect(screen.getByTestId('wizard-label')).toHaveTextContent('Build Test');
        });
    });

    it('preserves setup metadata after paste import and defers mismatches to review', async () => {
        const user = userEvent.setup();

        mockParseThcsText.mockResolvedValueOnce({
            success: true,
            data: {
                metadata: { title: 'Imported test', duration: 60, gradeLevel: 8, examType: 'midterm' },
                sections: [],
            },
        });
        mockConvertParsedToThcsDraft.mockReturnValue({
            metadata: { title: 'Imported test', duration: 60, gradeLevel: 8, examType: 'midterm' },
            sections: [],
        });

        renderSurface();

        await user.type(screen.getByLabelText('Test Title'), 'Teacher Setup Title');
        await user.clear(screen.getByLabelText('Test Duration'));
        await user.type(screen.getByLabelText('Test Duration'), '45');
        await user.clear(screen.getByLabelText('Grade Level'));
        await user.type(screen.getByLabelText('Grade Level'), '9');
        await user.type(screen.getByLabelText('Exam Type'), 'final');

        await user.click(screen.getByText('Paste Text'));
        await user.type(screen.getByPlaceholderText(/I\. MULTIPLE CHOICE QUESTIONS/i), 'Question 1');
        await user.click(screen.getByRole('button', { name: 'Parse & Review' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Continue to Questions/i })).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /Continue to Questions/i }));
        await waitFor(() => {
            expect(screen.getByText('Questions Step')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /Next: Answer Key/i }));
        await waitFor(() => {
            expect(screen.getByText('Answer Key Step')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /Next: Review/i }));
        await waitFor(() => {
            expect(screen.getByText('Review Step')).toBeInTheDocument();
        });

        expect(screen.getByTestId('review-title')).toHaveTextContent('Teacher Setup Title');
        expect(screen.getByTestId('review-duration')).toHaveTextContent('45');
        expect(screen.getByTestId('review-grade')).toHaveTextContent('9');
        expect(screen.getByTestId('review-exam-type')).toHaveTextContent('final');
        expect(screen.getByTestId('review-conflict-count')).toHaveTextContent('4');
        expect(screen.getByText(/Title: Teacher Setup Title -> Imported test/)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Apply Parsed Values' }));

        await waitFor(() => {
            expect(screen.getByTestId('review-title')).toHaveTextContent('Imported test');
        });

        expect(screen.getByTestId('review-duration')).toHaveTextContent('60');
        expect(screen.getByTestId('review-grade')).toHaveTextContent('8');
        expect(screen.getByTestId('review-exam-type')).toHaveTextContent('midterm');
        expect(screen.getByTestId('review-conflict-count')).toHaveTextContent('0');
    }, 10000);
});
