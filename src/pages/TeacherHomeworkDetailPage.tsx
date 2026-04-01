import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, VanillaLoader } from '../components/modern';
import { toast } from '../components/modern/ToastNotification';
import HomeworkBreadcrumb from '../components/homework/HomeworkBreadcrumb';
import HomeworkAlertBanner, { HomeworkAlertItem } from '../components/homework/HomeworkAlertBanner';
import HomeworkSummaryStats from '../components/homework/HomeworkSummaryStats';
import HomeworkScoreDistribution from '../components/homework/HomeworkScoreDistribution';
import HomeworkSubmissionTable, { HomeworkSubmissionTableRow } from '../components/homework/HomeworkSubmissionTable';
import { HomeworkStatusBadge } from '../components/homework/HomeworkStatusBadge';
import { ResultDetailModal } from '../components/results/ResultDetailModal';
import ExtendStudentDeadlineModal from '../components/homework/ExtendStudentDeadlineModal';
import ExemptStudentModal from '../components/homework/ExemptStudentModal';
import { useHomeworkDetail } from '../hooks/useHomeworkDetail';
import { useClassRoster } from '../hooks/useClassRoster';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { TeacherHeader } from '../components/navigation';
import { resetStudentHomework } from '../services/homeworkSubmissionService';
import { updateStudentOverride } from '../services/homeworkManager';
import { sendHomeworkReminderNotification } from '../services/notificationService';
import { reportingService } from '../services/reportingService';
import './TeacherHomeworkDetailPage.css';
import { IntegrityDetailPanel } from '../components/test/IntegrityDetailPanel'; // PRD-0036
import type { HomeworkIntegrity } from '../types/integrity.types'; // PRD-0036
import { normalizeHomeworkIntegrity } from '../utils/integrityUtils';

