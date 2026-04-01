/**
 * PendingReviewsWidget - Student Dashboard Widget
 * PRD-0030 Phase 8: Notifications & Academic Record
 *
 * Shows pending writing submissions awaiting teacher review.
 * Max 5 items; "See all" link if more. Hidden (returns null) if empty.
 *
 * Redesigned to align with the editorial right-rail style (UP NEXT / MY CLASSES sections).
 * Uses date badges, lowercase pills with SVG icons, and marquee hover for long titles.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { firestore as db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { buildRoute } from '../../constants/routes';
import { S, studentTokens } from '../layout/studentLayoutStyles';

interface PendingItem {
    id: string;
    testTitle: string;
    submittedAt: number;
    contextType: string;
}

/* ── Source type visuals (aligned with Up Next pill style) ── */
function getSourceIcon(type: string): ReactNode {
    if (type === 'homework') {
        return (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm1 3v1h6V4H5zm0 3v1h6V7H5zm0 3v1h4v-1H5z" />
            </svg>
        );
    }
    if (['class-session', 'class_session', 'live-session', 'live'].includes(type)) {
        return (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm0 2a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2z" />
            </svg>
        );
    }
    return (
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.1 1.3a1 1 0 011.4 0l1.2 1.2a1 1 0 010 1.4L5.8 12.8l-3.5.9.9-3.5L12.1 1.3z" />
        </svg>
    );
}

function getSourceStyle(type: string): { label: string; pillBg: string; pillColor: string } {
    switch (type) {
        case 'homework':
            return { label: 'homework', pillBg: '#eee8ff', pillColor: '#5b47c9' };
        case 'solo-practice':
            return { label: 'solo practice', pillBg: studentTokens.bgSurfaceAlt, pillColor: studentTokens.textBody };
        case 'class-session':
        case 'class_session':
        case 'live-session':
        case 'live':
            return { label: 'live', pillBg: '#edf5f9', pillColor: '#4c5458' };
        default:
            return { label: type || 'practice', pillBg: studentTokens.bgSurfaceAlt, pillColor: studentTokens.textBody };
    }
}

/* ── Title resolution ── */
function resolvePendingTitle(data: Record<string, any>): string {
    const testTitle =
        data.testMeta?.testTitle ||
        data.testMeta?.title ||
        data.homeworkTitle ||
        data.materialTitle ||
        data.context?.homeworkTitle ||
        data.context?.className ||
        data.context?.courseName;

    if (typeof testTitle === 'string' && testTitle.trim()) {
        return testTitle.trim();
    }

    const firstPrompt = data.tasks?.find?.((task: Record<string, any>) => typeof task?.promptText === 'string' && task.promptText.trim());
    if (firstPrompt?.promptText) {
        return firstPrompt.promptText.trim().slice(0, 80);
    }

    return 'Writing submission';
}

/* ── Time-ago helper ── */
function timeAgo(ts: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ── Date badge helper ── */
function formatSubmittedBadge(ts: number): { month: string; day: string } | null {
    if (!ts) return null;
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return null;
    return {
        month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        day: date.toLocaleDateString('en-US', { day: 'numeric' }),
    };
}

/* ── Styles (aligned with StudentRightRail's Up Next section) ── */
const s: Record<string, CSSProperties> = {
    section: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
    },
    list: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    item: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '4px 4px',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
    },
    dateBadge: {
        width: 42,
        height: 42,
        borderRadius: studentTokens.radiusSoft,
        background: studentTokens.bgSurface,
        border: `1px solid ${studentTokens.borderWhisper}`,
        boxShadow: '0 1px 2px rgba(43, 52, 55, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    dateMonth: {
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
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
    itemContent: {
        flex: 1,
        minWidth: 0,
    },
    itemTitle: {
        fontWeight: 400,
        fontSize: '0.875rem',
        color: studentTokens.textPrimary,
        margin: '0 0 2px',
        maxWidth: '100%',
        cursor: 'default',
    },
    pillRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 4,
    },
    pillBase: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: '0.625rem',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        letterSpacing: '0.02em',
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
    },
    pillStatus: {
        background: '#fef7e8',
        color: '#9a6427',
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: '#d4a843',
        display: 'inline-block',
        flexShrink: 0,
    },
    seeAll: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 0',
        margin: 0,
        border: 'none',
        background: 'transparent',
        color: studentTokens.accent,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'color 0.15s ease',
    },
};

