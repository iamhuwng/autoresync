/**
 * WritingProgressSection - Academic Record Writing Tab
 * PRD-0030 Phase 8: Notifications & Academic Record
 *
 * Keeps Writing as a record-first surface with light summary panels
 * and flat result rows that match the Academic Record system.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { AcademicRecordFlatRow, formatAcademicRecordDate } from '../academicRecord/AcademicRecordResultRow';
import { firestore as db } from '../../services/firebase';

interface WritingProgressSectionProps {
    studentId: string;
    onResultClick?: (resultId: string) => void;
}

interface WritingResult {
    id: string;
    testTitle: string;
    submittedAt: number;
    status: 'pending' | 'graded';
    bandScore?: number;
    contextType?: string;
    wordCount?: number;
}

const styles: Record<string, React.CSSProperties> = {
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12,
        marginBottom: 20,
    },
    statCard: {
        background: '#f3f4f6',
        borderRadius: 14,
        padding: '16px 18px',
    },
    statLabel: {
        margin: 0,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#6b7280',
    },
    statValue: {
        margin: '8px 0 0',
        fontSize: '1.4rem',
        fontWeight: 800,
        color: '#111827',
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    empty: {
        textAlign: 'center',
        padding: '48px 16px',
        color: '#6b7280',
    },
    emptyHeading: {
        fontSize: '1.125rem',
        fontWeight: 700,
        color: '#111827',
        margin: '0 0 8px',
    },
    spinnerWrap: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '64px 16px',
    },
    spinner: {
        width: 32,
        height: 32,
        border: '3px solid #e5e7eb',
        borderTopColor: '#4f46e5',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    },
};

function getWritingTone(result: WritingResult): 'success' | 'primary' | 'warning' | 'muted' {
    if (result.status === 'pending' || result.bandScore === undefined) {
        return 'warning';
    }
    if (result.bandScore >= 7) {
        return 'success';
    }
    if (result.bandScore >= 6) {
        return 'primary';
    }
    return 'warning';
}

function formatContext(value?: string): string | null {
    if (!value) {
        return null;
    }
    if (value === 'homework') {
        return 'Homework';
    }
    if (value === 'practice') {
        return 'Practice';
    }
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function WritingProgressSection({ studentId, onResultClick }: WritingProgressSectionProps) {
    const [results, setResults] = useState<WritingResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function fetchWritingResults() {
            try {
                const writingQuery = query(
                    collection(db, 'writing_submissions'),
                    where('studentId', '==', studentId),
                    orderBy('submittedAt', 'desc'),
                );
                const snapshot = await getDocs(writingQuery);

                if (cancelled) {
                    return;
                }

                const fetched: WritingResult[] = snapshot.docs.map((doc) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        testTitle: data.testMeta?.testTitle || data.testMeta?.testId || 'Untitled',
                        submittedAt: data.submittedAt || data.createdAt || 0,
                        status: data.markingStatus === 'graded' ? 'graded' : 'pending',
                        bandScore: data.grading?.overallBand,
                        contextType: data.context?.type,
                        wordCount: data.tasks?.reduce((sum: number, task: any) => sum + (task.wordCount || 0), 0),
                    };
                });

                setResults(fetched);
            } catch (error) {
                console.error('[WritingProgressSection] Error fetching:', error);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchWritingResults();

        return () => {
            cancelled = true;
        };
    }, [studentId]);

    const gradedResults = useMemo(
        () => results.filter((result) => result.bandScore !== undefined),
        [results],
    );
    const avgBand = gradedResults.length > 0
        ? (gradedResults.reduce((sum, result) => sum + (result.bandScore || 0), 0) / gradedResults.length).toFixed(1)
        : '-';
    const pendingCount = results.filter((result) => result.status === 'pending').length;

    if (loading) {
        return (
            <div style={styles.spinnerWrap}>
                <div style={styles.spinner} />
                <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
                <p style={{ color: '#6b7280', marginTop: 16 }}>Loading writing results...</p>
            </div>
        );
    }

    if (results.length === 0) {
        return (
            <div style={styles.empty}>
                <h3 style={styles.emptyHeading}>No Writing Results Yet</h3>
                <p style={{ margin: 0 }}>
                    Start a writing practice from the Library to see your progress here.
                </p>
            </div>
        );
    }

    return (
        <div>
            <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                    <p style={styles.statLabel}>Average Band</p>
                    <p style={{ ...styles.statValue, color: '#4f46e5' }}>{avgBand}</p>
                </div>
                <div style={styles.statCard}>
                    <p style={styles.statLabel}>Submissions</p>
                    <p style={styles.statValue}>{results.length}</p>
                </div>
                <div style={styles.statCard}>
                    <p style={styles.statLabel}>Pending Review</p>
                    <p style={styles.statValue}>{pendingCount}</p>
                </div>
            </div>

            <div style={styles.list}>
                {results.map((result) => {
                    const metaItems = [
                        formatContext(result.contextType),
                        result.wordCount ? `${result.wordCount} words` : null,
                    ].filter((item): item is string => Boolean(item));

                    return (
                        <AcademicRecordFlatRow
                            key={result.id}
                            title={result.testTitle}
                            metaItems={[
                                formatAcademicRecordDate(result.submittedAt),
                                ...metaItems,
                            ]}
                            leadingText="WR"
                            leadingTone={result.status === 'graded' ? 'primary' : 'warning'}
                            trailingPrimary={result.bandScore !== undefined ? result.bandScore.toFixed(1) : 'Pending'}
                            trailingSecondary={result.bandScore !== undefined ? 'Band Score' : 'Awaiting Review'}
                            trailingTone={getWritingTone(result)}
                            onClick={onResultClick ? () => onResultClick(result.id) : undefined}
                            ariaLabel={onResultClick ? `Open writing result for ${result.testTitle}` : undefined}
                        />
                    );
                })}
            </div>
        </div>
    );
}
