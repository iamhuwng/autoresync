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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { getStudentClasses, getClass } from '../../services/classManager';
import { getHomeworkById } from '../../services/homeworkManager';
import { getUserById } from '../../services/userService';
import { createSubmission, materializeSubmissionResult } from '../../services/writingSubmissionService';
import { submitHomework } from '../../services/homeworkSubmissionService';
import { notifyTeacherWritingSubmitted, notifyWritingSubmitted } from '../../services/notificationService';
import { studentResumeService } from '../../services/studentResume.service';
import {
    readWritingProgress,
    removeWritingProgress,
    type SavedWritingPracticeState,
    writeWritingProgress,
} from '../../services/writingProgress.service';
import { useExternalPastePrevention } from '../../hooks/useExternalPastePrevention';
import { useActiveTimeTracking } from '../../hooks/useActiveTimeTracking';
import WritingPromptPanel from '../writing-student/WritingPromptPanel';
import WritingEditor from '../writing-student/WritingEditor';
import SubmitToTeacherModal from './SubmitToTeacherModal';
import type { IELTSWritingTest, WritingSubmission } from '../../types/ielts-writing.types';
import type { AntiCheatConfig } from '../../types/integrity.types';
import type { SoloProgressScopeContext } from '../../types/practice.types';
import { buildRoute } from '../../constants/routes';
import './WritingPracticeView.css';

// ── Types ──────────────────────────────────────────────────
export interface HomeworkWritingContext {
    homeworkId: string;
    submissionId: string;
    teacherId: string;
    dueDate?: number;              // epoch ms
    lateSubmissionAllowed?: boolean;
    timerMinutes?: number | null;
    maxAttempts?: number | null;
    startedAt?: number;
    previousEssay?: { 1: string; 2: string };  // re-attempt pre-load
}

interface WritingPracticeViewProps {
    materialId: string;
    testData: IELTSWritingTest;
    practiceContext?: SoloProgressScopeContext;
    homeworkContext?: HomeworkWritingContext;
    autoResume?: boolean;
}

interface TeacherInfo {
    id: string;
    name: string;
}

