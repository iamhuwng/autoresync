/**
 * TestCreationModal
 *
 * Main modal shell component for the Test Creation Wizard.
 * Implements a 5-step flow: Type → Skill → Metadata → Upload → Parsing
 *
 * @module TestCreationModal
 * @version 1.0.0
 * @date 2026-02-07
 *
 * PRD Reference: PRD-0022 Test Creation Modal with Draft Management
 * Design System: Modern Pastel (glassmorphism, lavender accents)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Text } from '@mantine/core';
import { Button } from '../modern';
import MetadataStep from './MetadataStep';
import { TestUploadWizard } from './TestUploadWizard';
import { ParsingProgressScreen, type ParsingStage } from './ParsingProgressScreen';
import {
    WritingMetadataStep,
    WritingFormatStep,
    WritingContentStep,
    type WritingMetadataFields,
    type WritingTaskFields,
    type WritingFormat,
} from './WritingStepsContent';
import {
    type TestType,
    type SkillType,
    type ModalStep,
    type ModalStepData,
    type DraftMetadata,
    MODAL_STEP_ORDER,
    READING_V2_STEP_ORDER,
    WRITING_STEP_ORDER,
    INITIAL_MODAL_DATA,
    DEFAULT_DRAFT_METADATA,
    generateDefaultTitle,
} from '../../types/draft.types';
import { buildRoute } from '../../constants/routes';
import { useClipboard } from '../../core/platform';
import { useAuth } from '../../hooks/useAuth';
import { testDraftService } from '../../services/draftCloudService';
import testCreationService from '../../services/test-creation';
import {
    saveWritingDraft,
    publishWritingTest,
} from '../../services/writingTestService';
import { READING_V2_EXTERNAL_AI_PROMPT } from '../../services/reading-v2/readingV2ExternalAiPrompt.service';
import { createReadingV2ImportCandidateFromText } from '../../services/reading-v2/readingV2ImportNormalization.service';
import {
    generateReadingV2AutoImportCandidate,
    type ReadingV2AutoImportDiagnostic,
} from '../../services/reading-v2/readingV2AutoImport.service';
import type { WritingTask, WritingTestMetadata } from '../../types/ielts-writing.types';
import { canonicalizeReadingQuestion } from '../../utils/readingQuestionContract';
import { THCSTestEditorSurface } from '../../pages/THCSTestEditorPage';
import type { WizardStep } from '../thcs-editor/THCSWizardStepper';
import { isReadingV2TeacherRouteExposureAllowed } from '../../config/readingV2FeatureFlags';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TestCreationModalProps {
    /** Whether the modal is opened */
    opened: boolean;
    /** Callback when modal is closed */
    onClose: () => void;
    /** Callback when wizard completes with draft ID */
    onComplete: (draftId: string) => void;
    /** Optional initial step (for resuming) */
    initialStep?: ModalStep;
    /** Optional initial data (for resuming) */
    initialData?: Partial<ModalStepData>;
    /** Optional existing writing draft ID for edit/resume flows */
    initialWritingDraftId?: string;
    /** Optional feature/action tracking bridge from the host page */
    onAction?: (actionName: string, metadata?: Record<string, unknown>) => void;
}

const TABLE_PRESENTATION_DIAG_PREFIX = '[Diag][TablePresentationAudit]';
const READING_V2_AUTO_IMPORT_DIAG_PREFIX = '[Diag][ReadingV2AutoImport]';
const READING_V2_AUTO_SECRET_PATTERN = /\b(?:AIza[A-Za-z0-9_-]{12,}|gsk_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,})\b/g;
const READING_V2_AUTO_WINDOWS_PATH_PATTERN = /[A-Z]:\\[^:\n\r"]+/g;

const sanitizeReadingV2AutoDiagString = (value: string): string =>
    value
        .replace(READING_V2_AUTO_SECRET_PATTERN, '[redacted-key]')
        .replace(READING_V2_AUTO_WINDOWS_PATH_PATTERN, '[redacted-windows-path]');

const sanitizeReadingV2AutoDiagValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
        return sanitizeReadingV2AutoDiagString(value);
    }

    if (Array.isArray(value)) {
        return value.map(sanitizeReadingV2AutoDiagValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .map(([key, nested]) => [key, sanitizeReadingV2AutoDiagValue(nested)])
        );
    }

    return value;
};

const sanitizeReadingV2AutoDiagnostics = (
    diagnostics: readonly ReadingV2AutoImportDiagnostic[]
): readonly ReadingV2AutoImportDiagnostic[] =>
    diagnostics.map((diagnostic) => ({
        ...diagnostic,
        message: sanitizeReadingV2AutoDiagString(diagnostic.message),
    }));

const logTablePresentationDiag = (event: string, payload: Record<string, unknown>): void => {
    if (!import.meta.env.DEV) {
        return;
    }

    console.log(`${TABLE_PRESENTATION_DIAG_PREFIX} ${event}`, payload);
};

const logReadingV2AutoImportDiag = (event: string, payload: Record<string, unknown>): void => {
    if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
        return;
    }

    console.log(`${READING_V2_AUTO_IMPORT_DIAG_PREFIX} ${event}`, sanitizeReadingV2AutoDiagValue(payload));
};

interface StepConfig {
    id: ModalStep;
    label: string;
    description: string;
    icon: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STEP_CONFIGS: StepConfig[] = [
    {
        id: 'type',
        label: 'Test Type',
        description: 'Choose the exam format',
        icon: '📋',
    },
    {
        id: 'skill',
        label: 'Skill',
        description: 'Select the skill to test',
        icon: '🎯',
    },
    {
        id: 'metadata',
        label: 'Details',
        description: 'Add test information',
        icon: '📝',
    },
    {
        id: 'upload',
        label: 'Content',
        description: 'Upload or paste content',
        icon: '📤',
    },
    {
        id: 'parsing',
        label: 'Processing',
        description: 'AI is parsing your test',
        icon: '⚙️',
    },
];

/** Writing-specific step configs */
const WRITING_STEP_CONFIGS: StepConfig[] = [
    {
        id: 'type',
        label: 'Test Type',
        description: 'Choose the exam format',
        icon: '📋',
    },
    {
        id: 'skill',
        label: 'Skill',
        description: 'Select the skill to test',
        icon: '🎯',
    },
    {
        id: 'writing-metadata',
        label: 'Details',
        description: 'Add test information',
        icon: '📝',
    },
    {
        id: 'writing-format',
        label: 'Format',
        description: 'Choose test format',
        icon: '📐',
    },
    {
        id: 'writing-content',
        label: 'Content',
        description: 'Add prompts & tasks',
        icon: '✍️',
    },
];

/** Reading V2-specific entry configs */
const READING_V2_STEP_CONFIGS: StepConfig[] = [
    {
        id: 'type',
        label: 'Test Type',
        description: 'Choose the exam format',
        icon: 'ðŸ“‹',
    },
    {
        id: 'skill',
        label: 'Skill',
        description: 'Select the skill to test',
        icon: 'ðŸŽ¯',
    },
    {
        id: 'metadata',
        label: 'Details',
        description: 'Add Reading V2 information',
        icon: 'ðŸ“',
    },
    {
        id: 'reading-v2-start',
        label: 'Start',
        description: 'Choose how to build the test',
        icon: 'R2',
    },
    {
        id: 'reading-v2-import',
        label: 'Paste Import',
        description: 'Prepare source text and answer key',
        icon: 'TXT',
    },
    {
        id: 'reading-v2-auto',
        label: 'Auto',
        description: 'Generate a draft with Gemini',
        icon: 'AI',
    },
];

const DEFAULT_THCS_STEP_CONFIGS: WizardStep[] = [
    { label: 'Test Setup', icon: '📋' },
    { label: 'Build Test', icon: '✏️' },
    { label: 'Answer Key', icon: '🔑' },
    { label: 'Review & Publish', icon: '✅' },
];

/** Default writing task fields */
const DEFAULT_WRITING_TASK1: WritingTaskFields = {
    taskType: 'line-graph',
    promptText: '',
    wordMinimum: 150,
    recommendedTimeMinutes: 20,
    showModelAnswerToStudent: false,
};

const DEFAULT_WRITING_TASK2: WritingTaskFields = {
    taskType: 'opinion',
    promptText: '',
    wordMinimum: 250,
    recommendedTimeMinutes: 40,
    showModelAnswerToStudent: false,
};

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const modalStyles = {
    content: {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(245, 243, 255, 0.98) 100%)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        boxShadow: '0 25px 50px -12px rgba(139, 92, 246, 0.25)',
        borderRadius: '1.25rem',
        overflow: 'hidden',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column' as const,
    },
    // Flex wrapper ensures header/footer stay pinned while body scrolls
    innerWrapper: {
        display: 'flex',
        flexDirection: 'column' as const,
        flex: 1,
        minHeight: 0, // Critical: allows flex children to shrink below content size
    },
    header: {
        padding: '1.5rem 2rem',
        borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
        flexShrink: 0,
    },
    body: {
        padding: '2rem',
        flex: 1,
        overflowY: 'auto' as const,
        minHeight: 0, // Critical: allows this flex child to scroll rather than expand
    },
    footer: {
        padding: '1.25rem 2rem',
        borderTop: '1px solid rgba(139, 92, 246, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        background: 'rgba(255, 255, 255, 0.95)',
    },
};

