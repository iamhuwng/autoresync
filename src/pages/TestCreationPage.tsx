/**
 * TestCreationPage
 * 
 * Main page for creating IELTS Reading tests from documents.
 * Uses TeacherHeader for consistent navigation.
 * 
 * Flow:
 * 1. Upload/Paste → TestUploadWizard
 * 2. Parsing → ParsingProgressScreen
 * 3. Review → ParseReviewPanel
 * 
 * Design Notes:
 * - Uses TeacherHeader (same as TeacherClassesPage, TeacherCoursesPage)
 * - AppShell for layout consistency
 * - Glass card styling
 * - Both teacher and super_admin can access this page
 * 
 * @module TestCreationPage
 * @version 2.1.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 9
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell, LoadingOverlay, Tabs, Badge, Tooltip } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { TeacherHeader } from '../components/navigation';
import {
    TestUploadWizard,
    ParsingProgressScreen,
    ParseReviewPanel,
    UncertainItemsSidebar,
    CompletionChecklist,
    AnswerKeyModal,
} from '../components/test-creation';
import type { ParsedPassage, ParsedQuestion } from '../components/test-creation';
import { useTestCreation } from '../hooks/useTestCreation';
import { ROUTES } from '../constants/routes';

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const TestCreationPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');

    // Use the test creation hook for full flow management
    const [state, actions] = useTestCreation();

    // Modal states
    const [answerKeyModalOpen, setAnswerKeyModalOpen] = useState(false);

    // ─────────────────────────────────────────────────────────────
    // HANDLERS
    // ─────────────────────────────────────────────────────────────

    const handleLogout = useCallback(async () => {
        try {
            await logout();
            navigate(ROUTES.LOGIN, { replace: true });
        } catch (error) {
            console.error('Logout error:', error);
        }
    }, [logout, navigate]);

    const handleStartParsing = useCallback(async (content: {
        type: 'file' | 'text';
        data: File | string;
        format: 'academic' | 'general';
    }) => {
        await actions.startParsing({
            type: content.type,
            data: content.data,
            format: content.format,
        });
    }, [actions]);

    const handleCancelParsing = useCallback(() => {
        actions.cancelParsing();
    }, [actions]);

    const handleRetryParsing = useCallback(() => {
        actions.retryParsing();
    }, [actions]);

    const handleCancel = useCallback(() => {
        // Navigate back to materials/lobby
        if (profile?.role === 'super_admin') {
            navigate(ROUTES.ADMIN_MATERIALS);
        } else {
            navigateTo('TEACHER_LOBBY', { sessionCode: 'new' });
        }
    }, [profile, navigate, navigateTo]);

    // ParseReviewPanel handlers - match component interface
    const handlePassageChange = useCallback((passageId: string, updates: Partial<ParsedPassage>) => {
        actions.updatePassage(passageId, updates);
    }, [actions]);

    const handleQuestionChange = useCallback((questionNumber: number, updates: Partial<ParsedQuestion>) => {
        actions.updateQuestion(questionNumber, updates);
    }, [actions]);

    const handleQuestionDelete = useCallback((questionNumber: number) => {
        actions.deleteQuestion(questionNumber);
    }, [actions]);

    const handleQuestionAdd = useCallback((passageId?: string) => {
        actions.addQuestion(passageId);
    }, [actions]);

    const handleQuestionClick = useCallback((questionNumber: number) => {
        actions.setHighlightedQuestion(questionNumber);
    }, [actions]);

    // UncertainItemsSidebar handlers - match component interface
    const handleItemClick = useCallback((questionNumber: number) => {
        actions.setHighlightedQuestion(questionNumber);
        // Scroll to question in review panel
        document.getElementById(`question-${questionNumber}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }, [actions]);

    const handleItemResolve = useCallback((itemId: string) => {
        actions.resolveUncertainItem(itemId);
    }, [actions]);

    const handleItemDismiss = useCallback((itemId: string) => {
        actions.dismissUncertainItem(itemId);
    }, [actions]);

    // CompletionChecklist handlers - match component interface
    const handlePublish = useCallback(async () => {
        await actions.publishTest();
    }, [actions]);

    const handleSaveDraft = useCallback(async () => {
        await actions.saveDraft();
    }, [actions]);

    // New handlers for enhanced ParseReviewPanel
    const handleSectionInstructionChange = useCallback((instructionId: string, updates: Partial<import('../components/test-creation').SectionInstruction>) => {
        actions.updateSectionInstruction(instructionId, updates);
    }, [actions]);

    const handleDiagramUpload = useCallback(async (questionNumber: number, file: File) => {
        await actions.uploadDiagramImage(questionNumber, file);
    }, [actions]);

    // Log navigation attempts for debugging
    useEffect(() => {
        console.log('[TestCreationPage] Phase:', state.phase, 'User:', user?.uid);
    }, [state.phase, user?.uid]);

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────

    return (
        <div
            style={{
                height: '100vh',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
                backgroundAttachment: 'fixed',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <AppShell padding="md" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Unified Teacher/Admin Header */}
                <TeacherHeader
                    pageTitle="Create IELTS Test"
                    userId={user?.uid}
                    userRole={profile?.role}
                    onLogout={handleLogout}
                />

                <AppShell.Main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0.75rem 1rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        {/* Loading Overlay */}
                        <LoadingOverlay
                            visible={state.isPublishing}
                            zIndex={1000}
                            overlayProps={{ blur: 2 }}
                            loaderProps={{ type: 'dots', size: 'xl' }}
                        />

                        {/* Upload State */}
                        {state.phase === 'upload' && (
                            <TestUploadWizard
                                onStartParsing={handleStartParsing}
                                onCancel={handleCancel}
                            />
                        )}

                        {/* Parsing State */}
                        {state.phase === 'parsing' && (
                            <ParsingProgressScreen
                                stage={state.parsingStage}
                                progress={state.parsingProgress}
                                message={state.parsingMessage}
                                error={state.parsingError}
                                onCancel={handleCancelParsing}
                                onRetry={handleRetryParsing}
                            />
                        )}

                        {/* Review State */}
                        {state.phase === 'review' && (
                            <ParseReviewPanel
                                passages={state.passages}
                                questions={state.questions}
                                sectionInstructions={state.sectionInstructions}
                                onPassageChange={handlePassageChange}
                                onQuestionChange={handleQuestionChange}
                                onSectionInstructionChange={handleSectionInstructionChange}
                                onQuestionDelete={handleQuestionDelete}
                                onQuestionAdd={handleQuestionAdd}
                                onDiagramUpload={handleDiagramUpload}
                                highlightedQuestion={state.highlightedQuestion}
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
                                                    rightSection={state.uncertainItems.length > 0 ? (
                                                        <Badge size="xs" color="yellow" variant="filled">{state.uncertainItems.length}</Badge>
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
                                                {state.uncertainItems.length > 0 ? (
                                                    <UncertainItemsSidebar
                                                        items={state.uncertainItems}
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
                                                    checks={state.completenessChecks}
                                                    completenessPercent={state.completenessPercent}
                                                    canPublish={state.canPublish}
                                                    onPublish={handlePublish}
                                                    onSaveDraft={handleSaveDraft}
                                                    isPublishing={state.isPublishing}
                                                    onAnswerKeyClick={() => setAnswerKeyModalOpen(true)}
                                                />
                                            </Tabs.Panel>
                                        </Tabs>

                                        {/* Debug Download Button - Always visible at bottom */}
                                        {(profile?.role === 'super_admin' || profile?.role === 'teacher') && state.debugData && (
                                            <div style={{ marginTop: '0.75rem', flexShrink: 0 }}>
                                                <button
                                                    onClick={() => actions.downloadDebugData()}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.5rem 0.75rem',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: '#64748b',
                                                        background: 'rgba(248, 250, 252, 0.8)',
                                                        border: '1px dashed #cbd5e1',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.375rem',
                                                    }}
                                                >
                                                    📥 Debug Data
                                                </button>
                                            </div>
                                        )}

                                        {/* Back to Upload */}
                                        <div style={{ marginTop: '0.5rem', flexShrink: 0 }}>
                                            <Tooltip label="Discard results and re-upload">
                                                <button
                                                    onClick={() => actions.goToUpload()}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.5rem 0.75rem',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: '#94a3b8',
                                                        background: 'transparent',
                                                        border: '1px solid rgba(203, 213, 225, 0.4)',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.375rem',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.8)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.4)'; }}
                                                >
                                                    ← Re-upload
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                }
                            />
                        )}

                        {/* Published Success State */}
                        {state.phase === 'complete' && (
                            <div
                                style={{
                                    textAlign: 'center',
                                    padding: '4rem 2rem',
                                    animation: 'fadeIn 0.5s ease-out',
                                }}
                            >
                                <div
                                    style={{
                                        width: '100px',
                                        height: '100px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 1.5rem',
                                        fontSize: '3rem',
                                        color: 'white',
                                        boxShadow: '0 15px 40px rgba(34, 197, 94, 0.3)',
                                    }}
                                >
                                    ✓
                                </div>
                                <h2 style={{ fontSize: '2rem', fontWeight: '800', color: '#1e293b', marginBottom: '1rem' }}>
                                    Test Published Successfully!
                                </h2>
                                <p style={{ color: '#64748b', fontSize: '1.125rem', marginBottom: '2rem' }}>
                                    Your IELTS Reading test is now available.
                                </p>
                                <button
                                    onClick={handleCancel}
                                    style={{
                                        padding: '1rem 2rem',
                                        fontSize: '1rem',
                                        fontWeight: 700,
                                        background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        boxShadow: '0 10px 30px rgba(139, 92, 246, 0.3)',
                                        transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 15px 40px rgba(139, 92, 246, 0.4)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(139, 92, 246, 0.3)'; }}
                                >
                                    Back to Materials
                                </button>
                            </div>
                        )}
                    </div>
                </AppShell.Main>

                <style>{`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                `}</style>
            </AppShell>

            {/* Answer Key Modal */}
            <AnswerKeyModal
                opened={answerKeyModalOpen}
                onClose={() => setAnswerKeyModalOpen(false)}
                questions={state.questions}
                onUpdateAnswer={(questionNumber, answer) => {
                    actions.updateQuestion(questionNumber, { answer });
                }}
            />
        </div >
    );
};

export default TestCreationPage;
