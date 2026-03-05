/**
 * BatchGradingPanel — By-question batch grading mode (Task 7.8)
 * PRD §4.5.2: Shows student answers for a single writing question,
 * allowing teacher to grade them one by one with score slider + feedback.
 */

import React, { useState } from 'react';
import { ref, update } from 'firebase/database';
import { database } from '../../services/firebase';
import { Card, CardBody, Button } from '../modern';

interface StudentAnswer {
    studentId: string;
    studentName: string;
    questionNumber: number;
    originalSentence: string;
    modelAnswer: string;
    studentAnswer: string;
    aiScore?: number;
    aiFeedback?: string;
    gradingTier?: string;
    pointsMax: number;
}

interface BatchGradingPanelProps {
    sessionCode: string;
    questionNumber: number;
    questionTitle: string;
    answers: StudentAnswer[];
    onGradeComplete: () => void;
}

const SCORE_PRESETS = [0, 0.25, 0.5, 0.75, 1.0];

export const BatchGradingPanel: React.FC<BatchGradingPanelProps> = ({
    sessionCode,
    questionNumber,
    questionTitle,
    answers,
    onGradeComplete,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<string | null>(null);

    const current = answers[currentIndex];
    if (!current) {
        return (
            <Card variant="default" style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                <h3 style={{ color: '#059669' }}>All answers graded!</h3>
                <Button variant="primary" onClick={onGradeComplete} style={{ marginTop: '1rem' }}>
                    Back to Test List
                </Button>
            </Card>
        );
    }

    const studentScore = scores[current.studentId] ?? (current.aiScore ? (current.aiScore / 100) * current.pointsMax : 0);
    const studentFeedback = feedbacks[current.studentId] ?? '';

    const handleScoreChange = (val: number) => {
        setScores(prev => ({ ...prev, [current.studentId]: val }));
    };

    const handleFeedbackChange = (val: string) => {
        setFeedbacks(prev => ({ ...prev, [current.studentId]: val }));
    };

    const handleSubmitGrade = async () => {
        if (!current) return;
        setSubmitting(current.studentId);

        try {
            const finalScore = scores[current.studentId] ?? 0;
            const finalFeedback = feedbacks[current.studentId] ?? '';

            const updatePath = `game_sessions/${sessionCode}/results/${current.studentId}/questionResults/${current.questionNumber}`;
            await update(ref(database, updatePath), {
                pointsEarned: finalScore,
                isCorrect: finalScore > 0,
                'writingResult/teacherScore': finalScore,
                'writingResult/teacherFeedback': finalFeedback || null,
                'writingResult/gradingTier': 'teacher-graded',
            });

            // Move to next
            setCurrentIndex(prev => prev + 1);
        } catch (err) {
            console.error('Failed to submit grade:', err);
            alert('Failed to submit grade. Please try again.');
        } finally {
            setSubmitting(null);
        }
    };

    const handleSkip = () => {
        setCurrentIndex(prev => prev + 1);
    };

    // AI confidence badge color
    const getConfidenceBadge = (score?: number) => {
        if (score === undefined) return null;
        const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                background: color,
                color: 'white',
                fontSize: '0.7rem',
                fontWeight: '700',
            }}>
                AI: {score}%
            </span>
        );
    };

    return (
        <div>
            {/* Header */}
            <Card variant="glass" style={{ marginBottom: '1rem' }}>
                <CardBody>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>
                                Q{questionNumber}: {questionTitle}
                            </h3>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                                Answer {currentIndex + 1} of {answers.length} pending
                            </p>
                        </div>
                        <Button variant="glass" onClick={onGradeComplete} size="sm">
                            ← Back
                        </Button>
                    </div>
                </CardBody>
            </Card>

            {/* Student Answer Card */}
            <Card variant="default" style={{ marginBottom: '1rem' }}>
                <CardBody>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>{current.studentName}</span>
                        {getConfidenceBadge(current.aiScore)}
                    </div>

                    {/* Original sentence */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Original Sentence
                        </label>
                        <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#f1f5f9', borderRadius: '8px', fontSize: '0.9rem', color: '#334155' }}>
                            {current.originalSentence}
                        </p>
                    </div>

                    {/* Model answer */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Model Answer
                        </label>
                        <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#f0fdf4', borderRadius: '8px', fontSize: '0.9rem', color: '#166534', border: '1px solid #bbf7d0' }}>
                            {current.modelAnswer}
                        </p>
                    </div>

                    {/* Student answer */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Student Answer
                        </label>
                        <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#eef2ff', borderRadius: '8px', fontSize: '0.9rem', color: '#3730a3', border: '1px solid #c7d2fe' }}>
                            {current.studentAnswer || <em style={{ color: '#94a3b8' }}>No answer provided</em>}
                        </p>
                    </div>

                    {/* AI feedback if available */}
                    {current.aiFeedback && (
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                AI Feedback
                            </label>
                            <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#fffbeb', borderRadius: '8px', fontSize: '0.85rem', color: '#92400e', border: '1px solid #fde68a', fontStyle: 'italic' }}>
                                {current.aiFeedback}
                            </p>
                        </div>
                    )}

                    {/* Score Slider */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Score ({studentScore} / {current.pointsMax})
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {SCORE_PRESETS.map(preset => {
                                const val = preset * current.pointsMax;
                                const isSelected = Math.abs(studentScore - val) < 0.01;
                                return (
                                    <button
                                        key={preset}
                                        onClick={() => handleScoreChange(val)}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: '8px',
                                            border: isSelected ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                            background: isSelected ? '#eef2ff' : 'white',
                                            color: isSelected ? '#4338ca' : '#64748b',
                                            fontWeight: isSelected ? '700' : '500',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        {val}
                                    </button>
                                );
                            })}
                            <input
                                type="number"
                                min={0}
                                max={current.pointsMax}
                                step={0.05}
                                value={studentScore}
                                onChange={e => handleScoreChange(Math.min(current.pointsMax, Math.max(0, parseFloat(e.target.value) || 0)))}
                                style={{
                                    width: '70px',
                                    padding: '0.4rem',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.85rem',
                                    textAlign: 'center',
                                }}
                            />
                        </div>
                    </div>

                    {/* Feedback textarea */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Feedback (optional)
                        </label>
                        <textarea
                            value={studentFeedback}
                            onChange={e => handleFeedbackChange(e.target.value)}
                            placeholder="Write feedback for the student..."
                            rows={2}
                            style={{
                                width: '100%',
                                marginTop: '0.5rem',
                                padding: '0.5rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                fontSize: '0.85rem',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                            }}
                        />
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <Button variant="glass" onClick={handleSkip} size="sm">
                            Skip →
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSubmitGrade}
                            disabled={submitting === current.studentId}
                            style={{
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                            }}
                        >
                            {submitting === current.studentId ? '⏳ Saving...' : 'Submit Grade ✅'}
                        </Button>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
};

export default BatchGradingPanel;
