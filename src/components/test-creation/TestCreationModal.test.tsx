/**
 * TestCreationModal Unit Tests
 *
 * Tests for the TestCreationModal shell component.
 *
 * @module TestCreationModal.test
 * @version 1.0.0
 * @date 2026-02-07
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
const mockNavigate = vi.hoisted(() => vi.fn());
const mockGenerateReadingV2AutoImportCandidate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});
vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'user-1' },
    }),
}));
vi.mock('../../services/reading-v2/readingV2AutoImport.service', () => ({
    generateReadingV2AutoImportCandidate: mockGenerateReadingV2AutoImportCandidate,
}));
vi.mock('../../skills/listening/builders/ListeningTestBuilder', () => ({
    default: (props: {
        presentation?: string;
        initialDisplayMode?: string;
        initialStep?: string;
        onExit?: () => void;
        onPublished?: () => void;
        onDirtyChange?: (dirty: boolean) => void;
    }) => (
        <div
            data-testid="listening-builder"
            data-presentation={props.presentation}
            data-mode={props.initialDisplayMode}
            data-step={props.initialStep}
        >
            <button type="button" onClick={() => props.onDirtyChange?.(true)}>Mark Listening Dirty</button>
            <button type="button" onClick={props.onExit}>Back to Listening Mode</button>
            <button type="button" onClick={props.onPublished}>Publish Listening</button>
        </div>
    ),
}));
import TestCreationModal from './TestCreationModal';

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');

// ═══════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════

const renderModal = (props: Partial<Parameters<typeof TestCreationModal>[0]> = {}) => {
    const defaultProps = {
        opened: true,
        onClose: vi.fn(),
    };

    return render(
        <BrowserRouter>
            <TestCreationModal {...defaultProps} {...props} />
        </BrowserRouter>
    );
};

const openReadingV2PasteImportStep = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByText('IELTS'));

    await waitFor(() => {
        expect(screen.getByText('Reading V2')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Reading V2'));

    const titleInput = await screen.findByDisplayValue(/IELTS Reading-v2 Test/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'V2 Metadata First');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
        expect(screen.getByText('Reading V2 setup ready')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Paste Text/i }));

    await waitFor(() => {
        expect(screen.getByText('Paste Reading V2 source')).toBeInTheDocument();
    });
};

const openReadingV2AutoImportStep = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByText('IELTS'));

    await waitFor(() => {
        expect(screen.getByText('Reading V2')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Reading V2'));

    const titleInput = await screen.findByDisplayValue(/IELTS Reading-v2 Test/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'V2 Auto Metadata');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
        expect(screen.getByText('Reading V2 setup ready')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Auto/i }));

    await waitFor(() => {
        expect(screen.getByText('Auto Reading V2 source')).toBeInTheDocument();
    });
};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('TestCreationModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockReset();
        mockGenerateReadingV2AutoImportCandidate.mockReset();
        mockGenerateReadingV2AutoImportCandidate.mockResolvedValue({
            success: true,
            structuredPayloadText: '<!-- CODEX_IELTS_READING_MATERIALS_START -->{}<!-- CODEX_IELTS_READING_MATERIALS_END -->',
            answerKeyText: '1 TRUE',
            diagnostics: [],
            provider: 'gemini',
            model: 'gemini-2.5-flash+auto-v4-staged-adapter',
            passageCount: 1,
            questionCount: 1,
            candidate: {
                sourceKind: 'auto-gemini',
                rawText: '<!-- CODEX_IELTS_READING_MATERIALS_START -->{}<!-- CODEX_IELTS_READING_MATERIALS_END -->',
                answerKeyText: '1 TRUE',
                fileName: 'Auto V4 import',
                evidence: ['Detected 1 structured passage'],
                uncertaintyMarkers: [],
                publishBlockingPlaceholders: [],
            },
        });
    });

    afterEach(() => {
        if (originalClipboardDescriptor) {
            Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
        } else {
            delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
        }

        if (originalExecCommandDescriptor) {
            Object.defineProperty(document, 'execCommand', originalExecCommandDescriptor);
        } else {
            delete (document as Document & { execCommand?: Document['execCommand'] }).execCommand;
        }
    });

    describe('Initial Render', () => {
        it('renders modal when opened is true', () => {
            renderModal({ opened: true });

            expect(screen.getByText('Test Type')).toBeInTheDocument();
            expect(screen.getByText(/Choose the exam format/i)).toBeInTheDocument();
        });

        it('does not render modal when opened is false', () => {
            renderModal({ opened: false });

            expect(screen.queryByText('Test Type')).not.toBeInTheDocument();
        });

        it('starts on type selection step by default', () => {
            renderModal();

            expect(screen.getByText('IELTS')).toBeInTheDocument();
            expect(screen.getByText('International English Language Testing System')).toBeInTheDocument();
        });

        it('shows step indicator with correct initial state', () => {
            renderModal();

            // Step indicator should show 5 steps (pill indicators)
            const stepIndicator = screen.getByText(/Step 1 of 5/i);
            expect(stepIndicator).toBeInTheDocument();
        });

    });

    describe('Type Selection Step', () => {
        it('displays all test type options', () => {
            renderModal();

            expect(screen.getByText('IELTS')).toBeInTheDocument();
            expect(screen.getByText('TOEIC')).toBeInTheDocument();
            expect(screen.getByText('SAT')).toBeInTheDocument();
            expect(screen.getByText('THCS-THPT')).toBeInTheDocument();
            expect(screen.getByText('Custom Test')).toBeInTheDocument();
        });

        it('shows "COMING SOON" badge for unavailable test types', () => {
            renderModal();

            const comingSoonBadges = screen.getAllByText('COMING SOON');
            // TOEIC, SAT, Custom are unavailable
            expect(comingSoonBadges.length).toBe(3);
        });

        it('advances to skill step when IELTS is clicked', async () => {
            const user = userEvent.setup();
            renderModal();

            await user.click(screen.getByText('IELTS'));

            // Wait for animation and check that we're on skill step
            await waitFor(() => {
                // Check for step description which is unique to skill step (partial match due to bullet separator)
                expect(screen.getByText(/Select the skill to test/i)).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('does not advance when clicking unavailable test type', async () => {
            const user = userEvent.setup();
            renderModal();

            await user.click(screen.getByText('TOEIC'));

            // Should still be on type step
            expect(screen.getByText('Test Type')).toBeInTheDocument();
        });

        it('branches THCS-THPT into the shared creation modal flow', async () => {
            const user = userEvent.setup();
            renderModal();

            await user.click(screen.getByText('THCS-THPT'));

            await waitFor(() => {
                expect(screen.getByText('THCS-THPT Test')).toBeInTheDocument();
                expect(screen.getByText('Test Setup · Step 1 of 4')).toBeInTheDocument();
            });
            expect(mockNavigate).not.toHaveBeenCalled();
        });
    });

    describe('Skill Selection Step', () => {
        it('displays skill options after selecting IELTS', async () => {
            const user = userEvent.setup();
            renderModal();

            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.queryByText('Reading')).not.toBeInTheDocument();
                expect(screen.getByText('Reading V2')).toBeInTheDocument();
                expect(screen.getByText('Listening')).toBeInTheDocument();
                expect(screen.getByText('Writing')).toBeInTheDocument();
                expect(screen.getByText('Speaking')).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('keeps Writing selection inside the modal flow', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Writing')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Writing'));

            await waitFor(() => {
                expect(onClose).not.toHaveBeenCalled();
                expect(mockNavigate).not.toHaveBeenCalled();
                expect(screen.getByText('Advanced Settings')).toBeInTheDocument();
            });
        });

        it('collects Listening metadata and mode before opening the builder', async () => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            renderModal({ onClose, onAction });

            fireEvent.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Listening')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByText('Listening'));

            const titleInput = await screen.findByDisplayValue(/IELTS Listening Test/i);
            const durationSelect = screen.getAllByRole('combobox')[0];
            expect(durationSelect).toHaveValue('30');
            fireEvent.change(titleInput, { target: { value: 'Listening Modal Test' } });

            expect(onClose).not.toHaveBeenCalled();
            expect(mockNavigate).not.toHaveBeenCalled();
            expect(onAction).toHaveBeenCalledWith('selectListeningSkill', { testType: 'IELTS' });

            fireEvent.click(screen.getByRole('button', { name: /continue/i }));

            await waitFor(() => {
                expect(screen.getByText('Listening setup ready')).toBeInTheDocument();
                expect(screen.getByRole('button', { name: /Use Text/i })).toBeInTheDocument();
                expect(screen.getByRole('button', { name: /Use Image/i })).toBeInTheDocument();
            });

            fireEvent.click(screen.getByRole('button', { name: /Use Image/i }));

            const builder = await screen.findByTestId('listening-builder');
            expect(onClose).not.toHaveBeenCalled();
            expect(builder).toHaveAttribute('data-presentation', 'embedded');
            expect(builder).toHaveAttribute('data-mode', 'image');
            expect(builder).toHaveAttribute('data-step', 'audio');
            expect(onAction).toHaveBeenCalledWith('startListeningCreationMode', expect.objectContaining({
                source: 'test_creation_modal',
                testType: 'IELTS',
                displayMode: 'image',
                titleLength: 'Listening Modal Test'.length,
            }));
            expect(mockNavigate).not.toHaveBeenCalled();

            fireEvent.click(screen.getByRole('button', { name: /Back to Listening Mode/i }));

            expect(screen.getByText('Listening setup ready')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: /Use Text/i }));

            expect(await screen.findByTestId('listening-builder')).toHaveAttribute('data-mode', 'text');

            fireEvent.click(screen.getByRole('button', { name: /Publish Listening/i }));

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('collects Reading V2 metadata before showing paste or blank choices', async () => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose, onAction });

            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Reading V2')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Reading V2'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });
            expect(onClose).not.toHaveBeenCalled();
            expect(mockNavigate).not.toHaveBeenCalled();
            expect(onAction).toHaveBeenCalledWith('selectReadingV2Skill', { testType: 'IELTS' });

            await user.click(screen.getByRole('button', { name: /continue/i }));

            await waitFor(() => {
                expect(screen.getByText('Reading V2 setup ready')).toBeInTheDocument();
                expect(screen.getByRole('button', { name: /Paste Text/i })).toBeInTheDocument();
                expect(screen.getByRole('button', { name: /Auto/i })).toBeInTheDocument();
                expect(screen.getByRole('button', { name: /Create New Test/i })).toBeInTheDocument();
                expect(screen.getByRole('button', { name: /Use existing Reading Passages/i })).toBeInTheDocument();
            });
        });

        it('opens the existing Reading Passages draft-master flow only for Reading V2', async () => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const onCreateReadingV2FromExistingPassages = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose, onAction, onCreateReadingV2FromExistingPassages });

            await user.click(screen.getByText('IELTS'));
            await waitFor(() => {
                expect(screen.getByText('Reading V2')).toBeInTheDocument();
            });
            await user.click(screen.getByText('Reading V2'));

            const titleInput = await screen.findByDisplayValue(/IELTS Reading-v2 Test/i);
            await user.clear(titleInput);
            await user.type(titleInput, 'Existing Passages Master');
            await user.click(screen.getByRole('button', { name: /continue/i }));

            const existingPassagesButton = await screen.findByRole(
                'button',
                { name: /Use existing Reading Passages/i },
                { timeout: 10000 },
            );
            await user.click(existingPassagesButton);

            expect(mockNavigate).not.toHaveBeenCalled();
            expect(onClose).toHaveBeenCalled();
            expect(onCreateReadingV2FromExistingPassages).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Existing Passages Master',
                durationMinutes: 60,
                ownerId: 'user-1',
                primaryTestTypeId: 'ielts',
                testTypeIds: ['ielts'],
            }));
            expect(onAction).toHaveBeenCalledWith('startReadingV2ExistingPassages', expect.objectContaining({
                source: 'test_creation_modal',
                testType: 'IELTS',
                titleLength: 'Existing Passages Master'.length,
            }));
        });

        it('opens Reading V2 paste setup before routing parsed import content into Studio', async () => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose, onAction });

            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Reading V2')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Reading V2'));

            const titleInput = await screen.findByDisplayValue(/IELTS Reading-v2 Test/i);
            await user.clear(titleInput);
            await user.type(titleInput, 'V2 Metadata First');
            await user.click(screen.getByRole('button', { name: /continue/i }));

            await waitFor(() => {
                expect(screen.getByText('Reading V2 setup ready')).toBeInTheDocument();
            });

            await user.click(screen.getByRole('button', { name: /Paste Text/i }));

            await waitFor(() => {
                expect(screen.getByText('Paste Reading V2 source')).toBeInTheDocument();
                expect(screen.getByRole('button', { name: /Copy Prompt/i })).toBeInTheDocument();
                expect(screen.getByLabelText('Reading V2 passages and questions')).toBeInTheDocument();
                expect(screen.queryByLabelText('Reading V2 teacher answer key')).not.toBeInTheDocument();
            });
            expect(onClose).not.toHaveBeenCalled();
            expect(mockNavigate).not.toHaveBeenCalled();
            expect(onAction).toHaveBeenCalledWith('startReadingV2Import', expect.objectContaining({
                source: 'test_creation_modal',
                testType: 'IELTS',
                titleLength: 'V2 Metadata First'.length,
            }));

            fireEvent.change(screen.getByLabelText('Reading V2 passages and questions'), {
                target: {
                    value: [
                        '## Imported Reading passage',
                        '',
                        'This imported passage has enough text to become editable inside Reading V2 Studio after the setup modal parses it.',
                        '',
                        '#### Questions 1-1',
                        'Complete the sentence.',
                        '**1** imported answer',
                    ].join('\n'),
                },
            });
            await user.click(screen.getByRole('button', { name: /Parse & Review in Studio/i }));

            expect(onClose).toHaveBeenCalled();
            expect(mockNavigate).toHaveBeenCalledWith('/teacher/reading-v2/import', {
                state: expect.objectContaining({
                    entryPoint: 'test-creation-modal',
                    testType: 'IELTS',
                    skill: 'Reading V2',
                    startMode: 'create-from-import',
                    initialMetadata: expect.objectContaining({
                        title: 'V2 Metadata First',
                        durationMinutes: 60,
                        ownerId: 'user-1',
                        primaryTestTypeId: 'ielts',
                        testTypeIds: ['ielts'],
                    }),
                    initialImportCandidate: expect.objectContaining({
                        sourceKind: 'pasted-text',
                        rawText: expect.stringContaining('Imported Reading passage'),
                    }),
                }),
            });
            expect(onAction).toHaveBeenCalledWith('parseReadingV2ImportSetup', expect.objectContaining({
                source: 'test_creation_modal',
                testType: 'IELTS',
                titleLength: 'V2 Metadata First'.length,
            }));
        });

        it('opens Reading V2 Auto setup and routes Auto V4 output into Studio review', async () => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose, onAction });

            await openReadingV2AutoImportStep(user);

            expect(screen.getByLabelText('Reading V2 Auto raw test text')).toBeInTheDocument();
            expect(screen.getByText('Auto V4 import')).toBeInTheDocument();
            expect(screen.queryByText('Internal Gemini import')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Copy Prompt/i })).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Reading V2 teacher answer key')).not.toBeInTheDocument();
            expect(onAction).toHaveBeenCalledWith('startReadingV2AutoImport', expect.objectContaining({
                source: 'test_creation_modal',
                testType: 'IELTS',
                titleLength: 'V2 Auto Metadata'.length,
            }));

            fireEvent.change(screen.getByLabelText('Reading V2 Auto raw test text'), {
                target: {
                    value: [
                        'READING PASSAGE 1',
                        'This raw passage text is long enough for Auto V4 processing and Studio review.',
                        'Questions 1-1',
                        '1 A statement.',
                        'Answers',
                        '1 TRUE',
                    ].join('\n'),
                },
            });

            await user.click(screen.getByRole('button', { name: /Process with Auto V4/i }));

            await waitFor(() => {
                expect(mockGenerateReadingV2AutoImportCandidate).toHaveBeenCalledWith(
                    {
                        rawTestText: expect.stringContaining('READING PASSAGE 1'),
                        sourceName: 'V2 Auto Metadata',
                    },
                    expect.objectContaining({
                        pipelineLane: 'v4-full-doc',
                        forceV4Pipeline: true,
                        onDiagnosticEvent: expect.any(Function),
                    }),
                );
            });
            expect(onClose).toHaveBeenCalled();
            expect(mockNavigate).toHaveBeenCalledWith('/teacher/reading-v2/import', {
                state: expect.objectContaining({
                    entryPoint: 'test-creation-modal',
                    testType: 'IELTS',
                    skill: 'Reading V2',
                    startMode: 'create-from-auto',
                    initialMetadata: expect.objectContaining({
                        title: 'V2 Auto Metadata',
                        provenanceSummary: 'Generated from Auto V4 source-verified import in Test Creation Modal',
                        primaryTestTypeId: 'ielts',
                        testTypeIds: ['ielts'],
                    }),
                    initialImportCandidate: expect.objectContaining({
                        sourceKind: 'auto-gemini',
                        answerKeyText: '1 TRUE',
                    }),
                }),
            });
            expect(onAction).toHaveBeenCalledWith('submitReadingV2AutoImport', expect.objectContaining({
                provider: 'auto-v4',
                pipelineLane: 'v4-full-doc',
                sourceLength: expect.any(Number),
            }));
            expect(onAction).toHaveBeenCalledWith('completeReadingV2AutoImport', expect.objectContaining({
                provider: 'gemini',
                pipelineLane: 'v4-full-doc',
                model: 'gemini-2.5-flash+auto-v4-staged-adapter',
                passageCount: 1,
                questionCount: 1,
            }));
        });

        it('keeps Auto source in place when Auto V4 fails guardrails', async () => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const user = userEvent.setup();
            mockGenerateReadingV2AutoImportCandidate.mockResolvedValueOnce({
                success: false,
                error: 'Gemini returned malformed Reading V2 JSON.',
                diagnostics: [
                    {
                        code: 'malformed-json',
                        severity: 'error',
                        message: 'Gemini returned malformed Reading V2 JSON.',
                    },
                ],
                provider: 'gemini',
                model: 'gemini-2.5-flash+auto-v4-staged-adapter',
            });
            renderModal({ onClose, onAction });

            await openReadingV2AutoImportStep(user);
            fireEvent.change(screen.getByLabelText('Reading V2 Auto raw test text'), {
                target: { value: 'READING PASSAGE 1\nRaw source.\nQuestions 1-1\n1 Prompt.\nAnswers\n1 TRUE' },
            });

            await user.click(screen.getByRole('button', { name: /Process with Auto V4/i }));

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('Gemini returned malformed Reading V2 JSON.');
            });
            expect(screen.getByLabelText('Reading V2 Auto footer status'))
                .toHaveTextContent('Gemini returned malformed Reading V2 JSON.');
            expect((screen.getByLabelText('Reading V2 Auto raw test text') as HTMLTextAreaElement).value)
                .toContain('READING PASSAGE 1');
            expect(onClose).not.toHaveBeenCalled();
            expect(mockNavigate).not.toHaveBeenCalled();
            expect(onAction).toHaveBeenCalledWith('failReadingV2AutoImport', expect.objectContaining({
                provider: 'gemini',
                diagnosticCount: 1,
            }));
        });

        it.each([
            ['Gemini source verifier quota', 'All Gemini API keys exhausted or rate-limited'],
        ])('keeps Auto source recoverable when Auto V4 hits %s', async (_caseName, errorMessage) => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const user = userEvent.setup();
            mockGenerateReadingV2AutoImportCandidate.mockResolvedValueOnce({
                success: false,
                error: errorMessage,
                diagnostics: [
                    {
                        code: 'provider-quota-exhausted',
                        severity: 'error',
                        message: errorMessage,
                    },
                ],
                provider: 'gemini',
                model: 'gemini-2.5-flash+auto-v4-staged-adapter',
            });
            renderModal({ onClose, onAction });

            await openReadingV2AutoImportStep(user);
            fireEvent.change(screen.getByLabelText('Reading V2 Auto raw test text'), {
                target: { value: 'READING PASSAGE 1\nRaw source.\nQuestions 1-1\n1 Prompt.\nAnswers\n1 TRUE' },
            });

            await user.click(screen.getByRole('button', { name: /Process with Auto V4/i }));

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
            });
            expect(screen.getByLabelText('Reading V2 Auto diagnostics'))
                .toHaveTextContent(errorMessage);
            expect((screen.getByLabelText('Reading V2 Auto raw test text') as HTMLTextAreaElement).value)
                .toContain('READING PASSAGE 1');
            expect(onClose).not.toHaveBeenCalled();
            expect(mockNavigate).not.toHaveBeenCalled();
            expect(onAction).toHaveBeenCalledWith('failReadingV2AutoImport', expect.objectContaining({
                provider: 'gemini',
                diagnosticCount: 1,
            }));
        });

        it('redacts provider keys and local paths from Auto V4 visible failure metadata', async () => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const user = userEvent.setup();
            const fakeRawKey = ['gsk', '_visiblefailurekeymustnotleak1234567890'].join('');
            const rawError = `Failed with ${fakeRawKey} at C:\\Users\\The Lord\\Desktop\\luyentap\\Clippings\\source.md`;
            mockGenerateReadingV2AutoImportCandidate.mockResolvedValueOnce({
                success: false,
                error: rawError,
                diagnostics: [
                    {
                        code: 'provider-quota-exhausted',
                        severity: 'error',
                        message: rawError,
                    },
                ],
                provider: 'gemini',
                model: 'gemini-2.5-flash+auto-v4-staged-adapter',
            });
            renderModal({ onClose, onAction });

            await openReadingV2AutoImportStep(user);
            fireEvent.change(screen.getByLabelText('Reading V2 Auto raw test text'), {
                target: { value: 'READING PASSAGE 1\nRaw source.\nQuestions 1-1\n1 Prompt.\nAnswers\n1 TRUE' },
            });

            await user.click(screen.getByRole('button', { name: /Process with Auto V4/i }));

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('[redacted-key]');
            });
            expect(screen.getByRole('alert')).toHaveTextContent('[redacted-windows-path]');
            expect(screen.getByLabelText('Reading V2 Auto diagnostics')).toHaveTextContent('[redacted-key]');
            expect(document.body).not.toHaveTextContent(fakeRawKey);
            expect(document.body).not.toHaveTextContent('C:\\Users\\The Lord\\Desktop');
            expect(onAction).toHaveBeenCalledWith('failReadingV2AutoImport', expect.objectContaining({
                provider: 'gemini',
                error: expect.stringContaining('[redacted-key]'),
            }));
            expect(onClose).not.toHaveBeenCalled();
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it('copies the Reading V2 external AI prompt from the paste setup step', async () => {
            const onAction = vi.fn();
            const user = userEvent.setup();
            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: { writeText },
            });
            renderModal({ onAction });

            await openReadingV2PasteImportStep(user);
            await user.click(screen.getByRole('button', { name: /Copy Prompt/i }));

            await waitFor(() => {
                expect(writeText).toHaveBeenCalledWith(expect.stringContaining('CODEX_IELTS_READING_MATERIALS_START'));
                expect(writeText).toHaveBeenCalledWith(expect.stringContaining('answerKeyAudit'));
                expect(writeText).toHaveBeenCalledWith(expect.stringContaining('matching-headings'));
                expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Never silently drop Passage 2, Passage 3'));
                expect(screen.getByRole('button', { name: /Copied/i })).toBeInTheDocument();
            });
            expect(onAction).toHaveBeenCalledWith('copyReadingV2ImportPrompt', expect.objectContaining({
                source: 'test_creation_modal',
                testType: 'IELTS',
                outcome: 'success',
            }));
        });

        it('clears Reading V2 paste source without closing the modal', async () => {
            const onClose = vi.fn();
            const onAction = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose, onAction });

            await openReadingV2PasteImportStep(user);

            expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();

            fireEvent.change(screen.getByLabelText('Reading V2 passages and questions'), {
                target: { value: '## Passage\n\nText\n\n#### Questions 1-1\n**1** Prompt ___' },
            });

            await user.click(screen.getByRole('button', { name: 'Clear' }));

            expect(screen.getByLabelText('Reading V2 passages and questions')).toHaveValue('');
            expect(onClose).not.toHaveBeenCalled();
            expect(onAction).toHaveBeenCalledWith('clearReadingV2ImportSetup', expect.objectContaining({
                source: 'test_creation_modal',
                testType: 'IELTS',
            }));
        });

        it('shows the Reading V2 external AI prompt when browser copy is blocked', async () => {
            const onAction = vi.fn();
            const user = userEvent.setup();
            const writeText = vi.fn().mockRejectedValue(new Error('blocked'));
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: { writeText },
            });
            Object.defineProperty(document, 'execCommand', {
                configurable: true,
                value: vi.fn().mockReturnValue(false),
            });
            renderModal({ onAction });

            await openReadingV2PasteImportStep(user);
            await user.click(screen.getByRole('button', { name: /Copy Prompt/i }));

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('Copy failed');
            });
            const manualPrompt = screen.getByLabelText('Reading V2 external AI prompt') as HTMLTextAreaElement;
            expect(manualPrompt.value).toContain('CODEX_IELTS_READING_MATERIALS_START');
            expect(manualPrompt.value).toContain('answerKeyAudit');
            expect(manualPrompt.value).toContain('sectionReferences');
            expect(onAction).toHaveBeenCalledWith('copyReadingV2ImportPrompt', expect.objectContaining({
                source: 'test_creation_modal',
                testType: 'IELTS',
                outcome: 'failure',
            }));
        });
    });

    describe('Navigation', () => {
        it('shows Back button after first step', async () => {
            const user = userEvent.setup();
            renderModal();

            // On first step, no Back button in footer
            expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();

            // Select IELTS
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Skill')).toBeInTheDocument();
            });

            // Now Back button should be visible
            // Note: Button contains SVG + "Back" text
            const backButtons = screen.getAllByText(/Back/i);
            expect(backButtons.length).toBeGreaterThan(0);
        });

        it('navigates back to previous step when Back is clicked', async () => {
            const user = userEvent.setup();
            renderModal();

            // Navigate to skill step
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Skill')).toBeInTheDocument();
            });

            // Click Back
            const backButtons = screen.getAllByText(/Back/i);
            await user.click(backButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Test Type')).toBeInTheDocument();
            });
        });
    });

    describe('Close Behavior', () => {
        it('calls onClose when Cancel is clicked on first step', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            await user.click(screen.getByRole('button', { name: /cancel/i }));

            expect(onClose).toHaveBeenCalled();
        });

        it('calls onClose when Cancel is clicked on the skill step', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Skill')).toBeInTheDocument();
            });

            await user.click(screen.getByRole('button', { name: /cancel/i }));

            expect(screen.queryByText(/Discard Changes\?/i)).not.toBeInTheDocument();
            expect(onClose).toHaveBeenCalled();
        });

        it('calls onClose when Cancel is clicked on the metadata step before edits', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Listening')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });

            await user.click(screen.getByRole('button', { name: /cancel/i }));

            expect(screen.queryByText(/Discard Changes\?/i)).not.toBeInTheDocument();
            expect(onClose).toHaveBeenCalled();
        });

        it('calls onClose when Cancel is clicked on Listening metadata before edits', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Listening')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });

            await user.click(screen.getByRole('button', { name: /cancel/i }));

            expect(screen.queryByText(/Discard Changes\?/i)).not.toBeInTheDocument();
            expect(onClose).toHaveBeenCalled();
        });

        it('does not warn when generated Listening metadata has only default values', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Listening')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });

            fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '30' } });
            await user.click(screen.getByRole('button', { name: /cancel/i }));

            expect(screen.queryByText(/Discard Changes\?/i)).not.toBeInTheDocument();
            expect(onClose).toHaveBeenCalled();
        });

        it('calls onClose when X button is clicked', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            const closeButton = screen.getByRole('button', { name: /close modal/i });
            await user.click(closeButton);

            expect(onClose).toHaveBeenCalled();
        });

        it('shows confirmation dialog when closing with unsaved changes', async () => {
            const user = userEvent.setup();
            renderModal();

            // Navigate to metadata, where user-entered draft details may exist.
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Listening')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });

            const titleInput = screen.getByDisplayValue(/IELTS Listening Test/i);
            await user.clear(titleInput);
            await user.type(titleInput, 'Edited Listening Title');

            // Try to close
            const closeButton = screen.getByRole('button', { name: /close modal/i });
            await user.click(closeButton);

            // Confirmation dialog should appear
            await waitFor(() => {
                expect(screen.getByText(/Discard Changes\?/i)).toBeInTheDocument();
            });
        });

        it('closes modal when Discard is clicked in confirmation dialog', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            // Navigate to metadata, where user-entered draft details may exist.
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Listening')).toBeInTheDocument();
            }, { timeout: 3000 });

            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            }, { timeout: 3000 });

            const titleInput = screen.getByDisplayValue(/IELTS Listening Test/i);
            await user.clear(titleInput);
            await user.type(titleInput, 'Edited Listening Title');

            // Try to close
            const closeButton = screen.getByRole('button', { name: /close modal/i });
            await user.click(closeButton);

            // Wait for confirmation dialog to appear
            await waitFor(() => {
                expect(screen.getByText(/Discard Changes\?/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            // Find and click the Discard button
            const discardButton = await screen.findByText(/^Discard$/i);
            await user.click(discardButton);

            await waitFor(() => {
                expect(onClose).toHaveBeenCalled();
            });
        });

        it('keeps modal open when Keep Working is clicked', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            // Navigate to metadata, where user-entered draft details may exist.
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Listening')).toBeInTheDocument();
            }, { timeout: 3000 });

            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            }, { timeout: 3000 });

            const titleInput = screen.getByDisplayValue(/IELTS Listening Test/i);
            await user.clear(titleInput);
            await user.type(titleInput, 'Edited Listening Title');

            // Try to close
            const closeButton = screen.getByRole('button', { name: /close modal/i });
            await user.click(closeButton);

            // Wait for confirmation dialog to appear
            await waitFor(() => {
                expect(screen.getByText(/Discard Changes\?/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            // Find and click Keep Working
            const keepWorkingButton = await screen.findByText(/Keep Working/i);
            await user.click(keepWorkingButton);

            // Modal should still be open, confirmation closed
            await waitFor(() => {
                expect(onClose).not.toHaveBeenCalled();
                expect(screen.queryByText(/Discard Changes\?/i)).not.toBeInTheDocument();
            });
        });
    });

    describe('Metadata Step', () => {
        it('shows Continue button on metadata step', async () => {
            const user = userEvent.setup();
            renderModal();

            // Navigate to metadata
            await user.click(screen.getByText('IELTS'));
            await waitFor(() => screen.getByText('Listening'));
            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });

            // Continue button should be present
            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        });

        it('Continue button is disabled when title is empty', async () => {
            const user = userEvent.setup();
            renderModal();

            // Navigate to metadata
            await user.click(screen.getByText('IELTS'));
            await waitFor(() => screen.getByText('Listening'));
            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });

            // Clear the default title using fireEvent for more reliable clearing
            const textInputs = screen.getAllByRole('textbox');
            const titleInput = textInputs[0]; // First textbox is the title input
            fireEvent.change(titleInput, { target: { value: '' } });

            // Wait for state update and check Continue button is disabled
            await waitFor(() => {
                const continueButton = screen.getByRole('button', { name: /continue/i });
                expect(continueButton).toBeDisabled();
            });
        });

        it('Continue button is enabled when title is entered', async () => {
            const user = userEvent.setup();
            renderModal();

            // Navigate to metadata
            await user.click(screen.getByText('IELTS'));
            await waitFor(() => screen.getByText('Listening'));
            await user.click(screen.getByText('Listening'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });

            // Set title using fireEvent for consistent behavior
            const textInputs = screen.getAllByRole('textbox');
            const titleInput = textInputs[0];
            fireEvent.change(titleInput, { target: { value: 'My Test' } });

            // Continue button should be enabled
            await waitFor(() => {
                const continueButton = screen.getByRole('button', { name: /continue/i });
                expect(continueButton).not.toBeDisabled();
            });
        });
    });

    describe('Props', () => {
        it('accepts initialStep prop', () => {
            renderModal({ initialStep: 'metadata' });

            expect(screen.getByText('Details')).toBeInTheDocument();
        });

        it('hydrates writing edit state from initialData', async () => {
            renderModal({
                initialStep: 'writing-content',
                initialData: {
                    testType: 'IELTS',
                    skillType: 'writing',
                    writingMetadata: {
                        title: 'Loaded Writing Draft',
                        duration: 60,
                    },
                    writingFormat: 'full-test',
                    writingTasks: {
                        task1: {
                            taskType: 'line-graph',
                            promptText: 'Describe the graph.',
                            wordMinimum: 150,
                            recommendedTimeMinutes: 20,
                            showModelAnswerToStudent: false,
                        },
                        task2: {
                            taskType: 'opinion',
                            promptText: 'Discuss both views and give your opinion.',
                            wordMinimum: 250,
                            recommendedTimeMinutes: 40,
                            showModelAnswerToStudent: false,
                        },
                    },
                },
            });

            expect(await screen.findByDisplayValue('Describe the graph.')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Discuss both views and give your opinion.')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has accessible close button', () => {
            renderModal();

            const closeButton = screen.getByRole('button', { name: /close modal/i });
            expect(closeButton).toBeInTheDocument();
        });

        it('step indicators have title attributes', () => {
            renderModal();

            const step1Indicator = screen.getByTitle(/Step 1: Test Type/i);
            expect(step1Indicator).toBeInTheDocument();
        });
    });


});
