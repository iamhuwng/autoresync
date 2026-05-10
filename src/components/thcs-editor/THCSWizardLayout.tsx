/**
 * THCSWizardLayout — Wraps the 4-step wizard with TeacherHeader + AppShell + stepper.
 * Provides consistent teacher view design language with the standard gradient background,
 * glassmorphism cards, and violet accent palette.
 */
import React from 'react';
import { AppShell } from '@mantine/core';
import { useAuth } from '../../hooks/useAuth';
import { TeacherHeader } from '../navigation';
import THCSWizardStepper, { WIZARD_STEPS, type WizardStep } from './THCSWizardStepper';

export interface THCSWizardLayoutProps {
    /** Current active step (0-indexed) */
    currentStep: number;
    /** Whether teacher is editing an existing draft (enables free navigation) */
    isEditMode: boolean;
    /** Callback to change step */
    onStepChange: (step: number) => void;
    /** Save status text */
    saveStatusText?: string;
    /** Children render the active step content */
    children: React.ReactNode;
    /** Footer with navigation buttons (Back/Next/Publish) */
    footer?: React.ReactNode;
    /** Render as a full page or embedded inside an existing modal shell */
    presentation?: 'page' | 'embedded';
    /** Optional step config override for shared-modal branches like Paste Text */
    steps?: WizardStep[];
}

const THCSWizardLayout: React.FC<THCSWizardLayoutProps> = ({
    currentStep,
    isEditMode,
    onStepChange,
    saveStatusText,
    children,
    footer,
    presentation = 'page',
    steps = WIZARD_STEPS,
}) => {
    const { user, profile, logout } = useAuth();

    const saveStatusColor = saveStatusText?.includes('Saving')
        ? '#f59e0b'
        : saveStatusText?.includes('Saved')
            ? '#10b981'
            : saveStatusText?.includes('Unsaved')
                ? '#ef4444'
                : '#94a3b8';

    const isEmbedded = presentation === 'embedded';

    const wizardContent = isEmbedded ? (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
        }}>
            <div style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0,
                padding: '1.5rem 1.5rem 0',
                animation: 'wizardFadeIn 0.3s ease-out',
            }}>
                {children}
            </div>

            {footer && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    flexShrink: 0,
                    borderTop: '1px solid rgba(139, 92, 246, 0.1)',
                    background: 'rgba(255,255,255,0.95)',
                }}>
                    {footer}
                </div>
            )}
        </div>
    ) : (
        <div style={{
            maxWidth: '900px',
            margin: '0 auto',
            padding: '1.5rem 1.5rem',
        }}>
            <THCSWizardStepper
                steps={steps}
                currentStep={currentStep}
                freeNavigation={isEditMode}
                onStepClick={onStepChange}
                saveStatusText={saveStatusText}
                saveStatusColor={saveStatusColor}
                presentation="page"
            />

            <div style={{
                animation: 'wizardFadeIn 0.3s ease-out',
            }}>
                {children}
            </div>

            {footer && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    marginTop: '1.5rem',
                    background: 'rgba(255,255,255,0.5)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    borderRadius: '1.25rem',
                    border: '1px solid rgba(148,163,184,0.2)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                }}>
                    {footer}
                </div>
            )}
        </div>
    );

    return (
        <div style={{
            minHeight: isEmbedded ? 0 : (presentation === 'page' ? '100vh' : undefined),
            flex: isEmbedded ? 1 : undefined,
            display: isEmbedded ? 'flex' : undefined,
            flexDirection: isEmbedded ? 'column' : undefined,
            minWidth: isEmbedded ? 0 : undefined,
            background: presentation === 'page'
                ? 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)'
                : undefined,
            backgroundAttachment: presentation === 'page' ? 'fixed' : undefined,
        }}>
            {presentation === 'embedded' ? wizardContent : (
                <AppShell padding="md">
                    <TeacherHeader
                        pageTitle="THCS-THPT Test Editor"
                        userId={user?.uid}
                        userRole={profile?.role}
                        userDisplayName={profile?.displayName || user?.displayName || user?.email}
                        userEmail={profile?.email || user?.email}
                        userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                        onLogout={logout}
                    />

                    <AppShell.Main>
                        {wizardContent}
                    </AppShell.Main>
                </AppShell>
            )}

            <style>{`
                @keyframes wizardFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default THCSWizardLayout;
