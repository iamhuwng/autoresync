import React, { useMemo } from 'react';
import { AcademicRecordFlatRow, formatAcademicRecordDate } from './AcademicRecordResultRow';
import type { ThcsProgressData } from '../../services/academicRecordService';
import { studentTokens } from '../layout/studentLayoutStyles';

interface THCSProgressTabProps {
    data: ThcsProgressData | null;
    loading?: boolean;
    onResultClick?: (resultId: string) => void;
}

const styles: Record<string, React.CSSProperties> = {
    loadingWrap: {
        textAlign: 'center',
        padding: 48,
    },
    spinner: {
        width: 28,
        height: 28,
        border: `3px solid ${studentTokens.accentSoft}`,
        borderTopColor: studentTokens.accent,
        borderRadius: '50%',
        margin: '0 auto',
        animation: 'thcsSpin 0.8s linear infinite',
    },
    emptyWrap: {
        textAlign: 'center',
        padding: '48px 16px',
    },
    emptyHeading: {
        fontWeight: 700,
        color: studentTokens.textPrimary,
        margin: '0 0 8px',
        fontSize: '1.125rem',
    },
    emptyBody: {
        color: studentTokens.textMuted,
        fontSize: '0.875rem',
        margin: 0,
    },
    stack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 32,
    },
    statCard: {
        background: '#ffffff',
        borderRadius: 0,
        padding: '24px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 0,
        minHeight: 128,
    },
    statLabel: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
    },
    statValueRow: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
    },
    statValue: {
        margin: 0,
        fontSize: '2.25rem',
        fontWeight: 800,
        color: studentTokens.textPrimary,
        lineHeight: 1.1,
    },
    section: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    sectionHeader: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    sectionTitle: {
        margin: 0,
        fontSize: '0.875rem',
        fontWeight: 700,
        color: studentTokens.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
    },
    sectionBody: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    skillGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
    },
    skillRow: {
        background: '#ffffff',
        borderRadius: 0,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    skillTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
    },
    skillLabel: {
        margin: 0,
        fontSize: '0.875rem',
        fontWeight: 700,
        color: studentTokens.textPrimary,
        textTransform: 'capitalize',
    },
    skillMeta: {
        margin: 0,
        fontSize: '0.75rem',
        color: studentTokens.textMuted,
    },
    skillValue: {
        margin: 0,
        fontSize: '1.2rem',
        fontWeight: 800,
        lineHeight: 1.1,
    },
    skillMeter: {
        height: 6,
        borderRadius: 999,
        background: studentTokens.bgSurfaceAlt,
        overflow: 'hidden',
    },
    skillFill: {
        height: '100%',
        borderRadius: 999,
        background: studentTokens.accent,
    },
    updateText: {
        margin: 0,
        fontSize: '0.75rem',
        color: studentTokens.textMuted,
    },
};

const statCardVisuals = [
    { labelColor: studentTokens.textMuted, valueColor: studentTokens.textPrimary },
    { labelColor: studentTokens.textMuted, valueColor: studentTokens.accent },
    { labelColor: studentTokens.textMuted, valueColor: '#4c5458' },
] as const;

const skillVisuals = [
    { color: studentTokens.accentHover },
    { color: '#4c5458' },
    { color: '#586064' },
    { color: '#9a6427' },
] as const;

