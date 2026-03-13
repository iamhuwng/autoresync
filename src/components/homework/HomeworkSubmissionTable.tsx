import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Button } from '../modern';
import StudentActionMenu from './StudentActionMenu';
import './HomeworkMobilePolish.css';

/**
 * Normalize a string for accent-insensitive comparison.
 * Strips Vietnamese diacritics so "Nguyễn" matches "nguyen".
 */
function normalizeForSearch(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}

export interface HomeworkSubmissionTableRow {
    studentId: string;
    studentName: string;
    studentEmail?: string;
    status: 'not_started' | 'in_progress' | 'submitted' | 'graded';
    score: number | null;
    attemptNumber: number;
    maxAttempts: number | null;
    timeSpent?: number;
    submittedAt?: number;
    isLate: boolean;
    resultId?: string;
    isExempted?: boolean;
    reminderCount?: number;
    lastRemindedAt?: number | null;
    extendedDueDate?: number | null;
    note?: string;
}

interface StudentActionCallbacks {
    onExtendDeadline: (row: HomeworkSubmissionTableRow) => void;
    onExempt: (row: HomeworkSubmissionTableRow) => void;
    onAddNote: (row: HomeworkSubmissionTableRow) => void;
    onSendReminder: (row: HomeworkSubmissionTableRow) => void;
}

interface HomeworkSubmissionTableProps {
    rows: HomeworkSubmissionTableRow[];
    loading?: boolean;
    resettingStudentId?: string | null;
    onViewResult: (resultId: string) => void;
    onResetStudent: (row: HomeworkSubmissionTableRow) => void;
    onStudentClick?: (row: HomeworkSubmissionTableRow) => void;
    studentActions?: StudentActionCallbacks;
}

const statusStyles: Record<HomeworkSubmissionTableRow['status'], CSSProperties> = {
    not_started: {
        backgroundColor: 'rgba(148,163,184,0.15)',
        color: '#475569',
    },
    in_progress: {
        backgroundColor: 'rgba(59,130,246,0.12)',
        color: '#1d4ed8',
    },
    submitted: {
        backgroundColor: 'rgba(16,185,129,0.12)',
        color: '#047857',
    },
    graded: {
        backgroundColor: 'rgba(139,92,246,0.14)',
        color: '#6d28d9',
    },
};

