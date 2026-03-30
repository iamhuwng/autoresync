import React, { useEffect, useMemo, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconInbox } from '@tabler/icons-react';
import { AcademicRecordResultRow } from './AcademicRecordResultRow';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultsByCourseProps {
    results: EnhancedTestResultRecord[];
    onResultClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
    showProgress?: boolean;
}

interface CourseGroup {
    courseId: string | null;
    courseName: string | null;
    results: EnhancedTestResultRecord[];
    averageScore: number;
    totalTests: number;
}

const styles: Record<string, React.CSSProperties> = {
    stack: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    groupHeader: {
        width: '100%',
        border: 'none',
        borderRadius: 14,
        padding: '14px 16px',
        background: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        textAlign: 'left',
        cursor: 'pointer',
    },
    groupHeaderMain: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        minWidth: 0,
        flex: 1,
    },
    chevron: {
        color: '#6b7280',
        flexShrink: 0,
        marginTop: 2,
    },
    groupTitleWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
    },
    groupTitle: {
        margin: 0,
        color: '#111827',
        fontSize: '0.95rem',
        fontWeight: 700,
    },
    groupMeta: {
        margin: 0,
        color: '#6b7280',
        fontSize: '0.75rem',
        lineHeight: 1.5,
    },
    groupSummary: {
        color: '#4f46e5',
        fontSize: '0.8125rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
    },
    groupRows: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        marginTop: '0.5rem',
    },
    emptyWrap: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '2rem 0',
    },
    emptyHeading: {
        margin: 0,
        fontSize: '1.125rem',
        fontWeight: 700,
        color: '#374151',
    },
    emptyBody: {
        margin: 0,
        fontSize: '0.875rem',
        color: '#6b7280',
        textAlign: 'center',
        maxWidth: 400,
    },
    summaryText: {
        margin: '0.5rem 0 0',
        fontSize: '0.75rem',
        color: '#6b7280',
        textAlign: 'center',
    },
};

export const ResultsByCourse: React.FC<ResultsByCourseProps> = ({
    results,
    onResultClick,
}) => {
    const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

    const courseGroups = useMemo(() => {
        const groups = new Map<string, CourseGroup>();

        results.forEach((result) => {
            const key = result.courseId || 'uncategorized';

            if (!groups.has(key)) {
                groups.set(key, {
                    courseId: result.courseId || null,
                    courseName: result.courseName || 'Uncategorized',
                    results: [],
                    averageScore: 0,
                    totalTests: 0,
                });
            }

            groups.get(key)!.results.push(result);
        });

        groups.forEach((group) => {
            group.totalTests = group.results.length;
            const scoredResults = group.results.filter((result) => !result.thcsData && result.markingStatus !== 'pending-review');
            const totalScore = scoredResults.reduce((sum, result) => sum + result.percentage, 0);
            group.averageScore = scoredResults.length > 0 ? totalScore / scoredResults.length : 0;
            group.results.sort((a, b) => b.submittedAt - a.submittedAt);
        });

        return Array.from(groups.values()).sort((a, b) => {
            if (a.courseName === 'Uncategorized') return 1;
            if (b.courseName === 'Uncategorized') return -1;
            return (a.courseName || '').localeCompare(b.courseName || '');
        });
    }, [results]);

    useEffect(() => {
        setExpandedCourses(new Set(courseGroups.map((group) => group.courseId || 'uncategorized')));
    }, [courseGroups]);

    if (results.length === 0) {
        return (
            <div style={styles.emptyWrap}>
                <IconInbox size={52} style={{ color: '#9ca3af' }} />
                <p style={styles.emptyHeading}>No course results found</p>
                <p style={styles.emptyBody}>Your latest results will appear here grouped by course.</p>
            </div>
        );
    }

    return (
        <div style={styles.stack}>
            {courseGroups.map((group) => {
                const key = group.courseId || 'uncategorized';
                const isExpanded = expandedCourses.has(key);
                const headerMeta = `${group.totalTests} test${group.totalTests !== 1 ? 's' : ''}${group.averageScore > 0 ? ` | avg ${Math.round(group.averageScore)}%` : ''}`;

                return (
                    <section key={key}>
                        <button
                            type="button"
                            onClick={() => {
                                setExpandedCourses((current) => {
                                    const next = new Set(current);
                                    if (next.has(key)) {
                                        next.delete(key);
                                    } else {
                                        next.add(key);
                                    }
                                    return next;
                                });
                            }}
                            aria-expanded={isExpanded}
                            style={styles.groupHeader}
                        >
                            <div style={styles.groupHeaderMain}>
                                <span style={styles.chevron}>
                                    {isExpanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                                </span>
                                <div style={styles.groupTitleWrap}>
                                    <p style={styles.groupTitle}>{group.courseName}</p>
                                    <p style={styles.groupMeta}>{headerMeta}</p>
                                </div>
                            </div>
                            <span style={styles.groupSummary}>Latest results</span>
                        </button>

                        {isExpanded && (
                            <div style={styles.groupRows}>
                                {group.results.map((result) => (
                                    <AcademicRecordResultRow
                                        key={result.resultId}
                                        result={result}
                                        onClick={onResultClick}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}

            <p style={styles.summaryText}>
                {courseGroups.length} course{courseGroups.length !== 1 ? 's' : ''} | {results.length} total result{results.length !== 1 ? 's' : ''}
            </p>
        </div>
    );
};