function formatExamType(value: string): string {
    return value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getHistoryTone(score: number): 'success' | 'primary' | 'warning' | 'danger' {
    if (score >= 8) return 'success';
    if (score >= 6) return 'primary';
    if (score >= 5) return 'warning';
    return 'danger';
}

function getEntryDate(entry: ThcsProgressData['scoreHistory'][number]): number {
    return entry.completedAt ?? entry.date ?? 0;
}

export const THCSProgressTab: React.FC<THCSProgressTabProps> = ({ data, loading = false, onResultClick }) => {
    const sortedHistory = useMemo(
        () => [...(data?.scoreHistory || [])].sort((a, b) => getEntryDate(b) - getEntryDate(a)),
        [data?.scoreHistory],
    );

    const maxScore = useMemo(
        () => (data?.scoreHistory?.length ? Math.max(...data.scoreHistory.map((entry) => entry.scaledScore)) : 0),
        [data?.scoreHistory],
    );

    if (loading && !data) {
        return (
            <div style={styles.loadingWrap}>
                <div style={styles.spinner} />
                <style>{'@keyframes thcsSpin { to { transform: rotate(360deg); } }'}</style>
            </div>
        );
    }

    if (!data || sortedHistory.length === 0) {
        return (
            <div style={styles.emptyWrap}>
                <h3 style={styles.emptyHeading}>No THCS results yet</h3>
                <p style={styles.emptyBody}>Your THCS and THPT results will appear here after your first completed test.</p>
            </div>
        );
    }

    const skillEntries = Object.entries(data.skillBreakdown || {});

    return (
        <div style={styles.stack}>
            <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                    <p style={{ ...styles.statLabel, color: statCardVisuals[0].labelColor }}>Tests Completed</p>
                    <div style={styles.statValueRow}>
                        <span style={{ ...styles.statValue, color: statCardVisuals[0].valueColor }}>{data.testsCompleted}</span>
                    </div>
                </div>
                <div style={styles.statCard}>
                    <p style={{ ...styles.statLabel, color: statCardVisuals[1].labelColor }}>Average Score</p>
                    <div style={styles.statValueRow}>
                        <span style={{ ...styles.statValue, color: statCardVisuals[1].valueColor }}>{data.averageScore.toFixed(1)}/10</span>
                    </div>
                </div>
                <div style={styles.statCard}>
                    <p style={{ ...styles.statLabel, color: statCardVisuals[2].labelColor }}>Best Score</p>
                    <div style={styles.statValueRow}>
                        <span style={{ ...styles.statValue, color: statCardVisuals[2].valueColor }}>{maxScore.toFixed(1)}/10</span>
                    </div>
                </div>
            </div>

            {skillEntries.length > 0 && (
                <section style={styles.section}>
                    <div style={styles.sectionHeader}>
                        <h3 style={styles.sectionTitle}>Skill Summary</h3>
                    </div>
                    <div style={styles.sectionBody}>
                        <div style={styles.skillGrid}>
                            {skillEntries.map(([skill, summary], index) => {
                                const percentage = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0;
                                const visual = skillVisuals[index % skillVisuals.length] ?? skillVisuals[0];

                                return (
                                    <div key={skill} style={styles.skillRow}>
                                        <div style={styles.skillTop}>
                                            <p style={styles.skillLabel}>{skill}</p>
                                            <p style={styles.skillMeta}>{summary.correct}/{summary.total} correct</p>
                                        </div>
                                        <p style={{ ...styles.skillValue, color: visual.color }}>{percentage}%</p>
                                        <div style={styles.skillMeter}>
                                            <div style={{ ...styles.skillFill, width: `${percentage}%`, background: visual.color }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            <section style={styles.section}>
                <div style={styles.sectionHeader}>
                    <h3 style={styles.sectionTitle}>Recent THCS Results</h3>
                </div>
                <div style={styles.sectionBody}>
                    {sortedHistory.map((entry) => (
                        <AcademicRecordFlatRow
                            key={`${entry.testId}-${getEntryDate(entry)}`}
                            title={entry.testTitle}
                            metaItems={[
                                `Grade ${entry.gradeLevel}`,
                                formatExamType(entry.examType),
                            ]}
                            leadingText={`G${entry.gradeLevel}`}
                            leadingTone="muted"
                            trailingPrimary={`${entry.scaledScore.toFixed(1)}/10`}
                            trailingSecondary={formatAcademicRecordDate(getEntryDate(entry))}
                            trailingTone={getHistoryTone(entry.scaledScore)}
                            onClick={entry.testId && onResultClick ? () => onResultClick(entry.testId) : undefined}
                            ariaLabel={entry.testId && onResultClick ? `Open THCS result for ${entry.testTitle}` : undefined}
                        />
                    ))}
                </div>
            </section>

            <p style={styles.updateText}>Updated {formatAcademicRecordDate(data.lastUpdated)}</p>
        </div>
    );
};

export default THCSProgressTab;
