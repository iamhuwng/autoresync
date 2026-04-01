/**
 * PendingReviewsWidget - Student Dashboard Widget
 * v2 Editorial Academic Standard — "Upcoming" dot-list format
 *
 * Shows pending writing submissions awaiting teacher review.
 * Max 5 items; "See all" link if more. Hidden (returns null) if empty.
 *
 * Uses the v2 "Upcoming" format: warning dot + title + right-aligned time label
 * inside a flat white card container.
 */
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { firestore as db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { studentTokens } from '../layout/studentLayoutStyles';

interface PendingReviewsWidgetProps {
    /** Called when a pending item is clicked — parent opens the result slide panel in-place */
    onResultSelect?: (resultId: string) => void;
}

interface PendingItem {
    id: string;
    testTitle: string;
    submittedAt: number;
    contextType: string;
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

/* ── Time label helper — short format for right-aligned label ── */
function formatTimeLabel(ts: number): string {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── v2 Editorial Styles — "Upcoming" format ── */
const s: Record<string, CSSProperties> = {
    /* White card container — exact mockup tokens */
    card: {
        background: '#ffffff',
        padding: 20,
        borderRadius: 2,
        border: '1px solid rgba(171,179,183,0.05)',
    },
    /* Card sub-label */
    cardLabel: {
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        color: '#737c7f',
        display: 'block',
        marginBottom: 12,
    },
    /* Upcoming list container */
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        listStyle: 'none',
        margin: 0,
        padding: 0,
    },
    /* Upcoming item row */
    item: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        padding: '2px 0',
        transition: 'opacity 0.15s',
    },
    /* Urgency dot — 6px warning (amber) */
    dot: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: '#d4a843',
        flexShrink: 0,
    },
    /* Title — truncated */
    title: {
        fontSize: 12,
        fontWeight: 500,
        color: '#2b3437',
        flex: 1,
        minWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    /* Right-aligned time label */
    time: {
        fontSize: 10,
        color: '#abb3b7',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
    },
    /* See all link */
    seeAll: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 0 0',
        margin: 0,
        border: 'none',
        background: 'transparent',
        color: studentTokens.accent,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'color 0.15s ease',
    },
    emptyState: {
        fontSize: 11,
        color: '#737c7f',
        margin: 0,
        padding: '2px 0',
    },
};

export function PendingReviewsWidget({ onResultSelect }: PendingReviewsWidgetProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState<PendingItem[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!user?.uid) return;
        let cancelled = false;

        async function fetchPending() {
            try {
                const pendingQuery = query(
                    collection(db, 'writing_submissions'),
                    where('studentId', '==', user!.uid),
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
        <div style={s.card}>
            <span style={s.cardLabel}>Pending Reviews</span>
            <ul style={s.list}>
                {items.map((item) => (
                    <li
                        key={item.id}
                        style={s.item}
                        onClick={() => onResultSelect?.(item.id)}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onResultSelect?.(item.id);
                            }
                        }}
                    >
                        <span style={s.dot} />
                        <span style={s.title}>{item.testTitle}</span>
                        <span style={s.time}>{formatTimeLabel(item.submittedAt)}</span>
                    </li>
                ))}
            </ul>

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
        </div>
    );
}

export default PendingReviewsWidget;