interface AssignedStudent {
    studentId: string;
    studentName: string;
    studentEmail?: string;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function formatDateTime(value?: number | null): string {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatRelativeTime(timestamp: number): string {
    const diff = timestamp - Date.now();
    const absDiff = Math.abs(diff);
    const hours = Math.round(absDiff / (60 * 60 * 1000));
    const days = Math.round(absDiff / DAY_IN_MS);

    if (hours < 24) {
        return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${days} day${days === 1 ? '' : 's'}`;
}

function formatFeedbackTimingLabel(value: string): string {
    return value.replace(/_/g, ' ');
}

/** Small internal component for the note editing modal */
function NoteTextArea({ initialValue, onSave, onCancel }: {
    initialValue: string;
    onSave: (note: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(initialValue);

    return (
        <>
            <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Add a note about this student…"
                rows={4}
                autoFocus
                style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '0.6rem',
                    border: '1.5px solid rgba(148,163,184,0.3)',
                    fontSize: '0.9rem',
                    color: '#0f172a',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    outline: 'none',
                }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button variant="primary" onClick={() => onSave(value.trim())}>Save Note</Button>
            </div>
        </>
    );
}

function TeacherHomeworkDetailPage() {
    const { homeworkId } = useParams<{ homeworkId: string }>();
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const { homework, submissions, loading, error, refetch } = useHomeworkDetail(homeworkId);
    const classId = homework?.target.type === 'class' ? homework.target.classId : undefined;
    const { students, loading: rosterLoading, error: rosterError } = useClassRoster(classId);
    const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
    const [resetTarget, setResetTarget] = useState<HomeworkSubmissionTableRow | null>(null);
    const [resetMessage, setResetMessage] = useState<string | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [showThcsConfig, setShowThcsConfig] = useState(false);

    // PRD-0034 Task 11.0: Per-student action modal state
    const [extendTarget, setExtendTarget] = useState<HomeworkSubmissionTableRow | null>(null);
    const [exemptTarget, setExemptTarget] = useState<HomeworkSubmissionTableRow | null>(null);
    const [noteTarget, setNoteTarget] = useState<HomeworkSubmissionTableRow | null>(null);
    // PRD-0036: Integrity detail panel state
    const [selectedIntegrity, setSelectedIntegrity] = useState<{ report: HomeworkIntegrity; studentName: string } | null>(null);

    const latestSubmissionByStudent = useMemo(() => {
        const submissionMap = new Map<string, typeof submissions[number]>();

        submissions.forEach((submission) => {
            if (!submissionMap.has(submission.studentId)) {
                submissionMap.set(submission.studentId, submission);
            }
        });

        return submissionMap;
    }, [submissions]);

    const assignedStudents = useMemo<AssignedStudent[]>(() => {
        if (!homework) {
            return [];
        }

        if (homework.target.type === 'class') {
            if (students.length > 0) {
                return students.map((student) => ({
                    studentId: student.uid,
                    studentName: student.name,
                    studentEmail: student.email,
                }));
            }

            return Array.from(latestSubmissionByStudent.values()).map((submission) => ({
                studentId: submission.studentId,
                studentName: submission.studentName || submission.studentId,
                studentEmail: undefined,
            }));
        }

        if (homework.target.type === 'students') {
            const target = homework.target;

            return target.studentIds.map((studentId, index) => ({
                studentId,
                studentName:
                    target.studentNames?.[index] ||
                    latestSubmissionByStudent.get(studentId)?.studentName ||
                    studentId,
                studentEmail: undefined,
            }));
        }

        if (homework.target.type === 'group') {
            return homework.target.studentIds.map((studentId) => ({
                studentId,
                studentName: latestSubmissionByStudent.get(studentId)?.studentName || studentId,
                studentEmail: undefined,
            }));
        }

        return Array.from(latestSubmissionByStudent.values()).map((submission) => ({
            studentId: submission.studentId,
            studentName: submission.studentName || submission.studentId,
            studentEmail: undefined,
        }));
    }, [homework, latestSubmissionByStudent, students]);

    const rows = useMemo<HomeworkSubmissionTableRow[]>(() => {
        if (!homework) {
            return [];
        }

        const statusOrder: Record<HomeworkSubmissionTableRow['status'], number> = {
            not_started: 0,
            in_progress: 1,
            submitted: 2,
            graded: 3,
        };

        return assignedStudents
            .map((student) => {
                const submission = latestSubmissionByStudent.get(student.studentId);
                const studentOverride = homework.studentOverrides?.[student.studentId];

                return {
                    studentId: student.studentId,
                    studentName: student.studentName,
                    studentEmail: student.studentEmail,
                    status: submission?.status ?? 'not_started',
                    score:
                        typeof submission?.percentage === 'number'
                            ? Math.round(submission.percentage)
                            : null,
                    attemptNumber: submission?.attemptNumber ?? 0,
                    maxAttempts: homework.config.maxAttempts,
                    timeSpent: submission?.timeSpent,
                    submittedAt: submission?.submittedAt,
                    isLate: Boolean(submission?.isLate),
                    resultId: submission?.resultId,
                    isExempted: Boolean(studentOverride?.exempted),
                    reminderCount: studentOverride?.reminderCount ?? 0,
                    lastRemindedAt: studentOverride?.lastRemindedAt ?? null,
                    extendedDueDate: studentOverride?.dueDate ?? null,
                    note: studentOverride?.notes ?? '',
                    // PRD-0036: Attach integrity data from submission if present
                    integrityData: normalizeHomeworkIntegrity(submission?.integrity),
                };
            })
            .sort((left, right) => {
                const statusDelta = statusOrder[left.status] - statusOrder[right.status];
                if (statusDelta !== 0) {
                    return statusDelta;
                }

                return left.studentName.localeCompare(right.studentName, 'vi', { sensitivity: 'base' });
            });
    }, [assignedStudents, homework, latestSubmissionByStudent]);

    const summary = useMemo(() => {
        const eligibleRows = rows.filter((row) => !row.isExempted);
        const submittedRows = eligibleRows.filter((row) => row.status === 'submitted' || row.status === 'graded');
        const scoredRows = rows.filter((row) => row.score !== null);
        const inProgressCount = eligibleRows.filter((row) => row.status === 'in_progress').length;
        const notStartedCount = eligibleRows.filter((row) => row.status === 'not_started').length;
        const exemptedCount = rows.filter((row) => row.isExempted).length;
        const totalAssigned = eligibleRows.length || homework?.stats.totalAssigned || 0;
        const onTimeCount = submittedRows.filter((row) => !row.isLate).length;
        const lateCount = submittedRows.filter((row) => row.isLate).length;
        const completionRate = totalAssigned > 0
            ? Math.round((submittedRows.length / totalAssigned) * 100)
            : 0;
        const averageScore = scoredRows.length > 0
            ? Math.round(scoredRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / scoredRows.length)
            : typeof homework?.stats.averageScore === 'number'
                ? Math.round(homework.stats.averageScore)
                : null;
        const needsAttentionCount = rows.filter((row) => {
            if (row.isExempted) {
                return false;
            }

            if (homework?.status === 'past_due') {
                return row.status === 'not_started' || row.status === 'in_progress';
            }

            return row.status === 'not_started';
        }).length;

        return {
            totalAssigned,
            submittedCount: submittedRows.length,
            inProgressCount,
            notStartedCount,
            exemptedCount,
            completionRate,
            averageScore,
            onTimeCount,
            lateCount,
            needsAttentionCount,
        };
    }, [homework, rows]);

    const scoreDistribution = useMemo(
        () => rows.flatMap((row) => (row.score !== null ? [row.score] : [])),
        [rows]
    );

    const alerts = useMemo<HomeworkAlertItem[]>(() => {
        if (!homework) {
            return [];
        }

        const nextAlerts: HomeworkAlertItem[] = [];
        const now = Date.now();
        const availableFrom = homework.scheduling.availableFrom;
        const dueDate = homework.scheduling.dueDate;

        if (homework.status === 'scheduled' && availableFrom && availableFrom > now && availableFrom - now <= DAY_IN_MS) {
            nextAlerts.push({
                id: 'goes-live',
                tone: 'info',
                title: 'Goes live soon',
                message: `This homework becomes available in ${formatRelativeTime(availableFrom)}.`,
            });
        }

        if (homework.status === 'active' && dueDate > now && dueDate - now <= DAY_IN_MS) {
            nextAlerts.push({
                id: 'deadline',
                tone: 'warning',
                title: 'Deadline approaching',
                message: `The due date is in ${formatRelativeTime(dueDate)}. ${summary.notStartedCount} students have not started yet.`,
            });
        }

        if (homework.status === 'past_due') {
            nextAlerts.push({
                id: 'past-due',
                tone: 'danger',
                title: 'Homework is past due',
                message: `${summary.notStartedCount + summary.inProgressCount} students still need follow-up after the deadline.`,
            });
        }

        if (summary.submittedCount === summary.totalAssigned && summary.totalAssigned > 0) {
            nextAlerts.push({
                id: 'complete',
                tone: 'success',
                title: 'All assigned students have submitted',
                message: 'You can review late submissions, averages, and individual results from the table below.',
            });
        }

        if (homework.target.type === 'class' && rosterError) {
            nextAlerts.push({
                id: 'roster-error',
                tone: 'warning',
                title: 'Class roster unavailable',
                message: 'Could not load the class roster. Submission rows still show submitted students, but not-started students may be missing.',
            });
        }

        return nextAlerts;
    }, [homework, rosterError, summary]);

    const handleResetConfirm = useCallback(async () => {
        if (!homework || !homeworkId || !resetTarget) {
            return;
        }

        setIsResetting(true);
        setResetMessage(null);

        try {
            const result = await resetStudentHomework(
                homeworkId,
                resetTarget.studentId,
                homework.title || homework.materialTitle
            );

            setResetMessage(
                `Reset complete: ${result.submissionsDeleted} submission(s) and ${result.resultsDeleted} result(s) removed.`
            );
            await refetch();
            setTimeout(() => {
                setResetTarget(null);
                setResetMessage(null);
            }, 1200);
        } catch (resetError) {
            setResetMessage(resetError instanceof Error ? resetError.message : 'Failed to reset homework');
        } finally {
            setIsResetting(false);
        }
    }, [homework, homeworkId, refetch, resetTarget]);

    // PRD-0034 Task 11.2: Extend deadline handler
    const handleExtendDeadlineConfirm = useCallback(async (newDeadline: number) => {
        if (!homework || !homeworkId || !extendTarget) return;

        try {
            await updateStudentOverride(homeworkId, extendTarget.studentId, { dueDate: newDeadline });
            toast.success(`Deadline extended for ${extendTarget.studentName}`);
            setExtendTarget(null);
            await refetch();
        } catch (err) {
            console.error('[ExtendDeadline] Failed:', err);
            toast.error('Failed to extend deadline');
        }
    }, [extendTarget, homework, homeworkId, refetch]);

    // PRD-0034 Task 11.3: Exempt student handler
    const handleExemptConfirm = useCallback(async (reason: string) => {
        if (!homework || !homeworkId || !exemptTarget) return;

        try {
            const isCurrentlyExempted = exemptTarget.isExempted;
            await updateStudentOverride(homeworkId, exemptTarget.studentId, {
                exempted: !isCurrentlyExempted,
                exemptReason: isCurrentlyExempted ? '' : reason,
            });
            toast.success(
                isCurrentlyExempted
                    ? `Exemption removed for ${exemptTarget.studentName}`
                    : `${exemptTarget.studentName} has been exempted`
            );
            setExemptTarget(null);
            await refetch();
        } catch (err) {
            console.error('[ExemptStudent] Failed:', err);
            toast.error('Failed to update exemption');
        }
    }, [exemptTarget, homework, homeworkId, refetch]);

    // PRD-0034 Task 11.4: Save note handler
    const handleSaveNote = useCallback(async (studentId: string, note: string) => {
        if (!homeworkId) return;

        try {
            await updateStudentOverride(homeworkId, studentId, { notes: note });
            toast.success('Note saved');
            await refetch();
        } catch (err) {
            console.error('[SaveNote] Failed:', err);
            toast.error('Failed to save note');
        }
    }, [homeworkId, refetch]);

    // PRD-0034 Task 11.5: Send reminder handler
    const handleSendReminder = useCallback(async (row: HomeworkSubmissionTableRow) => {
        if (!homework || !homeworkId) return;

        // Double-check disable conditions (already enforced by UI, but safety)
        const hasSubmitted = row.status === 'submitted' || row.status === 'graded';
        if (hasSubmitted) return;
        if ((row.reminderCount ?? 0) >= 3) return;
        if (row.lastRemindedAt && Date.now() - row.lastRemindedAt < 24 * 60 * 60 * 1000) return;

        try {
            await updateStudentOverride(homeworkId, row.studentId, {
                reminderCount: (row.reminderCount ?? 0) + 1,
                lastRemindedAt: Date.now(),
            });
            // PRD-0034 Task 16.0: Send actual notification to student
            await sendHomeworkReminderNotification(
                row.studentId,
                homeworkId,
                homework.title || homework.materialTitle,
                profile?.displayName ?? undefined,
            );
            toast.success(`Reminder sent to ${row.studentName}`);
            await refetch();
        } catch (err) {
            console.error('[SendReminder] Failed:', err);
            toast.error('Failed to send reminder');
        }
    }, [homework, homeworkId, profile, refetch]);

    // PRD-0034 Task 16.3: Remind All bulk action
    const [remindAllLoading, setRemindAllLoading] = useState(false);
    const handleRemindAll = useCallback(async () => {
        if (!homework || !homeworkId) return;

        // Filter eligible students: not submitted, < 3 reminders, not in 24h cooldown, not exempted
        const eligible = rows.filter((row) => {
            if (row.isExempted) return false;
            if (row.status === 'submitted' || row.status === 'graded') return false;
            if ((row.reminderCount ?? 0) >= 3) return false;
            if (row.lastRemindedAt && Date.now() - row.lastRemindedAt < DAY_IN_MS) return false;
            return true;
        });

        const skippedCount = rows.length - eligible.length;
        if (eligible.length === 0) {
            toast.info(`No students eligible for reminders. ${skippedCount} skipped (already submitted, limit reached, or cooldown).`);
            return;
        }

        setRemindAllLoading(true);
        let sentCount = 0;
        let failCount = 0;

        try {
            const promises = eligible.map(async (row) => {
                try {
                    await updateStudentOverride(homeworkId, row.studentId, {
                        reminderCount: (row.reminderCount ?? 0) + 1,
                        lastRemindedAt: Date.now(),
                    });
                    // Non-blocking notification
                    sendHomeworkReminderNotification(
                        row.studentId,
                        homeworkId,
                        homework.title || homework.materialTitle,
                        profile?.displayName ?? undefined,
                    ).catch((err) => console.warn('[RemindAll] Notification failed for', row.studentId, err));
                    sentCount++;
                } catch (err) {
                    console.error('[RemindAll] Failed for', row.studentId, err);
                    failCount++;
                }
            });
            await Promise.all(promises);

            const parts = [`Reminders sent to ${sentCount} student${sentCount !== 1 ? 's' : ''}.`];
            if (skippedCount > 0) parts.push(`${skippedCount} skipped (already submitted, limit reached, or cooldown).`);
            if (failCount > 0) parts.push(`${failCount} failed.`);
            toast.success(parts.join(' '));
            await refetch();
        } catch (err) {
            console.error('[RemindAll] Unexpected error:', err);
            toast.error('Failed to send bulk reminders');
        } finally {
            setRemindAllLoading(false);
        }
    }, [homework, homeworkId, rows, refetch, profile]);

    // PRD-0034 Task 11.0: Student action callbacks for the submission table
    const studentActions = useMemo(() => ({
        onExtendDeadline: (row: HomeworkSubmissionTableRow) => setExtendTarget(row),
        onExempt: (row: HomeworkSubmissionTableRow) => setExemptTarget(row),
        onAddNote: (row: HomeworkSubmissionTableRow) => setNoteTarget(row),
        onSendReminder: handleSendReminder,
    }), [handleSendReminder]);

    const handleLogout = useCallback(async () => {
        try {
            await logout();
            navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
        } catch (logoutError) {
            console.error('Logout error:', logoutError);
        }
    }, [logout, navigateTo]);

    const pageLoading = loading || (homework?.target.type === 'class' && rosterLoading);

    if (pageLoading) {
        return (
            <div className="teacher-homework-detail-page">
                <TeacherHeader
                    pageTitle="Homework Detail"
                    userId={user?.uid}
                    userRole={profile?.role}
                    userDisplayName={profile?.displayName || user?.displayName || user?.email}
                    userEmail={profile?.email || user?.email}
                    userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                    onLogout={handleLogout}
                />
                <div className="teacher-homework-detail-content">
                    <Card hover={false}>
                        <CardBody>
                            <div className="teacher-homework-detail-loader">
                                <VanillaLoader size="xl" />
                                <span>Loading homework detail...</span>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            </div>
        );
    }

    if (!homework) {
        return (
            <div className="teacher-homework-detail-page">
                <TeacherHeader
                    pageTitle="Homework Detail"
                    userId={user?.uid}
                    userRole={profile?.role}
                    userDisplayName={profile?.displayName || user?.displayName || user?.email}
                    userEmail={profile?.email || user?.email}
                    userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                    onLogout={handleLogout}
                />
                <div className="teacher-homework-detail-content">
                    <Card hover={false}>
                        <CardBody>
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>
                                    Homework not found
                                </div>
                                <div style={{ color: '#64748b' }}>
                                    {error || 'This assignment may have been archived or deleted.'}
                                </div>
                                <div>
                                    <Button
                                        variant="outline"
                                        onClick={() => navigateTo('TEACHER_HOMEWORK', {}, { reason: 'teacher_homework_detail_missing_back' })}
                                    >
                                        Back to homework list
                                    </Button>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="teacher-homework-detail-page">
            <TeacherHeader
                pageTitle="Homework Detail"
                userId={user?.uid}
                userRole={profile?.role}
                userDisplayName={profile?.displayName || user?.displayName || user?.email}
                userEmail={profile?.email || user?.email}
                userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                onLogout={handleLogout}
            />
            <div className="teacher-homework-detail-content">
            <HomeworkBreadcrumb
                items={[
                    {
                        label: 'Homework',
                        onClick: () => navigateTo('TEACHER_HOMEWORK', {}, { reason: 'teacher_homework_detail_breadcrumb' }),
                    },
                    {
                        label: homework.title || homework.materialTitle,
                    },
                    {
                        label: 'Details',
                    },
                ]}
            />

            <Card hover={false}>
                <CardHeader>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            flexWrap: 'wrap',
                            alignItems: 'flex-start',
                        }}
                    >
                        <div style={{ display: 'grid', gap: '0.6rem', minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <h1 style={{ margin: 0, fontSize: '1.9rem', color: '#0f172a' }}>
                                    {homework.title || homework.materialTitle}
                                </h1>
                                <HomeworkStatusBadge status={homework.status} />
                            </div>
                            <div style={{ color: '#475569', fontSize: '0.95rem' }}>
                                Target: {
                                    homework.target.type === 'class'
                                        ? homework.target.className || homework.target.classId
                                        : homework.target.type === 'students'
                                            ? `${homework.target.studentIds.length} students`
                                            : homework.target.type === 'group'
                                                ? homework.target.groupName
                                                : homework.target.courseName || homework.target.courseId
                                }
                            </div>
                            {homework.description ? (
                                <div style={{ color: '#64748b', lineHeight: 1.6, maxWidth: '760px' }}>
                                    {homework.description}
                                </div>
                            ) : null}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <Button
                                variant="outline"
                                onClick={() => navigateTo('TEACHER_HOMEWORK', {}, { reason: 'teacher_homework_detail_back' })}
                            >
                                Back to List
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => refetch()}
                            >
                                Refresh
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardBody>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '0.9rem',
                        }}
                    >
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Available</div>
                            <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                {formatDateTime(homework.scheduling.availableFrom || homework.createdAt)}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Due</div>
                            <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                {formatDateTime(homework.scheduling.dueDate)}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Attempts</div>
                            <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                {homework.config.maxAttempts ?? 'Unlimited'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Timer</div>
                            <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                {homework.config.timerMinutes ? `${homework.config.timerMinutes} minutes` : 'No time limit'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Feedback</div>
                            <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                {formatFeedbackTimingLabel(homework.config.feedbackTiming)}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Late submissions</div>
                            <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                {homework.config.lateSubmissionAllowed ? 'Allowed' : 'Locked'}
                            </div>
                        </div>
                    </div>

                    {(homework.tags ?? []).length > 0 ? (
                        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {(homework.tags ?? []).map((tag) => (
                                <span
                                    key={tag}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '0.34rem 0.7rem',
                                        borderRadius: '999px',
                                        background: 'rgba(99,102,241,0.12)',
                                        color: '#4338ca',
                                        fontSize: '0.82rem',
                                        fontWeight: 700,
                                    }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </CardBody>
            </Card>

            <HomeworkAlertBanner alerts={alerts} />

            {error ? (
                <div
                    style={{
                        borderRadius: '1rem',
                        border: '1px solid rgba(239,68,68,0.22)',
                        background: 'rgba(254,226,226,0.65)',
                        color: '#b91c1c',
                        padding: '0.9rem 1rem',
                    }}
                >
                    {error}
                </div>
            ) : null}

            <HomeworkSummaryStats
                totalAssigned={summary.totalAssigned}
                submittedCount={summary.submittedCount}
                inProgressCount={summary.inProgressCount}
                notStartedCount={summary.notStartedCount}
                completionRate={summary.completionRate}
                averageScore={summary.averageScore}
                onTimeCount={summary.onTimeCount}
                lateCount={summary.lateCount}
                needsAttentionCount={summary.needsAttentionCount}
            />

            {/* PRD-0034 Task 16.3: Remind All bulk action */}
            {homework && (homework.status === 'active' || homework.status === 'past_due') && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                    <Button
                        variant="glass"
                        onClick={handleRemindAll}
                        disabled={remindAllLoading}
                        style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                        {remindAllLoading ? '⏳ Sending…' : '📢 Remind All'}
                    </Button>
                </div>
            )}

            <Card hover={false}>
                <CardHeader>
                    <div style={{ display: 'grid', gap: '0.3rem' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Score distribution</div>
                        <div style={{ color: '#64748b', fontSize: '0.92rem' }}>
                            Distribution of scored submissions across 20-point buckets.
                        </div>
                    </div>
                </CardHeader>
                <CardBody>
                    <HomeworkScoreDistribution scores={scoreDistribution} />
                </CardBody>
            </Card>

            {homework.materialType === 'thcs-test' && homework.thcsConfig ? (
                <Card hover={false}>
                    <CardHeader>
                        <button
                            type="button"
                            onClick={() => setShowThcsConfig((current) => !current)}
                            style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                textAlign: 'left',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '1rem',
                                cursor: 'pointer',
                            }}
                        >
                            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                                ⚙️ Test Configuration
                            </span>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>
                                {showThcsConfig ? 'Hide' : 'Show'}
                            </span>
                        </button>
                    </CardHeader>
                    {showThcsConfig ? (
                        <CardBody>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                    gap: '0.9rem',
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Timer mode</div>
                                    <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                        {homework.thcsConfig.timerModeOverride || 'default'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Late policy</div>
                                    <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                        {homework.thcsConfig.lateSubmissionPolicy || 'default'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Penalty</div>
                                    <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                        {homework.thcsConfig.penaltyPercent ? `${homework.thcsConfig.penaltyPercent}%` : 'None'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Feedback</div>
                                    <div style={{ marginTop: '0.25rem', color: '#0f172a', fontWeight: 600 }}>
                                        {homework.thcsConfig.feedbackTiming || 'default'}
                                    </div>
                                </div>
                            </div>
                        </CardBody>
                    ) : null}
                </Card>
            ) : null}

            <Card hover={false}>
                <CardHeader>
                    <div style={{ display: 'grid', gap: '0.3rem' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Student submissions</div>
                        <div style={{ color: '#64748b', fontSize: '0.92rem' }}>
                            All currently assigned students are shown below, including students who have not started yet.
                        </div>
                    </div>
                </CardHeader>
                <CardBody>
                    <HomeworkSubmissionTable
                        rows={rows}
                        loading={pageLoading}
                        resettingStudentId={isResetting ? resetTarget?.studentId ?? null : null}
                        onViewResult={setSelectedResultId}
                        onResetStudent={setResetTarget}
                        onStudentClick={(row) =>
                            navigateTo(
                                'TEACHER_HOMEWORK_STUDENT',
                                { studentId: row.studentId },
                                { reason: 'teacher_homework_student_profile' }
                            )
                        }
                        studentActions={studentActions}
                        // PRD-0036: Integrity click handler
                        onIntegrityClick={(report, studentName) => {
                            reportingService.trackAction('homework', 'viewIntegrityDetails', {
                                homeworkId: homework?.id,
                                studentName,
                                violationCount: report.violationCount,
                            });
                            setSelectedIntegrity({ report, studentName });
                        }}
                    />
                </CardBody>
            </Card>

            <ResultDetailModal
                opened={!!selectedResultId}
                onClose={() => setSelectedResultId(null)}
                resultId={selectedResultId || ''}
            />

            {resetTarget ? (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        zIndex: 50,
                    }}
                    onClick={() => {
                        if (!isResetting) {
                            setResetTarget(null);
                            setResetMessage(null);
                        }
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: '520px',
                            borderRadius: '1.25rem',
                            background: '#ffffff',
                            boxShadow: '0 24px 48px rgba(15,23,42,0.18)',
                            padding: '1.25rem',
                            display: 'grid',
                            gap: '1rem',
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                            Reset student homework
                        </div>
                        <div style={{ color: '#475569', lineHeight: 1.6 }}>
                            Reset <strong>{resetTarget.studentName}</strong>'s homework for{' '}
                            <strong>{homework.title || homework.materialTitle}</strong>? This removes all attempts and linked results.
                        </div>
                        {resetMessage ? (
                            <div
                                style={{
                                    borderRadius: '0.9rem',
                                    padding: '0.8rem 0.9rem',
                                    background: 'rgba(241,245,249,0.9)',
                                    color: '#334155',
                                }}
                            >
                                {resetMessage}
                            </div>
                        ) : null}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <Button
                                variant="outline"
                                disabled={isResetting}
                                onClick={() => {
                                    setResetTarget(null);
                                    setResetMessage(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="warning"
                                loading={isResetting}
                                onClick={handleResetConfirm}
                            >
                                Reset Homework
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* PRD-0034 Task 11.2: Extend student deadline modal */}
            <ExtendStudentDeadlineModal
                isOpen={!!extendTarget}
                studentName={extendTarget?.studentName ?? ''}
                currentDeadline={extendTarget?.extendedDueDate ?? homework.scheduling.dueDate}
                onClose={() => setExtendTarget(null)}
                onConfirm={handleExtendDeadlineConfirm}
            />

            {/* PRD-0034 Task 11.3: Exempt student modal */}
            <ExemptStudentModal
                isOpen={!!exemptTarget}
                studentName={exemptTarget?.studentName ?? ''}
                onClose={() => setExemptTarget(null)}
                onConfirm={handleExemptConfirm}
            />

            {/* PRD-0034 Task 11.4: Student note modal */}
            {noteTarget ? (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        zIndex: 50,
                        animation: 'fadeIn 0.2s ease-out',
                    }}
                    onClick={() => setNoteTarget(null)}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: '440px',
                            borderRadius: '1.25rem',
                            background: '#ffffff',
                            boxShadow: '0 24px 48px rgba(15,23,42,0.18)',
                            padding: '1.5rem',
                            display: 'grid',
                            gap: '1.1rem',
                            animation: 'scaleIn 0.2s ease-out',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'grid', gap: '0.3rem' }}>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                                📝 Note for {noteTarget.studentName}
                            </div>
                        </div>
                        <NoteTextArea
                            initialValue={noteTarget.note ?? ''}
                            onSave={(note) => {
                                handleSaveNote(noteTarget.studentId, note);
                                setNoteTarget(null);
                            }}
                            onCancel={() => setNoteTarget(null)}
                        />
                    </div>
                </div>
            ) : null}
            {/* PRD-0036: Integrity Detail Panel */}
            {selectedIntegrity && (
                <IntegrityDetailPanel
                    report={selectedIntegrity.report}
                    studentName={selectedIntegrity.studentName}
                    isOpen={true}
                    onClose={() => setSelectedIntegrity(null)}
                />
            )}
            </div>
        </div>
    );
}

export default TeacherHomeworkDetailPage;
