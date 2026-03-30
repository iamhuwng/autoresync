import React from 'react';
import type { EnhancedTestResultRecord } from '../../types/results.types';

type RowTone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

export interface AcademicRecordFlatRowProps {
    title: string;
    metaItems?: string[];
    leadingText: string;
    leadingTone?: RowTone;
    trailingPrimary: string;
    trailingSecondary?: string;
    trailingTone?: RowTone;
    onClick?: () => void;
    ariaLabel?: string;
}

interface AcademicRecordResultRowProps {
    result: EnhancedTestResultRecord;
    onClick?: (resultId: string) => void;
}

const rowStyles: Record<string, React.CSSProperties> = {
    row: {
        width: '100%',
        border: 'none',
        borderRadius: 14,
        background: '#f3f4f6',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        textAlign: 'left',
        transition: 'background 150ms ease',
    },
    rowInteractive: {
        cursor: 'pointer',
    },
    leadingBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.875rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        flexShrink: 0,
    },
    content: {
        minWidth: 0,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    title: {
        margin: 0,
        color: '#111827',
        fontSize: '0.9375rem',
        fontWeight: 700,
        lineHeight: 1.3,
    },
    meta: {
        margin: 0,
        color: '#6b7280',
        fontSize: '0.75rem',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    trailing: {
        minWidth: 96,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 3,
        flexShrink: 0,
    },
    trailingPrimary: {
        fontSize: '0.95rem',
        fontWeight: 800,
        lineHeight: 1.1,
    },
    trailingSecondary: {
        color: '#6b7280',
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        lineHeight: 1.2,
    },
};

const toneStyles: Record<RowTone, { background: string; color: string }> = {
    default: { background: '#e5e7eb', color: '#374151' },
    primary: { background: '#e0e7ff', color: '#4338ca' },
    success: { background: '#d1fae5', color: '#059669' },
    warning: { background: '#fef3c7', color: '#d97706' },
    danger: { background: '#fee2e2', color: '#dc2626' },
    muted: { background: '#f9fafb', color: '#6b7280' },
};

export function formatAcademicRecordDate(timestamp: number): string {
    if (!timestamp) {
        return 'No Date';
    }

    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
}

function buildMetaItems(result: EnhancedTestResultRecord, hasFeedback: boolean): string[] {
    const courseContext = result.courseId === null
        ? 'Unassigned course'
        : [result.courseName, result.moduleName].filter(Boolean).join(' / ');

    const attemptLabel = result.attemptSummary?.totalAttempts && result.attemptSummary.totalAttempts > 1
        ? `Attempt ${result.attemptSummary.attemptNumber}/${result.attemptSummary.totalAttempts}`
        : null;

    const resultFlags = result.markingStatus === 'pending-review'
        ? 'Awaiting review'
        : hasFeedback
            ? 'Feedback'
            : null;

    return [
        courseContext || null,
        formatLabel(result.testSkill || result.testType),
        attemptLabel,
        resultFlags,
    ].filter((item): item is string => Boolean(item));
}

function getLeadingTone(result: EnhancedTestResultRecord): RowTone {
    if (result.markingStatus === 'pending-review') {
        return 'warning';
    }

    if (result.thcsData) {
        return 'muted';
    }

    const skill = (result.testSkill || '').toLowerCase();
    if (skill === 'reading') {
        return 'primary';
    }
    if (skill === 'listening') {
        return 'default';
    }
    if (skill === 'writing') {
        return 'warning';
    }
    if (skill === 'speaking') {
        return 'success';
    }

    return 'muted';
}

function getLeadingText(result: EnhancedTestResultRecord): string {
    if (result.thcsData) {
        return 'TH';
    }

    const skill = (result.testSkill || result.testType || 'R').trim();
    return skill.slice(0, 2).toUpperCase();
}

function getScoreTone(result: EnhancedTestResultRecord): RowTone {
    if (result.markingStatus === 'pending-review') {
        return 'warning';
    }

    if (result.thcsData?.scaledScore !== undefined) {
        const score = result.thcsData.scaledScore;
        if (score >= 8) return 'success';
        if (score >= 6) return 'primary';
        if (score >= 5) return 'warning';
        return 'danger';
    }

    if (result.percentage >= 80) return 'success';
    if (result.percentage >= 65) return 'primary';
    if (result.percentage >= 50) return 'warning';
    return 'danger';
}

function getScoreLabel(result: EnhancedTestResultRecord): string {
    if (result.markingStatus === 'pending-review') {
        return 'Pending';
    }

    if (result.thcsData?.scaledScore !== undefined) {
        return `${result.thcsData.scaledScore.toFixed(1)}/10`;
    }

    return `${Math.round(result.percentage)}%`;
}

function formatLabel(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    return value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function applyInteractiveBackground(event: React.MouseEvent<HTMLButtonElement>, active: boolean) {
    event.currentTarget.style.background = active ? '#e5e7eb' : '#f3f4f6';
}

export const AcademicRecordFlatRow: React.FC<AcademicRecordFlatRowProps> = ({
    title,
    metaItems = [],
    leadingText,
    leadingTone = 'default',
    trailingPrimary,
    trailingSecondary,
    trailingTone = 'default',
    onClick,
    ariaLabel,
}) => {
    const rowStyle = {
        ...rowStyles.row,
        ...(onClick ? rowStyles.rowInteractive : {}),
    };

    const content = (
        <>
            <div
                style={{
                    ...rowStyles.leadingBox,
                    ...toneStyles[leadingTone],
                }}
                aria-hidden="true"
            >
                {leadingText}
            </div>
            <div style={rowStyles.content}>
                <p style={rowStyles.title}>{title}</p>
                {metaItems.length > 0 && (
                    <p style={rowStyles.meta}>{metaItems.join(' | ')}</p>
                )}
            </div>
            <div style={rowStyles.trailing}>
                <span style={{ ...rowStyles.trailingPrimary, color: toneStyles[trailingTone].color }}>
                    {trailingPrimary}
                </span>
                {trailingSecondary && (
                    <span style={rowStyles.trailingSecondary}>{trailingSecondary}</span>
                )}
            </div>
        </>
    );

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                style={rowStyle}
                aria-label={ariaLabel}
                onMouseEnter={(event) => applyInteractiveBackground(event, true)}
                onMouseLeave={(event) => applyInteractiveBackground(event, false)}
            >
                {content}
            </button>
        );
    }

    return <div style={rowStyle}>{content}</div>;
};

export const AcademicRecordResultRow: React.FC<AcademicRecordResultRowProps> = ({
    result,
    onClick,
}) => {
    const hasFeedback = Boolean(result.overallFeedback || result.questionResults?.some((question) => question.teacherFeedback));
    const metaItems = buildMetaItems(result, hasFeedback);
    const handleClick = onClick ? () => onClick(result.resultId) : undefined;

    return (
        <AcademicRecordFlatRow
            title={result.testTitle}
            metaItems={metaItems}
            leadingText={getLeadingText(result)}
            leadingTone={getLeadingTone(result)}
            trailingPrimary={getScoreLabel(result)}
            trailingSecondary={formatAcademicRecordDate(result.submittedAt)}
            trailingTone={getScoreTone(result)}
            onClick={handleClick}
            ariaLabel={handleClick ? `Open result for ${result.testTitle}` : undefined}
        />
    );
};
