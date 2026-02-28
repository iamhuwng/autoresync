/**
 * WritingPracticeView — PRD-0030 Phase 7 (Task 7.1)
 *
 * Solo practice writing view for students.
 * Mirrors WritingTestPage's 40/60 layout but uses localStorage auto-save
 * instead of RTDB. Supports teacher submission via SubmitToTeacherModal.
 *
 * Props:
 *   - materialId: test ID from RTDB
 *   - testData: IELTSWritingTest loaded by caller
 *
 * Key differences from live-session WritingTestPage:
 *   - No sessionCode — fully offline/local
 *   - localStorage auto-save (not RTDB)
 *   - SubmitToTeacherModal instead of WritingSubmitModal
 *   - context.type = 'solo-practice' in submission
 *   - Unlimited submissions (no dedup)
 *   - Optional timer from soloConfig
 *   - SoloResumeModal for session recovery (native, NO Mantine)
 *
 * NO MANTINE.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, set } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { getStudentClasses, getClass } from '../../services/classManager';
import { getUserById } from '../../services/userService';
import { createSubmission } from '../../services/writingSubmissionService';
import { notifyWritingSubmitted } from '../../services/notificationService';
import { deepRemoveUndefined } from '../../services/draftCloudService';
import { useExternalPastePrevention } from '../../hooks/useExternalPastePrevention';
import { useActiveTimeTracking } from '../../hooks/useActiveTimeTracking';
import WritingPromptPanel from '../writing-student/WritingPromptPanel';
import WritingEditor from '../writing-student/WritingEditor';
import SubmitToTeacherModal from './SubmitToTeacherModal';
import type { IELTSWritingTest, WritingSubmission } from '../../types/ielts-writing.types';
import './WritingPracticeView.css';

// ── Types ──────────────────────────────────────────────────
export interface HomeworkWritingContext {
    homeworkId: string;
    dueDate?: number;              // epoch ms
    lateSubmissionAllowed?: boolean;
    previousEssay?: { 1: string; 2: string };  // re-attempt pre-load
}

interface WritingPracticeViewProps {
    materialId: string;
    testData: IELTSWritingTest;
    homeworkContext?: HomeworkWritingContext;
}

interface SavedPracticeState {
    essays: { 1: string; 2: string };
    activeTask: 1 | 2;
    startedAt: number;
}

interface TeacherInfo {
    id: string;
    name: string;
}

// ── localStorage helpers ───────────────────────────────────
function getSaveKey(materialId: string, studentUid: string): string {
    return `writing_practice_${materialId}_${studentUid}`;
}

function loadSavedState(key: string): SavedPracticeState | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Expire after 72 hours
        if (parsed.startedAt && Date.now() - parsed.startedAt > 72 * 60 * 60 * 1000) {
            localStorage.removeItem(key);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function savePracticeState(key: string, state: SavedPracticeState): void {
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch {
        console.warn('[WritingPracticeView] localStorage save failed');
    }
}

function clearPracticeState(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

// ── Component ──────────────────────────────────────────────
export default function WritingPracticeView({ materialId, testData, homeworkContext }: WritingPracticeViewProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const studentId = user?.uid || '';
    const studentName = user?.displayName || user?.email || 'Anonymous';

    // Homework mode detection
    const isHomework = !!homeworkContext;
    const homeworkDueDate = homeworkContext?.dueDate ?? null;
    const homeworkLateAllowed = homeworkContext?.lateSubmissionAllowed ?? false;

    // Task config (constant for test lifetime)
    const taskCount = testData.metadata.format === 'full-test' ? 2 : 1;
    const hasBothTasks = taskCount === 2;
    const showTask1 = testData.metadata.format !== 'task2-only';
    const showTask2 = testData.metadata.format !== 'task1-only';

    // State
    const [activeTask, setActiveTask] = useState<1 | 2>(showTask1 ? 1 : 2);
    const [essays, setEssays] = useState<{ 1: string; 2: string }>(
        homeworkContext?.previousEssay || { 1: '', 2: '' }
    );
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [showResumeModal, setShowResumeModal] = useState(false);

    // Teacher list for SubmitToTeacherModal
    const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
    const [teachersLoaded, setTeachersLoaded] = useState(false);

    // Auto-save indicator
    const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving'>('saved');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const startedAtRef = useRef<number>(Date.now());

    // Optional timer from soloConfig
    const timerMinutes = testData.soloConfig?.defaults?.timerMinutes ?? null;
    const [timeRemaining, setTimeRemaining] = useState<number | null>(
        timerMinutes ? timerMinutes * 60 : null
    );

    // Hooks
    const activeTime = useActiveTimeTracking(taskCount as 1 | 2);
    const pastePrevention = useExternalPastePrevention();

    const saveKey = getSaveKey(materialId, studentId);

    // ── Load saved state on mount ──────────────────────────
    useEffect(() => {
        if (!studentId) return;

        const saved = loadSavedState(saveKey);
        if (saved) {
            setShowResumeModal(true);
        } else {
            startedAtRef.current = Date.now();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Load teachers from enrolled classes ─────────────────
    useEffect(() => {
        if (!studentId || teachersLoaded) return;

        const loadTeachers = async () => {
            try {
                const classes = await getStudentClasses(studentId);
                const teacherIds = new Set<string>();

                // Collect unique teacher IDs from enrolled classes
                for (const cls of classes) {
                    const fullClass = await getClass(cls.id);
                    if (fullClass?.createdBy) {
                        teacherIds.add(fullClass.createdBy);
                    }
                }

                // Fetch actual teacher profiles for displayName
                const teacherList: TeacherInfo[] = [];
                for (const teacherId of teacherIds) {
                    const profile = await getUserById(teacherId);
                    teacherList.push({
                        id: teacherId,
                        name: profile?.displayName || profile?.email || 'Teacher',
                    });
                }

                setTeachers(teacherList);
            } catch (err) {
                console.warn('[WritingPracticeView] Failed to load teachers:', err);
            } finally {
                setTeachersLoaded(true);
            }
        };

        loadTeachers();
    }, [studentId, teachersLoaded]);

    // ── Timer (optional) ────────────────────────────────────
    useEffect(() => {
        if (timeRemaining === null || submitted) return;
        if (timeRemaining <= 0) {
            // Auto-open submit modal on timer expiry
            setShowSubmitModal(true);
            return;
        }
        const interval = setInterval(() => {
            setTimeRemaining(prev => (prev !== null ? prev - 1 : null));
        }, 1000);
        return () => clearInterval(interval);
    }, [timeRemaining, submitted]);

    // ── beforeunload warning ────────────────────────────────
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (essays[1] || essays[2]) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [essays]);

    // ── Auto-save to localStorage (debounced 2s) ────────────
    const triggerAutoSave = useCallback((updatedEssays: { 1: string; 2: string }, task: 1 | 2) => {
        setAutoSaveStatus('saving');
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            savePracticeState(saveKey, {
                essays: updatedEssays,
                activeTask: task,
                startedAt: startedAtRef.current,
            });
            setAutoSaveStatus('saved');
        }, 2000);
    }, [saveKey]);

    // ── Essay change handler ────────────────────────────────
    const handleEssayChange = useCallback((text: string) => {
        const updated = { ...essays, [activeTask]: text } as { 1: string; 2: string };
        setEssays(updated);
        activeTime.onKeystroke(activeTask);
        triggerAutoSave(updated, activeTask);
    }, [activeTask, essays, activeTime, triggerAutoSave]);

    // ── Tab switch ──────────────────────────────────────────
    const handleTabSwitch = useCallback((taskNum: 1 | 2) => {
        // Flush pending saves
        clearTimeout(saveTimerRef.current);
        savePracticeState(saveKey, {
            essays,
            activeTask: taskNum,
            startedAt: startedAtRef.current,
        });
        setAutoSaveStatus('saved');
        activeTime.switchTask(taskNum);
        setActiveTask(taskNum);
    }, [saveKey, essays, activeTime]);

    // ── Word count helper ───────────────────────────────────
    const getWordCount = (text: string) =>
        text.trim() ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

    // ── Resume handlers ─────────────────────────────────────
    const handleResume = () => {
        const saved = loadSavedState(saveKey);
        if (saved) {
            setEssays(saved.essays);
            setActiveTask(saved.activeTask);
            startedAtRef.current = saved.startedAt;
        }
        setShowResumeModal(false);
    };

    const handleStartNew = () => {
        clearPracticeState(saveKey);
        setEssays({ 1: '', 2: '' });
        setActiveTask(showTask1 ? 1 : 2);
        startedAtRef.current = Date.now();
        setShowResumeModal(false);
    };

    // ── Submit flow ─────────────────────────────────────────
    const handleSubmit = async (data: { teacherId: string | null; note: string }) => {
        setSubmitting(true);
        setShowSubmitModal(false);

        try {
            // Generate resultId
            const resultId = push(ref(database)).key;
            if (!resultId) throw new Error('Failed to generate resultId');

            // Build submission tasks
            const submissionTasks = testData.tasks
                .filter(t => {
                    if (testData.metadata.format === 'task1-only') return t.taskNumber === 1;
                    if (testData.metadata.format === 'task2-only') return t.taskNumber === 2;
                    return true;
                })
                .map(t => ({
                    taskNumber: t.taskNumber,
                    taskType: t.taskType,
                    promptText: t.promptText,
                    promptImageUrl: t.promptImageUrl,
                    wordMinimum: t.wordMinimum,
                    essayText: essays[t.taskNumber as 1 | 2] || '',
                    wordCount: getWordCount(essays[t.taskNumber as 1 | 2] || ''),
                    activeTimeSeconds: activeTime.getActiveTime(t.taskNumber),
                }));

            // Submission context
            const contextType = isHomework ? 'homework' : 'solo-practice';

            // Late check for homework
            let isLate = false;
            if (isHomework && homeworkDueDate) {
                if (Date.now() > homeworkDueDate) {
                    if (!homeworkLateAllowed) {
                        alert('The deadline has passed. Submissions are no longer accepted.');
                        setSubmitting(false);
                        return;
                    }
                    isLate = true;
                }
            }

            // Create Firestore submission
            const submission: WritingSubmission = {
                id: resultId,
                studentId,
                studentName,
                context: {
                    type: contextType as 'solo-practice',
                    selectedTeacherId: data.teacherId || undefined,
                    studentNote: data.note || undefined,
                    ...(isHomework ? { homeworkId: homeworkContext!.homeworkId, isLate } : {}),
                },
                testMeta: {
                    testId: testData.id,
                    testTitle: testData.metadata.title,
                    format: testData.metadata.format,
                    duration: testData.metadata.duration,
                },
                tasks: submissionTasks,
                submittedAt: Date.now(),
                totalElapsedTimeSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
                pasteAttemptCount: pastePrevention.pasteAttemptCount,
                markingStatus: 'pending-review',
                annotations: [],
                auditTrail: [],
            };

            await createSubmission(submission);

            // Fire notification (non-blocking)
            notifyWritingSubmitted(
                studentId,
                resultId,
                testData.metadata.title,
                isHomework ? 'homework' : 'solo-practice'
            ).catch(err => console.warn('[WritingPracticeView] Notification failed:', err));

            // Create RTDB result index (for student's Academic Record)
            const resultRecord = deepRemoveUndefined({
                resultId,
                testId: testData.id,
                studentId,
                studentName,
                isGuest: false,
                teacherId: data.teacherId || testData.createdBy,
                totalScore: 0,
                maxScore: 0,
                percentage: 0,
                bandScore: 0,
                testTitle: testData.metadata.title,
                testType: 'practice',
                testSkill: 'writing',
                testDuration: testData.metadata.duration,
                questionResults: [],
                correct: 0,
                incorrect: 0,
                partialCredit: 0,
                totalQuestions: 0,
                submittedAt: Date.now(),
                timeElapsed: Math.round((Date.now() - startedAtRef.current) / 1000),
                createdAt: Date.now(),
                markingStatus: 'pending-review',
                writingData: {
                    submissionId: resultId,
                    overallBand: null,
                    markingStatus: 'pending-review',
                    tasks: submissionTasks.map(t => ({
                        taskNumber: t.taskNumber,
                        wordCount: t.wordCount,
                        activeTimeSeconds: t.activeTimeSeconds,
                    })),
                },
            });

            // Write main result record (academic record service reads from here)
            await set(
                ref(database, `test_results/${resultId}`),
                resultRecord
            );

            // Write student index (for efficient per-student queries)
            await set(
                ref(database, `test_results_by_student/${studentId}/${resultId}`),
                resultRecord
            );

            // Clear localStorage
            clearPracticeState(saveKey);
            setSubmitted(true);

            // Show brief confirmation, then navigate
            const teacherName = data.teacherId
                ? teachers.find(t => t.id === data.teacherId)?.name || 'your teacher'
                : null;

            const confirmMsg = teacherName
                ? `✅ Essay submitted to ${teacherName} for review!`
                : '✅ Essay saved for self-review!';

            // Use a brief visible confirmation before navigating
            alert(confirmMsg);

            if (isHomework) {
                console.log('✅ [WritingPracticeView] Homework submitted — redirecting to homework page');
                navigate('/student/homework', { replace: true });
            } else {
                console.log('✅ [WritingPracticeView] Solo essay submitted — redirecting to dashboard');
                navigate('/student/dashboard', { replace: true });
            }
        } catch (err) {
            console.error('[WritingPracticeView] Submit failed:', err);
            alert('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Format timer ────────────────────────────────────────
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const getTimerClass = () => {
        if (timeRemaining === null) return '';
        if (timeRemaining <= 60) return 'wpv-timer--danger';
        if (timeRemaining <= 300) return 'wpv-timer--warning';
        return '';
    };

    // ── Current task data ───────────────────────────────────
    const currentTestTask = (testData.tasks.find(t => t.taskNumber === activeTask) || testData.tasks[0])!;

    // ── Build word count summary for submit modal ───────────
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

    // NOTE: No submitted overlay — after submit, we navigate immediately
    // (see handleSubmit above). The submitted state is only used to disable inputs.

    // ── Homework: deadline check (hard block) ────────────────
    if (isHomework && homeworkDueDate && !homeworkLateAllowed && Date.now() > homeworkDueDate) {
        return (
            <div className="wpv-submitted-overlay">
                <div style={{ fontSize: 64 }}>⏰</div>
                <h1>Deadline Passed</h1>
                <p>The deadline for this homework has passed. Submissions are no longer accepted.</p>
                <button className="wpv-done-btn" onClick={() => navigate('/student/homework', { replace: true })}>
                    ← Back to Homework
                </button>
            </div>
        );
    }

    return (
        <div className="wpv-page">
            {/* ── Header ──────────────────────────────────── */}
            <div className="wpv-header">
                <button className="wpv-back-btn" onClick={() => isHomework ? navigate('/student/homework') : navigate(-1)}>
                    ← Back
                </button>
                <div className="wpv-title-area">
                    <h1 className="wpv-title">{testData.metadata.title}</h1>
                    <p className="wpv-subtitle">
                        {testData.metadata.format === 'full-test'
                            ? 'Task 1 + Task 2'
                            : testData.metadata.format === 'task1-only'
                                ? 'Task 1 Only'
                                : 'Task 2 Only'}
                    </p>
                </div>
                <span className="wpv-practice-badge">
                    {isHomework ? '📝 Homework' : '✍️ Solo Practice'}
                </span>

                {/* Homework deadline banner */}
                {isHomework && homeworkDueDate && (
                    <div className={`wpv-deadline-badge ${Date.now() > homeworkDueDate ? 'wpv-deadline-badge--overdue' : ''}`}>
                        ⏰ Due: {new Date(homeworkDueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {Date.now() > homeworkDueDate && homeworkLateAllowed && ' (Late)'}
                    </div>
                )}

                {/* Auto-save indicator */}
                <div className="wpv-autosave-indicator">
                    <span className={`wpv-autosave-dot ${autoSaveStatus === 'saving' ? 'wpv-autosave-dot--saving' : ''}`} />
                    {autoSaveStatus === 'saving' ? 'Saving...' : 'Saved'}
                </div>

                {/* Optional timer */}
                {timeRemaining !== null && (
                    <div className={`wpv-timer ${getTimerClass()}`}>
                        ⏱ {formatTime(timeRemaining)}
                    </div>
                )}
            </div>

            {/* ── Tab Bar ─────────────────────────────────── */}
            <div className="wpv-tab-bar">
                {hasBothTasks && showTask1 && (
                    <button
                        className={`wpv-tab ${activeTask === 1 ? 'wpv-tab--active' : ''}`}
                        onClick={() => handleTabSwitch(1)}
                    >
                        Task 1 ({getWordCount(essays[1])} words)
                    </button>
                )}
                {hasBothTasks && showTask2 && (
                    <button
                        className={`wpv-tab ${activeTask === 2 ? 'wpv-tab--active' : ''}`}
                        onClick={() => handleTabSwitch(2)}
                    >
                        Task 2 ({getWordCount(essays[2])} words)
                    </button>
                )}
                {!hasBothTasks && (
                    <span className="wpv-tab wpv-tab--active">
                        Task {activeTask} ({getWordCount(essays[activeTask])} words)
                    </span>
                )}
                <button
                    className="wpv-tab wpv-tab--submit"
                    onClick={() => setShowSubmitModal(true)}
                    disabled={submitting}
                >
                    {submitting ? 'Submitting...' : '📤 Submit'}
                </button>
            </div>

            {/* ── Main Content (40/60 split) ───────────────── */}
            <div className="wpv-main">
                <WritingPromptPanel
                    task={currentTestTask}
                    taskNumber={activeTask}
                />
                <WritingEditor
                    value={essays[activeTask]}
                    onChange={handleEssayChange}
                    disabled={submitting}
                />
            </div>

            {/* ── Submit to Teacher Modal ──────────────────── */}
            <SubmitToTeacherModal
                isOpen={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                onSubmit={handleSubmit}
                studentTeachers={teachers}
                tasks={submitTasks}
                isSubmitting={submitting}
            />

            {/* ── Resume Modal (native, NO Mantine) ────────── */}
            {showResumeModal && (
                <div className="wpv-resume-overlay">
                    <div className="wpv-resume-modal">
                        <h2>📝 Resume Practice?</h2>
                        <p>
                            You have a saved practice session for this test.
                            Would you like to resume where you left off, or start fresh?
                        </p>
                        <div className="wpv-resume-actions">
                            <button className="wpv-resume-btn wpv-resume-btn--new" onClick={handleStartNew}>
                                Start New
                            </button>
                            <button className="wpv-resume-btn wpv-resume-btn--resume" onClick={handleResume}>
                                Resume
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
