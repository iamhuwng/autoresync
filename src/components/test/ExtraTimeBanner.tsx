/**
 * ExtraTimeBanner Component
 * PRD-0019: Component to display extra time notification for accommodated students
 * 
 * Displayed when base test time has ended but student has extra time remaining.
 */

import React from 'react';

interface ExtraTimeBannerProps {
    /**
     * Whether the student is currently in extra time
     */
    isInExtraTime: boolean;

    /**
     * Formatted time string (e.g., "5:00")
     */
    formattedTime: string;
}

export const ExtraTimeBanner: React.FC<ExtraTimeBannerProps> = ({
    isInExtraTime,
    formattedTime,
}) => {
    if (!isInExtraTime) return null;

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.1), 0 2px 4px -1px rgba(245, 158, 11, 0.06)',
                animation: 'slideIn 0.3s ease-out',
                border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
        >
            <div
                style={{
                    background: 'rgba(255, 255, 255, 0.25)',
                    borderRadius: '50%',
                    width: '2rem',
                    height: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                }}
            >
                ⏰
            </div>
            <div>
                <div style={{ fontWeight: 700, color: '#78350f', fontSize: '0.9375rem' }}>
                    Base time ended
                </div>
                <div style={{ fontSize: '0.875rem', color: '#78350f', fontWeight: 500 }}>
                    You have <strong style={{ color: '#000' }}>{formattedTime}</strong> extra time remaining.
                </div>
            </div>
            <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
};
