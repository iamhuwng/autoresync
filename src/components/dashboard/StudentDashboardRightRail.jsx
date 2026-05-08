import React from 'react';
import { studentTokens } from '../layout/studentLayoutStyles';

const tonePalette = {
    neutral: {
        card: studentTokens.bgSurfaceAlt,
        accent: studentTokens.textBody,
        title: studentTokens.textPrimary,
        meta: studentTokens.textBody,
        border: studentTokens.borderWhisper,
    },
    accent: {
        card: studentTokens.accentSoft,
        accent: studentTokens.accentHover,
        title: studentTokens.textPrimary,
        meta: studentTokens.textBody,
        border: 'rgba(77, 68, 227, 0.12)',
    },
    warm: {
        card: '#f7efe4',
        accent: '#9a5c2d',
        title: studentTokens.textPrimary,
        meta: '#7f5a39',
        border: 'rgba(154, 92, 45, 0.12)',
    },
    cool: {
        card: '#edf5f9',
        accent: '#4c5458',
        title: studentTokens.textPrimary,
        meta: studentTokens.textBody,
        border: 'rgba(76, 84, 88, 0.12)',
    },
};

const styles = {
    root: {
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        minWidth: 0,
    },
    section: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    sectionHeader: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    sectionTitle: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: studentTokens.textPrimary,
        lineHeight: 1.2,
    },
    sectionSubtitle: {
        margin: 0,
        fontSize: '0.75rem',
        lineHeight: 1.4,
        color: studentTokens.textBody,
        maxWidth: 220,
    },
    panel: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 0,
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
    },
    snapshotList: {
        display: 'grid',
        gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
        gap: 10,
    },
    snapshotRail: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    snapshotHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    snapshotEyebrow: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
    },
    snapshotInfo: {
        margin: 0,
        fontSize: '0.6875rem',
        color: studentTokens.textMuted,
        lineHeight: 1,
    },
    snapshotGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    snapshotDivider: {
        height: 1,
        background: studentTokens.borderWhisper,
        margin: '4px 0 0',
    },
    snapshotSubheader: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
    },
    snapshotCard: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 12px 11px',
        borderRadius: 4,
        border: '1px solid transparent',
    },
    snapshotCardTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    snapshotLabel: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
    },
    snapshotValue: {
        margin: 0,
        fontSize: '1.55rem',
        fontWeight: 300,
        lineHeight: 1,
        color: studentTokens.textPrimary,
        wordBreak: 'break-word',
    },
    snapshotSummary: {
        margin: 0,
        fontSize: '0.75rem',
        lineHeight: 1.55,
        color: studentTokens.textBody,
    },
    snapshotMeta: {
        margin: 0,
        fontSize: '0.6875rem',
        lineHeight: 1.45,
        color: studentTokens.textMuted,
    },
    inlineButton: {
        alignSelf: 'flex-start',
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        color: studentTokens.accent,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: 'pointer',
    },
    summaryList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        listStyle: 'none',
        margin: 0,
        padding: 0,
    },
    summaryItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: 0,
        borderRadius: 4,
        border: 'none',
        background: 'transparent',
    },
    summaryItemHeader: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        minWidth: 0,
        flex: 1,
    },
    summaryItemTitle: {
        margin: 0,
        fontSize: '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.3,
        color: studentTokens.textPrimary,
    },
    summaryItemDot: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        marginTop: 6,
        flexShrink: 0,
    },
    summaryItemMeta: {
        margin: 0,
        fontSize: '0.625rem',
        lineHeight: 1.4,
        color: studentTokens.textBody,
    },
    summaryItemPill: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },
    sessionList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        listStyle: 'none',
        margin: 0,
        padding: 0,
    },
    sessionItem: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        padding: 0,
        borderRadius: 0,
        border: 'none',
        background: 'transparent',
    },
    sessionMain: {
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        flex: 1,
    },
    sessionThumb: {
        width: 40,
        height: 40,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: studentTokens.textPrimary,
        background: studentTokens.bgSurfaceStrong,
        border: `1px solid ${studentTokens.borderWhisper}`,
      },
    sessionTitle: {
        margin: 0,
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.35,
        color: studentTokens.textPrimary,
    },
    sessionMeta: {
        margin: 0,
        fontSize: '0.625rem',
        lineHeight: 1.4,
        color: studentTokens.textBody,
    },
    sessionBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },
    joinButton: {
        border: 'none',
        borderRadius: 0,
        padding: 0,
        background: 'transparent',
        color: studentTokens.textPrimary,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        flexShrink: 0,
    },
    footerButton: {
        width: '100%',
        marginTop: 8,
        border: `1px solid ${studentTokens.borderSoft}`,
        borderRadius: 0,
        padding: '10px 12px',
        background: 'transparent',
        color: studentTokens.textPrimary,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: 'pointer',
    },
    divider: {
        height: 1,
        background: studentTokens.borderWhisper,
        margin: '2px 0',
    },
    emptyState: {
        padding: '10px 2px 2px',
        margin: 0,
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: studentTokens.textBody,
    },
};

