/**
 * PendingReviewsWidget — Student Dashboard Widget
 * PRD-0030 Phase 8: Notifications & Academic Record
 *
 * Shows pending writing submissions awaiting teacher review.
 * Max 5 items; "See all" link if more. Hidden (returns null) if empty.
 *
 * NO MANTINE — native HTML/CSS only.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { firestore as db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';

// ── Types ──────────────────────────────────────────────────
interface PendingItem {
    id: string;
    testTitle: string;
    submittedAt: number;
    contextType: string;
}

// ── Styles ──────────────────────────────────────────────────
const s = {
    widget: {
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 18px',
        borderBottom: '1px solid #f3f4f6',
    },
    title: {
        fontSize: '0.9375rem',
        fontWeight: 700 as const,
        color: '#111827',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    count: {
        background: '#fef3c7',
        color: '#d97706',
        fontSize: '0.75rem',
        fontWeight: 700 as const,
        padding: '2px 8px',
        borderRadius: 999,
    },
    list: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
    },
    item: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 18px',
        borderBottom: '1px solid #f9fafb',
        transition: 'background 0.12s ease',
    },
    itemTitle: {
        fontSize: '0.875rem',
        fontWeight: 600 as const,
        color: '#111827',
        margin: 0,
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden' as const,
        textOverflow: 'ellipsis' as const,
        maxWidth: 200,
    },
    itemMeta: {
        fontSize: '0.75rem',
        color: '#6b7280',
        marginTop: 2,
    },
    sourceBadge: {
        fontSize: '0.6875rem',
        fontWeight: 600 as const,
        padding: '2px 8px',
        borderRadius: 999,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.03em',
        flexShrink: 0,
    },
    seeAllBtn: {
        display: 'block',
        width: '100%',
        padding: '10px',
        border: 'none',
        background: '#f9fafb',
        color: '#4f46e5',
        fontSize: '0.8125rem',
        fontWeight: 600 as const,
        cursor: 'pointer',
        textAlign: 'center' as const,
        fontFamily: 'inherit',
        transition: 'background 0.15s ease',
    },
};

function getSourceStyle(type: string): { bg: string; text: string; label: string } {
    switch (type) {
        case 'homework':
            return { bg: '#e0e7ff', text: '#4338ca', label: 'Homework' };
        case 'solo-practice':
            return { bg: '#f5f3ff', text: '#7c3aed', label: 'Solo' };
        case 'class-session':
        case 'live':
            return { bg: '#dbeafe', text: '#2563eb', label: 'Live' };
        default:
            return { bg: '#f3f4f6', text: '#6b7280', label: type || 'Practice' };
    }
}

// ── Component ──────────────────────────────────────────────
export function PendingReviewsWidget() {
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
                // Fetch up to 6 items (5 to show + 1 to check "see all")
                const q = query(
                    collection(db, 'writing_submissions'),
                    where('studentId', '==', user!.uid),
                    where('markingStatus', '==', 'pending-review'),
                    orderBy('submittedAt', 'desc'),
                    limit(6)
                );
                const snap = await getDocs(q);
                if (cancelled) return;

                const fetched: PendingItem[] = snap.docs.map(doc => {
                    const d = doc.data();
                    return {
                        id: doc.id,
                        testTitle: d.testMeta?.title || d.testMeta?.testId || 'Untitled',
                        submittedAt: d.submittedAt || d.createdAt || 0,
                        contextType: d.context?.type || 'solo-practice',
                    };
                });

                setTotalCount(fetched.length);
                setItems(fetched.slice(0, 5));
            } catch (err) {
                console.error('[PendingReviewsWidget] Error:', err);
            } finally {
                if (!cancelled) setLoaded(true);
            }
        }

        fetchPending();
        return () => { cancelled = true; };
    }, [user?.uid]);

    // AC #2: Hidden when no pending
    if (!loaded || items.length === 0) return null;

    return (
        <div style={s.widget}>
            <div style={s.header}>
                <h3 style={s.title}>
                    ✍️ Pending Reviews
                    <span style={s.count}>{totalCount > 5 ? '5+' : items.length}</span>
                </h3>
            </div>

            <ul style={s.list}>
                {items.map(item => {
                    const src = getSourceStyle(item.contextType);
                    return (
                        <li
                            key={item.id}
                            style={s.item}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h4 style={s.itemTitle}>{item.testTitle}</h4>
                                <div style={s.itemMeta}>
                                    {new Date(item.submittedAt).toLocaleDateString(undefined, {
                                        month: 'short', day: 'numeric',
                                    })}
                                </div>
                            </div>
                            <span style={{ ...s.sourceBadge, background: src.bg, color: src.text }}>
                                {src.label}
                            </span>
                        </li>
                    );
                })}
            </ul>

            {/* AC #3: See all link if > 5 */}
            {totalCount > 5 && (
                <button
                    style={s.seeAllBtn}
                    onClick={() => navigate('/student/academic-record', { state: { tab: 'writing' } })}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#f9fafb')}
                >
                    See all pending reviews →
                </button>
            )}
        </div>
    );
}

export default PendingReviewsWidget;
