import React, { useMemo, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconInbox } from '@tabler/icons-react';
import { AcademicRecordFlatRow, formatAcademicRecordDate } from './AcademicRecordResultRow';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultsBySkillProps {
    results: EnhancedTestResultRecord[];
    onResultClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

interface SkillBandSummary {
    skill: string;
    label: string;
    totalTests: number;
    averageBand: number | null;
    highestBand: number | null;
    pendingReviewCount: number;
}

interface SkillGroup {
    skill: string;
    label: string;
    results: EnhancedTestResultRecord[];
    summary: SkillBandSummary;
}

type RowTone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

interface SkillVisual {
    badge: string;
    leadingTone: RowTone;
    accent: string;
    accentSoft: string;
}

const skillOrder = ['reading', 'listening', 'writing', 'speaking'];

const defaultSkillVisual: SkillVisual = {
    badge: 'OT',
    leadingTone: 'muted',
    accent: '#4b5563',
    accentSoft: '#f3f4f6',
};

const skillVisuals: Record<string, SkillVisual> = {
    reading: {
        badge: 'RD',
        leadingTone: 'primary',
        accent: '#4338ca',
        accentSoft: '#e0e7ff',
    },
    listening: {
        badge: 'LS',
        leadingTone: 'default',
        accent: '#1d4ed8',
        accentSoft: '#dbeafe',
    },
    writing: {
        badge: 'WR',
        leadingTone: 'warning',
        accent: '#b45309',
        accentSoft: '#fef3c7',
    },
    speaking: {
        badge: 'SP',
        leadingTone: 'success',
        accent: '#047857',
        accentSoft: '#d1fae5',
    },
    other: defaultSkillVisual,
};

const styles: Record<string, React.CSSProperties> = {
    stack: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    summaryStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    prioritySummaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
    },
    skillSummaryGrid: {
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
        fontSize: '1.5rem',
        fontWeight: 800,
        color: '#111827',
        lineHeight: 1.05,
    },
    summaryHint: {
        margin: 0,
        fontSize: '0.75rem',
        color: '#6b7280',
        lineHeight: 1.5,
    },
    stackDivider: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    groupHeader: {
        width: '100%',
        border: '1px solid #e5e7eb',
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

const summaryCardVisuals = {
    neutral: { labelColor: '#6b7280', valueColor: '#111827' },
    primary: { labelColor: '#6b7280', valueColor: '#4338ca' },
    info: { labelColor: '#6b7280', valueColor: '#1d4ed8' },
    warning: { labelColor: '#6b7280', valueColor: '#b45309' },
    success: { labelColor: '#6b7280', valueColor: '#047857' },
} as const;

function formatSkillLabel(skill: string): string {
    return skill
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSkillVisual(skill: string): SkillVisual {
    return skillVisuals[skill] ?? defaultSkillVisual;
}

function getCourseContext(result: EnhancedTestResultRecord): string | null {
    const parts = [result.courseName, result.moduleName].filter(Boolean);
    if (parts.length > 0) {
        return parts.join(' / ');
    }

    return result.courseId === null ? 'Unassigned course' : null;
}

function getAttemptLabel(result: EnhancedTestResultRecord): string | null {
    if (!result.attemptSummary?.totalAttempts || result.attemptSummary.totalAttempts <= 1) {
        return null;
    }

    return `Attempt ${result.attemptSummary.attemptNumber}/${result.attemptSummary.totalAttempts}`;
}

function formatContextType(value?: string): string | null {
    if (!value) {
        return null;
    }

    if (value === 'homework') {
        return 'Homework';
    }
    if (value === 'solo_practice' || value === 'practice') {
        return 'Practice';
    }
    if (value === 'class_session') {
        return 'Class Session';
    }
    if (value === 'course_material') {
        return 'Course Material';
    }

    return value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getWritingWordCount(result: EnhancedTestResultRecord): number | null {
    const taskWordCount = result.writingData?.tasks?.reduce((sum, task) => sum + (task.wordCount || 0), 0);
    return taskWordCount || result.writingSubmission?.wordCount || null;
}

function isPendingWriting(result: EnhancedTestResultRecord): boolean {
    return String(result.testSkill || '').toLowerCase() === 'writing' && result.markingStatus === 'pending-review';
}

function getBandScore(result: EnhancedTestResultRecord): number | null {
    if (isPendingWriting(result)) {
        return null;
    }

    if (typeof result.writingData?.overallBand === 'number') {
        return result.writingData.overallBand;
    }

    return typeof result.bandScore === 'number' ? result.bandScore : null;
}

function formatBand(value: number | null): string {
    return value === null ? '-' : value.toFixed(1);
}

function getBandTone(value: number | null, fallback: RowTone = 'default'): RowTone {
    if (value === null) {
        return fallback;
    }
    if (value >= 7) {
        return 'success';
    }
    if (value >= 6) {
        return 'primary';
    }
    if (value >= 5) {
        return 'warning';
    }
    return 'danger';
}

function buildWritingRow(
    result: EnhancedTestResultRecord,
    onResultClick?: (resultId: string) => void,
) {
    const bandScore = getBandScore(result);
    const isPending = isPendingWriting(result);
    const wordCount = getWritingWordCount(result);
    const metaItems = [
        formatAcademicRecordDate(result.submittedAt),
        formatContextType(result.context?.type),
        wordCount ? `${wordCount} words` : null,
        getCourseContext(result),
        getAttemptLabel(result),
    ].filter((item): item is string => Boolean(item));

    return (
        <AcademicRecordFlatRow
            key={result.resultId}
            title={result.testTitle}
            metaItems={metaItems}
            leadingText={getSkillVisual('writing').badge}
            leadingTone={isPending ? 'warning' : 'primary'}
            trailingPrimary={isPending ? 'Pending' : formatBand(bandScore)}
            trailingSecondary={isPending ? 'Awaiting Review' : 'Overall Band'}
            trailingTone={isPending ? 'warning' : getBandTone(bandScore, 'primary')}
            onClick={onResultClick ? () => onResultClick(result.resultId) : undefined}
            ariaLabel={onResultClick ? `Open result for ${result.testTitle}` : undefined}
        />
    );
}

function buildSkillRow(
    result: EnhancedTestResultRecord,
    onResultClick?: (resultId: string) => void,
) {
    const skill = String(result.testSkill || '').toLowerCase();
    if (skill === 'writing') {
        return buildWritingRow(result, onResultClick);
    }

    const visual = getSkillVisual(skill);
    const bandScore = getBandScore(result);
    const metaItems = [
        formatAcademicRecordDate(result.submittedAt),
        getCourseContext(result),
        result.totalQuestions ? `${result.correct}/${result.totalQuestions} correct` : null,
        getAttemptLabel(result),
    ].filter((item): item is string => Boolean(item));

    return (
        <AcademicRecordFlatRow
            key={result.resultId}
            title={result.testTitle}
            metaItems={metaItems}
            leadingText={visual.badge}
            leadingTone={visual.leadingTone}
            trailingPrimary={formatBand(bandScore)}
            trailingSecondary={`${Math.round(result.percentage)}% score`}
            trailingTone={getBandTone(bandScore, visual.leadingTone)}
            onClick={onResultClick ? () => onResultClick(result.resultId) : undefined}
            ariaLabel={onResultClick ? `Open result for ${result.testTitle}` : undefined}
        />
    );
}

function buildEmptySummary(skill: string): SkillBandSummary {
    return {
        skill,
        label: formatSkillLabel(skill),
        totalTests: 0,
        averageBand: null,
        highestBand: null,
        pendingReviewCount: 0,
    };
}

export const ResultsBySkill: React.FC<ResultsBySkillProps> = ({
    results,
    onResultClick,
}) => {
    const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

    const skillGroups = useMemo(() => {
        const groups = new Map<string, SkillGroup>();

        results.forEach((result) => {
            const skill = String(result.testSkill || 'other').toLowerCase();

            if (!groups.has(skill)) {
                groups.set(skill, {
                    skill,
                    label: formatSkillLabel(skill),
                    results: [],
                    summary: buildEmptySummary(skill),
                });
            }

            groups.get(skill)!.results.push(result);
        });

        groups.forEach((group) => {
            group.results.sort((a, b) => b.submittedAt - a.submittedAt);

            const completedBands = group.results
                .map(getBandScore)
                .filter((value): value is number => value !== null);
            const pendingReviewCount = group.results.filter(isPendingWriting).length;

            group.summary = {
                skill: group.skill,
                label: group.label,
                totalTests: group.results.length,
                averageBand: completedBands.length > 0
                    ? completedBands.reduce((sum, value) => sum + value, 0) / completedBands.length
                    : null,
                highestBand: completedBands.length > 0 ? Math.max(...completedBands) : null,
                pendingReviewCount,
            };
        });

        return Array.from(groups.values()).sort((a, b) => {
            const left = skillOrder.indexOf(a.skill);
            const right = skillOrder.indexOf(b.skill);
            if (left === -1 && right === -1) {
                return a.label.localeCompare(b.label);
            }
            if (left === -1) return 1;
            if (right === -1) return -1;
            return left - right;
        });
    }, [results]);

    const overallSummary = useMemo(() => {
        const completedBands = results
            .map(getBandScore)
            .filter((value): value is number => value !== null);
        const writingPending = results.filter(isPendingWriting).length;
        const skillSummaries = new Map(skillGroups.map((group) => [group.skill, group.summary] as const));

        return {
            testsCompleted: results.length,
            averageOverallBand: completedBands.length > 0
                ? completedBands.reduce((sum, value) => sum + value, 0) / completedBands.length
                : null,
            highestOverallBand: completedBands.length > 0 ? Math.max(...completedBands) : null,
            pendingWritingReview: writingPending,
            skillSummaries: skillOrder.map((skill) => skillSummaries.get(skill) || buildEmptySummary(skill)),
        };
    }, [results, skillGroups]);

    if (results.length === 0) {
        return (
            <div style={styles.emptyWrap}>
                <IconInbox size={52} style={{ color: '#9ca3af' }} />
                <p style={styles.emptyHeading}>No skill results found</p>
                <p style={styles.emptyBody}>Your latest results will appear here grouped by skill.</p>
            </div>
        );
    }

    return (
        <div style={styles.stack}>
            <div style={styles.summaryStack}>
                <div style={styles.prioritySummaryGrid}>
                    <div style={{ ...styles.summaryCard, borderTopColor: '#d1d5db' }}>
                        <p style={{ ...styles.summaryLabel, color: summaryCardVisuals.neutral.labelColor }}>Tests Completed</p>
                        <p style={{ ...styles.summaryValue, color: summaryCardVisuals.neutral.valueColor }}>{overallSummary.testsCompleted}</p>
                    </div>
                    <div style={{ ...styles.summaryCard, borderTopColor: '#d1d5db' }}>
                        <p style={{ ...styles.summaryLabel, color: summaryCardVisuals.warning.labelColor }}>Pending Review</p>
                        <p style={{ ...styles.summaryValue, color: summaryCardVisuals.warning.valueColor }}>{overallSummary.pendingWritingReview}</p>
                    </div>
                    <div style={{ ...styles.summaryCard, borderTopColor: '#d1d5db' }}>
                        <p style={{ ...styles.summaryLabel, color: summaryCardVisuals.primary.labelColor }}>Average Overall Band</p>
                        <p style={{ ...styles.summaryValue, color: summaryCardVisuals.primary.valueColor }}>{formatBand(overallSummary.averageOverallBand)}</p>
                    </div>
                    <div style={{ ...styles.summaryCard, borderTopColor: '#d1d5db' }}>
                        <p style={{ ...styles.summaryLabel, color: summaryCardVisuals.success.labelColor }}>Highest Overall Band</p>
                        <p style={{ ...styles.summaryValue, color: summaryCardVisuals.success.valueColor }}>{formatBand(overallSummary.highestOverallBand)}</p>
                    </div>
                </div>

                <div style={styles.skillSummaryGrid}>
                    {overallSummary.skillSummaries.map((summary) => {
                        const visual = getSkillVisual(summary.skill);
                        return (
                            <div
                                key={summary.skill}
                                style={{ ...styles.summaryCard, borderTopColor: '#d1d5db' }}
                            >
                                <p style={styles.summaryLabel}>{summary.label} Band</p>
                                <p style={{ ...styles.summaryValue, color: visual.accent }}>{formatBand(summary.averageBand)}</p>
                                <p style={styles.summaryHint}>
                                    {summary.highestBand === null
                                        ? summary.totalTests > 0
                                            ? 'No graded results yet'
                                            : 'No results yet'
                                        : `High ${formatBand(summary.highestBand)} · ${summary.totalTests} test${summary.totalTests !== 1 ? 's' : ''}`}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div style={styles.stackDivider}>
                {skillGroups.map((group) => {
                    const isExpanded = expandedSkills.has(group.skill);
                    const visual = getSkillVisual(group.skill);
                    const metaBits = [
                        `${group.summary.totalTests} test${group.summary.totalTests !== 1 ? 's' : ''}`,
                        group.summary.averageBand !== null ? `avg ${formatBand(group.summary.averageBand)}` : null,
                        group.summary.highestBand !== null ? `high ${formatBand(group.summary.highestBand)}` : null,
                        group.summary.pendingReviewCount > 0 ? `${group.summary.pendingReviewCount} pending review` : null,
                    ].filter((item): item is string => Boolean(item));

                    return (
                        <section key={group.skill}>
                            <button
                                type="button"
                                onClick={() => {
                                    setExpandedSkills((current) => {
                                        const next = new Set(current);
                                        if (next.has(group.skill)) {
                                            next.delete(group.skill);
                                        } else {
                                            next.add(group.skill);
                                        }
                                        return next;
                                    });
                                }}
                                aria-expanded={isExpanded}
                                style={{
                                    ...styles.groupHeader,
                                }}
                            >
                                <div style={styles.groupHeaderMain}>
                                    <span style={styles.chevron}>
                                        {isExpanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                                    </span>
                                    <span
                                        style={{
                                            ...styles.leadingBadge,
                                            background: '#ffffff',
                                            color: visual.accent,
                                        }}
                                    >
                                        {visual.badge}
                                    </span>
                                    <div style={styles.groupTitleWrap}>
                                        <p style={styles.groupTitle}>{group.label}</p>
                                        <p style={styles.groupMeta}>{metaBits.join(' | ')}</p>
                                    </div>
                                </div>
                                <span style={{ ...styles.groupSummary, color: visual.accent }}>
                                    {group.summary.pendingReviewCount > 0 ? 'Needs review' : 'Open skill'}
                                </span>
                            </button>

                            {isExpanded && (
                                <div style={styles.groupRows}>
                                    {group.results.map((result) => buildSkillRow(result, onResultClick))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </div>
    );
};
