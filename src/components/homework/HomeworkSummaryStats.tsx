import type { ReactNode } from 'react';
import { Card, CardBody } from '../modern';

interface HomeworkSummarySnapshot {
    totalStudents: number;
    submittedCount: number;
    completionPercent: number;
    averageScore: number;
    onTimeCount: number;
    lateCount: number;
    needsAttentionCount: number;
}

interface HomeworkSummaryStatsProps {
    stats?: HomeworkSummarySnapshot;
    totalAssigned?: number;
    submittedCount?: number;
    inProgressCount?: number;
    notStartedCount?: number;
    completionRate?: number;
    averageScore?: number | null;
    onTimeCount?: number;
    lateCount?: number;
    needsAttentionCount?: number;
    actions?: ReactNode;
    cards?: StatCardProps[];
}

interface StatCardProps {
    label: string;
    value: string;
    accent: string;
    helper?: string;
}

function StatCard({ label, value, accent, helper }: StatCardProps) {
    return (
        <Card hover={false} style={{ minWidth: 0 }}>
            <CardBody>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '1.55rem', color: accent, fontWeight: 800 }}>{value}</span>
                    {helper ? (
                        <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{helper}</span>
                    ) : null}
                </div>
            </CardBody>
        </Card>
    );
}

function HomeworkSummaryStats({
    stats,
    totalAssigned,
    submittedCount,
    inProgressCount,
    notStartedCount,
    completionRate,
    averageScore,
    onTimeCount,
    lateCount,
    needsAttentionCount,
    actions,
    cards,
}: HomeworkSummaryStatsProps) {
    const resolvedTotalAssigned = stats?.totalStudents ?? totalAssigned ?? 0;
    const resolvedSubmittedCount = stats?.submittedCount ?? submittedCount ?? 0;
    const resolvedCompletionRate = stats?.completionPercent ?? completionRate ?? 0;
    const resolvedAverageScore = stats?.averageScore ?? averageScore ?? null;
    const resolvedOnTimeCount = stats?.onTimeCount ?? onTimeCount ?? 0;
    const resolvedLateCount = stats?.lateCount ?? lateCount ?? 0;
    const resolvedNeedsAttentionCount = stats?.needsAttentionCount ?? needsAttentionCount ?? 0;
    const resolvedInProgressCount = inProgressCount ?? Math.max(resolvedTotalAssigned - resolvedSubmittedCount, 0);
    const resolvedNotStartedCount = notStartedCount ?? Math.max(resolvedTotalAssigned - resolvedSubmittedCount - resolvedInProgressCount, 0);
    const completionAccent =
        resolvedCompletionRate >= 75
            ? '#10b981'
            : resolvedCompletionRate >= 50
                ? '#f59e0b'
                : '#ef4444';

    const displayCards = cards ?? [
        {
            label: 'Assigned Students',
            value: String(resolvedTotalAssigned),
            accent: '#0f172a',
            helper: `${resolvedSubmittedCount} submitted`,
        },
        {
            label: 'Completion Rate',
            value: `${resolvedCompletionRate}%`,
            accent: completionAccent,
            helper: `${resolvedNotStartedCount} not started`,
        },
        {
            label: 'Average Score',
            value: resolvedAverageScore !== null ? `${resolvedAverageScore}%` : '—',
            accent: '#059669',
            helper: `${resolvedInProgressCount} in progress`,
        },
        {
            label: 'On-time vs Late',
            value: `${resolvedOnTimeCount} / ${resolvedLateCount}`,
            accent: resolvedLateCount > 0 ? '#b45309' : '#0f766e',
            helper: 'Submitted students',
        },
        {
            label: 'Needs Attention',
            value: String(resolvedNeedsAttentionCount),
            accent: resolvedNeedsAttentionCount > 0 ? '#dc2626' : '#16a34a',
            helper: 'Not started or stalled',
        },
    ];

    return (
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
            {actions ? (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569' }}>
                        Homework summary
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {actions}
                    </div>
                </div>
            ) : null}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.9rem',
                }}
            >
                {displayCards.map((card) => (
                    <StatCard
                        key={card.label}
                        label={card.label}
                        value={card.value}
                        accent={card.accent}
                        helper={card.helper}
                    />
                ))}
            </div>
        </div>
    );
}

export default HomeworkSummaryStats;
