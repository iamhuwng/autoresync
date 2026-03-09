import React from 'react';
import { Card, CardBody } from '../modern';
import {
    IconCheck,
    IconBook,
    IconCalendar,
    IconChevronRight
} from '@tabler/icons-react';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultCardProps {
    result: EnhancedTestResultRecord;
    onClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

/**
 * ResultCard Component
 * 
 * Displays a single test result in a card format for academic record views.
 * Shows key information: title, score, course/module context, date, and feedback status.
 * 
 * Features:
 * - Score percentage with color coding (green ≥70%, yellow ≥50%, red <50%)
 * - Course and module name display
 * - Feedback indicator when teacher feedback exists
 * - Formatted submission date
 * - Click handler for navigation to result details
 * - Skill badge (Reading, Listening, Writing, Speaking)
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const ResultCard: React.FC<ResultCardProps> = ({
    result,
    onClick,
    variant = 'glass'
}) => {
    const hasFeedback = !!(result.overallFeedback || result.questionResults?.some(q => q.teacherFeedback));

    // Determine score color
    const getScoreColor = (percentage: number): string => {
        if (percentage >= 70) return '#10b981'; // green
        if (percentage >= 50) return '#f59e0b'; // yellow/amber
        return '#ef4444'; // red
    };

    // Format date
    const formatDate = (timestamp: number): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    };

    // Get skill badge color
    const getSkillColor = (skill: string): string => {
        const colors: Record<string, string> = {
            reading: 'blue',
            listening: 'grape',
            writing: 'teal',
            speaking: 'orange',
            mixed: 'violet',
        };
        return colors[skill.toLowerCase()] || 'gray';
    };

    const handleClick = () => {
        if (onClick) {
            onClick(result.resultId);
        }
    };

    return (
        <Card
            variant={variant}
            hover={!!onClick}
            onClick={handleClick}
            style={{
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
            }}
        >
            <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Header: Title and Score */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ color: '#1e293b', lineHeight: 1.3, marginBottom: '0.25rem', fontWeight: 600, fontSize: '1rem' }}>
                                {result.testTitle}
                            </div>

                            {/* Badges: Skill, Test Type, and Marking Status */}
                            <div style={{ display: 'flex', gap: '0.375rem', marginTop: 4, flexWrap: 'wrap' }}>
                                <span style={{ ...badgeBase, ...badgeLightByName(getSkillColor(result.testSkill)), textTransform: 'capitalize' }}>
                                    {result.testSkill}
                                </span>
                                <span style={{ ...badgeBase, border: '1px solid #d1d5db', background: '#ffffff', color: '#6b7280' }}>
                                    {result.testType}
                                </span>
                                {/* PRD-0015: Phase 7 & 8 - Pending Review Badge */}
                                {result.markingStatus === 'pending-review' && (
                                    <span style={{
                                            ...badgeBase,
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                            color: '#ffffff',
                                            fontWeight: 600,
                                            border: 'none',
                                        }}
                                    >
                                        ⏳ Pending Review
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Score Display - PRD-0015: Phase 7 & 8 */}
                        <div style={{ textAlign: 'right' }}>
                            {result.markingStatus === 'pending-review' ? (
                                <>
                                    <div style={{ color: '#f59e0b', lineHeight: 1, fontSize: '1rem', fontWeight: 600 }}>
                                        Pending
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                        Awaiting review
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ color: getScoreColor(result.percentage), lineHeight: 1, fontSize: '1.25rem', fontWeight: 700 }}>
                                        {/* THCS: show scaledScore/10, IELTS: show percentage */}
                                        {(result as any).thcsData?.scaledScore !== undefined
                                            ? `${(result as any).thcsData.scaledScore.toFixed(1)}/10`
                                            : `${Math.round(result.percentage)}%`
                                        }
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                        {result.correct}/{result.totalQuestions}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Course and Module Context - PRD-0015: Phase 10 - Orphaned Results Handling */}
                    {(result.courseName || result.moduleName || result.courseId === null) && (
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* Handle orphaned results (null courseId) */}
                            {result.courseId === null ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <IconBook size={14} style={{ color: '#94a3b8' }} />
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                        Unassigned Course
                                    </span>
                                    <span style={{ ...badgeBase, background: '#f8fafc', color: '#64748b', marginLeft: 4 }}>
                                        No academic link
                                    </span>
                                </div>
                            ) : (
                                <>
                                    {result.courseName && (
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <IconBook size={14} style={{ color: '#64748b' }} />
                                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                                {result.courseName}
                                            </span>
                                        </div>
                                    )}
                                    {result.moduleName && (
                                        <>
                                            {result.courseName && (
                                                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>•</span>
                                            )}
                                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                                {result.moduleName}
                                            </span>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Footer: Date and Feedback Indicator */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <IconCalendar size={14} style={{ color: '#64748b' }} />
                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                {formatDate(result.submittedAt)}
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                            {hasFeedback && (
                                <span style={{ ...badgeBase, ...badgeLightByName('green'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <IconCheck size={12} />
                                    Has Feedback
                                </span>
                            )}

                            {onClick && (
                                <IconChevronRight size={16} style={{ color: '#94a3b8' }} />
                            )}
                        </div>
                    </div>
                </div>
            </CardBody>
        </Card>
    );
};

const badgeBase: React.CSSProperties = {
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: '0.6875rem',
    fontWeight: 600,
    border: '1px solid transparent',
};

function badgeLightByName(name: string): React.CSSProperties {
    const map: Record<string, React.CSSProperties> = {
        blue: { background: '#eff6ff', color: '#1d4ed8' },
        grape: { background: '#f3e8ff', color: '#7e22ce' },
        teal: { background: '#f0fdfa', color: '#0f766e' },
        orange: { background: '#fff7ed', color: '#c2410c' },
        violet: { background: '#f5f3ff', color: '#6d28d9' },
        gray: { background: '#f8fafc', color: '#64748b' },
        green: { background: '#ecfdf5', color: '#047857' },
    };
    return map[name] || map.gray;
}
