/**
 * THCSPracticeView — THCS test-taking for unsupervised contexts
 *
 * This is a FAITHFUL COPY of THCSTestLayout.tsx (the real test-taking interface)
 * with all RTDB session dependencies removed. The UI is identical.
 *
 * Differences from THCSTestLayout:
 * - No RTDB session listeners (player registration, heartbeat, session status)
 * - No RTDB answer auto-save
 * - Timer is local (not synced from session startTime)
 * - Submission saves to test_results/ + optionally homework_submissions/
 * - Navigation goes to homework detail or academic record (not waiting room)
 *
 * Reused from THCSTestLayout (100% matching UI):
 * - THCSSectionNav (top sections + bottom question pills)
 * - THCSPassagePanel (reading passages)
 * - THCSQuestionRenderer (all question types)
 * - THCSSubmitConfirmation modal
 * - Two-column / single-column layouts
 * - Gradient background, glassmorphism header, 3-zone header
 * - Section auto-advance, visited tracking
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Text, Alert } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useAuth } from '../../hooks/useAuth';

import THCSQuestionRenderer from '../thcs-student/THCSQuestionRenderer';
import THCSSectionNav from '../thcs-student/THCSSectionNav';
import type { SectionStatus } from '../thcs-student/THCSSectionNav';
import THCSPassagePanel from '../thcs-student/THCSPassagePanel';
import THCSSubmitConfirmation from '../thcs-student/THCSSubmitConfirmation';

import { markThcsTest, thcsResultToTestMarkingResult } from '../../services/thcsAutoMarking.service';
import { gradeWritingQuestions } from '../../services/thcsWritingGrading.service';
import { saveTestResult } from '../../services/testResults.service';
import { sendThcsFullyGradedNotification } from '../../services/notificationService';
import { getThcsTestFromFirebase } from '../../services/thcsTestStorage';
import { shuffleTest } from '../../utils/thcsShuffle';
import { Button } from '../modern';

import type { THCSTest } from '../../types/thcs-test.types';
import type { PracticeContext } from './IELTSPracticeView';

// ── Constants ──────────────────────────────────────────────────────────────────

const READING_INTENTS = ['reading-cloze-mcq', 'reading-comprehension', 'reading-announcement', 'reading-cloze-wordbank'];

// ── Props ──────────────────────────────────────────────────────────────────────

export interface THCSPracticeViewProps {
    materialId: string;
    practiceContext: PracticeContext;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const THCSPracticeView: React.FC<THCSPracticeViewProps> = ({
    materialId,
    practiceContext,
}) => {
    const navigate = useNavigate();

    // ── Load THCS test data ────────────────────────────────────────────────────
    const [testData, setTestData] = useState<THCSTest | null>(null);
    const [loadingTest, setLoadingTest] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!materialId) return;
        const load = async () => {
            setLoadingTest(true);
            try {
                const result = await getThcsTestFromFirebase(materialId);
                if (result.success && result.data) {
                    setTestData(result.data);
                } else {
                    setLoadError('Failed to load THCS test');
                }
            } catch (err) {
                console.error('[THCSPracticeView] Load error:', err);
                setLoadError('Failed to load THCS test');
            } finally {
                setLoadingTest(false);
            }
        };
        load();
    }, [materialId]);

    // ── Early return: loading / error ──────────────────────────────────────────
    if (loadingTest) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 50%, #f0fdfa 100%)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>Loading test...</div>
                </div>
            </div>
        );
    }

    if (loadError || !testData) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 50%, #f0fdfa 100%)' }}>
                <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>Test Not Found</div>
                    <div style={{ color: '#64748b', marginBottom: '1.5rem' }}>{loadError || 'Unable to load test.'}</div>
                    <Button variant="primary" onClick={() => navigate(-1)}>Go Back</Button>
                </div>
            </div>
        );
    }

    // Render the actual test experience
    return <THCSPracticeInner testData={testData} materialId={materialId} practiceContext={practiceContext} />;
};

// ── Inner component (only rendered after testData is loaded) ────────────────

const THCSPracticeInner: React.FC<{
    testData: THCSTest;
    materialId: string;
    practiceContext: PracticeContext;
}> = ({ testData, materialId, practiceContext }) => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const isHomework = practiceContext.type === 'homework';

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

    // Shuffle per student (deterministic)
    const shuffledTestData = useMemo(() => {
        if (!user?.uid) return testData;
        return shuffleTest(testData, user.uid);
    }, [testData, user?.uid]);

    // ── Navigation State ───────────────────────────────────────────────────────
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [visitedSections, setVisitedSections] = useState<Set<number>>(new Set([0]));

    // ── Answer State ───────────────────────────────────────────────────────────
    const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
    const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());

    // ── Submission State ───────────────────────────────────────────────────────
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [questionResults, setQuestionResults] = useState<Record<string, boolean>>({});
    const [scoreDisplay, setScoreDisplay] = useState<{
        scaledScore: number;
        rawScore: number;
        maxRaw: number;
        percentage: number;
        pendingWritingCount?: number;
    } | null>(null);

    // ── Timer (local, not session-synced) ──────────────────────────────────────
    const [timeRemaining, setTimeRemaining] = useState(testData.metadata.duration * 60);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleSubmitRef = useRef<() => void>(() => { });

    const currentSection = shuffledTestData.sections[currentSectionIndex];
    const allQuestions = shuffledTestData.sections.flatMap(s => s.questions);
    const totalQuestions = allQuestions.length;

    // Responsive
    const isMobile = useMediaQuery('(max-width: 767px)');
    const isTablet = useMediaQuery('(max-width: 1023px)');

    // ── Timer ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isSubmitted) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 1) {
                    handleSubmitRef.current();
                    return 0;
                }
                return prev - 1;
            });
            setTimeElapsed(prev => prev + 1);
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isSubmitted]);

    // ── Answer Management (same as THCSTestLayout) ─────────────────────────────
    const handleAnswer = useCallback((questionNumber: number, answer: string | string[] | null) => {
        const qNum = questionNumber.toString();
        setAnswers(prev => {
            const next = { ...prev };
            if (answer === null) {
                delete next[qNum];
            } else {
                next[qNum] = answer;
            }
            return next;
        });
    }, []);

    // ── Flag Toggle ────────────────────────────────────────────────────────────
    const handleToggleFlag = useCallback((questionId: string) => {
        setFlaggedQuestions(prev => {
            const next = new Set(prev);
            if (next.has(questionId)) {
                next.delete(questionId);
            } else {
                next.add(questionId);
            }
            return next;
        });
    }, []);

    // ── Section Navigation (same as THCSTestLayout) ────────────────────────────
    const handleSectionChange = useCallback((index: number) => {
        setCurrentSectionIndex(index);
        setCurrentQuestionIndex(0);
        setVisitedSections(prev => {
            const next = new Set(prev);
            next.add(index);
            return next;
        });
    }, []);

    const handleQuestionClick = useCallback((sectionIndex: number, questionIndex: number) => {
        setCurrentSectionIndex(sectionIndex);
        setCurrentQuestionIndex(questionIndex);
        const qId = shuffledTestData.sections[sectionIndex]?.questions[questionIndex]?.id;
        if (qId) {
            document.getElementById(`thcs-q-${qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [shuffledTestData]);

    // ── Question-level prev/next navigation ────────────────────────────────────
    const isFirstQuestionGlobally = currentSectionIndex === 0 && currentQuestionIndex === 0;
    const isLastQuestionGlobally = currentSectionIndex === shuffledTestData.sections.length - 1
        && currentQuestionIndex >= (currentSection?.questions?.length ?? 1) - 1;

    const handlePrevQuestion = useCallback(() => {
        if (currentQuestionIndex > 0) {
            const prevIdx = currentQuestionIndex - 1;
            setCurrentQuestionIndex(prevIdx);
            const qId = shuffledTestData.sections[currentSectionIndex]?.questions[prevIdx]?.id;
            if (qId) setTimeout(() => document.getElementById(`thcs-q-${qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        } else if (currentSectionIndex > 0) {
            const prevSecIdx = currentSectionIndex - 1;
            const prevSec = shuffledTestData.sections[prevSecIdx];
            const lastQIdx = (prevSec?.questions?.length ?? 1) - 1;
            handleSectionChange(prevSecIdx);
            setCurrentQuestionIndex(lastQIdx);
            setTimeout(() => {
                const qId = prevSec?.questions?.[lastQIdx]?.id;
                if (qId) document.getElementById(`thcs-q-${qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [currentQuestionIndex, currentSectionIndex, shuffledTestData, handleSectionChange]);

    const handleNextQuestion = useCallback(() => {
        const secQuestions = shuffledTestData.sections[currentSectionIndex]?.questions;
        if (secQuestions && currentQuestionIndex < secQuestions.length - 1) {
            const nextIdx = currentQuestionIndex + 1;
            setCurrentQuestionIndex(nextIdx);
            const qId = secQuestions[nextIdx]?.id;
            if (qId) setTimeout(() => document.getElementById(`thcs-q-${qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        } else if (currentSectionIndex < shuffledTestData.sections.length - 1) {
            handleSectionChange(currentSectionIndex + 1);
            setCurrentQuestionIndex(0);
            setTimeout(() => document.getElementById('thcs-questions-start')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
    }, [currentQuestionIndex, currentSectionIndex, shuffledTestData, handleSectionChange]);

    // ── Section Completion Tracking ─────────────────────────────────────────────
    const sectionStatuses: SectionStatus[] = useMemo(() => {
        return shuffledTestData.sections.map((section, i) => {
            const sectionAnswered = section.questions.filter(
                q => !!answers[q.questionNumber.toString()]
            ).length;
            const sectionTotal = section.questions.length;
            const isComplete = sectionAnswered === sectionTotal && sectionTotal > 0;

            if (i === currentSectionIndex) return 'active';
            if (isComplete) return 'completed';
            if (visitedSections.has(i) && !isComplete) return 'incomplete';
            return 'default';
        });
    }, [shuffledTestData.sections, answers, currentSectionIndex, visitedSections]);

    // ── Auto-advance to next section when current is fully answered ─────────
    useEffect(() => {
        if (isSubmitted) return;
        const section = shuffledTestData.sections[currentSectionIndex];
        if (!section) return;

        const sectionAnswered = section.questions.filter(
            q => !!answers[q.questionNumber.toString()]
        ).length;
        const sectionTotal = section.questions.length;

        let timer: ReturnType<typeof setTimeout> | null = null;

        if (sectionAnswered === sectionTotal && sectionTotal > 0) {
            const nextIncomplete = shuffledTestData.sections.findIndex((s, i) => {
                if (i <= currentSectionIndex) return false;
                const answered = s.questions.filter(q => !!answers[q.questionNumber.toString()]).length;
                return answered < s.questions.length;
            });

            if (nextIncomplete !== -1) {
                timer = setTimeout(() => {
                    handleSectionChange(nextIncomplete);
                    document.getElementById('thcs-questions-start')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 600);
            }
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [answers, currentSectionIndex, shuffledTestData.sections, isSubmitted, handleSectionChange]);

    // ── Submission ──────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!user?.uid || isSubmitting) return;

        setIsSubmitting(true);
        setShowSubmitConfirm(false);

        try {
            if (timerRef.current) clearInterval(timerRef.current);

            // Grade the test
            const gradingResult = markThcsTest(
                testData.id,
                user.uid,
                testData.sections,
                answers
            );

            // Build question results map
            const results: Record<string, boolean> = {};
            for (const [qNum, qr] of Object.entries(gradingResult.questionResults)) {
                results[qNum] = qr.isCorrect;
            }
            setQuestionResults(results);

            // Convert to TestMarkingResult
            const { markingResult, thcsData } = thcsResultToTestMarkingResult(
                gradingResult,
                testData.metadata,
                testData.sections
            );

            const percentage = gradingResult.maxPoints > 0
                ? Math.round((gradingResult.totalPoints / gradingResult.maxPoints) * 100 * 10) / 10
                : 0;

            setScoreDisplay({
                scaledScore: gradingResult.scaledScore,
                rawScore: gradingResult.totalPoints,
                maxRaw: gradingResult.maxPoints,
                percentage,
                pendingWritingCount: thcsData.pendingWritingCount,
            });

            // Save result
            const resultId = await saveTestResult(
                `practice_${materialId}_${Date.now()}`,
                testData.id,
                user.uid,
                user.displayName || 'Student',
                markingResult,
                {
                    title: testData.metadata.title,
                    type: 'THCS-THPT',
                    skill: 'Mixed',
                    duration: testData.metadata.duration,
                },
                timeElapsed,
                testData.createdBy || '',
                false,
                undefined,
                practiceContext.courseId && practiceContext.moduleId ? {
                    courseId: practiceContext.courseId,
                    moduleId: practiceContext.moduleId,
                } : undefined,
                {
                    type: practiceContext.type,
                    source: isHomework
                        ? { type: 'homework', id: practiceContext.homeworkId || '', name: '' }
                        : { type: 'library', id: '', name: 'Self Study' },
                } as any,
                thcsData
            );

            setIsSubmitted(true);

            // If homework, update homework_submissions
            if (isHomework && practiceContext.submissionId) {
                try {
                    const { submitHomework } = await import('../../services/homeworkSubmissionService');
                    await submitHomework(
                        practiceContext.submissionId,
                        resultId,
                        gradingResult.totalPoints,
                        gradingResult.maxPoints,
                        percentage,
                        gradingResult.scaledScore,
                        timeElapsed,
                    );
                    console.log('✅ [THCSPractice] Homework submission updated');
                } catch (err) {
                    console.warn('[THCSPractice] Homework submission update failed:', err);
                }
            }

            // Fire-and-forget: academic record
            if (gradingResult.gradingStatus === 'fully-graded') {
                import('../../services/academicRecordService').then(({ updateThcsProgress }) => {
                    updateThcsProgress(user.uid, {
                        testId: testData.id,
                        testTitle: testData.metadata.title,
                        scaledScore: gradingResult.scaledScore,
                        gradeLevel: testData.metadata.gradeLevel || 9,
                        examType: testData.metadata.examType || 'general',
                        sectionResults: gradingResult.sectionResults,
                    }).catch(err => console.warn('Academic record update failed:', err));
                }).catch(err => console.warn('Failed to load academicRecordService:', err));

                sendThcsFullyGradedNotification(
                    user.uid,
                    testData.metadata.title,
                    gradingResult.scaledScore,
                    isHomework ? practiceContext.homeworkId || `practice_${user.uid}` : `practice_${user.uid}`
                ).catch(err => console.warn('[THCSPractice] Fully graded notification failed:', err));
            }

            // Fire-and-forget: writing grading
            if (gradingResult.gradingStatus === 'auto-graded') {
                gradeWritingQuestions(gradingResult, testData.sections, `practice_${materialId}`, user.uid)
                    .catch(err => console.warn('Background writing grading failed:', err));
            }

            // Navigate after showing results briefly
            setTimeout(() => {
                if (isHomework) {
                    navigate('/student/homework', {
                        replace: true,
                        state: { justSubmitted: true },
                    });
                } else {
                    navigate('/student/academic-record', {
                        replace: true,
                        state: { resultId, showResult: true },
                    });
                }
            }, 4000);

        } catch (error) {
            console.error('Submission failed:', error);
            alert('Failed to submit. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }, [user, isSubmitting, testData, answers, materialId, timeElapsed, practiceContext, isHomework, navigate]);

    // Keep ref in sync for timer auto-submit
    handleSubmitRef.current = handleSubmit;

    // ── Warn on page leave ─────────────────────────────────────────────────────
    useEffect(() => {
        if (isSubmitted) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isSubmitted]);

    // ── Format Timer ───────────────────────────────────────────────────────────
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const answeredCount = Object.keys(answers).length;
    const unansweredCount = totalQuestions - answeredCount;

    // ════════════════════════════════════════════════════════════════════════════
    // RENDER — 100% matching THCSTestLayout UI
    // ════════════════════════════════════════════════════════════════════════════

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 50%, #f0fdfa 100%)',
            display: 'flex', flexDirection: 'column',
        }}>
            {/* Header — 3-zone layout: [Title+meta] [Student name] [Timer+Submit] */}
            <div style={{
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(139,92,246,0.1)',
                padding: isMobile ? '0.35rem 0.75rem' : '0.4rem 1rem',
                display: 'flex', alignItems: 'center',
                gap: '0.5rem',
                position: 'sticky', top: 0, zIndex: 11,
            }}>
                {/* Left zone — back + title + metadata */}
                <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: isMobile ? '0.4rem' : '0.75rem', flexWrap: 'wrap' }}>
                    {/* Back button */}
                    {!isSubmitted && (
                        <button
                            onClick={handleBack}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0.3rem',
                                color: '#64748b',
                                borderRadius: '0.375rem',
                                transition: 'all 0.15s ease',
                                flexShrink: 0,
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#6d28d9'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; }}
                            title="Go back"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>
                    )}
                    <Text fw={700} size={isMobile ? 'sm' : 'md'} style={{ color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} lineClamp={1}>
                        {testData.metadata.title}
                    </Text>
                    {isHomework && (
                        <span style={{
                            fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                            borderRadius: '0.25rem', background: 'rgba(37,99,235,0.1)', color: '#2563eb',
                        }}>
                            HOMEWORK
                        </span>
                    )}
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {isMobile
                            ? `${answeredCount}/${totalQuestions}`
                            : `Grade ${testData.metadata.gradeLevel} | ${testData.questionCount} questions | ${answeredCount}/${totalQuestions} answered`
                        }
                    </Text>
                </div>

                {/* Center zone — student name */}
                <div style={{
                    flex: '0 0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    padding: '0.2rem 0.75rem',
                    borderRadius: '1rem',
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.08))',
                    border: '1px solid rgba(139,92,246,0.12)',
                    whiteSpace: 'nowrap',
                    maxWidth: isMobile ? '28vw' : '200px',
                    overflow: 'hidden',
                }}>
                    {(profile?.avatarUrl || user?.photoURL) ? (
                        <img src={profile?.avatarUrl || user?.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {(user?.displayName || 'S').charAt(0).toUpperCase()}
                        </div>
                    )}
                    <Text size="xs" fw={600} c="#6d28d9" lineClamp={1} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user?.displayName || 'Student'}
                    </Text>
                </div>

                {/* Right zone — timer + submit */}
                <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: isMobile ? '0.4rem' : '0.75rem' }}>
                    {/* Timer */}
                    {!isSubmitted && (
                        <div style={{
                            padding: isMobile ? '0.15rem 0.4rem' : '0.25rem 0.75rem',
                            borderRadius: '2rem',
                            background: timeRemaining < 300 ? 'rgba(239,68,68,0.1)' : 'rgba(139,92,246,0.08)',
                            color: timeRemaining < 300 ? '#ef4444' : '#8b5cf6',
                            fontWeight: 700, fontSize: isMobile ? '0.8rem' : '1rem',
                            fontFamily: 'monospace',
                        }}>
                            ⏱ {formatTime(timeRemaining)}
                        </div>
                    )}

                    {/* Submit button */}
                    {!isSubmitted && (
                        <Button
                            variant="primary"
                            onClick={() => setShowSubmitConfirm(true)}
                            disabled={isSubmitting}
                            style={{ padding: isMobile ? '0.25rem 0.5rem' : '0.3rem 0.75rem', fontSize: isMobile ? '0.8rem' : '0.875rem' }}
                        >
                            {isSubmitting ? '⏳' : isMobile ? '📤' : '📤 Submit'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Section tabs — centered, below header */}
            <THCSSectionNav
                sections={shuffledTestData.sections}
                currentSectionIndex={currentSectionIndex}
                answers={answers}
                flaggedQuestions={flaggedQuestions}
                isReviewMode={isSubmitted}
                questionResults={questionResults}
                onSectionChange={handleSectionChange}
                onQuestionClick={handleQuestionClick}
                position="top"
                mode="sections-only"
                sectionStatuses={sectionStatuses}
            />

            {/* Score display (after submission) */}
            {isSubmitted && scoreDisplay && (
                <div style={{
                    padding: '1.5rem', textAlign: 'center',
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(99,102,241,0.08) 100%)',
                    borderBottom: '1px solid rgba(139,92,246,0.1)',
                }}>
                    <div style={{ fontSize: '3rem', fontWeight: 800, color: '#1e293b' }}>
                        {scoreDisplay.scaledScore.toFixed(1)}/10.0
                    </div>
                    <Text size="sm" c="dimmed">
                        Raw: {scoreDisplay.rawScore}/{scoreDisplay.maxRaw} points | {scoreDisplay.percentage.toFixed(1)}%
                    </Text>
                    {scoreDisplay.pendingWritingCount && scoreDisplay.pendingWritingCount > 0 && (
                        <Text size="xs" c="orange" mt={4} fw={600}>
                            ✍️ {scoreDisplay.pendingWritingCount} writing question{scoreDisplay.pendingWritingCount > 1 ? 's' : ''} pending review
                        </Text>
                    )}
                    <Text size="xs" c="dimmed" mt={8}>
                        Redirecting in a few seconds...
                    </Text>
                </div>
            )}

            {/* Time's up alert */}
            {isSubmitted && timeRemaining <= 0 && (
                <Alert color="orange" variant="light" mx="md" mt="md">
                    ⏰ Time's up! Your answers have been submitted.
                </Alert>
            )}

            {/* Main content */}
            <div style={{ flex: 1 }}>
                <Container size={currentSection?.layout === 'two-column' ? 'xl' : 'md'} py="md">
                    {currentSection && (
                        <>
                            {/* Section name + points */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <Text fw={700} size="md" style={{ color: '#1e293b' }}>
                                    {currentSection.name}
                                </Text>
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '0.25rem',
                                    background: 'rgba(139,92,246,0.1)',
                                    color: '#7c3aed',
                                }}>
                                    {currentSection.totalPoints} {currentSection.totalPoints === 1 ? 'pt' : 'pts'}
                                </span>
                            </div>

                            {/* Instruction — boxed */}
                            {currentSection.instructionText && (
                                <div style={{
                                    padding: '0.6rem 0.85rem',
                                    background: 'linear-gradient(135deg, rgba(139,92,246,0.04) 0%, rgba(99,102,241,0.06) 100%)',
                                    borderRadius: '0.5rem',
                                    border: '1px solid rgba(139,92,246,0.1)',
                                    borderLeft: '3px solid rgba(139,92,246,0.35)',
                                    marginBottom: '1rem',
                                }}>
                                    <Text size="sm" fw={500} style={{ lineHeight: 1.6, color: '#1e293b' }}>
                                        {currentSection.instructionText}
                                    </Text>
                                </div>
                            )}

                            {/* Two-column reading: dual independent scroll panels */}
                            {currentSection.layout === 'two-column' && currentSection.passage ? (
                                <div style={{
                                    display: isMobile ? 'flex' : 'grid',
                                    ...(isMobile
                                        ? { flexDirection: 'column' as const }
                                        : {
                                            gridTemplateColumns: isTablet ? '2fr 3fr' : '1fr 1fr',
                                            gap: '1rem',
                                        }
                                    ),
                                    ...(!isMobile ? { height: 'calc(100vh - 200px)' } : {}),
                                }}>
                                    {/* Left: Passage */}
                                    <div
                                        className="thcs-passage-scroll"
                                        style={{
                                            ...(isMobile
                                                ? { maxHeight: '50vh' }
                                                : { height: '100%' }
                                            ),
                                            overflowY: 'auto',
                                            scrollbarWidth: 'none',
                                            background: 'rgba(255,255,255,0.97)',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(139,92,246,0.12)',
                                            boxShadow: '0 2px 12px rgba(139,92,246,0.06)',
                                        }}
                                    >
                                        <div style={{
                                            padding: '1rem',
                                            fontSize: '0.9375rem',
                                            lineHeight: 1.8,
                                            whiteSpace: 'pre-wrap',
                                        }}>
                                            {currentSection.passage.imageUrl && (
                                                <img
                                                    src={currentSection.passage.imageUrl}
                                                    alt={currentSection.passage.title || 'Passage image'}
                                                    style={{ maxWidth: '100%', borderRadius: '0.5rem', marginBottom: '0.75rem' }}
                                                />
                                            )}
                                            {currentSection.passage.content}
                                        </div>
                                    </div>

                                    {/* Right: Questions */}
                                    <div style={{
                                        ...(isMobile
                                            ? {}
                                            : { height: '100%', overflowY: 'auto' }
                                        ),
                                        paddingRight: isMobile ? 0 : '0.25rem',
                                    }}>
                                        <div id="thcs-questions-start" />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {currentSection.questions.map((q) => (
                                                <div key={q.id} id={`thcs-q-${q.id}`}>
                                                    <THCSQuestionRenderer
                                                        question={q}
                                                        selectedAnswer={answers[q.questionNumber.toString()] || null}
                                                        onAnswer={(answer) => handleAnswer(q.questionNumber, answer)}
                                                        isFlagged={flaggedQuestions.has(q.id)}
                                                        onToggleFlag={() => handleToggleFlag(q.id)}
                                                        isReviewMode={isSubmitted}
                                                        isCorrect={questionResults[q.questionNumber.toString()]}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Single-column: passage stacked above questions */}
                                    {currentSection.passage && (
                                        <THCSPassagePanel
                                            passage={currentSection.passage}
                                            layout={currentSection.layout}
                                            isVisible={currentSection.questions.some(q => READING_INTENTS.includes(q.intent || q.type))}
                                            sectionName={currentSection.name}
                                            onScrollToQuestions={() => {
                                                document.getElementById('thcs-questions-start')?.scrollIntoView({ behavior: 'smooth' });
                                            }}
                                        />
                                    )}

                                    {/* Questions */}
                                    <div id="thcs-questions-start" />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {currentSection.questions.map((q) => (
                                            <div key={q.id} id={`thcs-q-${q.id}`}>
                                                <THCSQuestionRenderer
                                                    question={q}
                                                    selectedAnswer={answers[q.questionNumber.toString()] || null}
                                                    onAnswer={(answer) => handleAnswer(q.questionNumber, answer)}
                                                    isFlagged={flaggedQuestions.has(q.id)}
                                                    onToggleFlag={() => handleToggleFlag(q.id)}
                                                    isReviewMode={isSubmitted}
                                                    isCorrect={questionResults[q.questionNumber.toString()]}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </Container>
            </div>

            {/* Question pills — compact footer */}
            <THCSSectionNav
                sections={shuffledTestData.sections}
                currentSectionIndex={currentSectionIndex}
                answers={answers}
                flaggedQuestions={flaggedQuestions}
                isReviewMode={isSubmitted}
                questionResults={questionResults}
                onSectionChange={handleSectionChange}
                onQuestionClick={handleQuestionClick}
                position="bottom"
                mode="questions-only"
                isFirstQuestion={isFirstQuestionGlobally}
                isLastQuestion={isLastQuestionGlobally}
                onPrevQuestion={handlePrevQuestion}
                onNextQuestion={handleNextQuestion}
            />

            {/* Submit confirmation */}
            <THCSSubmitConfirmation
                opened={showSubmitConfirm}
                unansweredCount={unansweredCount}
                totalCount={totalQuestions}
                onConfirm={handleSubmit}
                onCancel={() => setShowSubmitConfirm(false)}
            />
        </div>
    );
};

export default THCSPracticeView;
