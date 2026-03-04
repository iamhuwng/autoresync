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
import { useParams, useNavigate } from 'react-router-dom';
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
import { convertParsedToThcsDraft } from '../services/test-creation/thcsDocumentParser.service';

// Wizard components
import THCSWizardLayout from '../components/thcs-editor/THCSWizardLayout';
import THCSSetupStep from '../components/thcs-editor/THCSSetupStep';
import THCSQuestionsStep from '../components/thcs-editor/THCSQuestionsStep';
import THCSAnswerKeyStep from '../components/thcs-editor/THCSAnswerKeyStep';
import THCSReviewStep from '../components/thcs-editor/THCSReviewStep';

import type { THCSTestMetadata, THCSSection, THCSTest, THCSDraft } from '../types/thcs-test.types';

// ═══════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function THCSTestEditorPage() {
    const { draftId: urlDraftId } = useParams<{ draftId?: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isMobile = useMediaQuery('(max-width: 1023px)');

    // ─── Wizard Step State ──────────────────────────────────────
    const [currentStep, setCurrentStep] = useState(0);

    // ─── Core State ─────────────────────────────────────────────
    const [metadata, setMetadata] = useState<THCSTestMetadata>(DEFAULT_METADATA);
    const [sections, setSections] = useState<THCSSection[]>([createDefaultSection(0)]);
    const [isPublic, setIsPublic] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [draftId, setDraftId] = useState<string | null>(urlDraftId || null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [showPublishWarnings, setShowPublishWarnings] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [publishedTestId, setPublishedTestId] = useState<string | null>(null);

    // ─── Draft Loading ──────────────────────────────────────────
    const { draft, loading: draftLoading, error: draftError } = useThcsDraft(urlDraftId);

    useEffect(() => {
        if (draft) {
            setMetadata(draft.metadata);
            setSections(draft.sections?.length > 0 ? draft.sections : [createDefaultSection(0)]);
            setDraftId(draft.id || urlDraftId || null);
            setPublishedTestId((draft as THCSDraft & { publishedTestId?: string }).publishedTestId || null);
            setIsDirty(false);
        }
    }, [draft, urlDraftId]);

    // Phase 3 Task 7.5: Handle template selection
    const handleTemplateSelect = useCallback((template: any) => {
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
    }, []);

    const handleParsedProceed = useCallback((finalParsed: any) => {
        try {
            const draft = convertParsedToThcsDraft(finalParsed);
            setMetadata({ ...DEFAULT_METADATA, ...draft.metadata } as THCSTestMetadata);
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
                navigate(`/teacher/thcs-test/edit/${newDraftId}`, { replace: true });
                await saveNow();
                setIsDirty(false);
                notifications.show({ title: '💾 Draft saved', message: 'Your test has been saved.', color: 'green' });
            }
        } else {
            await saveNow();
            setIsDirty(false);
            notifications.show({ title: '💾 Draft saved', message: 'Changes saved.', color: 'green' });
        }
    }, [user, draftId, metadata, saveNow, navigate]);

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
            navigate('/lobby');

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
    }, [user, isValid, warnings, showPublishWarnings, draftId, metadata, sections, isPublic, navigate, publishedTestId]);

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
            navigate(`/teacher/thcs-test/edit/${newDraftId}`);
        }
    }, [user, metadata, sections, navigate]);

    // ─── Loading State ──────────────────────────────────────────
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

    // ─── Step Navigation ────────────────────────────────────────
    const isEditMode = !!urlDraftId;

    const handleNext = () => {
        if (currentStep < 3) setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    const handleStepChange = (step: number) => {
        if (isEditMode || step <= currentStep) {
            setCurrentStep(step);
        }
    };

    // ─── Render Active Step ─────────────────────────────────────
    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return (
                    <THCSSetupStep
                        metadata={metadata}
                        isPublic={isPublic}
                        isEditMode={isEditMode}
                        onMetadataChange={handleMetadataChange}
                        onIsPublicChange={handleIsPublicChange}
                        onTemplateSelect={handleTemplateSelect}
                        onParsedProceed={handleParsedProceed}
                        onStartBlank={() => setCurrentStep(1)}
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
                    <Button variant="glass" onClick={() => navigate('/teacher/thcs-test')}>Cancel</Button>
                ) : (
                    <Button variant="glass" onClick={handleBack}>{stepBackLabels[currentStep]}</Button>
                )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {/* Save Draft on Step 1 per mockup */}
                {currentStep === 1 && (
                    <Button variant="glass" onClick={handleSaveDraft}>Save Draft</Button>
                )}

                {/* Preview button on Steps 1 and 2 (Amendment G4) */}
                {(currentStep === 1 || currentStep === 2) && (
                    <Button variant="glass" onClick={() => setShowPreview(true)}>👁️ Preview</Button>
                )}

                {currentStep < 3 && (
                    <Button variant="primary" onClick={handleNext}>{stepNextLabels[currentStep]}</Button>
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
                currentStep={currentStep}
                isEditMode={isEditMode}
                onStepChange={handleStepChange}
                saveStatusText={saveStatusText}
                footer={renderFooter()}
            >
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
