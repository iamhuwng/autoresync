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
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Container, Alert, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { doc, setDoc, getFirestore } from 'firebase/firestore';

import { useAuth } from '../hooks/useAuth';
import { useThcsDraft } from '../hooks/thcs/useThcsDraft';
import { useThcsAutoSave } from '../hooks/thcs/useThcsAutoSave';
import { useThcsValidation } from '../hooks/thcs/useThcsValidation';

import { createThcsDraft } from '../services/thcsDraftService';
import { generateThcsTestId, saveThcsTestToFirebase } from '../services/thcsTestStorage';
import r2StorageService from '../services/r2Storage';
import { Button } from '../components/modern';
import { THCSPreviewOverlay } from '../components/thcs-editor/THCSPreviewOverlay';
import { THCSParseReviewPanel } from '../components/thcs-editor/THCSParseReviewPanel';
import { convertParsedToThcsDraft, parseThcsText } from '../services/test-creation/thcsDocumentParser.service';
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
    onStepConfigChange?: (steps: WizardStep[]) => void;
}

const DEFAULT_WIZARD_STEPS: WizardStep[] = [
    { label: 'Test Setup', icon: '📋' },
    { label: 'Build Test', icon: '✏️' },
    { label: 'Answer Key', icon: '🔑' },
    { label: 'Review & Publish', icon: '✅' },
];

const PASTE_WIZARD_STEPS: WizardStep[] = [
    { label: 'Test Setup', icon: '📋' },
    { label: 'Paste Text', icon: '📥' },
    { label: 'Answer Key', icon: '🔑' },
    { label: 'Review & Publish', icon: '✅' },
];

