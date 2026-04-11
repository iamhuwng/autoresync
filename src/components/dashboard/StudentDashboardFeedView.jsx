import React from 'react';
import { mobileStyles, studentTokens } from '../layout/studentLayoutStyles';
import { IconBriefcase, IconCheck, IconHomework, IconHistory, IconSearch } from '../layout/StudentIcons';
import RecentGradesChart from './RecentGradesChart';

function stripEmoji(text) {
    if (!text) return text;
    return text.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f]+\s*/gu, '').trim();
}

function ArrowIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
        </svg>
    );
}

function BellIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
            <path d="M9 17a3 3 0 0 0 6 0" />
        </svg>
    );
}

function InlineLoader({ size = 32 }) {
    return (
        <div
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                border: '3px solid #e2dfff',
                borderTopColor: studentTokens.accent,
                animation: 'studentDashboardFeedSpinner 0.8s linear infinite',
            }}
        />
    );
}

function kindLabel(kind) {
    if (kind === 'tests') return 'Test Results';
    if (kind === 'homework') return 'Assignment Due';
    if (kind === 'classes') return 'Class Update';
    return 'Academic Update';
}

function getNodeTone(kind) {
    if (kind === 'tests') return { bg: '#eaeff1', color: studentTokens.textPrimary, icon: <IconCheck /> };
    if (kind === 'homework') return { bg: '#dce4e8', color: '#586064', icon: <IconHomework /> };
    if (kind === 'classes') return { bg: '#eaeff1', color: studentTokens.textPrimary, icon: <IconBriefcase /> };
    return { bg: '#eaeff1', color: studentTokens.textBody, icon: <IconHistory /> };
}

function getFallbackAction(kind) {
    if (kind === 'tests') return 'View Result';
    if (kind === 'homework') return 'Open Homework';
    if (kind === 'classes') return 'Open';
    return 'Open';
}

const CLASS_COLORS = [
    { bg: studentTokens.accentSoft, color: studentTokens.accentHover },
    { bg: '#edf5f9', color: '#4c5458' },
    { bg: '#f7efe4', color: '#9a5c2d' },
    { bg: '#dce4e8', color: '#586064' },
];

