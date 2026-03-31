import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigation } from '../../hooks/useNavigation';
import { useStudentShellData, type StudentShellData } from '../../hooks/useStudentShellData';
import { reportingService } from '../../services/reportingService';
import { sessionService } from '../../services/sessionService';
import { S } from './studentLayoutStyles';

export type StudentRightRailShellData = Pick<
    StudentShellData,
    'classLiveSessions' | 'enrolledClasses' | 'sortedAssignments'
>;

interface StudentRightRailProps {
    shellData: StudentRightRailShellData;
    supplementalContent?: React.ReactNode;
}

const localStyles = {
    sectionStack: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 24,
    },
    liveCard: {
        background: '#ffffff',
        borderRadius: 12,
        padding: '12px 14px',
        border: '1px solid #e5e7eb',
    },
    liveBadge: {
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        padding: '2px 8px',
        borderRadius: 999,
        letterSpacing: '0.04em',
    },
    cardTitle: {
        fontWeight: 600,
        fontSize: '0.875rem',
        color: '#111827',
        margin: '0 0 2px',
    },
    cardSubtle: {
        fontSize: '0.75rem',
        color: '#6b7280',
        margin: 0,
    },
    cardSubtleDanger: {
        fontSize: '0.75rem',
        color: '#ef4444',
        margin: 0,
        fontWeight: 500,
    },
    classRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    classIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '1rem',
        flexShrink: 0,
    },
    joinButton: {
        width: '100%',
        padding: '7px 0',
        borderRadius: 999,
        border: 'none',
        background: '#ef4444',
        color: '#ffffff',
        fontWeight: 700,
        fontSize: '0.8rem',
        cursor: 'pointer',
        transition: 'background 0.15s',
    },
    emptyState: {
        textAlign: 'center' as const,
        color: '#6b7280',
        padding: '8px 0',
        fontSize: '0.875rem',
        margin: 0,
    },
};

const CLASS_COLORS = [
    { bg: '#e0e7ff', color: '#4338ca' },
    { bg: '#d1fae5', color: '#047857' },
    { bg: '#fef3c7', color: '#b45309' },
    { bg: '#fce7f3', color: '#be185d' },
    { bg: '#e0f2fe', color: '#0369a1' },
];

function getLiveBadgeStyles(mode: string) {
    if (mode === 'test') {
        return { ...localStyles.liveBadge, background: '#d1fae5', color: '#059669' };
    }

    return { ...localStyles.liveBadge, background: '#e0e7ff', color: '#4338ca' };
}

export const StudentRightRail: React.FC<StudentRightRailProps> = ({ shellData, supplementalContent }) => {
    const { user } = useAuth();
    const { navigateTo } = useNavigation('student');
    const { classLiveSessions, enrolledClasses, sortedAssignments } = shellData;

    const handleJoinLiveSession = (sessionCode: string, status: string, classId: string) => {
        if (user) {
            sessionService.setPlayerData(
                user.uid,
                user.displayName || user.email || 'Student',
                sessionCode,
            );
        }

        reportingService.trackAction('liveSessions', 'joinSession', {
            source: 'student_shell_right_rail',
            sessionCode,
            sessionStatus: status,
            classId,
        });

        navigateTo(
            'STUDENT_WAITING',
            { gameSessionId: sessionCode },
            { reason: 'student_shell_right_rail_join' },
        );
    };

    return (
        <div style={S.rightSticky}>
            <div style={localStyles.sectionStack}>
                {classLiveSessions.length > 0 && (
                    <div style={{ ...S.widget, border: '1px solid #fecaca', background: '#fff5f5' }}>
                        <h3 style={{ ...S.widgetTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#ef4444',
                                    boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.2)',
                                    animation: 'livePulse 2s infinite',
                                    display: 'inline-block',
                                    flexShrink: 0,
                                }}
                            />
                            Live Now
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {classLiveSessions.slice(0, 5).map((session) => (
                                <div key={session.code} style={localStyles.liveCard}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={getLiveBadgeStyles(session.mode)}>
                                            {session.mode === 'test' ? 'Test' : 'Quiz'}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: '#6b7280', fontFamily: 'monospace' }}>
                                            {session.code}
                                        </span>
                                    </div>
                                    <p style={localStyles.cardTitle}>{session.title}</p>
                                    <p style={{ ...localStyles.cardSubtle, marginBottom: 10 }}>
                                        {session.className}
                                        {session.status === 'in-progress' ? ' · In Progress' : ' · Waiting'}
                                    </p>
                                    <button
                                        type="button"
                                        style={localStyles.joinButton}
                                        onMouseEnter={(event) => {
                                            event.currentTarget.style.background = '#dc2626';
                                        }}
                                        onMouseLeave={(event) => {
                                            event.currentTarget.style.background = '#ef4444';
                                        }}
                                        onClick={() => handleJoinLiveSession(session.code, session.status, session.classId)}
                                    >
                                        Join Now →
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={S.widget}>
                    <h3 style={S.widgetTitle}>Up Next</h3>
                    {sortedAssignments.length === 0 ? (
                        <p style={localStyles.emptyState}>No upcoming deadlines 🎉</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {sortedAssignments.slice(0, 5).map((item) => {
                                const assignment = item.homework;
                                const isOverdue = item.status === 'overdue';
                                const dueDateLabel = assignment.scheduling?.dueDate
                                    ? new Date(assignment.scheduling.dueDate).toLocaleDateString()
                                    : '';
                                const classNameLabel = assignment.target?.className
                                    ? ` • ${assignment.target.className}`
                                    : '';

                                return (
                                    <div
                                        key={assignment.id}
                                        style={{
                                            borderLeft: assignment.materialType === 'thcs-test' ? '3px solid #7c3aed' : 'none',
                                            paddingLeft: assignment.materialType === 'thcs-test' ? 8 : 0,
                                        }}
                                    >
                                        <p style={localStyles.cardTitle}>{assignment.title || assignment.materialTitle || 'Untitled'}</p>
                                        <p style={isOverdue ? localStyles.cardSubtleDanger : localStyles.cardSubtle}>
                                            {isOverdue ? `Overdue${classNameLabel}` : `${dueDateLabel}${classNameLabel}`}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div style={S.widget}>
                    <h3 style={S.widgetTitle}>My Classes</h3>
                    {enrolledClasses.length === 0 ? (
                        <p style={localStyles.emptyState}>No classes joined yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {enrolledClasses.slice(0, 4).map((cls, index) => {
                                const colors = CLASS_COLORS[index % CLASS_COLORS.length];

                                return (
                                    <div key={cls.id} style={localStyles.classRow}>
                                        <div style={{ ...localStyles.classIcon, background: colors.bg, color: colors.color }}>
                                            {cls.classCode?.slice(0, 2) || '??'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={localStyles.cardTitle}>{cls.classCode || cls.name}</p>
                                            <p style={localStyles.cardSubtle}>
                                                {cls.studentCount || 0} students · {cls.activeAssignments || 0} active
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {supplementalContent}
            </div>
        </div>
    );
};

interface ConnectedStudentRightRailProps {
    supplementalContent?: React.ReactNode;
}

export const ConnectedStudentRightRail: React.FC<ConnectedStudentRightRailProps> = ({ supplementalContent }) => {
    const { classLiveSessions, enrolledClasses, sortedAssignments } = useStudentShellData();

    return (
        <StudentRightRail
            shellData={{ classLiveSessions, enrolledClasses, sortedAssignments }}
            supplementalContent={supplementalContent}
        />
    );
};
