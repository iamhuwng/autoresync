import React, { useMemo, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconInbox } from '@tabler/icons-react';
import { AcademicRecordFlatRow, formatAcademicRecordDate } from './AcademicRecordResultRow';
import type { EnhancedTestResultRecord } from '../../types/results.types';
import { studentTokens } from '../layout/studentLayoutStyles';

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
        display: 'flex',
        gap: 16,
    },
    summaryCard: {
        background: '#ffffff',
        borderRadius: 0,
        padding: '20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: 1,
        minWidth: 0,
    },
    summaryLabel: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
    },
    summaryValueRow: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    summaryValue: {
        margin: 0,
        fontSize: '1.75rem',
        fontWeight: 800,
        color: studentTokens.textPrimary,
        lineHeight: 1.15,
    },
    summaryHint: {
        margin: 0,
        fontSize: '0.6875rem',
        fontWeight: 500,
        lineHeight: 1.4,
        color: studentTokens.textMuted,
        marginTop: 2,
    },
    groupHeader: {
        width: '100%',
        border: 'none',
        borderBottom: `1px solid rgba(171, 179, 183, 0.1)`,
        borderRadius: 0,
        padding: '0 0 14px',
        background: 'transparent',
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
        color: studentTokens.textMuted,
        flexShrink: 0,
        marginTop: 2,
    },
    leadingBadge: {
        minWidth: 0,
        height: 'auto',
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 8px',
        fontSize: '0.6875rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        flexShrink: 0,
        background: studentTokens.bgShell,
    },
    groupTitleWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
    },
    groupTitle: {
        margin: 0,
        color: studentTokens.textPrimary,
        fontSize: '0.875rem',
        fontWeight: 700,
    },
    groupMeta: {
        margin: 0,
        color: studentTokens.textMuted,
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
        gap: '0.5rem',
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
        color: studentTokens.textPrimary,
    },
    emptyBody: {
        margin: 0,
        fontSize: '0.875rem',
        color: studentTokens.textMuted,
        textAlign: 'center',
        maxWidth: 400,
    },
};

const summaryCardVisuals = [
    { labelColor: studentTokens.textMuted, valueColor: studentTokens.textPrimary },
    { labelColor: studentTokens.textMuted, valueColor: studentTokens.accent },
    { labelColor: studentTokens.textMuted, valueColor: '#4c5458' },
    { labelColor: studentTokens.textMuted, valueColor: '#9a6427' },
] as const;

const courseVisuals = [
    { accent: studentTokens.accentHover, accentSoft: studentTokens.accentSoft },
    { accent: '#4c5458', accentSoft: '#edf5f9' },
    { accent: '#586064', accentSoft: '#dce4e8' },
    { accent: '#9a6427', accentSoft: '#f4ede4' },
] as const;

function formatLabel(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    return value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCourseBadge(courseName: string | null): string {
    const words = (courseName || 'Uncategorized')
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 1) {
        return (words[0] || 'UN').slice(0, 2).toUpperCase();
    }

    return words
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() || '')
        .join('');
}

function getResultLeadingTone(result: EnhancedTestResultRecord): 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted' {
    if (result.markingStatus === 'pending-review') {
        return 'warning';
    }

    if (result.thcsData) {
        return 'muted';
    }

    if (result.percentage >= 80) return 'success';
    if (result.percentage >= 65) return 'primary';
    if (result.percentage >= 50) return 'warning';
    return 'danger';
}

function getResultStatusLabel(result: EnhancedTestResultRecord): string {
    if (result.markingStatus === 'pending-review') {
        return 'Awaiting review';
    }

    if (result.overallFeedback || result.questionResults?.some((question) => question.teacherFeedback)) {
        return 'Feedback';
    }

    return 'Completed';
}

function buildCourseRow(
    result: EnhancedTestResultRecord,
    onResultClick?: (resultId: string) => void,
) {
    const leadingTone = getResultLeadingTone(result);
    const leadingText = (formatLabel(result.testSkill || result.testType) || 'RT').slice(0, 2).toUpperCase();
    const metaItems = [
        formatAcademicRecordDate(result.submittedAt),
        formatLabel(result.testSkill || result.testType),
        result.attemptSummary?.totalAttempts && result.attemptSummary.totalAttempts > 1
            ? `Attempt ${result.attemptSummary.attemptNumber}/${result.attemptSummary.totalAttempts}`
            : null,
    ].filter((item): item is string => Boolean(item));

    return (
        <AcademicRecordFlatRow
            key={result.resultId}
            title={result.testTitle}
            metaItems={metaItems}
            leadingText={leadingText}
            leadingTone={leadingTone}
            trailingPrimary={`${Math.round(result.percentage)}%`}
            trailingSecondary={getResultStatusLabel(result)}
            trailingTone={leadingTone}
            onClick={onResultClick ? () => onResultClick(result.resultId) : undefined}
            ariaLabel={onResultClick ? `Open result for ${result.testTitle}` : undefined}
        />
    );
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
                <IconInbox size={52} style={{ color: studentTokens.textDim }} />
                <p style={styles.emptyHeading}>No course results found</p>
                <p style={styles.emptyBody}>Your latest results will appear here grouped by course.</p>
            </div>
        );
    }

    return (
        <div style={styles.stack}>
            <div style={styles.summaryGrid}>
                <div style={styles.summaryCard}>
                    <p style={{ ...styles.summaryLabel, color: summaryCardVisuals[0].labelColor }}>Courses</p>
                    <div style={styles.summaryValueRow}>
                        <span style={{ ...styles.summaryValue, color: summaryCardVisuals[0].valueColor }}>{courseSummary.totalCourses}</span>
                        <span style={styles.summaryHint}>Enrolled courses with results</span>
                    </div>
                </div>
                <div style={styles.summaryCard}>
                    <p style={{ ...styles.summaryLabel, color: summaryCardVisuals[1].labelColor }}>Latest Results</p>
                    <div style={styles.summaryValueRow}>
                        <span style={{ ...styles.summaryValue, color: summaryCardVisuals[1].valueColor }}>{courseSummary.totalResults}</span>
                        <span style={styles.summaryHint}>Total tests across all courses</span>
                    </div>
                </div>
                <div style={styles.summaryCard}>
                    <p style={{ ...styles.summaryLabel, color: summaryCardVisuals[2].labelColor }}>Average Score</p>
                    <div style={styles.summaryValueRow}>
                        <span style={{ ...styles.summaryValue, color: summaryCardVisuals[2].valueColor }}>{Math.round(courseSummary.averageScore)}<span style={{ fontSize: '0.875rem', fontWeight: 600, opacity: 0.55 }}>%</span></span>
                        <span style={styles.summaryHint}>Mean of graded results</span>
                    </div>
                </div>
                <div style={styles.summaryCard}>
                    <p style={{ ...styles.summaryLabel, color: summaryCardVisuals[3].labelColor }}>Strongest Course</p>
                    <div style={styles.summaryValueRow}>
                        <span style={{ ...styles.summaryValue, color: summaryCardVisuals[3].valueColor, fontSize: '1.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {courseSummary.strongestCourse?.courseName || '—'}
                        </span>
                        <span style={styles.summaryHint}>{courseSummary.strongestCourse ? 'Highest average performance' : 'Not enough data'}</span>
                    </div>
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
                    const visual = courseVisuals[index % courseVisuals.length] ?? courseVisuals[0];

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
                                    borderColor: studentTokens.borderWhisper,
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
                                    {group.results.map((result) => buildCourseRow(result, onResultClick))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

        </div>
    );
};