function getTonePalette(tone) {
    return tonePalette[tone] || tonePalette.neutral;
}

function toMetaString(meta) {
    if (meta == null || meta === '') return '';
    if (Array.isArray(meta)) return meta.filter(Boolean).join(' - ');
    return String(meta);
}

function renderSnapshotCard(card, index) {
    const palette = getTonePalette(card.tone);
    const clickable = typeof card.onClick === 'function';

    return (
        <div
            key={card.id || card.label || String(index)}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? card.onClick : undefined}
            onKeyDown={
                clickable
                    ? event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              card.onClick();
                          }
                      }
                    : undefined
            }
            style={{
                ...styles.snapshotCard,
                background: palette.card,
                borderColor: palette.border,
                cursor: clickable ? 'pointer' : 'default',
                boxShadow: clickable ? '0 1px 2px rgba(43, 52, 55, 0.04)' : 'none',
            }}
        >
            <div style={styles.snapshotCardTop}>
                <p style={styles.snapshotLabel}>{card.label}</p>
                {card.badge ? (
                    <span
                        style={{
                            ...styles.sessionBadge,
                            background: studentTokens.bgSurface,
                            color: palette.accent,
                        }}
                    >
                        {card.badge}
                    </span>
                ) : null}
            </div>
            <p style={{ ...styles.snapshotValue, color: palette.title }}>{card.value}</p>
            {card.summary ? <p style={styles.snapshotSummary}>{card.summary}</p> : null}
            {card.meta ? <p style={styles.snapshotMeta}>{card.meta}</p> : null}
            {clickable ? (
                <button type="button" style={styles.inlineButton} onClick={card.onClick}>
                    {card.actionLabel || 'Open'}
                </button>
            ) : null}
        </div>
    );
}

function renderUpNextItem(item, index) {
    const palette = getTonePalette(item.tone);
    const clickable = typeof item.onClick === 'function';

    return (
        <li key={item.id || item.title || String(index)} style={styles.summaryItem}>
            <span
                style={{
                    ...styles.summaryItemDot,
                    background: palette.accent,
                }}
            />
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={styles.summaryItemHeader}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={styles.summaryItemTitle}>{item.title}</p>
                        {item.meta ? <p style={styles.summaryItemMeta}>{item.meta}</p> : null}
                    </div>
                    {item.dueLabel ? (
                        <span
                            style={{
                                ...styles.summaryItemPill,
                                background: 'transparent',
                                color: palette.accent,
                                border: 'none',
                                padding: 0,
                            }}
                        >
                            {item.dueLabel}
                        </span>
                    ) : null}
                </div>
                {item.summary ? <p style={styles.summaryItemMeta}>{item.summary}</p> : null}
            </div>
            {clickable ? (
                <button type="button" style={{ ...styles.inlineButton, marginTop: 2 }} onClick={item.onClick}>
                    {item.actionLabel || 'Open'}
                </button>
            ) : null}
        </li>
    );
}