const styles = {
    root: {
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        gap: 0,
    },
    topBar: {
        position: 'sticky',
        top: 0,
        zIndex: 3,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 22,
        padding: '34px 0 18px',
        background: studentTokens.bgPage,
        borderBottom: 'none',
    },
    titleWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
        flexShrink: 0,
    },
    pageTitle: {
        margin: 0,
        fontSize: '2.25rem',
        fontWeight: 700,
        letterSpacing: '-0.03em',
        color: studentTokens.textPrimary,
    },
    subtitle: {
        margin: 0,
        maxWidth: 520,
        fontSize: '0.875rem',
        lineHeight: 1.55,
        color: studentTokens.textBody,
    },
    topActions: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexShrink: 0,
    },
    searchShell: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: 188,
        height: 36,
        background: studentTokens.bgSurface,
        borderBottom: `2px solid ${studentTokens.outlineSoft}`,
        padding: '0 8px',
    },
    searchInput: {
        width: '100%',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        paddingLeft: 6,
        color: studentTokens.textPrimary,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
    },
    utilityButton: {
        position: 'relative',
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        background: 'transparent',
        color: studentTokens.textDim,
        cursor: 'pointer',
        padding: 0,
    },
    utilityButtonActive: {
        color: studentTokens.accent,
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        background: studentTokens.accent,
        color: '#faf6ff',
        fontSize: '0.625rem',
        fontWeight: 700,
    },
    tabs: {
        display: 'flex',
        justifyContent: 'center',
        gap: 28,
        overflowX: 'auto',
        padding: '0 0 18px',
        marginBottom: 0,
        borderBottom: 'none',
    },
    tab: {
        padding: '0 0 12px',
        border: 'none',
        borderBottom: '2px solid transparent',
        background: 'transparent',
        color: studentTokens.textMuted,
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
    },
    tabActive: {
        color: studentTokens.accent,
        borderBottom: `2px solid ${studentTokens.accent}`,
    },
    summary: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 0,
        padding: '24px 0 28px',
    },
    summaryCell: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '0 32px 0 0',
    },
    summaryCellInner: {
        padding: '0 0 0 32px',
    },
    summaryLabel: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
    },
    summaryValue: {
        margin: 0,
        fontSize: '2.7rem',
        fontWeight: 300,
        lineHeight: 1,
        color: studentTokens.textPrimary,
    },
    assignmentSummaryValue: {
        margin: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        fontSize: '1rem',
        fontWeight: 500,
        lineHeight: 1.25,
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        color: studentTokens.textPrimary,
    },
    summaryMeta: {
        margin: 0,
        maxWidth: 240,
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: studentTokens.textBody,
    },
    tabsWrap: {
        marginTop: 16,
        marginBottom: 40,
        borderBottom: `1px solid ${studentTokens.borderWhisper}`,
    },
    feed: {
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        paddingBottom: 32,
    },
    row: {
        display: 'flex',
        gap: 24,
        cursor: 'pointer',
    },
    rail: {
        width: 42,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        paddingTop: 2,
    },
    node: {
        width: 42,
        height: 42,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1rem',
        fontWeight: 700,
    },
    stem: {
        width: 1,
        flex: 1,
        minHeight: 40,
        marginTop: 16,
        background: studentTokens.borderWhisper,
    },
    rowBody: {
        flex: 1,
        minWidth: 0,
        background: '#ffffff',
        border: '1px solid #eceef0',
        borderRadius: 2,
        padding: '20px 22px',
    },
    feedSeparator: {
        height: 1,
        background: studentTokens.borderWhisper,
        marginTop: 24,
        marginBottom: 24,
        marginLeft: 66,
    },
    meta: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 10,
    },
    eyebrow: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
        lineHeight: 1.5,
    },
    time: {
        margin: 0,
        fontSize: '0.625rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: studentTokens.textDim,
        whiteSpace: 'nowrap',
    },
    rowTitle: {
        margin: '0 0 12px',
        fontSize: '1.25rem',
        fontWeight: 500,
        lineHeight: 1.3,
        color: studentTokens.textPrimary,
    },
    scoreRow: {
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    score: {
        fontSize: '1.875rem',
        fontWeight: 300,
        lineHeight: 1,
        color: studentTokens.accent,
    },
    divider: {
        width: 1,
        height: 32,
        background: 'rgba(171, 179, 183, 0.2)',
    },
    body: {
        margin: 0,
        maxWidth: 520,
        fontSize: '0.875rem',
        lineHeight: 1.7,
        color: studentTokens.textBody,
    },
    inset: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 520,
        padding: '16px 16px',
        background: '#f1f4f6',
        border: `1px solid rgba(171, 179, 183, 0.1)`,
        borderRadius: 8,
    },
    quote: {
        margin: 0,
        fontSize: '0.875rem',
        lineHeight: 1.7,
        color: studentTokens.textPrimary,
        fontWeight: 500,
        fontStyle: 'italic',
    },
    tagText: {
        margin: 0,
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
    },
    linkBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 16,
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        color: studentTokens.accent,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
    },
    empty: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '56px 20px 72px',
        textAlign: 'center',
        borderBottom: `1px solid ${studentTokens.borderWhisper}`,
    },
    emptyTitle: {
        margin: 0,
        fontSize: '1.25rem',
        fontWeight: 700,
        color: studentTokens.textPrimary,
    },
    emptyBody: {
        margin: 0,
        maxWidth: 420,
        fontSize: '0.875rem',
        lineHeight: 1.65,
        color: studentTokens.textBody,
    },
    emptyAction: {
        border: 'none',
        background: 'transparent',
        color: studentTokens.accent,
        padding: 0,
        cursor: 'pointer',
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
    },
    loadMoreWrap: {
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 18,
    },
    loadMoreButton: {
        padding: '12px 32px',
        border: `1px solid rgba(171, 179, 183, 0.2)`,
        background: 'transparent',
        color: studentTokens.textBody,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        borderRadius: 0,
    },
    classGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
        paddingBottom: 32,
    },
    classCard: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 18,
        border: `1px solid ${studentTokens.borderWhisper}`,
        background: studentTokens.bgSurface,
        cursor: 'pointer',
    },
    classBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 10,
        fontSize: '0.95rem',
        fontWeight: 700,
    },
    classTitle: {
        margin: 0,
        fontSize: '0.9375rem',
        fontWeight: 700,
        color: studentTokens.textPrimary,
    },
    classMeta: {
        margin: 0,
        fontSize: '0.75rem',
        lineHeight: 1.55,
        color: studentTokens.textBody,
    },
};

