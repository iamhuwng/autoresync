/**
 * CompletionChecklist Component
 * 
 * Displays a checklist of required items for test completeness.
 * Shows missing items and blocks publish until all requirements are met.
 * 
 * Features:
 * - Passage count validation
 * - Question count validation
 * - Answer key completeness
 * - Image requirements for diagram questions
 * - Progress indicator
 * - Block publish button until complete
 * 
 * @module CompletionChecklist
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 6, Task 6.6
 */

import React, { useMemo } from 'react';
import { Card, CardBody, Button } from '../modern';
import { Progress, Badge, Tooltip } from '@mantine/core';
import {
    IconCheck,
    IconX,
    IconAlertTriangle,
    IconFileText,
    IconListCheck,
    IconKey,
    IconPhoto,
    IconRocket,
} from '@tabler/icons-react';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface CompletenessCheck {
    id: string;
    label: string;
    description: string;
    status: 'complete' | 'incomplete' | 'warning';
    count?: { current: number; required: number };
    details?: string[];
}

export interface CompletionChecklistProps {
    /** List of completeness checks */
    checks: CompletenessCheck[];
    /** Overall completeness percentage */
    completenessPercent: number;
    /** Whether the test can be published */
    canPublish: boolean;
    /** Callback when publish is clicked */
    onPublish: () => void;
    /** Callback when save draft is clicked */
    onSaveDraft?: () => void;
    /** Whether publish is in progress */
    isPublishing?: boolean;
    /** Callback when answer key warning is clicked */
    onAnswerKeyClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// ICON MAP
// ═══════════════════════════════════════════════════════════════

const ICON_MAP: Record<string, React.ReactNode> = {
    passages: <IconFileText size={18} />,
    questions: <IconListCheck size={18} />,
    answers: <IconKey size={18} />,
    images: <IconPhoto size={18} />,
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export const CompletionChecklist: React.FC<CompletionChecklistProps> = ({
    checks,
    completenessPercent,
    canPublish,
    onPublish,
    onSaveDraft,
    isPublishing = false,
    onAnswerKeyClick,
}) => {
    // Calculate counts
    const { completeCount, totalCount } = useMemo(() => {
        const complete = checks.filter(c => c.status === 'complete').length;
        return { completeCount: complete, totalCount: checks.length };
    }, [checks]);

    // Determine overall status
    const overallStatus = useMemo(() => {
        if (checks.every(c => c.status === 'complete')) return 'complete';
        if (checks.some(c => c.status === 'incomplete')) return 'incomplete';
        return 'warning';
    }, [checks]);

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────

    const renderCheck = (check: CompletenessCheck) => {
        const icon = ICON_MAP[check.id] || <IconListCheck size={16} />;
        const isClickable = check.id === 'answers' && check.status !== 'complete' && onAnswerKeyClick;

        return (
            <div
                key={check.id}
                onClick={isClickable ? onAnswerKeyClick : undefined}
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    padding: '0.5rem 0.625rem',
                    marginBottom: '0.375rem',
                    borderRadius: '8px',
                    background: check.status === 'complete'
                        ? 'rgba(34, 197, 94, 0.06)'
                        : check.status === 'warning'
                            ? 'rgba(245, 158, 11, 0.06)'
                            : 'rgba(239, 68, 68, 0.06)',
                    border: 'none',
                    cursor: isClickable ? 'pointer' : 'default',
                    transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                    if (isClickable) {
                        e.currentTarget.style.background = check.status === 'warning'
                            ? 'rgba(245, 158, 11, 0.12)'
                            : 'rgba(239, 68, 68, 0.12)';
                        e.currentTarget.style.transform = 'translateX(2px)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (isClickable) {
                        e.currentTarget.style.background = check.status === 'warning'
                            ? 'rgba(245, 158, 11, 0.06)'
                            : 'rgba(239, 68, 68, 0.06)';
                        e.currentTarget.style.transform = 'translateX(0)';
                    }
                }}
            >
                {/* Status Icon - compact */}
                <div
                    style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: check.status === 'complete'
                            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                            : check.status === 'warning'
                                ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: 'white',
                    }}
                >
                    {check.status === 'complete' ? (
                        <IconCheck size={14} />
                    ) : check.status === 'warning' ? (
                        <IconAlertTriangle size={14} />
                    ) : (
                        <IconX size={14} />
                    )}
                </div>