function renderPublicSession(session, index, onJoinPublicSession) {
    const palette = getTonePalette(session.tone);
    const handleJoin =
        typeof session.onJoin === 'function'
            ? session.onJoin
            : onJoinPublicSession
              ? () => onJoinPublicSession(session.sessionCode)
              : null;

    return (
        <li key={session.sessionCode || session.id || session.title || String(index)} style={styles.sessionItem}>
            <div
                style={{
                    ...styles.sessionThumb,
                    background: palette.card,
                    borderColor: palette.border,
                    color: palette.accent,
                }}
            >
                {String(session.sessionCode || session.title || 'S')
                    .replace(/[^A-Za-z0-9]/g, '')
                    .slice(0, 2)
                    .toUpperCase() || 'S'}
            </div>
            <div style={styles.sessionMain}>
                <p style={styles.sessionTitle}>{session.title}</p>
                <p style={styles.sessionMeta}>
                    {toMetaString(session.meta) || (typeof session.playerCount === 'number' ? `${session.playerCount} students` : '')}
                </p>
            </div>
            {session.badgeLabel ? (
                <span
                    style={{
                        ...styles.sessionBadge,
                        background: palette.card,
                        color: palette.accent,
                        border: `1px solid ${palette.border}`,
                    }}
                >
                    {session.badgeLabel}
                </span>
            ) : null}
            {handleJoin ? (
                <button type="button" style={styles.joinButton} onClick={handleJoin}>
                    {session.joinLabel || 'Join'}
                </button>
            ) : null}
        </li>
    );
}

function renderLiveSession(session, index, onJoinClassSession) {
    const palette = getTonePalette(session.tone || (session.status === 'in-progress' ? 'accent' : 'neutral'));
    const handleJoin =
        typeof session.onJoin === 'function'
            ? session.onJoin
            : onJoinClassSession
              ? () => onJoinClassSession(session.sessionCode)
              : null;

    return (
        <li key={session.sessionCode || session.id || session.title || String(index)} style={styles.sessionItem}>
            <div
                style={{
                    ...styles.sessionThumb,
                    background: palette.card,
                    borderColor: palette.border,
                    color: palette.accent,
                }}
            >
                {String(session.badgeLabel || session.title || 'L')
                    .replace(/[^A-Za-z0-9]/g, '')
                    .slice(0, 2)
                    .toUpperCase() || 'L'}
            </div>
            <div style={styles.sessionMain}>
                <p style={styles.sessionTitle}>{session.title}</p>
                <p style={styles.sessionMeta}>{toMetaString(session.meta)}</p>
            </div>
            {session.statusLabel ? (
                <span
                    style={{
                        ...styles.sessionBadge,
                        background: palette.card,
                        color: palette.accent,
                        border: `1px solid ${palette.border}`,
                    }}
                >
                    {session.statusLabel}
                </span>
            ) : null}
            {handleJoin ? (
                <button type="button" style={styles.joinButton} onClick={handleJoin}>
                    {session.joinLabel || 'Join Now'}
                </button>
            ) : null}
        </li>
    );
}

/**
 * Presentational student dashboard right rail.
 *
 * Host contract:
 * - `upNextItems`: array of rows with `{ id, title, meta?, summary?, dueLabel?, tone?, actionLabel?, onClick? }`
 * - `liveSessions`: array of sessions with `{ sessionCode, title, meta?, statusLabel?, tone?, joinLabel?, onJoin? }`
 * - `publicSessions`: array of sessions with `{ sessionCode, title, meta?, playerCount?, badgeLabel?, tone?, joinLabel?, onJoin? }`
 * - `onOpenHomework`: callback for the homework footer CTA
 * - `onJoinClassSession`: fallback join callback that receives `sessionCode`
 * - `onExpandPublicSessions`: callback for the public sessions expansion CTA
 * - `onJoinPublicSession`: fallback join callback that receives `sessionCode`
 */
