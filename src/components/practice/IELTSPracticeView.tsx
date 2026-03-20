/**
 * IELTSPracticeView — Extracted from StudentPracticePage (PRD-0025)
 *
 * Renders the full IELTS test-taking experience for unsupervised contexts:
 * - Solo Practice (from Course / Library)
 * - Homework
 *
 * This component owns all solo hooks (test data, timer, auto-save, submission).
 * The parent (StudentPracticePage) is a thin router that detects test type
 * and renders this view for IELTS tests.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSoloTestData } from '../../hooks/solo/useSoloTestData';
import { useSoloTimer } from '../../hooks/solo/useSoloTimer';
import { useSoloAutoSave } from '../../hooks/solo/useSoloAutoSave';
import { useSoloResume } from '../../hooks/solo/useSoloResume';
import { useSoloSubmission } from '../../hooks/solo/useSoloSubmission';
import { useTestIntegrity } from '../../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../../hooks/test/useFullscreenMode';
import { useTestCompletionCheck } from '../../hooks/test/useTestCompletionCheck';
import { useBeforeUnloadWarning } from '../../hooks/test/useBeforeUnloadWarning';
import { SoloSettingsModal } from '../test/SoloSettingsModal';
import { SoloResumeModal } from '../test/SoloResumeModal';
import type { ResolvedPracticeSettings, StudentSoloPreferences } from '../../types/practice.types';
import { DEFAULT_STUDENT_PREFS } from '../../types/practice.types';
import type { AntiCheatConfig } from '../../types/integrity.types';
import { getHomeworkById } from '../../services/homeworkManager';
import { toast } from '../modern/ToastNotification';
import { toHomeworkIntegrity } from '../../utils/integrityUtils';
import { getIELTSQuestionsForStudent } from '../../utils/thcsShuffle';

// Reuse existing live-test UI components
// @ts-ignore
import PassageRenderer from '../PassageRenderer_v2';
import { IELTSQuestionsPanel } from '../test/IELTSQuestionsPanel';
import { TwoColumnLayout } from '../test/TwoColumnLayout';
import { TestHeader } from '../test/TestHeader';
import { PassageControls } from '../test/PassageControls';
import { TimeUpOverlay } from '../test/TimeUpOverlay';
import { InspiraFooterNav } from '../test/InspiraFooterNav';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface PracticeContext {
    type: 'course_material' | 'self_study' | 'homework';
    // Course-specific
    courseId?: string;
    moduleId?: string;
    courseName?: string;
    // Homework-specific
    homeworkId?: string;
    submissionId?: string;
}

export interface IELTSPracticeViewProps {
    materialId: string;
    resolvedSettings: ResolvedPracticeSettings;
    practiceContext: PracticeContext;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const IELTSPracticeView: React.FC<IELTSPracticeViewProps> = ({
    materialId,
    resolvedSettings,
    practiceContext,
}) => {
    const navigate = useNavigate();
    const { user, profile } = useAuth();

    // ── Student Preferences (persisted to localStorage) ──────────────────────
    const [studentPrefs, setStudentPrefs] = useState<StudentSoloPreferences>(() => {
        try {
            const stored = localStorage.getItem(`solo_student_prefs_${user?.uid}`);
            return stored ? { ...DEFAULT_STUDENT_PREFS, ...JSON.parse(stored) } : DEFAULT_STUDENT_PREFS;
        } catch {
            return DEFAULT_STUDENT_PREFS;
        }
    });

    const [settingsModalOpen, setSettingsModalOpen] = useState(false);

    const handlePrefsChange = useCallback((newPrefs: StudentSoloPreferences) => {
        setStudentPrefs(newPrefs);
        if (user?.uid) {
            try {
                localStorage.setItem(`solo_student_prefs_${user.uid}`, JSON.stringify(newPrefs));
            } catch (err) {
                console.warn('Failed to persist student preferences:', err);
            }
        }
    }, [user?.uid]);

    // ── Test Data ─────────────────────────────────────────────────────────────
    const {
        testData,
        loading: testLoading,
        error,
        activePassageId,
        setActivePassageId,
        questionsWithAnswersRef,
    } = useSoloTestData({
        materialId,
    });

    // ── Resume Check ──────────────────────────────────────────────────────────
    const { savedProgress, checking, discardProgress } = useSoloResume({
        materialId,
        studentId: user?.uid,
    });

    const [resumeDecision, setResumeDecision] = useState<'pending' | 'resume' | 'fresh'>('pending');
    const showResumeModal = !checking && savedProgress !== null && resumeDecision === 'pending';

    // Auto-resolve: when no saved progress exists, skip the modal
    useEffect(() => {
        if (!checking && savedProgress === null && resumeDecision === 'pending') {
            setResumeDecision('fresh');
        }
    }, [checking, savedProgress, resumeDecision]);

    // ── Answer State ─────────────────────────────────────────────────────────
    const [answers, setAnswers] = useState<Record<number, any>>({});
    const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1);

    // Apply resumed answers if user chose to resume
    useEffect(() => {
        if (resumeDecision === 'resume' && savedProgress?.answers) {
            setAnswers(savedProgress.answers);
            setCurrentQuestionNumber(savedProgress.currentQuestion || 1);
        }
    }, [resumeDecision, savedProgress]);

    // ── Timer ─────────────────────────────────────────────────────────────────
    const submitTestRef = useRef<((auto: boolean) => Promise<void>) | null>(null);

    const handleTimeUp = useCallback(() => {
        submitTestRef.current?.(true);
    }, []);

    const handleGracePeriodStart = useCallback(() => {
        setIsLocked(true);
    }, []);

    const [isLocked, setIsLocked] = useState(false);

    const { timeRemaining, formatTime, isPaused, togglePause, showTimeUpOverlay, gracePeriodRemaining, hasTimer } = useSoloTimer({
        durationMinutes: resolvedSettings?.timerMinutes ?? null,
        allowPause: resolvedSettings?.allowPause === true,
        testSubmitted: false,
        onTimeUp: handleTimeUp,
        onGracePeriodStart: handleGracePeriodStart,
        initialElapsed: resumeDecision === 'resume' ? (savedProgress?.timeElapsed ?? 0) : 0,
    });

    // ── Submission ────────────────────────────────────────────────────────────
    const studentName = profile?.displayName || user?.displayName || user?.email || 'Student';

    const isHomework = practiceContext.type === 'homework';
    const [antiCheatConfig, setAntiCheatConfig] = useState<AntiCheatConfig | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useTestCompletionCheck({
        sessionCode: undefined,
        enabled: isHomework && Boolean(user?.uid) && Boolean(practiceContext.homeworkId),
        mode: 'homework',
        surface: 'ielts_homework',
        homeworkId: practiceContext.homeworkId,
        studentId: user?.uid,
        submissionId: practiceContext.submissionId,
    });

    useEffect(() => {
        if (!isHomework || !practiceContext.homeworkId) {
            setAntiCheatConfig(null);
            return;
        }

        let cancelled = false;
        getHomeworkById(practiceContext.homeworkId)
            .then((homework) => {
                if (!cancelled) {
                    setAntiCheatConfig((homework?.antiCheatConfig as AntiCheatConfig) || null);
                }
            })
            .catch((err) => {
                console.warn('[IELTSPractice] Failed to load anti-cheat config:', err);
            });

        return () => {
            cancelled = true;
        };
    }, [isHomework, practiceContext.homeworkId]);

    const {
        addEvent,
        violationCount,
        totalEvents,
        warningLevel,
        warningMessage,
        shouldAutoSubmit,
        flushEvents,
        getIntegrityReport,
    } = useTestIntegrity({
        config: isHomework ? antiCheatConfig : null,
        context: isHomework ? 'homework' : 'solo',
        surface: isHomework ? 'ielts_homework' : 'ielts_solo',
        studentId: user?.uid || '',
        testId: materialId,
        homeworkId: practiceContext.homeworkId,
        submissionId: practiceContext.submissionId,
    });

    useAntiCopyPaste({
        enabled: isHomework && (antiCheatConfig?.detectCopyPaste || false),
        containerRef: containerRef as React.RefObject<HTMLElement>,
        onEvent: addEvent,
        allowEditorPaste: testData?.skill === 'Writing',
        detectRightClick: antiCheatConfig?.detectRightClick || false,
        detectKeyboardShortcuts: antiCheatConfig?.detectKeyboardShortcuts || false,
    });

    useFullscreenMode({
        enabled: isHomework && (antiCheatConfig?.requireFullscreen || false),
        onFullscreenExit: addEvent,
    });

    const { isSubmitting, testSubmitted, testResults, handleSubmit, isLocked: submissionLocked } = useSoloSubmission({
        testData: testData as any,
        answers,
        materialId,
        studentId: user?.uid,
        studentName,
        timeRemaining,
        resolvedSettings,
        context: {
            type: isHomework ? 'homework' : (practiceContext.courseId ? 'course_material' : 'self_study'),
            source: isHomework
                ? { type: 'homework', id: practiceContext.homeworkId || '', name: '' }
                : practiceContext.courseId
                    ? { type: 'course', id: practiceContext.courseId, name: practiceContext.courseName || '' }
                    : { type: 'library', id: '', name: 'Self Study' },
        },
        courseContext: practiceContext.courseId && practiceContext.moduleId ? {
            courseId: practiceContext.courseId,
            moduleId: practiceContext.moduleId,
        } : undefined,
        // Homework-specific
        homeworkId: practiceContext.homeworkId,
        submissionId: practiceContext.submissionId,
        questionsWithAnswersRef,
        questionPresentation: {
            studentId: user?.uid || 'anon',
            shuffleQuestions: isHomework && (antiCheatConfig?.shuffleQuestions || false),
            shuffleOptions: isHomework && (antiCheatConfig?.shuffleOptions || false),
        },
        integrity: isHomework && antiCheatConfig
            ? toHomeworkIntegrity(getIntegrityReport())
            : undefined,
        attemptsNullified:
            isHomework &&
            Boolean(antiCheatConfig?.nullifyRemainingAttempts) &&
            violationCount > 0 &&
            (antiCheatConfig?.enableAutoSubmit ? violationCount >= antiCheatConfig.autoSubmitThreshold : false),
        telemetrySurface: isHomework ? 'ielts_homework' : 'ielts_solo',
    });

    // Keep submitTestRef updated
    useEffect(() => {
        submitTestRef.current = async (isAutoSubmit = false) => {
            if (isHomework && antiCheatConfig) {
                await flushEvents(isAutoSubmit ? 'auto_submit' : 'homework_submit');
            }
            await handleSubmit(isAutoSubmit);
        };
    }, [antiCheatConfig, flushEvents, handleSubmit, isHomework]);

    // ── Auto-Save ─────────────────────────────────────────────────────────────
    const timeElapsedRef = useRef(0);
    useEffect(() => {
        if (hasTimer && isFinite(timeRemaining) && resolvedSettings?.timerMinutes) {
            timeElapsedRef.current = (resolvedSettings.timerMinutes * 60) - timeRemaining;
        }
    }, [timeRemaining, hasTimer, resolvedSettings?.timerMinutes]);

    useSoloAutoSave({
        materialId,
        studentId: user?.uid,
        answers,
        currentQuestion: currentQuestionNumber,
        timeElapsed: timeElapsedRef.current,
        enabled: !testSubmitted && resumeDecision !== 'pending',
    });

    // ── Passage UI Controls ───────────────────────────────────────────────────
    const [fontSize, setFontSize] = useState(studentPrefs.fontSize);
    const [lineSpacing, setLineSpacing] = useState(studentPrefs.lineSpacing);
    const [highlighterActive, setHighlighterActive] = useState(studentPrefs.highlighterEnabled);
    const [highlightColor, setHighlightColor] = useState('#ffeb3b');
    const [clearHighlightsTrigger, setClearHighlightsTrigger] = useState(0);

    // Sync from SoloSettingsModal prefs changes
    useEffect(() => {
        setFontSize(studentPrefs.fontSize);
        setLineSpacing(studentPrefs.lineSpacing);
        setHighlighterActive(studentPrefs.highlighterEnabled);
    }, [studentPrefs.fontSize, studentPrefs.lineSpacing, studentPrefs.highlighterEnabled]);

    const handleAnswerChange = useCallback((questionNumber: number, answer: any) => {
        if (isLocked || submissionLocked || testSubmitted) return;
        setAnswers(prev => ({ ...prev, [questionNumber]: answer }));
    }, [isLocked, submissionLocked, testSubmitted]);

    const displayQuestions = useMemo(() => {
        if (!testData) return [];

        return getIELTSQuestionsForStudent(
            testData.questions,
            user?.uid || 'anon',
            testData.id,
            {
                shuffleQuestions: isHomework && (antiCheatConfig?.shuffleQuestions || false),
                shuffleOptions: isHomework && (antiCheatConfig?.shuffleOptions || false),
            },
        );
    }, [
        antiCheatConfig?.shuffleOptions,
        antiCheatConfig?.shuffleQuestions,
        isHomework,
        testData,
        user?.uid,
    ]);

    useEffect(() => {
        if (resumeDecision === 'resume' || currentQuestionNumber !== 1 || !activePassageId || displayQuestions.length === 0) {
            return;
        }

        const firstPassageQuestion = displayQuestions.find(
            (question) => question.passageId === activePassageId,
        );

        if (firstPassageQuestion) {
            setCurrentQuestionNumber(firstPassageQuestion.number);
        }
    }, [activePassageId, currentQuestionNumber, displayQuestions, resumeDecision]);

    const goToQuestion = useCallback((questionNumber: number) => {
        setCurrentQuestionNumber(questionNumber);
        if (testData) {
            const question = testData.questions.find(q => q.number === questionNumber);
            if (question) {
                const targetPassageId = (question as any).resourceId || question.passageId;
                if (targetPassageId) setActivePassageId(targetPassageId);
            }
        }
    }, [testData, setActivePassageId]);

    const handleClearHighlights = useCallback(() => {
        setClearHighlightsTrigger(prev => prev + 1);
    }, []);

    const handleManualSubmit = useCallback(() => {
        submitTestRef.current?.(false);
    }, []);

    // ── Back navigation (context-aware) ───────────────────────────────────────
    const handleBack = useCallback(() => {
        if (practiceContext.type === 'homework') {
            navigate('/student/homework');
        } else if (practiceContext.courseId) {
            navigate(`/student/courses/${practiceContext.courseId}`);
        } else {
            navigate('/student/library');
        }
    }, [navigate, practiceContext]);

    // ── Warn on page leave ────────────────────────────────────────────────────
    useBeforeUnloadWarning({
        enabled: !testSubmitted && resumeDecision !== 'pending',
    });

    const prevWarningRef = useRef(warningLevel);
    useEffect(() => {
        if (warningLevel !== prevWarningRef.current) {
            prevWarningRef.current = warningLevel;
            if (warningLevel === 'toast' || warningLevel === 'escalated') {
                toast.warning(warningMessage);
            }
        }
    }, [warningLevel, warningMessage]);

    useEffect(() => {
        if (!shouldAutoSubmit || !submitTestRef.current) return;
        submitTestRef.current(true).catch((err) => {
            console.error('[IELTSPractice] Auto-submit failed:', err);
        });
    }, [shouldAutoSubmit]);

    // ── Loading state ─────────────────────────────────────────────────────────
    if (testLoading || checking) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>
                        {isHomework ? 'Preparing Homework...' : 'Preparing Practice...'}
                    </div>
                </div>
            </div>
        );
    }

    // ── Error state ───────────────────────────────────────────────────────────
    if (error || !testData) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>Test Not Found</div>
                    <div style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.875rem' }}>{error || 'Unable to load this material.'}</div>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ padding: '0.75rem 1.5rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const currentPassage = testData.passages?.find((p: any) => p.id === activePassageId);
    const inputsDisabled = isLocked || submissionLocked || testSubmitted;

    // Synthetic testResults for TestHeader display
    const headerResults = testResults ? {
        correctAnswers: testResults.correctAnswers,
        totalScore: testResults.correctAnswers,
        percentage: testResults.percentage ?? 0,
        questionResults: testResults.questionResults,
    } : null;

    return (
        <div
            ref={containerRef}
            className={isHomework && antiCheatConfig?.detectCopyPaste ? 'anti-select' : undefined}
            style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', position: 'relative' }}
        >

            {/* Resume Modal */}
            {showResumeModal && savedProgress && (
                <SoloResumeModal
                    opened={showResumeModal}
                    onResume={() => setResumeDecision('resume')}
                    onStartNew={() => { discardProgress(); setResumeDecision('fresh'); }}
                    onClose={() => setResumeDecision('fresh')}
                    savedProgress={savedProgress}
                    totalQuestions={testData.questionCount || 0}
                />
            )}

            {/* Pause Overlay */}
            {isPaused && !testSubmitted && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
                }}>
                    <div style={{ background: 'white', borderRadius: 16, padding: '2rem 3rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12 }}>⏸️</div>
                        <h2 style={{ fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Test Paused</h2>
                        <p style={{ color: '#6b7280', margin: '0 0 24px' }}>Your progress is saved. Click Resume to continue.</p>
                        <button
                            onClick={togglePause}
                            style={{ padding: '10px 28px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
                        >
                            Resume
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <TestHeader
                testTitle={testData.title}
                testType={testData.type}
                testSkill={testData.skill}
                studentName={studentName}
                answeredCount={Object.keys(answers).length}
                totalQuestions={testData.questionCount || 0}
                timeRemaining={isFinite(timeRemaining) ? timeRemaining : Infinity}
                formatTime={formatTime}
                sessionStatus={testSubmitted ? 'completed' : 'in-progress'}
                isPaused={isPaused}
                isSubmitting={isSubmitting}
                testSubmitted={testSubmitted}
                testResults={headerResults as any}
                onSubmit={handleManualSubmit}
                mode="solo"
                onSettingsClick={() => setSettingsModalOpen(true)}
                onBack={handleBack}
            />

            {/* Pause button */}
            {resolvedSettings?.allowPause === true && !testSubmitted && hasTimer && (
                <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 9001 }}>
                    <button
                        onClick={togglePause}
                        style={{
                            padding: '10px 18px', borderRadius: 999, border: '1px solid #e5e7eb',
                            background: 'white', color: '#374151', fontWeight: 600, cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '0.875rem',
                        }}
                    >
                        {isPaused ? '▶ Resume' : '⏸ Pause'}
                    </button>
                </div>
            )}

            {/* Two-column layout */}
            <TwoColumnLayout
                leftColumn={
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {currentPassage && (
                            <PassageControls
                                fontSize={fontSize}
                                setFontSize={setFontSize}
                                lineSpacing={lineSpacing}
                                setLineSpacing={setLineSpacing}
                                highlighterActive={highlighterActive}
                                setHighlighterActive={setHighlighterActive}
                                highlightColor={highlightColor}
                                setHighlightColor={setHighlightColor}
                                onClearHighlights={handleClearHighlights}
                            />
                        )}
                        <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                            {currentPassage ? (
                                <PassageRenderer
                                    passage={currentPassage}
                                    fontSize={fontSize}
                                    lineSpacing={lineSpacing}
                                    highlighterActive={highlighterActive}
                                    highlightColor={highlightColor}
                                    clearHighlightsTrigger={clearHighlightsTrigger}
                                />
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No passage selected</div>
                            )}
                        </div>
                    </div>
                }
                rightColumn={
                    <IELTSQuestionsPanel
                        questions={displayQuestions}
                        currentPassageId={activePassageId}
                        answers={answers}
                        onAnswerChange={inputsDisabled ? () => { } : handleAnswerChange}
                        activeQuestionNumber={currentQuestionNumber}
                        onQuestionClick={goToQuestion}
                        testSubmitted={testSubmitted}
                        questionResults={testResults?.questionResults || {}}
                        partIndex={testData.passages?.findIndex((p: any) => p.id === activePassageId) ?? 0}
                        skill={testData.skill || 'reading'}
                    />
                }
            />

            {/* Footer navigation */}
            <InspiraFooterNav
                questions={displayQuestions}
                passages={testData.passages || []}
                answers={answers}
                activePassageId={activePassageId}
                activeQuestionNumber={currentQuestionNumber}
                onPassageChange={setActivePassageId}
                onQuestionClick={goToQuestion}
                onSubmit={handleManualSubmit}
                testSubmitted={testSubmitted}
                questionResults={testResults?.questionResults || {}}
            />

            {/* Time Up Overlay */}
            {showTimeUpOverlay && (
                <TimeUpOverlay
                    onComplete={() => console.log('⏰ [Practice] Grace period complete')}
                    countdownSeconds={gracePeriodRemaining}
                />
            )}

            {/* Solo Settings Modal */}
            {resolvedSettings && (
                <SoloSettingsModal
                    opened={settingsModalOpen}
                    onClose={() => setSettingsModalOpen(false)}
                    testSkill={testData.skill || 'Reading'}
                    resolvedSettings={resolvedSettings}
                    studentPrefs={studentPrefs}
                    onPrefsChange={handlePrefsChange}
                />
            )}
        </div>
    );
};

export default IELTSPracticeView;
