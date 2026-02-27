/**
 * TestReviewPage.tsx
 * 
 * Page for reviewing and editing test drafts before publishing.
 * Part of the Test Creation Modal flow (PRD-0022).
 * 
 * Route: /teacher/test/review/:draftId
 * 
 * Features:
 * - Loads draft from Firebase by draftId parameter
 * - Displays ParseReviewPanel for editing passages/questions
 * - Auto-save functionality with debounce (Task 5.4)
 * - Publishing: Draft → Test conversion with visibility control (Task 6.1-6.5)
 * - Loading and error states
 * - Ownership validation (Task 7.2-7.4)
 * - beforeunload warning for unsaved changes (Task 3.14)
 * 
 * @module TestReviewPage
 * @version 1.0.0
 * @date 2026-02-07
 * @see PRD-0022 Section 4.4 Review Phase
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container,
    Title,
    Text,
    Group,
    Stack,
    Paper,
    Button,
    Loader,
    Badge,
    Breadcrumbs,
    Anchor,
    Tabs,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconArrowLeft,
    IconClock,
    IconCloudCheck,
    IconEdit,
    IconLoader,
    IconUpload,
    IconWorld,
    IconLock,
} from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';
import { testDraftService } from '../services/draftCloudService';
import { saveTestToFirebase, type TestMetadata } from '../services/testStorage';
import type { Passage as StoragePassage, ParsedQuestion as StorageQuestion } from '../types/document.types';
import {
    ParseReviewPanel,
    type ParsedQuestion as ReviewParsedQuestion,
    type ParsedPassage as ReviewParsedPassage,
} from '../components/test-creation/ParseReviewPanel';
import { UncertainItemsSidebar } from '../components/test-creation/UncertainItemsSidebar';
import { CompletionChecklist, type CompletenessCheck } from '../components/test-creation/CompletionChecklist';
import { AnswerKeyModal } from '../components/test-creation/AnswerKeyModal';
import type { UncertainItem } from '../services/test-creation/validator.service';
import { ROUTES } from '../constants/routes';
import type { DraftDocument } from '../types/draft.types';
import { useDraftAutoSave } from '../hooks/useDraftAutoSave';
import auditService from '../services/auditService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PageState {
    loading: boolean;
    error: string | null;
    accessDenied: boolean;
    draft: DraftDocument | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full-page loading spinner
 */
const LoadingState: React.FC = () => (
    <Container size="sm" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper p="xl" radius="lg" withBorder style={{ textAlign: 'center', minWidth: 300 }}>
            <Stack align="center" gap="md">
                <Loader size="lg" color="violet" />
                <Title order={3}>Loading Draft...</Title>
                <Text size="sm" c="dimmed">
                    Fetching your test draft from the cloud
                </Text>
            </Stack>
        </Paper>
    </Container>
);

/**
 * Error display component
 */
const ErrorState: React.FC<{ error: string; onRetry: () => void; onBack: () => void }> = ({
    error,
    onRetry,
    onBack,
}) => (
    <Container size="sm" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper p="xl" radius="lg" withBorder style={{ textAlign: 'center', minWidth: 400 }}>
            <Stack align="center" gap="md">
                <IconAlertTriangle size={64} color="var(--mantine-color-orange-6)" />
                <Title order={3}>Failed to Load Draft</Title>
                <Text size="sm" c="dimmed" maw={350}>
                    {error}
                </Text>
                <Group gap="md" mt="md">
                    <Button variant="light" leftSection={<IconArrowLeft size={18} />} onClick={onBack}>
                        Go Back
                    </Button>
                    <Button variant="filled" onClick={onRetry}>
                        Try Again
                    </Button>
                </Group>
            </Stack>
        </Paper>
    </Container>
);

/**
 * Header component with draft info and save status
 */
interface ReviewHeaderProps {
    draft: DraftDocument;
    isSaving: boolean;
    isPublishing: boolean;
    lastSaved: Date | null;
    hasUnsavedChanges: boolean;
    isPublic: boolean;
    isSuperAdmin: boolean;
    canPublish: boolean;
    onTogglePublic: () => void;
    onPublish: () => void;
    onBack: () => void;
}

