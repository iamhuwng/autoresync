/**
 * THCSWizardStepper — Horizontal step indicator for the 4-step test creation wizard.
 * Shows current step (violet), completed steps (green ✓), and upcoming steps (gray).
 * Also displays save status on the right side (always visible).
 */
import React from 'react';

export interface WizardStep {
    label: string;
    icon: string;
}

export interface THCSWizardStepperProps {
    steps: WizardStep[];
    currentStep: number;
    /** Allow clicking any completed step (or all steps in edit mode) */
    freeNavigation?: boolean;
    onStepClick?: (step: number) => void;
    /** Save status indicator text */
    saveStatusText?: string;
    /** Save status color */
    saveStatusColor?: string;
}

const THCSWizardStepper: React.FC<THCSWizardStepperProps> = ({
    steps,
    currentStep,
    freeNavigation = false,
    onStepClick,
    saveStatusText,
    saveStatusColor = '#94a3b8',
}) => {
    const isClickable = (idx: number) => {
        if (freeNavigation) return true;
        return idx < currentStep; // Only completed steps are clickable in sequential mode
    };

    return (
        <div style={{
            position: 'relative',
            padding: '1rem 1.5rem',
            background: 'rgba(255,255,255,0.5)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: '1.25rem',
            border: '1px solid rgba(148,163,184,0.2)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            marginBottom: '1.5rem',
        }}>
            {/* Steps — centered row */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
            }}>
                {steps.map((step, idx) => {
                    const isActive = idx === currentStep;
                    const isCompleted = idx < currentStep;
                    const clickable = isClickable(idx) && idx !== currentStep;

                    return (
                        <React.Fragment key={idx}>
                            {/* Step circle + label */}
                            <button
                                onClick={() => clickable && onStepClick?.(idx)}
                                disabled={!clickable}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.5rem 0.75rem',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    cursor: clickable ? 'pointer' : 'default',
                                    background: isActive
                                        ? 'rgba(139,92,246,0.1)'
                                        : 'transparent',
                                    transition: 'all 0.2s ease',
                                    opacity: !isActive && !isCompleted ? 0.5 : 1,
                                }}
                            >
                                {/* Circle */}
                                <div style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    flexShrink: 0,
                                    transition: 'all 0.3s ease',
                                    background: isCompleted
                                        ? '#10b981'
                                        : isActive
                                            ? '#8b5cf6'
                                            : '#e2e8f0',
                                    color: isCompleted || isActive ? '#fff' : '#94a3b8',
                                    boxShadow: isActive
                                        ? '0 0 0 3px rgba(139,92,246,0.2)'
                                        : 'none',
                                }}>
                                    {isCompleted ? '✓' : idx + 1}
                                </div>

                                {/* Label */}
                                <span style={{
                                    fontSize: '0.8125rem',
                                    fontWeight: isActive ? 700 : 500,
                                    color: isActive ? '#8b5cf6' : isCompleted ? '#1e293b' : '#94a3b8',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {step.icon} {step.label}
                                </span>
                            </button>

                            {/* Connector line */}
                            {idx < steps.length - 1 && (
                                <div style={{
                                    width: 40,
                                    height: 2,
                                    flexShrink: 0,
                                    background: idx < currentStep
                                        ? '#10b981'
                                        : '#e2e8f0',
                                    borderRadius: 1,
                                    transition: 'background 0.3s ease',
                                }} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Save Status — floating badge, top-right corner */}
            {saveStatusText && (
                <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: saveStatusColor,
                    whiteSpace: 'nowrap',
                    padding: '0.2rem 0.625rem',
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: '1rem',
                    border: `1px solid ${saveStatusColor}22`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                    <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: saveStatusColor,
                        flexShrink: 0,
                    }} />
                    {saveStatusText}
                </div>
            )}
        </div>
    );
};

export const WIZARD_STEPS: WizardStep[] = [
    { label: 'Test Setup', icon: '📋' },
    { label: 'Questions', icon: '✏️' },
    { label: 'Answer Key', icon: '🔑' },
    { label: 'Review & Publish', icon: '✅' },
];

export default THCSWizardStepper;
