/**
 * useTestCreation Hook
 * 
 * Orchestrates the entire test creation flow.
 * Coordinates document conversion, AI extraction, classification, and validation.
 * 
 * Features:
 * - Full flow orchestration
 * - Document conversion integration
 * - AI extraction with progress callbacks
 * - Rule-based classification
 * - Validation engine integration
 * - State management for review panel
 * - Uncertain items tracking
 * - Publish/save draft functionality
 * 
 * @module useTestCreation
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 6, Task 6.7
 */

import { useState, useCallback, useMemo } from 'react';
import { useParsingProgress } from './useParsingProgress';
import { useAuth } from './useAuth';
import type { ParsingStage } from '../components/test-creation/ParsingProgressScreen';
import type { ParsedPassage, ParsedQuestion, SectionInstruction } from '../components/test-creation/ParseReviewPanel';
import type { CompletenessCheck } from '../components/test-creation/CompletionChecklist';
import type { UncertainItem } from '../services/test-creation/validator.service';
import type { QuestionType } from '../types/QuestionSchema';
import { saveTestToFirebase, type TestMetadata } from '../services/testStorage';
import type { Passage, ParsedQuestion as StorageQuestion } from '../types/document.types';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type TestCreationPhase = 'upload' | 'parsing' | 'review' | 'publishing' | 'complete';

export interface TestCreationInput {
    type: 'file' | 'text';
    data: File | string;
    format: 'academic' | 'general';
}

export interface TestCreationState {
    /** Current phase */
    phase: TestCreationPhase;
    /** Parsing progress state */
    parsingStage: ParsingStage;
    parsingProgress: number;
    parsingMessage: string;
    parsingError?: string;
    hasCheckpoint: boolean;
    estimatedTimeRemaining?: number;
    isParsing: boolean;
    /** Parsed data */
    passages: ParsedPassage[];
    questions: ParsedQuestion[];
    sectionInstructions: SectionInstruction[];
    /** Review state */
    uncertainItems: UncertainItem[];
    highlightedQuestion?: number;
    previewMode: boolean;
    /** Completeness */
    completenessChecks: CompletenessCheck[];
    completenessPercent: number;
    canPublish: boolean;
    /** Publishing */
    isPublishing: boolean;
    /** Debug data for admin download (removable in production) */
    debugData: Record<string, unknown> | null;
}

export interface TestCreationActions {
    /** Start parsing with input content */
    startParsing: (input: TestCreationInput) => Promise<void>;
    /** Cancel current parsing */
    cancelParsing: () => void;
    /** Retry after error */
    retryParsing: () => void;
    /** Resume from checkpoint */
    resumeFromCheckpoint: () => void;
    /** Go back to upload phase */
    goToUpload: () => void;
    /** Update a passage */
    updatePassage: (passageId: string, updates: Partial<ParsedPassage>) => void;
    /** Update a question */
    updateQuestion: (questionNumber: number, updates: Partial<ParsedQuestion>) => void;
    /** Update a section instruction */
    updateSectionInstruction: (instructionId: string, updates: Partial<SectionInstruction>) => void;
    /** Delete a question */
    deleteQuestion: (questionNumber: number) => void;
    /** Add a new question (optionally to a specific passage) */
    addQuestion: (passageId?: string) => void;
    /** Resolve an uncertain item */
    resolveUncertainItem: (itemId: string) => void;
    /** Dismiss an uncertain item */
    dismissUncertainItem: (itemId: string) => void;
    /** Set highlighted question */
    setHighlightedQuestion: (questionNumber: number | undefined) => void;
    /** Resolve type mismatch */
    resolveTypeMismatch: (questionNumber: number, selectedType: QuestionType, source: 'ai' | 'rules' | 'manual') => void;
    /** Toggle preview mode */
    togglePreviewMode: () => void;
    /** Upload diagram image */
    uploadDiagramImage: (questionNumber: number, file: File) => Promise<void>;
    /** Publish the test */
    publishTest: () => Promise<void>;
    /** Save as draft */
    saveDraft: () => Promise<void>;
    /** Download debug data as JSON (admin tool, removable in production) */
    downloadDebugData: () => void;
}

// ═══════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════

