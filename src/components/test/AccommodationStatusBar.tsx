/**
 * AccommodationStatusBar Component
 * PRD-0019: Status bar shown to teachers after base time expires
 * 
 * Displays information about students with extra time accommodations
 * who are still working after the base test duration has ended.
 */

import React from 'react';

export interface AccommodatedStudent {
    id: string;
    name: string;
    extraTime: number;
    extraTimeRemaining: number;
}

export interface AccommodationStatusBarProps {
    /** Array of students with extra time who haven't completed */
    accommodatedStudents: AccommodatedStudent[];

    /** Maximum time remaining among all accommodated students (in seconds) */
    maxTimeRemaining: number;

    /** Callback when "View Accommodated Students" is clicked */
    onViewStudents?: () => void;
}

/**
 * Format seconds to MM:SS
 */
const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const AccommodationStatusBar: React.FC<AccommodationStatusBarProps> = ({
    accommodatedStudents,
    maxTimeRemaining,
    onViewStudents,
}) => {
    const studentCount = accommodatedStudents.length;

    if (studentCount === 0) {
        return null; // Don't show if no accommodated students
    }

    return (
        <div style={{
            position: 'sticky',
            top: '60px', // Below control bar
            zIndex: 999,
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            borderBottom: '3px solid #d97706',
            boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)',
            animation: 'slideDown 0.3s ease-out',
        }}>
            <div style={{
                maxWidth: '1400px',
                margin: '0 auto',
                padding: '1rem 2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.5rem',
                flexWrap: 'wrap',
            }}>
                {/* Status Info */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2rem',
                    flex: 1,
                    minWidth: '300px',
                }}>
                    {/* Base Time Status */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <span style={{ fontSize: '1.25rem' }}>⏱️</span>
                        <div>
                            <div style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#78350f',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}>
                                Base Time
                            </div>
                            <div style={{
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: '#ffffff',
                            }}>
                                ENDED
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div style={{
                        width: '1px',
                        height: '40px',
                        background: 'rgba(255, 255, 255, 0.3)',
                    }} />

                    {/* Student Count */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <span style={{ fontSize: '1.25rem' }}>🧑‍🎓</span>
                        <div>
                            <div style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#78350f',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}>
                                Extra Time
                            </div>
                            <div style={{
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: '#ffffff',
                            }}>
                                {studentCount} student{studentCount !== 1 ? 's' : ''} remaining
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div style={{
                        width: '1px',
                        height: '40px',
                        background: 'rgba(255, 255, 255, 0.3)',
                    }} />

                    {/* Max Time Remaining */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <span style={{ fontSize: '1.25rem' }}>⏰</span>
                        <div>
                            <div style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#78350f',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}>
                                Max Remaining
                            </div>
                            <div style={{
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: '#ffffff',
                            }}>
                                {formatTime(maxTimeRemaining)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                {onViewStudents && (
                    <button
                        onClick={onViewStudents}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'rgba(255, 255, 255, 0.95)',
                            border: 'none',
                            borderRadius: '0.5rem',
                            color: '#f59e0b',
                            fontSize: '0.9375rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                            whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ffffff';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                        }}
                    >
                        View Accommodated Students
                    </button>
                )}
            </div>

            {/* Keyframes for slide-down animation */}
            <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
        </div>
    );
};
