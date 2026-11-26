/**
 * WritingTestPage
 * Student writing test interface for live sessions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, set } from 'firebase/database';
// @ts-ignore - JS service file
import { database } from '../../services/firebase';
import { effectiveNow, normalizeServerTimeOffset } from '../../services/serverClock';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../constants/routes';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { toast } from '../modern/ToastNotification';
import WritingPromptPanel from './WritingPromptPanel';
import WritingEditor from './WritingEditor';
import WritingSubmitModal from './WritingSubmitModal';
import { useActiveTimeTracking } from '../../hooks/useActiveTimeTracking';
import { useWritingAutoSave, type WritingAutoSaveStatus } from '../../hooks/useWritingAutoSave';
import { useExternalPastePrevention } from '../../hooks/useExternalPastePrevention';
import { useAppLifecycle } from '../../core/platform/hooks/useAppLifecycle';
import { autoSubmitFromRTDB } from '../../services/writingSubmissionService';
import type { IELTSWritingTest } from '../../types/ielts-writing.types';
import './WritingTestPage.css';

const MAX_AUTO_SUBMIT_ATTEMPTS = 3;
const AUTO_SUBMIT_RETRY_BASE_MS = 4000;

interface WritingTestPageProps {
    testData: IELTSWritingTest;
    sessionCode: string;
}

type SubmissionSource = 'manual' | 'timer-expiry' | 'teacher-ended';

interface SessionTimingState {
    status: string;
    isPaused: boolean;
    startTime: number | null;
    pausedDuration: number;
    pausedAt: number | null;
    durationSeconds: number;
}

function getWordCount(text: string): number {
    return text.trim() ? text.trim().split(/\s+/).filter((word) => word.length > 0).length : 0;
}

function computeSessionRemainingSeconds(
    timing: SessionTimingState,
    serverTimeOffsetMs: number,
): number | null {
    if (timing.status === 'completed') {
        return 0;
    }

    if (timing.status !== 'in-progress' || timing.startTime === null) {
        return null;
    }

    const now = effectiveNow(Date.now(), serverTimeOffsetMs);
    const activePauseMs = timing.isPaused && timing.pausedAt !== null
        ? Math.max(0, now - timing.pausedAt)
        : 0;
    const elapsedSeconds = Math.max(
        0,
        Math.floor((now - timing.startTime - timing.pausedDuration - activePauseMs) / 1000),
    );
    return Math.max(0, timing.durationSeconds - elapsedSeconds);
}

export default function WritingTestPage({ testData, sessionCode }: WritingTestPageProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testTaking);
    const studentId = user?.uid || '';
    const studentName = user?.displayName || user?.email || 'Anonymous';

    const taskCount = testData.metadata.format === 'full-test' ? 2 : 1;
    const showTask1 = testData.metadata.format !== 'task2-only';
    const showTask2 = testData.metadata.format !== 'task1-only';
    const defaultTask: 1 | 2 = showTask1 ? 1 : 2;

    const clampTaskNumber = useCallback((candidate: number): 1 | 2 => {
        if (candidate === 1 && showTask1) return 1;
        if (candidate === 2 && showTask2) return 2;
        return defaultTask;
    }, [defaultTask, showTask1, showTask2]);

    const [activeTask, setActiveTask] = useState<1 | 2>(defaultTask);
    const [essays, setEssays] = useState<{ 1: string; 2: string }>({ 1: '', 2: '' });
    const [submitted, setSubmitted] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [autoSaveStatus, setAutoSaveStatus] = useState<WritingAutoSaveStatus>('idle');

    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [sessionStatus, setSessionStatus] = useState<string>('waiting');
    const [isPaused, setIsPaused] = useState(false);
    const [detectCopyPaste, setDetectCopyPaste] = useState(false);
    const [pasteAttemptCountHydrated, setPasteAttemptCountHydrated] = useState(false);
    const [autoSubmitExhausted, setAutoSubmitExhausted] = useState(false);

    const hasAutoSubmittedRef = useRef(false);
    const autoSubmitAttemptsRef = useRef(0);
    const nextAutoSubmitRetryAtRef = useRef(0);
    const submissionInFlightRef = useRef(false);
    const submittedRef = useRef(false);
    submittedRef.current = submitted;
    const reopenedRef = useRef(false);
    const remoteSubmittedRef = useRef(false);
    const essaysRef = useRef(essays);
    essaysRef.current = essays;

    const prevSessionStatusRef = useRef<string>('waiting');
    const savedStatePromiseRef = useRef<Promise<void> | null>(null);
    const activeTimeSeededRef = useRef(false);
    const serverTimeOffsetRef = useRef(0);
    const sessionTimingRef = useRef<SessionTimingState>({
        status: 'waiting',
        isPaused: false,
        startTime: null,
        pausedDuration: 0,
        pausedAt: null,
        durationSeconds: (testData.metadata.duration || 60) * 60,
    });
    const pasteAttemptCountRef = useRef(0);
    const handleSubmitRef = useRef<(source?: SubmissionSource) => Promise<void>>(async () => {});

    const activeTime = useActiveTimeTracking(taskCount as 1 | 2);
    const autoSave = useWritingAutoSave(sessionCode, studentId, {
        onSaveStatusChange: setAutoSaveStatus,
    });
    const {
        pasteAttemptCount,
        setPasteAttemptCount,
        attachToTextarea,
    } = useExternalPastePrevention({
        enabled: detectCopyPaste,
        initialPasteAttemptCount: 0,
    });
    pasteAttemptCountRef.current = pasteAttemptCount;

    const handleSubmit = useCallback(async (submissionSource: SubmissionSource = 'manual') => {
        if (
            submissionInFlightRef.current
            || submittedRef.current
            || sessionTimingRef.current.status === 'completed'
        ) {
            return;
        }

        submissionInFlightRef.current = true;
        setSubmitting(true);
        setShowSubmitModal(false);

        try {
            await savedStatePromiseRef.current;
            activeTime.pause?.();
            await autoSave.flushPendingSave();

            const activeTimesPayload = {
                1: activeTime.getActiveTime?.(1) ?? 0,
                2: activeTime.getActiveTime?.(2) ?? 0,
            };
            await autoSave.saveActiveTimes?.(activeTimesPayload);

            if (studentId && sessionCode) {
                await set(
                    ref(database, `game_sessions/${sessionCode}/students/${studentId}/writing/pasteAttemptCount`),
                    pasteAttemptCountRef.current,
                );
            }

            await autoSubmitFromRTDB(sessionCode, studentId, studentName, testData);
            submittedRef.current = true;
            setSubmitted(true);
            setAutoSubmitExhausted(false);

            trackAction('finishTest', {
                testSkill: 'Writing',
                submissionSource,
                outcome: 'submitted',
            });

            console.log('[WritingTestPage] Redirecting to submission-complete after writing submission.');
            navigate(ROUTES.SUBMISSION_COMPLETE, {
                replace: true,
                state: {
                    sessionCode,
                    testId: testData.id,
                    studentName,
                },
            });
        } catch (err) {
            console.error('Submit failed:', err);
            const currentStatus = sessionTimingRef.current.status;
            if (currentStatus === 'completed') {
                // Under database.rules.json, student writes to game_sessions/$code/students/$uid
                // are disallowed once the session is completed; teacher finalization owns completion.
                hasAutoSubmittedRef.current = true;
                setAutoSubmitExhausted(false);
                toast.info('This session has been closed by your teacher. Your saved draft is preserved while your teacher finalizes submissions.');
            } else if (submissionSource === 'manual') {
                const remaining = computeSessionRemainingSeconds(
                    sessionTimingRef.current,
                    serverTimeOffsetRef.current,
                );
                if (remaining === 0 || currentStatus !== 'in-progress') {
                    hasAutoSubmittedRef.current = true;
                    setAutoSubmitExhausted(true);
                } else {
                    hasAutoSubmittedRef.current = false;
                }
                toast.error('Failed to submit your writing test. Your draft is preserved — please try again.');
            } else if (submissionSource === 'teacher-ended') {
                hasAutoSubmittedRef.current = true;
                setAutoSubmitExhausted(true);
                toast.error('Automatic submission failed when the session ended. Your draft is preserved — click Retry Submit to try again.');
            } else {
                const canAutoRetryOnTimer = currentStatus === 'in-progress' && !sessionTimingRef.current.isPaused;
                autoSubmitAttemptsRef.current += 1;
                if (canAutoRetryOnTimer && autoSubmitAttemptsRef.current < MAX_AUTO_SUBMIT_ATTEMPTS) {
                    const backoffMs = AUTO_SUBMIT_RETRY_BASE_MS * (2 ** (autoSubmitAttemptsRef.current - 1));
                    nextAutoSubmitRetryAtRef.current = Date.now() + backoffMs;
                    hasAutoSubmittedRef.current = false;
                    toast.error('Automatic submission failed. Retrying shortly — you can also click Submit Test now.');
                } else {
                    hasAutoSubmittedRef.current = true;
                    setAutoSubmitExhausted(true);
                    toast.error(
                        canAutoRetryOnTimer
                            ? 'Automatic submission failed after multiple attempts. Your draft is preserved — click Retry Submit to try again.'
                            : 'Automatic submission failed. Your draft is preserved — click Retry Submit to try again.',
                    );
                }
            }
        } finally {
            submissionInFlightRef.current = false;
            setSubmitting(false);
        }
    }, [activeTime, autoSave, navigate, sessionCode, studentId, studentName, testData, trackAction]);

    handleSubmitRef.current = handleSubmit;

    // Sync server clock offset so student device clock skew cannot corrupt exam timer
    useEffect(() => {
        if (!sessionCode) return;

        const offsetRef = ref(database, '.info/serverTimeOffset');
        const unsub = onValue(offsetRef, (snap: any) => {
            serverTimeOffsetRef.current = normalizeServerTimeOffset(snap?.val?.());
            const updatedRemaining = computeSessionRemainingSeconds(
                sessionTimingRef.current,
                serverTimeOffsetRef.current,
            );
            if (updatedRemaining !== null) {
                setTimeRemaining(updatedRemaining);
            }
        });

        return () => unsub();
    }, [sessionCode]);

    useEffect(() => {
        if (!sessionCode) return;

        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const unsub = onValue(sessionRef, (snap: any) => {
            if (!snap.exists()) return;

            const data = snap.val();
            const nextStatus = data.status || 'waiting';
            const nextPaused = Boolean(data.isPaused);
            const sessionDurationMinutes = typeof data.duration === 'number' && data.duration > 0
                ? data.duration
                : (testData.metadata.duration || 60);

            sessionTimingRef.current = {
                status: nextStatus,
                isPaused: nextPaused,
                startTime: typeof data.startTime === 'number' && Number.isFinite(data.startTime)
                    ? data.startTime
                    : null,
                pausedDuration: typeof data.pausedDuration === 'number' && Number.isFinite(data.pausedDuration)
                    ? data.pausedDuration
                    : 0,
                pausedAt: nextPaused && typeof data.pausedAt === 'number' && Number.isFinite(data.pausedAt)
                    ? data.pausedAt
                    : null,
                durationSeconds: sessionDurationMinutes * 60,
            };

            setSessionStatus(nextStatus);
            setIsPaused(nextPaused);
            setDetectCopyPaste(Boolean(data.antiCheatConfig?.detectCopyPaste));

            const remaining = computeSessionRemainingSeconds(
                sessionTimingRef.current,
                serverTimeOffsetRef.current,
            );
            if (remaining !== null) {
                setTimeRemaining(remaining);
            }
        });

        return () => unsub();
    }, [sessionCode, testData.metadata.duration]);

    // Pause active time tracking whenever session is paused or not actively in-progress
    useEffect(() => {
        if (isPaused || sessionStatus !== 'in-progress' || submitted) {
            activeTime.pause?.();
        }
    }, [activeTime, isPaused, sessionStatus, submitted]);

    // Authoritative wall-clock countdown with server time offset (immune to background-tab drift)
    useEffect(() => {
        if (sessionStatus !== 'in-progress' || isPaused || submitted) return;

        const checkTimer = () => {
            const remaining = computeSessionRemainingSeconds(
                sessionTimingRef.current,
                serverTimeOffsetRef.current,
            );
            if (remaining === null) return;

            setTimeRemaining(remaining);
            if (
                remaining <= 0
                && !hasAutoSubmittedRef.current
                && !submissionInFlightRef.current
                && Date.now() >= nextAutoSubmitRetryAtRef.current
            ) {
                hasAutoSubmittedRef.current = true;
                void handleSubmitRef.current('timer-expiry');
            }
        };

        checkTimer();
        const interval = setInterval(checkTimer, 1000);
        return () => clearInterval(interval);
    }, [sessionStatus, isPaused, submitted]);

    const completeTeacherFinalizedSubmission = useCallback(() => {
        if (submittedRef.current || reopenedRef.current) return;
        submittedRef.current = true;
        hasAutoSubmittedRef.current = true;
        setSubmitted(true);
        setAutoSubmitExhausted(false);
        trackAction('finishTest', {
            testSkill: 'Writing',
            submissionSource: 'teacher-ended',
            outcome: 'submitted',
        });
        navigate(ROUTES.SUBMISSION_COMPLETE, {
            replace: true,
            state: {
                sessionCode,
                testId: testData.id,
                studentName,
            },
        });
    }, [navigate, sessionCode, studentName, testData.id, trackAction]);

    useEffect(() => {
        const previousStatus = prevSessionStatusRef.current;
        prevSessionStatusRef.current = sessionStatus;

        const wasInProgress = previousStatus === 'in-progress';

        if (sessionStatus === 'completed') {
            // Once status is 'completed', database.rules.json forbids student RTDB writes;
            // TeacherTestMonitorPage finalizes unsubmitted essays on the teacher side.
            setAutoSubmitExhausted(false);
            setShowSubmitModal(false);
            if (remoteSubmittedRef.current && !reopenedRef.current && !submittedRef.current) {
                completeTeacherFinalizedSubmission();
            }
            return;
        }

        if (wasInProgress && sessionStatus === 'waiting' && !submitted && !hasAutoSubmittedRef.current) {
            console.log('[WritingTestPage] Teacher ended test early; auto-submitting writing.');
            hasAutoSubmittedRef.current = true;
            void handleSubmitRef.current('teacher-ended');
        }
    }, [completeTeacherFinalizedSubmission, sessionStatus, submitted]);

    // Hydrate saved essays, active task, active times, and paste attempts on load/reconnect
    useEffect(() => {
        let cancelled = false;

        const savedStatePromise = autoSave.loadSavedState().then((saved) => {
            if (cancelled) {
                return;
            }

            if (saved) {
                reopenedRef.current = Boolean(saved.reopened);
                setEssays({
                    1: saved.task1Text || '',
                    2: saved.task2Text || '',
                });

                if (saved.activeTask === 1 || saved.activeTask === 2) {
                    setActiveTask(clampTaskNumber(saved.activeTask));
                }

                if (typeof saved.pasteAttemptCount === 'number') {
                    setPasteAttemptCount(saved.pasteAttemptCount);
                }

                if (!activeTimeSeededRef.current && saved.activeTimeSeconds) {
                    activeTimeSeededRef.current = true;
                    activeTime.seedActiveTimes?.(saved.activeTimeSeconds);
                }

                if (saved.submitted && !saved.reopened) {
                    submittedRef.current = true;
                    setSubmitted(true);
                }
            }

            setPasteAttemptCountHydrated(true);
        });
        savedStatePromiseRef.current = savedStatePromise;

        return () => {
            cancelled = true;
        };
    }, [activeTime, autoSave, clampTaskNumber, setPasteAttemptCount]);

    useEffect(() => {
        if (!pasteAttemptCountHydrated || !studentId || !sessionCode || sessionStatus === 'completed') {
            return;
        }

        set(
            ref(database, `game_sessions/${sessionCode}/students/${studentId}/writing/pasteAttemptCount`),
            pasteAttemptCount,
        ).catch((error) => {
            console.error('Failed to sync writing pasteAttemptCount:', error);
        });
    }, [pasteAttemptCount, pasteAttemptCountHydrated, sessionCode, sessionStatus, studentId]);

    useEffect(() => {
        if (!studentId || !sessionCode) return;

        const reopenRef = ref(
            database,
            `game_sessions/${sessionCode}/students/${studentId}/writing/reopened`
        );
        const unsub = onValue(reopenRef, (snap: any) => {
            const isReopened = snap.val() === true;
            reopenedRef.current = isReopened;
            if (isReopened) {
                const wasSubmitted = submittedRef.current;
                submittedRef.current = false;
                hasAutoSubmittedRef.current = false;
                autoSubmitAttemptsRef.current = 0;
                nextAutoSubmitRetryAtRef.current = 0;
                setAutoSubmitExhausted(false);
                setSubmitted(false);
                if (wasSubmitted) {
                    toast.info('Your teacher reopened this writing test. You can continue editing.');
                }
            }
        });

        return () => unsub();
    }, [sessionCode, studentId]);

    useEffect(() => {
        if (!studentId || !sessionCode) return;

        const submittedFlagRef = ref(
            database,
            `game_sessions/${sessionCode}/students/${studentId}/writing/submitted`,
        );
        const unsub = onValue(submittedFlagRef, (snap: any) => {
            const isRemotelySubmitted = snap.val() === true;
            remoteSubmittedRef.current = isRemotelySubmitted;
            if (
                isRemotelySubmitted
                && !reopenedRef.current
                && !submittedRef.current
                && sessionTimingRef.current.status === 'completed'
            ) {
                completeTeacherFinalizedSubmission();
            }
        });

        return () => unsub();
    }, [completeTeacherFinalizedSubmission, sessionCode, studentId]);

    // Flush unsaved text & active time and guard unload through the shared platform lifecycle hook
    const flushDraftOnBackground = useCallback(() => {
        activeTime.pause?.();
        if (submittedRef.current || sessionTimingRef.current.status === 'completed') return;
        void autoSave.flushPendingSave().catch((err) => {
            console.error('Failed to flush writing draft:', err);
        });
        void autoSave.saveActiveTimes?.({
            1: activeTime.getActiveTime?.(1) ?? 0,
            2: activeTime.getActiveTime?.(2) ?? 0,
        })?.catch((err) => {
            console.error('Failed to persist active writing times:', err);
        });
    }, [activeTime, autoSave]);

    useAppLifecycle({
        onBackground: flushDraftOnBackground,
        onPageHide: flushDraftOnBackground,
        onBeforeUnload: () => {
            if (!submittedRef.current && (essaysRef.current[1] || essaysRef.current[2])) {
                return 'You have unsaved writing progress.';
            }
            return undefined;
        },
    });

    const handleEssayChange = useCallback((text: string) => {
        setEssays((prev) => ({ ...prev, [activeTask]: text }));
        activeTime.onKeystroke(activeTask);
        autoSave.saveTask(activeTask, text);
    }, [activeTask, activeTime, autoSave]);

    const handleTabSwitch = useCallback((taskNum: 1 | 2) => {
        void autoSave.flushPendingSave();
        autoSave.saveActiveTab(taskNum);
        void autoSave.saveActiveTimes?.({
            1: activeTime.getActiveTime?.(1) ?? 0,
            2: activeTime.getActiveTime?.(2) ?? 0,
        })?.catch(() => {});
        activeTime.switchTask(taskNum);
        setActiveTask(taskNum);
    }, [autoSave, activeTime]);

    const currentTestTask = (testData.tasks.find((task) => task.taskNumber === activeTask) || testData.tasks[0])!;

    const submitTasks = testData.tasks
        .filter((task) => {
            if (testData.metadata.format === 'task1-only') return task.taskNumber === 1;
            if (testData.metadata.format === 'task2-only') return task.taskNumber === 2;
            return true;
        })
        .map((task) => ({
            taskNumber: task.taskNumber,
            wordCount: getWordCount(essays[task.taskNumber as 1 | 2] || ''),
            wordMinimum: task.wordMinimum,
        }));

    const formatTime = (seconds: number | null): string => {
        if (seconds === null) return '--:--';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const timerClass = () => {
        if (isPaused) return 'wtp-timer wtp-timer--paused';
        if (timeRemaining !== null && timeRemaining <= 60) return 'wtp-timer wtp-timer--danger';
        if (timeRemaining !== null && timeRemaining <= 300) return 'wtp-timer wtp-timer--warning';
        return 'wtp-timer';
    };

    const autoSaveLabel = autoSaveStatus === 'saving'
        ? 'Saving...'
        : autoSaveStatus === 'error'
            ? 'Save failed — retrying'
            : autoSaveStatus === 'saved'
                ? 'Saved'
                : null;

    return (
        <div className="wtp-page">
            <div className="wtp-header">
                <div className="wtp-header-left">
                    <span className="wtp-header-title" title={testData.metadata.title || 'IELTS Writing Test'}>
                        {testData.metadata.title || 'IELTS Writing Test'}
                    </span>
                    <span className="wtp-header-badge">Writing</span>
                </div>

                <div className="wtp-header-center">
                    {isPaused && (
                        <span className="wtp-status-pill wtp-status-pill--paused">
                            Paused
                        </span>
                    )}
                    {sessionStatus === 'waiting' && (
                        <span className="wtp-status-pill wtp-status-pill--waiting">
                            Waiting to start
                        </span>
                    )}
                    {sessionStatus === 'in-progress' && (
                        <div className={timerClass()} aria-label={`Time remaining ${formatTime(timeRemaining)}`}>
                            <span className="wtp-timer-icon">Time</span>
                            <span>{formatTime(timeRemaining)}</span>
                        </div>
                    )}
                </div>

                <div className="wtp-header-right">
                    {autoSaveLabel && (
                        <span
                            className={`wtp-autosave-indicator wtp-autosave-indicator--${autoSaveStatus}`}
                            role="status"
                            aria-live="polite"
                        >
                            <span className="wtp-autosave-dot" aria-hidden="true" />
                            <span>{autoSaveLabel}</span>
                        </span>
                    )}
                    <button
                        type="button"
                        className="wtp-submit-btn-header"
                        onClick={() => setShowSubmitModal(true)}
                        disabled={submitting || submitted || sessionStatus === 'completed'}
                    >
                        <span>{submitting ? 'Submitting...' : submitted ? 'Submitted' : 'Submit Test'}</span>
                    </button>
                </div>
            </div>

            {isPaused && sessionStatus !== 'completed' && (
                <div className="wtp-paused-banner" role="status" aria-live="polite">
                    Test paused by your teacher. Your draft is saved and editing will resume when the teacher continues.
                </div>
            )}

            {sessionStatus === 'completed' && !submitted && (
                <div className="wtp-paused-banner" role="status" aria-live="polite">
                    This session has been closed by your teacher. Your saved draft is preserved while your teacher finalizes submissions.
                </div>
            )}

            {autoSubmitExhausted && !submitted && sessionStatus !== 'completed' && (
                <div className="wtp-retry-banner" role="alert">
                    <span>Automatic submission failed. Your draft is preserved.</span>
                    <button
                        type="button"
                        className="wtp-retry-banner-btn"
                        onClick={() => {
                            trackAction('retryWritingSubmission', {
                                testSkill: 'Writing',
                                sessionCode,
                            });
                            void handleSubmit('manual');
                        }}
                        disabled={submitting}
                    >
                        {submitting ? 'Submitting...' : 'Retry Submit'}
                    </button>
                </div>
            )}

            <div className="wtp-tab-bar" role="tablist" aria-label="Writing tasks">
                {showTask1 && (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTask === 1}
                        className={`wtp-tab ${activeTask === 1 ? 'wtp-tab--active' : ''}`}
                        onClick={() => handleTabSwitch(1)}
                    >
                        Task 1 ({getWordCount(essays[1])} words)
                    </button>
                )}
                {showTask2 && (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTask === 2}
                        className={`wtp-tab ${activeTask === 2 ? 'wtp-tab--active' : ''}`}
                        onClick={() => handleTabSwitch(2)}
                    >
                        Task 2 ({getWordCount(essays[2])} words)
                    </button>
                )}
            </div>

            <div className="wtp-main">
                <WritingPromptPanel task={currentTestTask} taskNumber={activeTask} />
                <WritingEditor
                    value={essays[activeTask]}
                    onChange={handleEssayChange}
                    disabled={submitted || submitting || isPaused || sessionStatus === 'completed'}
                    attachToTextarea={attachToTextarea}
                    wordMinimum={currentTestTask?.wordMinimum}
                    taskNumber={activeTask}
                />
            </div>

            <WritingSubmitModal
                isOpen={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                onConfirm={() => {
                    void handleSubmit('manual');
                }}
                tasks={submitTasks}
                isSubmitting={submitting}
            />
        </div>
    );
}