// ── localStorage helpers ───────────────────────────────────
function getTimerSecondsRemaining(timerMinutes: number | null, startedAt?: number | null): number | null {
    if (timerMinutes === null || timerMinutes <= 0) {
        return null;
    }

    const totalSeconds = timerMinutes * 60;
    if (!startedAt) {
        return totalSeconds;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    return Math.max(0, totalSeconds - elapsedSeconds);
}

function resolveWritingScopeContext(
    practiceContext?: SoloProgressScopeContext,
    homeworkContext?: HomeworkWritingContext,
): SoloProgressScopeContext {
    if (practiceContext) {
        return practiceContext;
    }

    if (homeworkContext) {
        return {
            mode: 'homework',
            homeworkId: homeworkContext.homeworkId,
            submissionId: homeworkContext.submissionId,
        };
    }

    return { mode: 'self_study' };
}

// ── Component ──────────────────────────────────────────────
export default function WritingPracticeView({
    materialId,
    testData,
    practiceContext,
    homeworkContext,
    autoResume = false,
}: WritingPracticeViewProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const studentId = user?.uid || '';
    const studentName = user?.displayName || user?.email || 'Anonymous';

    // Homework mode detection
    const isHomework = !!homeworkContext;
    const homeworkDueDate = homeworkContext?.dueDate ?? null;
    const homeworkLateAllowed = homeworkContext?.lateSubmissionAllowed ?? false;
    const timerMinutes = isHomework
        ? homeworkContext?.timerMinutes !== undefined
            ? homeworkContext.timerMinutes
            : testData.metadata.duration
        : testData.soloConfig?.defaults?.timerMinutes ?? null;
    const shouldForceResume = isHomework && homeworkContext?.maxAttempts === 1;

    // Task config (constant for test lifetime)
    const taskCount = testData.metadata.format === 'full-test' ? 2 : 1;
    const hasBothTasks = taskCount === 2;
    const showTask1 = testData.metadata.format !== 'task2-only';
    const showTask2 = testData.metadata.format !== 'task1-only';
    const defaultTask = (showTask1 ? 1 : 2) as 1 | 2;

    // State
    const [activeTask, setActiveTask] = useState<1 | 2>(defaultTask);
    const [essays, setEssays] = useState<{ 1: string; 2: string }>(
        homeworkContext?.previousEssay || { 1: '', 2: '' }
    );
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [showResumeModal, setShowResumeModal] = useState(false);
    const [antiCheatConfig, setAntiCheatConfig] = useState<AntiCheatConfig | null>(null);
    const [persistenceReady, setPersistenceReady] = useState(false);
    const essaysRef = useRef<{ 1: string; 2: string }>(homeworkContext?.previousEssay || { 1: '', 2: '' });
    const activeTaskRef = useRef<1 | 2>(defaultTask);
    const pasteAttemptCountRef = useRef(0);

    // Teacher list for SubmitToTeacherModal
    const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
    const [teachersLoaded, setTeachersLoaded] = useState(false);

    // Auto-save indicator
    const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving'>('saved');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const startedAtRef = useRef<number>(homeworkContext?.startedAt ?? Date.now());
    const timerExpiredRef = useRef(false);
    const timeRemainingRef = useRef<number | null>(null);
    const [autoSubmitOnTimeout, setAutoSubmitOnTimeout] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(
        getTimerSecondsRemaining(timerMinutes, homeworkContext?.startedAt ?? null)
    );
    timeRemainingRef.current = timeRemaining;

    // Hooks
    const activeTime = useActiveTimeTracking(taskCount as 1 | 2);
    const pastePrevention = useExternalPastePrevention({
        enabled: isHomework ? Boolean(antiCheatConfig?.detectCopyPaste) : true,
        initialPasteAttemptCount: 0,
    });
    const { pasteAttemptCount, setPasteAttemptCount, attachToTextarea } = pastePrevention;
    pasteAttemptCountRef.current = pasteAttemptCount;

    const writingScopeContext = useMemo(
        () => resolveWritingScopeContext(practiceContext, homeworkContext),
        [
            homeworkContext?.homeworkId,
            homeworkContext?.submissionId,
            practiceContext?.courseId,
            practiceContext?.homeworkId,
            practiceContext?.mode,
            practiceContext?.moduleId,
            practiceContext?.submissionId,
        ],
    );

    const handleBack = useCallback(() => {
        void studentResumeService.clearResume();
        if (isHomework) {
            navigate(buildRoute('STUDENT_HOMEWORK'));
            return;
        }

        navigate(-1);
    }, [isHomework, navigate]);

    const hasValidHomeworkIdentity = !isHomework
        || Boolean(homeworkContext?.homeworkId && homeworkContext?.submissionId);

    const applySavedProgress = useCallback((saved: SavedWritingPracticeState) => {
        setEssays(saved.essays);
        setActiveTask(saved.activeTask);

        if (isHomework) {
            setPasteAttemptCount(saved.pasteAttemptCount ?? 0);
        }

        const resolvedStartedAt = isHomework
            ? homeworkContext?.startedAt ?? saved.startedAt
            : saved.startedAt;

        startedAtRef.current = resolvedStartedAt;
        setTimeRemaining(getTimerSecondsRemaining(timerMinutes, resolvedStartedAt));
    }, [homeworkContext?.startedAt, isHomework, setPasteAttemptCount, timerMinutes]);

    const resetPracticeSession = useCallback(() => {
        void removeWritingProgress({
            materialId,
            studentId,
            scopeContext: writingScopeContext,
        });
        setEssays({ 1: '', 2: '' });
        setActiveTask(defaultTask);
        setPasteAttemptCount(0);

        const nextStartedAt = isHomework
            ? homeworkContext?.startedAt ?? Date.now()
            : Date.now();

        startedAtRef.current = nextStartedAt;
        timerExpiredRef.current = false;
        setTimeRemaining(getTimerSecondsRemaining(timerMinutes, isHomework ? nextStartedAt : null));
        setShowResumeModal(false);
    }, [
        defaultTask,
        homeworkContext?.startedAt,
        isHomework,
        materialId,
        setPasteAttemptCount,
        studentId,
        timerMinutes,
        writingScopeContext,
    ]);

    useEffect(() => {
        if (!isHomework || !homeworkContext?.homeworkId) {
            setAntiCheatConfig(null);
            return;
        }

        let cancelled = false;

        getHomeworkById(homeworkContext.homeworkId)
            .then((homework) => {
                if (!cancelled) {
                    setAntiCheatConfig((homework?.antiCheatConfig as AntiCheatConfig) || null);
                }
            })
            .catch((error) => {
                console.warn('[WritingPracticeView] Failed to load anti-cheat config:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [homeworkContext?.homeworkId, isHomework]);

    // ── Load saved state on mount ──────────────────────────
    useEffect(() => {
        if (!studentId) return;

        let cancelled = false;

        void (async () => {
            const { progress } = await readWritingProgress({
                materialId,
                studentId,
                scopeContext: writingScopeContext,
            });

            if (cancelled) {
                return;
            }

            if (progress) {
                if (shouldForceResume || autoResume) {
                    applySavedProgress(progress);
                    setPersistenceReady(true);
                } else {
                    setShowResumeModal(true);
                }
                return;
            }

            startedAtRef.current = homeworkContext?.startedAt ?? Date.now();
            setPersistenceReady(true);
        })().catch((error) => {
            console.warn('[WritingPracticeView] Failed to load saved progress:', error);
            if (!cancelled) {
                startedAtRef.current = homeworkContext?.startedAt ?? Date.now();
                setPersistenceReady(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [
        applySavedProgress,
        autoResume,
        homeworkContext?.startedAt,
        materialId,
        shouldForceResume,
        studentId,
        writingScopeContext,
    ]);

    useEffect(() => {
        essaysRef.current = essays;
        activeTaskRef.current = activeTask;
    }, [activeTask, essays]);

    // ── Load teachers from enrolled classes ─────────────────
    useEffect(() => {
        if (!studentId || teachersLoaded) return;

        const loadTeachers = async () => {
            try {
                if (isHomework) {
                    if (!homeworkContext?.teacherId) {
                        setTeachers([]);
                        return;
                    }

                    const profile = await getUserById(homeworkContext.teacherId);
                    setTeachers([
                        {
                            id: homeworkContext.teacherId,
                            name: profile?.displayName || profile?.email || 'Assigned teacher',
                        },
                    ]);
                    return;
                }

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
    }, [studentId, teachersLoaded, isHomework, homeworkContext?.teacherId]);

    // ── Timer (optional) ────────────────────────────────────
    useEffect(() => {
        if (timerMinutes === null || timerMinutes <= 0 || submitted || showResumeModal) return;

        if ((timeRemainingRef.current ?? 0) <= 0) {
            if (!timerExpiredRef.current) {
                timerExpiredRef.current = true;
                if (isHomework) {
                    setAutoSubmitOnTimeout(true);
                } else {
                    setShowSubmitModal(true);
                }
            }
            return;
        }

        const interval = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev === null) {
                    return null;
                }

                if (prev <= 1) {
                    clearInterval(interval);

                    if (!timerExpiredRef.current) {
                        timerExpiredRef.current = true;
                        if (isHomework) {
                            setAutoSubmitOnTimeout(true);
                        } else {
                            setShowSubmitModal(true);
                        }
                    }

                    return 0;
                }

                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [isHomework, showResumeModal, submitted, timerMinutes]);

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
            void writeWritingProgress({
                materialId,
                studentId,
                scopeContext: writingScopeContext,
            }, {
                essays: updatedEssays,
                activeTask: task,
                startedAt: startedAtRef.current,
                pasteAttemptCount: isHomework ? pasteAttemptCountRef.current : undefined,
            }).then(() => {
                setAutoSaveStatus('saved');
            }).catch(() => {
                console.warn('[WritingPracticeView] storage save failed');
            });
        }, 2000);
    }, [isHomework, materialId, studentId, writingScopeContext]);

    useEffect(() => {
        if (!isHomework || !persistenceReady || !studentId) {
            return;
        }

        void writeWritingProgress({
            materialId,
            studentId,
            scopeContext: writingScopeContext,
        }, {
            essays: essaysRef.current,
            activeTask: activeTaskRef.current,
            startedAt: startedAtRef.current,
            pasteAttemptCount,
        });
    }, [isHomework, materialId, pasteAttemptCount, persistenceReady, studentId, writingScopeContext]);

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
        void writeWritingProgress({
            materialId,
            studentId,
            scopeContext: writingScopeContext,
        }, {
            essays,
            activeTask: taskNum,
            startedAt: startedAtRef.current,
            pasteAttemptCount: isHomework ? pasteAttemptCount : undefined,
        });
        setAutoSaveStatus('saved');
        activeTime.switchTask(taskNum);
        setActiveTask(taskNum);
    }, [activeTime, essays, isHomework, materialId, pasteAttemptCount, studentId, writingScopeContext]);

    // ── Word count helper ───────────────────────────────────
    const getWordCount = (text: string) =>
        text.trim() ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

    // ── Resume handlers ─────────────────────────────────────
    const handleResume = () => {
        void readWritingProgress({
            materialId,
            studentId,
            scopeContext: writingScopeContext,
        }).then(({ progress }) => {
            if (progress) {
                applySavedProgress(progress);
            }
            setPersistenceReady(true);
            setShowResumeModal(false);
        });
    };

    const handleStartNew = () => {
        resetPracticeSession();
        setPersistenceReady(true);
    };

    // ── Submit flow ─────────────────────────────────────────
    const handleSubmit = useCallback(async (data: { teacherId: string | null; note: string }) => {
        setSubmitting(true);
        setShowSubmitModal(false);

        try {
            const assignedTeacherId = isHomework
                ? homeworkContext?.teacherId || null
                : data.teacherId;
            const homeworkSubmissionId = isHomework
                ? homeworkContext?.submissionId || null
                : null;

            if (isHomework && (!assignedTeacherId || !homeworkSubmissionId)) {
                throw new Error('Homework submission context is incomplete. Please reopen this assignment from the homework page.');
            }

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
                    type: contextType as 'homework' | 'solo-practice',
                    studentNote: data.note || undefined,
                    ...(isHomework
                        ? {
                            homeworkId: homeworkContext!.homeworkId,
                            homeworkSubmissionId: homeworkSubmissionId || undefined,
                            assigningTeacherId: assignedTeacherId || undefined,
                            isLate,
                        }
                        : {
                            selectedTeacherId: assignedTeacherId || undefined,
                        }),
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
                pasteAttemptCount,
                markingStatus: 'pending-review',
                annotations: [],
                auditTrail: [],
            };

            await createSubmission(submission);
            const materializeResult = await materializeSubmissionResult(submission);
            if (!materializeResult.success) {
                throw new Error(materializeResult.error || 'Failed to save writing result');
            }

            if (isHomework && homeworkSubmissionId) {
                await submitHomework(
                    homeworkSubmissionId,
                    resultId,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    submission.totalElapsedTimeSeconds,
                );
            }

            // Fire notification (non-blocking)
            notifyWritingSubmitted(
                studentId,
                resultId,
                testData.metadata.title,
                isHomework ? 'homework' : 'solo-practice'
            ).catch(err => console.warn('[WritingPracticeView] Notification failed:', err));

            if (assignedTeacherId && (isHomework || data.teacherId)) {
                notifyTeacherWritingSubmitted(
                    assignedTeacherId,
                    resultId,
                    studentId,
                    studentName,
                    testData.metadata.title,
                    isHomework ? 'homework' : 'solo-practice',
                ).catch(err => console.warn('[WritingPracticeView] Teacher notification failed:', err));
            }

            void removeWritingProgress({
                materialId,
                studentId,
                scopeContext: writingScopeContext,
            });
            void studentResumeService.clearResume();
            setSubmitted(true);

            // Show brief confirmation, then navigate
            const teacherName = assignedTeacherId
                ? teachers.find(t => t.id === assignedTeacherId)?.name || 'your teacher'
                : null;

            const confirmMsg = teacherName
                ? `✅ Essay submitted to ${teacherName} for review!`
                : '✅ Essay saved for self-review!';

            // Use a brief visible confirmation before navigating
            alert(confirmMsg);

            if (isHomework) {
                console.log('✅ [WritingPracticeView] Homework submitted — redirecting to homework page');
                navigate(buildRoute('STUDENT_HOMEWORK'), { replace: true });
            } else {
                console.log('✅ [WritingPracticeView] Solo essay submitted — redirecting to dashboard');
                navigate(buildRoute('STUDENT_DASHBOARD'), { replace: true });
            }
        } catch (err) {
            console.error('[WritingPracticeView] Submit failed:', err);
            alert(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }, [
        activeTime,
        essays,
        homeworkContext,
        homeworkDueDate,
        homeworkLateAllowed,
        isHomework,
        materialId,
        navigate,
        pasteAttemptCount,
        studentId,
        studentName,
        teachers,
        testData,
        writingScopeContext,
    ]);

    useEffect(() => {
        if (!autoSubmitOnTimeout || !isHomework || submitted || submitting) {
            return;
        }

        setAutoSubmitOnTimeout(false);
        void handleSubmit({ teacherId: homeworkContext?.teacherId || null, note: '' });
    }, [autoSubmitOnTimeout, handleSubmit, homeworkContext?.teacherId, isHomework, submitted, submitting]);

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
    if (!hasValidHomeworkIdentity) {
        return (
            <div className="wpv-submitted-overlay">
                <style>{`.wpv-submitted-overlay div:first-of-type { display: none; }`}</style>
                <div style={{ fontSize: 64 }}>âš ï¸</div>
                <div style={{ fontSize: 64 }}>!</div>
                <h1>Homework Unavailable</h1>
                <p>This homework launch is missing attempt details. Please reopen it from the homework page.</p>
                <button className="wpv-done-btn" onClick={handleBack} style={{ fontSize: 0 }}>
                    â† Back to Homework
                    <span style={{ fontSize: '1rem' }}>Back to Homework</span>
                </button>
            </div>
        );
    }

    if (isHomework && homeworkDueDate && !homeworkLateAllowed && Date.now() > homeworkDueDate) {
        return (
            <div className="wpv-submitted-overlay">
                <div style={{ fontSize: 64 }}>⏰</div>
                <h1>Deadline Passed</h1>
                <p>The deadline for this homework has passed. Submissions are no longer accepted.</p>
                <button className="wpv-done-btn" onClick={handleBack}>
                    ← Back to Homework
                </button>
            </div>
        );
    }

    return (
        <div className="wpv-page">
            {/* ── Header ──────────────────────────────────── */}
            <div className="wpv-header">
                <button className="wpv-back-btn" onClick={handleBack}>
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
                    attachToTextarea={attachToTextarea}
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
                            {!shouldForceResume && (
                                <button className="wpv-resume-btn wpv-resume-btn--new" onClick={handleStartNew}>
                                    Start New
                                </button>
                            )}
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
