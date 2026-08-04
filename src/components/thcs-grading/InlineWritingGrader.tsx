/**
 * InlineWritingGrader — Grade writing from monitor student card (Task 8.2)
 * PRD §4.6.2: Inline grading UI when teacher clicks "Grade Writing"
 * Score slider is keyboard-navigable (PRD §6.3)
 */

import React, { useState, useCallback } from 'react';
import { ref, update } from 'firebase/database';
import { database } from '../../services/firebase';
import { createTrustedNotification } from '../../services/notificationProducerClient';
import { Card, Button } from '../modern';

const TRUSTED_NOTIFICATION_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const isTrustedNotificationIdentifier = (value: unknown): value is string =>
    typeof value === 'string' && TRUSTED_NOTIFICATION_ID.test(value);

interface WritingAnswer {
    studentId: string;
    studentName: string;
    questionNumber: number;
    originalSentence: string;
    sentenceStarter?: string;
    keyword?: string;
    modelAnswers: string[];
    studentAnswer: string;
    aiScore?: number;
    aiFeedback?: string;
    gradingTier?: string;
    pointsMax: number;
}

interface InlineWritingGraderProps {
    sessionCode: string;
    testName: string;
    studentId: string;
    studentName: string;
    writingAnswers: WritingAnswer[];
    onClose: () => void;
    onGradeComplete: () => void;
}

const SCORE_PRESETS = [0, 0.25, 0.5, 0.75, 1.0];

