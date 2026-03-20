/**
 * THCSHomeworkAssignDialog — THCS Homework Assignment Dialog (Phase 3, Task 2.3)
 *
 * A dialog for assigning THCS tests as homework. Supports:
 * - Target selection (class/course/individual students)
 * - Timer mode override
 * - Schedule (availableFrom + dueDate)
 * - Late submission policy (accept/accept-late/reject/penalty)
 * - Max attempts (1-5)
 * - Feedback timing
 * - Version pinning
 * - Teacher instructions
 *
 * ⚠️ Rule 8: This component must be integrated into BOTH TeacherLobbyPage.jsx (Task 2.1)
 * and TeacherHomeworkListPage.tsx (Task 2.2).
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { createHomework } from '../../services/homeworkManager';
import { sendThcsHomeworkAssignedNotification } from '../../services/notificationService';
import { ref, get } from 'firebase/database';
import { database } from '../../services/firebase';
import { getClasses, getClass } from '../../services/classManager';
import { DateTimeCalendar } from '../common/DateTimeCalendar';
import { Button, Input, Textarea } from '../modern';
import type { HomeworkTarget } from '../../types/homework.types';
import type { AntiCheatPreset } from '../../types/integrity.types';
import { getContextDefaults, resolvePreset } from '../../utils/antiCheatPresets';

// ============================================================================
// Types
// ============================================================================

interface THCSHomeworkAssignDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    /** The THCS test ID (published test ID in RTDB) */
    testId: string;
    /** Test title for display */
    testTitle: string;
    /** Current version key from test._changelog (if available) */
    versionKey?: string;
    /** Test metadata for display */
    testMetadata?: {
        timerMode?: 'strict' | 'informational' | 'none';
        duration?: number;
        gradeLevel?: number;
        examType?: string;
    };
}

type LateSubmissionPolicy = 'accept' | 'accept-late' | 'reject' | 'penalty';
type FeedbackTimingOption = 'after-submission' | 'after-deadline' | 'manual';

// ============================================================================
// Component
// ============================================================================

