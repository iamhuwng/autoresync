/**
 * WritingTestPage — PRD-0030 §4.3.2
 * Student writing test interface for live sessions.
 * 
 * Layout (per PRD mockup):
 * ┌─────────────────────────────────────────────────────────┐
 * │ IELTS Writing Test         ⏱️ 45:00     [Submit Test]   │  ← Header
 * │ [Task 1] [Task 2]                                       │  ← Tabs
 * ├─────────────────────────────────────────────────────────┤
 * │ LEFT (40%) Prompt  │  RIGHT (60%) Editor                │
 * └─────────────────────────────────────────────────────────┘
 * 
 * NO MANTINE.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
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

export default function WritingTestPage({ testData, sessionCode }: WritingTestPageProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const studentId = user?.uid || '';
    const studentName = user?.displayName || user?.email || 'Anonymous';

    // Task configuration (constant for session lifetime)
    const taskCount = testData.metadata.format === 'full-test' ? 2 : 1;
    const showTask1 = testData.metadata.format !== 'task2-only';
    const showTask2 = testData.metadata.format !== 'task1-only';

    // State
    const [activeTask, setActiveTask] = useState<1 | 2>(showTask1 ? 1 : 2);
    const [essays, setEssays] = useState<{ 1: string; 2: string }>({ 1: '', 2: '' });
    const [submitted, setSubmitted] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Timer state from RTDB session
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [sessionStatus, setSessionStatus] = useState<string>('waiting');
    const [isPaused, setIsPaused] = useState(false);
    const hasAutoSubmittedRef = useRef(false);
    const prevSessionStatusRef = useRef<string>('waiting');

    // Hooks
    const activeTime = useActiveTimeTracking(taskCount as 1 | 2);
    const autoSave = useWritingAutoSave(sessionCode, studentId);

    // ── Timer: subscribe to session state and compute countdown ──
    useEffect(() => {
        if (!sessionCode) return;
        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const unsub = onValue(sessionRef, (snap: any) => {
            if (!snap.exists()) return;
            const data = snap.val();
            setSessionStatus(data.status || 'waiting');
            setIsPaused(data.isPaused || false);

            // Calculate time remaining
            if (data.status === 'in-progress' && data.startTime && !data.isPaused) {
                const duration = (testData.metadata.duration || 60) * 60; // seconds
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

    // Tick timer every second
    useEffect(() => {
        if (sessionStatus !== 'in-progress' || isPaused || submitted) return;
        const interval = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev === null || prev <= 0) return prev;
                const next = prev - 1;
                // Auto-submit on timer expiry
                if (next <= 0 && !hasAutoSubmittedRef.current) {
                    hasAutoSubmittedRef.current = true;
                    handleSubmit();
                }
                return next;
            });
        }, 1000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionStatus, isPaused, submitted]);

    // ── Teacher ends test early: detect status transition and auto-submit ──
    // When teacher calls endFullSession(), status goes from 'in-progress' → 'waiting'.
    // The timer tick effect (above) stops because of the sessionStatus guard,
    // so we need this dedicated effect to catch the transition and auto-submit.
    useEffect(() => {
        const prev = prevSessionStatusRef.current;
        prevSessionStatusRef.current = sessionStatus;

        // Only trigger when transitioning FROM 'in-progress' TO 'waiting' or 'completed'
        const wasInProgress = prev === 'in-progress';
        const hasEnded = sessionStatus === 'waiting' || sessionStatus === 'completed';

        if (wasInProgress && hasEnded && !submitted && !hasAutoSubmittedRef.current) {
            console.log('📤 [WritingTestPage] Teacher ended test early — auto-submitting writing...');
            hasAutoSubmittedRef.current = true;
            handleSubmit();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionStatus, submitted]);

    // Load saved state on mount (reconnect)
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
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Teacher reopen subscription
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

    // beforeunload warning
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (essays[1] || essays[2]) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [essays]);

    // ── Handlers ──
    const handleEssayChange = useCallback((text: string) => {
        setEssays(prev => ({ ...prev, [activeTask]: text }));
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
        text.trim() ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

    const handleSubmit = async () => {
        setSubmitting(true);
        setShowSubmitModal(false);

        try {
            autoSave.flushPendingSave();
            await autoSubmitFromRTDB(sessionCode, studentId, studentName, testData);
            setSubmitted(true);

            // PRD-TEST-END-FLOW: Navigate to waiting lobby with writing-specific result state
            // Matches the pattern used by Reading/Listening/THCS tests
            console.log('✅ [WritingTestPage] Redirecting to waiting lobby after submission');
            navigate(`/student-wait/${sessionCode}`, {
                replace: true,
                state: {
                    showResults: true,
                    sessionCode,
                    writingSubmitted: true,
                },
            });
        } catch (err) {
            console.error('Submit failed:', err);
            alert('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Current task data
    const currentTestTask = (testData.tasks.find(t => t.taskNumber === activeTask) || testData.tasks[0])!;

    // Submit modal task list
    const submitTasks = testData.tasks
        .filter(t => {
            if (testData.metadata.format === 'task1-only') return t.taskNumber === 1;
            if (testData.metadata.format === 'task2-only') return t.taskNumber === 2;
            return true;
        })
        .map(t => ({
            taskNumber: t.taskNumber,
            wordCount: getWordCount(essays[t.taskNumber as 1 | 2] || ''),
        }));

    // Format timer
    const formatTime = (seconds: number | null): string => {
        if (seconds === null) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const timerClass = () => {
        if (isPaused) return 'wtp-timer wtp-timer--paused';
        if (timeRemaining !== null && timeRemaining <= 60) return 'wtp-timer wtp-timer--danger';
        if (timeRemaining !== null && timeRemaining <= 300) return 'wtp-timer wtp-timer--warning';
        return 'wtp-timer';
    };

    // NOTE: No submitted overlay — after submit, we navigate to the waiting lobby
    // (see handleSubmit above). The submitted state is only used to disable inputs.

    return (
        <div className="wtp-page">
            {/* ══ Header: Title + Timer + Submit ══ */}
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
                            ⏸ Paused
                        </span>
                    )}
                    {sessionStatus === 'waiting' && (
                        <span className="wtp-status-pill wtp-status-pill--waiting">
                            ⏳ Waiting to start
                        </span>
                    )}
                    {sessionStatus === 'in-progress' && (
                        <div className={timerClass()}>
                            <span className="wtp-timer-icon">⏱️</span>
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
                        {submitting ? '⏳' : '📤'} <span>{submitting ? 'Submitting...' : 'Submit Test'}</span>
                    </button>
                </div>
            </div>

            {/* ══ Tab Bar: Task 1 / Task 2 ══ */}
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

            {/* ══ Main: Prompt (40%) + Editor (60%) ══ */}
            <div className="wtp-main">
                <WritingPromptPanel
                    task={currentTestTask}
                    taskNumber={activeTask}
                />
                <WritingEditor
                    value={essays[activeTask]}
                    onChange={handleEssayChange}
                    disabled={submitted || submitting}
                />
            </div>

            {/* ══ Submit Confirmation Modal ══ */}
            <WritingSubmitModal
                isOpen={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                onConfirm={handleSubmit}
                tasks={submitTasks}
            />
        </div>
    );
}
