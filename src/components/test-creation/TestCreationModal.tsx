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
    WRITING_STEP_ORDER,
    INITIAL_MODAL_DATA,
    DEFAULT_DRAFT_METADATA,
    generateDefaultTitle,
} from '../../types/draft.types';
import { useAuth } from '../../hooks/useAuth';
import { testDraftService } from '../../services/draftCloudService';
import testCreationService from '../../services/test-creation';
import {
    saveWritingDraft,
    publishWritingTest,
} from '../../services/writingTestService';
import type { WritingTask, WritingTestMetadata } from '../../types/ielts-writing.types';

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
}

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
    const activeStepOrder = isWritingFlow ? WRITING_STEP_ORDER : MODAL_STEP_ORDER;
    const activeStepConfigs = isWritingFlow ? WRITING_STEP_CONFIGS : STEP_CONFIGS;
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
        const prevIndex = currentStepIndex - 1;
        const prevStep = activeStepOrder[prevIndex];
        if (prevIndex >= 0 && prevStep) {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep(prevStep);
                setIsAnimating(false);
            }, 150);
        }
    }, [currentStepIndex, activeStepOrder]);

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
        // PRD-0027: THCS-THPT has its own dedicated editor page
        if (testType === 'THCS-THPT') {
            onClose();
            navigate('/teacher/thcs-test/create');
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
    }, [updateStepData, onClose, navigate]);

    const handleSkillSelect = useCallback((skillType: SkillType) => {
        updateStepData({ skillType });

        // PRD-0020 / PRD-0022 bug fix: Redirect to dedicated Listening builder immediately 
        if (skillType === 'listening') {
            onClose();
            navigate(`/create-test?type=${stepData.testType}&skill=Listening`, {
                state: { metadata: { type: stepData.testType } }
            });
            return;
        }

        // PRD-0030: Writing stays in-modal — advance to writing-metadata step
        if (skillType === 'writing') {
            // Pre-populate writing metadata with default title
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
    }, [updateStepData, onClose, navigate, stepData.testType]);

    // ─── Close Handlers ──────────────────────────────────────────
    const handleCloseRequest = useCallback(() => {
        if (isParsing) {
            // During parsing, show confirmation before closing
            setShowCloseConfirmation(true);
            return;
        }

        if (hasUnsavedChanges && currentStepIndex > 0) {
            setShowCloseConfirmation(true);
        } else {
            onClose();
        }
    }, [isParsing, hasUnsavedChanges, currentStepIndex, onClose]);

    const handleConfirmClose = useCallback(() => {
        setShowCloseConfirmation(false);
        // Reset state
        setCurrentStep('type');
        setStepData({ ...INITIAL_MODAL_DATA });
        setHasUnsavedChanges(false);
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
            setCurrentStep(initialStep);
            setStepData({ ...INITIAL_MODAL_DATA, ...initialData });
            setHasUnsavedChanges(false);
            setShowCloseConfirmation(false);
            // Reset parsing state
            setParsingStage('converting');
            setParsingProgress(0);
            setParsingMessage(undefined);
            setParsingError(undefined);
            setDraftId(null);
            // Reset writing state
            setWritingMeta({ title: '', duration: 60 });
            setWritingFormat(undefined);
            setWritingTask1({ ...DEFAULT_WRITING_TASK1 });
            setWritingTask2({ ...DEFAULT_WRITING_TASK2 });
            setWritingPublishing(false);
            setWritingSaving(false);
            setWritingDraftId(undefined);
            // Note: parsingAbortRef and isParsingRef are reset in startRealParsing
        }
    }, [opened, initialStep, initialData]);

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

            // Use actual extracted passages (with full content) from AI/offline parsing
            // These contain the actual reading passage text needed for student view
            const extractedPassages = parseResult.passages || [];
            const passages = extractedPassages.length > 0
                ? extractedPassages.map((p, i) => ({
                    id: p.id || `passage-${i + 1}`,
                    title: p.title || `Passage ${i + 1}`,
                    content: p.content || '',
                    type: 'text' as const,
                    wordCount: p.wordCount || 0,
                    questionStart: p.questionRange?.start || 1,
                    questionEnd: p.questionRange?.end || 1,
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

            const questions = validation?.mergedQuestions?.map(q => ({
                id: `q-${q.questionNumber}`,
                number: q.questionNumber,
                questionNumber: q.questionNumber,
                questionText: q.questionText || '',
                question: q.questionText || '',
                type: q.type,
                options: q.options || [],
                answer: q.answer || '',
                answerSource: 'ai-suggestion' as const,
                passageId: q.passageId || passages[0]?.id || 'default',
                confidence: q.confidence || 80,
                points: 1,
                wordLimit: q.wordLimit?.max,
            })) || [];

            const sectionInstructions: Record<string, string> = {};

            await testDraftService.saveParsedContent(
                createdDraftId,
                passages,
                questions,
                sectionInstructions
            );

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

    const renderHeader = () => (
        <div style={modalStyles.header as React.CSSProperties}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>{currentStepConfig?.icon}</span>
                        <div>
                            <Text size="xl" fw={700} style={{ color: '#1e293b' }}>
                                {currentStepConfig?.label}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {currentStepConfig?.description} • Step {currentStepIndex + 1} of {totalSteps}
                            </Text>
                        </div>
                    </div>
                    {renderStepIndicator()}
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
                onClose();
                // Reset all state
                setCurrentStep('type');
                setStepData({ ...INITIAL_MODAL_DATA });
                setWritingMeta({ title: '', duration: 60 });
                setWritingFormat(undefined);
                setWritingTask1({ ...DEFAULT_WRITING_TASK1 });
                setWritingTask2({ ...DEFAULT_WRITING_TASK2 });
                setWritingDraftId(undefined);
                navigate('/teacher/grading/writing');
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
                size="lg"
                title={null}
                withCloseButton={false}
                padding={0}
                closeOnClickOutside={!isParsing}
                closeOnEscape={false}
                styles={{
                    body: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
                    content: modalStyles.content as React.CSSProperties,
                }}
            >
                <div style={modalStyles.innerWrapper}>
                    {renderHeader()}
                    <div ref={contentRef} style={modalStyles.body as React.CSSProperties}>
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

export default TestCreationModal;
