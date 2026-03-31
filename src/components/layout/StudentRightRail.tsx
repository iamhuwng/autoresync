import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigation } from '../../hooks/useNavigation';
import type { StudentShellData } from '../../hooks/useStudentShellData';
import { useResolvedStudentShellData } from '../../context/StudentShellDataContext';
import { reportingService } from '../../services/reportingService';
import { sessionService } from '../../services/sessionService';
import { S, studentTokens } from './studentLayoutStyles';

export type StudentRightRailShellData = Pick<
    StudentShellData,
    'classLiveSessions' | 'enrolledClasses' | 'sortedAssignments'
>;

interface StudentRightRailProps {
    shellData: StudentRightRailShellData;
    supplementalContent?: React.ReactNode;
    variant?: 'default' | 'academic-record';
}

const localStyles = {
    sectionStack: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 36,
    },
    section: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 16,
    },
    liveCard: {
        background: studentTokens.bgSurface,
        borderRadius: studentTokens.radiusSoft,
        padding: '14px 14px',
        border: `1px solid ${studentTokens.borderWhisper}`,
        boxShadow: '0 1px 2px rgba(43, 52, 55, 0.04)',
    },
    liveBadge: {
        fontSize: '0.625rem',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        padding: '2px 8px',
        borderRadius: studentTokens.radiusPill,
        letterSpacing: '0.08em',
    },
    cardTitle: {
        fontWeight: 700,
        fontSize: '0.875rem',
        color: studentTokens.textPrimary,
        margin: '0 0 2px',
    },
    cardSubtle: {
        fontSize: '0.75rem',
        color: studentTokens.textMuted,
        margin: 0,
    },
    cardSubtleDanger: {
        fontSize: '0.75rem',
        color: '#9e3f4e',
        margin: 0,
        fontWeight: 600,
    },
    classRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingBottom: 14,
        borderBottom: `1px solid ${studentTokens.borderWhisper}`,
    },
    classIcon: {
        width: 34,
        height: 34,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '0.75rem',
        flexShrink: 0,
    },
    dateRow: {
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
    },
    dateBadge: {
        width: 42,
        height: 42,
        borderRadius: studentTokens.radiusSoft,
        background: studentTokens.bgSurface,
        border: `1px solid ${studentTokens.borderWhisper}`,
        boxShadow: '0 1px 2px rgba(43, 52, 55, 0.04)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    dateMonth: {
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: studentTokens.accent,
        lineHeight: 1,
    },
    dateDay: {
        fontSize: '0.9375rem',
        fontWeight: 800,
        color: studentTokens.textPrimary,
        lineHeight: 1.1,
        marginTop: 2,
    },
    joinButton: {
        width: '100%',
        padding: '9px 0',
        borderRadius: studentTokens.radiusSoft,
        border: `1px solid ${studentTokens.borderSoft}`,
        background: studentTokens.bgSurface,
        color: studentTokens.textPrimary,
        fontWeight: 700,
        fontSize: '0.6875rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
    },
    emptyState: {
        color: studentTokens.textMuted,
        padding: '4px 0',
        fontSize: '0.8125rem',
        margin: 0,
    },
    integrityCard: {
        background: 'rgba(219, 228, 231, 0.34)',
        borderRadius: 10,
        padding: '16px 16px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 10,
    },
    integrityLink: {
        color: studentTokens.accent,
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        textDecoration: 'none',
    },
    footnote: {
        margin: 0,
        fontSize: '0.625rem',
        lineHeight: 1.5,
        color: studentTokens.textDim,
        opacity: 0.72,
    },
};

const CLASS_COLORS = [
    { bg: '#e2dfff', color: '#3f34d6' },
    { bg: '#edf5f9', color: '#4c5458' },
    { bg: '#fef3c7', color: '#b45309' },
    { bg: '#dce4e8', color: '#586064' },
    { bg: '#eaeff1', color: '#2b3437' },
];

function getLiveBadgeStyles(mode: string) {
    if (mode === 'test') {
        return { ...localStyles.liveBadge, background: '#e2dfff', color: '#3f34d6' };
    }

    return { ...localStyles.liveBadge, background: '#edf5f9', color: '#4c5458' };
}

