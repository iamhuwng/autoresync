/**
 * GradingTestCard — Single test card in the grading tab (Task 7.7)
 * Shows: test title, grading progress bar, student count, pending count, badges
 */

import React from 'react';
import { Card, CardBody, Button } from '../modern';

export interface GradingTestCardData {
    testId: string;
    testTitle: string;
    sessionCode: string;
    totalStudents: number;
    submittedStudents: number;
    totalWritingQuestions: number;
    gradedWritingQuestions: number;
    pendingWritingQuestions: number;
    deadline?: number; // timestamp
}

interface GradingTestCardProps {
    data: GradingTestCardData;
    onOpenGrading: (sessionCode: string) => void;
}

export const GradingTestCard: React.FC<GradingTestCardProps> = ({ data, onOpenGrading }) => {
    const progress = data.totalWritingQuestions > 0
        ? Math.round((data.gradedWritingQuestions / data.totalWritingQuestions) * 100)
        : 100;

    const isComplete = progress === 100;
    const deadlineStr = data.deadline
        ? new Date(data.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : null;

    const isOverdue = data.deadline ? data.deadline < Date.now() : false;

    return (
        <Card
            variant="default"
            style={{
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'default',
            }}
        >
            <CardBody>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                    {/* Left: Test info */}
                    <div style={{ flex: '1 1 300px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>
                                {data.testTitle}
                            </h3>
                            {isComplete && (
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '9999px',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    fontWeight: '700',
                                    letterSpacing: '0.05em',
                                }}>
                                    ✅ COMPLETE
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                            <span>👥 {data.submittedStudents}/{data.totalStudents} submitted</span>
                            <span>📝 {data.pendingWritingQuestions} pending</span>
                            {deadlineStr && (
                                <span style={{ color: isOverdue ? '#ef4444' : '#64748b' }}>
                                    {isOverdue ? '⚠️' : '🕐'} {deadlineStr}
                                </span>
                            )}
                        </div>

                        {/* Progress bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                                flex: 1,
                                height: '8px',
                                borderRadius: '4px',
                                background: '#e2e8f0',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${progress}%`,
                                    height: '100%',
                                    borderRadius: '4px',
                                    background: isComplete
                                        ? 'linear-gradient(90deg, #10b981, #059669)'
                                        : progress > 50
                                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                                            : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                    transition: 'width 0.5s ease',
                                }} />
                            </div>
                            <span style={{
                                fontSize: '0.8rem',
                                fontWeight: '700',
                                color: isComplete ? '#059669' : '#6366f1',
                                minWidth: '3rem',
                                textAlign: 'right',
                            }}>
                                {progress}%
                            </span>
                        </div>
                    </div>

                    {/* Right: Action button */}
                    <div style={{ flexShrink: 0 }}>
                        {!isComplete ? (
                            <Button
                                variant="primary"
                                onClick={() => onOpenGrading(data.sessionCode)}
                                style={{
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                Open Grading →
                            </Button>
                        ) : (
                            <Button
                                variant="glass"
                                onClick={() => onOpenGrading(data.sessionCode)}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                View Results
                            </Button>
                        )}
                    </div>
                </div>
            </CardBody>
        </Card>
    );
};

export default GradingTestCard;
