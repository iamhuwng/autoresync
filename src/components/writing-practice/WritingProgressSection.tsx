/**
 * WritingProgressSection — Academic Record Writing Tab
 * PRD-0030 Phase 8: Notifications & Academic Record
 *
 * Displays the student's writing practice history:
 * - Band score trend chart (placeholder for now)
 * - List of writing submissions with status
 * - Average band score summary
 *
 * NO MANTINE — native HTML/CSS only.
 */
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { firestore as db } from '../../services/firebase';

// ── Types ──────────────────────────────────────────────────
interface WritingProgressSectionProps {
    studentId: string;
}

interface WritingResult {
    id: string;
    testTitle: string;
    submittedAt: number;
    status: 'pending' | 'graded' | 'reviewed';
    bandScore?: number;
    taskScores?: Array<{
        taskNumber: number;
        overallBand?: number;
    }>;
    contextType?: string;
    wordCount?: number;
}

// ── Styles ──────────────────────────────────────────────────
const styles = {
    container: { padding: 0 },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: '1.25rem',
        fontWeight: 700 as const,
        color: '#111827',
        margin: 0,
    },
    summaryRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 16,
        marginBottom: 24,
    },
    summaryCard: {
        background: '#f5f3ff',
        border: '1px solid #e9d5ff',
        borderRadius: 12,
        padding: '16px 20px',
        textAlign: 'center' as const,
    },
    summaryLabel: {
        fontSize: '0.75rem',
        fontWeight: 600 as const,
        color: '#7c3aed',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
    },
    summaryValue: {
        fontSize: '1.5rem',
        fontWeight: 800 as const,
        color: '#4c1d95',
        marginTop: 4,
    },
    list: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
    },
    item: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '14px 18px',
        transition: 'box-shadow 0.15s ease',
    },
    itemInfo: {
        flex: 1,
        minWidth: 0,
    },
    itemTitle: {
        fontSize: '0.9375rem',
        fontWeight: 600 as const,
        color: '#111827',
        margin: 0,
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden' as const,
        textOverflow: 'ellipsis' as const,
    },
    itemMeta: {
        fontSize: '0.8125rem',
        color: '#6b7280',
        marginTop: 4,
    },
    bandPill: {
        padding: '6px 14px',
        borderRadius: 999,
        fontWeight: 700 as const,
        fontSize: '0.875rem',
    },
    statusPill: {
        padding: '4px 10px',
        borderRadius: 999,
        fontWeight: 600 as const,
        fontSize: '0.75rem',
        textTransform: 'uppercase' as const,
    },
    empty: {
        textAlign: 'center' as const,
        padding: '64px 16px',
        color: '#6b7280',
    },
    spinner: {
        width: 32,
        height: 32,
        border: '3px solid #e2e8f0',
        borderTopColor: '#8b5cf6',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto',
    },
};

function getBandColor(band: number): { bg: string; text: string } {
    if (band >= 7) return { bg: '#d1fae5', text: '#059669' };
    if (band >= 6) return { bg: '#dbeafe', text: '#2563eb' };
    if (band >= 5) return { bg: '#fef3c7', text: '#d97706' };
    return { bg: '#fee2e2', text: '#dc2626' };
}

function getStatusStyle(status: string): { bg: string; text: string } {
    switch (status) {
        case 'graded':
        case 'reviewed':
            return { bg: '#d1fae5', text: '#059669' };
        case 'pending':
            return { bg: '#fef3c7', text: '#d97706' };
        default:
            return { bg: '#f3f4f6', text: '#6b7280' };
    }
}

// ── Component ──────────────────────────────────────────────
export default function WritingProgressSection({ studentId }: WritingProgressSectionProps) {
    const [results, setResults] = useState<WritingResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetchWritingResults() {
            try {
                const q = query(
                    collection(db, 'writing_submissions'),
                    where('studentId', '==', studentId),
                    orderBy('submittedAt', 'desc')
                );
                const snap = await getDocs(q);
                if (cancelled) return;

                const fetched: WritingResult[] = snap.docs.map(doc => {
                    const d = doc.data();
                    return {
                        id: doc.id,
                        testTitle: d.testMeta?.title || d.testMeta?.testId || 'Untitled',
                        submittedAt: d.submittedAt || d.createdAt || 0,
                        status: d.status || 'pending',
                        bandScore: d.gradingResult?.overallBand,
                        taskScores: d.tasks?.map((t: any) => ({
                            taskNumber: t.taskNumber,
                            overallBand: t.gradingResult?.overallBand,
                        })),
                        contextType: d.context?.type,
                        wordCount: d.tasks?.reduce((sum: number, t: any) => sum + (t.wordCount || 0), 0),
                    };
                });

                setResults(fetched);
            } catch (err) {
                console.error('[WritingProgressSection] Error fetching:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchWritingResults();
        return () => { cancelled = true; };
    }, [studentId]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 16px' }}>
                <div style={styles.spinner} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ color: '#6b7280', marginTop: 16 }}>Loading writing results...</p>
            </div>
        );
    }

    // Summary stats
    const graded = results.filter(r => r.bandScore !== undefined);
    const avgBand = graded.length > 0
        ? (graded.reduce((sum, r) => sum + (r.bandScore || 0), 0) / graded.length).toFixed(1)
        : '—';
    const pendingCount = results.filter(r => r.status === 'pending').length;
    const totalWords = results.reduce((sum, r) => sum + (r.wordCount || 0), 0);

    if (results.length === 0) {
        return (
            <div style={styles.empty}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✍️</div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
                    No Writing Results Yet
                </h3>
                <p style={{ margin: 0 }}>
                    Start a writing practice from the Library to see your progress here.
                </p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>✍️ Writing Progress</h2>
            </div>

            {/* Summary cards */}
            <div style={styles.summaryRow}>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Avg Band</div>
                    <div style={styles.summaryValue}>{avgBand}</div>
                </div>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Submissions</div>
                    <div style={styles.summaryValue}>{results.length}</div>
                </div>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Pending Review</div>
                    <div style={styles.summaryValue}>{pendingCount}</div>
                </div>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryLabel}>Total Words</div>
                    <div style={styles.summaryValue}>{totalWords.toLocaleString()}</div>
                </div>
            </div>

            {/* Results list */}
            <div style={styles.list}>
                {results.map(result => {
                    const bandColor = result.bandScore ? getBandColor(result.bandScore) : null;
                    const statusStyle = getStatusStyle(result.status);

                    return (
                        <div
                            key={result.id}
                            style={styles.item}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                        >
                            <div style={styles.itemInfo}>
                                <h4 style={styles.itemTitle}>{result.testTitle}</h4>
                                <div style={styles.itemMeta}>
                                    {new Date(result.submittedAt).toLocaleDateString(undefined, {
                                        month: 'short', day: 'numeric', year: 'numeric',
                                    })}
                                    {result.contextType && (
                                        <span style={{ marginLeft: 8 }}>
                                            • {result.contextType === 'homework' ? '📝 Homework' : '✍️ Practice'}
                                        </span>
                                    )}
                                    {result.wordCount ? (
                                        <span style={{ marginLeft: 8 }}>• {result.wordCount} words</span>
                                    ) : null}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                                {bandColor && result.bandScore !== undefined ? (
                                    <span style={{ ...styles.bandPill, background: bandColor.bg, color: bandColor.text }}>
                                        {result.bandScore.toFixed(1)}
                                    </span>
                                ) : (
                                    <span style={{ ...styles.statusPill, background: statusStyle.bg, color: statusStyle.text }}>
                                        {result.status}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