function formatDueDateBadge(dateValue?: number | string) {
    if (!dateValue) return null;

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;

    return {
        month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        day: date.toLocaleDateString('en-US', { day: 'numeric' }),
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
}

export const StudentRightRail: React.FC<StudentRightRailProps> = ({ shellData, supplementalContent, variant = 'default' }) => {
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

    const renderUpcomingDeadlines = () => (
        <section style={localStyles.section}>
            <h3 style={S.widgetTitle}>{variant === 'academic-record' ? 'Upcoming Deadlines' : 'Up Next'}</h3>
            {sortedAssignments.length === 0 ? (
                <p style={localStyles.emptyState}>No upcoming deadlines.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {sortedAssignments.slice(0, 5).map((item) => {
                        const assignment = item.homework;
                        const isOverdue = item.status === 'overdue';
                        const dueBadge = formatDueDateBadge(assignment.scheduling?.dueDate);
                        const dueDateLabel = dueBadge?.label || '';
                        const targetClassName = assignment.target && 'className' in assignment.target
                            ? assignment.target.className
                            : '';
                        const classNameLabel = targetClassName
                            ? ` - ${targetClassName}`
                            : '';

                        return (
                            <div key={assignment.id} style={localStyles.dateRow}>
                                <div style={localStyles.dateBadge}>
                                    <span style={localStyles.dateMonth}>{dueBadge?.month || 'DUE'}</span>
                                    <span style={localStyles.dateDay}>{dueBadge?.day || 'NA'}</span>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <p style={localStyles.cardTitle}>{assignment.title || assignment.materialTitle || 'Untitled'}</p>
                                    <p style={localStyles.cardSubtle}>{assignment.courseName || assignment.materialType || 'Assignment'}</p>
                                    <p style={isOverdue ? localStyles.cardSubtleDanger : localStyles.cardSubtle}>
                                        {isOverdue ? `Overdue${classNameLabel}` : `${dueDateLabel}${classNameLabel}`}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );

    const renderDefaultRail = () => (
        <>
            {classLiveSessions.length > 0 ? (
                <section style={localStyles.section}>
                    <h3 style={S.widgetTitle}>Live Now</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {classLiveSessions.slice(0, 5).map((session) => (
                            <div key={session.code} style={localStyles.liveCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={getLiveBadgeStyles(session.mode)}>
                                        {session.mode === 'test' ? 'Test' : 'Quiz'}
                                    </span>
                                    <span style={{ fontSize: '0.6875rem', color: studentTokens.textMuted, fontFamily: 'monospace' }}>
                                        {session.code}
                                    </span>
                                </div>
                                <p style={localStyles.cardTitle}>{session.title}</p>
                                <p style={{ ...localStyles.cardSubtle, marginBottom: 10 }}>
                                    {session.className}
                                    {session.status === 'in-progress' ? ' - In Progress' : ' - Waiting'}
                                </p>
                                <button
                                    type="button"
                                    style={localStyles.joinButton}
                                    onMouseEnter={(event) => {
                                        event.currentTarget.style.background = studentTokens.bgSurfaceStrong;
                                        event.currentTarget.style.borderColor = studentTokens.outlineSoft;
                                    }}
                                    onMouseLeave={(event) => {
                                        event.currentTarget.style.background = studentTokens.bgSurface;
                                        event.currentTarget.style.borderColor = studentTokens.borderSoft;
                                    }}
                                    onClick={() => handleJoinLiveSession(session.code, session.status, session.classId)}
                                >
                                    Join Session
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {renderUpcomingDeadlines()}

            <section style={localStyles.section}>
                <h3 style={S.widgetTitle}>My Classes</h3>
                {enrolledClasses.length === 0 ? (
                    <p style={localStyles.emptyState}>No classes joined yet.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {enrolledClasses.slice(0, 4).map((cls, index) => {
                            const colors = CLASS_COLORS[index % CLASS_COLORS.length] ?? {
                                bg: studentTokens.bgSurfaceAlt,
                                color: studentTokens.textPrimary,
                            };

                            return (
                                <div key={cls.id} style={localStyles.classRow}>
                                    <div style={{ ...localStyles.classIcon, background: colors.bg, color: colors.color }}>
                                        {cls.classCode?.slice(0, 2) || '??'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={localStyles.cardTitle}>{cls.classCode || cls.name}</p>
                                        <p style={localStyles.cardSubtle}>
                                            {cls.studentCount || 0} students - {cls.activeAssignments || 0} active
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </>
    );

    const renderAcademicRecordRail = () => (
        <>
            <section style={localStyles.section}>
                <h3 style={S.widgetTitle}>Academic Advisor</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ ...localStyles.classIcon, width: 48, height: 48, borderRadius: 999, background: studentTokens.bgSurface, color: studentTokens.accent }}>
                        {(user?.displayName || user?.email || 'S').slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                        <p style={{ ...localStyles.cardTitle, marginBottom: 2 }}>Learning Advisor</p>
                        <p style={localStyles.cardSubtle}>Shared academic workspace</p>
                    </div>
                </div>
                <button
                    type="button"
                    style={localStyles.joinButton}
                    onMouseEnter={(event) => {
                        event.currentTarget.style.background = studentTokens.bgSurfaceStrong;
                        event.currentTarget.style.borderColor = studentTokens.outlineSoft;
                    }}
                    onMouseLeave={(event) => {
                        event.currentTarget.style.background = studentTokens.bgSurface;
                        event.currentTarget.style.borderColor = studentTokens.borderSoft;
                    }}
                >
                    Review Latest Results
                </button>
            </section>

            {renderUpcomingDeadlines()}

            <section style={localStyles.integrityCard}>
                <h3 style={{ ...S.widgetTitle, margin: 0, color: studentTokens.textPrimary }}>Integrity Guide</h3>
                <p style={{ ...localStyles.cardSubtle, lineHeight: 1.6 }}>
                    Keep analysis grounded in the actual submission trail. Use the result history and recent attempts before drawing conclusions from one score.
                </p>
                <span style={localStyles.integrityLink}>Student performance view</span>
            </section>
        </>
    );

    return (
        <div style={S.rightSticky}>
            <div style={localStyles.sectionStack}>
                {variant === 'academic-record' ? renderAcademicRecordRail() : renderDefaultRail()}

                <p style={localStyles.footnote}>
                    Student shell data is shared between page content and the right rail.
                </p>

                {supplementalContent}
            </div>
        </div>
    );
};

interface ConnectedStudentRightRailProps {
    supplementalContent?: React.ReactNode;
    variant?: 'default' | 'academic-record';
}

export const ConnectedStudentRightRail: React.FC<ConnectedStudentRightRailProps> = ({ supplementalContent, variant = 'default' }) => {
    const { classLiveSessions, enrolledClasses, sortedAssignments } = useResolvedStudentShellData();

    return (
        <StudentRightRail
            shellData={{ classLiveSessions, enrolledClasses, sortedAssignments }}
            supplementalContent={supplementalContent}
            variant={variant}
        />
    );
};
