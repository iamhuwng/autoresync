/**
 * TestCreationModal Unit Tests
 * 
 * Tests for the TestCreationModal shell component.
 * 
 * @module TestCreationModal.test
 * @version 1.0.0
 * @date 2026-02-07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
const mockNavigate = vi.fn();
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
import TestCreationModal from './TestCreationModal';
import { testDraftService } from '../../services/draftCloudService';
import testCreationService from '../../services/test-creation';

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

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('TestCreationModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockReset();
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

        it('keeps THCS-THPT creation inside the shared modal flow', async () => {
            const onClose = vi.fn();
            const user = userEvent.setup();
            renderModal({ onClose });

            await user.click(screen.getByText('THCS-THPT'));

            await waitFor(() => {
                expect(screen.getByText('THCS-THPT Test')).toBeInTheDocument();
                expect(screen.getByText('Test Setup - Step 1 of 4')).toBeInTheDocument();
                expect(screen.getByText('Mock THCS Editor Surface')).toBeInTheDocument();
            });
            expect(onClose).not.toHaveBeenCalled();
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
    });
});
