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
import { MantineProvider } from '@mantine/core';
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
vi.mock('../../services/draftCloudService', () => ({
    testDraftService: {
        createDraft: vi.fn(),
        updateDraftStatus: vi.fn(),
        saveParsedContent: vi.fn(),
    },
}));
vi.mock('../../services/test-creation', () => ({
    default: {
        parseDocument: vi.fn(),
        parseText: vi.fn(),
    },
}));
vi.mock('../../services/writingTestService', () => ({
    saveWritingDraft: vi.fn(),
    publishWritingTest: vi.fn(),
}));
vi.mock('../../pages/THCSTestEditorPage', () => ({
    THCSTestEditorSurface: () => <div>Mock THCS Editor Surface</div>,
}));
vi.mock('../../config/readingV2FeatureFlags', async () => {
    const actual = await vi.importActual<typeof import('../../config/readingV2FeatureFlags')>(
        '../../config/readingV2FeatureFlags'
    );

    return {
        ...actual,
        isReadingV2TeacherRouteExposureAllowed: () => true,
    };
});
vi.mock('../../services/reading-v2/readingV2AutoImport.service', () => ({
    generateReadingV2AutoImportCandidate: mockGenerateReadingV2AutoImportCandidate,
}));
import TestCreationModal from './TestCreationModal';
import { testDraftService } from '../../services/draftCloudService';
import testCreationService from '../../services/test-creation';

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');

// ═══════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════

