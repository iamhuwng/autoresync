/**
 * ReadingHeader Component
 * Mimics the Inspera IELTS CBT header:
 * - Solid white background
 * - IELTS logo on left
 * - Test Type & Skill (e.g. Reading Test) next to logo
 * - Test taker ID in center
 * - Timer in center
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionService } from '../../services/sessionService';

interface ReadingHeaderProps {
    testType: string;
    testSkill: string;
    studentName: string;
    timeRemaining: number;
    formatTime: (seconds: number) => string;
    sessionStatus: 'waiting' | 'in-progress' | 'completed';
    isPaused: boolean;
    testSubmitted: boolean;
}

export const ReadingHeader: React.FC<ReadingHeaderProps> = ({
    testType,
    testSkill,
    studentName,
    timeRemaining,
    formatTime,
    sessionStatus,
    isPaused,
    testSubmitted,
}) => {
    const navigate = useNavigate();

    const handleReturnHome = () => {
        sessionService.clearSession();
        navigate('/');
    };

    return (
        <div style={{
            height: '50px',
            background: 'white',
            borderBottom: '1px solid #d1d5db',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 1rem',
            flexShrink: 0,
            zIndex: 1000,
        }}>
            {/* Left: Logo & Test Type */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: '#e11d48', // IELTS Red
                    letterSpacing: '0.05em'
                }}>
                    IELTS
                </span>
                <div style={{
                    height: '20px',
                    width: '1px',
                    background: '#d1d5db'
                }}></div>
                <span style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#4b5563',
                    textTransform: 'capitalize'
                }}>
                    {testType} {testSkill}
                </span>
            </div>

            {/* Center: Test Taker Info & Timer */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2rem',
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)'
            }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' }}>
                    Test taker ID: <span style={{ fontWeight: 700, color: '#1f2937' }}>{studentName}</span>
                </div>

                {/* Timer - Minimal integrated */}
                <div style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: timeRemaining < 300 ? '#dc2626' : '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                }}>
                    {sessionStatus !== 'waiting' && (
                        <>
                            <span style={{ fontSize: '1rem' }}>⏱️</span>
                            {formatTime(timeRemaining)}
                        </>
                    )}
                    {isPaused && (
                        <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>(PAUSED)</span>
                    )}
                </div>
            </div>

            {/* Right: Empty (as requested) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {testSubmitted && (
                    <button
                        onClick={handleReturnHome}
                        style={{
                            padding: '0.375rem 1rem',
                            background: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Exit
                    </button>
                )}
            </div>
        </div>
    );
};

export default ReadingHeader;