function formatDateTime(value?: number): string {
    if (!value) {
        return '—';
    }

    const diff = Date.now() - value;
    const seconds = Math.max(Math.floor(diff / 1000), 0);

    if (seconds < 60) {
        return `${seconds}s ago`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function formatDuration(value?: number): string {
    if (!value || value <= 0) {
        return '—';
    }

    if (value < 60) {
        return `${value}s`;
    }

    const totalMinutes = Math.floor(value / 60);
    const remainingSeconds = value % 60;

    if (value < 3600) {
        return `${totalMinutes}m ${remainingSeconds}s`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
}

function formatAttemptLabel(attemptNumber: number, maxAttempts: number | null): string {
    return `${attemptNumber} of ${maxAttempts ?? '∞'}`;
}

function getStatusLabel(row: HomeworkSubmissionTableRow): string {
    if (row.isExempted && (row.status === 'submitted' || row.status === 'graded')) {
        return 'Submitted (Exempted)';
    }

    if (row.isExempted) {
        return 'Exempted';
    }

    switch (row.status) {
        case 'not_started':
            return 'Not started';
        case 'in_progress':
            return 'In progress';
        case 'submitted':
            return 'Submitted';
        case 'graded':
            return 'Graded';
        default:
            return row.status;
    }
}

function HomeworkSubmissionTable({
    rows,
    loading = false,
    resettingStudentId,
    onViewResult,
    onResetStudent,
    onStudentClick,
    studentActions,
}: HomeworkSubmissionTableProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredRows = useMemo(() => {
        if (!searchTerm.trim()) return rows;
        const needle = normalizeForSearch(searchTerm);
        return rows.filter((row) => {
            const nameMatch = normalizeForSearch(row.studentName).includes(needle);
            const emailMatch = row.studentEmail
                ? normalizeForSearch(row.studentEmail).includes(needle)
                : false;
            return nameMatch || emailMatch;
        });
    }, [rows, searchTerm]);

    // PRD-0034 Task 11.8: Separate exempted students into their own group
    const { regularRows, exemptedRows } = useMemo(() => {
        const regular: HomeworkSubmissionTableRow[] = [];
        const exempted: HomeworkSubmissionTableRow[] = [];
        for (const row of filteredRows) {
            if (row.isExempted) {
                exempted.push(row);
            } else {
                regular.push(row);
            }
        }
        return { regularRows: regular, exemptedRows: exempted };
    }, [filteredRows]);

    if (loading) {
        return (
            <div
                style={{
                    padding: '2.5rem 1rem',
                    textAlign: 'center',
                    color: '#64748b',
                    border: '1px solid rgba(148,163,184,0.16)',
                    borderRadius: '1rem',
                    background: '#ffffff',
                }}
            >
                Loading submissions...
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div
                style={{
                    padding: '2.5rem 1rem',
                    textAlign: 'center',
                    color: '#64748b',
                    border: '1px solid rgba(148,163,184,0.16)',
                    borderRadius: '1rem',
                    background: '#ffffff',
                }}
            >
                No assigned students found for this homework.
            </div>
        );
    }

    const isFiltering = searchTerm.trim().length > 0;

    // Mobile card renderer for a single row (Task 17.1)
    const renderMobileCard = (row: HomeworkSubmissionTableRow, isExemptedGroup = false) => (
        <div
            key={row.studentId}
            className={`hw-mobile-student-card${isExemptedGroup ? ' hw-mobile-student-card--exempted' : ''}`}
        >
            <div className="hw-mobile-card-header">
                <div>
                    {onStudentClick ? (
                        <button type="button" onClick={() => onStudentClick(row)} className="hw-mobile-card-name--link">
                            {row.studentName}
                        </button>
                    ) : (
                        <span className="hw-mobile-card-name">{row.studentName}</span>
                    )}
                </div>
                {studentActions ? (
                    <StudentActionMenu
                        studentName={row.studentName}
                        hasSubmitted={row.status === 'submitted' || row.status === 'graded'}
                        isExempted={Boolean(row.isExempted)}
                        reminderCount={row.reminderCount ?? 0}
                        lastRemindedAt={row.lastRemindedAt ?? null}
                        onExtendDeadline={() => studentActions.onExtendDeadline(row)}
                        onExempt={() => studentActions.onExempt(row)}
                        onAddNote={() => studentActions.onAddNote(row)}
                        onSendReminder={() => studentActions.onSendReminder(row)}
                    />
                ) : null}
            </div>
            <div className="hw-mobile-card-meta">
                <span className="hw-mobile-card-status" style={statusStyles[row.status]}>
                    {getStatusLabel(row)}
                </span>
                <span className="hw-mobile-card-score">
                    {row.score !== null ? `${row.score}%` : '—'}
                </span>
                {(row.status === 'submitted' || row.status === 'graded') && !row.isExempted ? (
                    <span className={`hw-mobile-card-late ${row.isLate ? 'hw-mobile-card-late--late' : 'hw-mobile-card-late--on-time'}`}>
                        {row.isLate ? 'Late' : 'On time'}
                    </span>
                ) : null}
            </div>
            {!isExemptedGroup && (
                <div className="hw-mobile-card-actions">
                    <Button variant="outline" size="sm" disabled={!row.resultId} onClick={() => row.resultId && onViewResult(row.resultId)}>View</Button>
                    <Button variant="warning" size="sm" disabled={!row.attemptNumber || resettingStudentId === row.studentId} loading={resettingStudentId === row.studentId} onClick={() => onResetStudent(row)}>Reset</Button>
                </div>
            )}
        </div>
    );

    return (
        <div
            className="hw-submission-wrapper"
            style={{
                borderRadius: '1rem',
                border: '1px solid rgba(148,163,184,0.16)',
                background: '#ffffff',
            }}
        >
            {/* PRD-0034 Task 4.7: In-table search bar */}
            <div
                style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid rgba(148,163,184,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: '#fafbfc',
                }}
            >
                <div
                    style={{
                        position: 'relative',
                        flex: 1,
                        maxWidth: '360px',
                    }}
                >
                    <span
                        style={{
                            position: 'absolute',
                            left: '0.75rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#94a3b8',
                            fontSize: '0.9rem',
                            pointerEvents: 'none',
                        }}
                    >
                        🔍
                    </span>
                    <input
                        type="text"
                        placeholder="Search students..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.5rem 2rem 0.5rem 2.2rem',
                            border: '1px solid rgba(148,163,184,0.25)',
                            borderRadius: '0.5rem',
                            fontSize: '0.88rem',
                            color: '#0f172a',
                            background: '#ffffff',
                            outline: 'none',
                            transition: 'border-color 0.15s ease',
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#3b82f6';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.25)';
                        }}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            style={{
                                position: 'absolute',
                                right: '0.5rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#94a3b8',
                                fontSize: '1rem',
                                padding: '0.15rem',
                                lineHeight: 1,
                            }}
                            title="Clear search"
                        >
                            ✕
                        </button>
                    )}
                </div>
                <span style={{ fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {isFiltering
                        ? `${filteredRows.length} of ${rows.length} students`
                        : `${rows.length} student${rows.length !== 1 ? 's' : ''}`}
                </span>
            </div>

            {/* Desktop table (hidden on mobile via CSS) */}
            <div className="hw-desktop-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
                <thead>
                    <tr style={{ background: '#f8fafc' }}>
                        {['Student', 'Status', 'Score', 'Attempt', 'Time Spent', 'Submitted At', 'Late', ...(studentActions ? [''] : []), 'Actions'].map((label, i) => (
                            <th
                                key={label || `spacer-${i}`}
                                style={{
                                    textAlign: 'left',
                                    padding: '0.95rem 1rem',
                                    color: '#475569',
                                    fontSize: '0.82rem',
                                    letterSpacing: '0.03em',
                                    textTransform: 'uppercase',
                                    borderBottom: '1px solid rgba(148,163,184,0.16)',
                                    ...(label === '' ? { width: '2.5rem' } : {}),
                                }}
                            >
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {filteredRows.length === 0 && isFiltering ? (
                        <tr>
                            <td colSpan={studentActions ? 9 : 8} style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                                No students matching &quot;{searchTerm.trim()}&quot;
                            </td>
                        </tr>
                    ) : (
                    <>
                    {regularRows.map((row) => (
                        <tr
                            key={row.studentId}
                            style={{
                                borderBottom: '1px solid rgba(148,163,184,0.12)',
                                background: '#ffffff',
                            }}
                        >
                            <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top' }}>
                                <div style={{ display: 'grid', gap: '0.2rem' }}>
                                    {onStudentClick ? (
                                        <button
                                            type="button"
                                            onClick={() => onStudentClick(row)}
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                padding: 0,
                                                textAlign: 'left',
                                                fontWeight: 700,
                                                color: '#2563eb',
                                                cursor: 'pointer',
                                                textDecoration: 'underline',
                                            }}
                                        >
                                            {row.studentName}
                                        </button>
                                    ) : (
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.studentName}</span>
                                    )}
                                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                        {row.studentEmail || row.studentId}
                                    </span>
                                    {row.reminderCount ? (
                                        <span style={{ fontSize: '0.8rem', color: '#7c3aed' }}>
                                            {row.reminderCount} reminder{row.reminderCount !== 1 ? 's' : ''}
                                            {row.lastRemindedAt ? ` • last ${formatDateTime(row.lastRemindedAt)}` : ''}
                                        </span>
                                    ) : null}
                                    {/* PRD-0034 Task 11.9: Extended deadline visual indicator */}
                                    {row.extendedDueDate ? (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            fontSize: '0.76rem',
                                            fontWeight: 700,
                                            color: '#7c3aed',
                                            background: 'rgba(139,92,246,0.08)',
                                            padding: '0.18rem 0.5rem',
                                            borderRadius: '999px',
                                            marginTop: '0.15rem',
                                            width: 'fit-content',
                                        }}>
                                            📌 Extended to {new Date(row.extendedDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                    ) : null}
                                </div>
                            </td>
                            <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top' }}>
                                <span
                                    style={{
                                        ...statusStyles[row.status],
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '0.38rem 0.7rem',
                                        borderRadius: '999px',
                                        fontSize: '0.82rem',
                                        fontWeight: 700,
                                    }}
                                >
                                    {getStatusLabel(row)}
                                </span>
                            </td>
                            <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top', fontWeight: 700, color: '#0f172a' }}>
                                {row.score !== null ? `${row.score}%` : '—'}
                            </td>
                            <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top', color: '#334155' }}>
                                {formatAttemptLabel(row.attemptNumber, row.maxAttempts)}
                            </td>
                            <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top', color: '#334155' }}>
                                {formatDuration(row.timeSpent)}
                            </td>
                            <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top', color: '#334155' }}>
                                {formatDateTime(row.submittedAt)}
                            </td>
                            <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top' }}>
                                {row.isExempted || (row.status !== 'submitted' && row.status !== 'graded') ? (
                                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>—</span>
                                ) : (
                                    <span
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            padding: '0.28rem 0.6rem',
                                            borderRadius: '999px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            background: row.isLate ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                                            color: row.isLate ? '#b91c1c' : '#047857',
                                        }}
                                    >
                                        {row.isLate ? 'Late' : 'On time'}
                                    </span>
                                )}
                            </td>
                            {/* PRD-0034 Task 11.1: Per-student action menu */}
                            {studentActions ? (
                                <td style={{ padding: '0.95rem 0.5rem', verticalAlign: 'top' }}>
                                    <StudentActionMenu
                                        studentName={row.studentName}
                                        hasSubmitted={row.status === 'submitted' || row.status === 'graded'}
                                        isExempted={Boolean(row.isExempted)}
                                        reminderCount={row.reminderCount ?? 0}
                                        lastRemindedAt={row.lastRemindedAt ?? null}
                                        onExtendDeadline={() => studentActions.onExtendDeadline(row)}
                                        onExempt={() => studentActions.onExempt(row)}
                                        onAddNote={() => studentActions.onAddNote(row)}
                                        onSendReminder={() => studentActions.onSendReminder(row)}
                                    />
                                </td>
                            ) : null}
                            <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!row.resultId}
                                        onClick={() => row.resultId && onViewResult(row.resultId)}
                                    >
                                        View Result
                                    </Button>
                                    <Button
                                        variant="warning"
                                        size="sm"
                                        disabled={!row.attemptNumber || resettingStudentId === row.studentId}
                                        loading={resettingStudentId === row.studentId}
                                        onClick={() => onResetStudent(row)}
                                    >
                                        Reset Homework
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}

                    {/* PRD-0034 Task 11.8: Exempted students group */}
                    {exemptedRows.length > 0 ? (
                        <>
                            <tr>
                                <td
                                    colSpan={studentActions ? 9 : 8}
                                    style={{
                                        padding: '0.6rem 1rem',
                                        background: 'rgba(148,163,184,0.08)',
                                        borderTop: '2px solid rgba(148,163,184,0.18)',
                                        borderBottom: '1px solid rgba(148,163,184,0.12)',
                                        fontSize: '0.82rem',
                                        fontWeight: 700,
                                        color: '#64748b',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em',
                                    }}
                                >
                                    🎓 Exempted ({exemptedRows.length})
                                </td>
                            </tr>
                            {exemptedRows.map((row) => (
                                <tr
                                    key={row.studentId}
                                    style={{
                                        borderBottom: '1px solid rgba(148,163,184,0.12)',
                                        background: 'rgba(148,163,184,0.04)',
                                    }}
                                >
                                    <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top' }}>
                                        <div style={{ display: 'grid', gap: '0.2rem' }}>
                                            {onStudentClick ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onStudentClick(row)}
                                                    style={{
                                                        border: 'none',
                                                        background: 'transparent',
                                                        padding: 0,
                                                        textAlign: 'left',
                                                        fontWeight: 700,
                                                        color: '#2563eb',
                                                        cursor: 'pointer',
                                                        textDecoration: 'underline',
                                                    }}
                                                >
                                                    {row.studentName}
                                                </button>
                                            ) : (
                                                <span style={{ fontWeight: 700, color: '#64748b' }}>{row.studentName}</span>
                                            )}
                                            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                                                {row.studentEmail || row.studentId}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top' }}>
                                        <span
                                            style={{
                                                ...statusStyles[row.status],
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                padding: '0.38rem 0.7rem',
                                                borderRadius: '999px',
                                                fontSize: '0.82rem',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {getStatusLabel(row)}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top', fontWeight: 700, color: '#64748b' }}>
                                        {row.score !== null ? `${row.score}%` : '—'}
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top', color: '#94a3b8' }}>
                                        {formatAttemptLabel(row.attemptNumber, row.maxAttempts)}
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top', color: '#94a3b8' }}>
                                        {formatDuration(row.timeSpent)}
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top', color: '#94a3b8' }}>
                                        {formatDateTime(row.submittedAt)}
                                    </td>
                                    <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top' }}>
                                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>—</span>
                                    </td>
                                    {studentActions ? (
                                        <td style={{ padding: '0.95rem 0.5rem', verticalAlign: 'top' }}>
                                            {/* Exempted students still get the action menu for un-exempting */}
                                        </td>
                                    ) : null}
                                    <td style={{ padding: '0.95rem 1rem', verticalAlign: 'top' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={!row.resultId}
                                                onClick={() => row.resultId && onViewResult(row.resultId)}
                                            >
                                                View Result
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </>
                    ) : null}
                    </>
                    )}
                </tbody>
            </table>
            </div>

            {/* Mobile cards (shown on mobile via CSS, Task 17.1) */}
            <div className="hw-mobile-cards">
                {filteredRows.length === 0 && isFiltering ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                        No students matching &quot;{searchTerm.trim()}&quot;
                    </div>
                ) : (
                    <>
                        {regularRows.map((row) => renderMobileCard(row))}
                        {exemptedRows.length > 0 && (
                            <>
                                <div style={{
                                    padding: '0.5rem 0.75rem',
                                    background: 'rgba(148,163,184,0.08)',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: '#64748b',
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: '0.03em',
                                }}>
                                    🎓 Exempted ({exemptedRows.length})
                                </div>
                                {exemptedRows.map((row) => renderMobileCard(row, true))}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default HomeworkSubmissionTable;