const renderModal = (props: Partial<Parameters<typeof TestCreationModal>[0]> = {}) => {
    const defaultProps = {
        opened: true,
        onClose: vi.fn(),
        onComplete: vi.fn(),
    };

    return render(
        <BrowserRouter>
            <MantineProvider>
                <TestCreationModal {...defaultProps} {...props} />
            </MantineProvider>
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
                expect(screen.getByText('Reading')).toBeInTheDocument();
                expect(screen.getByText('Reading V2')).toBeInTheDocument();
                expect(screen.getByText('Listening')).toBeInTheDocument();
                expect(screen.getByText('Writing')).toBeInTheDocument();
                expect(screen.getByText('Speaking')).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('advances to metadata step when Reading is clicked', async () => {
            const user = userEvent.setup();
            renderModal();

            // Select IELTS
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Reading')).toBeInTheDocument();
            });

            // Select Reading
            await user.click(screen.getByText('Reading'));

            await waitFor(() => {
                expect(screen.getByText('Details')).toBeInTheDocument();
            });
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
            });
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

            // Navigate to skill step to create "changes"
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Skill')).toBeInTheDocument();
            });

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

            // Navigate to create changes
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Skill')).toBeInTheDocument();
            }, { timeout: 3000 });

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

            // Navigate to create changes
            await user.click(screen.getByText('IELTS'));

            await waitFor(() => {
                expect(screen.getByText('Skill')).toBeInTheDocument();
            }, { timeout: 3000 });

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
            await waitFor(() => screen.getByText('Reading'));
            await user.click(screen.getByText('Reading'));

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
            await waitFor(() => screen.getByText('Reading'));
            await user.click(screen.getByText('Reading'));

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
            await waitFor(() => screen.getByText('Reading'));
            await user.click(screen.getByText('Reading'));

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

        it('accepts initialData prop', () => {
            renderModal({
                initialStep: 'metadata',
                initialData: {
                    testType: 'IELTS',
                    skillType: 'reading',
                    metadata: { title: 'Pre-filled Title' },
                },
            });

            expect(screen.getByDisplayValue('Pre-filled Title')).toBeInTheDocument();
        });

        it('hydrates writing edit state from initialData', async () => {
            renderModal({
                initialStep: 'writing-content',
                initialWritingDraftId: 'writing-draft-1',
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

    describe('Parsing Flow', () => {
        it('shows an error and does not navigate when saving parsed content fails', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.mocked(testDraftService.createDraft).mockResolvedValue({
                success: true,
                data: { draftId: 'draft-1' },
            } as any);
            vi.mocked(testDraftService.updateDraftStatus).mockResolvedValue({
                success: true,
            } as any);
            vi.mocked(testDraftService.saveParsedContent).mockResolvedValue({
                success: false,
                error: 'Firestore write failed',
            } as any);
            vi.mocked(testCreationService.parseText).mockResolvedValue({
                success: true,
                documentText: 'Passage text',
                passages: [
                    {
                        id: 'passage_1',
                        title: 'Passage 1',
                        content: 'Paragraph text',
                        wordCount: 2,
                    },
                ],
                validationResult: {
                    mergedQuestions: [
                        {
                            questionNumber: 1,
                            questionText: 'Question 1',
                            question: 'Question 1',
                            type: 'matching-headings',
                            options: [],
                            labeledOptions: [],
                            answer: 'I',
                            passageId: 'passage_1',
                            confidence: 95,
                        },
                    ],
                },
                metadata: {
                    totalTimeMs: 1,
                    stageTimesMs: {},
                    extractionSource: 'offline',
                    usedAI: false,
                    usedOfflineFallback: true,
                    resumedFromCheckpoint: false,
                },
            } as any);

            renderModal({
                initialStep: 'parsing',
                initialData: {
                    testType: 'IELTS',
                    skillType: 'reading',
                    format: 'academic',
                    metadata: { title: 'Reading Test' },
                    inputMethod: 'paste',
                    sourceContent: 'Pasted reading content',
                    sourceFile: null,
                },
            });

            await waitFor(() => {
                expect(testDraftService.saveParsedContent).toHaveBeenCalled();
            });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '❌ Parsing failed:',
                expect.objectContaining({ message: 'Firestore write failed' })
            );
            expect(mockNavigate).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        it('prefers the staged review draft payload when saving parsed content', async () => {
            vi.mocked(testDraftService.createDraft).mockResolvedValue({
                success: true,
                data: { draftId: 'draft-1' },
            } as any);
            vi.mocked(testDraftService.updateDraftStatus).mockResolvedValue({
                success: true,
            } as any);
            vi.mocked(testDraftService.saveParsedContent).mockResolvedValue({
                success: true,
            } as any);
            vi.mocked(testCreationService.parseText).mockResolvedValue({
                success: true,
                documentText: 'Passage text',
                passages: [
                    {
                        id: 'legacy-passage-id',
                        title: 'Legacy Passage 1',
                        content: 'Legacy paragraph text',
                        wordCount: 3,
                    },
                ],
                validationResult: {
                    mergedQuestions: [
                        {
                            questionNumber: 1,
                            questionText: 'Legacy question',
                            question: 'Legacy question',
                            type: 'matching-headings',
                            options: [],
                            labeledOptions: [],
                            answer: 'I',
                            passageId: 'legacy-passage-id',
                            confidence: 95,
                        },
                    ],
                },
                parseJob: {
                    artifacts: {
                        reviewDraft: {
                            data: {
                                passages: [
                                    {
                                        id: 'review-passage-id',
                                        title: 'Review Passage 1',
                                        content: 'Review paragraph text',
                                        wordCount: 3,
                                        questionRange: { start: 1, end: 11 },
                                    },
                                ],
                                questions: [
                                    {
                                        questionNumber: 1,
                                        questionText: 'Review question',
                                        type: 'matching-headings',
                                        options: [],
                                        labeledOptions: [],
                                        answer: 'I',
                                        passageId: 'review-passage-id',
                                        confidence: 95,
                                        wordLimit: 3,
                                    },
                                    {
                                        questionNumber: 10,
                                        questionText: 'Fallback review table text',
                                        type: 'table-completion',
                                        options: null,
                                        labeledOptions: null,
                                        answer: 'China',
                                        passageId: 'review-passage-id',
                                        confidence: 94,
                                        wordLimit: { max: 2, includesNumber: false },
                                        acceptableAnswers: ['China', 'PRC'],
                                        includesNumber: false,
                                        sectionInstructionId: 'table-group-1',
                                        groupId: 'table-group-1',
                                        blankId: 'blank-10',
                                        anchorId: 'anchor-10',
                                        groupTaskType: 'table-completion',
                                        tableGroupSchemaVersion: 1,
                                        pendingTableReclassification: true,
                                    },
                                ],
                                sectionInstructions: {
                                    'review-passage-id': 'Answer questions 1-11',
                                },
                                questionGroups: [
                                    {
                                        schemaVersion: 1,
                                        groupId: 'table-group-1',
                                        taskType: 'table-completion',
                                        passageId: 'review-passage-id',
                                        questionRange: { start: 10, end: 11 },
                                        sharedContent: {
                                            instructionText: 'Complete the table.',
                                            answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
                                            constraints: { maxWords: 2 },
                                            caption: 'Medicinal plants',
                                        },
                                        columns: [{ columnId: 'col-1', order: 1 }],
                                        rows: [{ rowId: 'row-1', order: 1, cellIds: ['cell-1'] }],
                                        cells: [{
                                            cellId: 'cell-1',
                                            rowId: 'row-1',
                                            columnId: 'col-1',
                                            rowSpan: 1,
                                            colSpan: 1,
                                            role: 'body',
                                            segments: [{ kind: 'blank-anchor', anchorId: 'anchor-10' }],
                                        }],
                                        blanks: [{
                                            blankId: 'blank-10',
                                            questionNumber: 10,
                                            anchorId: 'anchor-10',
                                            cellId: 'cell-1',
                                            canonicalOrder: 1,
                                            acceptedAnswers: ['China'],
                                            constraints: { maxWords: 2 },
                                            breadcrumb: { rowHeaders: ['Plant'], columnHeaders: ['Region'] },
                                        }],
                                        provenance: {
                                            sourceWorkflow: 'in-app-parse',
                                            sourceShape: 'markdown-table',
                                            rawExcerpt: '| Plant | Region |',
                                            normalizationVersion: 1,
                                            confidence: 0.95,
                                            warnings: [],
                                            canonicalRevisionHash: 'abc12345',
                                        },
                                        canonicalReadingOrder: ['anchor-10'],
                                    },
                                ],
                                tableCompletionDiagnostics: [
                                    {
                                        groupId: 'table-group-1',
                                        questionRange: { start: 10, end: 11 },
                                        parseMode: 'deterministic',
                                        sourceWorkflow: 'in-app-parse',
                                        sourceShape: 'markdown-table',
                                        validationSeverity: 'none',
                                        issueCodes: [],
                                        issues: [],
                                        unsupportedRepairState: 'none',
                                        missingSemanticBreadcrumbs: false,
                                        canonicalRevisionHash: 'abc12345',
                                        hasCanonicalGroup: true,
                                    },
                                ],
                            },
                        },
                    },
                },
                metadata: {
                    totalTimeMs: 1,
                    stageTimesMs: {},
                    extractionSource: 'offline',
                    usedAI: false,
                    usedOfflineFallback: true,
                    resumedFromCheckpoint: false,
                },
            } as any);

            renderModal({
                initialStep: 'parsing',
                initialData: {
                    testType: 'IELTS',
                    skillType: 'reading',
                    format: 'academic',
                    metadata: { title: 'Reading Test' },
                    inputMethod: 'paste',
                    sourceContent: 'Pasted reading content',
                    sourceFile: null,
                },
            });

            await waitFor(() => {
                expect(testDraftService.saveParsedContent).toHaveBeenCalledWith(
                    'draft-1',
                    [
                        expect.objectContaining({
                            id: 'review-passage-id',
                            title: 'Review Passage 1',
                            content: 'Review paragraph text',
                            questionStart: 1,
                            questionEnd: 11,
                        }),
                    ],
                    [
                        expect.objectContaining({
                            questionNumber: 1,
                            questionText: 'Review question',
                            passageId: 'review-passage-id',
                            wordLimit: 3,
                        }),
                        expect.objectContaining({
                            questionNumber: 10,
                            questionText: 'Fallback review table text',
                            passageId: 'review-passage-id',
                            wordLimit: 2,
                            acceptableAnswers: ['China', 'PRC'],
                            includesNumber: false,
                            sectionInstructionId: 'table-group-1',
                            groupId: 'table-group-1',
                            blankId: 'blank-10',
                            anchorId: 'anchor-10',
                            groupTaskType: 'table-completion',
                            tableGroupSchemaVersion: 1,
                            pendingTableReclassification: true,
                        }),
                    ],
                    { 'review-passage-id': 'Answer questions 1-11' },
                    [
                        expect.objectContaining({
                            groupId: 'table-group-1',
                            taskType: 'table-completion',
                        }),
                    ],
                    {},
                    [
                        expect.objectContaining({
                            groupId: 'table-group-1',
                            parseMode: 'deterministic',
                        }),
                    ],
                );
            });
        });

        it('completes parsing when a structured option text starts with an article', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.mocked(testDraftService.createDraft).mockResolvedValue({
                success: true,
                data: { draftId: 'draft-1' },
            } as any);
            vi.mocked(testDraftService.updateDraftStatus).mockResolvedValue({
                success: true,
            } as any);
            vi.mocked(testDraftService.saveParsedContent).mockResolvedValue({
                success: true,
            } as any);
            vi.mocked(testCreationService.parseText).mockResolvedValue({
                success: true,
                documentText: 'Passage text',
                passages: [
                    {
                        id: 'passage_3',
                        title: 'Passage 3',
                        content: 'Paragraph text',
                        wordCount: 2,
                    },
                ],
                validationResult: {
                    mergedQuestions: [
                        {
                            questionNumber: 27,
                            questionText: 'What point does the writer make in the first paragraph?',
                            question: 'What point does the writer make in the first paragraph?',
                            type: 'multiple-choice',
                            options: [
                                {
                                    label: 'B',
                                    text: 'A basic assumption about wisdom may be wrong.',
                                },
                            ],
                            labeledOptions: [
                                {
                                    label: 'B',
                                    text: 'A basic assumption about wisdom may be wrong.',
                                },
                            ],
                            answer: 'B',
                            passageId: 'passage_3',
                            confidence: 95,
                        },
                    ],
                },
                metadata: {
                    totalTimeMs: 1,
                    stageTimesMs: {},
                    extractionSource: 'ai',
                    usedAI: true,
                    usedOfflineFallback: false,
                    resumedFromCheckpoint: false,
                },
            } as any);

            renderModal({
                initialStep: 'parsing',
                initialData: {
                    testType: 'IELTS',
                    skillType: 'reading',
                    format: 'academic',
                    metadata: { title: 'Reading Test' },
                    inputMethod: 'paste',
                    sourceContent: 'Pasted reading content',
                    sourceFile: null,
                },
            });

            await waitFor(() => {
                expect(testDraftService.saveParsedContent).toHaveBeenCalled();
            });

            const savedQuestions = vi.mocked(testDraftService.saveParsedContent).mock.calls[0]?.[2];
            expect(savedQuestions).toBeDefined();
            expect(savedQuestions?.[0]?.labeledOptions).toEqual([
                {
                    label: 'B',
                    text: 'A basic assumption about wisdom may be wrong.',
                },
            ]);

            await waitFor(() => {
                expect(screen.getByText('Parsing complete! Ready for review.')).toBeInTheDocument();
            });

            expect(consoleErrorSpy).not.toHaveBeenCalledWith(
                'âŒ Parsing failed:',
                expect.anything(),
            );
            consoleErrorSpy.mockRestore();
        });
    });
});
