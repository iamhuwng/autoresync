import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigation } from '../../hooks/useNavigation';
import type { StudentShellData } from '../../hooks/useStudentShellData';
import { useResolvedStudentShellData } from '../../context/StudentShellDataContext';
import { reportingService } from '../../services/reportingService';
import { sessionService } from '../../services/sessionService';
import { S, studentTokens } from './studentLayoutStyles';

const MARQUEE_STYLE_ID = 'student-rail-marquee';
const MARQUEE_CSS = `
  .rail-title-marquee {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
  }
  .rail-title-marquee .rail-title-inner {
    display: inline-block;
    transition: transform 0.3s ease;
  }
  .rail-title-marquee:hover .rail-title-inner {
    animation: railMarqueeScroll var(--marquee-duration, 3s) linear 0.25s forwards;
  }
  @keyframes railMarqueeScroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(var(--marquee-offset, -30%)); }
  }
  @keyframes livePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(0.8); }
  }
`;

function injectMarqueeStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(MARQUEE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MARQUEE_STYLE_ID;
    style.textContent = MARQUEE_CSS;
    document.head.appendChild(style);
}

export type StudentRightRailShellData = Pick<
    StudentShellData,
    'classLiveSessions' | 'enrolledClasses' | 'sortedAssignments'
>;

interface StudentRightRailProps {
    shellData: StudentRightRailShellData;
    supplementalContent?: React.ReactNode;
    variant?: 'default' | 'academic-record' | 'dashboard';
}

/* ═══════════════════════════════════════════════════════════════════════
   v2 Editorial Tokens — exact values from mockup
   ═══════════════════════════════════════════════════════════════════════ */
const v2 = {
    /* Section header */
    sectionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    } as React.CSSProperties,
    sectionTitle: {
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.1em',
        color: '#2b3437',
        margin: 0,
    } as React.CSSProperties,
    /* White card container */
    card: {
        background: '#ffffff',
        padding: 20,
        borderRadius: 2,
        border: '1px solid rgba(171,179,183,0.05)',
    } as React.CSSProperties,
    cardSpacing: { marginTop: 16 } as React.CSSProperties,
    /* Card sub-label */
    cardLabel: {
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        color: '#737c7f',
        display: 'block',
        marginBottom: 12,
    } as React.CSSProperties,
    /* Upcoming dot-list */
    upcomingList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
    } as React.CSSProperties,
    upcomingItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'default',
        padding: '2px 0',
        transition: 'opacity 0.15s',
    } as React.CSSProperties,
    upcomingTitle: {
        fontSize: 12,
        fontWeight: 500,
        color: '#2b3437',
        flex: 1,
        minWidth: 0,
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    } as React.CSSProperties,
    upcomingTime: {
        fontSize: 10,
        color: '#abb3b7',
        flexShrink: 0,
        whiteSpace: 'nowrap' as const,
        textTransform: 'uppercase' as const,
    } as React.CSSProperties,
    /* Dots */
    dotError: { width: 6, height: 6, borderRadius: '50%', background: '#d93025', flexShrink: 0 } as React.CSSProperties,
    dotPrimary: { width: 6, height: 6, borderRadius: '50%', background: '#4d44e3', flexShrink: 0 } as React.CSSProperties,
    dotWarning: { width: 6, height: 6, borderRadius: '50%', background: '#d4a843', flexShrink: 0 } as React.CSSProperties,
    /* Session thumbnail list */
    sessionsList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 24,
    } as React.CSSProperties,
    sessionRow: {
        display: 'flex',
        gap: 16,
        cursor: 'pointer',
    } as React.CSSProperties,
    sessionThumb: {
        width: 48,
        height: 48,
        borderRadius: 4,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.375rem',
        transition: 'filter 0.3s ease',
        filter: 'grayscale(100%)',
    } as React.CSSProperties,
    sessionInfo: {
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'center',
        minWidth: 0,
    } as React.CSSProperties,
    sessionName: {
        fontSize: 12,
        fontWeight: 600,
        color: '#2b3437',
        marginBottom: 2,
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        margin: 0,
    } as React.CSSProperties,
    sessionMeta: {
        fontSize: 10,
        color: '#737c7f',
        textTransform: 'uppercase' as const,
        letterSpacing: '-0.01em',
        margin: 0,
    } as React.CSSProperties,
    /* Live dot with pulse */
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: '#d93025',
        animation: 'livePulse 1.5s ease-in-out infinite',
        flexShrink: 0,
    } as React.CSSProperties,
    /* CTA button */
    cta: {
        display: 'block',
        width: '100%',
        marginTop: 32,
        padding: '12px 0',
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.1em',
        color: '#2b3437',
        background: '#dce4e8',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        fontFamily: 'inherit',
        textAlign: 'center' as const,
    } as React.CSSProperties,
    emptyText: {
        fontSize: 11,
        color: '#737c7f',
        margin: 0,
        padding: '2px 0',
    } as React.CSSProperties,
};


