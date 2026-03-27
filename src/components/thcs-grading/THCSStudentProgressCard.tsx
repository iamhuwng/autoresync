/**
 * THCSStudentProgressCard — THCS-specific student card for monitor page (Task 8.1)
 * Shows: progress bar, per-part breakdown, writing status, grade button
 */

import React from 'react';
import { Card, CardBody, Button } from '../modern';
import { IntegrityBadge } from '../test/IntegrityBadge'; // PRD-0036

interface THCSPartProgress {
    partName: string;
    answered: number;
    total: number;
}

interface THCSStudentCardProps {
    studentId: string;
    name: string;
    progress: number;
    answeredCount: number;
    totalQuestions: number;
    status: 'working' | 'submitted' | 'disconnected';
    partBreakdown: THCSPartProgress[];
    writingSubmitted: number;
    writingTotal: number;
    writingGraded?: number;
    autoScore?: number;
    maxScore?: number;
    onClick?: () => void;
    onGradeWriting?: () => void;
    /** PRD-0036: Integrity data for badge display */
    integrityData?: { violationCount: number; riskLevel: 'low' | 'medium' | 'high' };
    /** PRD-0036: Open integrity detail panel */
    onIntegrityClick?: () => void;
    /** PRD-0036: Force-submit this student (teacher action) */
    onForceSubmit?: () => void;
    /** PRD-0036: Reset this student's submission (teacher action) */
    onResetSubmit?: () => void;
}

export const THCSStudentProgressCard: React.FC<THCSStudentCardProps> = ({
    studentId: _studentId,
    name,
    progress,
    answeredCount,
    totalQuestions,
    status,
    partBreakdown,
    writingSubmitted,
    writingTotal,
    writingGraded = 0,
    autoScore,
    maxScore,
    onClick,
    onGradeWriting,
    integrityData, // PRD-0036
    onIntegrityClick,
    onForceSubmit,
    onResetSubmit,
}) => {
    const getStatusColor = () => {
        switch (status) {
            case 'submitted':
                return { bg: '#f0fdf4', border: '#bbf7d0', text: '#059669', icon: '✅' };
            case 'disconnected':
                return { bg: '#fef3c7', border: '#fde68a', text: '#d97706', icon: '⚡' };
            default:
                return { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', icon: '●' };
        }
    };

    const statusStyle = getStatusColor();
    const isSubmitted = status === 'submitted';
    const hasWriting = writingTotal > 0;
    const showForceSubmitAction = (status === 'working' || status === 'disconnected') && !!onForceSubmit;
    const showResetAction = status === 'submitted' && !!onResetSubmit;

    // Avatar
    const initial = name.charAt(0).toUpperCase();
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];
    const avatarColor = colors[name.charCodeAt(0) % colors.length];

    return (
        <Card
            variant="glass"
            style={{
                cursor: onClick ? 'pointer' : 'default',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                border: `1px solid ${statusStyle.border}`,
                background: statusStyle.bg,
            }}
            onClick={onClick}
        >
            <CardBody style={{ padding: '1rem' }}>
                {/* Header: Avatar + Name + Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: avatarColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        flexShrink: 0,
                    }}>
                        {initial}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: '#1e293b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: statusStyle.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            {statusStyle.icon} {status === 'submitted' ? 'Submitted' : status === 'disconnected' ? 'Offline' : 'In Progress'}
                            {/* PRD-0036: Integrity Badge */}
                            {integrityData && (
                                <IntegrityBadge
                                    violationCount={integrityData.violationCount}
                                    riskLevel={integrityData.riskLevel}
                                    onClick={
                                        onIntegrityClick
                                            ? (event) => {
                                                event.stopPropagation();
                                                onIntegrityClick();
                                            }
                                            : undefined
                                    }
                                />
                            )}
                        </div>
                    </div>
                    <div style={{
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        color: progress === 100 ? '#059669' : '#6366f1',
                    }}>
                        {progress}%
                    </div>
                </div>

                {/* Progress bar */}
                <div style={{
                    height: '6px',
                    borderRadius: '3px',
                    background: '#e2e8f0',
                    overflow: 'hidden',
                    marginBottom: '0.75rem',
                }}>
                    <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        borderRadius: '3px',
                        background: progress === 100
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                        transition: 'width 0.5s ease',
                    }} />
                </div>

                {/* Answered count */}
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>
                    {answeredCount}/{totalQuestions} answered
                </div>

                {/* Per-part breakdown */}
                {partBreakdown.length > 0 && (
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                        marginBottom: '0.5rem',
                    }}>
                        {partBreakdown.map((part) => (
                            <span
                                key={part.partName}
                                style={{
                                    fontSize: '0.65rem',
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '4px',
                                    background: part.answered === part.total ? '#dcfce7' : '#f1f5f9',
                                    color: part.answered === part.total ? '#166534' : '#475569',
                                    fontWeight: 600,
                                }}
                            >
                                {part.partName}: {part.answered}/{part.total}
                            </span>
                        ))}
                    </div>
                )}

                {/* Writing status */}
                {hasWriting && (
                    <div style={{
                        fontSize: '0.75rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '6px',
                        background: writingSubmitted === writingTotal ? '#dcfce7' : '#fef9c3',
                        color: writingSubmitted === writingTotal ? '#166534' : '#854d0e',
                        fontWeight: 600,
                        marginBottom: '0.5rem',
                    }}>
                        📝 Writing: {writingSubmitted}/{writingTotal} submitted
                        {writingGraded > 0 && ` (${writingGraded} graded)`}
                    </div>
                )}

                {/* Post-submission info: auto-score + grade button */}
                {isSubmitted && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                        {autoScore !== undefined && maxScore !== undefined && (
                            <span style={{
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: '#1e293b',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '6px',
                                background: '#f1f5f9',
                            }}>
                                🎯 {autoScore}/{maxScore}
                            </span>
                        )}

                        {hasWriting && writingGraded < writingTotal && onGradeWriting && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    onGradeWriting();
                                }}
                                style={{
                                    fontSize: '0.7rem',
                                    padding: '0.2rem 0.5rem',
                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                }}
                            >
                                Grade Writing →
                            </Button>
                        )}
                    </div>
                )}

                {(showForceSubmitAction || showResetAction) && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        {showForceSubmitAction && (
                            <button
                                type="button"
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (window.confirm('Force submit this student? Their current answers will be submitted.')) {
                                        onForceSubmit?.();
                                    }
                                }}
                                style={{
                                    border: '1px solid #ef4444',
                                    color: '#ef4444',
                                    background: 'transparent',
                                    fontSize: '0.75rem',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                }}
                            >
                                Force Submit
                            </button>
                        )}
                        {showResetAction && (
                            <button
                                type="button"
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (window.confirm('Reset this student\'s submission? They will be returned to the active test if it is still running.')) {
                                        onResetSubmit?.();
                                    }
                                }}
                                style={{
                                    border: '1px solid #94a3b8',
                                    color: '#64748b',
                                    background: 'transparent',
                                    fontSize: '0.75rem',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                }}
                            >
                                Reset
                            </button>
                        )}
                    </div>
                )}
            </CardBody>
        </Card>
    );
};

export default THCSStudentProgressCard;
