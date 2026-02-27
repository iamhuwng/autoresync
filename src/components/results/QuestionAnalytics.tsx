import React from 'react';
import { Card, CardBody } from '../modern';
import { QuestionAnalytics as QuestionAnalyticsType } from '../../types/results.types';

interface QuestionAnalyticsProps {
    data: QuestionAnalyticsType;
}

export const QuestionAnalytics: React.FC<QuestionAnalyticsProps> = ({ data }) => {
    const {
        questionNumber,
        correctCount,
        incorrectCount,
        partialCount,
        totalAttempts,
        difficultyPercent,
        commonWrongAnswers
    } = data;

    // Calculate percentages for the bar
    const correctPercent = totalAttempts > 0 ? (correctCount / totalAttempts) * 100 : 0;
    const partialPercent = totalAttempts > 0 ? (partialCount / totalAttempts) * 100 : 0;
    const incorrectPercent = totalAttempts > 0 ? (incorrectCount / totalAttempts) * 100 : 0;

    return (
        <Card variant="glass" style={{ marginBottom: '1rem', overflow: 'hidden' }}>
            <CardBody style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '2rem', height: '2rem',
                            borderRadius: '50%',
                            background: difficultyPercent < 30 ? '#ef4444' : difficultyPercent > 70 ? '#10b981' : '#f59e0b',
                            color: 'white',
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            fontWeight: 'bold', fontSize: '1rem'
                        }}>
                            {questionNumber}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                Question {questionNumber}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Difficulty Index: <span style={{ fontWeight: 700 }}>{Math.round(difficultyPercent)}%</span> pass rate
                            </div>
                        </div>
                    </div>

                    <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                        {totalAttempts} attempts
                    </div>
                </div>

                {/* Response Distribution Bar */}
                <div style={{
                    height: '8px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    background: '#f1f5f9',
                    display: 'flex',
                    marginBottom: '1rem'
                }}>
                    {correctPercent > 0 && <div style={{ width: `${correctPercent}%`, background: '#10b981' }} title={`Correct: ${correctCount}`} />}
                    {partialPercent > 0 && <div style={{ width: `${partialPercent}%`, background: '#f59e0b' }} title={`Partial: ${partialCount}`} />}
                    {incorrectPercent > 0 && <div style={{ width: `${incorrectPercent}%`, background: '#ef4444' }} title={`Incorrect: ${incorrectCount}`} />}
                </div>

                {/* Stats Detail */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></div>
                            Correct: {correctCount}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></div>
                            Incorrect: {incorrectCount}
                        </span>
                    </div>
                </div>

                {/* Common Mistakes */}
                {commonWrongAnswers && commonWrongAnswers.length > 0 && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.05)',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(239, 68, 68, 0.1)'
                    }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.5rem' }}>
                            Common Wrong Answers:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {commonWrongAnswers.slice(0, 3).map((w, idx) => (
                                <span key={idx} style={{
                                    fontSize: '0.75rem',
                                    padding: '0.25rem 0.5rem',
                                    background: 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #fee2e2',
                                    color: '#b91c1c'
                                }}>
                                    "{w.answer}" ({w.count})
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </CardBody>
        </Card>
    );
};
