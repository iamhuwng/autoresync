// @ts-nocheck
/**
 * THCSTestEditorPage — 4-Step Wizard for THCS-THPT Test Creation/Editing
 * 
 * Step 1: Test Setup (metadata + Quick Start)
 * Step 2: Questions (sections + DnD question blocks)
 * Step 3: Answer Key (bubble-grid answer entry)
 * Step 4: Review & Publish (summary + validation + actions)
 * 
 * All state management, hooks, and callbacks remain at this parent level.
 * Steps receive state via props. No data model changes.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, setDoc, getFirestore } from 'firebase/firestore';

import { useAuth } from '../hooks/useAuth';
import { useScreenSize } from '../core/platform/hooks/useScreenSize';
import { useThcsDraft } from '../hooks/thcs/useThcsDraft';
import { useThcsAutoSave } from '../hooks/thcs/useThcsAutoSave';
import { useThcsValidation } from '../hooks/thcs/useThcsValidation';

import { createThcsDraft } from '../services/thcsDraftService';
import { generateThcsTestId, saveThcsTestToFirebase } from '../services/thcsTestStorage';
import r2StorageService from '../services/r2Storage';
import { Button, toast } from '../components/modern';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { THCSPreviewOverlay } from '../components/thcs-editor/THCSPreviewOverlay';
import { THCSImportAttentionPanel } from '../components/thcs-editor/THCSImportAttentionPanel';
import { classifyThcsImportAttention, resolveThcsImportAttention } from '../services/test-creation/thcs-import-attention';
import { useClipboard } from '../core/platform/hooks/useClipboard';
import { convertParsedToThcsDraft, parseThcsText } from '../services/test-creation/thcsDocumentParser.service';
import '../components/thcs-editor/THCSImportFlow.css';
import thcsExtractionPrompt from '../services/test-creation/thcs-pdf-extraction-prompt.txt?raw';

// Wizard components
import THCSWizardLayout from '../components/thcs-editor/THCSWizardLayout';
import THCSSetupStep from '../components/thcs-editor/THCSSetupStep';
import THCSQuestionsStep from '../components/thcs-editor/THCSQuestionsStep';
import THCSAnswerKeyStep from '../components/thcs-editor/THCSAnswerKeyStep';
import THCSReviewStep from '../components/thcs-editor/THCSReviewStep';
import type { WizardStep } from '../components/thcs-editor/THCSWizardStepper';

import type { THCSTestMetadata, THCSSection, THCSTest, THCSDraft } from '../types/thcs-test.types';
import { buildRoute } from '../constants/routes';
import AIMaintenanceBanner from '../components/ai/AIMaintenanceBanner';

// ═══════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════

const STEP2_ALWAYS_VISUAL_TYPES_REQUIRING_IMAGE = new Set([
    'mcq-sign-notice',
]);

const STEP2_VISUAL_ANNOUNCEMENT_CUE_REGEX = /\b(sign|notice|poster|billboard|picture|photo|image|biển\s*báo|áp\s*phích|hình\s*ảnh|bức\s*tranh)\b/i;
const STEP2_CLOZE_CUE_REGEX = /\b(fill|fit(?:s)?|blank|gap|numbered\s*blank|điền(?:\s+vào)?\s+chỗ\s*trống|điền\s*từ)\b/i;

type SectionQuestion = THCSSection['questions'][number];

function hasQuestionType(question: SectionQuestion, type: string): boolean {
    return question.type === type || question.intent === type;
}

function getSectionTextContext(section: THCSSection, question: SectionQuestion): string {
    const sectionWithFlatPassage = section as THCSSection & { passageContent?: string };
    return [
        section.name,
        section.instructionText,
        sectionWithFlatPassage.passageContent,
        section.passage?.content,
        question.questionText,
    ]
        .filter(Boolean)
        .join(' ');
}

function isLikelyClozeReadingAnnouncement(section: THCSSection, question: SectionQuestion): boolean {
    const context = getSectionTextContext(section, question);

    if (STEP2_CLOZE_CUE_REGEX.test(context)) {
        return true;
    }

    if (/_{2,}|\(\s*\d+\s*\)\s*_{2,}/.test(context)) {
        return true;
    }

    const nonEmptyOptions = (question.options || []).filter((opt) => opt?.trim().length > 0);
    const mostlyShortOptions =
        nonEmptyOptions.length === 4 &&
        nonEmptyOptions.filter((opt) => opt.trim().split(/\s+/).length <= 3).length >= 3;

    const sectionWithFlatPassage = section as THCSSection & { passageContent?: string };
    const hasPassageText = Boolean((section.passage?.content || sectionWithFlatPassage.passageContent || '').trim());

    return hasPassageText && mostlyShortOptions;
}

function shouldRequireImageForReadingAnnouncement(section: THCSSection, question: SectionQuestion): boolean {
    if (!hasQuestionType(question, 'reading-announcement')) {
        return false;
    }

    const context = getSectionTextContext(section, question);
    const hasVisualCue = STEP2_VISUAL_ANNOUNCEMENT_CUE_REGEX.test(context);

    if (!hasVisualCue) {
        return false;
    }

    return !isLikelyClozeReadingAnnouncement(section, question);
}

type MissingImageQuestion = {
    sectionName: string;
    questionNumber: number;
};

export type THCSTestEditorPresentation = 'page' | 'embedded';

interface THCSTestEditorSurfaceProps {
    initialDraftId?: string;
    presentation?: THCSTestEditorPresentation;
    onExit: () => void;
    onPublished?: (testId: string) => void;
    onDraftCreated?: (draftId: string) => void;
    onDuplicateCreated?: (draftId: string) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onStepChange?: (step: number) => void;
    onWideLayoutChange?: (wide: boolean) => void;
    onExpandedLayoutChange?: (active: boolean) => void;
    onStepConfigChange?: (steps: WizardStep[]) => void;
}

const DEFAULT_WIZARD_STEPS: WizardStep[] = [
    { label: 'Test Setup', icon: '📋' },
    { label: 'Build Test', icon: '✏️' },
    { label: 'Answer Key', icon: '🔑' },
    { label: 'Review & Publish', icon: '✅' },
];

export function getMissingVisualQuestionImages(sections: THCSSection[]): MissingImageQuestion[] {
    const missing: MissingImageQuestion[] = [];

    sections.forEach((section) => {
        section.questions.forEach((question) => {
            const requiresImage =
                STEP2_ALWAYS_VISUAL_TYPES_REQUIRING_IMAGE.has(question.type) ||
                (question.intent ? STEP2_ALWAYS_VISUAL_TYPES_REQUIRING_IMAGE.has(question.intent) : false) ||
                shouldRequireImageForReadingAnnouncement(section, question);

            if (requiresImage && !question.imageUrl?.trim() && !question.imageCaption?.trim()) {
                missing.push({
                    sectionName: section.name,
                    questionNumber: question.questionNumber,
                });
            }
        });
    });

    return missing;
}

function formatMissingImageSummary(missing: MissingImageQuestion[], limit = 6): string {
    if (missing.length === 0) return '';

    const preview = missing
        .slice(0, limit)
        .map((item) => `Q${item.questionNumber} (${item.sectionName})`)
        .join(', ');
    const moreText = missing.length > limit ? ` (+${missing.length - limit} more)` : '';

    return `${preview}${moreText}`;
}

function recalculateQuestionNumbers(sections: THCSSection[]): THCSSection[] {
    let globalNumber = 1;
    return sections.map(section => ({
        ...section,
        questions: section.questions.map(q => ({
            ...q,
            questionNumber: globalNumber++,
        })),
    }));
}

function createDefaultSection(order: number): THCSSection {
    return {
        id: crypto.randomUUID(),
        name: 'PART ' + String.fromCharCode(65 + order),
        order,
        totalPoints: 0,
        pointMode: 'auto',
        instructionText: '',
        isCustomInstruction: false,
        layout: 'single-column',
        questions: [],
    };
}

const DEFAULT_METADATA: THCSTestMetadata = {
    title: '',
    duration: 45,
    gradeLevel: 9,
    examType: '',
};

export function THCSTestEditorSurface({
    initialDraftId,
    presentation = 'page',
    onExit,
    onPublished,
    onDraftCreated,
    onDuplicateCreated,
    onDirtyChange,
    onStepChange,
    onWideLayoutChange,
    onExpandedLayoutChange,
    onStepConfigChange,
}: THCSTestEditorSurfaceProps) {
    const { user } = useAuth();
    const { isDesktop } = useScreenSize();
    const isMobile = !isDesktop;

    // ─── Wizard Step State ──────────────────────────────────────
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const [currentStep, setCurrentStep] = useState(0);
    const [setupMode, setSetupMode] = useState<'options' | 'paste'>('options');

    // ─── Core State ─────────────────────────────────────────────
    const [metadata, setMetadata] = useState<THCSTestMetadata>(DEFAULT_METADATA);
    const [sections, setSections] = useState<THCSSection[]>([createDefaultSection(0)]);
    const [isPublic, setIsPublic] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [draftId, setDraftId] = useState<string | null>(initialDraftId || null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [showPublishWarnings, setShowPublishWarnings] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [publishedTestId, setPublishedTestId] = useState<string | null>(null);
    const [pasteTextContent, setPasteTextContent] = useState('');
    const [parsedPasteData, setParsedPasteData] = useState<any>(null);
    const [importResolution, setImportResolution] = useState<'keep-source' | 'discard'>('keep-source');
    const [isPasteProcessing, setIsPasteProcessing] = useState(false);
    const [pasteErrorMessage, setPasteErrorMessage] = useState<string | null>(null);


    // ─── Draft Loading ──────────────────────────────────────────
    const { draft, loading: draftLoading, error: draftError } = useThcsDraft(initialDraftId);

    useEffect(() => {
        if (draft) {
            setMetadata(draft.metadata);
            setSections(draft.sections?.length > 0 ? draft.sections : [createDefaultSection(0)]);
            setDraftId(draft.id || initialDraftId || null);
            setPublishedTestId((draft as THCSDraft & { publishedTestId?: string }).publishedTestId || null);
            setIsDirty(false);
        }
    }, [draft, initialDraftId]);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const displayStep = currentStep;
    const activeWizardSteps = DEFAULT_WIZARD_STEPS;
    const { writeText } = useClipboard();
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);

    useEffect(() => {
        onStepChange?.(displayStep);
    }, [displayStep, onStepChange]);

    useEffect(() => {
        onWideLayoutChange?.(currentStep === 1);
    }, [currentStep, onWideLayoutChange]);

    useEffect(() => { onExpandedLayoutChange?.((currentStep === 0 && setupMode === 'paste') || currentStep >= 2); }, [currentStep, setupMode, onExpandedLayoutChange]);

    useEffect(() => {
        onStepConfigChange?.(activeWizardSteps);
    }, [activeWizardSteps, onStepConfigChange]);

    const resetPasteFlow = useCallback(() => {
        setSetupMode('options');
        setPasteTextContent('');
        setParsedPasteData(null);
        setIsPasteProcessing(false);
        setPasteErrorMessage(null);

    }, []);

    const handleStartPasteText = useCallback(() => {
        trackAction('thcsPasteTestOpened');
        setSetupMode('paste');
        setPasteErrorMessage(null);
    }, [trackAction]);

    const handleBackFromPasteSetup = useCallback(() => {
        trackAction('thcsImportBack');
        setSetupMode('options');
    }, [trackAction]);

    const handleBackToPasteEditor = useCallback(() => {
        trackAction('thcsImportBack');
        setParsedPasteData(null);
        setPasteErrorMessage(null);
    }, [trackAction]);

    // Phase 3 Task 7.5: Handle template selection
    const handleTemplateSelect = useCallback((template: any) => {
        trackAction('selectTemplate', { templateId: template.id });
        resetPasteFlow();
        const templateSections: THCSSection[] = template.sections.map((spec: any, idx: number) => {
            const questions = Array.from({ length: spec.questionCount }, (_, qIdx) => ({
                id: crypto.randomUUID(),
                questionNumber: qIdx + 1,
                type: spec.defaultQuestionType || 'mcq-grammar',
                text: '',
                options: spec.defaultQuestionType?.startsWith('mcq') ? ['', '', '', ''] : [],
                correctAnswer: '',
                points: spec.questionCount > 0 ? Math.max(0.05, Math.round((spec.points / spec.questionCount) * 100) / 100) : 1,
            }));
            return {
                id: crypto.randomUUID(),
                name: spec.name,
                order: idx,
                questions,
                totalPoints: spec.points,
                layout: spec.layout || 'single-column',
                instructionText: spec.instructionText || '',
                shuffle: false,
                shuffleOptions: false,
            };
        });

        setSections(templateSections);
setIsDirty(true);
        setCurrentStep(1); // Jump to Questions step after applying template
        toast.success(`Applied template "${template.name}" with ${templateSections.length} sections.`);
    }, [resetPasteFlow, trackAction]);

    const handleParsedProceed = useCallback((finalParsed: any, resolution?: 'keep-source' | 'discard') => {
        try {
            const draft = resolution ? resolveThcsImportAttention(finalParsed, pasteTextContent, resolution) : convertParsedToThcsDraft(finalParsed);
            if (!draft.sections.some((section) => section.questions.length)) throw new Error('No editable questions remain.');
            resetPasteFlow();
            const normalizedSections: THCSSection[] = (draft.sections || []).map((s: any, idx: number) => ({
                ...createDefaultSection(idx),
                ...s,
                isCustomInstruction: s.isCustomInstruction ?? false,
                layout: s.layout ?? 'single-column',
            }));
            setSections(normalizedSections.length > 0 ? normalizedSections : [createDefaultSection(0)]);
            setIsDirty(true);
            trackAction('thcsImportCompleted');
            setCurrentStep(1); // Jump to Build Test after import
            const qCount = normalizedSections.reduce((sum, s) => sum + s.questions.length, 0);
            toast.success(`Imported ${normalizedSections.length} sections with ${qCount} questions from document.`);
        } catch (err) {
            console.error('Error converting parsed document:', err);
            toast.error('Could not convert parsed document to editor format.');
        }
    }, [resetPasteFlow, pasteTextContent, trackAction]);

    const handlePasteParse = useCallback(async () => {
        if (!pasteTextContent.trim()) return;

        trackAction('thcsImportRequested');
        setIsPasteProcessing(true);
        setPasteErrorMessage(null);

        try {
            const result = await parseThcsText(pasteTextContent);
            if (!mounted.current) return;

            if (result.success) {
                const issues = classifyThcsImportAttention(result.data, pasteTextContent);
                if (issues.length) {
                    setParsedPasteData(result.data);
                    setImportResolution('keep-source');
                    trackAction('thcsImportAttentionShown', { issueCount: issues.length });
                } else {
                    handleParsedProceed(result.data);
                }
            } else {
                setPasteErrorMessage('Could not import this test. Check the pasted content and try again.');
                toast.error('Could not import this test. Check the pasted content and try again.');
                trackAction('thcsImportFailed');
            }
        } catch (err) {
            if (!mounted.current) return;
            console.error('[PasteText] Parse exception:', err);
            setPasteErrorMessage('Could not import this test. Your pasted content is still here; try again.');
            toast.error('Could not import this test. Your pasted content is still here; try again.');
            trackAction('thcsImportFailed');
        } finally {
            if (mounted.current) setIsPasteProcessing(false);
        }
    }, [pasteTextContent, handleParsedProceed, trackAction]);

    const handleCopyExtractionPrompt = useCallback(async () => {
        trackAction('thcsExtractionPromptCopied');
        if (await writeText(thcsExtractionPrompt)) {
            toast.success('Copied extraction prompt.');
        } else {
            toast.error('Could not copy the extraction prompt. Try again.');
        }
    }, [writeText, trackAction]);
    // ─── Auto-Save ──────────────────────────────────────────────
    const autoSaveData = useMemo(() => ({
        metadata,
        sections,
        questionCount: sections.reduce((sum, s) => sum + s.questions.length, 0),
        totalPoints: sections.reduce((sum, s) => sum + s.totalPoints, 0),
    }), [metadata, sections]);

    const { isSaving, lastSavedAt, error: saveError, saveNow } = useThcsAutoSave({
        draftId,
        data: autoSaveData,
        isDirty,
    });


    // ─── Validation ─────────────────────────────────────────────
    const { metadataErrors, errors, warnings, isValid } = useThcsValidation({ metadata, sections });

    // ─── Unsaved Changes Warning ────────────────────────────────
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // ─── State Updaters ─────────────────────────────────────────
    const handleMetadataChange = useCallback(<K extends keyof THCSTestMetadata>(
        field: K, value: THCSTestMetadata[K]
    ) => {
        setMetadata(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    }, []);

    const handleIsPublicChange = useCallback((value: boolean) => {
        setIsPublic(value);
        setIsDirty(true);
    }, []);

    const handleSectionUpdate = useCallback((index: number, section: THCSSection) => {
        setSections(prev => {
            const newSections = [...prev];
            newSections[index] = section;
            return recalculateQuestionNumbers(newSections);
        });
        setIsDirty(true);
    }, []);

    const handleSectionDelete = useCallback((index: number) => {
        setSections(prev => {
            const newSections = prev.filter((_, i) => i !== index);
            return recalculateQuestionNumbers(newSections);
        });
        setIsDirty(true);
    }, []);

    const handleSectionMove = useCallback((index: number, direction: -1 | 1) => {
        const newIndex = index + direction;
        setSections(prev => {
            if (newIndex < 0 || newIndex >= prev.length) return prev;
            const newSections = [...prev];
            [newSections[index], newSections[newIndex]] = [newSections[newIndex]!, newSections[index]!];
            return recalculateQuestionNumbers(
                newSections.map((s, i) => ({ ...s, order: i }))
            );
        });
        setIsDirty(true);
    }, []);

    const handleAddSection = useCallback(() => {
        setSections(prev => {
            const newSection = createDefaultSection(prev.length);
            return recalculateQuestionNumbers([...prev, newSection]);
        });
        setIsDirty(true);
    }, []);

    // ─── Answer Key Callbacks ───────────────────────────────────
    const handleAnswerKeyUpdate = useCallback((sectionIndex: number, questionIndex: number, answer: 'A' | 'B' | 'C' | 'D') => {
        setSections(prev => {
            const newSections = [...prev];
            const section = { ...newSections[sectionIndex]! };
            const questions = [...section.questions];
            questions[questionIndex] = { ...questions[questionIndex]!, correctAnswer: answer };
            section.questions = questions;
            newSections[sectionIndex] = section;
            return newSections;
        });
        setIsDirty(true);
    }, []);

    const handleFillInAnswerUpdate = useCallback((sectionIndex: number, questionIndex: number, blankIndex: number, answers: string[]) => {
        setSections(prev => {
            const newSections = [...prev];
            const section = { ...newSections[sectionIndex]! };
            const questions = [...section.questions];
            const q = { ...questions[questionIndex]! };
            const blankAnswers = [...(q.blankAnswers || [])];
            blankAnswers[blankIndex] = { ...(blankAnswers[blankIndex] || { acceptedAnswers: [] }), acceptedAnswers: answers };
            q.blankAnswers = blankAnswers;
            questions[questionIndex] = q;
            section.questions = questions;
            newSections[sectionIndex] = section;
            return newSections;
        });
        setIsDirty(true);
    }, []);

    const handleModelAnswerUpdate = useCallback((sectionIndex: number, questionIndex: number, answers: string[]) => {
        setSections(prev => {
            const newSections = [...prev];
            const section = { ...newSections[sectionIndex]! };
            const questions = [...section.questions];
            questions[questionIndex] = { ...questions[questionIndex]!, modelAnswers: answers };
            section.questions = questions;
            newSections[sectionIndex] = section;
            return newSections;
        });
        setIsDirty(true);
    }, []);

    const handleClozeMappingUpdate = useCallback((sectionIndex: number, questionIndex: number, blankNum: number, word: string) => {
        setSections(prev => {
            const newSections = [...prev];
            const section = { ...newSections[sectionIndex]! };
            const questions = [...section.questions];
            const q = { ...questions[questionIndex]! };
            const mapping = { ...(q.blankMapping || {}) };
            if (word) mapping[blankNum] = word;
            else delete mapping[blankNum];
            q.blankMapping = mapping;
            questions[questionIndex] = q;
            section.questions = questions;
            newSections[sectionIndex] = section;
            return newSections;
        });
        setIsDirty(true);
    }, []);

    // ─── Save Draft ─────────────────────────────────────────────
    const handleSaveDraft = useCallback(async () => {
        if (!user?.uid) return;

        if (!draftId) {
            const result = await createThcsDraft(user.uid, metadata);
            if (result.success && result.data) {
                const newDraftId = result.data.draftId;
                setDraftId(newDraftId);
                onDraftCreated?.(newDraftId);
                await saveNow();
                setIsDirty(false);
                toast.success('Saved draft.');
            }
        } else {
            await saveNow();
            setIsDirty(false);
            toast.success('Saved draft.');
        }
    }, [draftId, metadata, onDraftCreated, saveNow, user]);

    // ─── Publish ────────────────────────────────────────────────
    const handlePublish = useCallback(async () => {
        if (!user?.uid) return;
        if (!isValid) return;

        if (warnings.length > 0 && !showPublishWarnings) {
            setShowPublishWarnings(true);
            return;
        }

        setIsPublishing(true);
        setShowPublishWarnings(false);

        try {
            let currentDraftId = draftId;
            if (!currentDraftId) {
                const result = await createThcsDraft(user.uid, metadata);
                if (!result.success || !result.data) throw new Error('Failed to create draft');
                currentDraftId = result.data.draftId;
                setDraftId(currentDraftId);
            }

            const testId = publishedTestId || generateThcsTestId();
            const finalSections = recalculateQuestionNumbers(sections);
            const questionCount = finalSections.reduce((sum, s) => sum + s.questions.length, 0);
            const totalPoints = finalSections.reduce((sum, s) => sum + s.totalPoints, 0);

            // Move any R2 temp images to permanent storage before saving
            const finalSectionsWithPermanentImages = await Promise.all(
                finalSections.map(async (section) => ({
                    ...section,
                    questions: await Promise.all(
                        section.questions.map(async (q: any) => {
                            if (q._imageKey && r2StorageService.isTempFile(q._imageKey)) {
                                const moved = await r2StorageService.moveToPermanent(q._imageKey);
                                const { _imageKey: _, ...rest } = q;
                                return { ...rest, imageUrl: moved.newUrl };
                            }
                            const { _imageKey: _, ...rest } = q;
                            return rest;
                        })
                    ),
                }))
            );

            const test: THCSTest = {
                id: testId,
                testType: 'THCS-THPT',
                metadata,
                sections: finalSectionsWithPermanentImages,
                questionCount,
                totalPoints,
                createdBy: user.uid,
                ownerId: user.uid,
                isPublic,
                isComplete: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                publishedAt: Date.now(),
                sourceDraftId: currentDraftId,
                settings: {
                    showTimer: true,
                    showResults: 'immediate',
                    allowReview: true,
                },
            };

            const saveResult = await saveThcsTestToFirebase(test);
            if (!saveResult.success) throw new Error(saveResult.error || 'Failed to save test');

            const db = getFirestore();
            const libraryData = {
                testId,
                title: metadata.title,
                gradeLevel: metadata.gradeLevel,
                examType: metadata.examType,
                subjectVariant: metadata.subjectVariant || null,
                province: metadata.province || null,
                duration: metadata.duration,
                questionCount,
                totalPoints,
                createdBy: user.uid,
                createdAt: Date.now(),
                isPublic,
                tags: metadata.tags || [],
                sectionSummary: finalSections.map(s => ({
                    id: s.id,
                    name: s.name,
                    questionCount: s.questions.length,
                    totalPoints: s.totalPoints,
                })),
            };
            await setDoc(doc(db, 'thcs_library', testId), libraryData);

            const { updateThcsDraft } = await import('../services/thcsDraftService');
            await updateThcsDraft(currentDraftId, { status: 'published', publishedTestId: testId } as any);
            setPublishedTestId(testId);

            setIsDirty(false);
            toast.success('Published test. It is now available in My Content.');
            onPublished?.(testId);

        } catch (error) {
            console.error('Publish failed:', error);
            toast.error(`Could not publish test: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsPublishing(false);
        }
    }, [draftId, isPublic, isValid, metadata, onPublished, publishedTestId, sections, showPublishWarnings, user, warnings]);

    // ─── Duplicate ──────────────────────────────────────────────
    const handleDuplicate = useCallback(async () => {
        if (!user?.uid) return;

        const dupMetadata = { ...metadata, title: `Copy of ${metadata.title}` };
        const result = await createThcsDraft(user.uid, dupMetadata);
        if (result.success && result.data) {
            const newDraftId = result.data.draftId;
            const { updateThcsDraft } = await import('../services/thcsDraftService');
            await updateThcsDraft(newDraftId, {
                metadata: dupMetadata,
                sections,
                questionCount: sections.reduce((sum, s) => sum + s.questions.length, 0),
                totalPoints: sections.reduce((sum, s) => sum + s.totalPoints, 0),
            } as any);

            toast.success(`Created draft copy "${dupMetadata.title}".`);
            if (onDuplicateCreated) {
                onDuplicateCreated(newDraftId);
            } else {
                setDraftId(newDraftId);
                setPublishedTestId(null);
                setIsDirty(false);
            }
        }
    }, [metadata, onDuplicateCreated, sections, user]);

    if (draftLoading) {
        return (
            <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem' }}>
                <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                    <div style={{
                        width: 48, height: 48, margin: '0 auto 1rem',
                        border: '4px solid rgba(139,92,246,0.2)',
                        borderTop: '4px solid #8b5cf6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <p style={{ color: '#64748b' }}>Loading draft...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (draftError) {
        return (
            <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem' }}>
                <div role="alert" style={{ padding: '1rem', border: '1px solid #fca5a5', borderRadius: '0.5rem', background: '#fef2f2', color: '#991b1b' }}>
                    <strong>Error Loading Draft</strong> — {draftError}
                </div>
            </div>
        );
    }

    // ─── Save Status ────────────────────────────────────────────
    const saveStatusText = isSaving
        ? 'Saving...'
        : lastSavedAt
            ? `Saved ${lastSavedAt.toLocaleTimeString()}`
            : isDirty
                ? 'Unsaved changes'
                : '';

    const missingVisualImageQuestions = getMissingVisualQuestionImages(sections);
    const isStep1MetadataGuardActive = currentStep === 0 && setupMode === 'options' && metadataErrors.length > 0;
    const isStep2ImageGuardActive = currentStep === 1 && missingVisualImageQuestions.length > 0;
    const missingVisualImageSummary = formatMissingImageSummary(missingVisualImageQuestions);

    // ─── Step Navigation ────────────────────────────────────────
    const isEditMode = !!initialDraftId;

    const guardStep1Metadata = () => {
        if (metadataErrors.length === 0) return true;
        trackAction('thcsSetupValidationBlocked', { missingFields: metadataErrors });
        toast.warning(`Complete the required setup fields before continuing: ${metadataErrors.join(' ')}`);
        return false;
    };

    const guardStep2MissingVisualImages = () => {
        if (missingVisualImageQuestions.length === 0) return true;

        const summary = formatMissingImageSummary(missingVisualImageQuestions);

        toast.warning(`Add an image or visual text alternative before leaving Step 2. Missing: ${summary}.`);

        console.warn(`[THCS Step2 Guard] Blocked navigation due to missing visual prompts: ${summary}`);

        return false;
    };

    const handleNext = () => {
        if (currentStep === 0 && !guardStep1Metadata()) return;
        if (currentStep === 1 && !guardStep2MissingVisualImages()) return;
        trackAction('thcsWizardStepChanged', { step: currentStep + 1 });
        if (currentStep < 3) setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        trackAction('thcsWizardStepChanged', { step: currentStep - 1 });
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    const handleStepChange = (step: number) => {
        if (isEditMode || step <= currentStep) {
            if (currentStep === 0 && step > 0 && !guardStep1Metadata()) return;
            if (currentStep === 1 && step > 1 && !guardStep2MissingVisualImages()) return;
            if (isPasteProcessing || parsedPasteData) return;
            trackAction('thcsWizardStepChanged', { step });
            setCurrentStep(step);
        }
    };

    const renderPasteTextStep = () => {
        if (parsedPasteData) {
            const discardDraft = resolveThcsImportAttention(parsedPasteData, pasteTextContent, 'discard');
            return <THCSImportAttentionPanel
                canDiscard={discardDraft.sections.some((section) => section.questions.length > 0)}
                resolution={importResolution}
                onResolutionChange={(resolution) => {
                    trackAction('thcsImportResolutionSelected', { resolution });
                    setImportResolution(resolution);
                }}
            />;
        }
        return (
            <div className="thcs-import">
                <h2>Paste Test</h2>
                <div className="thcs-import__card" aria-busy={isPasteProcessing}>
                    <div className="thcs-import__prompt">
                        <Button variant="glass" onClick={handleCopyExtractionPrompt} disabled={isPasteProcessing}
                            title="Copies the extraction prompt used to prepare source images or documents before pasting the result here.">
                            Copy extraction prompt
                        </Button>
                    </div>
                    <textarea aria-label="Test source" value={pasteTextContent} disabled={isPasteProcessing}
                        onChange={(event) => { setPasteTextContent(event.target.value); setIsDirty(true); }}
                        placeholder="Paste extracted test text here…" />
                    {isPasteProcessing && <div className="thcs-import__pending" role="status">Parsing…</div>}
                    {pasteErrorMessage && <p role="alert" className="thcs-import__error">{pasteErrorMessage}</p>}
                </div>
            </div>
        );
    };
    // ─── Render Active Step ─────────────────────────────────────
    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return setupMode === 'paste'
                    ? renderPasteTextStep()
                    : (
                        <THCSSetupStep
                            onAction={trackAction}
                            metadata={metadata}
                            isPublic={isPublic}
                            isEditMode={isEditMode}
                            onMetadataChange={handleMetadataChange}
                            onIsPublicChange={handleIsPublicChange}
                            onTemplateSelect={(template) => {
                                if (guardStep1Metadata()) handleTemplateSelect(template);
                            }}
                            onStartPasteText={() => {
                                if (guardStep1Metadata()) handleStartPasteText();
                            }}
                            onStartBlank={() => {
                                if (!guardStep1Metadata()) return;
                                trackAction('thcsStartBlank');
                                resetPasteFlow();
                                setCurrentStep(1);
                            }}
                        />
                    );
            case 1:
                return (
                    <THCSQuestionsStep
                        sections={sections}
                        draftId={draftId}
                        onSectionUpdate={handleSectionUpdate}
                        onSectionDelete={handleSectionDelete}
                        onSectionMove={handleSectionMove}
                        onAddSection={handleAddSection}
                        onTrackAction={trackAction}
                        onReorder={(newSections) => {
                            setSections(newSections);
                            setIsDirty(true);
                        }}
                    />
                );
            case 2:
                return (
                    <THCSAnswerKeyStep
                        sections={sections}
                        onUpdateAnswer={handleAnswerKeyUpdate}
                        onUpdateFillInAnswers={handleFillInAnswerUpdate}
                        onUpdateModelAnswers={handleModelAnswerUpdate}
                        onUpdateClozeMapping={handleClozeMappingUpdate}
                    />
                );
            case 3:
                return (
                    <THCSReviewStep
                        metadata={metadata}
                        sections={sections}
                        isPublic={isPublic}
                        errors={errors}
                        warnings={warnings}
                        isValid={isValid}
                        isPublishing={isPublishing}
                        publishedTestId={publishedTestId}
                        draftId={draftId}
                        userId={user?.uid || ''}
                        showPublishWarnings={showPublishWarnings}
                        onPublish={handlePublish}
                        onSaveDraft={handleSaveDraft}
                        onDuplicate={handleDuplicate}
                        onSetShowPublishWarnings={setShowPublishWarnings}
                        onIsPublicChange={handleIsPublicChange}
                    />
                );
            default:
                return null;
        }
    };

    // ─── Footer Navigation ──────────────────────────────────────
    // Step-specific labels matching mockup exactly:
    //   Step 0: Cancel | Next: Questions →
    //   Step 1: ← Back: Setup | Save Draft | Next: Answer Key →
    //   Step 2: ← Back: Questions | Next: Review →
    //   Step 3: ← Back: Answer Key (no Next — actions in step)
    const stepBackLabels = ['', '← Back: Setup', '← Back: Build Test', '← Back: Answer Key'];
    const stepNextLabels = ['Next: Build Test →', 'Next: Answer Key →', 'Next: Review →', ''];

    const renderFooter = () => (
        <>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                {currentStep === 0 ? (
                    setupMode === 'paste' ? (
                        <Button
                            variant="glass"
                            disabled={isPasteProcessing}
                            onClick={parsedPasteData ? handleBackToPasteEditor : handleBackFromPasteSetup}
                        >
                            {parsedPasteData ? '← Back: Paste Test' : '← Back: Setup'}
                        </Button>
                    ) : (
                        <Button variant="glass" onClick={onExit}>Cancel</Button>
                    )
                ) : (
                    <Button variant="glass" onClick={handleBack}>{stepBackLabels[currentStep]}</Button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {currentStep === 0 && setupMode === 'paste' && (
                        parsedPasteData ? (
                            <Button
                                variant="primary"
                                onClick={() => { trackAction('thcsImportResolved', { resolution: importResolution }); handleParsedProceed(parsedPasteData, importResolution); }}
                            >
                                Continue to Studio →
                            </Button>
                        ) : (
                            <Button
                                variant="primary"
                                onClick={handlePasteParse}
                                disabled={!pasteTextContent.trim() || isPasteProcessing}
                            >
                                {isPasteProcessing ? 'Parsing…' : 'Parse Test'}
                            </Button>
                        )
                    )}
                    {/* Save Draft on Step 1 per mockup */}
                    {setupMode !== 'paste' && currentStep === 1 && (
                        <Button variant="glass" onClick={handleSaveDraft}>Save Draft</Button>
                    )}

                    {/* Preview button on Steps 1 and 2 (Amendment G4) */}
                    {setupMode !== 'paste' && (currentStep === 1 || currentStep === 2) && (
                        <Button variant="glass" onClick={() => { trackAction('thcsPreviewOpened'); setShowPreview(true); }}>👁️ Preview</Button>
                    )}

                    {setupMode !== 'paste' && currentStep < 3 && (
                        <Button
                            variant="primary"
                            onClick={handleNext}
                            disabled={isStep1MetadataGuardActive || isStep2ImageGuardActive}
                            title={isStep1MetadataGuardActive
                                ? 'Complete the required setup fields before continuing.'
                                : isStep2ImageGuardActive
                                    ? 'Add an image or visual text alternative before continuing.'
                                    : undefined}
                        >
                            {stepNextLabels[currentStep]}
                        </Button>
                    )}
                </div>

                {isStep1MetadataGuardActive && (
                    <div role="status" style={{
                        maxWidth: '420px',
                        fontSize: '0.75rem',
                        lineHeight: 1.45,
                        color: '#92400e',
                        background: '#fffbeb',
                        border: '1px solid #fcd34d',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 0.625rem',
                    }}>
                        <strong>Complete the required setup fields before continuing.</strong>
                        <div>{metadataErrors.join(' ')}</div>
                    </div>
                )}

                {isStep2ImageGuardActive && (
                    <div style={{
                        maxWidth: '420px',
                        fontSize: '0.75rem',
                        lineHeight: 1.45,
                        color: '#92400e',
                        background: '#fffbeb',
                        border: '1px solid #fcd34d',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 0.625rem',
                    }}>
                        <strong>Step 2 is blocked until each visual prompt has an image or text alternative.</strong>
                        <div>Missing: {missingVisualImageSummary}.</div>
                        <div>Use <strong>Add Image</strong>, <strong>Paste screenshot</strong>, or the visual text field inside each question card.</div>
                    </div>
                )}
            </div>
        </>
    );

    // ═══════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════

    return (
        <>
            <THCSWizardLayout
                currentStep={displayStep}
                contentKey={currentStep === 0 ? setupMode + Boolean(parsedPasteData) : currentStep}
                isEditMode={isEditMode}
                onStepChange={handleStepChange}
                saveStatusText={saveStatusText}
                footer={renderFooter()}
                presentation={presentation}
                steps={activeWizardSteps}
            >
                {/* AI Maintenance Banner */}
                <AIMaintenanceBanner />

                {/* Responsive warning */}
                {isMobile && (
                    <div role="status" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', border: '1px solid #fcd34d', borderRadius: '0.5rem', background: '#fffbeb', color: '#92400e' }}>
                        ⚠️{' '}
                        This editor works best on desktop. Please use a larger screen for the best experience.
                    </div>
                )}

                {saveError && (
                    <div role="alert" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', border: '1px solid #fca5a5', borderRadius: '0.5rem', background: '#fef2f2', color: '#991b1b' }}>
                        Save error: {saveError}
                    </div>
                )}

                {renderStep()}
            </THCSWizardLayout>

            {/* Preview overlay — accessible from Steps 2 & 3 footer */}
            {showPreview && (
                <THCSPreviewOverlay
                    sections={sections}
                    metadata={metadata}
                    onClose={() => setShowPreview(false)}
                />
            )}
        </>
    );
}

export default function THCSTestEditorPage() {
    const { draftId } = useParams<{ draftId?: string }>();
    const navigate = useNavigate();

    return (
        <THCSTestEditorSurface
            initialDraftId={draftId}
            presentation="page"
            onExit={() => navigate(buildRoute('LOBBY'), { replace: true })}
            onPublished={() => navigate(buildRoute('LOBBY'), { replace: true })}
            onDraftCreated={(newDraftId) => navigate(buildRoute('TEACHER_THCS_EDIT', { draftId: newDraftId }), { replace: true })}
            onDuplicateCreated={(newDraftId) => navigate(buildRoute('TEACHER_THCS_EDIT', { draftId: newDraftId }))}
        />
    );
}