const stepIndicatorStyles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        marginTop: '1rem',
    },
    step: (isActive: boolean, isCompleted: boolean) => ({
        width: isActive ? '2rem' : '0.5rem',
        height: '0.5rem',
        borderRadius: '9999px',
        background: isCompleted
            ? 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)'
            : isActive
                ? 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)'
                : 'rgba(139, 92, 246, 0.2)',
        transition: 'all 0.3s ease',
    }),
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const TestCreationModal: React.FC<TestCreationModalProps> = ({
    opened,
    onClose,
    onComplete,
    initialStep = 'type',
    initialData,
    initialWritingDraftId,
    onAction,
}) => {
    const navigate = useNavigate();
    // ─── Auth ────────────────────────────────────────────────────
    const { user } = useAuth();

    // ─── State ───────────────────────────────────────────────────
    const [currentStep, setCurrentStep] = useState<ModalStep>(initialStep);
    const [stepData, setStepData] = useState<ModalStepData>({
        ...INITIAL_MODAL_DATA,
        ...initialData,
    });
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Parsing state
    const [parsingStage, setParsingStage] = useState<ParsingStage>('converting');
    const [parsingProgress, setParsingProgress] = useState(0);
    const [parsingMessage, setParsingMessage] = useState<string | undefined>();
    const [parsingError, setParsingError] = useState<string | undefined>();
    const [draftId, setDraftId] = useState<string | null>(null);
    const [isThcsFlow, setIsThcsFlow] = useState(false);
    const [thcsHasUnsavedChanges, setThcsHasUnsavedChanges] = useState(false);
    const [thcsStep, setThcsStep] = useState(0);
    const [thcsWideLayout, setThcsWideLayout] = useState(false);
    const [thcsStepConfigs, setThcsStepConfigs] = useState<WizardStep[]>(DEFAULT_THCS_STEP_CONFIGS);
    const [readingV2ImportSource, setReadingV2ImportSource] = useState('');
    const [readingV2ImportError, setReadingV2ImportError] = useState<string | null>(null);
    const [readingV2PromptCopied, setReadingV2PromptCopied] = useState(false);
    const [readingV2PromptFallbackVisible, setReadingV2PromptFallbackVisible] = useState(false);
    const [readingV2AutoSource, setReadingV2AutoSource] = useState('');
    const [readingV2AutoError, setReadingV2AutoError] = useState<string | null>(null);
    const [readingV2AutoDiagnostics, setReadingV2AutoDiagnostics] = useState<readonly ReadingV2AutoImportDiagnostic[]>([]);
    const [readingV2AutoProcessing, setReadingV2AutoProcessing] = useState(false);
    const readingV2AutoRequestIdRef = useRef(0);
    const { writeText: writeClipboardText } = useClipboard();

    // ─── Writing-specific State ───────────────────────────────────
    const [writingMeta, setWritingMeta] = useState<WritingMetadataFields>({
        title: '',
        duration: 60,
    });
    const [writingFormat, setWritingFormat] = useState<WritingFormat | undefined>(undefined);
    const [writingTask1, setWritingTask1] = useState<WritingTaskFields>({ ...DEFAULT_WRITING_TASK1 });
    const [writingTask2, setWritingTask2] = useState<WritingTaskFields>({ ...DEFAULT_WRITING_TASK2 });
    const [writingPublishing, setWritingPublishing] = useState(false);
    const [writingSaving, setWritingSaving] = useState(false);
    const [writingDraftId, setWritingDraftId] = useState<string | undefined>(undefined);

    // ─── Derived State ───────────────────────────────────────────
    const isWritingFlow = stepData.skillType === 'writing';
    const isReadingV2Flow = stepData.skillType === 'reading-v2';
    const activeStepOrder = isWritingFlow ? WRITING_STEP_ORDER : isReadingV2Flow ? READING_V2_STEP_ORDER : MODAL_STEP_ORDER;
    const activeStepConfigs = isWritingFlow ? WRITING_STEP_CONFIGS : isReadingV2Flow ? READING_V2_STEP_CONFIGS : STEP_CONFIGS;
    const currentStepIndex = activeStepOrder.indexOf(currentStep);
    const totalSteps = activeStepOrder.length;
    const currentStepConfig = activeStepConfigs.find(s => s.id === currentStep);
    const isParsing = currentStep === 'parsing';

    // ─── Validation Logic ────────────────────────────────────────
    const canProceed = useCallback((): boolean => {
        switch (currentStep) {
            case 'type':
                return stepData.testType !== null;
            case 'skill':
                return stepData.skillType !== null;
            case 'metadata':
                return (stepData.metadata?.title?.trim().length ?? 0) > 0;
            case 'upload':
                return stepData.sourceContent !== null || stepData.sourceFile !== null;
            case 'parsing':
                return false;
            // Writing-specific steps
            case 'writing-metadata':
                return writingMeta.title.trim().length > 0 && writingMeta.duration > 0;
            case 'writing-format':
                return writingFormat !== undefined;
            case 'writing-content': {
                // At least one active task must have prompt text
                if (writingFormat === 'task1-only') return writingTask1.promptText.trim().length > 0;
                if (writingFormat === 'task2-only') return writingTask2.promptText.trim().length > 0;
                return writingTask1.promptText.trim().length > 0 && writingTask2.promptText.trim().length > 0;
            }
            default:
                return false;
        }
    }, [currentStep, stepData, writingMeta, writingFormat, writingTask1, writingTask2]);

    // ─── Navigation Handlers ─────────────────────────────────────
    const handleBack = useCallback(() => {
        if (currentStep === 'reading-v2-auto') {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep('reading-v2-start');
                setIsAnimating(false);
            }, 150);
            return;
        }

        const prevIndex = currentStepIndex - 1;
        const prevStep = activeStepOrder[prevIndex];
        if (prevIndex >= 0 && prevStep) {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep(prevStep);
                setIsAnimating(false);
            }, 150);
        }
    }, [currentStep, currentStepIndex, activeStepOrder]);

    const handleNext = useCallback(() => {
        const nextIndex = currentStepIndex + 1;
        const nextStep = activeStepOrder[nextIndex];
        if (canProceed() && nextIndex < totalSteps && nextStep) {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep(nextStep);
                setIsAnimating(false);
            }, 150);
        }
    }, [canProceed, currentStepIndex, totalSteps, activeStepOrder]);

    // ─── Step Data Handlers ──────────────────────────────────────
    const updateStepData = useCallback((updates: Partial<ModalStepData>) => {
        setStepData(prev => ({ ...prev, ...updates }));
        setHasUnsavedChanges(true);
    }, []);

    const handleTypeSelect = useCallback((testType: TestType) => {
        if (testType === 'THCS-THPT') {
            updateStepData({ testType });
            setIsThcsFlow(true);
            setThcsHasUnsavedChanges(false);
            return;
        }
        updateStepData({ testType });
        // Auto-advance to skill step after selection
        setTimeout(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep('skill');
                setIsAnimating(false);
            }, 150);
        }, 100);
    }, [updateStepData]);

    const handleSkillSelect = useCallback((skillType: SkillType) => {
        if (skillType === 'reading-v2') {
            const nextMetadata = stepData.testType
                ? {
                    ...stepData.metadata,
                    title: stepData.metadata?.title || generateDefaultTitle(stepData.testType, skillType),
                }
                : stepData.metadata;
            updateStepData({ skillType, metadata: nextMetadata });
            onAction?.('selectReadingV2Skill', { testType: stepData.testType });
            setTimeout(() => {
                setIsAnimating(true);
                setTimeout(() => {
                    setCurrentStep('metadata');
                    setIsAnimating(false);
                }, 150);
            }, 100);
            return;
        }

        updateStepData({ skillType });

        // PRD-0020 / PRD-0022 bug fix: Redirect to dedicated Listening builder immediately
        if (skillType === 'listening') {
            onClose();
            navigate(`/create-test?type=${stepData.testType}&skill=Listening`, {
                state: { metadata: { type: stepData.testType } }
            });
            return;
        }

        // Writing stays in the modal and advances into the writing-specific steps.
        if (skillType === 'writing') {
            const now = new Date();
            const month = now.toLocaleString('en-US', { month: 'long' });
            setWritingMeta(prev => ({
                ...prev,
                title: prev.title || `IELTS Writing Test - ${month} ${now.getFullYear()}`,
            }));
            setTimeout(() => {
                setIsAnimating(true);
                setTimeout(() => {
                    setCurrentStep('writing-metadata');
                    setIsAnimating(false);
                }, 150);
            }, 100);
            return;
        }

        // Auto-advance to metadata step after selection for other skills.
        // Pre-populate the default title so canProceed() is true immediately,
        // avoiding a race with MetadataStep's internal useEffect.
        if (stepData.testType) {
            const defaultTitle = generateDefaultTitle(stepData.testType, skillType);
            updateStepData({ metadata: { title: defaultTitle } });
        }

        setTimeout(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep('metadata');
                setIsAnimating(false);
            }, 150);
        }, 100);
    }, [updateStepData, onAction, onClose, navigate, stepData.metadata, stepData.testType]);

    const createReadingV2InitialMetadata = useCallback(() => {
        const metadata = stepData.metadata || {};

        return {
            title: metadata.title || '',
            durationMinutes: metadata.duration || DEFAULT_DRAFT_METADATA.duration,
            difficulty: metadata.difficulty?.toLowerCase(),
            targetBand: metadata.targetBand ? `Band ${metadata.targetBand}` : undefined,
            description: metadata.description || '',
            tags: metadata.tags || [],
            ownerId: user?.uid,
            provenanceSummary: 'Started from Test Creation Modal metadata step',
        };
    }, [stepData.metadata, user?.uid]);

    const handleReadingV2Start = useCallback((mode: 'create-blank' | 'create-from-import' | 'create-from-auto') => {
        const initialMetadata = createReadingV2InitialMetadata();

        if (mode === 'create-from-import') {
            onAction?.('startReadingV2Import', {
                source: 'test_creation_modal',
                testType: stepData.testType,
                titleLength: initialMetadata.title.length,
                durationMinutes: initialMetadata.durationMinutes,
            });
            setReadingV2ImportError(null);
            setReadingV2PromptFallbackVisible(false);
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep('reading-v2-import');
                setIsAnimating(false);
            }, 150);
            return;
        }

        if (mode === 'create-from-auto') {
            onAction?.('startReadingV2AutoImport', {
                source: 'test_creation_modal',
                testType: stepData.testType,
                titleLength: initialMetadata.title.length,
                durationMinutes: initialMetadata.durationMinutes,
            });
            setReadingV2AutoError(null);
            setReadingV2AutoDiagnostics([]);
            setReadingV2AutoProcessing(false);
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep('reading-v2-auto');
                setIsAnimating(false);
            }, 150);
            return;
        }

        onAction?.('startReadingV2Blank', {
            source: 'test_creation_modal',
            testType: stepData.testType,
            titleLength: initialMetadata.title.length,
            durationMinutes: initialMetadata.durationMinutes,
        });
        onClose();
        navigate(buildRoute('TEACHER_READING_V2_CREATE'), {
            state: {
                entryPoint: 'test-creation-modal',
                testType: stepData.testType,
                skill: 'Reading V2',
                startMode: mode,
                initialMetadata,
            },
        });
    }, [createReadingV2InitialMetadata, navigate, onAction, onClose, stepData.testType]);

    const handleCopyReadingV2ImportPrompt = useCallback(async () => {
        const copied = await writeClipboardText(READING_V2_EXTERNAL_AI_PROMPT);

        if (copied) {
            setReadingV2PromptCopied(true);
            setReadingV2ImportError(null);
            setReadingV2PromptFallbackVisible(false);
            onAction?.('copyReadingV2ImportPrompt', {
                source: 'test_creation_modal',
                testType: stepData.testType,
                outcome: 'success',
            });
            setTimeout(() => setReadingV2PromptCopied(false), 2000);
            return;
        }

        setReadingV2PromptFallbackVisible(true);
        setReadingV2ImportError('Copy failed. Select and copy the prompt shown below.');
        onAction?.('copyReadingV2ImportPrompt', {
            source: 'test_creation_modal',
            testType: stepData.testType,
            outcome: 'failure',
        });
    }, [onAction, stepData.testType, writeClipboardText]);

    const handleClearReadingV2ImportSetup = useCallback(() => {
        setReadingV2ImportSource('');
        setReadingV2ImportError(null);
        setReadingV2PromptCopied(false);
        setReadingV2PromptFallbackVisible(false);
        setHasUnsavedChanges(false);
        onAction?.('clearReadingV2ImportSetup', {
            source: 'test_creation_modal',
            testType: stepData.testType,
        });
    }, [onAction, stepData.testType]);

    const handleClearReadingV2AutoImportSetup = useCallback(() => {
        setReadingV2AutoSource('');
        setReadingV2AutoError(null);
        setReadingV2AutoDiagnostics([]);
        setHasUnsavedChanges(false);
        onAction?.('clearReadingV2AutoImportSetup', {
            source: 'test_creation_modal',
            testType: stepData.testType,
        });
    }, [onAction, stepData.testType]);

    const handleReadingV2ImportParse = useCallback(() => {
        const sourceText = readingV2ImportSource.trim();

        if (!sourceText) {
            setReadingV2ImportError('Paste passages and questions before opening Studio review.');
            return;
        }

        const initialMetadata = createReadingV2InitialMetadata();
        const initialImportCandidate = createReadingV2ImportCandidateFromText({
            text: sourceText,
            sourceKind: 'pasted-text',
        });

        onAction?.('parseReadingV2ImportSetup', {
            source: 'test_creation_modal',
            testType: stepData.testType,
            titleLength: initialMetadata.title.length,
            sourceLength: sourceText.length,
        });
        onClose();
        navigate(buildRoute('TEACHER_READING_V2_IMPORT'), {
            state: {
                entryPoint: 'test-creation-modal',
                testType: stepData.testType,
                skill: 'Reading V2',
                startMode: 'create-from-import',
                initialMetadata,
                initialImportCandidate,
            },
        });
    }, [
        createReadingV2InitialMetadata,
        navigate,
        onAction,
        onClose,
        readingV2ImportSource,
        stepData.testType,
    ]);

    const handleReadingV2AutoImportParse = useCallback(async () => {
        const sourceText = readingV2AutoSource.trim();

        if (!sourceText) {
            setReadingV2AutoError('Paste raw Reading test text before using Auto.');
            setReadingV2AutoDiagnostics([]);
            logReadingV2AutoImportDiag('blocked_empty_input', {
                source: 'test_creation_modal',
                testType: stepData.testType,
            });
            return;
        }

        const initialMetadata = createReadingV2InitialMetadata();
        const requestId = readingV2AutoRequestIdRef.current + 1;
        readingV2AutoRequestIdRef.current = requestId;
        setReadingV2AutoProcessing(true);
        setReadingV2AutoError(null);
        setReadingV2AutoDiagnostics([]);
        logReadingV2AutoImportDiag('submit_requested', {
            requestId,
            source: 'test_creation_modal',
            testType: stepData.testType,
            titleLength: initialMetadata.title.length,
            sourceLength: sourceText.length,
            provider: 'auto-v3',
        });
        onAction?.('submitReadingV2AutoImport', {
            source: 'test_creation_modal',
            testType: stepData.testType,
            titleLength: initialMetadata.title.length,
            sourceLength: sourceText.length,
            provider: 'auto-v3',
        });

        try {
            const result = await generateReadingV2AutoImportCandidate({
                rawTestText: sourceText,
                sourceName: initialMetadata.title || 'Auto V3 import',
            });

            if (readingV2AutoRequestIdRef.current !== requestId) {
                logReadingV2AutoImportDiag('stale_result_ignored', {
                    requestId,
                    activeRequestId: readingV2AutoRequestIdRef.current,
                });
                return;
            }

            const safeDiagnostics = sanitizeReadingV2AutoDiagnostics(result.diagnostics);
            setReadingV2AutoProcessing(false);
            setReadingV2AutoDiagnostics(safeDiagnostics);
            const safeResultError = result.success
                ? null
                : sanitizeReadingV2AutoDiagString(result.error ?? 'Auto V3 import failed');
            logReadingV2AutoImportDiag('submit_result', {
                requestId,
                success: result.success,
                provider: result.provider,
                model: result.model,
                diagnosticCount: safeDiagnostics.length,
                error: safeResultError,
                passageCount: result.success ? result.passageCount : undefined,
                questionCount: result.success ? result.questionCount : undefined,
            });

            if (!result.success) {
                setReadingV2AutoError(safeResultError);
                logReadingV2AutoImportDiag('submit_failed', {
                    requestId,
                    error: safeResultError,
                    diagnosticCount: safeDiagnostics.length,
                    diagnosticCodes: safeDiagnostics.map((diagnostic) => diagnostic.code),
                });
                onAction?.('failReadingV2AutoImport', {
                    source: 'test_creation_modal',
                    testType: stepData.testType,
                    provider: result.provider,
                    error: safeResultError,
                    diagnosticCount: safeDiagnostics.length,
                });
                return;
            }

            onAction?.('completeReadingV2AutoImport', {
                source: 'test_creation_modal',
                testType: stepData.testType,
                provider: result.provider,
                model: result.model,
                passageCount: result.passageCount,
                questionCount: result.questionCount,
                diagnosticCount: safeDiagnostics.length,
                answerKeyDetected: Boolean(result.answerKeyText),
            });
            logReadingV2AutoImportDiag('submit_completed', {
                requestId,
                passageCount: result.passageCount,
                questionCount: result.questionCount,
                diagnosticCount: safeDiagnostics.length,
                answerKeyDetected: Boolean(result.answerKeyText),
            });
            onClose();
            navigate(buildRoute('TEACHER_READING_V2_IMPORT'), {
                state: {
                    entryPoint: 'test-creation-modal',
                    testType: stepData.testType,
                    skill: 'Reading V2',
                    startMode: 'create-from-auto',
                    initialMetadata: {
                        ...initialMetadata,
                        provenanceSummary: 'Generated from Auto V3 import in Test Creation Modal',
                    },
                    initialImportCandidate: result.candidate,
                },
            });
        } catch (error) {
            if (readingV2AutoRequestIdRef.current !== requestId) {
                logReadingV2AutoImportDiag('stale_exception_ignored', {
                    requestId,
                    activeRequestId: readingV2AutoRequestIdRef.current,
                });
                return;
            }

            const message = error instanceof Error
                ? sanitizeReadingV2AutoDiagString(error.message)
                : 'Auto V3 import failed.';
            setReadingV2AutoProcessing(false);
            setReadingV2AutoError(message);
            setReadingV2AutoDiagnostics([]);
            logReadingV2AutoImportDiag('submit_exception', {
                requestId,
                error: message,
            });
            onAction?.('failReadingV2AutoImport', {
                source: 'test_creation_modal',
                testType: stepData.testType,
                provider: 'auto-v3',
                error: message,
            });
        }
    }, [
        createReadingV2InitialMetadata,
        navigate,
        onAction,
        onClose,
        readingV2AutoSource,
        stepData.testType,
    ]);

    // ─── Close Handlers ──────────────────────────────────────────
    const handleCloseRequest = useCallback(() => {
        if (isThcsFlow) {
            if (thcsHasUnsavedChanges) {
                setShowCloseConfirmation(true);
            } else {
                onClose();
            }
            return;
        }

        if (isParsing) {
            // During parsing, show confirmation before closing
            setShowCloseConfirmation(true);
            return;
        }

        if (readingV2AutoProcessing) {
            setShowCloseConfirmation(true);
        } else if (hasUnsavedChanges && currentStepIndex > 0) {
            setShowCloseConfirmation(true);
        } else {
            onClose();
        }
    }, [currentStepIndex, hasUnsavedChanges, isParsing, isThcsFlow, onClose, readingV2AutoProcessing, thcsHasUnsavedChanges]);

    const handleConfirmClose = useCallback(() => {
        setShowCloseConfirmation(false);
        // Reset state
        setCurrentStep('type');
        setStepData({ ...INITIAL_MODAL_DATA });
        setHasUnsavedChanges(false);
        setIsThcsFlow(false);
        setThcsHasUnsavedChanges(false);
        setThcsStep(0);
        setThcsWideLayout(false);
        setThcsStepConfigs(DEFAULT_THCS_STEP_CONFIGS);
        setReadingV2ImportSource('');
        setReadingV2ImportError(null);
        setReadingV2PromptCopied(false);
        setReadingV2PromptFallbackVisible(false);
        setReadingV2AutoSource('');
        setReadingV2AutoError(null);
        setReadingV2AutoDiagnostics([]);
        setReadingV2AutoProcessing(false);
        readingV2AutoRequestIdRef.current += 1;
        onClose();
    }, [onClose]);

    const handleThcsFlowPublished = useCallback(() => {
        setCurrentStep('type');
        setStepData({ ...INITIAL_MODAL_DATA });
        setHasUnsavedChanges(false);
        setIsThcsFlow(false);
        setThcsHasUnsavedChanges(false);
        setThcsStep(0);
        setThcsWideLayout(false);
        setThcsStepConfigs(DEFAULT_THCS_STEP_CONFIGS);
        setReadingV2ImportSource('');
        setReadingV2ImportError(null);
        setReadingV2PromptCopied(false);
        setReadingV2PromptFallbackVisible(false);
        setReadingV2AutoSource('');
        setReadingV2AutoError(null);
        setReadingV2AutoDiagnostics([]);
        setReadingV2AutoProcessing(false);
        readingV2AutoRequestIdRef.current += 1;
        onClose();
    }, [onClose]);

    // ─── Parsing Completion Handler ──────────────────────────────
    const handleParsingComplete = useCallback((draftId: string) => {
        onComplete(draftId);
    }, [onComplete]);

    // ─── Keyboard Handlers ───────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!opened) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                handleCloseRequest();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [opened, handleCloseRequest]);

    // ─── Reset on modal open ─────────────────────────────────────
    useEffect(() => {
        if (opened) {
            const initialWritingMetadata = initialData?.writingMetadata;
            const initialWritingFormat = initialData?.writingFormat;
            const initialWritingTasks = initialData?.writingTasks;
            setCurrentStep(initialStep);
            setStepData({ ...INITIAL_MODAL_DATA, ...initialData });
            setHasUnsavedChanges(false);
            setShowCloseConfirmation(false);
            setIsThcsFlow(false);
            setThcsHasUnsavedChanges(false);
            setThcsStep(0);
            setThcsWideLayout(false);
            setReadingV2ImportSource('');
            setReadingV2ImportError(null);
            setReadingV2PromptCopied(false);
            setReadingV2PromptFallbackVisible(false);
            // Reset parsing state
            setParsingStage('converting');
            setParsingProgress(0);
            setParsingMessage(undefined);
            setParsingError(undefined);
            setDraftId(null);
            // Reset writing state
            setWritingMeta({
                title: initialWritingMetadata?.title || '',
                description: initialWritingMetadata?.description,
                duration: initialWritingMetadata?.duration || 60,
                difficulty: initialWritingMetadata?.difficulty,
                targetBand: initialWritingMetadata?.targetBand,
                tags: initialWritingMetadata?.tags,
            });
            setWritingFormat(initialWritingFormat);
            setWritingTask1({
                ...DEFAULT_WRITING_TASK1,
                ...(initialWritingTasks?.task1 || {}),
            });
            setWritingTask2({
                ...DEFAULT_WRITING_TASK2,
                ...(initialWritingTasks?.task2 || {}),
            });
            setWritingPublishing(false);
            setWritingSaving(false);
            setWritingDraftId(initialWritingDraftId);
            // Note: parsingAbortRef and isParsingRef are reset in startRealParsing
        }
    }, [opened, initialStep, initialData, initialWritingDraftId]);

    // ─── Real Parsing Flow ──────────────────────────────────────────
    // Ref to track parsing abort
    const parsingAbortRef = useRef(false);
    // Ref to prevent re-entry (critical: prevents infinite loop)
    const isParsingRef = useRef(false);

    const startRealParsing = useCallback(async () => {
        if (!user?.uid) {
            setParsingStage('error');
            setParsingError('You must be logged in to create a test.');
            return;
        }

        // Validate required step data
        if (!stepData.testType || !stepData.skillType) {
            setParsingStage('error');
            setParsingError('Missing test type or skill selection.');
            return;
        }

        // CRITICAL: Prevent re-entry (this prevents infinite loop)
        if (isParsingRef.current) {
            console.log('⚠️ Parsing already in progress, skipping duplicate call');
            return;
        }
        isParsingRef.current = true;

        parsingAbortRef.current = false;

        try {
            // ── Step 1: Create real draft in Firebase ──────────────────
            setParsingStage('converting');
            setParsingProgress(5);
            setParsingMessage('Creating draft...');

            const metadata: DraftMetadata = {
                title: stepData.metadata?.title || `${stepData.testType} ${stepData.skillType} Test`,
                duration: stepData.metadata?.duration || DEFAULT_DRAFT_METADATA.duration,
                targetBand: stepData.metadata?.targetBand as DraftMetadata['targetBand'],
                cefrLevel: stepData.metadata?.cefrLevel as DraftMetadata['cefrLevel'],
                difficulty: stepData.metadata?.difficulty as DraftMetadata['difficulty'],
                description: stepData.metadata?.description,
            };

            const createResult = await testDraftService.createDraft(
                user.uid,
                stepData.testType,
                stepData.skillType,
                stepData.format,
                metadata
            );

            if (!createResult.success || !createResult.data) {
                throw new Error(createResult.error || 'Failed to create draft');
            }

            const createdDraftId = createResult.data.draftId;
            setDraftId(createdDraftId);
            console.log('📝 Draft created:', createdDraftId);

            if (parsingAbortRef.current) return;

            // ── Step 2: Update draft status to 'parsing' ──────────────
            await testDraftService.updateDraftStatus(createdDraftId, 'parsing');

            // ── Step 3: Run real AI parsing ─────────────────────────────
            const parseOptions = {
                userId: user.uid,
                enableCheckpoints: true,
                onProgress: (stage: string, progress: number, message: string) => {
                    if (parsingAbortRef.current) return;
                    // Map ParseStage string to our ParsingStage type
                    const stageMap: Record<string, ParsingStage> = {
                        'converting': 'converting',
                        'extracting': 'extracting',
                        'classifying': 'classifying',
                        'validating': 'validating',
                        'complete': 'complete',
                        'error': 'error',
                    };
                    const mappedStage = stageMap[stage] || 'extracting';
                    setParsingStage(mappedStage);
                    setParsingProgress(progress);
                    setParsingMessage(message);
                },
            };

            let parseResult;

            if (stepData.sourceFile) {
                // File upload path
                parseResult = await testCreationService.parseDocument(stepData.sourceFile, parseOptions);
            } else if (stepData.sourceContent) {
                // Text paste path
                parseResult = await testCreationService.parseText(stepData.sourceContent, parseOptions);
            } else {
                throw new Error('No source content or file provided');
            }

            if (parsingAbortRef.current) return;

            if (!parseResult.success) {
                throw new Error(parseResult.error || 'Parsing failed');
            }

            // ── Step 4: Save parsed content to draft ────────────────────
            setParsingMessage('Saving parsed content...');
            const validation = parseResult.validationResult;
            const reviewDraft = parseResult.parseJob?.artifacts.reviewDraft?.data;

            // Use actual extracted passages (with full content) from AI/offline parsing
            // These contain the actual reading passage text needed for student view
            const extractedPassages = reviewDraft?.passages?.length ? reviewDraft.passages : (parseResult.passages || []);
            const passages = extractedPassages.length > 0
                ? extractedPassages.map((p, i) => ({
                    id: p.id || `passage-${i + 1}`,
                    title: p.title || `Passage ${i + 1}`,
                    content: p.content || '',
                    type: 'text' as const,
                    wordCount: p.wordCount || 0,
                    questionStart: p.questionRange?.start || (p as any).questionStart || 1,
                    questionEnd: p.questionRange?.end || (p as any).questionEnd || 1,
                    createdAt: new Date().toISOString(),
                }))
                : // Fallback: create minimal passage entries from question passageIds
                (validation?.mergedQuestions
                    ? [...new Set(validation.mergedQuestions.map(q => q.passageId).filter(Boolean))].map((pId, i) => ({
                        id: pId || `passage-${i + 1}`,
                        title: `Passage ${i + 1}`,
                        content: parseResult.documentText || '', // Use full document text as fallback
                        type: 'text' as const,
                        wordCount: 0,
                        questionStart: 1,
                        questionEnd: 1,
                        createdAt: new Date().toISOString(),
                    }))
                    : []);

            const draftQuestions = reviewDraft?.questions?.length ? reviewDraft.questions : validation?.mergedQuestions;
            const questions = draftQuestions?.map(q => {
                const canonicalQuestion = canonicalizeReadingQuestion({
                    questionNumber: q.questionNumber,
                    type: q.type,
                    questionText: q.questionText || '',
                    options: q.labeledOptions || q.options || [],
                    labeledOptions: q.labeledOptions,
                    optionLabelFormat: (q as any).optionLabelFormat,
                    sectionReferences: (q as any).sectionReferences,
                });

                if (canonicalQuestion.issues.length > 0) {
                    throw new Error(canonicalQuestion.issues[0]!.message);
                }

                return {
                    id: `q-${q.questionNumber}`,
                    number: q.questionNumber,
                    questionNumber: q.questionNumber,
                    questionText: canonicalQuestion.questionText,
                    question: canonicalQuestion.question,
                    type: q.type,
                    options: canonicalQuestion.options || [],
                    labeledOptions: canonicalQuestion.labeledOptions,
                    optionLabelFormat: canonicalQuestion.optionLabelFormat,
                    sectionReferences: canonicalQuestion.sectionReferences,
                    answer: q.answer || '',
                    answerSource: 'ai-suggestion' as const,
                    passageId: q.passageId || passages[0]?.id || 'default',
                    confidence: q.confidence || 80,
                    points: 1,
                    wordLimit: typeof q.wordLimit === 'number' ? q.wordLimit : q.wordLimit?.max,
                    acceptableAnswers: (q as any).acceptableAnswers,
                    includesNumber: (q as any).includesNumber,
                    sectionInstructionId: (q as any).sectionInstructionId,
                    groupId: (q as any).groupId,
                    blankId: (q as any).blankId,
                    anchorId: (q as any).anchorId,
                    groupTaskType: (q as any).groupTaskType,
                    tableGroupSchemaVersion: (q as any).tableGroupSchemaVersion,
                    pendingTableReclassification: (q as any).pendingTableReclassification,
                };
            }) || [];

            const sectionInstructions: Record<string, string> = reviewDraft?.sectionInstructions || {};
            const questionGroups = reviewDraft?.questionGroups || validation?.questionGroups || [];
            const groupAcknowledgements = (reviewDraft as any)?.groupAcknowledgements || {};
            const tableCompletionDiagnostics =
                reviewDraft?.tableCompletionDiagnostics || validation?.tableCompletionDiagnostics || [];

            const saveParsedContentResult = await testDraftService.saveParsedContent(
                createdDraftId,
                passages,
                questions,
                sectionInstructions,
                Array.isArray(questionGroups) ? questionGroups : [],
                groupAcknowledgements,
                Array.isArray(tableCompletionDiagnostics) ? tableCompletionDiagnostics : [],
            );

            if (!saveParsedContentResult.success) {
                throw new Error(saveParsedContentResult.error || 'Failed to save parsed content');
            }

            const tableQuestionGroups = Array.isArray(questionGroups)
                ? questionGroups.filter((group: any) => group?.taskType === 'table-completion')
                : [];

            logTablePresentationDiag('draft_saved', {
                draftId: createdDraftId,
                passageCount: passages.length,
                questionCount: questions.length,
                questionGroupCount: Array.isArray(questionGroups) ? questionGroups.length : 0,
                tableGroupCount: tableQuestionGroups.length,
                diagnosticCount: Array.isArray(tableCompletionDiagnostics) ? tableCompletionDiagnostics.length : 0,
                sectionInstructionIds: Object.keys(sectionInstructions),
                tableGroups: tableQuestionGroups.map((group: any) => ({
                    groupId: group.groupId,
                    passageId: group.passageId,
                    questionRange: group.questionRange,
                    blankCount: Array.isArray(group.blanks) ? group.blanks.length : 0,
                    rowCount: Array.isArray(group.rows) ? group.rows.length : 0,
                    columnCount: Array.isArray(group.columns) ? group.columns.length : 0,
                    caption: group.sharedContent?.caption || null,
                })),
            });

            // ── Step 5: Complete! ────────────────────────────────────────
            setParsingStage('complete');
            setParsingProgress(100);
            setParsingMessage('Parsing complete! Ready for review.');
            console.log('✅ Parsing complete, draft ready:', createdDraftId);

        } catch (error) {
            if (parsingAbortRef.current) return;
            console.error('❌ Parsing failed:', error);
            setParsingStage('error');
            setParsingError(error instanceof Error ? error.message : 'An unexpected error occurred');
        } finally {
            // Always reset parsing lock
            isParsingRef.current = false;
        }
    }, [user, stepData]);

    // ─── Trigger Parsing when step changes to 'parsing' ───────────
    // Store startRealParsing in a ref to avoid dependency issues
    const startRealParsingRef = useRef(startRealParsing);
    startRealParsingRef.current = startRealParsing;

    useEffect(() => {
        // Only trigger once when entering parsing step with initial state
        if (currentStep === 'parsing' && parsingStage === 'converting' && parsingProgress === 0 && !isParsingRef.current) {
            startRealParsingRef.current();
        }
    }, [currentStep, parsingStage, parsingProgress]); // DO NOT include startRealParsing - causes infinite loop!

    // ═══════════════════════════════════════════════════════════════
    // RENDER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    const renderStepIndicator = () => (
        <div style={stepIndicatorStyles.container}>
            {activeStepConfigs.map((step, index) => (
                <div
                    key={step.id}
                    style={stepIndicatorStyles.step(
                        index === currentStepIndex,
                        index < currentStepIndex
                    )}
                    title={`Step ${index + 1}: ${step.label}`}
                />
            ))}
        </div>
    );

    const THCS_STEP_LABELS = thcsStepConfigs.map((step) => step.label);
    const THCS_STEP_ICONS = ['📋', '✏️', '🔑', '✅'];

    const renderHeader = () => (
        <div style={modalStyles.header as React.CSSProperties}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>
                            {isThcsFlow ? (THCS_STEP_ICONS[thcsStep] ?? '📋') : currentStepConfig?.icon}
                        </span>
                        <div>
                            <Text size="xl" fw={700} style={{ color: '#1e293b' }}>
                                {isThcsFlow ? 'THCS-THPT Test' : currentStepConfig?.label}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {isThcsFlow
                                    ? `${THCS_STEP_LABELS[thcsStep] ?? 'Test Setup'} · Step ${thcsStep + 1} of 4`
                                    : `${currentStepConfig?.description} • Step ${currentStepIndex + 1} of ${totalSteps}`}
                            </Text>
                        </div>
                    </div>
                    {isThcsFlow ? (
                        <div style={stepIndicatorStyles.container}>
                            {THCS_STEP_LABELS.map((label, idx) => (
                                <div
                                    key={idx}
                                    style={stepIndicatorStyles.step(idx === thcsStep, idx < thcsStep)}
                                    title={`Step ${idx + 1}: ${label}`}
                                />
                            ))}
                        </div>
                    ) : renderStepIndicator()}
                </div>

                {/* Close Button */}
                <button
                    onClick={handleCloseRequest}
                    aria-label="Close modal"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
        </div>
    );

    const renderStepContent = () => {
        if (isThcsFlow) {
            return (
                <THCSTestEditorSurface
                    presentation="embedded"
                    onExit={handleCloseRequest}
                    onPublished={handleThcsFlowPublished}
                    onDirtyChange={setThcsHasUnsavedChanges}
                    onStepChange={setThcsStep}
                    onWideLayoutChange={setThcsWideLayout}
                    onStepConfigChange={setThcsStepConfigs}
                />
            );
        }

        // Animation wrapper styles
        const contentStyle: React.CSSProperties = {
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? 'translateX(20px)' : 'translateX(0)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
        };

        switch (currentStep) {
            case 'type':
                return (
                    <div style={contentStyle}>
                        <TypeSelectionStep
                            selectedType={stepData.testType}
                            onSelect={handleTypeSelect}
                        />
                    </div>
                );
            case 'skill':
                return (
                    <div style={contentStyle}>
                        <SkillSelectionStep
                            testType={stepData.testType!}
                            selectedSkill={stepData.skillType}
                            onSelect={handleSkillSelect}
                        />
                    </div>
                );
            case 'metadata':
                return (
                    <div style={contentStyle}>
                        <MetadataStep
                            metadata={stepData.metadata}
                            format={stepData.format}
                            testType={stepData.testType}
                            skillType={stepData.skillType}
                            onUpdate={(metadata, format) => updateStepData({ metadata, format })}
                        />
                    </div>
                );
            case 'upload':
                return (
                    <div style={contentStyle}>
                        <TestUploadWizard
                            onChange={(content) => {
                                if (content.type === 'file') {
                                    updateStepData({
                                        inputMethod: 'upload',
                                        sourceFile: content.data as File | null,
                                        sourceContent: null,
                                        format: content.format,
                                    });
                                } else {
                                    updateStepData({
                                        inputMethod: 'paste',
                                        sourceContent: content.data as string | null,
                                        sourceFile: null,
                                        format: content.format,
                                    });
                                }
                            }}
                            defaultFormat={stepData.format}
                        />
                    </div>
                );
            case 'reading-v2-start':
                return (
                    <div style={contentStyle}>
                        <ReadingV2StartStep
                            metadata={stepData.metadata}
                            onStartBlank={() => handleReadingV2Start('create-blank')}
                            onStartImport={() => handleReadingV2Start('create-from-import')}
                            onStartAuto={() => handleReadingV2Start('create-from-auto')}
                        />
                    </div>
                );
            case 'reading-v2-import':
                return (
                    <div style={contentStyle}>
                        <ReadingV2ImportSetupStep
                            sourceText={readingV2ImportSource}
                            error={readingV2ImportError}
                            promptCopied={readingV2PromptCopied}
                            promptFallbackVisible={readingV2PromptFallbackVisible}
                            promptText={READING_V2_EXTERNAL_AI_PROMPT}
                            onSourceTextChange={(value) => {
                                setReadingV2ImportSource(value);
                                setReadingV2ImportError(null);
                                setHasUnsavedChanges(true);
                            }}
                            onCopyPrompt={handleCopyReadingV2ImportPrompt}
                            onClear={handleClearReadingV2ImportSetup}
                        />
                    </div>
                );
            case 'reading-v2-auto':
                return (
                    <div style={contentStyle}>
                        <ReadingV2AutoImportStep
                            sourceText={readingV2AutoSource}
                            error={readingV2AutoError}
                            diagnostics={readingV2AutoDiagnostics}
                            processing={readingV2AutoProcessing}
                            onSourceTextChange={(value) => {
                                setReadingV2AutoSource(value);
                                setReadingV2AutoError(null);
                                setReadingV2AutoDiagnostics([]);
                                setHasUnsavedChanges(true);
                            }}
                            onClear={handleClearReadingV2AutoImportSetup}
                        />
                    </div>
                );
            case 'parsing':
                return (
                    <div style={contentStyle}>
                        <ParsingProgressScreen
                            stage={parsingStage}
                            progress={parsingProgress}
                            message={parsingMessage}
                            error={parsingError}
                            hasCheckpoint={false}
                            onComplete={handleParsingComplete}
                            onCancel={() => {
                                parsingAbortRef.current = true;
                                setParsingStage('error');
                                setParsingError('Parsing cancelled by user');
                            }}
                            onRetry={() => {
                                setParsingStage('converting');
                                setParsingProgress(0);
                                setParsingError(undefined);
                                setDraftId(null);
                                // Re-trigger parsing with fresh start
                                startRealParsing();
                            }}
                            draftId={draftId || undefined}
                        />
                    </div>
                );
            // ─── Writing-specific steps ────────────────────────────
            case 'writing-metadata':
                return (
                    <div style={contentStyle}>
                        <WritingMetadataStep
                            metadata={writingMeta}
                            onChange={setWritingMeta}
                        />
                    </div>
                );
            case 'writing-format':
                return (
                    <div style={contentStyle}>
                        <WritingFormatStep
                            selectedFormat={writingFormat}
                            onSelect={setWritingFormat}
                        />
                    </div>
                );
            case 'writing-content':
                return (
                    <div style={contentStyle}>
                        <WritingContentStep
                            format={writingFormat || 'full-test'}
                            task1={writingTask1}
                            task2={writingTask2}
                            onTask1Change={setWritingTask1}
                            onTask2Change={setWritingTask2}
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    // ─── Writing Save / Publish ─────────────────────────────────
    const handleWritingSave = useCallback(async () => {
        const userId = user?.uid;
        if (!userId) return;
        setWritingSaving(true);
        try {
            const activeTasks: WritingTask[] = [];
            if (writingFormat !== 'task2-only') {
                const { _imageKey, ...t1 } = writingTask1;
                activeTasks.push({ ...t1, taskNumber: 1, taskType: t1.taskType as any } as WritingTask);
            }
            if (writingFormat !== 'task1-only') {
                const { _imageKey, ...t2 } = writingTask2;
                activeTasks.push({ ...t2, taskNumber: 2, taskType: t2.taskType as any } as WritingTask);
            }
            const meta: WritingTestMetadata = {
                title: writingMeta.title,
                description: writingMeta.description,
                duration: writingMeta.duration,
                format: writingFormat || 'full-test',
                difficulty: writingMeta.difficulty,
                targetBand: writingMeta.targetBand,
                tags: writingMeta.tags,
            };
            const result = await saveWritingDraft(userId, {
                id: writingDraftId,
                metadata: meta,
                tasks: activeTasks,
            });
            if (result.success && result.draftId) {
                setWritingDraftId(result.draftId);
            }
        } catch (err) {
            console.error('Writing save error:', err);
        } finally {
            setWritingSaving(false);
        }
    }, [user, writingMeta, writingFormat, writingTask1, writingTask2, writingDraftId]);

    const handleWritingPublish = useCallback(async () => {
        const userId = user?.uid;
        if (!userId) return;
        setWritingPublishing(true);
        try {
            const activeTasks: WritingTask[] = [];
            if (writingFormat !== 'task2-only') {
                const { _imageKey, ...t1 } = writingTask1;
                activeTasks.push({ ...t1, taskNumber: 1, taskType: t1.taskType as any } as WritingTask);
            }
            if (writingFormat !== 'task1-only') {
                const { _imageKey, ...t2 } = writingTask2;
                activeTasks.push({ ...t2, taskNumber: 2, taskType: t2.taskType as any } as WritingTask);
            }
            const meta: WritingTestMetadata = {
                title: writingMeta.title,
                description: writingMeta.description,
                duration: writingMeta.duration,
                format: writingFormat || 'full-test',
                difficulty: writingMeta.difficulty,
                targetBand: writingMeta.targetBand,
                tags: writingMeta.tags,
            };
            const result = await publishWritingTest({
                id: writingDraftId || '',
                userId,
                testType: 'IELTS',
                skill: 'Writing',
                metadata: meta,
                tasks: activeTasks,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            if (result.success) {
                if (result.draftId) {
                    setWritingDraftId(result.draftId);
                }
                onClose();
                // Reset all state
                setCurrentStep('type');
                setStepData({ ...INITIAL_MODAL_DATA });
                setWritingMeta({ title: '', duration: 60 });
                setWritingFormat(undefined);
                setWritingTask1({ ...DEFAULT_WRITING_TASK1 });
                setWritingTask2({ ...DEFAULT_WRITING_TASK2 });
                setWritingDraftId(undefined);
                navigate(buildRoute('LOBBY'));
            } else {
                alert('Failed to publish: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Writing publish error:', err);
            alert('An error occurred while publishing.');
        } finally {
            setWritingPublishing(false);
        }
    }, [user, writingMeta, writingFormat, writingTask1, writingTask2, writingDraftId, onClose, navigate]);

    const renderFooter = () => {
        if (isThcsFlow) {
            return null;
        }

        if (currentStep === 'parsing') {
            // During parsing, show only a cancel button
            return (
                <div style={modalStyles.footer as React.CSSProperties}>
                    <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                        Please wait while AI processes your content...
                    </Text>
                    <Button
                        variant="glass"
                        onClick={handleCloseRequest}
                    >
                        Cancel Parsing
                    </Button>
                </div>
            );
        }

        // Writing content step — special footer with Save Draft + Publish
        if (currentStep === 'reading-v2-import') {
            return (
                <div style={modalStyles.footer as React.CSSProperties}>
                    <div>
                        <Button
                            variant="glass"
                            onClick={handleBack}
                            style={{ marginRight: '0.5rem' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Back
                        </Button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Button variant="glass" onClick={handleCloseRequest}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleReadingV2ImportParse}
                            disabled={readingV2ImportSource.trim().length === 0}
                        >
                            Parse & Review in Studio
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '0.5rem' }}>
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </Button>
                    </div>
                </div>
            );
        }

        if (currentStep === 'reading-v2-auto') {
            return (
                <div style={modalStyles.footer as React.CSSProperties}>
                    <div>
                        <Button
                            variant="glass"
                            onClick={handleBack}
                            disabled={readingV2AutoProcessing}
                            style={{ marginRight: '0.5rem' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Back
                        </Button>
                    </div>
                    {readingV2AutoError ? (
                        <div
                            aria-label="Reading V2 Auto footer status"
                            aria-live="polite"
                            style={{
                                flex: '1 1 14rem',
                                minWidth: 0,
                                maxWidth: '28rem',
                                padding: '0.625rem 0.75rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #fca5a5',
                                background: '#fef2f2',
                                color: '#991b1b',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                lineHeight: 1.35,
                            }}
                        >
                            {readingV2AutoError}
                        </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Button variant="glass" onClick={handleCloseRequest} disabled={readingV2AutoProcessing}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleReadingV2AutoImportParse}
                            disabled={readingV2AutoProcessing || readingV2AutoSource.trim().length === 0}
                        >
                            {readingV2AutoProcessing ? 'Processing...' : 'Process with Auto V3'}
                            {!readingV2AutoProcessing ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '0.5rem' }}>
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            ) : null}
                        </Button>
                    </div>
                </div>
            );
        }

        if (currentStep === 'writing-content') {
            return (
                <div style={modalStyles.footer as React.CSSProperties}>
                    <div>
                        <Button
                            variant="glass"
                            onClick={handleBack}
                            style={{ marginRight: '0.5rem' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Back
                        </Button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        {writingSaving && (
                            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>Saving...</Text>
                        )}
                        <Button variant="glass" onClick={handleWritingSave} disabled={writingSaving}>
                            💾 Save Draft
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleWritingPublish}
                            disabled={writingPublishing || !canProceed()}
                        >
                            {writingPublishing ? 'Publishing...' : '🚀 Publish Test'}
                        </Button>
                    </div>
                </div>
            );
        }

        return (
            <div style={modalStyles.footer as React.CSSProperties}>
                <div>
                    {currentStepIndex > 0 && (
                        <Button
                            variant="glass"
                            onClick={handleBack}
                            style={{ marginRight: '0.5rem' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Back
                        </Button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Button variant="glass" onClick={handleCloseRequest}>
                        Cancel
                    </Button>

                    {/* Show Continue for metadata, upload, and writing steps */}
                    {(currentStep === 'metadata' || currentStep === 'upload'
                        || currentStep === 'writing-metadata' || currentStep === 'writing-format') && (
                            <Button
                                variant="primary"
                                onClick={handleNext}
                                disabled={!canProceed()}
                            >
                                {currentStep === 'upload' ? 'Start Parsing' : 'Continue'}
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '0.5rem' }}>
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </Button>
                        )}
                </div>
            </div>
        );
    };

    // ─── Close Confirmation Dialog ───────────────────────────────
    const renderCloseConfirmation = () => {
        if (!showCloseConfirmation) return null;

        return (
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1001,
                }}
                onClick={() => setShowCloseConfirmation(false)}
            >
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: 'white',
                        borderRadius: '1rem',
                        padding: '1.5rem',
                        maxWidth: '400px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    }}
                >
                    <Text size="lg" fw={600} style={{ marginBottom: '0.75rem' }}>
                        {isParsing ? 'Cancel Parsing?' : 'Discard Changes?'}
                    </Text>
                    <Text size="sm" c="dimmed" style={{ marginBottom: '1.5rem' }}>
                        {isParsing
                            ? 'Parsing is in progress. Are you sure you want to cancel?'
                            : 'You have unsaved changes. Are you sure you want to close?'}
                    </Text>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <Button
                            variant="glass"
                            onClick={() => setShowCloseConfirmation(false)}
                        >
                            Keep Working
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleConfirmClose}
                            style={{
                                background: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)',
                            }}
                        >
                            {isParsing ? 'Cancel Parsing' : 'Discard'}
                        </Button>
                    </div>
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ═══════════════════════════════════════════════════════════════

    return (
        <>
            <Modal
                opened={opened}
                onClose={handleCloseRequest}
                size={isThcsFlow ? '95vw' : 'lg'}
                title={null}
                withCloseButton={false}
                padding={0}
                closeOnClickOutside={!isParsing}
                closeOnEscape={false}
                styles={{
                    body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
                    content: {
                        ...(modalStyles.content as React.CSSProperties),
                        ...(isThcsFlow ? {
                            maxWidth: thcsWideLayout ? '95vw' : '620px',
                            transitionProperty: 'max-width',
                            transitionDuration: '220ms',
                            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                            willChange: 'max-width',
                        } : {}),
                    },
                }}
            >
                <div style={modalStyles.innerWrapper}>
                    {renderHeader()}
                    <div
                        ref={contentRef}
                        style={{
                            ...(modalStyles.body as React.CSSProperties),
                            padding: isThcsFlow ? 0 : (modalStyles.body as React.CSSProperties).padding,
                            overflowY: isThcsFlow && thcsWideLayout ? 'hidden' : 'auto',
                            display: isThcsFlow && thcsWideLayout ? 'flex' : (modalStyles.body as React.CSSProperties).display,
                            flexDirection: isThcsFlow && thcsWideLayout ? 'column' : (modalStyles.body as React.CSSProperties).flexDirection,
                        }}
                    >
                        {renderStepContent()}
                    </div>
                    {renderFooter()}
                </div>
            </Modal>

            {renderCloseConfirmation()}
        </>
    );
};

// ═══════════════════════════════════════════════════════════════
// STEP COMPONENTS (Placeholders - to be replaced with actual implementations)
// ═══════════════════════════════════════════════════════════════

// Type Selection Step (extracted from TestTypeSelectionModal)
interface TypeSelectionStepProps {
    selectedType: TestType | null;
    onSelect: (type: TestType) => void;
}

const TYPE_OPTIONS: { id: TestType; label: string; description: string; icon: string; available: boolean }[] = [
    { id: 'IELTS', label: 'IELTS', description: 'International English Language Testing System', icon: '🌍', available: true },
    { id: 'TOEIC', label: 'TOEIC', description: 'Test of English for International Communication', icon: '💼', available: false },
    { id: 'SAT', label: 'SAT', description: 'Scholastic Assessment Test', icon: '📚', available: false },
    { id: 'THCS-THPT', label: 'THCS-THPT', description: 'Vietnamese National High School Exam', icon: '🇻🇳', available: true },
    { id: 'Custom', label: 'Custom Test', description: 'Create a custom test with any question types', icon: '🎨', available: false },
];

const TypeSelectionStep: React.FC<TypeSelectionStepProps> = ({ selectedType, onSelect }) => {
    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            {TYPE_OPTIONS.map((type) => (
                <div
                    key={type.id}
                    onClick={() => type.available && onSelect(type.id)}
                    style={{
                        padding: '1rem 1.25rem',
                        borderRadius: '0.75rem',
                        cursor: type.available ? 'pointer' : 'not-allowed',
                        opacity: type.available ? 1 : 0.5,
                        transition: 'all 0.2s ease',
                        border: type.id === selectedType
                            ? '2px solid #8b5cf6'
                            : type.available
                                ? '1px solid rgba(139, 92, 246, 0.2)'
                                : '1px solid rgba(148, 163, 184, 0.2)',
                        background: type.id === selectedType
                            ? 'rgba(139, 92, 246, 0.08)'
                            : 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: 'blur(8px)',
                    }}
                    onMouseEnter={(e) => {
                        if (type.available && type.id !== selectedType) {
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.15)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (type.id !== selectedType) {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                        }
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div
                            style={{
                                fontSize: '2rem',
                                width: '48px',
                                height: '48px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: type.available
                                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)'
                                    : 'rgba(148, 163, 184, 0.1)',
                                borderRadius: '0.75rem',
                            }}
                        >
                            {type.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Text fw={600} size="lg" style={{ color: type.available ? '#1e293b' : '#94a3b8' }}>
                                    {type.label}
                                </Text>
                                {!type.available && (
                                    <span
                                        style={{
                                            fontSize: '0.625rem',
                                            fontWeight: 700,
                                            padding: '0.125rem 0.5rem',
                                            background: 'rgba(148, 163, 184, 0.2)',
                                            borderRadius: '9999px',
                                            color: '#94a3b8',
                                        }}
                                    >
                                        COMING SOON
                                    </span>
                                )}
                            </div>
                            <Text size="sm" c="dimmed">{type.description}</Text>
                        </div>
                        {type.available && (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

// Skill Selection Step
interface SkillSelectionStepProps {
    testType: TestType;
    selectedSkill: SkillType | null;
    onSelect: (skill: SkillType) => void;
}

const SKILL_OPTIONS: Record<TestType, { skill: SkillType; label: string; icon: string; available: boolean; color: { bg: string; text: string; border: string } }[]> = {
    'IELTS': [
        { skill: 'reading', label: 'Reading', icon: '📖', available: true, color: { bg: 'rgba(34, 197, 94, 0.1)', text: '#16a34a', border: 'rgba(34, 197, 94, 0.3)' } },
        { skill: 'reading-v2', label: 'Reading V2', icon: 'R2', available: isReadingV2TeacherRouteExposureAllowed(), color: { bg: 'rgba(20, 184, 166, 0.1)', text: '#0f766e', border: 'rgba(20, 184, 166, 0.3)' } },
        { skill: 'listening', label: 'Listening', icon: '🎧', available: true, color: { bg: 'rgba(59, 130, 246, 0.1)', text: '#2563eb', border: 'rgba(59, 130, 246, 0.3)' } },
        { skill: 'writing', label: 'Writing', icon: '✍️', available: true, color: { bg: 'rgba(249, 115, 22, 0.1)', text: '#ea580c', border: 'rgba(249, 115, 22, 0.3)' } },
        { skill: 'speaking', label: 'Speaking', icon: '🎙️', available: false, color: { bg: 'rgba(168, 85, 247, 0.1)', text: '#9333ea', border: 'rgba(168, 85, 247, 0.3)' } },
        { skill: 'mixed', label: 'Mixed Test', icon: '🔀', available: false, color: { bg: 'rgba(107, 114, 128, 0.1)', text: '#4b5563', border: 'rgba(107, 114, 128, 0.3)' } },
    ],
    'TOEIC': [],
    'SAT': [],
    'THCS-THPT': [],
    'Custom': [],
};

const SkillSelectionStep: React.FC<SkillSelectionStepProps> = ({ testType, selectedSkill, onSelect }) => {
    const skills = SKILL_OPTIONS[testType] || [];

    return (
        <div>
            <Text size="sm" c="dimmed" style={{ marginBottom: '1rem' }}>
                Select the skill section for your {testType} test
            </Text>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '1rem',
                }}
            >
                {skills.map(({ skill, label, icon, available, color }) => (
                    <div
                        key={skill}
                        onClick={() => available && onSelect(skill)}
                        style={{
                            padding: '1.25rem 1rem',
                            borderRadius: '0.75rem',
                            textAlign: 'center',
                            cursor: available ? 'pointer' : 'not-allowed',
                            opacity: available ? 1 : 0.5,
                            border: skill === selectedSkill
                                ? `2px solid ${color.text}`
                                : `1px solid ${available ? color.border : 'rgba(148, 163, 184, 0.2)'}`,
                            background: skill === selectedSkill
                                ? color.bg
                                : available
                                    ? 'rgba(255, 255, 255, 0.8)'
                                    : 'rgba(148, 163, 184, 0.05)',
                            backdropFilter: 'blur(8px)',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            if (available && skill !== selectedSkill) {
                                e.currentTarget.style.background = color.bg;
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = `0 4px 12px ${color.border}`;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (skill !== selectedSkill) {
                                e.currentTarget.style.background = available ? 'rgba(255, 255, 255, 0.8)' : 'rgba(148, 163, 184, 0.05)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }
                        }}
                    >
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{icon}</div>
                        <Text fw={600} size="md" style={{ color: available ? color.text : '#94a3b8' }}>
                            {label}
                        </Text>
                        {!available && (
                            <Text size="xs" c="dimmed" mt={4}>Coming Soon</Text>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

interface ReadingV2StartStepProps {
    metadata: Partial<DraftMetadata>;
    onStartBlank: () => void;
    onStartImport: () => void;
    onStartAuto: () => void;
}

const READING_V2_START_OPTIONS = [
    {
        id: 'paste',
        title: 'Paste Text',
        description: 'Import a reading test or passage, then review the detected structure in Studio.',
        actionLabel: 'Paste Text',
        icon: 'TXT',
    },
    {
        id: 'auto',
        title: 'Auto',
        description: 'Paste one raw test text block and let Gemini prepare the Studio draft.',
        actionLabel: 'Auto',
        icon: 'AI',
    },
    {
        id: 'blank',
        title: 'Create New Test',
        description: 'Start with an empty Reading V2 test and build passages, groups, and answers manually.',
        actionLabel: 'Create New Test',
        icon: 'NEW',
    },
] as const;

const ReadingV2StartStep: React.FC<ReadingV2StartStepProps> = ({
    metadata,
    onStartBlank,
    onStartImport,
    onStartAuto,
}) => {
    const summaryItems = [
        metadata.title || 'Untitled Reading V2 test',
        `${metadata.duration || DEFAULT_DRAFT_METADATA.duration} minutes`,
        metadata.targetBand ? `Band ${metadata.targetBand}` : null,
    ].filter(Boolean);

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            <div
                style={{
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(20, 184, 166, 0.24)',
                    background: 'rgba(20, 184, 166, 0.08)',
                }}
            >
                <Text fw={700} size="md" style={{ color: '#0f766e' }}>
                    Reading V2 setup ready
                </Text>
                <Text size="sm" c="dimmed">
                    {summaryItems.join(' - ')}
                </Text>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                }}
            >
                {READING_V2_START_OPTIONS.map((option) => {
                    const start = option.id === 'paste'
                        ? onStartImport
                        : option.id === 'auto'
                            ? onStartAuto
                            : onStartBlank;

                    return (
                        <button
                            key={option.id}
                            type="button"
                            onClick={start}
                            style={{
                                width: '100%',
                                minHeight: '170px',
                                padding: '1.25rem',
                                borderRadius: '0.75rem',
                                border: '1px solid rgba(20, 184, 166, 0.28)',
                                background: 'rgba(255, 255, 255, 0.88)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                display: 'grid',
                                alignContent: 'space-between',
                                gap: '1rem',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(event) => {
                                event.currentTarget.style.background = 'rgba(20, 184, 166, 0.08)';
                                event.currentTarget.style.transform = 'translateY(-2px)';
                                event.currentTarget.style.boxShadow = '0 8px 20px rgba(15, 118, 110, 0.14)';
                            }}
                            onMouseLeave={(event) => {
                                event.currentTarget.style.background = 'rgba(255, 255, 255, 0.88)';
                                event.currentTarget.style.transform = 'translateY(0)';
                                event.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <span
                                style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '0.75rem',
                                    background: 'rgba(20, 184, 166, 0.12)',
                                    color: '#0f766e',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 800,
                                    fontSize: '0.75rem',
                                }}
                            >
                                {option.icon}
                            </span>
                            <span>
                                <Text fw={700} size="lg" style={{ color: '#134e4a' }}>
                                    {option.title}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {option.description}
                                </Text>
                            </span>
                            <span style={{ color: '#0f766e', fontWeight: 700 }}>
                                {option.actionLabel} {'->'}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

interface ReadingV2ImportSetupStepProps {
    sourceText: string;
    error: string | null;
    promptCopied: boolean;
    promptFallbackVisible: boolean;
    promptText: string;
    onSourceTextChange: (value: string) => void;
    onCopyPrompt: () => void;
    onClear: () => void;
}

const ReadingV2ImportSetupStep: React.FC<ReadingV2ImportSetupStepProps> = ({
    sourceText,
    error,
    promptCopied,
    promptFallbackVisible,
    promptText,
    onSourceTextChange,
    onCopyPrompt,
    onClear,
}) => {
    const sourceLineCount = sourceText.split('\n').filter((line) => line.trim()).length;

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
                <Text fw={700} size="lg" style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                    Paste Reading V2 source
                </Text>
                <Text size="sm" c="dimmed">
                    Prepare the processed source here first. Studio opens after parse so you can review passages, questions, and answer keys in the editor.
                </Text>
            </div>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    background: 'rgba(20, 184, 166, 0.08)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(20, 184, 166, 0.24)',
                }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '0.5rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(20, 184, 166, 0.14)',
                        color: '#0f766e',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                    }}
                >
                    AI
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={700} style={{ color: '#134e4a' }}>
                        Copy the prompt for external AI, include the teacher answer key with that AI request, then paste the processed source below.
                    </Text>
                    <Text size="xs" c="dimmed">
                        The processed output must already contain the answer key bindings.
                    </Text>
                </div>
                <Button variant="primary" onClick={onCopyPrompt}>
                    {promptCopied ? 'Copied' : 'Copy Prompt'}
                </Button>
            </div>

            {promptFallbackVisible ? (
                <label style={{ display: 'grid', gap: '0.5rem', minWidth: 0 }}>
                    <Text fw={700} size="sm" style={{ color: '#1e293b' }}>External AI prompt</Text>
                    <textarea
                        aria-label="Reading V2 external AI prompt"
                        readOnly
                        value={promptText}
                        onFocus={(event) => event.currentTarget.select()}
                        style={{
                            width: '100%',
                            minHeight: '180px',
                            padding: '1rem',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '0.75rem',
                            fontSize: '0.8125rem',
                            fontFamily: 'monospace',
                            color: '#1e293b',
                            resize: 'vertical',
                            outline: 'none',
                            boxSizing: 'border-box',
                            lineHeight: 1.5,
                            background: '#fff',
                        }}
                    />
                </label>
            ) : null}

            <div
                style={{
                    display: 'block',
                }}
            >
                <label style={{ display: 'grid', gap: '0.5rem', minWidth: 0 }}>
                    <Text fw={700} size="sm" style={{ color: '#1e293b' }}>Processed source</Text>
                    <textarea
                        aria-label="Reading V2 passages and questions"
                        value={sourceText}
                        onChange={(event) => onSourceTextChange(event.currentTarget.value)}
                        placeholder={'Paste the AI-processed Reading V2 source here.\n\nIt should include passages, task instructions, question numbers, options, tables, flowcharts, diagrams, and answer-key bindings where present.'}
                        style={{
                            width: '100%',
                            minHeight: '420px',
                            padding: '1rem',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '0.75rem',
                            fontSize: '0.875rem',
                            fontFamily: 'monospace',
                            color: '#1e293b',
                            resize: 'vertical',
                            outline: 'none',
                            boxSizing: 'border-box',
                            lineHeight: 1.55,
                            background: '#fff',
                        }}
                    />
                </label>
            </div>

            {error ? (
                <div
                    role="alert"
                    style={{
                        padding: '0.875rem 1rem',
                        borderRadius: '0.75rem',
                        border: '1px solid #fca5a5',
                        background: '#fef2f2',
                        color: '#991b1b',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                    }}
                >
                    {error}
                </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <Text size="xs" c="dimmed">
                    {sourceLineCount > 0 ? `${sourceLineCount} source lines ready` : 'Paste passages and questions to continue'}
                </Text>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <Button
                        variant="secondary"
                        onClick={onClear}
                        disabled={sourceText.trim().length === 0}
                    >
                        Clear
                    </Button>
                </div>
            </div>
        </div>
    );
};

interface ReadingV2AutoImportStepProps {
    sourceText: string;
    error: string | null;
    diagnostics: readonly ReadingV2AutoImportDiagnostic[];
    processing: boolean;
    onSourceTextChange: (value: string) => void;
    onClear: () => void;
}

const ReadingV2AutoImportStep: React.FC<ReadingV2AutoImportStepProps> = ({
    sourceText,
    error,
    diagnostics,
    processing,
    onSourceTextChange,
    onClear,
}) => {
    const sourceLineCount = sourceText.split('\n').filter((line) => line.trim()).length;
    const blockingDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    const warningDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
                <Text fw={700} size="lg" style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                    Auto Reading V2 source
                </Text>
                <Text size="sm" c="dimmed">
                    Paste the raw test text once. Auto V3 prepares a Studio draft, then Studio stays the review and repair surface.
                </Text>
            </div>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    background: 'rgba(20, 184, 166, 0.08)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(20, 184, 166, 0.24)',
                }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '0.5rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(20, 184, 166, 0.14)',
                        color: '#0f766e',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                    }}
                >
                    AI
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={700} style={{ color: '#134e4a' }}>
                        Auto V3 import
                    </Text>
                    <Text size="xs" c="dimmed">
                        Answers are accepted only when an answer-key section is present in the pasted source.
                    </Text>
                </div>
            </div>

            <label style={{ display: 'grid', gap: '0.5rem', minWidth: 0 }}>
                <Text fw={700} size="sm" style={{ color: '#1e293b' }}>Raw test text</Text>
                <textarea
                    aria-label="Reading V2 Auto raw test text"
                    value={sourceText}
                    disabled={processing}
                    onChange={(event) => onSourceTextChange(event.currentTarget.value)}
                    placeholder={'Paste the complete raw IELTS Reading test here, including passages, questions, option banks, tables, diagrams, and the answer key when present.'}
                    style={{
                        width: '100%',
                        minHeight: '420px',
                        padding: '1rem',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '0.75rem',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                        color: '#1e293b',
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box',
                        lineHeight: 1.55,
                        background: processing ? '#f8fafc' : '#fff',
                    }}
                />
            </label>

            {error ? (
                <div
                    role="alert"
                    style={{
                        padding: '0.875rem 1rem',
                        borderRadius: '0.75rem',
                        border: '1px solid #fca5a5',
                        background: '#fef2f2',
                        color: '#991b1b',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                    }}
                >
                    {error}
                </div>
            ) : null}

            {diagnostics.length > 0 ? (
                <div
                    aria-label="Reading V2 Auto diagnostics"
                    style={{
                        display: 'grid',
                        gap: '0.5rem',
                        padding: '0.875rem 1rem',
                        borderRadius: '0.75rem',
                        border: blockingDiagnostics > 0 ? '1px solid #fca5a5' : '1px solid #fde68a',
                        background: blockingDiagnostics > 0 ? '#fef2f2' : '#fffbeb',
                    }}
                >
                    <Text fw={700} size="sm" style={{ color: blockingDiagnostics > 0 ? '#991b1b' : '#92400e' }}>
                        {blockingDiagnostics > 0
                            ? `${blockingDiagnostics} blocking Auto issue${blockingDiagnostics === 1 ? '' : 's'}`
                            : `${warningDiagnostics} Auto warning${warningDiagnostics === 1 ? '' : 's'}`}
                    </Text>
                    {diagnostics.slice(0, 5).map((diagnostic, index) => (
                        <Text key={`${diagnostic.code}-${index}`} size="xs" c="dimmed">
                            {diagnostic.message}
                        </Text>
                    ))}
                </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <Text size="xs" c="dimmed">
                    {processing
                        ? 'Auto V3 is preparing the Studio draft...'
                        : sourceLineCount > 0
                            ? `${sourceLineCount} raw source lines ready`
                            : 'Paste raw test text to continue'}
                </Text>
                <Button
                    variant="secondary"
                    onClick={onClear}
                    disabled={processing || sourceText.trim().length === 0}
                >
                    Clear
                </Button>
            </div>
        </div>
    );
};

export default TestCreationModal;