export const InlineWritingGrader: React.FC<InlineWritingGraderProps> = ({
    sessionCode,
    testName,
    studentId,
    studentName,
    writingAnswers,
    onClose,
    onGradeComplete,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [scores, setScores] = useState<Record<number, number>>({});
    const [feedbacks, setFeedbacks] = useState<Record<number, string>>({});
    const [submitting, setSubmitting] = useState(false);

    const current = writingAnswers[currentIndex];

    // Keyboard-navigable score slider (PRD §6.3)
    const handleKeyDown = useCallback((e: React.KeyboardEvent, qNum: number, max: number) => {
        const currentScore = scores[qNum] ?? 0;
        const step = max * 0.25;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            setScores(prev => ({ ...prev, [qNum]: Math.min(max, currentScore + step) }));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            setScores(prev => ({ ...prev, [qNum]: Math.max(0, currentScore - step) }));
        }
    }, [scores]);

    if (!current) {
        return (
            <Card variant="default" style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                <h3 style={{ color: '#059669', margin: '0 0 0.5rem' }}>All writing graded for {studentName}!</h3>
                <Button variant="primary" onClick={onGradeComplete} style={{ marginTop: '1rem' }}>
                    Done
                </Button>
            </Card>
        );
    }

    const qScore = scores[current.questionNumber] ?? (current.aiScore ? (current.aiScore / 100) * current.pointsMax : 0);
    const qFeedback = feedbacks[current.questionNumber] ?? '';

    const handleSubmitGrade = async () => {
        if (!current) return;
        setSubmitting(true);

        try {
            const finalScore = scores[current.questionNumber] ?? 0;
            const finalFeedback = feedbacks[current.questionNumber] ?? '';

            const updatePath = `game_sessions/${sessionCode}/results/${studentId}/questionResults/${current.questionNumber}`;
            await update(ref(database, updatePath), {
                pointsEarned: finalScore,
                isCorrect: finalScore > 0,
                'writingResult/teacherScore': finalScore,
                'writingResult/teacherFeedback': finalFeedback || null,
                'writingResult/gradingTier': 'teacher-graded',
            });

            // Notify the student (fire-and-forget) using the canonical answer
            // recipient. The monitor's studentId prop remains only the RTDB
            // write target and is never trusted as a notification recipient.
            const recipientId = current.studentId;
            if (
                isTrustedNotificationIdentifier(recipientId)
                && isTrustedNotificationIdentifier(sessionCode)
                && Number.isSafeInteger(current.questionNumber)
                && typeof testName === 'string'
                && testName.trim()
            ) {
                void createTrustedNotification({
                    producerFamily: 'result',
                    authorityRecordId: sessionCode,
                    recipientId,
                    operationKey: `grade-updated:${sessionCode}:${recipientId}:${current.questionNumber}`,
                    type: 'success',
                    title: 'Grade Updated',
                    message: `Your answer for Q${current.questionNumber} in "${testName}" has been graded: ${finalScore} points.`,
                }).catch((error) => {
                    console.warn('[InlineWritingGrader] Grade notification failed:', error);
                });
            }

            // Move to next question
            setCurrentIndex(prev => prev + 1);
        } catch (err) {
            console.error('Failed to submit grade:', err);
            alert('Failed to submit grade. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSkip = () => {
        setCurrentIndex(prev => prev + 1);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
        }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div style={{
                maxWidth: '700px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                borderRadius: '16px',
                background: 'white',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            Grade Writing — {studentName}
                        </h3>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            Question {currentIndex + 1} of {writingAnswers.length}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '0.25rem',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '1.5rem' }}>
                    {/* Q number + type */}
                    <div style={{ marginBottom: '1rem' }}>
                        <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: '#6366f1',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            Q{current.questionNumber} — {current.keyword ? 'Keyword Rewrite' : 'Sentence Rewrite'}
                        </span>
                    </div>

                    {/* Original sentence */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Original</label>
                        <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#f1f5f9', borderRadius: '8px', fontSize: '0.85rem', color: '#334155' }}>
                            {current.originalSentence}
                        </p>
                    </div>

                    {/* Starter / Keyword */}
                    {current.sentenceStarter && (
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' }}>Starts with</label>
                            <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#f5f3ff', borderRadius: '8px', fontSize: '0.85rem', color: '#5b21b6', fontStyle: 'italic' }}>
                                {current.sentenceStarter}...
                            </p>
                        </div>
                    )}
                    {current.keyword && (
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' }}>Keyword</label>
                            <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#f5f3ff', borderRadius: '8px', fontSize: '0.85rem', color: '#5b21b6', fontWeight: 700 }}>
                                {current.keyword}
                            </p>
                        </div>
                    )}

                    {/* Model answer */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#059669', textTransform: 'uppercase' }}>Model Answer(s)</label>
                        {current.modelAnswers.map((ma, i) => (
                            <p key={i} style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#f0fdf4', borderRadius: '8px', fontSize: '0.85rem', color: '#166534', border: '1px solid #bbf7d0' }}>
                                {ma}
                            </p>
                        ))}
                    </div>

                    {/* Student answer */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase' }}>Student Answer</label>
                        <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#eef2ff', borderRadius: '8px', fontSize: '0.85rem', color: '#3730a3', border: '1px solid #c7d2fe' }}>
                            {current.studentAnswer || <em style={{ color: '#94a3b8' }}>No answer</em>}
                        </p>
                    </div>

                    {/* AI feedback */}
                    {current.aiFeedback && (
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase' }}>AI Suggestion</label>
                            <p style={{ margin: '0.25rem 0', padding: '0.5rem', background: '#fffbeb', borderRadius: '8px', fontSize: '0.8rem', color: '#92400e', border: '1px solid #fde68a', fontStyle: 'italic' }}>
                                Score: {current.aiScore}% — {current.aiFeedback}
                            </p>
                        </div>
                    )}

                    {/* Score slider (keyboard-navigable) */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                            Score ({qScore} / {current.pointsMax})
                        </label>
                        <div
                            style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
                            role="slider"
                            aria-valuenow={qScore}
                            aria-valuemin={0}
                            aria-valuemax={current.pointsMax}
                            aria-label={`Score for question ${current.questionNumber}`}
                            tabIndex={0}
                            onKeyDown={(e) => handleKeyDown(e, current.questionNumber, current.pointsMax)}
                        >
                            {SCORE_PRESETS.map(preset => {
                                const val = preset * current.pointsMax;
                                const isSelected = Math.abs(qScore - val) < 0.01;
                                return (
                                    <button
                                        key={preset}
                                        onClick={() => setScores(prev => ({ ...prev, [current.questionNumber]: val }))}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: '8px',
                                            border: isSelected ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                            background: isSelected ? '#eef2ff' : 'white',
                                            color: isSelected ? '#4338ca' : '#64748b',
                                            fontWeight: isSelected ? 700 : 500,
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
                                value={qScore}
                                onChange={e => setScores(prev => ({ ...prev, [current.questionNumber]: Math.min(current.pointsMax, Math.max(0, parseFloat(e.target.value) || 0)) }))}
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
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Feedback (optional)</label>
                        <textarea
                            value={qFeedback}
                            onChange={e => setFeedbacks(prev => ({ ...prev, [current.questionNumber]: e.target.value }))}
                            placeholder="Write feedback..."
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
                            disabled={submitting}
                            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                        >
                            {submitting ? '⏳ Saving...' : 'Submit Grade ✅'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InlineWritingGrader;
