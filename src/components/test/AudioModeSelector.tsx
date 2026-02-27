/**
 * AudioModeSelector Component
 * 
 * Required selection for listening test sessions.
 * Teachers must choose between online (remote) and offline (classroom) mode.
 * 
 * @see PRD-0018: Unified Audio Architecture - Audio Mode Selection
 */

import React from 'react';
import type { AudioMode } from '../../types/audio.types';

// ============================================================
// TYPES
// ============================================================

export interface AudioModeSelectorProps {
    /** Currently selected mode (undefined = not selected) */
    value: AudioMode | undefined;

    /** Callback when mode is selected */
    onChange: (mode: AudioMode) => void;

    /** Whether selection is required (shows warning if not selected) */
    required?: boolean;

    /** Whether the selector is disabled (after test starts) */
    disabled?: boolean;

    /** Last used mode (for suggestion) */
    lastUsedMode?: AudioMode;

    /** Custom class name */
    className?: string;
}

// ============================================================
// STYLES
// ============================================================

const styles: Record<string, React.CSSProperties> = {
    container: {
        marginBottom: '1.5rem',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.75rem',
    },
    headerIcon: {
        fontSize: '1.25rem',
    },
    headerText: {
        fontSize: '1rem',
        fontWeight: 600,
        color: 'var(--text-primary, #1a1a2e)',
    },
    requiredBadge: {
        fontSize: '0.75rem',
        color: 'var(--error, #e53e3e)',
        marginLeft: '0.25rem',
    },
    suggestion: {
        fontSize: '0.875rem',
        color: 'var(--text-secondary, #6b7280)',
        marginBottom: '0.75rem',
        fontStyle: 'italic',
    },
    cardsContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
    },
    card: {
        border: '2px solid var(--border-color, #e5e7eb)',
        borderRadius: '12px',
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        backgroundColor: 'var(--bg-secondary, #f9fafb)',
    },
    cardSelected: {
        borderColor: 'var(--primary, #3b82f6)',
        backgroundColor: 'var(--primary-light, #eff6ff)',
        boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
    },
    cardDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed',
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.75rem',
    },
    radioCircle: {
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        border: '2px solid var(--border-color, #d1d5db)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease',
    },
    radioCircleSelected: {
        borderColor: 'var(--primary, #3b82f6)',
        backgroundColor: 'var(--primary, #3b82f6)',
    },
    radioInner: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: 'white',
    },
    cardTitle: {
        fontWeight: 600,
        fontSize: '1rem',
        color: 'var(--text-primary, #1a1a2e)',
    },
    cardIcon: {
        fontSize: '1.5rem',
        marginBottom: '0.5rem',
    },
    cardDescription: {
        fontSize: '0.875rem',
        color: 'var(--text-secondary, #6b7280)',
        lineHeight: 1.5,
    },
    cardFeature: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        marginTop: '0.5rem',
        fontSize: '0.8125rem',
        color: 'var(--text-secondary, #6b7280)',
    },
    featureIcon: {
        fontSize: '0.875rem',
        marginTop: '0.125rem',
    },
    warning: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginTop: '1rem',
        padding: '0.75rem 1rem',
        backgroundColor: 'var(--warning-bg, #fffbeb)',
        border: '1px solid var(--warning-border, #fbbf24)',
        borderRadius: '8px',
        color: 'var(--warning-text, #92400e)',
        fontSize: '0.875rem',
    },
    warningIcon: {
        fontSize: '1rem',
    },
    disabledNote: {
        marginTop: '0.75rem',
        fontSize: '0.8125rem',
        color: 'var(--text-tertiary, #9ca3af)',
        fontStyle: 'italic',
    },
};

// ============================================================
// COMPONENT
// ============================================================

export const AudioModeSelector: React.FC<AudioModeSelectorProps> = ({
    value,
    onChange,
    required = true,
    disabled = false,
    lastUsedMode,
    className,
}) => {
    const handleSelect = (mode: AudioMode) => {
        if (disabled) return;
        onChange(mode);
    };

    const renderCard = (mode: AudioMode, icon: string, title: string, features: string[]) => {
        const isSelected = value === mode;

        return (
            <div
                style={{
                    ...styles.card,
                    ...(isSelected ? styles.cardSelected : {}),
                    ...(disabled ? styles.cardDisabled : {}),
                }}
                onClick={() => handleSelect(mode)}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(mode);
                    }
                }}
                aria-pressed={isSelected}
                aria-disabled={disabled}
            >
                <div style={styles.cardHeader}>
                    <div
                        style={{
                            ...styles.radioCircle,
                            ...(isSelected ? styles.radioCircleSelected : {}),
                        }}
                    >
                        {isSelected && <div style={styles.radioInner} />}
                    </div>
                    <span style={styles.cardTitle}>{title}</span>
                </div>

                <div style={styles.cardIcon}>{icon}</div>

                <div style={styles.cardDescription}>
                    {features.map((feature, index) => (
                        <div key={index} style={styles.cardFeature}>
                            <span style={styles.featureIcon}>•</span>
                            <span>{feature}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={styles.container} className={className}>
            <div style={styles.header}>
                <span style={styles.headerIcon}>🎧</span>
                <span style={styles.headerText}>Classroom Audio Mode</span>
                {required && !value && (
                    <span style={styles.requiredBadge}>(Required)</span>
                )}
            </div>

            {lastUsedMode && !value && (
                <div style={styles.suggestion}>
                    💡 Last time you used: {lastUsedMode === 'online' ? 'Online Class' : 'Offline Class'}
                </div>
            )}

            <div style={styles.cardsContainer}>
                {renderCard(
                    'online',
                    '🌐',
                    'Online Class (Remote)',
                    [
                        'Students at different locations',
                        'Each student hears audio on their device',
                        'Audio synced to your position',
                    ]
                )}

                {renderCard(
                    'offline',
                    '🏫',
                    'Offline Class (Classroom)',
                    [
                        'Students in the same room as you',
                        'Only YOUR device plays audio',
                        'Students see progress, hear from room',
                    ]
                )}
            </div>

            {required && !value && !disabled && (
                <div style={styles.warning}>
                    <span style={styles.warningIcon}>⚠️</span>
                    <span>You must select a mode to start the test</span>
                </div>
            )}

            {disabled && (
                <div style={styles.disabledNote}>
                    🔒 Mode is locked during test. End the test to change mode.
                </div>
            )}
        </div>
    );
};

export default AudioModeSelector;