const THUMB_GRADIENTS = [
    'linear-gradient(135deg, #e2dfff, #c5c0ff)',
    'linear-gradient(135deg, #fce8e6, #f5b7b1)',
    'linear-gradient(135deg, #edf5f9, #c8dce6)',
    'linear-gradient(135deg, #fef3c7, #fde68a)',
    'linear-gradient(135deg, #d1fae5, #a7f3d0)',
];

const THUMB_EMOJIS = ['📐', '✍️', '📖', '🔢', '🔬', '🎓', '📝', '💡'];


/** Format due date into a short label for the v2 upcoming format */
function formatDueTimeLabel(dateValue?: number | string, isOverdue?: boolean): string {
    if (!dateValue) return '';
    if (isOverdue) return 'Overdue';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Overdue';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) {
        return date.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', ',');
    }
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

const ADVISOR_NAMES = [
    'Ms. Nguyen', 'Mr. Tran', 'Ms. Le', 'Mr. Pham',
    'Ms. Hoang', 'Mr. Vo', 'Ms. Dang', 'Mr. Do',
    'Ms. Bui', 'Mr. Ngo',
];

function pickAdvisor(enrolledClasses: StudentRightRailShellData['enrolledClasses'], uid?: string) {
    const seed = (uid || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const idx = seed % ADVISOR_NAMES.length;
    const name = ADVISOR_NAMES[idx] ?? ADVISOR_NAMES[0];
    const className = enrolledClasses.length > 0
        ? enrolledClasses[seed % enrolledClasses.length]?.name || enrolledClasses[0]?.classCode || 'Academic Workspace'
        : 'Academic Workspace';
    const safeName = name || 'Ms. Nguyen';
    return { name: safeName, className, initial: safeName.split('. ')[1]?.[0] || safeName[0] || 'T' };
}

export const StudentRightRail: React.FC<StudentRightRailProps> = ({ shellData, supplementalContent, variant = 'default' }) => {
    const { user } = useAuth();
    const { navigateTo } = useNavigation('student');
    const { classLiveSessions, enrolledClasses, sortedAssignments } = shellData;

    React.useEffect(() => { injectMarqueeStyles(); }, []);

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

    /* ═══════════════════════════════════════════════════════════════════
       v2 DASHBOARD VARIANT — Editorial Academic Standard
       ═══════════════════════════════════════════════════════════════════ */
    const renderDashboardRail = () => {
        const isDueTomorrow = (dateValue?: number | string) => {
            if (!dateValue) return false;
            const d = new Date(dateValue);
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return d.toDateString() === tomorrow.toDateString();
        };

        return (
            <>
                {/* ━━━━━ Section 1: FEED SNAPSHOT ━━━━━ */}
                <section style={{ marginBottom: 48 }}>
                    <header style={v2.sectionHeader}>
                        <h4 style={v2.sectionTitle}>Feed Snapshot</h4>
                    </header>

                    {/* Card: Up Next — "Upcoming" dot-list format */}
                    <div style={v2.card}>
                        <span style={v2.cardLabel}>Up Next</span>
                        {sortedAssignments.length === 0 ? (
                            <p style={v2.emptyText}>No upcoming deadlines.</p>
                        ) : (
                            <div style={v2.upcomingList}>
                                {sortedAssignments.slice(0, 5).map((item) => {
                                    const assignment = item.homework;
                                    const isOverdue = item.status === 'overdue';
                                    const isTomorrow = isDueTomorrow(assignment.scheduling?.dueDate);
                                    const dotStyle = (isOverdue || isTomorrow) ? v2.dotError : v2.dotPrimary;
                                    const timeLabel = formatDueTimeLabel(assignment.scheduling?.dueDate, isOverdue);

                                    return (
                                        <div key={assignment.id} style={v2.upcomingItem}>
                                            <span style={dotStyle} />
                                            <span style={v2.upcomingTitle}>
                                                {assignment.title || assignment.materialTitle || 'Untitled'}
                                            </span>
                                            <span style={v2.upcomingTime}>{timeLabel}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Card: Pending Reviews — rendered from supplementalContent */}
                    {supplementalContent && (
                        <div style={v2.cardSpacing}>
                            {supplementalContent}
                        </div>
                    )}
                </section>

                {/* ━━━━━ Section 2: LIVE NOW (only if sessions exist) ━━━━━ */}
                {classLiveSessions.length > 0 && (
                    <section style={{ marginBottom: 48 }}>
                        <header style={v2.sectionHeader}>
                            <h4 style={v2.sectionTitle}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <span style={v2.liveDot} />
                                    Live Now
                                </span>
                            </h4>
                        </header>

                        <div style={v2.sessionsList}>
                            {classLiveSessions.slice(0, 5).map((session, idx) => (
                                <div
                                    key={session.code}
                                    style={v2.sessionRow}
                                    onClick={() => handleJoinLiveSession(session.code, session.status, session.classId)}
                                    onMouseEnter={(e) => {
                                        const thumb = e.currentTarget.querySelector<HTMLDivElement>('[data-thumb]');
                                        if (thumb) thumb.style.filter = 'grayscale(0%)';
                                    }}
                                    onMouseLeave={(e) => {
                                        const thumb = e.currentTarget.querySelector<HTMLDivElement>('[data-thumb]');
                                        if (thumb) thumb.style.filter = 'grayscale(100%)';
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            handleJoinLiveSession(session.code, session.status, session.classId);
                                        }
                                    }}
                                >
                                    <div
                                        data-thumb=""
                                        style={{
                                            ...v2.sessionThumb,
                                            background: THUMB_GRADIENTS[idx % THUMB_GRADIENTS.length],
                                        }}
                                    >
                                        {THUMB_EMOJIS[idx % THUMB_EMOJIS.length]}
                                    </div>
                                    <div style={v2.sessionInfo}>
                                        <p style={v2.sessionName}>{session.title}</p>
                                        <p style={v2.sessionMeta}>
                                            {session.className}
                                            {session.status === 'in-progress' ? ' · In Progress' : ' · Waiting'}
                                            {' · '}{session.code}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ━━━━━ Section 3: MY CLASSES ━━━━━ */}
                <section style={{ marginBottom: 0 }}>
                    <header style={v2.sectionHeader}>
                        <h4 style={v2.sectionTitle}>My Classes</h4>
                    </header>

                    <div style={v2.sessionsList}>
                        {enrolledClasses.length > 0 ? (
                            enrolledClasses.map((cls, idx) => (
                                <div key={cls.id} style={{ ...v2.sessionRow, cursor: 'default' }}>
                                    <div
                                        data-thumb=""
                                        style={{
                                            ...v2.sessionThumb,
                                            background: THUMB_GRADIENTS[idx % THUMB_GRADIENTS.length],
                                        }}
                                    >
                                        {THUMB_EMOJIS[(idx + 2) % THUMB_EMOJIS.length]}
                                    </div>
                                    <div style={v2.sessionInfo}>
                                        <p style={v2.sessionName}>{cls.classCode || cls.name}</p>
                                        <p style={v2.sessionMeta}>
                                            {cls.studentCount || 0} Students · {cls.activeAssignments || 0} Active
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p style={v2.emptyText}>No classes joined yet.</p>
                        )}
                    </div>

                    {/* CTA: Find a Session */}
                    <button
                        type="button"
                        style={v2.cta}
                        onClick={() => navigateTo('STUDENT_DASHBOARD', {}, { reason: 'dashboard_rail_cta' })}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#cdd6da'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#dce4e8'; }}
                    >
                        Find a session
                    </button>
                </section>
            </>
        );
    };

    /* ═══════════════════════════════════════════════════════════════════
       Shared v2 Sections — used by default + academic-record variants
       ═══════════════════════════════════════════════════════════════════ */
    const renderUpcomingDeadlines = () => {
        const sectionLabel = variant === 'academic-record' ? 'Upcoming Deadlines' : 'Up Next';
        const isDueTomorrow = (dateValue?: number | string) => {
            if (!dateValue) return false;
            const d = new Date(dateValue);
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return d.toDateString() === tomorrow.toDateString();
        };

        return (
            <section style={{ marginBottom: 48 }}>
                <header style={v2.sectionHeader}>
                    <h4 style={v2.sectionTitle}>{sectionLabel}</h4>
                </header>
                <div style={v2.card}>
                    {sortedAssignments.length === 0 ? (
                        <p style={v2.emptyText}>No upcoming deadlines.</p>
                    ) : (
                        <div style={v2.upcomingList}>
                            {sortedAssignments.slice(0, 5).map((item) => {
                                const assignment = item.homework;
                                const isOverdue = item.status === 'overdue';
                                const isTomorrow = isDueTomorrow(assignment.scheduling?.dueDate);
                                const dotStyle = (isOverdue || isTomorrow) ? v2.dotError : v2.dotPrimary;
                                const timeLabel = formatDueTimeLabel(assignment.scheduling?.dueDate, isOverdue);

                                return (
                                    <div key={assignment.id} style={v2.upcomingItem}>
                                        <span style={dotStyle} />
                                        <span style={v2.upcomingTitle}>
                                            {assignment.title || assignment.materialTitle || 'Untitled'}
                                        </span>
                                        <span style={v2.upcomingTime}>{timeLabel}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>
        );
    };

    const renderMyClassesSection = () => (
        <section style={{ marginBottom: 48 }}>
            <header style={v2.sectionHeader}>
                <h4 style={v2.sectionTitle}>My Classes</h4>
            </header>
            <div style={v2.sessionsList}>
                {enrolledClasses.length === 0 ? (
                    <p style={v2.emptyText}>No classes joined yet.</p>
                ) : (
                    enrolledClasses.map((cls, idx) => (
                        <div key={cls.id} style={{ ...v2.sessionRow, cursor: 'default' }}>
                            <div
                                data-thumb=""
                                style={{
                                    ...v2.sessionThumb,
                                    background: THUMB_GRADIENTS[idx % THUMB_GRADIENTS.length],
                                }}
                            >
                                {THUMB_EMOJIS[(idx + 2) % THUMB_EMOJIS.length]}
                            </div>
                            <div style={v2.sessionInfo}>
                                <p style={v2.sessionName}>{cls.classCode || cls.name}</p>
                                <p style={v2.sessionMeta}>
                                    {cls.studentCount || 0} Students · {cls.activeAssignments || 0} Active
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </section>
    );

    const renderLiveSessionsSection = () => (
        classLiveSessions.length > 0 ? (
            <section style={{ marginBottom: 48 }}>
                <header style={v2.sectionHeader}>
                    <h4 style={v2.sectionTitle}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={v2.liveDot} />
                            Live Now
                        </span>
                    </h4>
                </header>
                <div style={v2.sessionsList}>
                    {classLiveSessions.slice(0, 5).map((session, idx) => (
                        <div
                            key={session.code}
                            style={v2.sessionRow}
                            onClick={() => handleJoinLiveSession(session.code, session.status, session.classId)}
                            onMouseEnter={(e) => {
                                const thumb = e.currentTarget.querySelector<HTMLDivElement>('[data-thumb]');
                                if (thumb) thumb.style.filter = 'grayscale(0%)';
                            }}
                            onMouseLeave={(e) => {
                                const thumb = e.currentTarget.querySelector<HTMLDivElement>('[data-thumb]');
                                if (thumb) thumb.style.filter = 'grayscale(100%)';
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleJoinLiveSession(session.code, session.status, session.classId);
                                }
                            }}
                        >
                            <div
                                data-thumb=""
                                style={{
                                    ...v2.sessionThumb,
                                    background: THUMB_GRADIENTS[idx % THUMB_GRADIENTS.length],
                                }}
                            >
                                {THUMB_EMOJIS[idx % THUMB_EMOJIS.length]}
                            </div>
                            <div style={v2.sessionInfo}>
                                <p style={v2.sessionName}>{session.title}</p>
                                <p style={v2.sessionMeta}>
                                    {session.className}
                                    {session.status === 'in-progress' ? ' · In Progress' : ' · Waiting'}
                                    {' · '}{session.code}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        ) : null
    );

    const renderDefaultRail = () => (
        <>
            {renderLiveSessionsSection()}
            {renderUpcomingDeadlines()}
            {renderMyClassesSection()}
        </>
    );

    const advisor = pickAdvisor(enrolledClasses, user?.uid);

    const renderAcademicRecordRail = () => (
        <>
            {/* Academic Advisor — flat white card */}
            <section style={{ marginBottom: 48 }}>
                <header style={v2.sectionHeader}>
                    <h4 style={v2.sectionTitle}>Academic Advisor</h4>
                </header>
                <div style={v2.card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div
                            style={{
                                ...v2.sessionThumb,
                                borderRadius: 999,
                                background: THUMB_GRADIENTS[0],
                                filter: 'none',
                            }}
                        >
                            {advisor.initial}
                        </div>
                        <div style={v2.sessionInfo}>
                            <p style={v2.sessionName}>{advisor.name}</p>
                            <p style={v2.sessionMeta}>{advisor.className}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        style={v2.cta}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#cdd6da'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#dce4e8'; }}
                    >
                        Review Latest Results
                    </button>
                </div>
            </section>

            {renderUpcomingDeadlines()}

            {/* Integrity Guide — flat white card */}
            <section style={{ marginBottom: 0 }}>
                <header style={v2.sectionHeader}>
                    <h4 style={v2.sectionTitle}>Integrity Guide</h4>
                </header>
                <div style={v2.card}>
                    <p style={{ ...v2.emptyText, lineHeight: 1.6 }}>
                        Keep analysis grounded in the actual submission trail. Use the result history and recent attempts before drawing conclusions from one score.
                    </p>
                    <span style={{
                        display: 'inline-block',
                        marginTop: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase' as const,
                        color: studentTokens.accent,
                        cursor: 'pointer',
                    }}>
                        Student performance view
                    </span>
                </div>
            </section>
        </>
    );

    /* ── Dashboard variant integrates supplementalContent inline ── */
    if (variant === 'dashboard') {
        return (
            <div style={S.rightSticky}>
                {renderDashboardRail()}
            </div>
        );
    }

    return (
        <div style={S.rightSticky}>
            {variant === 'academic-record'
                ? renderAcademicRecordRail()
                : renderDefaultRail()}
            {supplementalContent}
        </div>
    );
};

interface ConnectedStudentRightRailProps {
    supplementalContent?: React.ReactNode;
    variant?: 'default' | 'academic-record' | 'dashboard';
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