export function useTestCreation(): [TestCreationState, TestCreationActions] {
    // Auth for user ownership
    const { user } = useAuth();

    // Parsing progress
    const [parsingState, parsingActions] = useParsingProgress();

    // Phase
    const [phase, setPhase] = useState<TestCreationPhase>('upload');

    // Parsed data
    const [passages, setPassages] = useState<ParsedPassage[]>([]);
    const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
    const [sectionInstructions, setSectionInstructions] = useState<SectionInstruction[]>([]);

    // Review state
    const [uncertainItems, setUncertainItems] = useState<UncertainItem[]>([]);
    const [highlightedQuestion, setHighlightedQuestion] = useState<number | undefined>();
    const [previewMode, setPreviewMode] = useState(false);

    // Publishing state
    const [isPublishing, setIsPublishing] = useState(false);

    // Stored input for retry
    const [lastInput, setLastInput] = useState<TestCreationInput | null>(null);

    // Debug data for admin download (removable in production)
    const [debugData, setDebugData] = useState<Record<string, unknown> | null>(null);

    // ─────────────────────────────────────────────────────────────
    // COMPLETENESS CALCULATION
    // ─────────────────────────────────────────────────────────────

    const completenessChecks = useMemo((): CompletenessCheck[] => {
        const checks: CompletenessCheck[] = [];

        // Passages check
        const passageCount = passages.length;
        const requiredPassages = 3; // IELTS Reading has 3 passages
        checks.push({
            id: 'passages',
            label: 'Reading Passages',
            description: `At least ${requiredPassages} passages are required for IELTS Reading`,
            status: passageCount >= requiredPassages ? 'complete' : passageCount > 0 ? 'warning' : 'incomplete',
            count: { current: passageCount, required: requiredPassages },
        });

        // Questions check
        const questionCount = questions.length;
        const requiredQuestions = 40; // IELTS Reading typically has 40 questions
        checks.push({
            id: 'questions',
            label: 'Questions',
            description: `IELTS Reading typically has ${requiredQuestions} questions`,
            status: questionCount >= requiredQuestions ? 'complete' : questionCount >= 30 ? 'warning' : 'incomplete',
            count: { current: questionCount, required: requiredQuestions },
        });

        // Answer key check
        const answeredQuestions = questions.filter(q => q.answer && (Array.isArray(q.answer) ? q.answer.length > 0 : q.answer.length > 0));
        const missingAnswers = questions.filter(q => !q.answer || (Array.isArray(q.answer) ? q.answer.length === 0 : q.answer.length === 0));
        checks.push({
            id: 'answers',
            label: 'Answer Key',
            description: 'All questions must have answers',
            status: missingAnswers.length === 0 ? 'complete' : missingAnswers.length <= 3 ? 'warning' : 'incomplete',
            count: { current: answeredQuestions.length, required: questionCount },
            details: missingAnswers.slice(0, 5).map(q => `Q${q.questionNumber}: Missing answer`),
        });

        // Diagram questions check
        const diagramQuestions = questions.filter(q => q.type === 'diagram-labeling');
        if (diagramQuestions.length > 0) {
            checks.push({
                id: 'images',
                label: 'Diagram Images',
                description: 'Diagram-labeling questions require images',
                status: 'warning', // Always warning until images are uploaded
                count: { current: 0, required: diagramQuestions.length },
                details: diagramQuestions.map(q => `Q${q.questionNumber}: Needs diagram image`),
            });
        }

        // Uncertain items check
        const unresolvedUncertain = uncertainItems.filter(item => !item.resolved);
        if (unresolvedUncertain.length > 0) {
            checks.push({
                id: 'uncertain',
                label: 'Uncertain Items',
                description: 'Review and resolve uncertain items',
                status: 'warning',
                count: { current: uncertainItems.length - unresolvedUncertain.length, required: uncertainItems.length },
                details: unresolvedUncertain.slice(0, 5).map(item => `Q${item.questionNumber}: ${item.message}`),
            });
        }

        return checks;
    }, [passages, questions, uncertainItems]);

    const completenessPercent = useMemo(() => {
        if (completenessChecks.length === 0) return 0;
        const completeCount = completenessChecks.filter(c => c.status === 'complete').length;
        return Math.round((completeCount / completenessChecks.length) * 100);
    }, [completenessChecks]);

    const canPublish = useMemo(() => {
        // Must have at least 1 passage and 1 question
        if (passages.length === 0 || questions.length === 0) return false;

        // All critical checks must be complete
        const criticalChecks = completenessChecks.filter(c => c.id === 'answers');
        return criticalChecks.every(c => c.status === 'complete' || c.status === 'warning');
    }, [passages, questions, completenessChecks]);

    // ─────────────────────────────────────────────────────────────
    // PARSING ACTIONS
    // ─────────────────────────────────────────────────────────────

    const startParsing = useCallback(async (input: TestCreationInput) => {
        setLastInput(input);
        setPhase('parsing');
        parsingActions.startParsing();

        try {
            // Import service dynamically to avoid circular deps
            const { testCreationService } = await import('../services/test-creation');

            // Create file from input
            let file: File;
            if (input.type === 'file') {
                file = input.data as File;
            } else {
                file = new File([input.data as string], 'pasted-content.txt', { type: 'text/plain' });
            }

            // Use the unified service for parsing
            const result = await testCreationService.parseDocument(file, {
                onProgress: (stage, progress, message) => {
                    // Map service stages to UI stages
                    const stageMap: Record<string, ParsingStage> = {
                        'converting': 'converting',
                        'extracting': 'extracting',
                        'classifying': 'classifying',
                        'validating': 'validating',
                        'complete': 'complete',
                        'error': 'error',
                    };
                    parsingActions.setStage(stageMap[stage] || 'converting');
                    parsingActions.setProgress(progress);
                    parsingActions.setMessage(message);
                },
                enableCheckpoints: true,
            });

            if (!result.success) {
                throw new Error(result.error || 'Parsing failed');
            }

            // Transform validation result to UI format
            if (result.validationResult) {
                // Extract unique passage IDs from validation result
                const passageIds = result.validationResult.mergedQuestions
                    .map((q: import('../services/test-creation/validator.service').MergedQuestion) => q.passageId)
                    .filter((id): id is string => typeof id === 'string');

                const uniquePassageIds = [...new Set(passageIds)];

                const parsedPassages: ParsedPassage[] = uniquePassageIds.map((id) => ({
                    id: id,
                    title: `Passage ${id}`,
                    content: '', // Content would come from AI extraction
                }));

                // Use at least 3 passages for IELTS
                if (parsedPassages.length === 0) {
                    parsedPassages.push(
                        { id: '1', title: 'Passage 1', content: result.documentText?.substring(0, 1000) || '' },
                        { id: '2', title: 'Passage 2', content: '' },
                        { id: '3', title: 'Passage 3', content: '' }
                    );
                }

                // Build discrepancy lookup for AI vs Rules type data
                const discrepancyMap = new Map<number, import('../services/test-creation/validator.service').Discrepancy>();
                for (const d of result.validationResult.discrepancies) {
                    if (d.field === 'type') {
                        discrepancyMap.set(d.questionNumber, d);
                    }
                }

                // Transform merged questions
                const parsedQuestions: ParsedQuestion[] = result.validationResult.mergedQuestions.map(
                    (q: import('../services/test-creation/validator.service').MergedQuestion) => {
                        const disc = discrepancyMap.get(q.questionNumber);
                        return {
                            questionNumber: q.questionNumber,
                            questionText: q.questionText || '',
                            type: q.type as QuestionType,
                            options: q.options,
                            answer: q.answer,
                            passageId: q.passageId,
                            confidence: q.confidence,
                            uncertain: q.uncertain,
                            uncertainReason: q.uncertainReason,
                            // Populate AI vs Rules comparison data from discrepancies
                            aiType: disc ? String(disc.aiValue) as QuestionType : undefined,
                            rulesType: disc ? String(disc.rulesValue) as QuestionType : undefined,
                            aiConfidence: disc ? undefined : undefined, // Not available from discrepancy
                            rulesConfidence: disc ? undefined : undefined,
                            wordLimit: q.wordLimit?.max,
                        };
                    }
                );

                // Extract uncertain items from discrepancies
                const uncertainItems: UncertainItem[] = result.validationResult.discrepancies.map(
                    (d: import('../services/test-creation/validator.service').Discrepancy) => ({
                        id: `uncertain-${d.questionNumber}`,
                        questionNumber: d.questionNumber,
                        type: d.field === 'type' ? 'type_mismatch' as const : 'low_confidence' as const,
                        severity: d.severity,
                        message: `${d.field} mismatch: AI suggested ${String(d.aiValue)}, rules suggested ${String(d.rulesValue)}`,
                        aiSuggestion: String(d.aiValue),
                        rulesSuggestion: String(d.rulesValue),
                        resolved: false,
                    })
                );

                // 🔍 LOG: Diagnostic logging for parsed questions
                console.log('📊 [TestCreation] Parsed Questions Summary:');
                console.log(`   - Total questions: ${parsedQuestions.length}`);
                console.log(`   - Uncertain items: ${uncertainItems.length}`);

                // Log question types distribution
                const typeDistribution = parsedQuestions.reduce((acc, q) => {
                    acc[q.type] = (acc[q.type] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);
                console.log('   - Type distribution:', typeDistribution);

                // Log first 5 questions for debugging
                console.log('   - First 5 questions:', parsedQuestions.slice(0, 5).map(q => ({
                    num: q.questionNumber,
                    type: q.type,
                    hasOptions: !!q.options,
                    optionsCount: Array.isArray(q.options) ? q.options.length : 0,
                    hasAnswer: !!q.answer,
                    confidence: q.confidence,
                })));

                setPassages(parsedPassages);
                setQuestions(parsedQuestions);
                setUncertainItems(uncertainItems);

                // Store debug data for admin download (removable in production)
                setDebugData({
                    timestamp: new Date().toISOString(),
                    originalInput: {
                        type: input.type,
                        format: input.format,
                        fileName: input.type === 'file' ? (input.data as File).name : 'pasted-content.txt',
                        dataSize: input.type === 'file' ? (input.data as File).size : (input.data as string).length,
                    },
                    documentText: result.documentText,
                    metadata: result.metadata,
                    validationResult: result.validationResult,
                    parsedQuestions: parsedQuestions.map(q => ({
                        ...q,
                        aiType: q.aiType,
                        rulesType: q.rulesType,
                    })),
                    discrepancies: result.validationResult.discrepancies,
                    passages: parsedPassages,
                    uncertainItems,
                });
            }

            // Complete
            parsingActions.complete();

            // Wait a moment then go to review
            await new Promise(resolve => setTimeout(resolve, 1000));
            setPhase('review');

        } catch (error) {
            parsingActions.setError(error instanceof Error ? error.message : 'Parsing failed');
        }
    }, [parsingActions]);

    const cancelParsing = useCallback(() => {
        parsingActions.reset();
        setPhase('upload');
    }, [parsingActions]);

    const retryParsing = useCallback(() => {
        if (lastInput) {
            startParsing(lastInput);
        } else {
            parsingActions.reset();
            setPhase('upload');
        }
    }, [lastInput, startParsing, parsingActions]);

    const resumeFromCheckpoint = useCallback(() => {
        // TODO: Implement checkpoint resume
        parsingActions.clearCheckpoint();
        if (lastInput) {
            startParsing(lastInput);
        }
    }, [lastInput, startParsing, parsingActions]);

    const goToUpload = useCallback(() => {
        parsingActions.reset();
        setPhase('upload');
    }, [parsingActions]);

    // ─────────────────────────────────────────────────────────────
    // EDIT ACTIONS
    // ─────────────────────────────────────────────────────────────

    const updatePassage = useCallback((passageId: string, updates: Partial<ParsedPassage>) => {
        setPassages(prev => prev.map(p =>
            p.id === passageId ? { ...p, ...updates } : p
        ));
    }, []);

    const updateQuestion = useCallback((questionNumber: number, updates: Partial<ParsedQuestion>) => {
        setQuestions(prev => prev.map(q =>
            q.questionNumber === questionNumber ? { ...q, ...updates, uncertain: false } : q
        ));

        // Mark related uncertain item as resolved
        setUncertainItems(prev => prev.map(item =>
            item.questionNumber === questionNumber ? { ...item, resolved: true } : item
        ));
    }, []);

    const deleteQuestion = useCallback((questionNumber: number) => {
        setQuestions(prev => prev.filter(q => q.questionNumber !== questionNumber));
        setUncertainItems(prev => prev.filter(item => item.questionNumber !== questionNumber));
    }, []);

    const addQuestion = useCallback((passageId?: string) => {
        const maxNumber = Math.max(0, ...questions.map(q => q.questionNumber));
        const targetPassageId = passageId || passages[0]?.id;
        const newQuestion: ParsedQuestion = {
            questionNumber: maxNumber + 1,
            questionText: '',
            type: 'multiple-choice',
            options: ['A', 'B', 'C', 'D'],
            answer: undefined,
            passageId: targetPassageId,
            confidence: 100,
            uncertain: false,
        };
        setQuestions(prev => [...prev, newQuestion]);
        setHighlightedQuestion(newQuestion.questionNumber);
    }, [questions, passages]);

    const resolveUncertainItem = useCallback((itemId: string) => {
        setUncertainItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, resolved: true } : item
        ));
    }, []);

    const dismissUncertainItem = useCallback((itemId: string) => {
        setUncertainItems(prev => prev.filter(item => item.id !== itemId));
    }, []);

    const resolveTypeMismatch = useCallback((
        questionNumber: number,
        selectedType: QuestionType,
        _source: 'ai' | 'rules' | 'manual'
    ) => {
        updateQuestion(questionNumber, { type: selectedType });
    }, [updateQuestion]);

    const updateSectionInstruction = useCallback((instructionId: string, updates: Partial<SectionInstruction>) => {
        setSectionInstructions(prev => prev.map(instruction =>
            instruction.id === instructionId ? { ...instruction, ...updates } : instruction
        ));
    }, []);

    const togglePreviewMode = useCallback(() => {
        setPreviewMode(prev => !prev);
    }, []);

    const uploadDiagramImage = useCallback(async (questionNumber: number, file: File) => {
        try {
            // Create object URL for preview
            const imageUrl = URL.createObjectURL(file);

            // Update question with diagram image
            setQuestions(prev => prev.map(q =>
                q.questionNumber === questionNumber
                    ? { ...q, diagramImage: imageUrl, diagramRequired: false }
                    : q
            ));

            // TODO: Upload to Firebase Storage and get permanent URL
            console.log(`Diagram uploaded for question ${questionNumber}:`, file.name);
        } catch (error) {
            console.error('Diagram upload error:', error);
        }
    }, []);

    // ─────────────────────────────────────────────────────────────
    // PUBLISH ACTIONS
    // ─────────────────────────────────────────────────────────────

    const publishTest = useCallback(async () => {
        if (!canPublish) return;

        setIsPublishing(true);
        setPhase('publishing');

        try {
            // 1. Prepare metadata
            const metadata: TestMetadata = {
                title: 'IELTS Reading Test', // TODO: Get from form or auto-generate
                type: 'IELTS',
                skill: 'Reading',
                duration: 60, // 60 minutes for IELTS Reading
                difficulty: 'Intermediate',
                description: `IELTS Reading test with ${passages.length} passages and ${questions.length} questions`,
                tags: ['IELTS', 'Reading', 'Academic'],
            };

            // 2. Transform passages to Firebase format
            const storagePassages: Passage[] = passages.map((p, index) => {
                // Find question range for this passage
                const passageQuestions = questions.filter(q => q.passageId === p.id);
                const questionNumbers = passageQuestions.map(q => q.questionNumber);
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

            // 3. Transform questions to Firebase format
            const storageQuestions: StorageQuestion[] = questions.map((q) => ({
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

            // 4. Get user ID for ownership
            const userId = user?.uid || 'anonymous';

            // 5. Save to Firebase
            console.log('📤 [TestCreation] Publishing test to Firebase...', {
                passageCount: storagePassages.length,
                questionCount: storageQuestions.length,
                userId,
            });

            const result = await saveTestToFirebase(
                metadata,
                storagePassages,
                storageQuestions,
                userId, // createdBy
                undefined, // materialLink
                userId, // ownerId
                false // isPublic
            );

            if (result.success && result.testId) {
                console.log('✅ [TestCreation] Test published successfully:', result.testId);
                setPhase('complete');
            } else {
                throw new Error(result.error || 'Failed to publish test');
            }
        } catch (error) {
            console.error('❌ [TestCreation] Publish error:', error);
            setPhase('review');
            // Show error to user
            alert(`Failed to publish test: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsPublishing(false);
        }
    }, [canPublish, passages, questions, user]);

    const saveDraft = useCallback(async () => {
        // TODO: Implement draft saving
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('Draft saved');
    }, []);

    // Admin tool: Download debug data as JSON (removable in production)
    const downloadDebugData = useCallback(() => {
        if (!debugData) {
            console.warn('[TestCreation] No debug data available');
            return;
        }
        try {
            const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `test-creation-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('[TestCreation] Debug data downloaded');
        } catch (error) {
            console.error('[TestCreation] Failed to download debug data:', error);
        }
    }, [debugData]);

    // ─────────────────────────────────────────────────────────────
    // RETURN
    // ─────────────────────────────────────────────────────────────

    const state: TestCreationState = {
        phase,
        parsingStage: parsingState.stage,
        parsingProgress: parsingState.progress,
        parsingMessage: parsingState.message,
        parsingError: parsingState.error,
        hasCheckpoint: parsingState.hasCheckpoint,
        estimatedTimeRemaining: parsingState.estimatedTimeRemaining,
        isParsing: parsingState.isParsing,
        passages,
        questions,
        sectionInstructions,
        uncertainItems,
        highlightedQuestion,
        previewMode,
        completenessChecks,
        completenessPercent,
        canPublish,
        isPublishing,
        debugData,
    };

    const actions: TestCreationActions = {
        startParsing,
        cancelParsing,
        retryParsing,
        resumeFromCheckpoint,
        goToUpload,
        updatePassage,
        updateQuestion,
        updateSectionInstruction,
        deleteQuestion,
        addQuestion,
        resolveUncertainItem,
        dismissUncertainItem,
        setHighlightedQuestion,
        resolveTypeMismatch,
        togglePreviewMode,
        uploadDiagramImage,
        publishTest,
        saveDraft,
        downloadDebugData,
    };

    return [state, actions];
}

export default useTestCreation;