export function StudentDashboardRightRail({
    upNextTitle = 'Deadlines',
    upNextSubtitle = null,
    upNextItems = [],
    onOpenHomework,
    openHomeworkLabel = 'Open Homework',
    liveSessionsTitle = 'Live Now',
    liveSessionsSubtitle = null,
    liveSessions = [],
    onJoinClassSession,
    emptyLiveSessionsLabel = 'No class sessions are live right now.',
    publicSessionsTitle = 'Public Sessions',
    publicSessionsSubtitle = null,
    publicSessions = [],
    visiblePublicSessionsCount = 4,
    onJoinPublicSession,
    onExpandPublicSessions,
    expandPublicSessionsLabel = 'See all public sessions',
    emptyUpNextLabel = 'No upcoming homework right now.',
    emptyPublicSessionsLabel = 'No public sessions are currently open.',
    className,
    style,
}) {
    const visibleSessions = publicSessions.slice(0, visiblePublicSessionsCount);
    const hasMoreSessions = publicSessions.length > visiblePublicSessionsCount;

    return (
        <aside aria-label="Student dashboard right rail" className={className} style={{ ...styles.root, ...style }}>
            <section style={styles.section}>
                <div style={styles.sectionHeader}>
                    <h3 style={styles.sectionTitle}>{upNextTitle}</h3>
                    {upNextSubtitle ? <p style={styles.sectionSubtitle}>{upNextSubtitle}</p> : null}
                </div>
                <div style={styles.panel}>
                    <div style={styles.snapshotGroup}>
                        {upNextItems.length > 0 ? (
                            <ul style={styles.summaryList}>{upNextItems.map(renderUpNextItem)}</ul>
                        ) : (
                            <p style={styles.emptyState}>{emptyUpNextLabel}</p>
                        )}
                        {typeof onOpenHomework === 'function' && upNextItems.length === 0 ? (
                            <button type="button" style={styles.footerButton} onClick={onOpenHomework}>
                                {openHomeworkLabel}
                            </button>
                        ) : null}
                    </div>
                </div>
            </section>

            <section style={styles.section}>
                <div style={styles.sectionHeader}>
                    <h3 style={styles.sectionTitle}>{liveSessionsTitle}</h3>
                    {liveSessionsSubtitle ? <p style={styles.sectionSubtitle}>{liveSessionsSubtitle}</p> : null}
                </div>
                <div style={styles.panel}>
                    {liveSessions.length > 0 ? (
                        <ul style={styles.sessionList}>
                            {liveSessions.map((session, index) => renderLiveSession(session, index, onJoinClassSession))}
                        </ul>
                    ) : (
                        <p style={styles.emptyState}>{emptyLiveSessionsLabel}</p>
                    )}
                </div>
            </section>

            <section style={styles.section}>
                <div style={styles.sectionHeader}>
                    <h3 style={styles.sectionTitle}>{publicSessionsTitle}</h3>
                    {publicSessionsSubtitle ? <p style={styles.sectionSubtitle}>{publicSessionsSubtitle}</p> : null}
                </div>
                <div style={styles.panel}>
                    {visibleSessions.length > 0 ? (
                        <ul style={styles.sessionList}>
                            {visibleSessions.map((session, index) => renderPublicSession(session, index, onJoinPublicSession))}
                        </ul>
                    ) : (
                        <p style={styles.emptyState}>{emptyPublicSessionsLabel}</p>
                    )}
                    {hasMoreSessions && typeof onExpandPublicSessions === 'function' ? (
                        <button type="button" style={styles.footerButton} onClick={onExpandPublicSessions}>
                            {expandPublicSessionsLabel}
                        </button>
                    ) : null}
                </div>
            </section>
        </aside>
    );
}

export default StudentDashboardRightRail;
