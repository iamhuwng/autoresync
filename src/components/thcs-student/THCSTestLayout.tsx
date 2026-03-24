/**
 * THCSTestLayout — Student test-taking view (PRD-0027 Task 5.2, 5.7, 5.8)
 * Handles answer state, auto-save, timer, submission, grading, and review.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// Native polyfills replacing Mantine components (Rule #15)
function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) setMatches(media.matches);
        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, [matches, query]);
    return matches;
}

const Container: React.FC<{ size?: 'md' | 'xl', py?: string, children: React.ReactNode }> = ({ size, children }) => (
    <div style={{ maxWidth: size === 'xl' ? 1140 : 960, margin: '0 auto', padding: '1rem' }}>
        {children}
    </div>
);

const Alert: React.FC<{ color: string, variant?: string, mx?: string, mt?: string, children: React.ReactNode }> = ({ color, children }) => {
    const bg = color === 'orange' ? 'rgba(239,68,68,0.1)' : color === 'blue' ? 'rgba(59,130,246,0.1)' : '#f8fafc';
    const text = color === 'orange' ? '#ef4444' : color === 'blue' ? '#3b82f6' : '#334155';
    return (
        <div style={{ background: bg, color: text, padding: '1rem', borderRadius: '0.5rem', margin: '1rem', fontWeight: 500 }}>
            {children}
        </div>
    );
};

const Text: React.FC<any> = ({ size, fw, c, mt, lineClamp, style, children, ...props }) => {
    const fontSize = size === 'xs' ? '0.75rem' : size === 'sm' ? '0.875rem' : size === 'md' ? '1rem' : '1rem';
    const color = c === 'dimmed' ? '#64748b' : c === 'orange' ? '#f59e0b' : c || 'inherit';
    const mergedStyle = {
        fontSize,
        fontWeight: fw || 400,
        color,
        marginTop: mt ? (typeof mt === 'number' ? mt : '0.25rem') : undefined,
        ...(lineClamp ? {
            display: '-webkit-box',
            WebkitLineClamp: lineClamp,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
        } : {}),
        ...style
    };
    return <div style={mergedStyle} {...props}>{children}</div>;
};
import { ref, set, update, onValue, runTransaction } from 'firebase/database';
import { database } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';

import THCSQuestionRenderer from './THCSQuestionRenderer';
import THCSRawTextFallback from './THCSRawTextFallback';
import THCSSectionNav from './THCSSectionNav';
import type { SectionStatus } from './THCSSectionNav';
import THCSPassagePanel from './THCSPassagePanel';
import THCSSubmitConfirmation from './THCSSubmitConfirmation';

import { markThcsTest, thcsResultToTestMarkingResult } from '../../services/thcsAutoMarking.service';
import { gradeWritingQuestions } from '../../services/thcsWritingGrading.service';
import { saveTestResult } from '../../services/testResults.service';
import { sendThcsFullyGradedNotification } from '../../services/notificationService';
import { Button } from '../modern';

import type { THCSTest } from '../../types/thcs-test.types';
import { shuffleTest } from '../../utils/thcsShuffle';

interface THCSTestLayoutProps {
    testData: THCSTest;
    sessionCode: string;
}

const READING_INTENTS = ['reading-cloze-mcq', 'reading-comprehension', 'reading-announcement', 'reading-cloze-wordbank'];

const THCSTestLayout: React.FC<THCSTestLayoutProps> = ({ testData, sessionCode }) => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    // Task 6.3: Apply deterministic shuffle per student (display only)
    const shuffledTestData = useMemo(() => {
        if (!user?.uid) return testData;
        return shuffleTest(testData, user.uid);
    }, [testData, user?.uid]);

    // Navigation state
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // Track which sections the student has visited (for incomplete-warning coloring)
    const [visitedSections, setVisitedSections] = useState<Set<number>>(new Set([0]));

    // Answer state: key = questionNumber (string), value = string | string[]
    const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
    const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());

    // Submission state
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

    // Timer — synced from session
    const [timeRemaining, setTimeRemaining] = useState(testData.metadata.duration * 60);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Session sync state
    const [sessionStatus, setSessionStatus] = useState<'waiting' | 'in-progress' | 'completed' | string>('in-progress');
    const [isPaused, setIsPaused] = useState(false);
    const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
    const [pausedDuration, setPausedDuration] = useState(0);
    const [teacherEndTriggered, setTeacherEndTriggered] = useState(false);

    // Auto-save debounce
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // CRIT-1 fix: Ref to always call the latest handleSubmit from the timer
    const handleSubmitRef = useRef<() => void>(() => { });
    // CRIT-2 fix: Ref to track latest answers for saveAnswersToRTDB
    const answersRef = useRef(answers);
    answersRef.current = answers;
    // MOD-4 fix: Ref for saveAnswersToRTDB so handleAnswer never captures stale version
    const saveAnswersToRTDBRef = useRef<(answer: string | string[] | undefined, qNum: string) => void>(() => { });

    // Writing sync: Per Integration Safety Rule #6 — use refs for interval values
    const writingAnswersRef = useRef<Record<string, string>>({});
    const writingQuestionNums = useMemo(() => {
        return shuffledTestData.sections.flatMap(s => s.questions)
            .filter(q => q.type === 'sentence-rewrite' || q.type === 'sentence-rewrite-keyword')
            .map(q => q.questionNumber.toString());
    }, [shuffledTestData.sections]);

    const currentSection = shuffledTestData.sections[currentSectionIndex];
    const allQuestions = shuffledTestData.sections.flatMap(s => s.questions);
    const totalQuestions = allQuestions.length;

    // Responsive breakpoints
    const isMobile = useMediaQuery('(max-width: 767px)');
    const isTablet = useMediaQuery('(max-width: 1023px)');

    // ─── Player Registration ────────────────────────────────────
    // Register THCS student in players/ node so monitor sees them
    useEffect(() => {
        if (!user?.uid || !sessionCode) return;

        const playerRef = ref(database, `game_sessions/${sessionCode}/players/${user.uid}`);
        const now = Date.now();

        // Register player with name and join timestamp
        update(playerRef, {
            name: user.displayName || 'Student',
            playerName: user.displayName || 'Student',
            joinedAt: now,
            lastActivity: now,
            isConnected: true,
            hasSubmitted: false,
            isSubmitted: false,
            hasCompletedTest: false,
        }).then(() => {
            console.log(`✅ [THCS] Player registered: ${user.uid}`);
        }).catch(err => {
            console.warn('[THCS] Player registration failed:', err);
        });

        // Cleanup: mark disconnected on unmount
        return () => {
            update(playerRef, {
                isConnected: false,
                lastActivity: Date.now(),
            }).catch(() => { /* ignore cleanup errors */ });
        };
    }, [user?.uid, sessionCode]);

    // ─── Session State Listener ───────────────────────────────
    // Listen for teacher actions: pause, resume, end test, timer sync
    useEffect(() => {
        if (!sessionCode) return;

        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const unsubscribe = onValue(sessionRef, (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.val();

            // Session status
            const status = data.status || 'waiting';
            setSessionStatus(status);
            setIsPaused(data.isPaused || false);

            // Timer sync: use session startTime for synchronized countdown
            if (status === 'in-progress' && data.startTime) {
                setSessionStartTime(data.startTime);
            }

            // Paused duration tracking
            if (data.pausedAt && !data.resumedAt) {
                // Currently paused
                setPausedDuration((data.pausedDuration || 0) + (Date.now() - data.pausedAt));
            } else {
                setPausedDuration(data.pausedDuration || 0);
            }

            // Teacher ended test: testId cleared or status changed to 'waiting'
            // while we haven't submitted yet
            if (!data.testId && !isSubmitted) {
                console.log('⚠️ [THCS] Teacher ended test — triggering auto-submit');
                setTeacherEndTriggered(true);
            }
        });

        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionCode]); // isSubmitted accessed via ref pattern below

    // Handle teacher-end auto-submit
    useEffect(() => {
        if (teacherEndTriggered && !isSubmitted && !isSubmitting) {
            console.log('🔄 [THCS] Auto-submitting due to teacher end...');
            handleSubmitRef.current();
        }
    }, [teacherEndTriggered, isSubmitted, isSubmitting]);

    // ─── LastActivity Heartbeat ───────────────────────────────
    // Update lastActivity every 15s so the monitor can detect disconnects
    useEffect(() => {
        if (!user?.uid || !sessionCode || isSubmitted) return;

        const heartbeatInterval = setInterval(() => {
            const activityRef = ref(database, `game_sessions/${sessionCode}/players/${user.uid}/lastActivity`);
            set(activityRef, Date.now()).catch(() => { /* ignore */ });
        }, 15000);

        return () => clearInterval(heartbeatInterval);
    }, [user?.uid, sessionCode, isSubmitted]);

    // ─── Timer ─────────────────────────────────────────────────
    // Synced from session startTime. Pauses when teacher pauses.
    // CRIT-1 fix: Use handleSubmitRef.current inside interval to avoid stale closure.
    // Per Integration Safety Rule #6: hot values must go through refs in intervals.
    useEffect(() => {
        if (isSubmitted || isPaused) {
            // Clear timer when paused or submitted
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            const testDurationMs = testData.metadata.duration * 60 * 1000;

            if (sessionStartTime) {
                // Synced timer: calculate from session startTime
                const now = Date.now();
                const elapsed = now - sessionStartTime - pausedDuration;
                const remaining = Math.max(0, Math.floor((testDurationMs - elapsed) / 1000));
                const elapsedSec = Math.floor(elapsed / 1000);

                setTimeRemaining(remaining);
                setTimeElapsed(elapsedSec);

                if (remaining <= 0) {
                    handleSubmitRef.current();
                }
            } else {
                // Fallback: local countdown (pre-start or no session sync)
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        handleSubmitRef.current();
                        return 0;
                    }
                    return prev - 1;
                });
                setTimeElapsed(prev => prev + 1);
            }
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSubmitted, isPaused, sessionStartTime, pausedDuration, testData.metadata.duration]);

    // ─── Writing Sync Interval (10s) ───────────────────────────
    useEffect(() => {
        if (isSubmitted || writingQuestionNums.length === 0) return;

        const intervalId = setInterval(() => {
            // Read from ref (not state) per Safety Rule #6
            const current = writingAnswersRef.current;
            if (Object.keys(current).length === 0) return;
            // Sync all writing answers
            Object.entries(current).forEach(([qNum, val]) => {
                saveAnswersToRTDBRef.current(val, qNum);
            });
        }, 10000);

        return () => clearInterval(intervalId);
    }, [isSubmitted, writingQuestionNums]);

    // ─── Answer Management ──────────────────────────────────────
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

        // Update writing ref if this is a writing question
        if (writingQuestionNums.includes(qNum)) {
            if (typeof answer === 'string') {
                writingAnswersRef.current[qNum] = answer;
            } else {
                delete writingAnswersRef.current[qNum];
            }
            // Writing: no immediate debounced save — handled by 10s interval
            return;
        }

        // Non-writing: Auto-save to RTDB (debounced 500ms)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveAnswersToRTDBRef.current(answer === null ? undefined : answer, qNum);
        }, 500);
    }, [writingQuestionNums]);

    const saveAnswersToRTDB = useCallback(async (answer: string | string[] | undefined, qNum: string) => {
        if (!user?.uid || !sessionCode) return;
        try {
            // Write to players/ path — the same node the monitor listens to
            const answerRef = ref(database, `game_sessions/${sessionCode}/players/${user.uid}/answers/${qNum}`);
            await set(answerRef, answer ?? null);

            // CRIT-2 fix: Read from answersRef.current (always latest) instead of closure
            const answeredCount = Object.keys(answersRef.current).length;
            const playerRef = ref(database, `game_sessions/${sessionCode}/players/${user.uid}`);
            await update(playerRef, {
                answeredCount,
                progress: Math.round((answeredCount / totalQuestions) * 100),
                lastActivity: Date.now(),
                currentSection: currentSectionIndex,
            });
        } catch (err) {
            console.warn('Auto-save failed:', err);
        }
    }, [user, sessionCode, totalQuestions, currentSectionIndex]);
    // Keep ref in sync
    saveAnswersToRTDBRef.current = saveAnswersToRTDB;

    // ─── Flag Toggle ────────────────────────────────────────────
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

    // ─── Navigation ─────────────────────────────────────────────
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
        // Scroll to question
        const qId = shuffledTestData.sections[sectionIndex]?.questions[questionIndex]?.id;
        if (qId) {
            document.getElementById(`thcs-q-${qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [shuffledTestData]);

    // ─── Question-level prev/next navigation ─────────────────────
    const isFirstQuestionGlobally = currentSectionIndex === 0 && currentQuestionIndex === 0;
    const isLastQuestionGlobally = currentSectionIndex === shuffledTestData.sections.length - 1
        && currentQuestionIndex >= (currentSection?.questions?.length ?? 1) - 1;

    const handlePrevQuestion = useCallback(() => {
        if (currentQuestionIndex > 0) {
            // Move within current section
            const prevIdx = currentQuestionIndex - 1;
            setCurrentQuestionIndex(prevIdx);
            const qId = shuffledTestData.sections[currentSectionIndex]?.questions[prevIdx]?.id;
            if (qId) setTimeout(() => document.getElementById(`thcs-q-${qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        } else if (currentSectionIndex > 0) {
            // Cross to previous section's last question
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
            // Move within current section
            const nextIdx = currentQuestionIndex + 1;
            setCurrentQuestionIndex(nextIdx);
            const qId = secQuestions[nextIdx]?.id;
            if (qId) setTimeout(() => document.getElementById(`thcs-q-${qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        } else if (currentSectionIndex < shuffledTestData.sections.length - 1) {
            // Cross to next section's first question
            handleSectionChange(currentSectionIndex + 1);
            setCurrentQuestionIndex(0);
            setTimeout(() => document.getElementById('thcs-questions-start')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
    }, [currentQuestionIndex, currentSectionIndex, shuffledTestData, handleSectionChange]);

    // ─── Submission ─────────────────────────────────────────────
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

            // Build question results map from gradingResult.questionResults (Record<number, QuestionResult>)
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
                sessionCode,
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
                testData.createdBy,
                false,
                undefined,
                undefined,
                undefined,
                thcsData
            );

            // Mark player as submitted in the session so monitor shows correct status
            // This MUST happen BEFORE navigation so the waiting room can detect completion
            if (user?.uid && sessionCode) {
                const playerRef = ref(database, `game_sessions/${sessionCode}/players/${user.uid}`);
                await update(playerRef, {
                    isSubmitted: true,
                    hasCompletedTest: true,
                    hasSubmitted: true,
                    submittedAt: Date.now(),
                    completedAt: Date.now(),
                    submittedBy: teacherEndTriggered ? 'teacher-end' : 'student',
                    bandScore: gradingResult.scaledScore,
                    score: gradingResult.totalPoints,
                    maxScore: gradingResult.maxPoints,
                    timeElapsed,
                }).catch(err => console.warn('[THCS] Player submission update failed:', err));
            }

            // Set submitted before navigation
            setIsSubmitted(true);

            // PRD-TEST-END-FLOW: Navigate to waiting room with results modal
            // This matches the IELTS flow exactly — student leaves the test page
            // and sees the rich TestResultsModal in the waiting room
            console.log('✅ [THCS] Redirecting to waiting lobby with results modal');
            navigate(`/student-wait/${sessionCode}`, {
                replace: true,
                state: { showResults: true, sessionCode, testId: testData.id },
            });

            // === Fire-and-forget operations (run after navigation is triggered) ===

            // BUG-FIX: test stats update is fire-and-forget
            // Students may not have write permission to tests/ node (teacher-only),
            // so this MUST NOT block submission or cause error alert
            runTransaction(ref(database, `tests/${testData.id}/stats`), (current) => {
                if (!current) {
                    return {
                        attempts: 1,
                        averageScore: gradingResult.scaledScore,
                        averageTime: timeElapsed,
                        completionRate: 100,
                    };
                }
                const newCount = current.attempts + 1;
                return {
                    attempts: newCount,
                    averageScore: ((current.averageScore * current.attempts) + gradingResult.scaledScore) / newCount,
                    averageTime: ((current.averageTime * current.attempts) + timeElapsed) / newCount,
                    completionRate: 100,
                };
            }).catch(err => console.warn('[THCS] Stats update failed (expected for students):', err.message));

            // Task 12.4: Update academic record for fully-graded tests
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

                // Phase 3 Task 3.3: Notify student that test is fully graded
                sendThcsFullyGradedNotification(
                    user.uid,
                    testData.metadata.title,
                    gradingResult.scaledScore,
                    `${sessionCode}_${user.uid}`
                ).catch(err => console.warn('[THCS] Fully graded notification failed:', err));
            }

            // Task 5.7: Fire-and-forget writing grading trigger
            if (gradingResult.gradingStatus === 'auto-graded') {
                gradeWritingQuestions(gradingResult, testData.sections, sessionCode, user.uid)
                    .catch(err => console.warn('Background writing grading failed:', err));
                console.info(`[THCS] ${thcsData.pendingWritingCount} writing question(s) pending grading`);
            }

            // Fire-and-forget: formative feedback generation from the saved result
            import('../../services/resultFeedbackGeneration.service').then(({ triggerFormativeFeedbackForSavedResult }) => {
                triggerFormativeFeedbackForSavedResult(resultId);
            }).catch(err => console.warn('Failed to load resultFeedbackGeneration service:', err));
        } catch (error) {
            console.error('Submission failed:', error);
            alert('Failed to submit. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }, [user, isSubmitting, testData, answers, sessionCode, timeElapsed, teacherEndTriggered]);
    // CRIT-1 fix: Keep handleSubmitRef in sync so the timer always calls the latest version
    handleSubmitRef.current = handleSubmit;

    // ─── Format Timer ───────────────────────────────────────────
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const answeredCount = Object.keys(answers).length;
    const unansweredCount = totalQuestions - answeredCount;

    // ─── Section Completion Tracking ─────────────────────────────
    // Compute per-section status: completed (green), incomplete (red), or default
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

    // ─── Auto-advance to next section when current section is fully answered ───
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
            // Find next incomplete section
            const nextIncomplete = shuffledTestData.sections.findIndex((s, i) => {
                if (i <= currentSectionIndex) return false;
                const answered = s.questions.filter(q => !!answers[q.questionNumber.toString()]).length;
                return answered < s.questions.length;
            });

            if (nextIncomplete !== -1) {
                // Small delay so the student sees the last answer register
                timer = setTimeout(() => {
                    handleSectionChange(nextIncomplete);
                    // Scroll to top of content
                    document.getElementById('thcs-questions-start')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 600);
            }
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [answers, currentSectionIndex, shuffledTestData.sections, isSubmitted, handleSectionChange]);

    // ═══════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════

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
                {/* Left zone — title + metadata */}
                <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'baseline', gap: isMobile ? '0.4rem' : '0.75rem', flexWrap: 'wrap' }}>
                    <Text fw={700} size={isMobile ? 'sm' : 'md'} style={{ color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} lineClamp={1}>
                        {testData.metadata.title}
                    </Text>
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
                </div>
            )}

            {/* Waiting overlay (test not started yet) */}
            {sessionStatus === 'waiting' && !isSubmitted && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                }}>
                    <div style={{
                        background: 'white', borderRadius: '1rem', padding: '3rem',
                        textAlign: 'center', maxWidth: '400px',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                            Waiting for Teacher
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                            The test session hasn't started yet. Please wait for your teacher...
                        </div>
                    </div>
                </div>
            )}

            {/* Paused overlay */}
            {isPaused && !isSubmitted && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                }}>
                    <div style={{
                        background: 'white', borderRadius: '1rem', padding: '3rem',
                        textAlign: 'center', maxWidth: '400px',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏸️</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                            Test Paused
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                            Your teacher has paused the test. Please wait...
                        </div>
                    </div>
                </div>
            )}

            {/* Time's up alert */}
            {isSubmitted && timeRemaining <= 0 && (
                <Alert color="orange" variant="light" mx="md" mt="md">
                    ⏰ Time's up! Your answers have been submitted.
                </Alert>
            )}

            {/* Teacher-ended auto-submit alert */}
            {isSubmitted && teacherEndTriggered && (
                <Alert color="blue" variant="light" mx="md" mt="md">
                    📋 Your teacher has ended the test. Your answers have been submitted automatically.
                </Alert>
            )}

            {/* Main content — NO overflowY so sticky works for passage panel */}
            <div style={{ flex: 1 }}>
                <Container size={currentSection?.layout === 'two-column' ? 'xl' : 'md'} py="md">
                    {currentSection && (
                        <>
                            {/* Section name + points — plain */}
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
                                    /* Fixed height so both panels independently scroll */
                                    ...(!isMobile ? { height: 'calc(100vh - 200px)' } : {}),
                                }}>
                                    {/* Left: Passage — own scroll area, hidden scrollbar */}
                                    <div
                                        className="thcs-passage-scroll"
                                        style={{
                                            ...(isMobile
                                                ? { maxHeight: '50vh' }
                                                : { height: '100%' }
                                            ),
                                            overflowY: 'auto',
                                            scrollbarWidth: 'none', /* Firefox */
                                            background: 'rgba(255,255,255,0.97)',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(139,92,246,0.12)',
                                            boxShadow: '0 2px 12px rgba(139,92,246,0.06)',
                                        }}
                                    >
                                        {/* Passage content */}
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

                                    {/* Right: Questions — own scroll area */}
                                    <div style={{
                                        ...(isMobile
                                            ? {}
                                            : { height: '100%', overflowY: 'auto' }
                                        ),
                                        paddingRight: isMobile ? 0 : '0.25rem',
                                    }}>
                                        <div id="thcs-questions-start" />
                                        {currentSection.isRawTextFallback ? (
                                            <THCSRawTextFallback
                                                section={currentSection}
                                                answers={Object.fromEntries(
                                                    currentSection.questions.map(q => [
                                                        q.questionNumber.toString(),
                                                        (answers[q.questionNumber.toString()] as string) || ''
                                                    ])
                                                )}
                                                onAnswerChange={(qId, val) => handleAnswer(parseInt(qId), val)}
                                                isReviewMode={isSubmitted}
                                            />
                                        ) : (
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
                                        )}
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
                                    {currentSection.isRawTextFallback ? (
                                        <THCSRawTextFallback
                                            section={currentSection}
                                            answers={Object.fromEntries(
                                                currentSection.questions.map(q => [
                                                    q.questionNumber.toString(),
                                                    (answers[q.questionNumber.toString()] as string) || ''
                                                ])
                                            )}
                                            onAnswerChange={(qId, val) => handleAnswer(parseInt(qId), val)}
                                            isReviewMode={isSubmitted}
                                        />
                                    ) : (
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
                                    )}
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

export default THCSTestLayout;
