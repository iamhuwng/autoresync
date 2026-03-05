import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Center, Loader, ScrollArea, Text, Group, ActionIcon, Box } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { getTestResult, TestResultRecord } from '../../services/testResults.service';
import { calculateBandScore, generatePerformanceFeedback } from '../../services/autoMarking.service';
import { ResultContextBadge } from './ResultContextBadge';
import { FormativeFeedbackPanel } from '../thcs-student/FormativeFeedbackPanel';
import { QuestionPillsGrid } from './QuestionPillsGrid';
import type { QuestionResultItem } from './QuestionPillsGrid';
import type { FormativeFeedback } from '../../types/thcs-test.types';

interface ResultDetailModalProps {
    opened: boolean;
    onClose: () => void;
    resultId: string;
    inline?: boolean;
}

export const ResultDetailModal: React.FC<ResultDetailModalProps> = ({
    opened,
    onClose,
    resultId,
    inline = false,
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TestResultRecord | null>(null);
    const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
    const [questionViewMode, setQuestionViewMode] = useState<'overview' | 'detailed'>('overview');
    const [sectionResultsOpen, setSectionResultsOpen] = useState(false);

    const loadResult = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            if (!resultId) {
                setError('No result ID provided');
                return;
            }

            const data = await getTestResult(resultId);
            if (data) {
                setResult(data);
            } else {
                setError('Test result not found.');
            }
        } catch (err) {
            console.error('[ResultDetailModal] Error loading result:', err);
            setError('Failed to load test results.');
        } finally {
            setLoading(false);
        }
    }, [resultId]);

    useEffect(() => {
        if (opened || inline) {
            setExpandedQuestions(new Set());
            loadResult();
        }
    }, [opened, inline, loadResult]);

    const toggleQuestion = (questionNumber: number) => {
        setExpandedQuestions(prev => {
            const next = new Set(prev);
            if (next.has(questionNumber)) {
                next.delete(questionNumber);
            } else {
                next.add(questionNumber);
            }
            return next;
        });
    };

    const formatAnswer = (answer: string | string[] | Record<string, string>): string => {
        if (!answer) return '';
        if (Array.isArray(answer)) return answer.join(', ');
        if (typeof answer === 'object') return JSON.stringify(answer, null, 2);
        return String(answer ?? '');
    };

    const renderContent = () => {
        if (loading) {
            return (
                <Center style={{ minHeight: 400, flexDirection: 'column', gap: '1.25rem' }}>
                    <Loader size="xl" color="violet" variant="bars" />
                    <Text c="dimmed" fw={600} size="lg">Loading your performance metrics...</Text>
                </Center>
            );
        }

        if (error || !result) {
            return (
                <Center style={{ minHeight: 400, flexDirection: 'column', gap: '1.5rem', padding: '2rem' }}>
                    <div style={{ fontSize: '4rem', filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.1))' }}>⚠️</div>
                    <div style={{ textAlign: 'center' }}>
                        <Text fw={700} size="xl" c="#1e293b" mb="xs">{error || 'Results Unavailable'}</Text>
                        <Text c="dimmed" size="sm">We couldn't retrieve your test data at this moment.</Text>
                    </div>
                </Center>
            );
        }

        // Detect THCS vs IELTS
        const isTHCS = result.testType === 'THCS-THPT' || !!(result as any).thcsData;
        const thcsData = (result as any).thcsData as {
            scaledScore: number;
            sectionResults: Array<{ sectionId?: string; sectionName: string; pointsEarned: number; pointsMax: number; correctCount: number; totalCount: number; percentage: number; intentBreakdown?: Record<string, { correct: number; total: number }> }>;
            intentBreakdown: Record<string, { correct: number; total: number }>;
        } | undefined;

        // Score display: THCS uses scaledScore (10-point), IELTS uses band score (0.5–9.0)
        const displayScore = isTHCS && thcsData
            ? thcsData.scaledScore
            : calculateBandScore(result.percentage);
        const scoreLabel = isTHCS ? 'Điểm số' : 'Estimated Band';
        const scoreStandard = isTHCS ? 'Thang điểm 10' : 'IELTS Standard';
        const scoreColor = isTHCS ? '#8b5cf6' : '#10b981';

        const feedback = generatePerformanceFeedback(result.percentage);

        // feedbackTiming handling
        const feedbackTiming = result.context?.configApplied?.feedbackTiming || 'after_completion';
        const showDetailedFeedback = feedbackTiming !== 'never';

        return (
            <ScrollArea h={inline ? "100%" : "calc(92vh - 85px)"} offsetScrollbars variant="hover">
                <Box p={inline ? "xs" : "xl"}>
                    {/* Header Bar */}
                    <Group justify="space-between" mb="xl">
                        <Group gap="xs">
                            <ActionIcon onClick={onClose} variant="subtle" color="gray">
                                <IconArrowLeft size={18} />
                            </ActionIcon>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 700,
                                color: '#0f172a',
                                letterSpacing: '-0.02em',
                            }}>
                                {result.testTitle || 'Test Result'}
                            </div>
                        </Group>
                        <ResultContextBadge contextType={result.context?.type || 'self_study'} />
                    </Group>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: inline ? '0' : '0 1rem 1rem' }}>
                        {/* Summary Badges */}
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.4rem 1rem',
                                background: isTHCS ? '#f5f3ff' : '#f1f5f9',
                                borderRadius: '2rem',
                                fontSize: '0.875rem',
                                color: '#64748b',
                                fontWeight: 600
                            }}>
                                <span style={{ opacity: 0.7 }}>{isTHCS ? 'THCS-THPT' : (result.testType || 'Practice')}</span>
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#cbd5e1' }} />
                                <span style={{ color: isTHCS ? '#7c3aed' : '#8b5cf6' }}>{isTHCS ? 'Tổng hợp' : (result.testSkill || 'General')}</span>
                            </div>
                        </div>

                        {/* Primary Score Cards */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '0.625rem',
                        }}>
                            <div style={cardStyleCompact}>
                                <div style={cardLabel}>{isTHCS ? 'Số điểm đạt' : 'Points Achieved'}</div>
                                <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#8b5cf6', margin: '0.125rem 0' }}>
                                    {result.totalScore} / {result.maxScore}
                                </div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>
                                    {result.percentage.toFixed(1)}%
                                </div>
                            </div>

                            <div style={cardStyleCompact}>
                                <div style={cardLabel}>{scoreLabel}</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: scoreColor, margin: '0.125rem 0', lineHeight: 1 }}>
                                    {displayScore.toFixed(1)}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{scoreStandard}</div>
                            </div>

                            <div style={{ ...cardStyleCompact, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={cardLabel}>{isTHCS ? 'Phân bố' : 'Distribution'}</div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                    <div title="Correct">
                                        <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#10b981' }}>{result.correct}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700 }}>{isTHCS ? 'ĐÚNG' : 'CORRECT'}</div>
                                    </div>
                                    {!isTHCS && (
                                        <div title="Partial Credit">
                                            <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#f59e0b' }}>{result.partialCredit}</div>
                                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700 }}>PARTIAL</div>
                                        </div>
                                    )}
                                    <div title="Incorrect">
                                        <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#ef4444' }}>{result.incorrect}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700 }}>{isTHCS ? 'SAI' : 'WRONG'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Time Spent (PRD US-11) */}
                            <div style={cardStyleCompact}>
                                <div style={cardLabel}>{isTHCS ? 'Thời gian' : 'Time Spent'}</div>
                                <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#3b82f6', margin: '0.125rem 0' }}>
                                    {(result as any).timeSpent
                                        ? `${Math.floor((result as any).timeSpent / 60)}:${String((result as any).timeSpent % 60).padStart(2, '0')}`
                                        : (result as any).timeTaken
                                            ? `${Math.floor((result as any).timeTaken / 60)}:${String((result as any).timeTaken % 60).padStart(2, '0')}`
                                            : '—'}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                    {(result as any).timeSpent || (result as any).timeTaken ? (isTHCS ? 'Phút' : 'Minutes') : (isTHCS ? 'Chưa ghi nhận' : 'Not recorded')}
                                </div>
                            </div>
                        </div>

                        {/* ── THCS SECTION BREAKDOWN (THCS only) ── */}
                        {isTHCS && thcsData?.sectionResults && thcsData.sectionResults.length > 0 && (
                            <div>
                                <div
                                    onClick={() => setSectionResultsOpen(!sectionResultsOpen)}
                                    style={{
                                        fontSize: '1.125rem',
                                        fontWeight: 800,
                                        color: '#1e293b',
                                        marginBottom: sectionResultsOpen ? '1rem' : 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                    }}
                                >
                                    <div style={{ width: 32, height: 32, borderRadius: '8px', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>📋</div>
                                    <span style={{ flex: 1 }}>Kết quả theo phần</span>
                                    <div style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        background: sectionResultsOpen ? '#ede9fe' : '#f1f5f9',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'transform 0.2s ease, background 0.2s ease',
                                        transform: sectionResultsOpen ? 'rotate(180deg)' : 'rotate(0)',
                                        flexShrink: 0,
                                    }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sectionResultsOpen ? '#7c3aed' : '#64748b'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                    </div>
                                </div>
                                {sectionResultsOpen && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {thcsData.sectionResults.map((sr, i) => {
                                            const pct = sr.totalCount > 0 ? (sr.correctCount / sr.totalCount) * 100 : 0;
                                            const barColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
                                            return (
                                                <div key={i} style={{
                                                    padding: '0.875rem 1.25rem',
                                                    borderRadius: '0.875rem',
                                                    background: '#fff',
                                                    border: '1px solid #f1f5f9',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                                                            {sr.sectionName || `Phần ${i + 1}`}
                                                        </span>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: barColor }}>
                                                            {sr.correctCount}/{sr.totalCount} ({pct.toFixed(0)}%)
                                                        </span>
                                                    </div>
                                                    <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 3, background: barColor, transition: 'width 0.6s ease' }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}




                        {/* AI Formative Feedback Panel (THCS only, when available) */}
                        {isTHCS && (result as any).formativeFeedback && (
                            <FormativeFeedbackPanel feedback={(result as any).formativeFeedback as FormativeFeedback} />
                        )}

                        {/* Question Breakdown */}
                        {showDetailedFeedback && (
                            <div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '1.25rem',
                                }}>
                                    <div style={{
                                        fontSize: '1.125rem',
                                        fontWeight: 800,
                                        color: '#1e293b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem'
                                    }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '8px', background: isTHCS ? '#7c3aed' : '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🔍</div>
                                        {isTHCS ? 'Chi tiết từng câu' : 'Question Breakdown'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                                        <button
                                            onClick={() => setQuestionViewMode('overview')}
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                background: questionViewMode === 'overview' ? '#fff' : 'transparent',
                                                color: questionViewMode === 'overview' ? '#4f46e5' : '#6b7280',
                                                boxShadow: questionViewMode === 'overview' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            }}
                                        >
                                            Tổng quan
                                        </button>
                                        <button
                                            onClick={() => setQuestionViewMode('detailed')}
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                background: questionViewMode === 'detailed' ? '#fff' : 'transparent',
                                                color: questionViewMode === 'detailed' ? '#4f46e5' : '#6b7280',
                                                boxShadow: questionViewMode === 'detailed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            }}
                                        >
                                            Chi tiết
                                        </button>
                                    </div>
                                </div>

                                {/* Overview Mode: Pills Grid */}
                                {questionViewMode === 'overview' && result.questionResults && (
                                    <QuestionPillsGrid
                                        questions={result.questionResults.map(qr => ({
                                            questionNumber: qr.questionNumber,
                                            questionType: qr.questionType || 'multiple-choice',
                                            isCorrect: qr.isCorrect,
                                            score: qr.score,
                                            maxScore: qr.maxScore,
                                            studentAnswer: qr.studentAnswer,
                                            correctAnswer: qr.correctAnswer,
                                            feedback: qr.feedback || '',
                                        } as QuestionResultItem))}
                                        formatAnswer={formatAnswer}
                                    />
                                )}

                                {/* Detailed Mode: Expandable Cards */}
                                {questionViewMode === 'detailed' && (

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                                        {result.questionResults?.map((qr) => {
                                            const isExpanded = expandedQuestions.has(qr.questionNumber);
                                            const sc = qr.isCorrect
                                                ? { bg: '#f0fdf4', border: '#bcf2d4', text: '#15803d', icon: '✓' }
                                                : qr.score > 0
                                                    ? { bg: '#fffbeb', border: '#fde68a', text: '#b45309', icon: '⚡' }
                                                    : { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: '✗' };

                                            return (
                                                <div
                                                    key={qr.questionNumber}
                                                    style={{
                                                        borderRadius: '1rem',
                                                        border: '1px solid',
                                                        borderColor: isExpanded ? sc.border : '#f1f5f9',
                                                        background: isExpanded ? sc.bg : '#fff',
                                                        overflow: 'hidden',
                                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        boxShadow: isExpanded ? '0 10px 25px -5px rgba(0,0,0,0.05)' : '0 2px 4px rgba(0,0,0,0.01)',
                                                    }}
                                                >
                                                    <div
                                                        onClick={() => toggleQuestion(qr.questionNumber)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '1.25rem',
                                                            padding: '1.125rem 1.5rem',
                                                            cursor: 'pointer',
                                                            userSelect: 'none',
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '2.75rem',
                                                            height: '2.75rem',
                                                            borderRadius: '50%',
                                                            background: isExpanded ? '#fff' : sc.bg,
                                                            border: `2px solid ${sc.border}`,
                                                            color: sc.text,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: 800,
                                                            fontSize: '1.125rem',
                                                            flexShrink: 0,
                                                            boxShadow: isExpanded ? '0 4px 8px rgba(0,0,0,0.05)' : 'none',
                                                        }}>
                                                            {qr.questionNumber}
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span style={{ color: sc.text }}>{sc.icon}</span>
                                                                Question {qr.questionNumber}
                                                            </div>
                                                            <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600, marginTop: '0.125rem' }}>
                                                                Result: <span style={{ color: sc.text }}>{qr.score} / {qr.maxScore} points</span>
                                                            </div>
                                                        </div>
                                                        <div style={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: '50%',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            background: isExpanded ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)',
                                                            color: '#94a3b8',
                                                            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                                        }}>▼</div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div style={{ padding: '0 1.5rem 1.5rem', borderTop: '1px solid rgba(0,0,0,0.03)' }}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: qr.isCorrect ? '1fr' : '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Your Response</div>
                                                                    <div style={{
                                                                        padding: '1rem',
                                                                        background: '#fff',
                                                                        border: `1.5px solid ${sc.border}`,
                                                                        borderRadius: '0.75rem',
                                                                        fontSize: '0.9rem',
                                                                        fontWeight: 600,
                                                                        color: '#1e293b',
                                                                        fontFamily: 'Inter, system-ui, sans-serif',
                                                                        lineHeight: 1.5
                                                                    }}>
                                                                        {qr.studentAnswer ? formatAnswer(qr.studentAnswer) : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No answer recorded</span>}
                                                                    </div>
                                                                </div>

                                                                {!qr.isCorrect && (
                                                                    <div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Correct Key</div>
                                                                        <div style={{
                                                                            padding: '1rem',
                                                                            background: '#f0fdf4',
                                                                            border: '1.5px solid #bcf2d4',
                                                                            borderRadius: '0.75rem',
                                                                            fontSize: '0.9rem',
                                                                            fontWeight: 700,
                                                                            color: '#15803d',
                                                                            fontFamily: 'Inter, system-ui, sans-serif',
                                                                            lineHeight: 1.5
                                                                        }}>
                                                                            {formatAnswer(qr.correctAnswer)}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {qr.feedback && (
                                                                <div style={{
                                                                    marginTop: '1rem',
                                                                    padding: '1rem 1.25rem',
                                                                    background: 'rgba(0,0,0,0.02)',
                                                                    borderRadius: '0.75rem',
                                                                    fontSize: '0.875rem',
                                                                    color: '#475569',
                                                                    lineHeight: 1.6,
                                                                    borderLeft: `4px solid ${sc.border}`
                                                                }}>
                                                                    <div style={{ fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.25rem', opacity: 0.6 }}>Explanation</div>
                                                                    {qr.feedback}
                                                                </div>
                                                            )}

                                                            {/* AI explanation for incorrect questions (from formative feedback) */}
                                                            {(() => {
                                                                if (qr.isCorrect || !isTHCS) return null;
                                                                const ff = (result as any).formativeFeedback;
                                                                if (!ff?.questionExplanations) return null;
                                                                // AI may use "Q17" or "17" as keys — try both
                                                                const explanation = ff.questionExplanations[`Q${qr.questionNumber}`]
                                                                    || ff.questionExplanations[String(qr.questionNumber)];
                                                                if (!explanation) return null;
                                                                return (
                                                                    <div style={{
                                                                        marginTop: '0.75rem',
                                                                        padding: '1rem 1.25rem',
                                                                        background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)',
                                                                        borderRadius: '0.75rem',
                                                                        fontSize: '0.875rem',
                                                                        color: '#1e40af',
                                                                        lineHeight: 1.6,
                                                                        borderLeft: '4px solid #818cf8',
                                                                    }}>
                                                                        <div style={{ fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.25rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                                            <span style={{ fontSize: '0.8rem' }}>🤖</span> AI Explanation
                                                                        </div>
                                                                        {explanation}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Box>
            </ScrollArea>
        );
    };

    if (inline) {
        return (
            <div style={{ width: '100%', height: '100%', background: '#fff' }}>
                {renderContent()}
            </div>
        );
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            withCloseButton={false}
            size="lg"
            centered
            radius="24px"
            padding={0}
            overlayProps={{
                backgroundOpacity: 0.4,
                blur: 10,
            }}
            styles={{
                content: {
                    background: '#ffffff',
                    boxShadow: '0 30px 60px -12px rgba(0,0,0,0.25)',
                    maxHeight: '92vh',
                    overflow: 'hidden',
                },
                body: { padding: 0 }
            }}
        >
            {renderContent()}
        </Modal>
    );
};

const cardStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '1rem 0.5rem',
    borderRadius: '0.75rem',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
};

const cardStyleCompact: React.CSSProperties = {
    textAlign: 'center',
    padding: '0.75rem 0.375rem',
    borderRadius: '0.625rem',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
};

const cardLabel: React.CSSProperties = {
    fontSize: '0.7rem',
    color: '#64748b',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: '0.25rem',
    letterSpacing: '0.05em',
};

export default ResultDetailModal;
