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

import { useState, useCallback, useEffect } from 'react';
import { Modal, Textarea, Select, MultiSelect, NumberInput, Checkbox, Group, Stack, Text, Badge, Divider, Radio } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../../hooks/useAuth';
import { createHomework } from '../../services/homeworkManager';
import { sendThcsHomeworkAssignedNotification } from '../../services/notificationService';
import { ref, get } from 'firebase/database';
import { database } from '../../services/firebase';
import { getClasses, getClass } from '../../services/classManager';
import { DateTimeCalendar } from '../common/DateTimeCalendar';
import type { HomeworkTarget } from '../../types/homework.types';

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
    const [instructions, setInstructions] = useState('');
    const [pinToVersion, setPinToVersion] = useState(true);
    const [submitting, setSubmitting] = useState(false);

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
        setInstructions('');
        setPinToVersion(true);
    }, []);

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
            notifications.show({
                title: 'Validation Error',
                message: errors.join(' '),
                color: 'red',
            });
            return;
        }

        if (!user?.uid || !dueDate) return;

        setSubmitting(true);
        try {
            // Build target
            let target: HomeworkTarget;
            if (targetType === 'class') {
                target = { type: 'class', classId: classId.trim(), className: className.trim() || undefined };
            } else {
                target = { type: 'students', studentIds: selectedStudentIds };
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

            notifications.show({
                title: 'Homework Assigned',
                message: `"${testTitle}" has been assigned as homework.`,
                color: 'green',
            });

            resetForm();
            onClose();
            onSuccess?.();
        } catch (error) {
            console.error('Error creating THCS homework:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to assign homework. Please try again.',
                color: 'red',
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

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <Text fw={700} size="lg">📋 Assign THCS Homework</Text>
                </Group>
            }
            size="lg"
            closeOnClickOutside={!submitting}
            styles={{
                header: {
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '0.75rem',
                },
                body: {
                    padding: '1.5rem',
                },
            }}
        >
            <Stack gap="lg">
                {/* Test info (read-only) */}
                <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(139, 92, 246, 0.08)',
                    borderRadius: '8px',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                }}>
                    <Group gap="xs" mb={4}>
                        <Badge color="violet" variant="light" size="sm">THCS-THPT</Badge>
                        {testMetadata?.gradeLevel && (
                            <Badge color="blue" variant="light" size="sm">Grade {testMetadata.gradeLevel}</Badge>
                        )}
                        {testMetadata?.duration && (
                            <Badge color="green" variant="light" size="sm">{testMetadata.duration} min</Badge>
                        )}
                    </Group>
                    <Text fw={600} size="md">{testTitle}</Text>
                    <Text size="xs" c="dimmed" mt={2}>
                        Default timer: {timerModeLabel(testMetadata?.timerMode || 'strict')}
                    </Text>
                </div>

                <Divider label="Target Students" labelPosition="left" />

                {/* Target selection */}
                <Radio.Group
                    value={targetType}
                    onChange={(val) => setTargetType(val as 'class' | 'students')}
                    label="Assign to"
                >
                    <Group mt="xs">
                        <Radio value="class" label="Class" />
                        <Radio value="students" label="Individual Students" />
                    </Group>
                </Radio.Group>

                {targetType === 'class' ? (
                    <Select
                        label="Select Class"
                        placeholder={loadingClasses ? 'Loading classes...' : 'Search for a class...'}
                        data={classOptions}
                        value={classId}
                        onChange={(val) => {
                            setClassId(val || '');
                            const selected = classOptions.find(c => c.value === val);
                            setClassName(selected?.label?.split(' (')[0] || '');
                        }}
                        searchable
                        clearable
                        nothingFoundMessage={loadingClasses ? 'Loading...' : 'No classes found'}
                        required
                        disabled={loadingClasses}
                    />
                ) : (
                    <MultiSelect
                        label="Select Students"
                        placeholder={loadingClasses ? 'Loading students...' : 'Search for students...'}
                        data={studentOptions}
                        value={selectedStudentIds}
                        onChange={setSelectedStudentIds}
                        searchable
                        clearable
                        nothingFoundMessage={loadingClasses ? 'Loading...' : 'No students found'}
                        required
                        disabled={loadingClasses}
                        maxDropdownHeight={200}
                    />
                )}

                <Divider label="Schedule" labelPosition="left" />

                {/* Schedule — custom visual calendar picker */}
                <Group grow>
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
                </Group>

                <Divider label="Settings" labelPosition="left" />

                {/* Timer Mode Override */}
                <Select
                    label="Timer Mode"
                    description={`Test default: ${timerModeLabel(testMetadata?.timerMode || 'strict')}`}
                    data={[
                        { value: '', label: `Use test default (${testMetadata?.timerMode || 'strict'})` },
                        { value: 'strict', label: '⏱️ Strict — auto-submit at 0:00' },
                        { value: 'informational', label: '🕐 Informational — timer shown, student decides' },
                        { value: 'none', label: '🚫 No timer' },
                    ]}
                    value={timerModeOverride}
                    onChange={(val) => setTimerModeOverride((val || '') as any)}
                />

                {/* Late Submission Policy */}
                <Radio.Group
                    value={latePolicy}
                    onChange={(val) => setLatePolicy(val as LateSubmissionPolicy)}
                    label="Late Submission Policy"
                    description="What happens when a student submits after the deadline"
                >
                    <Stack mt="xs" gap="xs">
                        <Radio value="accept" label='Accept — no penalty, no "Late" badge' />
                        <Radio value="accept-late" label='Accept — marked as "Late" (badge shown to teacher)' />
                        <Radio value="reject" label="Reject — block submission after deadline" />
                        <Radio value="penalty" label="Penalty — accept but deduct from score" />
                    </Stack>
                </Radio.Group>

                {latePolicy === 'penalty' && (
                    <NumberInput
                        label="Penalty Percentage"
                        description="Deducted from final score (e.g., 10% → score 8.0 becomes 7.2)"
                        value={penaltyPercent}
                        onChange={(val) => setPenaltyPercent(typeof val === 'number' ? val : 10)}
                        min={1}
                        max={100}
                        suffix="%"
                    />
                )}

                <Group grow>
                    <NumberInput
                        label="Max Attempts"
                        description="How many times student can submit (1-5)"
                        value={maxAttempts}
                        onChange={(val) => setMaxAttempts(typeof val === 'number' ? val : 1)}
                        min={1}
                        max={5}
                    />
                    <Select
                        label="Feedback Timing"
                        data={[
                            { value: 'after-submission', label: '📊 After submission (immediate)' },
                            { value: 'after-deadline', label: '📅 After deadline' },
                            { value: 'manual', label: '👨‍🏫 Manual release by teacher' },
                        ]}
                        value={feedbackTiming}
                        onChange={(val) => setFeedbackTiming((val || 'after-submission') as FeedbackTimingOption)}
                    />
                </Group>

                {/* Instructions */}
                <Textarea
                    label="Instructions for Students (optional)"
                    placeholder="Special instructions or notes for this assignment..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.currentTarget.value)}
                    autosize
                    minRows={2}
                    maxRows={4}
                />

                {/* Version Pinning */}
                <Checkbox
                    label="Pin to current version"
                    description={versionKey
                        ? `Students will see version: ${versionKey}`
                        : 'Students will always see the latest version'}
                    checked={pinToVersion}
                    onChange={(e) => setPinToVersion(e.currentTarget.checked)}
                />

                <Divider />

                {/* Actions */}
                <Group justify="flex-end">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        style={{
                            padding: '0.5rem 1.25rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            background: 'white',
                            color: '#374151',
                            fontWeight: 600,
                            cursor: submitting ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        style={{
                            padding: '0.5rem 1.25rem',
                            border: 'none',
                            borderRadius: '8px',
                            background: submitting
                                ? '#9ca3af'
                                : 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                            color: 'white',
                            fontWeight: 700,
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            minWidth: '160px',
                        }}
                    >
                        {submitting ? '⏳ Assigning...' : '📋 Assign Homework'}
                    </button>
                </Group>
            </Stack>
        </Modal>
    );
}

export default THCSHomeworkAssignDialog;