const ReviewHeader: React.FC<ReviewHeaderProps> = ({
    draft,
    isSaving,
    isPublishing,
    lastSaved,
    hasUnsavedChanges,
    isPublic,
    isSuperAdmin,
    canPublish,
    onTogglePublic,
    onPublish,
    onBack,
}) => {
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <Paper
            p="md"
            mb="md"
            radius="md"
            withBorder
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: 'var(--mantine-color-body)',
            }}
        >
            <Group justify="space-between" wrap="nowrap">
                {/* Left: Breadcrumbs and Title */}
                <Stack gap="xs">
                    <Breadcrumbs separator="→" fz="sm">
                        <Anchor size="sm" onClick={onBack} style={{ cursor: 'pointer' }}>
                            Materials
                        </Anchor>
                        <Text size="sm" c="dimmed">Review Draft</Text>
                    </Breadcrumbs>
                    <Group gap="sm">
                        <Title order={4}>{draft.metadata.title || 'Untitled Draft'}</Title>
                        <Badge color="violet" size="sm" variant="light">
                            {draft.testType} {draft.skillType}
                        </Badge>
                        <Badge color="gray" size="sm" variant="light">
                            <Group gap={4}>
                                <IconClock size={12} />
                                {draft.metadata.duration} min
                            </Group>
                        </Badge>
                    </Group>
                </Stack>

                {/* Right: Save status and actions */}
                <Group gap="md" wrap="nowrap">
                    {/* Save Status */}
                    <Group gap={6}>
                        {isSaving ? (
                            <>
                                <IconLoader size={16} className="animate-spin" style={{ color: 'var(--mantine-color-blue-6)' }} />
                                <Text size="xs" c="blue">Saving...</Text>
                            </>
                        ) : hasUnsavedChanges ? (
                            <>
                                <IconEdit size={16} style={{ color: 'var(--mantine-color-orange-6)' }} />
                                <Text size="xs" c="orange">Unsaved changes</Text>
                            </>
                        ) : lastSaved ? (
                            <>
                                <IconCloudCheck size={16} style={{ color: 'var(--mantine-color-green-6)' }} />
                                <Text size="xs" c="green">Saved at {formatTime(lastSaved)}</Text>
                            </>
                        ) : null}
                    </Group>

                    {/* Visibility Toggle - Super Admin only */}
                    {isSuperAdmin && (
                        <Button
                            variant={isPublic ? 'light' : 'subtle'}
                            color={isPublic ? 'green' : 'gray'}
                            size="sm"
                            leftSection={isPublic ? <IconWorld size={16} /> : <IconLock size={16} />}
                            onClick={onTogglePublic}
                            disabled={isPublishing}
                            aria-label={isPublic ? 'Visibility: Public. Click to make private' : 'Visibility: Private. Click to make public'}
                        >
                            {isPublic ? 'Public' : 'Private'}
                        </Button>
                    )}

                    {/* Actions */}
                    <Button variant="light" size="sm" onClick={onBack} disabled={isPublishing}>
                        Exit
                    </Button>
                    <Button
                        variant="gradient"
                        gradient={{ from: 'violet', to: 'indigo', deg: 135 }}
                        size="sm"
                        leftSection={isPublishing ? <IconLoader size={16} className="animate-spin" /> : <IconUpload size={16} />}
                        onClick={onPublish}
                        disabled={isSaving || isPublishing || !canPublish}
                        loading={isPublishing}
                        aria-label={!canPublish ? 'Publish Test (disabled: complete all requirements first)' : 'Publish Test'}
                    >
                        {isPublishing ? 'Publishing...' : 'Publish Test'}
                    </Button>
                </Group>
            </Group>
        </Paper>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const TestReviewPage: React.FC = () => {
    const { draftId } = useParams<{ draftId: string }>();
    const navigate = useNavigate();
    const { user, profile } = useAuth();

    // Page state
    const [state, setState] = useState<PageState>({
        loading: true,
        error: null,
        accessDenied: false,
        draft: null,
    });

    // Local editing state (for passages/questions changes before auto-save)
    const [localPassages, setLocalPassages] = useState<ReviewParsedPassage[]>([]);
    const [localQuestions, setLocalQuestions] = useState<ReviewParsedQuestion[]>([]);
    const [localSectionInstructions, setLocalSectionInstructions] = useState<DraftDocument['sectionInstructions']>({});

    // Auto-save hook - handles debounced saves, periodic saves, and before-unload saves
    const {
        isSaving,
        lastSaved,
        save: triggerSave,
    } = useDraftAutoSave({
        draftId: draftId || '',
        enabled: !!draftId && !!state.draft,
        debounceDelay: 2000,
        autoSaveInterval: 30000,
    });

    // Track unsaved changes by comparing local state to saved state
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Publishing state
    const [isPublishing, setIsPublishing] = useState(false);

    // Visibility toggle (Task 6.4-6.5)
    // Default: false for regular teachers, can be toggled by super_admins
    const [isPublic, setIsPublic] = useState(false);
    const isSuperAdmin = profile?.role === 'super_admin';

    // Review state (parity with TestCreationPage)
    const [highlightedQuestion, setHighlightedQuestion] = useState<number | undefined>();
    const [answerKeyModalOpen, setAnswerKeyModalOpen] = useState(false);
    const [dismissedItemIds, setDismissedItemIds] = useState<Set<string>>(new Set());
    const [resolvedItemIds, setResolvedItemIds] = useState<Set<string>>(new Set());

    // ─────────────────────────────────────────────────────────────────────────
    // Load Draft on Mount
    // ─────────────────────────────────────────────────────────────────────────

    const loadDraft = useCallback(async () => {
        if (!draftId) {
            setState(prev => ({ ...prev, loading: false, error: 'No draft ID provided' }));
            return;
        }

        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const result = await testDraftService.loadDraft(draftId);

            if (!result.success || !result.data) {
                setState(prev => ({
                    ...prev,
                    loading: false,
                    error: result.error || 'Draft not found',
                }));
                return;
            }

            const draft = result.data;

            // Ownership check: verify user owns this draft (or is super_admin)
            // This will be enhanced with useOwnershipCheck hook in Task 7.2
            if (user && draft.userId !== user.uid && profile?.role !== 'super_admin') {
                setState(prev => ({
                    ...prev,
                    loading: false,
                    accessDenied: true,
                    error: 'You do not have permission to access this draft',
                }));
                return;
            }

            // Set draft and local state
            setState(prev => ({
                ...prev,
                loading: false,
                error: null,
                draft,
            }));
            // Map passages to ReviewParsedPassage format
            setLocalPassages((draft.passages || []).map(p => ({
                id: p.id,
                title: p.title,
                content: p.content,
            })));

            // Map questions to ReviewParsedQuestion format (adding required 'uncertain' field)
            // Note: Legacy 'completion' and 'matching' types are mapped to more specific types
            setLocalQuestions((draft.questions || []).map(q => {
                // Map legacy types to specific types
                let mappedType = q.type;
                if (mappedType === 'completion') mappedType = 'sentence-completion';
                if (mappedType === 'matching') mappedType = 'matching-headings';

                return {
                    questionNumber: q.questionNumber,
                    questionText: q.questionText || q.question || '',
                    type: mappedType as ReviewParsedQuestion['type'],
                    options: q.options || null,
                    answer: q.answer,
                    passageId: q.passageId,
                    sectionInstructionId: q.sectionInstructionId,
                    wordLimit: q.wordLimit,
                    confidence: q.confidence ?? 100,
                    uncertain: false, // Default to false for loaded drafts
                };
            }));

            setLocalSectionInstructions(draft.sectionInstructions || {});
        } catch (error) {
            console.error('Failed to load draft:', error);
            setState(prev => ({
                ...prev,
                loading: false,
                error: error instanceof Error ? error.message : 'Failed to load draft',
            }));
        }
    }, [draftId, user, profile?.role]);

    useEffect(() => {
        loadDraft();
    }, [loadDraft]);

    // ─────────────────────────────────────────────────────────────────────────
    // beforeunload Warning
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // ─────────────────────────────────────────────────────────────────────────
    // Handlers
    // ─────────────────────────────────────────────────────────────────────────

    const handlePassageChange = useCallback((passageId: string, updates: Partial<ReviewParsedPassage>) => {
        setLocalPassages(prev => {
            const updated = prev.map(p => (p.id === passageId ? { ...p, ...updates } : p));
            // Trigger auto-save with updated passages (cast to any for partial update)
            triggerSave({ passages: updated as any });
            return updated;
        });
        setHasUnsavedChanges(true);
    }, [triggerSave]);

    const handleQuestionChange = useCallback((questionNumber: number, updates: Partial<ReviewParsedQuestion>) => {
        setLocalQuestions(prev => {
            const updated = prev.map(q => (q.questionNumber === questionNumber ? { ...q, ...updates } : q));
            // Trigger auto-save with updated questions (cast to any for partial update)
            triggerSave({ questions: updated as any });
            return updated;
        });
        setHasUnsavedChanges(true);
    }, [triggerSave]);

    const handleSectionInstructionChange = useCallback((instructionId: string, updates: Partial<{ text: string; wordLimit?: number; allowReuse?: boolean }>) => {
        setLocalSectionInstructions(prev => {
            const updated = { ...prev, [instructionId]: updates.text ?? prev[instructionId] ?? '' };
            triggerSave({ sectionInstructions: updated });
            return updated;
        });
        if (updates.wordLimit !== undefined) {
            setLocalQuestions(prev => {
                const updated = prev.map(q => q.sectionInstructionId === instructionId || q.passageId === instructionId ? { ...q, wordLimit: updates.wordLimit } : q);
                triggerSave({ questions: updated as any });
                return updated;
            });
        }
        setHasUnsavedChanges(true);
    }, [triggerSave]);

    const handleQuestionDelete = useCallback((questionNumber: number) => {
        setLocalQuestions(prev => {
            const updated = prev.filter(q => q.questionNumber !== questionNumber);
            triggerSave({ questions: updated as any });
            return updated;
        });
        setHasUnsavedChanges(true);
    }, [triggerSave]);

    const handleQuestionAdd = useCallback((passageId?: string) => {
        setLocalQuestions(prev => {
            const maxNum = Math.max(0, ...prev.map(q => q.questionNumber));
            const newQuestion: ReviewParsedQuestion = {
                questionNumber: maxNum + 1,
                questionText: '',
                type: 'multiple-choice',
                options: ['A', 'B', 'C', 'D'],
                answer: undefined,
                passageId: passageId || localPassages[0]?.id || 'default',
                confidence: 100,
                uncertain: false,
            };
            const updated = [...prev, newQuestion];
            triggerSave({ questions: updated as any });
            setHighlightedQuestion(newQuestion.questionNumber);
            return updated;
        });
        setHasUnsavedChanges(true);
    }, [triggerSave, localPassages]);

    const handleDiagramUpload = useCallback((questionNumber: number, file: File) => {
        const url = URL.createObjectURL(file);
        handleQuestionChange(questionNumber, { diagramImage: url } as any);
    }, [handleQuestionChange]);

    const handleItemClick = useCallback((questionNumber: number) => {
        setHighlightedQuestion(questionNumber);
        document.getElementById(`question-${questionNumber}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }, []);

    const handleItemResolve = useCallback((itemId: string) => {
        setResolvedItemIds(prev => new Set([...prev, itemId]));
    }, []);

    const handleItemDismiss = useCallback((itemId: string) => {
        setDismissedItemIds(prev => new Set([...prev, itemId]));
    }, []);

    const handleQuestionClick = useCallback((questionNumber: number) => {
        setHighlightedQuestion(questionNumber);
    }, []);

    const handleSaveDraft = useCallback(() => {
        triggerSave({ questions: localQuestions as any, passages: localPassages as any });
    }, [triggerSave, localQuestions, localPassages]);

    // Role-aware navigation: teachers -> lobby, super_admin -> admin materials
    const backRoute = profile?.role === 'super_admin' ? ROUTES.ADMIN_MATERIALS : ROUTES.LOBBY;

    const handleBack = useCallback(() => {
        if (hasUnsavedChanges) {
            const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
            if (!confirmed) return;
        }
        navigate(backRoute);
    }, [navigate, hasUnsavedChanges, backRoute]);

    const handlePublish = useCallback(async () => {
        if (!state.draft || !draftId || !user) return;

        const draft = state.draft;

        // Double-check missing answers using local questions (not stale draft data)
        const missingAnswers = localQuestions.filter(q =>
            !q.answer || (typeof q.answer === 'string' ? q.answer.trim() === '' : Array.isArray(q.answer) && q.answer.length === 0)
        );
        if (missingAnswers.length > 0) {
            return;
        }

        // Confirm publish
        const confirmed = window.confirm(
            `Are you sure you want to publish this test?\n\n` +
            `Title: ${draft.metadata.title || 'Untitled'}\n` +
            `Questions: ${localQuestions.length}\n` +
            `Visibility: ${isPublic ? '🌐 Public (visible to all teachers)' : '🔒 Private (only you)'}\n\n` +
            `This will make the test available for students to take.`
        );
        if (!confirmed) return;

        setIsPublishing(true);

        try {
            // 1. Prepare metadata from draft
            const metadata: TestMetadata = {
                title: draft.metadata.title || 'Untitled Test',
                type: (draft.testType as TestMetadata['type']) || 'Custom',
                skill: (draft.skillType === 'reading' ? 'Reading' :
                    draft.skillType === 'listening' ? 'Listening' :
                        draft.skillType === 'writing' ? 'Writing' :
                            draft.skillType === 'speaking' ? 'Speaking' : 'Mixed') as TestMetadata['skill'],
                duration: draft.metadata.duration || 60,
                difficulty: (draft.metadata.difficulty as TestMetadata['difficulty']) || 'Intermediate',
                description: draft.metadata.description || `${draft.testType} ${draft.skillType} test with ${draft.questionCount} questions`,
                tags: [draft.testType, draft.skillType].filter(Boolean),
                targetBand: draft.metadata.targetBand,
            };

            // 2. Transform passages to storage format
            const storagePassages: StoragePassage[] = localPassages.map((p, index) => {
                const passageQuestions = localQuestions.filter(q => q.passageId === p.id);
                const questionNumbers = passageQuestions.map(q => q.questionNumber || 0).filter(n => n > 0);
                const qStart = questionNumbers.length > 0 ? Math.min(...questionNumbers) : (index * 13) + 1;
                const qEnd = questionNumbers.length > 0 ? Math.max(...questionNumbers) : qStart + 12;

                return {
                    id: p.id,
                    title: p.title || `Passage ${index + 1}`,
                    content: p.content || '',
                    type: 'text' as const,
                    wordCount: (p.content || '').split(/\s+/).filter(Boolean).length,
                    questionStart: qStart,
                    questionEnd: qEnd,
                    createdAt: new Date().toISOString(),
                };
            });

            // 3. Transform questions to storage format
            const storageQuestions: StorageQuestion[] = localQuestions.map((q) => ({
                id: `q-${q.questionNumber}`,
                number: q.questionNumber,
                questionNumber: q.questionNumber,
                questionText: q.questionText || '',
                question: q.questionText || '',
                type: q.type,
                options: q.options || [],
                answer: q.answer || '',
                answerSource: 'ai-suggestion' as const,
                passageId: q.passageId || storagePassages[0]?.id || 'default',
                confidence: q.confidence || 80,
                points: 1,
                wordLimit: q.wordLimit,
            }));

            // 4. Save test to Firebase
            console.log('📤 [TestReviewPage] Publishing draft as test...', {
                draftId,
                title: metadata.title,
                passageCount: storagePassages.length,
                questionCount: storageQuestions.length,
                isPublic,
            });

            const result = await saveTestToFirebase(
                metadata,
                storagePassages,
                storageQuestions,
                user.uid,          // createdBy
                undefined,         // materialLink
                user.uid,          // ownerId
                isPublic           // isPublic (Task 6.5: false by default, super_admin can toggle)
            );

            if (!result.success || !result.testId) {
                throw new Error(result.error || 'Failed to publish test');
            }

            console.log('✅ [TestReviewPage] Test published:', result.testId);

            // 5. Delete draft after successful publish (Task 6.3)
            try {
                await testDraftService.deleteDraft(draftId);
                console.log('🗑️ [TestReviewPage] Draft deleted after publish:', draftId);
            } catch (deleteError) {
                // Non-fatal: test was published, draft cleanup failed
                console.warn('⚠️ [TestReviewPage] Draft cleanup failed (non-fatal):', deleteError);
            }

            // 6. Audit log
            try {
                const userRole = (profile?.role === 'super_admin' ? 'super_admin' : 'teacher') as 'teacher' | 'super_admin';
                auditService.logTestPublished(
                    user.uid,
                    userRole,
                    result.testId,
                    draftId,
                    isPublic
                );
            } catch (auditError) {
                console.warn('⚠️ [TestReviewPage] Audit log failed (non-fatal):', auditError);
            }

            // 7. Clear unsaved changes flag and navigate
            setHasUnsavedChanges(false);
            navigate(backRoute, {
                state: {
                    publishSuccess: true,
                    publishedTestId: result.testId,
                    publishedTitle: metadata.title,
                },
            });

        } catch (error) {
            console.error('❌ [TestReviewPage] Publish error:', error);
            alert(`Failed to publish test: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsPublishing(false);
        }
    }, [state.draft, draftId, user, profile?.role, localPassages, localQuestions, isPublic, navigate]);

    const handleTogglePublic = useCallback(() => {
        setIsPublic(prev => !prev);
    }, []);

    const handleRetry = useCallback(() => {
        loadDraft();
    }, [loadDraft]);

    // ─────────────────────────────────────────────────────────────────────────
    // Memoized Props for ParseReviewPanel
    // ─────────────────────────────────────────────────────────────────────────

    const sectionInstructions = useMemo(() => {
        // Convert Record<string, string> to array format expected by ParseReviewPanel
        return Object.entries(localSectionInstructions).map(([id, text]) => ({
            id,
            text,
            questionRange: { start: 1, end: localQuestions.length },
        }));
    }, [localSectionInstructions, localQuestions.length]);

    // Derive uncertain items from local questions
    const uncertainItems: UncertainItem[] = useMemo(() => {
        const items: UncertainItem[] = [];
        for (const q of localQuestions) {
            const hasAnswer = q.answer && (typeof q.answer === 'string' ? q.answer.trim() !== '' : Array.isArray(q.answer) && q.answer.length > 0);
            if (!hasAnswer) {
                items.push({
                    id: `missing-answer-${q.questionNumber}`,
                    questionNumber: q.questionNumber,
                    type: 'missing_answer',
                    message: `Question ${q.questionNumber}: missing answer key`,
                    severity: 'high',
                    resolved: resolvedItemIds.has(`missing-answer-${q.questionNumber}`),
                });
            }
            if (q.confidence !== undefined && q.confidence < 70) {
                items.push({
                    id: `low-confidence-${q.questionNumber}`,
                    questionNumber: q.questionNumber,
                    type: 'low_confidence',
                    message: `Question ${q.questionNumber} has low confidence (${q.confidence}%)`,
                    severity: q.confidence < 40 ? 'high' : 'medium',
                    resolved: resolvedItemIds.has(`low-confidence-${q.questionNumber}`),
                });
            }
            if (q.type === 'diagram-labeling' && !(q as any).diagramImage) {
                items.push({
                    id: `diagram-${q.questionNumber}`,
                    questionNumber: q.questionNumber,
                    type: 'diagram_question',
                    message: `Question ${q.questionNumber} needs a diagram image`,
                    severity: 'medium',
                    resolved: resolvedItemIds.has(`diagram-${q.questionNumber}`),
                });
            }
        }
        return items.filter(i => !dismissedItemIds.has(i.id));
    }, [localQuestions, resolvedItemIds, dismissedItemIds]);

    // Completeness checks (ported from useTestCreation)
    const completenessChecks: CompletenessCheck[] = useMemo(() => {
        const totalQuestions = localQuestions.length;
        const answeredQuestions = localQuestions.filter(q =>
            q.answer && (typeof q.answer === 'string' ? q.answer.trim() !== '' : Array.isArray(q.answer) && q.answer.length > 0)
        ).length;
        const missingAnswerNums = localQuestions
            .filter(q => !q.answer || (typeof q.answer === 'string' ? q.answer.trim() === '' : Array.isArray(q.answer) && q.answer.length === 0))
            .map(q => `Q${q.questionNumber}`);

        const diagramQuestions = localQuestions.filter(q => q.type === 'diagram-labeling');
        const diagramsWithImages = diagramQuestions.filter(q => !!(q as any).diagramImage).length;

        const unresolvedUncertain = uncertainItems.filter(i => !i.resolved).length;

        const checks: CompletenessCheck[] = [
            {
                id: 'passages',
                label: 'Passages',
                description: localPassages.length > 0 ? 'All passages loaded' : 'At least one passage required',
                status: localPassages.length > 0 ? 'complete' : 'incomplete',
                count: { current: localPassages.length, required: Math.max(1, localPassages.length) },
            },
            {
                id: 'questions',
                label: 'Questions',
                description: totalQuestions > 0 ? `${totalQuestions} questions defined` : 'At least one question required',
                status: totalQuestions > 0 ? 'complete' : 'incomplete',
                count: { current: totalQuestions, required: Math.max(1, totalQuestions) },
            },
            {
                id: 'answers',
                label: 'Answer Key',
                description: answeredQuestions === totalQuestions
                    ? 'All questions have answers'
                    : `${totalQuestions - answeredQuestions} answers missing`,
                status: answeredQuestions === totalQuestions ? 'complete' : answeredQuestions > 0 ? 'warning' : 'incomplete',
                count: { current: answeredQuestions, required: totalQuestions },
                details: missingAnswerNums.length > 0 ? missingAnswerNums : undefined,
            },
        ];

        if (diagramQuestions.length > 0) {
            checks.push({
                id: 'images',
                label: 'Diagram Images',
                description: diagramsWithImages === diagramQuestions.length
                    ? 'All diagrams have images'
                    : `${diagramQuestions.length - diagramsWithImages} images missing`,
                status: diagramsWithImages === diagramQuestions.length ? 'complete' : 'warning',
                count: { current: diagramsWithImages, required: diagramQuestions.length },
            });
        }

        if (unresolvedUncertain > 0) {
            checks.push({
                id: 'review',
                label: 'Review Items',
                description: `${unresolvedUncertain} items need review`,
                status: 'warning',
                count: { current: 0, required: unresolvedUncertain },
            });
        }

        return checks;
    }, [localQuestions, localPassages, uncertainItems]);

    const completenessPercent = useMemo(() => {
        if (completenessChecks.length === 0) return 100;
        const complete = completenessChecks.filter(c => c.status === 'complete').length;
        return Math.round((complete / completenessChecks.length) * 100);
    }, [completenessChecks]);

    const canPublish = useMemo(() => {
        return completenessChecks.every(c => c.status === 'complete' || c.status === 'warning') &&
            localPassages.length > 0 &&
            localQuestions.length > 0;
    }, [completenessChecks, localPassages.length, localQuestions.length]);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    // Loading state
    if (state.loading) {
        return <LoadingState />;
    }

    // Access denied - redirect to AccessDeniedPage
    if (state.accessDenied) {
        navigate('/access-denied', {
            state: {
                from: `/teacher/test/review/${draftId}`,
                reason: 'ownership',
            },
        });
        return null;
    }

    // Error state
    if (state.error || !state.draft) {
        return (
            <ErrorState
                error={state.error || 'Draft not found'}
                onRetry={handleRetry}
                onBack={handleBack}
            />
        );
    }

    const { draft } = state;

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Sticky Header */}
            <ReviewHeader
                draft={draft}
                isSaving={isSaving}
                isPublishing={isPublishing}
                lastSaved={lastSaved}
                hasUnsavedChanges={hasUnsavedChanges}
                isPublic={isPublic}
                isSuperAdmin={isSuperAdmin}
                canPublish={canPublish}
                onTogglePublic={handleTogglePublic}
                onPublish={handlePublish}
                onBack={handleBack}
            />

            {/* Main Content: ParseReviewPanel */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
                <ParseReviewPanel
                    passages={localPassages}
                    questions={localQuestions}
                    sectionInstructions={sectionInstructions}
                    onPassageChange={handlePassageChange}
                    onQuestionChange={handleQuestionChange}
                    onSectionInstructionChange={handleSectionInstructionChange}
                    onQuestionDelete={handleQuestionDelete}
                    onQuestionAdd={handleQuestionAdd}
                    onDiagramUpload={handleDiagramUpload}
                    highlightedQuestion={highlightedQuestion}
                    onQuestionClick={handleQuestionClick}
                    leftSidebarContent={
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            overflow: 'hidden',
                        }}>
                            <Tabs defaultValue="review" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <Tabs.List grow style={{ flexShrink: 0 }}>
                                    <Tabs.Tab
                                        value="review"
                                        leftSection={<span>⚠️</span>}
                                        rightSection={uncertainItems.filter(i => !i.resolved).length > 0 ? (
                                            <Badge size="xs" color="yellow" variant="filled">{uncertainItems.filter(i => !i.resolved).length}</Badge>
                                        ) : null}
                                    >
                                        Need Review
                                    </Tabs.Tab>
                                    <Tabs.Tab
                                        value="publish"
                                        leftSection={<span>✅</span>}
                                    >
                                        Publish
                                    </Tabs.Tab>
                                </Tabs.List>

                                <Tabs.Panel value="review" style={{ flex: 1, overflow: 'auto', paddingTop: '0.5rem' }}>
                                    {uncertainItems.filter(i => !i.resolved).length > 0 ? (
                                        <UncertainItemsSidebar
                                            items={uncertainItems}
                                            onItemClick={handleItemClick}
                                            onItemResolve={handleItemResolve}
                                            onItemDismiss={handleItemDismiss}
                                            selectedItemId={undefined}
                                        />
                                    ) : (
                                        <div style={{
                                            padding: '2rem 1rem',
                                            textAlign: 'center',
                                            color: '#64748b',
                                        }}>
                                            <span style={{ fontSize: '2rem' }}>🎉</span>
                                            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', fontWeight: 600 }}>
                                                All items reviewed!
                                            </p>
                                        </div>
                                    )}
                                </Tabs.Panel>

                                <Tabs.Panel value="publish" style={{ flex: 1, overflow: 'auto', paddingTop: '0.5rem' }}>
                                    <CompletionChecklist
                                        checks={completenessChecks}
                                        completenessPercent={completenessPercent}
                                        canPublish={canPublish}
                                        onPublish={handlePublish}
                                        onSaveDraft={handleSaveDraft}
                                        isPublishing={isPublishing}
                                        onAnswerKeyClick={() => setAnswerKeyModalOpen(true)}
                                    />
                                </Tabs.Panel>
                            </Tabs>
                        </div>
                    }
                />
            </div>

            {/* Answer Key Modal */}
            <AnswerKeyModal
                opened={answerKeyModalOpen}
                onClose={() => setAnswerKeyModalOpen(false)}
                questions={localQuestions.map(q => ({
                    questionNumber: q.questionNumber,
                    questionText: q.questionText,
                    type: q.type,
                    answer: q.answer,
                    options: q.options,
                }))}
                onUpdateAnswer={(questionNumber, answer) => {
                    handleQuestionChange(questionNumber, { answer } as Partial<ReviewParsedQuestion>);
                }}
            />
        </div>
    );
};

export default TestReviewPage;
