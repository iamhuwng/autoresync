import React, { useMemo, useState } from 'react';
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
    latestSubmittedAt: number;
}

const styles: Record<string, React.CSSProperties> = {
    stack: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
    },
    summaryCard: {
        background: '#ffffff',
        borderRadius: 16,
        padding: '16px 18px',
        border: '1px solid #e5e7eb',
        borderTopWidth: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 108,
    },
    summaryLabel: {
        margin: 0,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#6b7280',
    },
    summaryValue: {
        margin: 0,
        fontSize: '1.45rem',
        fontWeight: 800,
        color: '#111827',
        lineHeight: 1.05,
    },
    summaryHint: {
        margin: 0,
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: '#6b7280',
    },
    groupHeader: {
        width: '100%',
        border: '1px solid transparent',
        borderRadius: 16,
        padding: '14px 16px',
        background: '#ffffff',
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
    leadingBadge: {
        minWidth: 38,
        height: 38,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.8125rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        flexShrink: 0,
        background: '#ffffff',
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
    groupsDivider: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
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
};

const summaryCardVisuals = [
    { borderTopColor: '#d1d5db', labelColor: '#6b7280', valueColor: '#111827' },
    { borderTopColor: '#d1d5db', labelColor: '#6b7280', valueColor: '#4338ca' },
    { borderTopColor: '#d1d5db', labelColor: '#6b7280', valueColor: '#047857' },
    { borderTopColor: '#d1d5db', labelColor: '#6b7280', valueColor: '#b45309' },
] as const;

const courseVisuals = [
    { accent: '#4338ca', accentSoft: '#e0e7ff' },
    { accent: '#1d4ed8', accentSoft: '#dbeafe' },
    { accent: '#047857', accentSoft: '#d1fae5' },
    { accent: '#b45309', accentSoft: '#fef3c7' },
] as const;

function formatAcademicRecordDate(timestamp: number): string {
    if (!timestamp) {
        return 'No recent activity';
    }

    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
}

function getCourseBadge(courseName: string | null): string {
    const words = (courseName || 'Uncategorized')
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return words
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() || '')
        .join('');
}

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
                    latestSubmittedAt: 0,
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
            group.latestSubmittedAt = group.results[0]?.submittedAt || 0;
        });

        return Array.from(groups.values()).sort((a, b) => {
            if (a.courseName === 'Uncategorized') return 1;
            if (b.courseName === 'Uncategorized') return -1;
            return (a.courseName || '').localeCompare(b.courseName || '');
        });
    }, [results]);

    const courseSummary = useMemo(() => {
        const scoredResults = results.filter((result) => !result.thcsData && result.markingStatus !== 'pending-review');
        const strongestCourse = [...courseGroups]
            .filter((group) => group.averageScore > 0)
            .sort((left, right) => right.averageScore - left.averageScore)[0] || null;

        return {
            totalCourses: courseGroups.length,
            totalResults: results.length,
            averageScore: scoredResults.length > 0
                ? scoredResults.reduce((sum, result) => sum + result.percentage, 0) / scoredResults.length
                : 0,
            strongestCourse,
        };
    }, [courseGroups, results]);

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
            <div style={styles.summaryGrid}>
                <div style={{ ...styles.summaryCard, borderTopColor: summaryCardVisuals[0].borderTopColor }}>
                    <p style={{ ...styles.summaryLabel, color: summaryCardVisuals[0].labelColor }}>Courses</p>
                    <p style={{ ...styles.summaryValue, color: summaryCardVisuals[0].valueColor }}>{courseSummary.totalCourses}</p>
                </div>
                <div style={{ ...styles.summaryCard, borderTopColor: summaryCardVisuals[1].borderTopColor }}>
                    <p style={{ ...styles.summaryLabel, color: summaryCardVisuals[1].labelColor }}>Latest Results</p>
                    <p style={{ ...styles.summaryValue, color: summaryCardVisuals[1].valueColor }}>{courseSummary.totalResults}</p>
                </div>
                <div style={{ ...styles.summaryCard, borderTopColor: summaryCardVisuals[2].borderTopColor }}>
                    <p style={{ ...styles.summaryLabel, color: summaryCardVisuals[2].labelColor }}>Average Score</p>
                    <p style={{ ...styles.summaryValue, color: summaryCardVisuals[2].valueColor }}>{Math.round(courseSummary.averageScore)}%</p>
                </div>
                <div style={{ ...styles.summaryCard, borderTopColor: summaryCardVisuals[3].borderTopColor }}>
                    <p style={{ ...styles.summaryLabel, color: summaryCardVisuals[3].labelColor }}>Strongest Course</p>
                    <p style={{ ...styles.summaryValue, color: summaryCardVisuals[3].valueColor, fontSize: '1.1rem' }}>
                        {courseSummary.strongestCourse?.courseName || 'Not enough data'}
                    </p>
                </div>
            </div>

            <div style={styles.groupsDivider}>
                {courseGroups.map((group, index) => {
                    const key = group.courseId || 'uncategorized';
                    const isExpanded = expandedCourses.has(key);
                    const headerMeta = [
                        `${group.totalTests} test${group.totalTests !== 1 ? 's' : ''}`,
                        group.averageScore > 0 ? `avg ${Math.round(group.averageScore)}%` : null,
                        `latest ${formatAcademicRecordDate(group.latestSubmittedAt)}`,
                    ].filter((item): item is string => Boolean(item)).join(' | ');
                    const visual = courseVisuals[index % courseVisuals.length];

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
                                style={{
                                    ...styles.groupHeader,
                                    borderColor: '#e5e7eb',
                                }}
                            >
                                <div style={styles.groupHeaderMain}>
                                    <span style={styles.chevron}>
                                        {isExpanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                                    </span>
                                    <span style={{ ...styles.leadingBadge, color: visual.accent }}>
                                        {getCourseBadge(group.courseName)}
                                    </span>
                                    <div style={styles.groupTitleWrap}>
                                        <p style={styles.groupTitle}>{group.courseName}</p>
                                        <p style={styles.groupMeta}>{headerMeta}</p>
                                    </div>
                                </div>
                                <span style={{ ...styles.groupSummary, color: visual.accent }}>
                                    {isExpanded ? 'Hide course' : 'Open course'}
                                </span>
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
            </div>

        </div>
    );
};
