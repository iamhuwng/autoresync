import React from 'react';
import type { EnhancedTestResultRecord } from '../../types/results.types';
import { studentTokens } from '../layout/studentLayoutStyles';

export type RowTone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

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

const tableRowStyles: Record<string, React.CSSProperties> = {
    row: {
        width: '100%',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.8fr) 108px 96px 120px 32px',
        alignItems: 'center',
        gap: 12,
        padding: '18px 20px',
        border: 'none',
        borderBottom: `1px solid ${studentTokens.borderWhisper}`,
        background: studentTokens.bgSurface,
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 150ms ease',
    },
    titleWrap: {
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    titleText: {
        margin: 0,
        color: studentTokens.textPrimary,
        fontSize: '0.9375rem',
        fontWeight: 700,
        lineHeight: 1.3,
    },
    metaText: {
        margin: 0,
        color: studentTokens.textMuted,
        fontSize: '0.75rem',
        lineHeight: 1.45,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    centeredText: {
        fontSize: '0.8125rem',
        color: studentTokens.textBody,
        fontWeight: 600,
    },
    scoreText: {
        fontSize: '0.875rem',
        color: studentTokens.textPrimary,
        fontWeight: 800,
    },
    pill: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 10px',
        borderRadius: studentTokens.radiusPill,
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
    },
    arrow: {
        color: studentTokens.textMuted,
        fontSize: '1rem',
        fontWeight: 700,
        textAlign: 'right',
    },
};

const rowStyles: Record<string, React.CSSProperties> = {
    row: {
        width: '100%',
        border: 'none',
        borderBottom: `1px solid ${studentTokens.borderWhisper}`,
        borderRadius: 0,
        background: studentTokens.bgSurface,
        padding: '18px 20px',
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
        width: 42,
        height: 42,
        borderRadius: 8,
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
        color: studentTokens.textPrimary,
        fontSize: '0.9375rem',
        fontWeight: 700,
        lineHeight: 1.3,
    },
    meta: {
        margin: 0,
        color: studentTokens.textMuted,
        fontSize: '0.75rem',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    trailing: {
        minWidth: 110,
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
        color: studentTokens.textMuted,
        fontSize: '0.6875rem',
        fontWeight: 600,
        lineHeight: 1.2,
    },
};

const toneStyles: Record<RowTone, { background: string; color: string }> = {
    default: { background: studentTokens.bgSurfaceAlt, color: studentTokens.textBody },
    primary: { background: studentTokens.accentSoft, color: studentTokens.accentHover },
    success: { background: '#edf5f9', color: '#4c5458' },
    warning: { background: '#f4ede4', color: '#9a6427' },
    danger: { background: '#fff3f3', color: '#9e3f4e' },
    muted: { background: studentTokens.bgShell, color: studentTokens.textMuted },
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

export function buildMetaItems(result: EnhancedTestResultRecord, hasFeedback: boolean): string[] {
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

export function getLeadingTone(result: EnhancedTestResultRecord): RowTone {
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

export function getLeadingText(result: EnhancedTestResultRecord): string {
    if (result.thcsData) {
        return 'TH';
    }

    const skill = (result.testSkill || result.testType || 'R').trim();
    return skill.slice(0, 2).toUpperCase();
}

export function getScoreTone(result: EnhancedTestResultRecord): RowTone {
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

export function getScoreLabel(result: EnhancedTestResultRecord): string {
    if (result.markingStatus === 'pending-review') {
        return 'Pending';
    }

    if (result.thcsData?.scaledScore !== undefined) {
        return `${result.thcsData.scaledScore.toFixed(1)}/10`;
    }

    return `${Math.round(result.percentage)}%`;
}

function getStatusLabel(result: EnhancedTestResultRecord): string {
    if (result.markingStatus === 'pending-review') {
        return 'Awaiting Review';
    }

    if (result.thcsData?.scaledScore !== undefined) {
        const score = result.thcsData.scaledScore;
        if (score >= 8) return 'Distinction';
        if (score >= 6.5) return 'High Merit';
        if (score >= 5) return 'Passed';
        return 'Review';
    }

    if (result.percentage >= 80) return 'Distinction';
    if (result.percentage >= 65) return 'High Merit';
    if (result.percentage >= 50) return 'Passed';
    return 'Review';
}

function getStatusPillStyle(result: EnhancedTestResultRecord): React.CSSProperties {
    const label = getStatusLabel(result);
    if (label === 'Awaiting Review') {
        return { ...tableRowStyles.pill, background: '#f4ede4', color: '#9a6427' };
    }
    if (label === 'Distinction') {
        return { ...tableRowStyles.pill, background: studentTokens.accentSoft, color: studentTokens.accentHover };
    }
    if (label === 'High Merit') {
        return { ...tableRowStyles.pill, background: '#edf5f9', color: '#4c5458' };
    }
    if (label === 'Passed') {
        return { ...tableRowStyles.pill, background: studentTokens.bgSurfaceAlt, color: studentTokens.textBody };
    }

    return { ...tableRowStyles.pill, background: '#fff2f2', color: '#9e3f4e' };
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
    event.currentTarget.style.background = active ? studentTokens.bgSurfaceMuted : studentTokens.bgSurface;
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

    if (!handleClick) {
        return null;
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            style={tableRowStyles.row}
            aria-label={`Open result for ${result.testTitle}`}
            onMouseEnter={(event) => {
                event.currentTarget.style.background = studentTokens.bgSurfaceMuted;
            }}
            onMouseLeave={(event) => {
                event.currentTarget.style.background = studentTokens.bgSurface;
            }}
        >
            <div style={tableRowStyles.titleWrap}>
                <p style={tableRowStyles.titleText}>{result.testTitle}</p>
                <p style={tableRowStyles.metaText}>{metaItems.join(' | ')}</p>
            </div>
            <span style={tableRowStyles.centeredText}>{formatAcademicRecordDate(result.submittedAt)}</span>
            <span style={{ ...tableRowStyles.scoreText, color: toneStyles[getScoreTone(result)].color }}>{getScoreLabel(result)}</span>
            <span style={getStatusPillStyle(result)}>{getStatusLabel(result)}</span>
            <span style={tableRowStyles.arrow} aria-hidden="true">›</span>
        </button>
    );
};
