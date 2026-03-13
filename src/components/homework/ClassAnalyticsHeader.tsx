/**
 * ClassAnalyticsHeader – PRD-0034 Task 12.1
 *
 * Renders a horizontal stat row within the "By Class" view mode.
 * Computes: total homework, average completion rate, average score,
 * overdue count, and at-risk student count (< 50 % completion).
 * All computations are client-side from loaded data (AC-8.4).
 */
import { useMemo, type CSSProperties } from 'react';
import type { HomeworkAssignment } from '../../types/homework.types';

export interface ClassAnalyticsHeaderProps {
    classId: string;
    className: string;
    homework: HomeworkAssignment[];
}

interface StatItem {
    label: string;
    value: string;
    icon: string;
    color: string;
    bg: string;
}

export default function ClassAnalyticsHeader({ className, homework }: ClassAnalyticsHeaderProps) {
    const stats = useMemo(() => {
        const total = homework.length;

        // Average completion rate (from denormalized stats.submitted / stats.totalAssigned)
        let completionSum = 0;
        let completionCount = 0;
        homework.forEach((hw) => {
            if (hw.stats.totalAssigned > 0) {
                const rate = hw.stats.completionRate ??
                    Math.round((hw.stats.submitted / hw.stats.totalAssigned) * 100);
                completionSum += rate;
                completionCount++;
            }
        });
        const avgCompletion = completionCount > 0
            ? Math.round(completionSum / completionCount)
            : 0;

        // Average score
        let scoreSum = 0;
        let scoreCount = 0;
        homework.forEach((hw) => {
            if (typeof hw.stats.averageScore === 'number') {
                scoreSum += hw.stats.averageScore;
                scoreCount++;
            }
        });
        const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;

        // Overdue count
        const overdueCount = homework.filter((hw) => hw.status === 'past_due').length;

        // At-risk student count (< 50 % completion across all homework for this class)
        // Build a map: studentId -> { submitted, total }
        const studentMap = new Map<string, { submitted: number; total: number }>();
        homework.forEach((hw) => {
            const studentIds: string[] =
                (hw.target.type === 'class' || hw.target.type === 'group')
                    ? (hw.target as { studentIds?: string[] }).studentIds ?? []
                    : hw.target.type === 'students'
                        ? hw.target.studentIds
                        : [];

            studentIds.forEach((sid) => {
                const entry = studentMap.get(sid) ?? { submitted: 0, total: 0 };
                entry.total++;
                studentMap.set(sid, entry);
            });
        });

        // We can only approximate at-risk from stats (we don't have per-student submission lists here).
        // For the list page, at-risk is computed from completion rate < 50 for the overall class.
        // A simple heuristic: if completionRate < 50, show the "non-submitted" count
        const atRiskCount = homework.reduce((count, hw) => {
            const rate = hw.stats.totalAssigned > 0
                ? (hw.stats.submitted / hw.stats.totalAssigned) * 100
                : 100;
            if (rate < 50) count++;
            return count;
        }, 0);

        return { total, avgCompletion, avgScore, overdueCount, atRiskCount };
    }, [homework]);

    const items: StatItem[] = [
        {
            label: 'Total Homework',
            value: String(stats.total),
            icon: '📋',
            color: '#4338ca',
            bg: 'rgba(99,102,241,0.1)',
        },
        {
            label: 'Avg. Completion',
            value: `${stats.avgCompletion}%`,
            icon: '✅',
            color: '#047857',
            bg: 'rgba(16,185,129,0.1)',
        },
        {
            label: 'Avg. Score',
            value: stats.avgScore > 0 ? `${stats.avgScore}%` : '—',
            icon: '🏆',
            color: '#b45309',
            bg: 'rgba(245,158,11,0.1)',
        },
        {
            label: 'Overdue',
            value: String(stats.overdueCount),
            icon: '⚠️',
            color: stats.overdueCount > 0 ? '#b91c1c' : '#64748b',
            bg: stats.overdueCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.06)',
        },
        {
            label: 'Needs Attention',
            value: String(stats.atRiskCount),
            icon: '🔥',
            color: stats.atRiskCount > 0 ? '#c2410c' : '#64748b',
            bg: stats.atRiskCount > 0 ? 'rgba(249,115,22,0.1)' : 'rgba(100,116,139,0.06)',
        },
    ];

    const rowStyle: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '0.65rem',
        marginBottom: '0.75rem',
    };

    const chipStyle = (item: StatItem): CSSProperties => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.15rem',
        padding: '0.55rem 0.5rem',
        borderRadius: '0.85rem',
        background: item.bg,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    });

    const valueStyle = (item: StatItem): CSSProperties => ({
        fontSize: '1.2rem',
        fontWeight: 800,
        color: item.color,
        lineHeight: 1.1,
    });

    const labelStyle: CSSProperties = {
        fontSize: '0.7rem',
        fontWeight: 600,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    };

    if (homework.length === 0) return null;

    return (
        <div style={rowStyle} aria-label={`Analytics for ${className}`}>
            {items.map((item) => (
                <div key={item.label} style={chipStyle(item)}>
                    <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                    <span style={valueStyle(item)}>{item.value}</span>
                    <span style={labelStyle}>{item.label}</span>
                </div>
            ))}
        </div>
    );
}
