import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Center, Loader, ScrollArea, Text, Group, ActionIcon, Box } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { getTestResult, TestResultRecord } from '../../services/testResults.service';
import { calculateBandScore, generatePerformanceFeedback } from '../../services/autoMarking.service';
import { ResultContextBadge } from './ResultContextBadge';

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
            sectionResults: Array<{ sectionTitle: string; totalPoints: number; maxPoints: number; intentBreakdown?: Record<string, { correct: number; total: number }> }>;
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
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: '1rem',
                        }}>
                            <div style={cardStyle}>
                                <div style={cardLabel}>{isTHCS ? 'Số điểm đạt' : 'Points Achieved'}</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#8b5cf6', margin: '0.25rem 0' }}>
                                    {result.totalScore} / {result.maxScore}
                                </div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#94a3b8' }}>
                                    {result.percentage.toFixed(1)}%
                                </div>
                            </div>

                            <div style={cardStyle}>
                                <div style={cardLabel}>{scoreLabel}</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: scoreColor, margin: '0.25rem 0', lineHeight: 1 }}>
                                    {displayScore.toFixed(1)}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{scoreStandard}</div>
                            </div>

                            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={cardLabel}>{isTHCS ? 'Phân bố' : 'Distribution'}</div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                                    <div title="Correct">
                                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#10b981' }}>{result.correct}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{isTHCS ? 'ĐÚNG' : 'CORRECT'}</div>
                                    </div>
                                    <div title="Partial Credit">
                                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f59e0b' }}>{result.partialCredit}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{isTHCS ? 'MỘT PHẦN' : 'PARTIAL'}</div>
                                    </div>
                                    <div title="Incorrect">
                                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#ef4444' }}>{result.incorrect}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{isTHCS ? 'SAI' : 'WRONG'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Time Spent (PRD US-11) */}
                            <div style={cardStyle}>
                                <div style={cardLabel}>{isTHCS ? 'Thời gian' : 'Time Spent'}</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#3b82f6', margin: '0.25rem 0' }}>
                                    {(result as any).timeSpent
                                        ? `${Math.floor((result as any).timeSpent / 60)}:${String((result as any).timeSpent % 60).padStart(2, '0')}`
                                        : (result as any).timeTaken
                                            ? `${Math.floor((result as any).timeTaken / 60)}:${String((result as any).timeTaken % 60).padStart(2, '0')}`
                                            : '—'}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                                    {(result as any).timeSpent || (result as any).timeTaken ? (isTHCS ? 'Phút' : 'Minutes') : (isTHCS ? 'Chưa ghi nhận' : 'Not recorded')}
                                </div>
                            </div>
                        </div>

                        {/* ── THCS SECTION BREAKDOWN (THCS only) ── */}
                        {isTHCS && thcsData?.sectionResults && thcsData.sectionResults.length > 0 && (
                            <div>
                                <div style={{
                                    fontSize: '1.125rem',
                                    fontWeight: 800,
                                    color: '#1e293b',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem'
                                }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '8px', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>📋</div>
                                    Kết quả theo phần
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                    {thcsData.sectionResults.map((sr, i) => {
                                        const pct = sr.maxPoints > 0 ? (sr.totalPoints / sr.maxPoints) * 100 : 0;
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
                                                        {sr.sectionTitle || `Phần ${i + 1}`}
                                                    </span>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: barColor }}>
                                                        {sr.totalPoints}/{sr.maxPoints} ({pct.toFixed(0)}%)
                                                    </span>
                                                </div>
                                                <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 3, background: barColor, transition: 'width 0.6s ease' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── THCS INTENT BREAKDOWN (THCS only) ── */}
                        {isTHCS && thcsData?.intentBreakdown && Object.keys(thcsData.intentBreakdown).length > 0 && (
                            <div style={{
                                padding: '1.25rem',
                                borderRadius: '1rem',
                                background: '#faf5ff',
                                border: '1px solid #ede9fe',
                            }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                                    Phân tích theo dạng bài
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {Object.entries(thcsData.intentBreakdown).map(([intent, data]) => {
                                        const pct = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                                        const tagColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
                                        return (
                                            <div key={intent} style={{
                                                padding: '0.375rem 0.75rem',
                                                borderRadius: '2rem',
                                                background: '#fff',
                                                border: `1.5px solid ${tagColor}30`,
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                color: tagColor,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.375rem',
                                            }}>
                                                <span style={{ color: '#64748b', fontWeight: 600 }}>{intent.replace(/-/g, ' ')}</span>
                                                <span>{data.correct}/{data.total}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Feedback Banner */}
                        <div style={{
                            padding: '1.5rem',
                            borderRadius: '1.25rem',
                            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '1.25rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{
                                width: '3.5rem',
                                height: '3.5rem',
                                borderRadius: '1rem',
                                background: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '2rem',
                                boxShadow: '0 8px 16px rgba(0,0,0,0.05)',
                                flexShrink: 0
                            }}>
                                {result.percentage >= 80 ? '🎯' : result.percentage >= 60 ? '🚀' : '📖'}
                            </div>
                            <div style={{ flex: 1, paddingTop: '0.25rem' }}>
                                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1rem', marginBottom: '0.5rem' }}>
                                    {isTHCS ? 'Nhận xét' : 'Tutor Feedback'}
                                </div>
                                <div style={{ fontSize: '0.925rem', color: '#475569', lineHeight: 1.6, fontWeight: 500 }}>
                                    {feedback}
                                </div>
                            </div>
                        </div>

                        {/* Question Breakdown */}
                        {showDetailedFeedback && (
                            <div>
                                <div style={{
                                    fontSize: '1.125rem',
                                    fontWeight: 800,
                                    color: '#1e293b',
                                    marginBottom: '1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem'
                                }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '8px', background: isTHCS ? '#7c3aed' : '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🔍</div>
                                    {isTHCS ? 'Chi tiết từng câu' : 'Detailed Question Breakdown'}
                                </div>

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
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
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

const cardLabel: React.CSSProperties = {
    fontSize: '0.7rem',
    color: '#64748b',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: '0.25rem',
    letterSpacing: '0.05em',
};

export default ResultDetailModal;
