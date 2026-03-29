/**
 * WritingTestPage
 * Student writing test interface for live sessions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
// @ts-ignore - JS service file
import { database } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../constants/routes';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import WritingPromptPanel from './WritingPromptPanel';
import WritingEditor from './WritingEditor';
import WritingSubmitModal from './WritingSubmitModal';
import { useActiveTimeTracking } from '../../hooks/useActiveTimeTracking';
import { useWritingAutoSave } from '../../hooks/useWritingAutoSave';
import { autoSubmitFromRTDB } from '../../services/writingSubmissionService';
import type { IELTSWritingTest } from '../../types/ielts-writing.types';
import './WritingTestPage.css';

interface WritingTestPageProps {
    testData: IELTSWritingTest;
    sessionCode: string;
}

type SubmissionSource = 'manual' | 'timer-expiry' | 'teacher-ended';

export default function WritingTestPage({ testData, sessionCode }: WritingTestPageProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { trackAction } = useFeatureTracking('testTaking');
    const studentId = user?.uid || '';
    const studentName = user?.displayName || user?.email || 'Anonymous';

    const taskCount = testData.metadata.format === 'full-test' ? 2 : 1;
    const showTask1 = testData.metadata.format !== 'task2-only';
    const showTask2 = testData.metadata.format !== 'task1-only';

    const [activeTask, setActiveTask] = useState<1 | 2>(showTask1 ? 1 : 2);
    const [essays, setEssays] = useState<{ 1: string; 2: string }>({ 1: '', 2: '' });
    const [submitted, setSubmitted] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [sessionStatus, setSessionStatus] = useState<string>('waiting');
    const [isPaused, setIsPaused] = useState(false);
    const hasAutoSubmittedRef = useRef(false);
    const prevSessionStatusRef = useRef<string>('waiting');

    const activeTime = useActiveTimeTracking(taskCount as 1 | 2);
    const autoSave = useWritingAutoSave(sessionCode, studentId);

    useEffect(() => {
        if (!sessionCode) return;

        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const unsub = onValue(sessionRef, (snap: any) => {
            if (!snap.exists()) return;

            const data = snap.val();
            setSessionStatus(data.status || 'waiting');
            setIsPaused(data.isPaused || false);

            if (data.status === 'in-progress' && data.startTime && !data.isPaused) {
                const duration = (testData.metadata.duration || 60) * 60;
                const pausedDur = data.pausedDuration || 0;
                const elapsed = Math.floor((Date.now() - data.startTime - pausedDur) / 1000);
                const remaining = Math.max(0, duration - elapsed);
                setTimeRemaining(remaining);
            } else if (data.status === 'completed') {
                setTimeRemaining(0);
            }
        });

        return () => unsub();
    }, [sessionCode, testData.metadata.duration]);

    useEffect(() => {
        if (sessionStatus !== 'in-progress' || isPaused || submitted) return;

        const interval = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev === null || prev <= 0) return prev;

                const next = prev - 1;
                if (next <= 0 && !hasAutoSubmittedRef.current) {
                    hasAutoSubmittedRef.current = true;
                    void handleSubmit('timer-expiry');
                }
                return next;
            });
        }, 1000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionStatus, isPaused, submitted]);

    useEffect(() => {
        const previousStatus = prevSessionStatusRef.current;
        prevSessionStatusRef.current = sessionStatus;

        const wasInProgress = previousStatus === 'in-progress';
        const hasEnded = sessionStatus === 'waiting' || sessionStatus === 'completed';

        if (wasInProgress && hasEnded && !submitted && !hasAutoSubmittedRef.current) {
            console.log('[WritingTestPage] Teacher ended test early; auto-submitting writing.');
            hasAutoSubmittedRef.current = true;
            void handleSubmit('teacher-ended');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionStatus, submitted]);

    useEffect(() => {
        let cancelled = false;

        autoSave.loadSavedState().then((saved) => {
            if (cancelled || !saved) return;

            setEssays({
                1: saved.task1Text || '',
                2: saved.task2Text || '',
            });

            if (saved.activeTask === 1 || saved.activeTask === 2) {
                setActiveTask(saved.activeTask as 1 | 2);
            }
        });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!studentId || !sessionCode) return;

        const reopenRef = ref(
            database,
            `game_sessions/${sessionCode}/students/${studentId}/writing/reopened`
        );
        const unsub = onValue(reopenRef, (snap: any) => {
            if (snap.val() === true) {
                setSubmitted(false);
            }
        });

        return () => unsub();
    }, [sessionCode, studentId]);

    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => {
            if (essays[1] || essays[2]) {
                event.preventDefault();
            }
        };

        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [essays]);

    const handleEssayChange = useCallback((text: string) => {
        setEssays((prev) => ({ ...prev, [activeTask]: text }));
        activeTime.onKeystroke(activeTask);
        autoSave.saveTask(activeTask, text);
    }, [activeTask, activeTime, autoSave]);

    const handleTabSwitch = useCallback((taskNum: 1 | 2) => {
        autoSave.flushPendingSave();
        autoSave.saveActiveTab(taskNum);
        activeTime.switchTask(taskNum);
        setActiveTask(taskNum);
    }, [autoSave, activeTime]);

    const getWordCount = (text: string) =>
        text.trim() ? text.trim().split(/\s+/).filter((word) => word.length > 0).length : 0;

    const handleSubmit = async (submissionSource: SubmissionSource = 'manual') => {
        setSubmitting(true);
        setShowSubmitModal(false);

        try {
            autoSave.flushPendingSave();
            await autoSubmitFromRTDB(sessionCode, studentId, studentName, testData);
            setSubmitted(true);

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
            alert('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

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

    return (
        <div className="wtp-page">
            <div className="wtp-header">
                <div className="wtp-header-left">
                    <span className="wtp-header-title">
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
                        <div className={timerClass()}>
                            <span className="wtp-timer-icon">Time</span>
                            <span>{formatTime(timeRemaining)}</span>
                        </div>
                    )}
                </div>

                <div className="wtp-header-right">
                    <button
                        className="wtp-submit-btn-header"
                        onClick={() => setShowSubmitModal(true)}
                        disabled={submitting}
                    >
                        <span>{submitting ? 'Submitting...' : 'Submit Test'}</span>
                    </button>
                </div>
            </div>

            <div className="wtp-tab-bar">
                {showTask1 && (
                    <button
                        className={`wtp-tab ${activeTask === 1 ? 'wtp-tab--active' : ''}`}
                        onClick={() => handleTabSwitch(1)}
                    >
                        Task 1 ({getWordCount(essays[1])} words)
                    </button>
                )}
                {showTask2 && (
                    <button
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
                    disabled={submitted || submitting}
                />
            </div>

            <WritingSubmitModal
                isOpen={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                onConfirm={() => {
                    void handleSubmit('manual');
                }}
                tasks={submitTasks}
            />
        </div>
    );
}
