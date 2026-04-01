/**
 * PendingReviewsWidget - Student Dashboard Widget
 * PRD-0030 Phase 8: Notifications & Academic Record
 *
 * Shows pending writing submissions awaiting teacher review.
 * Max 5 items; "See all" link if more. Hidden (returns null) if empty.
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

const s = {
    widget: {
        background: studentTokens.bgSurface,
        borderRadius: 12,
        padding: 16,
        border: `1px solid ${studentTokens.borderWhisper}`,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
        minWidth: 0,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    titleBlock: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 4,
        minWidth: 0,
    },
    eyebrow: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 800 as const,
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        color: studentTokens.textMuted,
        lineHeight: 1.2,
    },
    title: {
        margin: 0,
        fontSize: '0.8125rem',
        fontWeight: 600 as const,
        lineHeight: 1.3,
        color: studentTokens.textPrimary,
    },
    count: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 30,
        height: 22,
        padding: '0 8px',
        borderRadius: studentTokens.radiusPill,
        background: studentTokens.accentSoft,
        color: studentTokens.accentHover,
        fontSize: '0.625rem',
        fontWeight: 700 as const,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        flexShrink: 0,
    },
    list: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
    },
    itemShell: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
    },
    item: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        padding: 0,
        border: 'none',
        background: 'transparent',
        borderRadius: 0,
    },
    itemMain: {
        flex: 1,
        minWidth: 0,
    },
    itemTitle: {
        margin: 0,
        fontSize: '0.8125rem',
        fontWeight: 600 as const,
        lineHeight: 1.3,
        color: studentTokens.textPrimary,
        wordBreak: 'break-word' as const,
    },
    itemMeta: {
        marginTop: 4,
        fontSize: '0.6875rem',
        lineHeight: 1.45,
        color: studentTokens.textBody,
    },
    sourceBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 8px',
        borderRadius: studentTokens.radiusPill,
        fontSize: '0.625rem',
        fontWeight: 700 as const,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        whiteSpace: 'nowrap' as const,
        flexShrink: 0,
    },
    divider: {
        height: 1,
        background: studentTokens.borderWhisper,
    },
    seeAllBtn: {
        alignSelf: 'flex-start',
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: studentTokens.accent,
        fontSize: '0.625rem',
        fontWeight: 700 as const,
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        textAlign: 'left' as const,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'color 0.15s ease',
    },
} satisfies Record<string, CSSProperties>;

function getSourceStyle(type: string): { bg: string; text: string; label: string } {
    switch (type) {
        case 'homework':
            return { bg: '#ece9ff', text: studentTokens.accentHover, label: 'Homework' };
        case 'solo-practice':
            return { bg: studentTokens.bgSurfaceAlt, text: studentTokens.textBody, label: 'Solo' };
        case 'class-session':
        case 'class_session':
        case 'live-session':
        case 'live':
            return { bg: '#edf5f9', text: '#4c5458', label: 'Live' };
        default:
            return { bg: studentTokens.bgSurfaceAlt, text: studentTokens.textBody, label: type || 'Practice' };
    }
}

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
        <div style={s.widget}>
            <div style={s.header}>
                <div style={s.titleBlock}>
                    <p style={s.eyebrow}>Writing Queue</p>
                    <h3 style={s.title}>Pending Reviews</h3>
                </div>
                <span style={s.count}>{totalCount > 5 ? '5+' : items.length}</span>
            </div>

            <ul style={s.list}>
                {items.map((item, index) => {
                    const sourceStyle = getSourceStyle(item.contextType);
                    return (
                        <li key={item.id} style={s.itemShell}>
                            <div style={s.item}>
                                <div style={s.itemMain}>
                                    <h4 style={s.itemTitle}>{item.testTitle}</h4>
                                    <div style={s.itemMeta}>
                                        {new Date(item.submittedAt).toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                        })}
                                    </div>
                                </div>
                                <span style={{ ...s.sourceBadge, background: sourceStyle.bg, color: sourceStyle.text }}>
                                    {sourceStyle.label}
                                </span>
                            </div>
                            {index < items.length - 1 ? <div style={s.divider} /> : null}
                        </li>
                    );
                })}
            </ul>

            {totalCount > 5 && (
                <button
                    style={s.seeAllBtn}
                    onClick={() => navigate('/student/academic-record', { state: { tab: 'writing' } })}
                    onMouseEnter={(event) => {
                        event.currentTarget.style.color = studentTokens.accentHover;
                    }}
                    onMouseLeave={(event) => {
                        event.currentTarget.style.color = studentTokens.accent;
                    }}
                >
                    See all pending reviews
                </button>
            )}
        </div>
    );
}

export default PendingReviewsWidget;
