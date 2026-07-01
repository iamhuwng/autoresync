/**
 * ParsingProgressScreen Component
 * 
 * Displays real-time progress during test parsing.
 * Shows stage indicators, progress bar, and cancel option.
 * 
 * Features:
 * - Stage indicators (Converting → Extracting → Classifying → Validating)
 * - Animated progress bar with percentage
 * - Cancel button
 * - Error state with retry option
 * - Resume capability (when checkpoint exists)
 * 
 * Design follows existing patterns:
 * - Glass card styling
 * - Consistent color scheme (purple gradient for primary actions)
 * - Smooth animations
 * 
 * @module ParsingProgressScreen
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 6, Task 6.2
 */

import React, { useMemo } from 'react';
import { Card, CardBody, Button } from '../modern';
import {
    IconFileText,
    IconBrain,
    IconListCheck,
    IconShieldCheck,
    IconCheck,
    IconX,
    IconRefresh,
} from '@tabler/icons-react';

const Loader: React.FC<{ size?: 'lg' | number; color?: string }> = ({
    size = 'lg',
    color = '#8b5cf6',
}) => {
    const resolvedSize = size === 'lg' ? 40 : size;

    return (
        <svg
            aria-label="Loading"
            role="img"
            width={resolvedSize}
            height={resolvedSize}
            viewBox="0 0 40 40"
            fill="none"
        >
            <circle cx="20" cy="20" r="16" stroke="rgba(255,255,255,0.35)" strokeWidth="4" />
            <path
                d="M36 20a16 16 0 0 1-16 16"
                stroke={color}
                strokeWidth="4"
                strokeLinecap="round"
            />
        </svg>
    );
};

interface ProgressProps {
    value: number;
    styles?: {
        root?: React.CSSProperties;
    };
}