function getMissingVisualQuestionImages(sections: THCSSection[]): MissingImageQuestion[] {
    const missing: MissingImageQuestion[] = [];

    sections.forEach((section) => {
        section.questions.forEach((question) => {
            const requiresImage =
                STEP2_ALWAYS_VISUAL_TYPES_REQUIRING_IMAGE.has(question.type) ||
                (question.intent ? STEP2_ALWAYS_VISUAL_TYPES_REQUIRING_IMAGE.has(question.intent) : false) ||
                shouldRequireImageForReadingAnnouncement(section, question);

            if (requiresImage && !question.imageUrl?.trim()) {
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

type ParsedMetadataField = 'title' | 'duration' | 'gradeLevel' | 'examType';
type ParsedMetadataProposal = Partial<Pick<THCSTestMetadata, ParsedMetadataField>>;

export interface ParsedMetadataConflict {
    field: ParsedMetadataField;
    label: string;
    currentValue: string;
    parsedValue: string;
}

const PARSED_METADATA_FIELDS: ParsedMetadataField[] = ['title', 'duration', 'gradeLevel', 'examType'];

const PARSED_METADATA_LABELS: Record<ParsedMetadataField, string> = {
    title: 'Title',
    duration: 'Duration',
    gradeLevel: 'Grade level',
    examType: 'Exam type',
};

function buildParsedMetadataProposal(source: Partial<THCSTestMetadata> | null | undefined): ParsedMetadataProposal | null {
    if (!source) return null;

    const proposal: ParsedMetadataProposal = {};

    if (typeof source.title === 'string' && source.title.trim()) {
        proposal.title = source.title.trim();
    }
    if (typeof source.duration === 'number' && source.duration > 0) {
        proposal.duration = source.duration;
    }
    if (typeof source.gradeLevel === 'number' && source.gradeLevel >= 6 && source.gradeLevel <= 12) {
        proposal.gradeLevel = source.gradeLevel as THCSTestMetadata['gradeLevel'];
    }
    if (typeof source.examType === 'string' && source.examType.trim()) {
        proposal.examType = source.examType.trim();
    }

    return Object.keys(proposal).length > 0 ? proposal : null;
}

function formatMetadataConflictValue(field: ParsedMetadataField, value: THCSTestMetadata[ParsedMetadataField] | undefined): string {
    if (value === null || value === undefined || value === '') {
        return 'Not set';
    }

    if (field === 'duration') {
        return `${value} minutes`;
    }

    return String(value);
}

function getParsedMetadataConflicts(
    currentMetadata: THCSTestMetadata,
    parsedProposal: ParsedMetadataProposal | null
): ParsedMetadataConflict[] {
    if (!parsedProposal) return [];

    return PARSED_METADATA_FIELDS.flatMap((field) => {
        const parsedValue = parsedProposal[field];

        if (parsedValue === undefined) {
            return [];
        }

        const currentValue = currentMetadata[field];
        if (currentValue === parsedValue) {
            return [];
        }

        return [{
            field,
            label: PARSED_METADATA_LABELS[field],
            currentValue: formatMetadataConflictValue(field, currentValue),
            parsedValue: formatMetadataConflictValue(field, parsedValue),
        }];
    });
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

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
    onStepConfigChange,
}: THCSTestEditorSurfaceProps) {
    const { user } = useAuth();
    const isMobile = useMediaQuery('(max-width: 1023px)');

    // ─── Wizard Step State ──────────────────────────────────────
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
    const [reviewedPasteData, setReviewedPasteData] = useState<any>(null);
    const [parsedMetadataProposal, setParsedMetadataProposal] = useState<ParsedMetadataProposal | null>(null);
    const [isPasteProcessing, setIsPasteProcessing] = useState(false);
    const [pasteErrorMessage, setPasteErrorMessage] = useState<string | null>(null);
    const [promptCopied, setPromptCopied] = useState(false);

    // ─── Draft Loading ──────────────────────────────────────────
    const { draft, loading: draftLoading, error: draftError } = useThcsDraft(initialDraftId);

    useEffect(() => {
        if (draft) {
            setMetadata(draft.metadata);
            setSections(draft.sections?.length > 0 ? draft.sections : [createDefaultSection(0)]);
            setDraftId(draft.id || initialDraftId || null);
            setPublishedTestId((draft as THCSDraft & { publishedTestId?: string }).publishedTestId || null);
            setParsedMetadataProposal(null);
            setIsDirty(false);
        }
    }, [draft, initialDraftId]);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const displayStep = currentStep === 0 && setupMode === 'paste' ? 1 : currentStep;
    const activeWizardSteps = currentStep === 0 && setupMode === 'paste'
        ? PASTE_WIZARD_STEPS
        : DEFAULT_WIZARD_STEPS;
    const parsedMetadataConflicts = useMemo(
        () => getParsedMetadataConflicts(metadata, parsedMetadataProposal),
        [metadata, parsedMetadataProposal]
    );

    useEffect(() => {
        onStepChange?.(displayStep);
    }, [displayStep, onStepChange]);

    useEffect(() => {
        onWideLayoutChange?.(currentStep === 1);
    }, [currentStep, onWideLayoutChange]);

    useEffect(() => {
        onStepConfigChange?.(activeWizardSteps);
    }, [activeWizardSteps, onStepConfigChange]);

    const resetPasteFlow = useCallback(() => {
        setSetupMode('options');
        setPasteTextContent('');
        setParsedPasteData(null);
        setReviewedPasteData(null);
        setIsPasteProcessing(false);
        setPasteErrorMessage(null);
        setPromptCopied(false);
    }, []);

    const handleStartPasteText = useCallback(() => {
        setSetupMode('paste');
        setPasteErrorMessage(null);
    }, []);

    const handleBackFromPasteSetup = useCallback(() => {
        resetPasteFlow();
    }, [resetPasteFlow]);

    const handleBackToPasteEditor = useCallback(() => {
        setParsedPasteData(null);
        setReviewedPasteData(null);
        setPasteErrorMessage(null);
    }, []);

    // Phase 3 Task 7.5: Handle template selection
    const handleTemplateSelect = useCallback((template: any) => {
        resetPasteFlow();
        setParsedMetadataProposal(null);
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
        setMetadata(prev => ({
            ...prev,
            gradeLevel: template.gradeLevel,
            duration: template.totalDuration,
            title: prev.title || `${template.name} — New Test`,
        }));
        setIsDirty(true);
        setCurrentStep(1); // Jump to Questions step after applying template
        notifications.show({ color: 'green', title: 'Template Applied', message: `Created ${templateSections.length} sections from template "${template.name}".` });
    }, [resetPasteFlow]);

    const handleParsedProceed = useCallback((finalParsed: any) => {
        try {
            resetPasteFlow();
            const draft = convertParsedToThcsDraft(finalParsed);
            setParsedMetadataProposal(buildParsedMetadataProposal(draft.metadata));
            const normalizedSections: THCSSection[] = (draft.sections || []).map((s: any, idx: number) => ({
                ...createDefaultSection(idx),
                ...s,
                isCustomInstruction: s.isCustomInstruction ?? false,
                layout: s.layout ?? 'single-column',
            }));
            setSections(normalizedSections.length > 0 ? normalizedSections : [createDefaultSection(0)]);
            setIsDirty(true);
            setCurrentStep(1); // Jump to Questions step after import
            const qCount = normalizedSections.reduce((sum, s) => sum + s.questions.length, 0);
            notifications.show({
                color: 'green',
                title: '📄 Document Imported',
                message: `Imported ${normalizedSections.length} sections with ${qCount} questions from document.`,
            });
        } catch (err) {
            console.error('Error converting parsed document:', err);
            notifications.show({ color: 'red', title: 'Import Error', message: 'Failed to convert parsed document to editor format.' });
        }
    }, [resetPasteFlow]);

    const handleApplyParsedMetadata = useCallback(() => {
        if (!parsedMetadataProposal) {
            return;
        }

        setMetadata((prev) => ({ ...prev, ...parsedMetadataProposal }));
        setParsedMetadataProposal(null);
        setIsDirty(true);
    }, [parsedMetadataProposal]);

    const handleDismissParsedMetadataConflicts = useCallback(() => {
        setParsedMetadataProposal(null);
    }, []);

    const handlePasteParse = useCallback(async () => {
        if (!pasteTextContent.trim()) return;

        setIsPasteProcessing(true);
        setPasteErrorMessage(null);

        try {
            const result = await parseThcsText(pasteTextContent);

            if (result.success) {
                setParsedPasteData(result.data);
                setReviewedPasteData(result.data);
            } else {
                setPasteErrorMessage(result.error || 'Parse failed with no error message');
            }
        } catch (err) {
            console.error('[PasteText] Parse exception:', err);
            setPasteErrorMessage(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsPasteProcessing(false);
        }
    }, [pasteTextContent]);

    const handleCopyExtractionPrompt = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(thcsExtractionPrompt);
            setPromptCopied(true);
            setTimeout(() => setPromptCopied(false), 2000);
        } catch {
            notifications.show({ color: 'red', title: 'Copy failed', message: 'Please copy manually' });
        }
    }, []);

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
    const { errors, warnings, isValid } = useThcsValidation({ metadata, sections });

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
                notifications.show({ title: '💾 Draft saved', message: 'Your test has been saved.', color: 'green' });
            }
        } else {
            await saveNow();
            setIsDirty(false);
            notifications.show({ title: '💾 Draft saved', message: 'Changes saved.', color: 'green' });
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
            notifications.show({
                title: '✅ Test published!',
                message: 'Your THCS-THPT test is now available.',
                color: 'green',
            });
            onPublished?.(testId);

        } catch (error) {
            console.error('Publish failed:', error);
            notifications.show({
                title: '❌ Publish failed',
                message: error instanceof Error ? error.message : 'Unknown error',
                color: 'red',
            });
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

            notifications.show({ title: '📋 Duplicated!', message: 'A copy has been created.', color: 'blue' });
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
            <Container size="lg" py="xl">
                <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                    <div style={{
                        width: 48, height: 48, margin: '0 auto 1rem',
                        border: '4px solid rgba(139,92,246,0.2)',
                        borderTop: '4px solid #8b5cf6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <Text c="dimmed">Loading draft...</Text>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </Container>
        );
    }

    if (draftError) {
        return (
            <Container size="lg" py="xl">
                <Alert color="red" title="Error Loading Draft" variant="light">
                    {draftError}
                </Alert>
            </Container>
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
    const isStep2ImageGuardActive = currentStep === 1 && missingVisualImageQuestions.length > 0;
    const missingVisualImageSummary = formatMissingImageSummary(missingVisualImageQuestions);

    // ─── Step Navigation ────────────────────────────────────────
    const isEditMode = !!initialDraftId;

    const guardStep2MissingVisualImages = () => {
        if (missingVisualImageQuestions.length === 0) return true;

        const summary = formatMissingImageSummary(missingVisualImageQuestions);

        notifications.show({
            color: 'yellow',
            title: 'Image required for visual reading questions',
            message: `Please upload image(s) for visual prompt questions (e.g. sign/notice/poster/photo) before leaving Step 2. Missing: ${summary}.`,
        });

        console.warn(`[THCS Step2 Guard] Blocked navigation due to missing images: ${summary}`);

        return false;
    };

    const handleNext = () => {
        if (currentStep === 1 && !guardStep2MissingVisualImages()) return;
        if (currentStep < 3) setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    const handleStepChange = (step: number) => {
        if (isEditMode || step <= currentStep) {
            if (currentStep === 1 && step > 1 && !guardStep2MissingVisualImages()) return;
            setCurrentStep(step);
        }
    };

    const renderPasteTextStep = () => {
        if (parsedPasteData) {
            return (
                <THCSParseReviewPanel
                    parsedTest={parsedPasteData}
                    onBack={handleBackToPasteEditor}
                    onProceed={handleParsedProceed}
                    onChange={setReviewedPasteData}
                    showActions={false}
                />
            );
        }

        const nonEmptyLineCount = pasteTextContent
            ? pasteTextContent.split('\n').filter((line) => line.trim()).length
            : 0;

        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                minHeight: 0,
            }}>
                <div>
                    <Text fw={700} size="lg" style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                        Paste Test Content
                    </Text>
                    <Text size="sm" c="dimmed">
                        Import structured THCS content into the shared creation flow, then continue directly into Questions.
                    </Text>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    background: 'linear-gradient(135deg, #f0f4ff 0%, #ede9fe 100%)',
                    borderRadius: '0.875rem',
                    border: '1px solid rgba(139,92,246,0.15)',
                }}>
                    <span style={{ fontSize: '1.25rem' }}>🤖</span>
                    <div style={{ flex: 1 }}>
                        <Text size="sm" fw={600} style={{ color: '#1e293b' }}>
                            Copy the extraction prompt, run it with your test images, then paste the AI output here.
                        </Text>
                        <Text size="xs" c="dimmed">
                            This keeps the full test-making process inside one modal flow.
                        </Text>
                    </div>
                    <Button variant="primary" onClick={handleCopyExtractionPrompt}>
                        {promptCopied ? 'Copied' : 'Copy Prompt'}
                    </Button>
                </div>

                <textarea
                    value={pasteTextContent}
                    onChange={(e) => setPasteTextContent(e.target.value)}
                    placeholder={`I. MULTIPLE CHOICE QUESTIONS\nMark the letter A, B, C or D...\n\nQuestion 1. We all wanted to ______ in the contest.\nA. take off\nB. take part\nC. take out\nD. take over\n\n...\n\nVI. ANSWER KEY\n1 B\n2 C\n...`}
                    style={{
                        width: '100%',
                        minHeight: '320px',
                        padding: '1rem',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '0.875rem',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                        color: '#1e293b',
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box',
                        lineHeight: 1.6,
                        background: '#fff',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#8b5cf6'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; }}
                />

                {pasteErrorMessage && (
                    <div style={{
                        padding: '0.875rem 1rem',
                        background: '#fee2e2',
                        color: '#b91c1c',
                        borderRadius: '0.75rem',
                        border: '1px solid #f87171',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                    }}>
                        ⚠️ {pasteErrorMessage}
                    </div>
                )}

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                }}>
                    <Text size="xs" c="dimmed">
                        {nonEmptyLineCount > 0 ? `${nonEmptyLineCount} lines ready to parse` : 'Paste content to continue'}
                    </Text>
                    <Text size="xs" c="dimmed">
                        The parser will detect sections, question types, and answer keys.
                    </Text>
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
                            metadata={metadata}
                            isPublic={isPublic}
                            isEditMode={isEditMode}
                            onMetadataChange={handleMetadataChange}
                            onIsPublicChange={handleIsPublicChange}
                            onTemplateSelect={handleTemplateSelect}
                            onStartPasteText={handleStartPasteText}
                            onStartBlank={() => {
                                resetPasteFlow();
                                setParsedMetadataProposal(null);
                                setCurrentStep(1);
                            }}
                        />
                    );
            case 1:
                return (
                    <THCSQuestionsStep
                        sections={sections}
                        draftId={draftId}
                        metadata={metadata}
                        onSectionUpdate={handleSectionUpdate}
                        onSectionDelete={handleSectionDelete}
                        onSectionMove={handleSectionMove}
                        onAddSection={handleAddSection}
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
                        parsedMetadataConflicts={parsedMetadataConflicts}
                        onApplyParsedMetadata={handleApplyParsedMetadata}
                        onDismissParsedMetadataConflicts={handleDismissParsedMetadataConflicts}
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
    const stepBackLabels = ['', '← Back: Setup', '← Back: Questions', '← Back: Answer Key'];
    const stepNextLabels = ['Next: Questions →', 'Next: Answer Key →', 'Next: Review →', ''];

    const renderFooter = () => (
        <>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                {currentStep === 0 ? (
                    setupMode === 'paste' ? (
                        <Button
                            variant="glass"
                            onClick={parsedPasteData ? handleBackToPasteEditor : handleBackFromPasteSetup}
                        >
                            {parsedPasteData ? '← Back: Paste Text' : '← Back: Setup'}
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
                                onClick={() => handleParsedProceed(reviewedPasteData || parsedPasteData)}
                            >
                                Continue to Questions →
                            </Button>
                        ) : (
                            <Button
                                variant="primary"
                                onClick={handlePasteParse}
                                disabled={!pasteTextContent.trim() || isPasteProcessing}
                            >
                                {isPasteProcessing ? 'Parsing...' : 'Parse & Review'}
                            </Button>
                        )
                    )}
                    {/* Save Draft on Step 1 per mockup */}
                    {setupMode !== 'paste' && currentStep === 1 && (
                        <Button variant="glass" onClick={handleSaveDraft}>Save Draft</Button>
                    )}

                    {/* Preview button on Steps 1 and 2 (Amendment G4) */}
                    {setupMode !== 'paste' && (currentStep === 1 || currentStep === 2) && (
                        <Button variant="glass" onClick={() => setShowPreview(true)}>👁️ Preview</Button>
                    )}

                    {setupMode !== 'paste' && currentStep < 3 && (
                        <Button
                            variant="primary"
                            onClick={handleNext}
                            disabled={isStep2ImageGuardActive}
                            title={isStep2ImageGuardActive
                                ? 'Upload images for visual reading questions before continuing.'
                                : undefined}
                        >
                            {stepNextLabels[currentStep]}
                        </Button>
                    )}
                </div>

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
                        <strong>Step 2 is blocked until required visual-prompt images are uploaded.</strong>
                        <div>Missing: {missingVisualImageSummary}.</div>
                        <div>Use the <strong>Add Image</strong> button inside each question card.</div>
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
                    <Alert color="yellow" mb="md" icon="⚠️" variant="light">
                        This editor works best on desktop. Please use a larger screen for the best experience.
                    </Alert>
                )}

                {saveError && (
                    <Alert color="red" mb="md" variant="light">
                        Save error: {saveError}
                    </Alert>
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
