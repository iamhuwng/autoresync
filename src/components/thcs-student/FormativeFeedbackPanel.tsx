/**
 * FormativeFeedbackPanel — AI Formative Feedback Display
 *
 * Shows skill-level performance analysis with three tiers:
 *   ✅ Strengths (≥80%) — green accent
 *   ⚠️ Needs Revision (50–79%) — amber accent
 *   🔴 Critical Gaps (<50%) — red accent
 *
 * When AI feedback is available, each section includes a short narrative.
 * When only deterministic feedback is available, shows skill bullet points.
 *
 * Follows student-view-design standard: flat cards, no glassmorphism.
 * Spec: specs/ai-formative-assessment-feedback
 * Task: 86hnh4
 */
import React from 'react';
import type { FormativeFeedback } from '../../types/thcs-test.types';

// ═══════════════════════════════════════════════════════════════
// Style Constants (student-view-design compliant)
// ═══════════════════════════════════════════════════════════════

const SECTION_CONFIG = {
    strengths: {
        icon: '✅',
        title: 'Strengths',
        accent: '#059669',
        bg: '#d1fae5',
        border: '#a7f3d0',
        textColor: '#065f46',
    },
    revision: {
        icon: '⚠️',
        title: 'Needs Revision',
        accent: '#d97706',
        bg: '#fef3c7',
        border: '#fde68a',
        textColor: '#92400e',
    },
    critical: {
        icon: '🔴',
        title: 'Critical Gaps',
        accent: '#dc2626',
        bg: '#fee2e2',
        border: '#fecaca',
        textColor: '#991b1b',
    },
} as const;

// ═══════════════════════════════════════════════════════════════
// Sub-Components
// ═══════════════════════════════════════════════════════════════

/** Render one tier section (strengths / revision / critical) */
function TierSection({ aiText, config }: {
    aiText?: string;
    config: typeof SECTION_CONFIG[keyof typeof SECTION_CONFIG];
}) {
    // Only render if there's AI narrative text to show
    if (!aiText || aiText.trim().length === 0) return null;

    return (
        <div style={{
            background: config.bg,
            border: `1px solid ${config.border}`,
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            transition: 'all 0.3s ease',
        }}>
            {/* Section header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.75rem',
            }}>
                <span style={{ fontSize: '1.125rem' }}>{config.icon}</span>
                <span style={{
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    color: config.textColor,
                    letterSpacing: '-0.01em',
                }}>
                    {config.title}
                </span>
            </div>

            {/* AI narrative */}
            <div style={{
                padding: '0.75rem',
                background: 'rgba(255,255,255,0.6)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                lineHeight: '1.6',
                color: '#374151',
                fontStyle: 'italic',
                borderLeft: `3px solid ${config.accent}`,
            }}>
                {aiText}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

interface FormativeFeedbackPanelProps {
    feedback: FormativeFeedback;
}

/**
 * FormativeFeedbackPanel — displays formative analysis below the score card.
 *
 * Usage:
 * ```tsx
 * {result.formativeFeedback && <FormativeFeedbackPanel feedback={result.formativeFeedback} />}
 * ```
 */
export const FormativeFeedbackPanel: React.FC<FormativeFeedbackPanelProps> = ({ feedback }) => {
    const { aiFeedback, aiModel } = feedback;
    // Firebase RTDB drops empty arrays — ensure all tiers are arrays
    const analysis = {
        strengths: Array.isArray(feedback.analysis?.strengths) ? feedback.analysis.strengths : [],
        revision: Array.isArray(feedback.analysis?.revision) ? feedback.analysis.revision : [],
        critical: Array.isArray(feedback.analysis?.critical) ? feedback.analysis.critical : [],
    };
    const hasAnySkills = analysis.strengths.length > 0
        || analysis.revision.length > 0
        || analysis.critical.length > 0;

    return (
        <div
            id="formative-feedback-panel"
            style={{
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* Panel header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                }}>
                    <span style={{ fontSize: '1.25rem' }}>📊</span>
                    <h3 style={{
                        margin: 0,
                        fontSize: '1.125rem',
                        fontWeight: 700,
                        color: '#111827',
                        letterSpacing: '-0.02em',
                    }}>
                        Performance Analysis
                    </h3>
                </div>
                {aiModel && (
                    <span style={{
                        fontSize: '0.6875rem',
                        color: '#9ca3af',
                        background: '#f3f4f6',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '999px',
                        fontWeight: 500,
                    }}>
                        AI-enhanced
                    </span>
                )}
            </div>

            {/* Summary line */}
            <div style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: '#111827',
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                background: '#f9fafb',
                borderRadius: '10px',
                border: '1px solid #f3f4f6',
            }}>
                {aiFeedback?.summary || (
                    <>
                        You achieved{' '}
                        <span style={{ color: '#4f46e5', fontWeight: 700 }}>
                            {feedback.totalCorrect}/{feedback.totalQuestions}
                        </span>
                        {' '}correct answers{' '}
                        <span style={{ color: '#6b7280', fontWeight: 500 }}>
                            ({feedback.scaledScore.toFixed(1)}/10)
                        </span>
                    </>
                )}
            </div>

            {/* Tier sections */}
            {hasAnySkills ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                }}>
                    <TierSection
                        aiText={aiFeedback?.strengths}
                        config={SECTION_CONFIG.strengths}
                    />
                    <TierSection
                        aiText={aiFeedback?.revision}
                        config={SECTION_CONFIG.revision}
                    />
                    <TierSection
                        aiText={aiFeedback?.critical}
                        config={SECTION_CONFIG.critical}
                    />
                </div>
            ) : (
                /* Fallback: show deterministic text if no skill breakdown */
                <div style={{
                    fontSize: '0.875rem',
                    lineHeight: '1.7',
                    color: '#374151',
                    whiteSpace: 'pre-line',
                    padding: '0.75rem 1rem',
                    background: '#f9fafb',
                    borderRadius: '10px',
                }}>
                    {feedback.deterministicFeedback}
                </div>
            )}
        </div>
    );
};

export default FormativeFeedbackPanel;