const Progress: React.FC<ProgressProps> = ({
    value,
    styles,
}) => {
    const boundedValue = Math.max(0, Math.min(100, value));

    return (
        <div
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={boundedValue}
            role="progressbar"
            style={{
                height: '1rem',
                borderRadius: '999px',
                overflow: 'hidden',
                background: '#e2e8f0',
                ...styles?.root,
            }}
        >
            <div
                style={{
                    width: `${boundedValue}%`,
                    height: '100%',
                    borderRadius: '999px',
                    background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)',
                    transition: 'width 0.3s ease',
                }}
            />
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ParsingStage =
    | 'converting'    // File → Text
    | 'extracting'    // AI extraction
    | 'classifying'   // Rule-based classification
    | 'validating'    // Comparison & validation
    | 'complete'      // All done
    | 'error';        // Error occurred

interface StageInfo {
    id: ParsingStage;
    label: string;
    description: string;
    icon: React.ReactNode;
}

export interface ParsingProgressScreenProps {
    /** Current parsing stage */
    stage: ParsingStage;
    /** Progress percentage (0-100) */
    progress: number;
    /** Current operation message */
    message?: string;
    /** Error message (when stage is 'error') */
    error?: string;
    /** Whether a checkpoint exists for resume */
    hasCheckpoint?: boolean;
    /** Callback when parsing completes successfully */
    onComplete?: (draftId: string) => void;
    /** Callback to cancel parsing */
    onCancel: () => void;
    /** Callback to retry after error */
    onRetry?: () => void;
    /** Callback to resume from checkpoint */
    onResume?: () => void;
    /** Estimated time remaining (seconds) */
    estimatedTimeRemaining?: number;
    /** Draft ID for the parsed test (available when complete) */
    draftId?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STAGES: StageInfo[] = [
    {
        id: 'converting',
        label: 'Converting',
        description: 'Extracting text from document',
        icon: <IconFileText size={24} />,
    },
    {
        id: 'extracting',
        label: 'Extracting',
        description: 'AI analyzing passages & questions',
        icon: <IconBrain size={24} />,
    },
    {
        id: 'classifying',
        label: 'Classifying',
        description: 'Identifying question types',
        icon: <IconListCheck size={24} />,
    },
    {
        id: 'validating',
        label: 'Validating',
        description: 'Checking completeness & accuracy',
        icon: <IconShieldCheck size={24} />,
    },
];

const STAGE_ORDER: Record<ParsingStage, number> = {
    converting: 0,
    extracting: 1,
    classifying: 2,
    validating: 3,
    complete: 4,
    error: -1,
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export const ParsingProgressScreen: React.FC<ParsingProgressScreenProps> = ({
    stage,
    progress,
    message,
    error,
    hasCheckpoint = false,
    onComplete,
    onCancel,
    onRetry,
    onResume,
    estimatedTimeRemaining,
    draftId,
}) => {
    // Calculate which stages are complete/active/pending
    const stageStatuses = useMemo(() => {
        const currentIndex = STAGE_ORDER[stage];
        return STAGES.map((s, index) => ({
            ...s,
            status: index < currentIndex ? 'complete' as const
                : index === currentIndex ? 'active' as const
                    : 'pending' as const,
        }));
    }, [stage]);

    // Format time remaining
    const formattedTimeRemaining = useMemo(() => {
        if (!estimatedTimeRemaining) return null;
        if (estimatedTimeRemaining < 60) {
            return `~${Math.ceil(estimatedTimeRemaining)}s remaining`;
        }
        const minutes = Math.floor(estimatedTimeRemaining / 60);
        const seconds = Math.ceil(estimatedTimeRemaining % 60);
        return `~${minutes}m ${seconds}s remaining`;
    }, [estimatedTimeRemaining]);

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────

    return (
        <div
            style={{
                maxWidth: '600px',
                margin: '0 auto',
                animation: 'fadeIn 0.5s ease-out',
            }}
        >
            <Card variant="glass">
                <CardBody style={{ padding: '2.5rem 2rem' }}>
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        {stage === 'complete' ? (
                            <div
                                style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1.5rem',
                                    boxShadow: '0 10px 30px rgba(34, 197, 94, 0.3)',
                                    animation: 'scaleIn 0.5s ease-out',
                                }}
                            >
                                <IconCheck size={40} color="white" />
                            </div>
                        ) : stage === 'error' ? (
                            <div
                                style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1.5rem',
                                    boxShadow: '0 10px 30px rgba(239, 68, 68, 0.3)',
                                }}
                            >
                                <IconX size={40} color="white" />
                            </div>
                        ) : (
                            <div
                                style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1.5rem',
                                    boxShadow: '0 10px 30px rgba(139, 92, 246, 0.3)',
                                }}
                            >
                                <Loader size="lg" color="white" />
                            </div>
                        )}

                        <h2
                            style={{
                                fontSize: '1.5rem',
                                fontWeight: '800',
                                color: '#1e293b',
                                marginBottom: '0.5rem',
                            }}
                        >
                            {stage === 'complete' && 'Parsing Complete!'}
                            {stage === 'error' && 'Parsing Failed'}
                            {stage !== 'complete' && stage !== 'error' && 'Parsing Your Test...'}
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>
                            {message || 'Please wait while we process your document'}
                        </p>
                    </div>

                    {/* Error Message */}
                    {stage === 'error' && error && (
                        <div
                            style={{
                                padding: '1rem 1.25rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: '12px',
                                marginBottom: '1.5rem',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                            }}
                        >
                            <p style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: '600', margin: 0 }}>
                                ⚠️ {error}
                            </p>
                        </div>
                    )}

                    {/* Stage Indicators */}
                    {stage !== 'error' && (
                        <div style={{ marginBottom: '2rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    position: 'relative',
                                }}
                            >
                                {/* Progress Line */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '20px',
                                        left: '40px',
                                        right: '40px',
                                        height: '4px',
                                        background: '#e2e8f0',
                                        borderRadius: '2px',
                                        zIndex: 0,
                                    }}
                                >
                                    <div
                                        style={{
                                            height: '100%',
                                            width: `${Math.min(100, (STAGE_ORDER[stage] / (STAGES.length - 1)) * 100)}%`,
                                            background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)',
                                            borderRadius: '2px',
                                            transition: 'width 0.5s ease',
                                        }}
                                    />
                                </div>

                                {/* Stage Icons */}
                                {stageStatuses.map((s) => (
                                    <div
                                        key={s.id}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            width: '80px',
                                            zIndex: 1,
                                        }}
                                        aria-current={s.status === 'active' ? 'step' : undefined}
                                        aria-label={`${s.label}: ${s.status}`}
                                    >
                                        <div
                                            style={{
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: s.status === 'complete'
                                                    ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                                    : s.status === 'active'
                                                        ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                                                        : '#e2e8f0',
                                                color: s.status === 'pending' ? '#94a3b8' : 'white',
                                                transition: 'all 0.3s ease',
                                                boxShadow: s.status === 'active'
                                                    ? '0 4px 15px rgba(139, 92, 246, 0.4)'
                                                    : 'none',
                                            }}
                                        >
                                            {s.status === 'complete' ? (
                                                <IconCheck size={20} />
                                            ) : s.status === 'active' ? (
                                                <div style={{ animation: 'pulse 2s infinite' }}>
                                                    {s.icon}
                                                </div>
                                            ) : (
                                                s.icon
                                            )}
                                        </div>
                                        <span
                                            style={{
                                                marginTop: '0.5rem',
                                                fontSize: '0.75rem',
                                                fontWeight: s.status === 'active' ? '700' : '600',
                                                color: s.status === 'pending' ? '#94a3b8' : '#334155',
                                                textAlign: 'center',
                                            }}
                                        >
                                            {s.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Progress Bar */}
                    {stage !== 'complete' && stage !== 'error' && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#334155' }}>
                                    Progress
                                </span>
                                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#8b5cf6' }}>
                                    {Math.round(progress)}%
                                </span>
                            </div>
                            <Progress
                                value={progress}
                                styles={{
                                    root: { background: '#e2e8f0' },
                                }}
                            />
                            {formattedTimeRemaining && (
                                <p
                                    style={{
                                        marginTop: '0.5rem',
                                        fontSize: '0.8125rem',
                                        color: '#64748b',
                                        textAlign: 'right',
                                    }}
                                >
                                    {formattedTimeRemaining}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        {stage === 'error' && (
                            <>
                                <Button variant="glass" onClick={onCancel}>
                                    Cancel
                                </Button>
                                {hasCheckpoint && onResume && (
                                    <Button variant="primary" onClick={onResume}>
                                        <IconRefresh size={18} style={{ marginRight: '0.5rem' }} />
                                        Resume from Checkpoint
                                    </Button>
                                )}
                                {onRetry && (
                                    <Button variant="primary" onClick={onRetry}>
                                        <IconRefresh size={18} style={{ marginRight: '0.5rem' }} />
                                        Try Again
                                    </Button>
                                )}
                            </>
                        )}

                        {stage === 'complete' && onComplete && draftId && (
                            <Button
                                variant="primary"
                                onClick={() => onComplete(draftId)}
                                style={{ minWidth: '180px' }}
                            >
                                Continue to Review →
                            </Button>
                        )}

                        {stage !== 'complete' && stage !== 'error' && (
                            <Button
                                variant="glass"
                                onClick={onCancel}
                                style={{ minWidth: '120px' }}
                            >
                                Cancel
                            </Button>
                        )}
                    </div>
                </CardBody>
            </Card>

            {/* Animations */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                }
            `}</style>
        </div>
    );
};

export default ParsingProgressScreen;
