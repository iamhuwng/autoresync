/**
 * DeprecatedAudioBadge Component
 * 
 * Warning badge for tests using deprecated Google Drive audio.
 * Shows visual indicator prompting teachers to re-upload audio.
 * 
 * @see PRD-0018: Unified Audio Architecture - Google Drive Deprecation
 */

import React, { useState } from 'react';

// ============================================================
// TYPES
// ============================================================

export interface DeprecatedAudioBadgeProps {
    /** Whether to show the badge */
    show?: boolean;

    /** Size variant */
    size?: 'small' | 'medium' | 'large';

    /** Show as banner instead of badge */
    variant?: 'badge' | 'banner';

    /** Custom class name */
    className?: string;
}

// ============================================================
// HELPER
// ============================================================

/**
 * Check if a URL is a Google Drive URL
 */
export const isGoogleDriveUrl = (url: string): boolean => {
    if (!url) return false;
    return url.includes('drive.google.com') ||
        url.includes('docs.google.com/file') ||
        url.includes('drive.usercontent.google.com');
};

/**
 * Check if any audio section uses Google Drive
 */
export const hasGoogleDriveAudio = (audioSections: Array<{ audioUrl?: string }>): boolean => {
    return audioSections.some(section => section.audioUrl && isGoogleDriveUrl(section.audioUrl));
};

// ============================================================
// STYLES
// ============================================================

const styles: Record<string, React.CSSProperties> = {
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 500,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        color: 'var(--warning-dark, #b45309)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        cursor: 'help',
        position: 'relative' as const,
    },
    badgeMedium: {
        padding: '0.375rem 0.625rem',
        fontSize: '0.8125rem',
    },
    badgeLarge: {
        padding: '0.5rem 0.75rem',
        fontSize: '0.875rem',
    },
    banner: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        fontSize: '0.875rem',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        color: 'var(--warning-dark, #b45309)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        marginBottom: '1rem',
    },
    icon: {
        fontSize: '1rem',
        flexShrink: 0,
    },
    text: {
        flex: 1,
    },
    tooltip: {
        position: 'absolute' as const,
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: '0.5rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--bg-tooltip, #1f2937)',
        color: 'white',
        borderRadius: '6px',
        fontSize: '0.75rem',
        lineHeight: 1.4,
        width: '220px',
        textAlign: 'center' as const,
        zIndex: 100,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    },
    tooltipArrow: {
        position: 'absolute' as const,
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: '6px solid var(--bg-tooltip, #1f2937)',
    },
    bannerAction: {
        padding: '0.375rem 0.75rem',
        backgroundColor: 'var(--warning, #f59e0b)',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
        transition: 'background-color 0.15s ease',
    },
};

// ============================================================
// COMPONENT
// ============================================================

export const DeprecatedAudioBadge: React.FC<DeprecatedAudioBadgeProps> = ({
    show = true,
    size = 'small',
    variant = 'badge',
    className,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);

    if (!show) return null;

    if (variant === 'banner') {
        return (
            <div style={styles.banner} className={className} role="alert">
                <span style={styles.icon}>⚠️</span>
                <span style={styles.text}>
                    <strong>Audio source deprecated.</strong> This test uses Google Drive audio which
                    is no longer supported. Please re-upload the audio files to ensure reliable playback.
                </span>
            </div>
        );
    }

    // Badge variant
    const sizeStyle = size === 'medium'
        ? styles.badgeMedium
        : size === 'large'
            ? styles.badgeLarge
            : {};

    return (
        <span
            style={{ ...styles.badge, ...sizeStyle }}
            className={className}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)}
            onBlur={() => setShowTooltip(false)}
            tabIndex={0}
            role="status"
            aria-label="Deprecated audio source warning"
        >
            <span>⚠️</span>
            <span>Deprecated Audio</span>

            {showTooltip && (
                <div style={styles.tooltip}>
                    Google Drive audio is deprecated. Please re-upload the audio files for reliable playback.
                    <div style={styles.tooltipArrow} />
                </div>
            )}
        </span>
    );
};

export default DeprecatedAudioBadge;
