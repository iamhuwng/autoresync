/**
 * PendingReviewsWidget - Student Dashboard Widget
 * PRD-0030 Phase 8: Notifications & Academic Record
 *
 * Shows pending writing submissions awaiting teacher review.
 * Max 5 items; "See all" link if more. Hidden (returns null) if empty.
 *
 * Redesigned to match the editorial right-rail style (UP NEXT / MY CLASSES sections).
 */
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { firestore as db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { studentTokens } from '../layout/studentLayoutStyles';

interface PendingItem {
    id: string;
    testTitle: string;
    submittedAt: number;
    contextType: string;
}

/* ── Source type visuals ── */
function getSourceStyle(type: string): { bg: string; text: string; label: string; icon: string } {
    switch (type) {
        case 'homework':
            return { bg: '#ece9ff', text: studentTokens.accentHover, label: 'Homework', icon: '📝' };
        case 'solo-practice':
            return { bg: studentTokens.bgSurfaceAlt, text: studentTokens.textBody, label: 'Solo', icon: '✏️' };
        case 'class-session':
        case 'class_session':
        case 'live-session':
        case 'live':
            return { bg: '#edf5f9', text: '#4c5458', label: 'Live', icon: '🎯' };
        default:
            return { bg: studentTokens.bgSurfaceAlt, text: studentTokens.textBody, label: type || 'Practice', icon: '✏️' };
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

/* ── Styles ── */
const s: Record<string, CSSProperties> = {
    /* Section container — matches UP NEXT / MY CLASSES open layout */
    section: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    /* Header row: title + count */
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
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
    countBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 20,
        height: 20,
        padding: '0 6px',
        borderRadius: studentTokens.radiusPill,
        background: studentTokens.accentSoft,
        color: studentTokens.accentHover,
        fontSize: '0.625rem',
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
    },

    /* Item list */
    list: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },

    /* Individual item row */
    item: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
    },

    /* Left indicator — colored dot with icon */
    indicator: {
        width: 32,
        height: 32,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '0.8rem',
    },

    /* Item content area */
    itemContent: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    itemTitle: {
        margin: 0,
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.35,
        color: studentTokens.textPrimary,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    itemMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        margin: 0,
    },
    itemMetaText: {
        margin: 0,
        fontSize: '0.625rem',
        lineHeight: 1.4,
        color: studentTokens.textMuted,
    },
    itemSourcePill: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: studentTokens.radiusPill,
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        lineHeight: 1.6,
    },

    /* Status dot — pulsing amber for "awaiting review" */
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: '#d4a843',
        flexShrink: 0,
    },

    /* See all link */
    seeAll: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
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
        borderRadius: 4,
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
            <div style={s.header}>
                <h3 style={s.sectionTitle}>Pending Reviews</h3>
                <span style={s.countBadge}>{totalCount > 5 ? '5+' : items.length}</span>
            </div>

            {/* Item list */}
            <ul style={s.list}>
                {items.map((item) => {
                    const source = getSourceStyle(item.contextType);
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
                            onClick={() => navigate(`/student/writing/${item.id}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    navigate(`/student/writing/${item.id}`);
                                }
                            }}
                        >
                            {/* Left icon block */}
                            <div
                                style={{
                                    ...s.indicator,
                                    background: source.bg,
                                }}
                            >
                                {source.icon}
                            </div>

                            {/* Content */}
                            <div style={s.itemContent}>
                                <p style={s.itemTitle} title={item.testTitle}>
                                    {item.testTitle}
                                </p>
                                <div style={s.itemMeta}>
                                    <span style={s.statusDot} title="Awaiting review" />
                                    <span style={s.itemMetaText}>{timeAgo(item.submittedAt)}</span>
                                    <span
                                        style={{
                                            ...s.itemSourcePill,
                                            background: source.bg,
                                            color: source.text,
                                        }}
                                    >
                                        {source.label}
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
                        event.currentTarget.style.background = studentTokens.bgSurfaceAlt;
                    }}
                    onMouseLeave={(event) => {
                        event.currentTarget.style.color = studentTokens.accent;
                        event.currentTarget.style.background = 'transparent';
                    }}
                >
                    See all reviews →
                </button>
            )}
        </section>
    );
}

export default PendingReviewsWidget;
