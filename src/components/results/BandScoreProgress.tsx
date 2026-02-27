
import React from 'react';
import { Card, CardBody } from '../modern';

interface BandScoreProgressProps {
    currentBand: number;
    targetBand?: number;
}

const MILESTONES = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

export const BandScoreProgress: React.FC<BandScoreProgressProps> = ({
    currentBand,
    targetBand = 7.0 // Default target often desired
}) => {
    // Calculate progress percentage for visual bar
    // Range from 4.5 (start) to 9.0 (end)
    const MIN_BAND = 4.5;
    const MAX_BAND = 9.0;

    const progressPercent = Math.max(0, Math.min(100,
        ((currentBand - MIN_BAND) / (MAX_BAND - MIN_BAND)) * 100
    ));

    return (
        <Card variant="glass">
            <CardBody style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                            Band Score Journey
                        </h3>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                            Current Level: <span style={{ fontWeight: 700, color: '#8b5cf6' }}>{currentBand}</span>
                        </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                            Target
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>
                            {targetBand}
                        </div>
                    </div>
                </div>

                {/* Milestone Viz */}
                <div style={{ position: 'relative', marginTop: '1rem', paddingBottom: '2rem' }}>
                    {/* Progress Bar Background */}
                    <div style={{
                        height: '8px',
                        background: '#e2e8f0',
                        borderRadius: '4px',
                        position: 'absolute',
                        top: '12px',
                        left: 0,
                        right: 0,
                        zIndex: 1
                    }} />

                    {/* Active Progress Bar */}
                    <div style={{
                        height: '8px',
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #06b6d4 100%)',
                        borderRadius: '4px',
                        position: 'absolute',
                        top: '12px',
                        left: 0,
                        width: `${progressPercent}%`,
                        zIndex: 2,
                        transition: 'width 1s ease-in-out'
                    }} />

                    {/* Milestones */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        position: 'relative',
                        zIndex: 3
                    }}>
                        {MILESTONES.map((milestone) => {
                            const isAchieved = currentBand >= milestone;
                            const isCurrent = currentBand === milestone;

                            return (
                                <div
                                    key={milestone}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        opacity: currentBand < 4.5 && milestone > 5.0 ? 0.5 : 1 // Fade future if very low start
                                    }}
                                >
                                    {/* Dot */}
                                    <div style={{
                                        width: isCurrent ? '24px' : '16px',
                                        height: isCurrent ? '24px' : '16px',
                                        borderRadius: '50%',
                                        background: isAchieved
                                            ? (isCurrent ? '#8b5cf6' : '#06b6d4')
                                            : '#f1f5f9',
                                        border: isAchieved
                                            ? '3px solid white'
                                            : '3px solid #cbd5e1',
                                        boxShadow: isCurrent ? '0 0 0 4px rgba(139, 92, 246, 0.2)' : 'none',
                                        marginBottom: '0.75rem',
                                        transition: 'all 0.3s ease',
                                        marginTop: isCurrent ? '4px' : '8px'
                                    }} />

                                    {/* Label */}
                                    <div style={{
                                        fontWeight: isCurrent ? 800 : 600,
                                        color: isCurrent ? '#1e293b' : (isAchieved ? '#475569' : '#94a3b8'),
                                        fontSize: isCurrent ? '1rem' : '0.875rem',
                                        transition: 'all 0.3s ease'
                                    }}>
                                        {milestone.toFixed(1)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardBody>
        </Card>
    );
};
