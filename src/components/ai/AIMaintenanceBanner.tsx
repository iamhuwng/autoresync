/**
 * AIMaintenanceBanner
 *
 * Displays a prominent banner when all AI API keys are exhausted or cooling down.
 * Uses the `useAIStatus` hook to poll availability and auto-dismisses when
 * keys recover.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useAIStatus } from '../../hooks/useAIStatus';

const bannerStyle: React.CSSProperties = {
    background: '#fff7ed',
    border: '1px solid #fdba74',
    borderRadius: '1rem',
    padding: '1rem 1.25rem',
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-start',
    marginBottom: '1rem',
    color: '#92400e',
    position: 'relative',
};

const iconContainerStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: '#ffedd5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
};

const contentStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
};

const titleStyle: React.CSSProperties = {
    fontWeight: 700,
    fontSize: '0.95rem',
    marginBottom: '0.25rem',
    color: '#92400e',
};

const messageStyle: React.CSSProperties = {
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: '#a16207',
};

const detailsStyle: React.CSSProperties = {
    marginTop: '0.5rem',
    fontSize: '0.8rem',
    color: '#b45309',
    opacity: 0.85,
};

const retryButtonStyle: React.CSSProperties = {
    background: 'rgba(245,158,11,0.2)',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: '0.5rem',
    padding: '0.375rem 0.75rem',
    minWidth: 44,
    minHeight: 44,
    color: '#92400e',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
    flexShrink: 0,
    alignSelf: 'center',
    transition: 'background 0.2s',
};

const dismissButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '0.5rem',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    minWidth: 44,
    minHeight: 44,
    color: '#b45309',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.25rem',
    opacity: 0.6,
    lineHeight: 1,
};

interface AIMaintenanceBannerProps {
    className?: string;
    style?: React.CSSProperties;
}

function formatCooldownEstimate(seconds?: number): string | null {
    if (!seconds || seconds <= 0) {
        return null;
    }

    if (seconds < 60) {
        return `~${seconds} second${seconds === 1 ? '' : 's'}`;
    }

    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) {
        return `~${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    const hours = Math.ceil(minutes / 60);
    return `~${hours} hour${hours === 1 ? '' : 's'}`;
}

const AIMaintenanceBanner: React.FC<AIMaintenanceBannerProps> = ({
    className,
    style,
}) => {
    const [{ maintenance, reason, loaded, details }, { refresh }] = useAIStatus();
    const [dismissed, setDismissed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const handleRetry = useCallback(async () => {
        setRefreshing(true);
        try {
            await refresh();
        } finally {
            setRefreshing(false);
        }
    }, [refresh]);

    const handleDismiss = useCallback(() => {
        setDismissed(true);
    }, []);

    useEffect(() => {
        if (!maintenance) {
            setDismissed(false);
        }
    }, [maintenance]);

    if (!loaded || !maintenance || dismissed) {
        return null;
    }

    const benchedCount = details?.benchedKeys ?? 0;
    const totalCount = details?.totalKeys ?? 0;
    const recoveryEstimate = formatCooldownEstimate(details?.shortestCooldownRemaining);

    return (
        <div
            className={className}
            style={{ ...bannerStyle, ...style }}
            role="alert"
            aria-live="polite"
        >
            <div style={iconContainerStyle} aria-hidden="true">
                AI
            </div>

            <div style={contentStyle}>
                <div style={titleStyle}>AI System In Maintenance</div>
                <div style={messageStyle}>
                    {reason ||
                        'All configured AI API keys are currently exhausted or cooling down. AI-powered features are temporarily unavailable.'}
                </div>
                {totalCount > 0 && (
                    <div style={detailsStyle}>
                        {benchedCount}/{totalCount} key{totalCount !== 1 ? 's' : ''} cooling down.
                        {recoveryEstimate
                            ? ` Estimated recovery: ${recoveryEstimate}.`
                            : ' Service will auto-recover when limits reset.'}
                    </div>
                )}
            </div>

            <button
                type="button"
                style={retryButtonStyle}
                onClick={handleRetry}
                disabled={refreshing}
                onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.background = 'rgba(245,158,11,0.35)';
                }}
                onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.background = 'rgba(245,158,11,0.2)';
                }}
            >
                {refreshing ? 'Checking...' : 'Retry'}
            </button>

            <button
                type="button"
                style={dismissButtonStyle}
                onClick={handleDismiss}
                aria-label="Dismiss banner"
                title="Dismiss"
            >
                X
            </button>
        </div>
    );
};

export default AIMaintenanceBanner;