                {/* Content - tighter */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#64748b', display: 'flex' }}>{icon}</span>
                        <span style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#1e293b' }}>
                            {check.label}
                        </span>
                        {check.count && (
                            <Badge
                                size="xs"
                                variant="light"
                                color={check.status === 'complete' ? 'green' : check.status === 'warning' ? 'yellow' : 'red'}
                            >
                                {check.count.current}/{check.count.required}
                            </Badge>
                        )}
                    </div>
                    <p style={{
                        margin: '0.125rem 0 0',
                        fontSize: '0.75rem',
                        color: '#64748b',
                        lineHeight: '1.35',
                    }}>
                        {check.description}
                    </p>

                    {/* Details (missing items) - inline */}
                    {check.details && check.details.length > 0 && (
                        <div style={{ marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {check.details.slice(0, 2).map((detail, i) => (
                                <span
                                    key={i}
                                    style={{
                                        fontSize: '0.6875rem',
                                        color: '#94a3b8',
                                        background: 'rgba(148, 163, 184, 0.1)',
                                        padding: '0.125rem 0.375rem',
                                        borderRadius: '4px',
                                    }}
                                >
                                    {detail}
                                </span>
                            ))}
                            {check.details.length > 2 && (
                                <Tooltip
                                    label={check.details.slice(2).join(', ')}
                                    multiline
                                    w={180}
                                >
                                    <span style={{
                                        fontSize: '0.6875rem',
                                        color: '#8b5cf6',
                                        cursor: 'pointer',
                                        background: 'rgba(139, 92, 246, 0.08)',
                                        padding: '0.125rem 0.375rem',
                                        borderRadius: '4px',
                                    }}>
                                        +{check.details.length - 2} more
                                    </span>
                                </Tooltip>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Card variant="glass" style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}>
            <CardBody style={{ padding: '0.875rem' }}>
                {/* Header - compact */}
                <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>
                            Completion Checklist
                        </h3>
                        <Badge
                            size="sm"
                            color={overallStatus === 'complete' ? 'green' : overallStatus === 'warning' ? 'yellow' : 'red'}
                            variant="light"
                        >
                            {completeCount}/{totalCount}
                        </Badge>
                    </div>

                    {/* Progress Bar - thinner */}
                    <Progress
                        value={completenessPercent}
                        size="sm"
                        radius="xl"
                        color={completenessPercent === 100 ? 'green' : completenessPercent >= 70 ? 'yellow' : 'red'}
                        styles={{
                            root: { background: 'rgba(226, 232, 240, 0.6)' },
                        }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.125rem' }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: '600', color: '#94a3b8' }}>
                            {completenessPercent}%
                        </span>
                    </div>
                </div>

                {/* Checklist Items */}
                <div style={{ marginBottom: '0.75rem' }}>
                    {checks.map(renderCheck)}
                </div>

                {/* Action Buttons - stacked for narrow sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Tooltip
                        label={canPublish ? 'Publish test' : 'Complete all required items first'}
                        disabled={canPublish}
                    >
                        <span style={{ display: 'block', width: '100%' }}>
                            <Button
                                variant="primary"
                                onClick={onPublish}
                                disabled={!canPublish || isPublishing}
                                style={{
                                    width: '100%',
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.8125rem',
                                    opacity: canPublish ? 1 : 0.5,
                                }}
                            >
                                {isPublishing ? (
                                    'Publishing...'
                                ) : (
                                    <>
                                        <IconRocket size={16} style={{ marginRight: '0.375rem' }} />
                                        Publish Test
                                    </>
                                )}
                            </Button>
                        </span>
                    </Tooltip>
                    {onSaveDraft && (
                        <Button
                            variant="glass"
                            onClick={onSaveDraft}
                            style={{
                                width: '100%',
                                padding: '0.5rem 1rem',
                                fontSize: '0.8125rem',
                            }}
                        >
                            Save Draft
                        </Button>
                    )}
                </div>

                {/* Warning Message - compact */}
                {!canPublish && (
                    <div
                        style={{
                            marginTop: '0.625rem',
                            padding: '0.5rem 0.625rem',
                            background: 'rgba(245, 158, 11, 0.08)',
                            borderRadius: '6px',
                        }}
                    >
                        <p style={{
                            margin: 0,
                            fontSize: '0.75rem',
                            color: '#92400e',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                        }}>
                            <IconAlertTriangle size={14} />
                            Complete all items before publishing
                        </p>
                    </div>
                )}
            </CardBody>
        </Card>
    );
};

export default CompletionChecklist;