export default function StudentDashboardFeedView({
    mode = 'feed',
    title = 'Dashboard',
    subtitle,
    isMobile = false,
    searchValue = '',
    onSearchChange,
    onSearchBlur,
    unreadCount = 0,
    showUnreadOnly = false,
    onToggleUnreadOnly,
    onOpenAcademicHistory,
    summaryCards = [],
    filterTabs = [],
    activeFilter = 'all',
    onFilterChange,
    feedRows = [],
    loading = false,
    loadingLabel = 'Loading your activity feed...',
    emptyTitle = 'Your feed is quiet for now.',
    emptyBody = 'Join a class to unlock live sessions, coursework, and result tracking in this workspace.',
    emptyActionLabel = 'Join a Class',
    onEmptyAction,
    hasMore = false,
    loadingMore = false,
    onLoadMore,
    classItems = [],
    onClassSelect,
    onJoinClass,
    gradeChartData = null,
}) {
    const feedTabs = filterTabs.length > 0 ? filterTabs : [];
    const showFeed = mode === 'feed';
    const showClasses = mode === 'classes';

    return (
        <>
            <style>{'@keyframes studentDashboardFeedSpinner { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
            <section style={styles.root} aria-label="Student dashboard feed">
                <header style={styles.topBar}>
                    <div style={styles.titleWrap}>
                        <h2 style={{ ...styles.pageTitle, ...(isMobile ? { fontSize: '1.5rem' } : {}) }}>{title}</h2>
                        {subtitle ? <p style={{ ...styles.subtitle, ...(isMobile ? mobileStyles.feedSubtitleHidden : {}) }}>{subtitle}</p> : null}
                    </div>

                    {showFeed ? (
                        <div style={styles.topActions}>
                            <label style={styles.searchShell}>
                                <IconSearch />
                                <input
                                    type="search"
                                    value={searchValue}
                                    placeholder="SEARCH FEED"
                                    onChange={event => onSearchChange?.(event.target.value)}
                                    onBlur={onSearchBlur}
                                    style={styles.searchInput}
                                />
                            </label>

                            <button
                                type="button"
                                style={{ ...styles.utilityButton, ...(showUnreadOnly ? styles.utilityButtonActive : {}) }}
                                onClick={() => onToggleUnreadOnly?.()}
                                aria-pressed={showUnreadOnly}
                                title="Toggle unread feed items"
                            >
                                <BellIcon />
                                {unreadCount > 0 ? <span style={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
                            </button>

                            <button type="button" style={styles.utilityButton} onClick={() => onOpenAcademicHistory?.()} title="Open academic history">
                                <IconHistory />
                            </button>
                        </div>
                    ) : null}
                </header>

                {summaryCards.length > 0 ? (
                    <div style={styles.summary} aria-label="This week assignments">
                        {summaryCards.map((card, index) => {
                            const col = index % 3;
                            const row = Math.floor(index / 3);
                            const isLastCol = col === 2;
                            const isFirstCol = col === 0;
                            const isSecondRow = row === 1;
                            return (
                                <div
                                    key={card.label + '-' + index}
                                    style={{
                                        ...styles.summaryCell,
                                        ...(!isFirstCol ? { paddingLeft: 32 } : {}),
                                        borderRight: !isLastCol ? `1px solid ${studentTokens.borderWhisper}` : 'none',
                                        ...(isSecondRow ? { paddingTop: 24, borderTop: `1px solid ${studentTokens.borderWhisper}`, marginTop: 4 } : {}),
                                    }}
                                >
                                    <p style={styles.summaryLabel}>{card.label}</p>
                                    <p
                                        style={{
                                            ...(card.variant === 'assignment' ? styles.assignmentSummaryValue : styles.summaryValue),
                                            color: card.color || studentTokens.textPrimary,
                                        }}
                                    >
                                        {card.value}
                                    </p>
                                    <p style={styles.summaryMeta}>{card.meta}</p>
                                </div>
                            );
                        })}
                    </div>
                ) : null}

                {gradeChartData && gradeChartData.testResults && gradeChartData.testResults.length > 0 ? (
                    <RecentGradesChart
                        testResults={gradeChartData.testResults}
                        availableCategories={gradeChartData.availableCategories || []}
                        defaultCategory={gradeChartData.defaultCategory}
                    />
                ) : null}

                {showFeed && feedTabs.length > 0 ? (
                    <div style={styles.tabsWrap}>
                        <nav
                            style={{
                                ...styles.tabs,
                                ...(isMobile ? {
                                    gap: 16,
                                    justifyContent: 'flex-start',
                                    paddingBottom: 16,
                                } : {}),
                            }}
                            className={isMobile ? 'student-mobile-scrollbar-hidden' : undefined}
                            aria-label="Dashboard feed filters"
                        >
                            {feedTabs.map(tab => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => onFilterChange?.(tab.key)}
                                    style={{
                                        ...styles.tab,
                                        ...(activeFilter === tab.key ? styles.tabActive : {}),
                                        ...(isMobile ? mobileStyles.touchTarget : {}),
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                ) : null}

            {showFeed ? (
                loading && feedRows.length === 0 ? (
                    <div style={styles.empty}>
                        <InlineLoader />
                        <p style={styles.emptyBody}>{loadingLabel}</p>
                    </div>
                ) : feedRows.length === 0 ? (
                    <div style={styles.empty}>
                        <div style={{ width: 60, height: 2, background: studentTokens.accentSoft }} />
                        <h3 style={styles.emptyTitle}>{emptyTitle}</h3>
                        <p style={styles.emptyBody}>{emptyBody}</p>
                        {onEmptyAction ? (
                            <button type="button" style={styles.emptyAction} onClick={() => onEmptyAction?.()}>
                                {emptyActionLabel}
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <div style={styles.feed}>
                        {feedRows.map(row => {
                            const tone = getNodeTone(row.kind);
                            return (
                                <article
                                    key={row.id}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => row.onPress?.()}
                                    onMouseEnter={event => {
                                        event.currentTarget.style.background = studentTokens.bgSurfaceMuted;
                                    }}
                                    onMouseLeave={event => {
                                        event.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <div style={styles.row}>
                                        <div style={styles.rail}>
                                            <div style={{ ...styles.node, background: tone.bg, color: tone.color }}>
                                                {tone.icon || tone.char}
                                            </div>
                                            <div style={styles.stem} />
                                        </div>

                                        <div style={styles.rowBody}>
                                            <div style={styles.meta}>
                                                <p style={styles.eyebrow}>{row.eyebrow || kindLabel(row.kind)}</p>
                                                <p style={styles.time}>{String(row.timeLabel || '').toUpperCase()}</p>
                                            </div>

                                            <h3 style={styles.rowTitle}>{stripEmoji(row.title)}</h3>

                                            {row.kind === 'tests' ? (
                                                row.scoreLabel ? (
                                                    <div style={styles.scoreRow}>
                                                        <span style={styles.score}>{row.scoreLabel}</span>
                                                        <div style={styles.divider} />
                                                        <p style={styles.body}>{row.body}</p>
                                                    </div>
                                                ) : (
                                                    <p style={styles.body}>{row.body}</p>
                                                )
                                            ) : row.kind === 'homework' ? (
                                                <div
                                                    style={{
                                                        ...styles.inset,
                                                        ...(isMobile ? { padding: '12px 12px 16px' } : {}),
                                                    }}
                                                >
                                                    <p style={styles.quote}>{row.body}</p>
                                                    {row.tags?.length ? (
                                                        <p style={{ ...styles.body, margin: 0, fontSize: '0.6875rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: studentTokens.textMuted }}>
                                                            {row.tags.join(' - ')}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <>
                                                    <p style={styles.body}>{row.body}</p>
                                                    {row.actionLabel || row.onAction ? (
                                                        <button
                                                            type="button"
                                                            style={styles.linkBtn}
                                                            onClick={event => {
                                                                event.stopPropagation();
                                                                row.onAction?.();
                                                            }}
                                                        >
                                                            <span>{row.actionLabel || getFallbackAction(row.kind)}</span>
                                                            <ArrowIcon />
                                                        </button>
                                                    ) : null}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div style={styles.feedSeparator} />
                                </article>
                            );
                        })}
                    </div>
                )
            ) : null}

            {showClasses ? (
                <div style={{ paddingBottom: 24 }}>
                    <p style={styles.summaryLabel}>Class Directory</p>
                    {loading ? (
                        <div style={styles.empty}>
                            <InlineLoader size={24} />
                            <p style={styles.emptyBody}>Loading your classes...</p>
                        </div>
                    ) : classItems.length === 0 ? (
                        <div style={styles.empty}>
                            <h3 style={styles.emptyTitle}>No classes yet.</h3>
                            <p style={styles.emptyBody}>Join a class to see its roster, sessions, and assigned work.</p>
                            {onJoinClass ? (
                                <button type="button" style={styles.emptyAction} onClick={() => onJoinClass?.()}>
                                    Join a Class
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <div style={styles.classGrid}>
                            {classItems.map((cls, index) => {
                                const palette = CLASS_COLORS[index % CLASS_COLORS.length];
                                return (
                                    <div
                                        key={cls.id}
                                        style={styles.classCard}
                                        onClick={() => (cls.onPress ? cls.onPress() : onClassSelect?.(cls))}
                                        onMouseEnter={event => {
                                            event.currentTarget.style.background = studentTokens.bgSurfaceMuted;
                                        }}
                                        onMouseLeave={event => {
                                            event.currentTarget.style.background = studentTokens.bgSurface;
                                        }}
                                    >
                                        <div style={{ ...styles.classBadge, background: palette.bg, color: palette.color }}>
                                            {cls.badge || cls.classCode?.slice(0, 2) || 'CL'}
                                        </div>
                                        <p style={styles.classTitle}>{cls.title}</p>
                                        <p style={styles.classMeta}>{cls.meta}</p>
                                        <p style={styles.classMeta}>{cls.countLabel}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : null}

                {showFeed && hasMore ? (
                <div style={styles.loadMoreWrap}>
                    <button type="button" style={styles.loadMoreButton} onClick={() => onLoadMore?.()} disabled={loadingMore}>
                        {loadingMore ? 'Loading...' : 'Load More Activities'}
                    </button>
                </div>
                ) : null}
            </section>
        </>
    );
}