export function PendingReviewsWidget() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState<PendingItem[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.uid) return;
        let cancelled = false;

        async function fetchPending() {
            try {
                const pendingQuery = query(
                    collection(db, 'writing_submissions'),
                    where('studentId', '==', user.uid),
                    where('markingStatus', '==', 'pending-review'),
                    orderBy('submittedAt', 'desc'),
                    limit(6)
                );
                const snap = await getDocs(pendingQuery);
                if (cancelled) return;

                const fetched: PendingItem[] = snap.docs.map((doc) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        testTitle: resolvePendingTitle(data),
                        submittedAt: data.submittedAt || data.createdAt || 0,
                        contextType: data.context?.type || 'solo-practice',
                    };
                });

                setTotalCount(fetched.length);
                setItems(fetched.slice(0, 5));
            } catch (err) {
                console.error('[PendingReviewsWidget] Error:', err);
            } finally {
                if (!cancelled) {
                    setLoaded(true);
                }
            }
        }

        fetchPending();
        return () => {
            cancelled = true;
        };
    }, [user?.uid]);

    if (!loaded || items.length === 0) return null;

    return (
        <section style={s.section} aria-label="Pending writing reviews">
            {/* Header — matches UP NEXT / MY CLASSES section headers */}
            <h3 style={S.widgetTitle}>Pending Reviews</h3>

            {/* Item list */}
            <ul style={s.list}>
                {items.map((item) => {
                    const source = getSourceStyle(item.contextType);
                    const dateBadge = formatSubmittedBadge(item.submittedAt);
                    const isHovered = hoveredId === item.id;

                    return (
                        <li
                            key={item.id}
                            style={{
                                ...s.item,
                                background: isHovered ? studentTokens.bgSurfaceAlt : 'transparent',
                            }}
                            onMouseEnter={() => setHoveredId(item.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => navigate(buildRoute('RESULT_DETAIL', { resultId: item.id }))}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    navigate(buildRoute('RESULT_DETAIL', { resultId: item.id }));
                                }
                            }}
                        >
                            {/* Date badge — matches UP NEXT date badges */}
                            <div style={s.dateBadge}>
                                <span style={s.dateMonth}>{dateBadge?.month || 'NEW'}</span>
                                <span style={s.dateDay}>{dateBadge?.day || '—'}</span>
                            </div>

                            {/* Content */}
                            <div style={s.itemContent}>
                                <div className="rail-title-marquee" style={s.itemTitle}>
                                    <span className="rail-title-inner">{item.testTitle}</span>
                                </div>
                                <div style={s.pillRow}>
                                    <span style={{ ...s.pillBase, background: source.pillBg, color: source.pillColor }}>
                                        {getSourceIcon(item.contextType)}
                                        {source.label}
                                    </span>
                                    <span style={{ ...s.pillBase, ...s.pillStatus }}>
                                        <span style={s.statusDot} />
                                        Awaiting review
                                    </span>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>

            {/* See all link */}
            {totalCount > 5 && (
                <button
                    type="button"
                    style={s.seeAll}
                    onClick={() => navigate('/student/academic-record', { state: { tab: 'writing' } })}
                    onMouseEnter={(event) => {
                        event.currentTarget.style.color = studentTokens.accentHover;
                    }}
                    onMouseLeave={(event) => {
                        event.currentTarget.style.color = studentTokens.accent;
                    }}
                >
                    See all reviews →
                </button>
            )}
        </section>
    );
}

export default PendingReviewsWidget;
