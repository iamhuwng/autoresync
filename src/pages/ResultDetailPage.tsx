/**
 * Result Detail Page
 * PRD-0015 Section 4.9.3: "Click card → Navigate to result detail page"
 * 
 * Displays test results independently from sessions.
 * Loads by resultId directly from test_results/{resultId}
 * 
 * Features:
 * - Session-independent result viewing
 * - Works for orphaned results (deleted sessions/courses)
 * - Shows course/class/module context as metadata
 * - Overall score and IELTS band score
 * - Question-by-question review
 * - Teacher feedback display
 * 
 * Security:
 * - PRD-0016 Task 3.7: Ownership validation before rendering
 * - Allowed: result owner OR teacher with assignment to student
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { Card, CardBody, Button } from '../components/modern';
import { calculateBandScore, generatePerformanceFeedback } from '../services/autoMarking.service';
import { getTestResult, TestResultRecord } from '../services/testResults.service';
import { FeedbackDisplay } from '../components/feedback/FeedbackDisplay';
import { WritingSpeakingPlaceholder } from '../components/test/WritingSpeakingPlaceholder';
import { generateCertificatePDF, isPDFGenerationAvailable } from '../utils/pdfCertificate';
import { useResultOwnershipCheck } from '../hooks/useOwnershipCheck';
import { ResultContextBadge } from '../components/results/ResultContextBadge';

export const ResultDetailPage: React.FC = () => {
    const { resultId } = useParams<{ resultId: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TestResultRecord | null>(null);
    const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
    const [pdfAvailable, setPdfAvailable] = useState(false);

    // PRD-0016: Ownership validation
    // Check if user can view this result after it's loaded
    const {
        allowed: canViewResult,
        loading: ownershipLoading,
        denialReason
    } = useResultOwnershipCheck(result?.studentId);

    /**
     * Load result by ID (independent from session)
     */
    useEffect(() => {
        if (!resultId) {
            setError('No result ID provided');
            setLoading(false);
            return;
        }

        loadResult();
        isPDFGenerationAvailable().then(setPdfAvailable);
    }, [resultId]);

    const loadResult = async () => {
        try {
            console.log(`📊 [ResultDetail] Loading result: ${resultId}`);

            const resultData = await getTestResult(resultId!);

            if (!resultData) {
                setError('Result not found');
                setLoading(false);
                return;
            }

            setResult(resultData);
            setLoading(false);
        } catch (err) {
            console.error('Error loading result:', err);
            setError('Failed to load result');
            setLoading(false);
        }
    };

    /**
     * Toggle question expansion
     */
    const toggleQuestion = (questionNumber: number) => {
        const newExpanded = new Set(expandedQuestions);
        if (newExpanded.has(questionNumber)) {
            newExpanded.delete(questionNumber);
        } else {
            newExpanded.add(questionNumber);
        }
        setExpandedQuestions(newExpanded);
    };

    /**
     * Format answer display
     */
    const formatAnswer = (answer: string | string[] | Record<string, string>): string => {
        if (Array.isArray(answer)) {
            return answer.join(', ');
        }
        if (typeof answer === 'object') {
            return JSON.stringify(answer, null, 2);
        }
        return String(answer);
    };

    /**
     * Render loading state
     */
    if (loading || ownershipLoading) {
        return (
            <Center style={{ height: '100vh' }}>
                <Loader size="xl" />
            </Center>
        );
    }

    /**
     * Render error state
     */
    if (error || !result) {
        return (
            <Center style={{ height: '100vh', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '3rem' }}>⚠️</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
                    {error || 'Failed to load result'}
                </div>
                <Button variant="primary" onClick={() => navigate('/student')}>
                    Return to Dashboard
                </Button>
            </Center>
        );
    }

    /**
     * PRD-0016: Ownership validation
     * Redirect to access-denied if user cannot view this result
     */
    if (!canViewResult) {
        console.warn(`[Security] Access denied to result ${resultId}, reason: ${denialReason}`);
        return (
            <Navigate
                to="/access-denied"
                state={{
                    from: `/results/${resultId}`,
                    reason: 'ownership'
                }}
                replace
            />
        );
    }

    const bandScore = calculateBandScore(result.percentage);
    const feedback = generatePerformanceFeedback(result.percentage);

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 50%, rgba(240, 253, 250, 0.95) 100%)',
                padding: '2rem',
            }}
        >
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                    <h1
                        style={{
                            margin: 0,
                            fontSize: '2.5rem',
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            marginBottom: '0.5rem',
                        }}
                    >
                        Test Results
                    </h1>
                    <div style={{ fontSize: '1.125rem', color: '#64748b', fontWeight: 500 }}>
                        {result.testTitle}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                        {result.testType} - {result.testSkill}
                    </div>

                    {/* PRD-0016: Result Context Badge */}
                    {result.context && (
                        <div style={{ marginTop: '0.75rem' }}>
                            <ResultContextBadge
                                contextType={result.context.type}
                                size="md"
                                showLabel={true}
                            />
                        </div>
                    )}

                    {/* Context Metadata (Course/Class/Module) */}
                    {(result.courseName || result.className || result.moduleName) && (
                        <div style={{
                            fontSize: '0.875rem',
                            color: '#64748b',
                            marginTop: '0.75rem',
                            display: 'flex',
                            gap: '0.5rem',
                            justifyContent: 'center',
                            flexWrap: 'wrap'
                        }}>
                            {result.courseName && (
                                <span style={{
                                    padding: '0.25rem 0.75rem',
                                    background: 'rgba(139, 92, 246, 0.1)',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(139, 92, 246, 0.3)'
                                }}>
                                    📚 {result.courseName}
                                </span>
                            )}
                            {result.className && (
                                <span style={{
                                    padding: '0.25rem 0.75rem',
                                    background: 'rgba(6, 182, 212, 0. 1)',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(6, 182, 212, 0.3)'
                                }}>
                                    🏫 {result.className}
                                </span>
                            )}
                            {result.moduleName && (
                                <span style={{
                                    padding: '0.25rem 0.75rem',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(16, 185, 129, 0.3)'
                                }}>
                                    📖 {result.moduleName}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Orphaned Result Indicator */}
                    {result.courseId === null && (
                        <div style={{
                            fontSize: '0.875rem',
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            marginTop: '0.5rem'
                        }}>
                            ⚠️ Unassigned Course
                        </div>
                    )}
                </div>

                {/* Score Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    {/* Total Score */}
                    <Card variant="glass">
                        <CardBody style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                                Your Score
                            </div>
                            <div style={{ fontSize: '3rem', fontWeight: 800, color: '#8b5cf6', marginBottom: '0.5rem' }}>
                                {result.totalScore}/{result.maxScore}
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#64748b' }}>
                                {result.percentage.toFixed(1)}%
                            </div>
                        </CardBody>
                    </Card>

                    {/* Band Score */}
                    <Card variant="glass">
                        <CardBody style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                                IELTS Band Score
                            </div>
                            <div style={{ fontSize: '3rem', fontWeight: 800, color: '#10b981', marginBottom: '0.5rem' }}>
                                {bandScore.toFixed(1)}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                Out of 9.0
                            </div>
                        </CardBody>
                    </Card>

                    {/* Questions Summary */}
                    <Card variant="glass">
                        <CardBody style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                                Questions
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                                <div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>
                                        {result.correct}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Correct</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b' }}>
                                        {result.partialCredit}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Partial</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>
                                        {result.incorrect}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Incorrect</div>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </div>

                {/* Performance Feedback */}
                <Card variant="glass" style={{ marginBottom: '2rem' }}>
                    <CardBody style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ fontSize: '3rem' }}>
                                {result.percentage >= 80 ? '🎉' : result.percentage >= 60 ? '👍' : '📚'}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                                    Performance Feedback
                                </div>
                                <div style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.6 }}>
                                    {feedback}
                                </div>
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {/* Teacher Overall Feedback */}
                {result.overallFeedback && (
                    <Card variant="glass" style={{ marginBottom: '2rem' }}>
                        <CardBody style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                <div style={{ fontSize: '2.5rem' }}>💬</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>
                                        Teacher's Feedback
                                    </div>
                                    <FeedbackDisplay
                                        feedback={result.overallFeedback}
                                        teacherName={result.feedbackUpdatedBy || 'Your Teacher'}
                                        updatedAt={result.feedbackUpdatedAt || Date.now()}
                                        isOverall={true}
                                        variant="highlighted"
                                    />
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                )}

                {/* Question-by-Question Review */}
                <div style={{ marginBottom: '2rem' }}>
                    <h2
                        style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            color: '#1e293b',
                            marginBottom: '1rem',
                        }}
                    >
                        Question Review
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {result.questionResults.map((questionResult) => {
                            const isExpanded = expandedQuestions.has(questionResult.questionNumber);
                            const statusColor = questionResult.isCorrect
                                ? { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', text: '#059669' }
                                : questionResult.score > 0 && questionResult.score < questionResult.maxScore
                                    ? { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', text: '#d97706' }
                                    : { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#dc2626' };

                            return (
                                <Card key={questionResult.questionNumber} variant="glass">
                                    <CardBody style={{ padding: '1.5rem' }}>
                                        {/* Question Header */}
                                        <div
                                            onClick={() => toggleQuestion(questionResult.questionNumber)}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                marginBottom: isExpanded ? '1rem' : 0,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                                {/* Question Number */}
                                                <div
                                                    style={{
                                                        width: '3rem',
                                                        height: '3rem',
                                                        borderRadius: '50%',
                                                        background: statusColor.bg,
                                                        border: `2px solid ${statusColor.border}`,
                                                        color: statusColor.text,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 700,
                                                        fontSize: '1.125rem',
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {questionResult.questionNumber}
                                                </div>

                                                {/* Question Info */}
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                                                        Question {questionResult.questionNumber}
                                                    </div>
                                                    <div style={{ fontSize: '0.875rem', color: statusColor.text, fontWeight: 600 }}>
                                                        {questionResult.isCorrect ? '✓ Correct' : questionResult.score > 0 ? '⚡ Partial Credit' : '✗ Incorrect'} - {questionResult.score}/{questionResult.maxScore} points
                                                    </div>
                                                </div>

                                                {/* Expand Icon */}
                                                <div style={{ fontSize: '1.5rem', color: '#64748b', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                                    ▼
                                                </div>
                                            </div>
                                        </div>

                                        {/* Question Details (Expanded) */}
                                        {isExpanded && (
                                            <div style={{ paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                                                {/* Your Answer */}
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                                                        Your Answer
                                                    </div>
                                                    <div
                                                        style={{
                                                            padding: '1rem',
                                                            background: statusColor.bg,
                                                            border: `1px solid ${statusColor.border}`,
                                                            borderRadius: '0.5rem',
                                                            fontSize: '0.9375rem',
                                                            fontWeight: 500,
                                                            color: '#1e293b',
                                                            fontFamily: 'monospace',
                                                            whiteSpace: 'pre-wrap',
                                                            wordBreak: 'break-word',
                                                        }}
                                                    >
                                                        {questionResult.studentAnswer ? formatAnswer(questionResult.studentAnswer) : '(No answer submitted)'}
                                                    </div>
                                                </div>

                                                {/* Correct Answer */}
                                                {!questionResult.isCorrect && (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                                                            Correct Answer
                                                        </div>
                                                        <div
                                                            style={{
                                                                padding: '1rem',
                                                                background: 'rgba(16, 185, 129, 0.1)',
                                                                border: '1px solid #10b981',
                                                                borderRadius: '0.5rem',
                                                                fontSize: '0.9375rem',
                                                                fontWeight: 600,
                                                                color: '#059669',
                                                                fontFamily: 'monospace',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                            }}
                                                        >
                                                            {formatAnswer(questionResult.correctAnswer)}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Auto-Generated Feedback */}
                                                <div
                                                    style={{
                                                        padding: '0.75rem 1rem',
                                                        background: 'rgba(248, 250, 252, 0.8)',
                                                        borderRadius: '0.5rem',
                                                        fontSize: '0.875rem',
                                                        color: '#64748b',
                                                        fontStyle: 'italic',
                                                        marginBottom: questionResult.teacherFeedback ? '1rem' : 0,
                                                    }}
                                                >
                                                    {questionResult.feedback}
                                                </div>

                                                {/* Teacher Feedback */}
                                                {questionResult.teacherFeedback && (
                                                    <div style={{ marginTop: '1rem' }}>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                                                            Teacher's Feedback
                                                        </div>
                                                        <FeedbackDisplay
                                                            feedback={questionResult.teacherFeedback}
                                                            teacherName={result.feedbackUpdatedBy || 'Your Teacher'}
                                                            updatedAt={result.feedbackUpdatedAt || Date.now()}
                                                            questionId={String(questionResult.questionNumber)}
                                                            variant="default"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </CardBody>
                                </Card>
                            );
                        })}
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
                    <Button variant="primary" onClick={() => navigate('/student')}>
                        🏠 Return to Dashboard
                    </Button>

                    {pdfAvailable && (
                        <Button
                            variant="primary"
                            onClick={async () => {
                                await generateCertificatePDF(result);
                            }}
                        >
                            📄 Download Certificate
                        </Button>
                    )}

                    <Button variant="glass" onClick={() => window.print()}>
                        🖨️ Print Results
                    </Button>
                </div>

                {/* Writing/Speaking Placeholder */}
                {(result.writingSubmission || result.speakingSubmission) && (
                    <div style={{ marginTop: '2rem' }}>
                        <WritingSpeakingPlaceholder
                            type={result.testSkill === 'speaking' ? 'speaking' : 'writing'}
                            submission={result.writingSubmission || result.speakingSubmission}
                            status={result.markingStatus}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResultDetailPage;
