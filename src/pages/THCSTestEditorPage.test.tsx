import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../test/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ToastContainer, toast } from '../components/modern';

const mockParseThcsText = vi.fn();
const mockCreateThcsDraft = vi.fn();
const mockSaveNow = vi.fn();
const { mockValidationState } = vi.hoisted(() => ({
    mockValidationState: { enforceMetadata: false },
}));

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
        saveNow: mockSaveNow,
    }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('../hooks/thcs/useThcsValidation', () => ({
    useThcsValidation: ({ metadata }: {
        metadata: { title?: string; duration?: number; gradeLevel?: number; examType?: string };
    }) => {
        const metadataErrors = mockValidationState.enforceMetadata
            ? [
                !metadata.title?.trim() ? 'Test title is required.' : '',
                !metadata.duration || metadata.duration <= 0 ? 'Test duration must be greater than 0.' : '',
                !metadata.gradeLevel ? 'Grade level is required.' : '',
                !metadata.examType?.trim() ? 'Exam type is required.' : '',
            ].filter(Boolean)
            : [];
        return { metadataErrors, errors: metadataErrors, warnings: [], isValid: metadataErrors.length === 0 };
    },
}));

vi.mock('../services/thcsDraftService', () => ({
    createThcsDraft: (...args: unknown[]) => mockCreateThcsDraft(...args),
}));

vi.mock('../services/thcsTestStorage', () => ({
    generateThcsTestId: vi.fn(),
    saveThcsTestToFirebase: vi.fn(),
}));

vi.mock('../services/r2Storage', () => ({
    default: {},
}));

vi.mock('../services/test-creation/thcsDocumentParser.service', async () => ({
    convertParsedToThcsDraft: (await import('../services/test-creation/thcs-draft-converter')).convertParsedToThcsDraft,
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
            <button onClick={onStartPasteText}>Paste Test</button>
            <button onClick={onStartBlank}>Start Blank</button>
        </div>
    ),
}));

vi.mock('../components/thcs-editor/THCSQuestionsStep', () => ({
    default: ({ sections }: { sections: THCSSection[] }) => <div>
        Questions Step
        {sections.map(section => <div key={section.id}>{section.questions.map(question =>
            <div key={question.id}>{question.questionText}</div>)}</div>)}
    </div>,
}));

vi.mock('../components/thcs-editor/THCSAnswerKeyStep', () => ({
    default: () => <div>Answer Key Step</div>,
}));

vi.mock('../components/thcs-editor/THCSReviewStep', () => ({
    default: ({
        metadata,
    }: {
        metadata: { title?: string; duration?: number; gradeLevel?: number; examType?: string };
    }) => (
        <div>
            <div>Review Step</div>
            <div data-testid="review-title">{metadata?.title}</div>
            <div data-testid="review-duration">{metadata?.duration}</div>
            <div data-testid="review-grade">{metadata?.gradeLevel}</div>
            <div data-testid="review-exam-type">{metadata?.examType}</div>
        </div>
    ),
}));

vi.mock('../components/thcs-editor/THCSPreviewOverlay', () => ({
    THCSPreviewOverlay: () => null,
}));

vi.mock('../components/ai/AIMaintenanceBanner', () => ({
    default: () => null,
}));

import { getMissingVisualQuestionImages, THCSTestEditorSurface } from './THCSTestEditorPage';
import type { ParsedTest } from '../services/test-creation/thcsDocumentParser.service';
import type { THCSSection } from '../types/thcs-test.types';

const visualSection = (imageUrl?: string, imageCaption?: string): THCSSection => ({
    id: 'signs',
    name: 'Signs',
    order: 0,
    totalPoints: 1,
    pointMode: 'auto',
    instructionText: 'Look at the sign.',
    isCustomInstruction: false,
    layout: 'single-column',
    questions: [{
        id: 'q1',
        questionNumber: 1,
        type: 'mcq-sign-notice',
        intent: 'mcq-sign-notice',
        questionText: 'What does it mean?',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        imageUrl,
        imageCaption,
    }],
});