export function THCSHomeworkAssignDialog({
    isOpen,
    onClose,
    onSuccess,
    testId,
    testTitle,
    versionKey,
    testMetadata,
}: THCSHomeworkAssignDialogProps) {
    const { user } = useAuth();

    // Form state
    const [targetType, setTargetType] = useState<'class' | 'students'>('class');
    const [classId, setClassId] = useState('');
    const [className, setClassName] = useState('');
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [timerModeOverride, setTimerModeOverride] = useState<'strict' | 'informational' | 'none' | ''>(
        ''
    );
    const [availableFrom, setAvailableFrom] = useState<Date | null>(new Date());
    const [dueDate, setDueDate] = useState<Date | null>(null);
    const [latePolicy, setLatePolicy] = useState<LateSubmissionPolicy>('accept-late');
    const [penaltyPercent, setPenaltyPercent] = useState<number>(10);
    const [maxAttempts, setMaxAttempts] = useState<number>(1);
    const [feedbackTiming, setFeedbackTiming] = useState<FeedbackTimingOption>('after-submission');
    const [antiCheatPreset, setAntiCheatPreset] = useState<AntiCheatPreset>('none');
    const [nullifyRemainingAttempts, setNullifyRemainingAttempts] = useState(false);
    const [instructions, setInstructions] = useState('');
    const [pinToVersion, setPinToVersion] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [studentSearch, setStudentSearch] = useState('');
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);

    // Class & student search data
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [classOptions, setClassOptions] = useState<{ value: string; label: string }[]>([]);
    const [studentOptions, setStudentOptions] = useState<{ value: string; label: string }[]>([]);

    // Fetch teacher's classes and students on modal open
    useEffect(() => {
        if (!isOpen || !user?.uid) return;
        let cancelled = false;

        const fetchData = async () => {
            setLoadingClasses(true);
            try {
                const classes = await getClasses(user.uid);
                if (cancelled) return;

                // Build class options
                const cOpts = classes.map(c => ({
                    value: c.id || c.classCode,
                    label: `${c.name} (${c.studentCount} students)`,
                }));
                setClassOptions(cOpts);

                // Fetch full class data for student lists
                const allStudents: { value: string; label: string }[] = [];
                const seenUids = new Set<string>();

                for (const cls of classes) {
                    const fullClass = await getClass(cls.id || cls.classCode);
                    if (cancelled) return;
                    if (!fullClass?.students) continue;

                    for (const [key, student] of Object.entries(fullClass.students)) {
                        const uid = (student as any).uid || key;
                        if (seenUids.has(uid)) continue;
                        seenUids.add(uid);
                        const name = (student as any).name || (student as any).email || uid;
                        allStudents.push({
                            value: uid,
                            label: `${name} — ${cls.name}`,
                        });
                    }
                }

                setStudentOptions(allStudents);
            } catch (err) {
                console.error('[THCSHomework] Failed to fetch classes:', err);
            } finally {
                if (!cancelled) setLoadingClasses(false);
            }
        };

        fetchData();
        return () => { cancelled = true; };
    }, [isOpen, user?.uid]);

    // Derived

    const resetForm = useCallback(() => {
        setTargetType('class');
        setClassId('');
        setClassName('');
        setSelectedStudentIds([]);
        setTimerModeOverride('');
        setAvailableFrom(new Date());
        setDueDate(null);
        setLatePolicy('accept-late');
        setPenaltyPercent(10);
        setMaxAttempts(1);
        setFeedbackTiming('after-submission');
        setAntiCheatPreset('none');
        setNullifyRemainingAttempts(false);
        setInstructions('');
        setPinToVersion(true);
        setStudentSearch('');
        setFeedback(null);
    }, []);

    const filteredStudentOptions = useMemo(() => {
        if (!studentSearch.trim()) {
            return studentOptions;
        }

        const query = studentSearch.toLowerCase();
        return studentOptions.filter((option) => option.label.toLowerCase().includes(query));
    }, [studentOptions, studentSearch]);

    // Validation
    const getValidationErrors = (): string[] => {
        const errors: string[] = [];
        if (!dueDate) errors.push('Due date is required.');
        if (availableFrom && dueDate && dueDate <= availableFrom) {
            errors.push('Due date must be after the available date.');
        }
        if (targetType === 'class' && !classId.trim()) {
            errors.push('Please select a class.');
        }
        if (targetType === 'students' && selectedStudentIds.length === 0) {
            errors.push('Please select at least one student.');
        }
        if (maxAttempts < 1 || maxAttempts > 5) {
            errors.push('Max attempts must be between 1 and 5.');
        }
        if (latePolicy === 'penalty' && (penaltyPercent < 1 || penaltyPercent > 100)) {
            errors.push('Penalty percentage must be between 1 and 100.');
        }
        return errors;
    };

    const handleSubmit = async () => {
        const errors = getValidationErrors();
        if (errors.length > 0) {
            setFeedback({
                tone: 'error',
                message: errors.join(' '),
            });
            return;
        }

        if (!user?.uid || !dueDate) return;

        setSubmitting(true);
        setFeedback(null);
        try {
            // Build target
            let target: HomeworkTarget;
            if (targetType === 'class') {
                target = { type: 'class', classId: classId.trim(), ...(className.trim() ? { className: className.trim() } : {}) };
            } else {
                // Denormalize student names at creation time so the UI
                // never needs to re-fetch them (PRD denormalization pattern)
                const studentNames = selectedStudentIds.map(id => {
                    const option = studentOptions.find(o => o.value === id);
                    // Label format is "Name — ClassName", extract just the name
                    return option ? option.label.split(' — ')[0] || id : id;
                });
                target = { type: 'students', studentIds: selectedStudentIds, studentNames };
            }

            await createHomework({
                materialId: testId,
                materialTitle: testTitle,
                materialType: 'thcs-test',
                materialSkill: 'reading', // THCS tests are multi-skill but we default to 'reading'
                teacherId: user.uid,
                target,
                config: {
                    timerMinutes: testMetadata?.duration || 45,
                    maxAttempts: maxAttempts,
                    feedbackTiming: feedbackTiming === 'after-submission' ? 'after_completion' : feedbackTiming === 'after-deadline' ? 'after_deadline' : 'never',
                    lateSubmissionAllowed: latePolicy !== 'reject',
                },
                availableFrom: availableFrom || undefined,
                dueDate: dueDate,
                instructions: instructions || '',
                title: testTitle,
                antiCheatConfig: antiCheatPreset === 'none'
                    ? undefined
                    : {
                        ...resolvePreset(antiCheatPreset),
                        ...getContextDefaults('homework'),
                        nullifyRemainingAttempts,
                    },
                thcsConfig: {
                    ...(timerModeOverride ? { timerModeOverride } : {}),
                    lateSubmissionPolicy: latePolicy,
                    ...(latePolicy === 'penalty' ? { penaltyPercent } : {}),
                    maxAttempts,
                    feedbackTiming,
                    ...(instructions ? { instructions } : {}),
                    ...(versionKey ? { versionKey } : {}),
                    pinToVersion,
                },
            });

            // Note: thcsConfig is stored separately via homeworkManager extension (Task 2.4)
            // For now we create the basic homework. Task 2.4 will extend createHomework to handle thcsConfig.

            // Phase 3 Task 3.1: Send THCS homework assigned notifications (fire-and-forget)
            try {
                let notifyStudentIds: string[] = [];
                if (targetType === 'class') {
                    // Fetch student IDs from RTDB class
                    const snapshot = await get(ref(database, `classes/${classId.trim()}/students`));
                    if (snapshot.exists()) {
                        notifyStudentIds = Object.keys(snapshot.val()).filter(Boolean);
                    }
                } else {
                    notifyStudentIds = [...selectedStudentIds];
                }
                if (notifyStudentIds.length > 0) {
                    sendThcsHomeworkAssignedNotification(
                        notifyStudentIds, testId, testTitle, dueDate.getTime()
                    ).catch(err => console.warn('[THCSHomework] Notification send failed (non-blocking):', err));
                }
            } catch (notifErr) {
                console.warn('[THCSHomework] Notification setup failed (non-blocking):', notifErr);
            }

            resetForm();
            onClose();
            onSuccess?.();
        } catch (error) {
            console.error('[THCSHomework] Error creating homework:', error);
            setFeedback({
                tone: 'error',
                message: 'Failed to assign homework. Please try again.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const timerModeLabel = (mode: string) => {
        switch (mode) {
            case 'strict': return 'Strict (auto-submit at 0:00)';
            case 'informational': return 'Informational (timer shown, no auto-submit)';
            case 'none': return 'No timer';
            default: return mode;
        }
    };

    const feedbackToneStyles = {
        success: {
            background: 'rgba(220,252,231,0.9)',
            border: '1px solid rgba(34,197,94,0.2)',
            color: '#15803d',
        },
        error: {
            background: 'rgba(254,226,226,0.9)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#b91c1c',
        },
        info: {
            background: 'rgba(219,234,254,0.9)',
            border: '1px solid rgba(59,130,246,0.2)',
            color: '#1d4ed8',
        },
    } as const;

    const toggleStudentSelection = (studentId: string) => {
        setSelectedStudentIds((current) =>
            current.includes(studentId)
                ? current.filter((id) => id !== studentId)
                : [...current, studentId]
        );
    };

    const handleRequestClose = () => {
        if (submitting) {
            return;
        }

        resetForm();
        onClose();
    };

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !submitting) {
                handleRequestClose();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, submitting]);

    if (!isOpen) {
        return null;
    }

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Assign THCS Homework"
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    handleRequestClose();
                }
            }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2200,
                background: 'rgba(15, 23, 42, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem',
                backdropFilter: 'blur(8px)',
            }}
        >
            <div
                style={{
                    width: 'min(960px, 100%)',
                    maxHeight: '92vh',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))',
                    borderRadius: '1.5rem',
                    border: '1px solid rgba(226,232,240,0.9)',
                    boxShadow: '0 24px 70px rgba(15,23,42,0.28)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid rgba(226,232,240,0.9)',
                    }}
                >
                    <div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                            📋 Assign THCS Homework
                        </div>
                        <div style={{ marginTop: '0.2rem', fontSize: '0.9rem', color: '#64748b' }}>
                            Configure targets, schedule, and submission rules for this THCS-THPT assignment.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleRequestClose}
                        disabled={submitting}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#64748b',
                            fontSize: '1.5rem',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>

                <div
                    style={{
                        padding: '1.5rem',
                        overflowY: 'auto',
                        display: 'grid',
                        gap: '1.25rem',
                    }}
                >
                    {/* Test info (read-only) */}
                    <div
                        style={{
                            padding: '0.95rem 1rem',
                            background: 'rgba(139, 92, 246, 0.08)',
                            borderRadius: '1rem',
                            border: '1px solid rgba(139, 92, 246, 0.18)',
                        }}
                    >
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '0.26rem 0.65rem',
                                    borderRadius: '999px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    background: 'rgba(124,58,237,0.12)',
                                    color: '#7c3aed',
                                }}
                            >
                                THCS-THPT
                            </span>
                            {testMetadata?.gradeLevel ? (
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '0.26rem 0.65rem',
                                        borderRadius: '999px',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        background: 'rgba(59,130,246,0.12)',
                                        color: '#2563eb',
                                    }}
                                >
                                    Grade {testMetadata.gradeLevel}
                                </span>
                            ) : null}
                            {testMetadata?.duration ? (
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '0.26rem 0.65rem',
                                        borderRadius: '999px',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        background: 'rgba(16,185,129,0.12)',
                                        color: '#059669',
                                    }}
                                >
                                    {testMetadata.duration} min
                                </span>
                            ) : null}
                        </div>
                        <div style={{ fontSize: '1.03rem', fontWeight: 700, color: '#0f172a' }}>{testTitle}</div>
                        <div style={{ marginTop: '0.25rem', fontSize: '0.84rem', color: '#64748b' }}>
                            Default timer: {timerModeLabel(testMetadata?.timerMode || 'strict')}
                        </div>
                    </div>

                    {feedback ? (
                        <div
                            style={{
                                borderRadius: '1rem',
                                padding: '0.9rem 1rem',
                                ...feedbackToneStyles[feedback.tone],
                            }}
                        >
                            {feedback.message}
                        </div>
                    ) : null}

                    <div
                        style={{
                            fontSize: '0.83rem',
                            fontWeight: 800,
                            color: '#475569',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}
                    >
                        Target Students
                    </div>

                    {/* Target selection */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setTargetType('class')}
                            style={{
                                padding: '0.65rem 0.95rem',
                                borderRadius: '0.9rem',
                                border: targetType === 'class' ? '1px solid rgba(79,70,229,0.35)' : '1px solid rgba(203,213,225,0.95)',
                                background: targetType === 'class' ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.85)',
                                color: targetType === 'class' ? '#4338ca' : '#475569',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Class
                        </button>
                        <button
                            type="button"
                            onClick={() => setTargetType('students')}
                            style={{
                                padding: '0.65rem 0.95rem',
                                borderRadius: '0.9rem',
                                border: targetType === 'students' ? '1px solid rgba(79,70,229,0.35)' : '1px solid rgba(203,213,225,0.95)',
                                background: targetType === 'students' ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.85)',
                                color: targetType === 'students' ? '#4338ca' : '#475569',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Individual Students
                        </button>
                    </div>

                    {targetType === 'class' ? (
                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                                Select Class
                            </label>
                            <select
                                value={classId}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setClassId(value);
                                    const selected = classOptions.find((option) => option.value === value);
                                    setClassName(selected?.label?.split(' (')[0] || '');
                                }}
                                disabled={loadingClasses}
                                style={{
                                    width: '100%',
                                    minHeight: '44px',
                                    borderRadius: '0.9rem',
                                    border: '1px solid rgba(203,213,225,0.95)',
                                    padding: '0.75rem 0.9rem',
                                    background: '#fff',
                                    color: '#1e293b',
                                }}
                            >
                                <option value="">
                                    {loadingClasses ? 'Loading classes...' : 'Select a class'}
                                </option>
                                {classOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.85rem' }}>
                            <Input
                                label="Search Students"
                                placeholder={loadingClasses ? 'Loading students...' : 'Search by name or class...'}
                                value={studentSearch}
                                onChange={(event) => setStudentSearch(event.target.value)}
                                fullWidth
                                disabled={loadingClasses}
                            />
                            <div
                                style={{
                                    borderRadius: '1rem',
                                    border: '1px solid rgba(203,213,225,0.9)',
                                    background: 'rgba(255,255,255,0.92)',
                                    maxHeight: '240px',
                                    overflowY: 'auto',
                                    padding: '0.35rem',
                                }}
                            >
                                {filteredStudentOptions.length > 0 ? (
                                    filteredStudentOptions.map((option) => {
                                        const checked = selectedStudentIds.includes(option.value);
                                        return (
                                            <label
                                                key={option.value}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    padding: '0.7rem 0.8rem',
                                                    borderRadius: '0.85rem',
                                                    cursor: 'pointer',
                                                    background: checked ? 'rgba(99,102,241,0.08)' : 'transparent',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleStudentSelection(option.value)}
                                                />
                                                <span style={{ color: '#1e293b', fontSize: '0.92rem' }}>{option.label}</span>
                                            </label>
                                        );
                                    })
                                ) : (
                                    <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                                        {loadingClasses ? 'Loading students...' : 'No students found'}
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: '0.84rem', color: '#64748b' }}>
                                Selected students: {selectedStudentIds.length}
                            </div>
                        </div>
                    )}

                    <div
                        style={{
                            fontSize: '0.83rem',
                            fontWeight: 800,
                            color: '#475569',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}
                    >
                        Schedule
                    </div>

                    {/* Schedule — custom visual calendar picker */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: '1rem',
                        }}
                    >
                        <DateTimeCalendar
                            label="Available From"
                            value={availableFrom}
                            onChange={setAvailableFrom}
                        />
                        <DateTimeCalendar
                            label="Due Date"
                            value={dueDate}
                            onChange={setDueDate}
                            required
                            minDate={availableFrom || undefined}
                        />
                    </div>

                    <div
                        style={{
                            fontSize: '0.83rem',
                            fontWeight: 800,
                            color: '#475569',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}
                    >
                        Settings
                    </div>

                    {/* Timer Mode Override */}
                    <div style={{ display: 'grid', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                            Timer Mode
                        </label>
                        <select
                            value={timerModeOverride}
                            onChange={(event) => setTimerModeOverride(event.target.value as 'strict' | 'informational' | 'none' | '')}
                            style={{
                                width: '100%',
                                minHeight: '44px',
                                borderRadius: '0.9rem',
                                border: '1px solid rgba(203,213,225,0.95)',
                                padding: '0.75rem 0.9rem',
                                background: '#fff',
                                color: '#1e293b',
                            }}
                        >
                            <option value="">{`Use test default (${testMetadata?.timerMode || 'strict'})`}</option>
                            <option value="strict">⏱️ Strict — auto-submit at 0:00</option>
                            <option value="informational">🕐 Informational — timer shown, student decides</option>
                            <option value="none">🚫 No timer</option>
                        </select>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Test default: {timerModeLabel(testMetadata?.timerMode || 'strict')}
                        </div>
                    </div>

                    {/* Late Submission Policy */}
                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                            Late Submission Policy
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            What happens when a student submits after the deadline.
                        </div>
                        {([
                            ['accept', 'Accept — no penalty, no "Late" badge'],
                            ['accept-late', 'Accept — marked as "Late" (badge shown to teacher)'],
                            ['reject', 'Reject — block submission after deadline'],
                            ['penalty', 'Penalty — accept but deduct from score'],
                        ] as Array<[LateSubmissionPolicy, string]>).map(([value, label]) => (
                            <label
                                key={value}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.7rem',
                                    padding: '0.72rem 0.85rem',
                                    borderRadius: '0.9rem',
                                    border: latePolicy === value ? '1px solid rgba(79,70,229,0.28)' : '1px solid rgba(226,232,240,0.95)',
                                    background: latePolicy === value ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.92)',
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="radio"
                                    name="latePolicy"
                                    value={value}
                                    checked={latePolicy === value}
                                    onChange={() => setLatePolicy(value)}
                                />
                                <span style={{ color: '#1e293b', fontSize: '0.92rem' }}>{label}</span>
                            </label>
                        ))}
                    </div>

                    {latePolicy === 'penalty' ? (
                        <Input
                            type="number"
                            label="Penalty Percentage"
                            helperText="Deducted from final score (for example: 10% turns 8.0 into 7.2)."
                            value={penaltyPercent}
                            onChange={(event) => setPenaltyPercent(Number(event.target.value) || 10)}
                            min={1}
                            max={100}
                            fullWidth
                        />
                    ) : null}

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '1rem',
                        }}
                    >
                        <Input
                            type="number"
                            label="Max Attempts"
                            helperText="How many times a student can submit (1-5)."
                            value={maxAttempts}
                            onChange={(event) => setMaxAttempts(Number(event.target.value) || 1)}
                            min={1}
                            max={5}
                            fullWidth
                        />
                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                                Feedback Timing
                            </label>
                            <select
                                value={feedbackTiming}
                                onChange={(event) => setFeedbackTiming(event.target.value as FeedbackTimingOption)}
                                style={{
                                    width: '100%',
                                    minHeight: '44px',
                                    borderRadius: '0.9rem',
                                    border: '1px solid rgba(203,213,225,0.95)',
                                    padding: '0.75rem 0.9rem',
                                    background: '#fff',
                                    color: '#1e293b',
                                }}
                            >
                                <option value="after-submission">📊 After submission (immediate)</option>
                                <option value="after-deadline">📅 After deadline</option>
                                <option value="manual">👨‍🏫 Manual release by teacher</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                            Anti-Cheat Preset
                        </div>
                        <select
                            value={antiCheatPreset}
                            onChange={(event) => setAntiCheatPreset(event.target.value as AntiCheatPreset)}
                            style={{
                                width: '100%',
                                minHeight: '44px',
                                borderRadius: '0.9rem',
                                border: '1px solid rgba(203,213,225,0.95)',
                                padding: '0.75rem 0.9rem',
                                background: '#fff',
                                color: '#1e293b',
                            }}
                        >
                            <option value="none">None</option>
                            <option value="standard">Standard</option>
                            <option value="strict">Strict</option>
                        </select>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Standard enables monitoring and event logging. Strict also requires fullscreen and lowers the auto-submit threshold.
                        </div>
                        {antiCheatPreset !== 'none' ? (
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.65rem',
                                    color: '#475569',
                                    fontSize: '0.88rem',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={nullifyRemainingAttempts}
                                    onChange={(event) => setNullifyRemainingAttempts(event.currentTarget.checked)}
                                />
                                Nullify remaining attempts if the anti-cheat auto-submit path is triggered.
                            </label>
                        ) : null}
                    </div>

                    {/* Instructions */}
                    <Textarea
                        label="Instructions for Students (optional)"
                        placeholder="Special instructions or notes for this assignment..."
                        value={instructions}
                        onChange={(event) => setInstructions(event.currentTarget.value)}
                        rows={4}
                        fullWidth
                    />

                    {/* Version Pinning */}
                    <label
                        style={{
                            display: 'flex',
                            gap: '0.8rem',
                            alignItems: 'flex-start',
                            padding: '0.95rem 1rem',
                            borderRadius: '1rem',
                            border: '1px solid rgba(226,232,240,0.95)',
                            background: 'rgba(255,255,255,0.94)',
                            cursor: 'pointer',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={pinToVersion}
                            onChange={(event) => setPinToVersion(event.currentTarget.checked)}
                            style={{ marginTop: '0.2rem' }}
                        />
                        <div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>
                                Pin to current version
                            </div>
                            <div style={{ marginTop: '0.2rem', fontSize: '0.84rem', color: '#64748b' }}>
                                {versionKey
                                    ? `Students will see version: ${versionKey}`
                                    : 'Students will always see the latest version'}
                            </div>
                        </div>
                    </label>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '0.75rem',
                            flexWrap: 'wrap',
                            paddingTop: '0.5rem',
                            borderTop: '1px solid rgba(226,232,240,0.9)',
                        }}
                    >
                        <Button
                            variant="outline"
                            onClick={handleRequestClose}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSubmit}
                            disabled={submitting}
                            style={{
                                background: submitting
                                    ? '#9ca3af'
                                    : 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                                minWidth: '170px',
                            }}
                        >
                            {submitting ? 'Assigning...' : 'Assign Homework'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default THCSHomeworkAssignDialog;