describe('THCS visual prompt requirement', () => {
    it('accepts either an uploaded image or a teacher-entered text alternative', () => {
        expect(getMissingVisualQuestionImages([visualSection()])).toHaveLength(1);
        expect(getMissingVisualQuestionImages([visualSection('https://example.test/sign.png')])).toHaveLength(0);
        expect(getMissingVisualQuestionImages([visualSection(undefined, 'NO PARKING')])).toHaveLength(0);
    });
});

const parsedTest = (overrides: Partial<ParsedTest> = {}): ParsedTest => ({
    metadata: { title: 'Imported test', duration: 60, gradeLevel: 8, examType: 'midterm' },
    sections: [{ name: 'Multiple choice', instructionText: 'Choose the best answer.', startLine: 0, endLine: 2,
        detectedType: 'mcq-grammar', typeConfidence: 1,
        questions: [{ questionNumber: 1, text: 'Choose a word.', type: 'mcq-grammar', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A' }] }],
    answerKey: { 1: 'A' }, warnings: [], overallConfidence: 1, ...overrides,
});

const renderSurface = (props: Partial<React.ComponentProps<typeof THCSTestEditorSurface>> = {}) => {
    const defaultProps = {
        onExit: vi.fn(),
        presentation: 'embedded' as const,
        onStepChange: vi.fn(),
        onWideLayoutChange: vi.fn(),
    };

    return render(<>
        <ToastContainer />
        <THCSTestEditorSurface {...defaultProps} {...props} />
    </>);
};

describe('THCSTestEditorSurface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        toast.clear();
        mockParseThcsText.mockReset();
        mockValidationState.enforceMetadata = false;
    });

    it('keeps Step 1 active until all publish-required metadata is complete', async () => {
        mockValidationState.enforceMetadata = true;
        const user = userEvent.setup();
        renderSurface();

        const next = screen.getByRole('button', { name: /Next: Build Test/i });
        expect(next).toBeDisabled();
        expect(screen.getByText(/Test title is required.*Exam type is required/)).toBeInTheDocument();

        await user.click(screen.getByText('Start Blank'));
        expect(screen.queryByText('Questions Step')).not.toBeInTheDocument();

        await user.type(screen.getByLabelText('Test Title'), 'Grade 9 Midterm');
        await user.type(screen.getByLabelText('Exam Type'), 'midterm');
        await waitFor(() => expect(next).toBeEnabled());
        await user.click(next);
        expect(screen.getByText('Questions Step')).toBeInTheDocument();
    });





    it('keeps Paste Test in Test Setup and parses from the shared footer', async () => {
        const user = userEvent.setup();
        const onStepChange = vi.fn();
        renderSurface({ onStepChange });
        await user.click(screen.getByText('Paste Test'));
        expect(screen.getByTestId('wizard-step')).toHaveTextContent('0');
        expect(screen.getByTestId('wizard-label')).toHaveTextContent('Test Setup');
        expect(screen.getByRole('heading', { name: 'Paste Test' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Parse Test' })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Back: Setup/i })).toBeEnabled();
        expect(onStepChange).toHaveBeenLastCalledWith(0);
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

    it('locks paste actions while parsing and sends a clean import straight to Build Test', async () => {
        const user = userEvent.setup();
        let complete!: (value: { success: true; data: ParsedTest }) => void;
        mockParseThcsText.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
        renderSurface();
        await user.click(screen.getByText('Paste Test'));
        await user.type(screen.getByLabelText('Test source'), 'Question 1. Choose a word.');
        await user.click(screen.getByRole('button', { name: 'Parse Test' }));
        expect(screen.getByRole('status')).toHaveTextContent(/Parsing/);
        expect(screen.getByLabelText('Test source')).toBeDisabled();
        expect(screen.getByRole('button', { name: /Back: Setup/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Parsing/ })).toBeDisabled();
        complete({ success: true, data: parsedTest() });
        await waitFor(() => expect(screen.getByText('Questions Step')).toBeInTheDocument());
        expect(screen.getByTestId('wizard-step')).toHaveTextContent('1');
        expect(screen.getByTestId('wizard-label')).toHaveTextContent('Build Test');
        expect(screen.queryByText('Import needs attention')).not.toBeInTheDocument();
    });

    it('keeps setup metadata authoritative without Review conflict choices', async () => {
        const user = userEvent.setup();
        mockParseThcsText.mockResolvedValueOnce({ success: true, data: parsedTest() });
        renderSurface();
        await user.type(screen.getByLabelText('Test Title'), 'Teacher Setup Title');
        await user.type(screen.getByLabelText('Exam Type'), 'final');
        await user.click(screen.getByText('Paste Test'));
        await user.type(screen.getByLabelText('Test source'), 'Question 1. Choose a word.');
        await user.click(screen.getByRole('button', { name: 'Parse Test' }));
        await waitFor(() => expect(screen.getByText('Questions Step')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /Next: Answer Key/i }));
        await user.click(screen.getByRole('button', { name: /Next: Review/i }));
        expect(screen.getByTestId('review-title')).toHaveTextContent('Teacher Setup Title');
        expect(screen.getByTestId('review-duration')).toHaveTextContent('45');
        expect(screen.getByTestId('review-grade')).toHaveTextContent('9');
        expect(screen.getByTestId('review-exam-type')).toHaveTextContent('final');
        expect(screen.queryByRole('button', { name: 'Apply Parsed Values' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Keep Current Setup' })).not.toBeInTheDocument();
    });

    it.each(['keep-source', 'discard'] as const)('resolves exceptional import using %s before entering Studio', async (resolution) => {
        const user = userEvent.setup();
        const source = 'Question 1. Choose a word.\nQuestion 2. Unsupported content.';
        mockParseThcsText.mockResolvedValueOnce({ success: true, data: parsedTest() });
        renderSurface();
        await user.click(screen.getByText('Paste Test'));
        await user.type(screen.getByLabelText('Test source'), source);
        await user.click(screen.getByRole('button', { name: 'Parse Test' }));
        await waitFor(() => expect(screen.getByText('Import needs attention')).toBeInTheDocument());
        expect(screen.getByTestId('wizard-step')).toHaveTextContent('0');
        expect(screen.getByRole('button', { name: 'Keep as editable text' })).toHaveAttribute('aria-pressed', 'true');
        if (resolution === 'discard') await user.click(screen.getByRole('button', { name: 'Leave this content out' }));
        await user.click(screen.getByRole('button', { name: /Continue to Studio/i }));
        await waitFor(() => expect(screen.getByText('Questions Step')).toBeInTheDocument());
        expect(screen.getByText('Choose a word.')).toBeInTheDocument();
        if (resolution === 'keep-source') expect(screen.getByText(/Question 2. Unsupported content/)).toBeInTheDocument();
        else expect(screen.queryByText(/Question 2. Unsupported content/)).not.toBeInTheDocument();
    });

    it('retains the source after parse failure and allows a retry', async () => {
        const user = userEvent.setup();
        mockParseThcsText.mockResolvedValueOnce({ success: false, error: 'Parser unavailable' })
            .mockResolvedValueOnce({ success: true, data: parsedTest() });
        renderSurface();
        await user.click(screen.getByText('Paste Test'));
        await user.type(screen.getByLabelText('Test source'), 'Question 1. Choose a word.');
        await user.click(screen.getByRole('button', { name: 'Parse Test' }));
        await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Could not import this test'));
        expect(screen.getByLabelText('Test source')).toHaveValue('Question 1. Choose a word.');
        expect(screen.getByLabelText('Test source')).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Parse Test' }));
        await waitFor(() => expect(screen.getByText('Questions Step')).toBeInTheDocument());
        expect(mockParseThcsText).toHaveBeenCalledTimes(2);
    });
});
