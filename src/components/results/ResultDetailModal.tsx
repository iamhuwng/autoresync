import React, { useState, useEffect, useCallback, useRef } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import { getTestResult, TestResultRecord } from '../../services/testResults.service';
import { ref, onValue } from 'firebase/database';
import { database } from '../../services/firebase';

import { ResultContextBadge } from './ResultContextBadge';
import { FormativeFeedbackPanel } from '../thcs-student/FormativeFeedbackPanel';
import { QuestionPillsGrid } from './QuestionPillsGrid';
import type { QuestionResultItem } from './QuestionPillsGrid';
import type { FormativeFeedback } from '../../types/thcs-test.types';
import { generateFormativeFeedback } from '../../services/formativeFeedback.service';

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
    const [sectionResultsOpen, setSectionResultsOpen] = useState(false);
    const [formativeFeedbackLoading, setFormativeFeedbackLoading] = useState(false);
    const [feedbackError, setFeedbackError] = useState(false);
    const feedbackAttemptedRef = useRef(false);

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
                setResult(null);
                setError('Test result not found.');
            }
        } catch (err) {
            console.error('[ResultDetailModal] Error loading result:', err);
            setResult(null);
            setError('Failed to load test results.');
        } finally {
            setLoading(false);
        }
    }, [resultId]);

    useEffect(() => {
        if (!opened && !inline) {
            return;
        }


        if (!resultId) {
            setResult(null);
            setError('No result ID provided');
            setLoading(false);
            return;
        }

        let hasReceivedSnapshot = false;
        setLoading(true);
        setError(null);

        const resultRef = ref(database, `test_results/${resultId}`);
        const unsubscribe = onValue(
            resultRef,
            (snapshot) => {
                hasReceivedSnapshot = true;
                if (snapshot.exists()) {
                    setResult(snapshot.val() as TestResultRecord);
                    setError(null);
                } else {
                    setResult(null);
                    setError('Test result not found.');
                }
                setLoading(false);
            },
            (err) => {
                console.error('[ResultDetailModal] Realtime subscription failed:', err);
                if (!hasReceivedSnapshot) {
                    loadResult();
                }
            }
        );

        return () => unsubscribe();
    }, [opened, inline, resultId, loadResult]);


    const formatAnswer = (answer: string | string[] | Record<string, string>): string => {
        if (!answer) return '';
        if (Array.isArray(answer)) return answer.join(', ');
        if (typeof answer === 'object') return JSON.stringify(answer, null, 2);
        return String(answer ?? '');
    };

    const handleGenerateFormativeFeedback = useCallback(async () => {
        if (!result) return;

        const thcsData = (result as any).thcsData;
        if (!thcsData?.sectionResults || !Array.isArray(thcsData.sectionResults)) {
            return;
        }

        try {
            setFormativeFeedbackLoading(true);
            setFeedbackError(false);
            const safeSections = Array.isArray((result as any).sections)
                ? (result as any).sections
                : thcsData.sectionResults.map((section: any) => ({
                    sectionName: section.sectionName,
                    questions: [],
                }));

            await generateFormativeFeedback(
                {
                    scaledScore: thcsData.scaledScore,
                    totalPoints: result.totalScore,
                    maxPoints: result.maxScore,
                    sectionResults: thcsData.sectionResults,
                    questionResults: Object.fromEntries(
                        (result.questionResults || []).map(qr => [qr.questionNumber, {
                            questionNumber: qr.questionNumber,
                            isCorrect: qr.isCorrect,
                            studentAnswer: qr.studentAnswer,
                            correctAnswer: qr.correctAnswer,
                            pointsEarned: qr.score,
                            pointsMax: qr.maxScore,
                        }])
                    ),
                    gradingStatus: 'fully-graded',
                    gradedAt: result.submittedAt,
                } as any,
                safeSections as any,
                {
                    title: result.testTitle || 'THCS Test',
                    gradeLevel: (result as any).gradeLevel || 9,
                },
                resultId,
            );
            // No need to call loadResult() — the RTDB onValue listener
            // will automatically pick up the newly-written formativeFeedback
        } catch (err) {
            console.error('[ResultDetailModal] Failed to generate formative feedback:', err);
            setFeedbackError(true);
        } finally {
            setFormativeFeedbackLoading(false);
        }
    }, [result, resultId]);

    // ── Auto-trigger feedback generation when modal opens with no feedback ──
    useEffect(() => {
        if (!result || loading) return;

        const isTHCS = !!(result as any).thcsData;
        const hasFeedback = !!(result as any).formativeFeedback;
        const hasThcsData = !!(result as any).thcsData?.sectionResults;

        // Only auto-trigger for THCS results that lack feedback and have grading data
        if (isTHCS && !hasFeedback && hasThcsData && !formativeFeedbackLoading && !feedbackError) {
            // Deduplication: only attempt once per modal open
            if (!feedbackAttemptedRef.current) {
                feedbackAttemptedRef.current = true;
                console.log('🤖 [ResultDetailModal] Auto-triggering feedback generation');
                handleGenerateFormativeFeedback();
            }
        }
    }, [result, loading, formativeFeedbackLoading, feedbackError, handleGenerateFormativeFeedback]);

    // Reset the attempt ref when modal closes or resultId changes
    useEffect(() => {
        feedbackAttemptedRef.current = false;
        setFeedbackError(false);
    }, [resultId, opened]);

    const renderContent = () => {
        if (loading) {
            return (
                <div style={{ minHeight: 400, display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'resultSpin 0.8s linear infinite' }} />
                    <style>{`@keyframes resultSpin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ margin: 0, color: '#6b7280', fontWeight: 600, fontSize: '1.125rem' }}>Loading your performance metrics...</p>
                </div>
            );
        }

        if (error || !result) {
            return (
                <div style={{ minHeight: 400, display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '4rem', filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.1))' }}>⚠️</div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1e293b', marginBottom: '0.25rem' }}>{error || 'Results Unavailable'}</div>
                        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>We couldn't retrieve your test data at this moment.</div>
                    </div>
                </div>
            );
        }

        // Detect THCS vs IELTS
        const isTHCS = result.testType === 'THCS-THPT' || !!(result as any).thcsData;
        const thcsData = (result as any).thcsData as {
            scaledScore: number;
            sectionResults: Array<{ sectionId?: string; sectionName: string; pointsEarned: number; pointsMax: number; correctCount: number; totalCount: number; percentage: number; intentBreakdown?: Record<string, { correct: number; total: number }> }>;
            intentBreakdown: Record<string, { correct: number; total: number }>;
        } | undefined;

        // feedbackTiming handling
        const feedbackTiming = result.context?.configApplied?.feedbackTiming || 'after_completion';
        const showDetailedFeedback = feedbackTiming !== 'never';

        return (
            <div style={{ height: inline ? '100%' : 'calc(92vh - 85px)', overflowY: 'auto' }}>
                <div style={{ padding: inline ? '0.5rem' : '1.25rem' }}>
                    {/* Header Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Back"
                                title="Back"
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 8,
                                    border: '1px solid #e5e7eb',
                                    background: '#ffffff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                }}
                            >
                                <IconArrowLeft size={18} />
                            </button>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 700,
                                color: '#0f172a',
                                letterSpacing: '-0.02em',
                            }}>
                                {result.testTitle || 'Test Result'}
                            </div>
                        </div>
                        <ResultContextBadge contextType={result.context?.type || 'self_study'} />
                    </div>

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
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '0.625rem',
                            overflow: 'hidden',
                        }}>
                            <div style={cardStyleCompact}>
                                <div style={cardLabel}>{isTHCS ? 'Số điểm đạt' : 'Points Achieved'}</div>
                                <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#8b5cf6', margin: '0.125rem 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {formatScore(result.totalScore)} / {formatScore(result.maxScore)}
                                </div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>
                                    {result.percentage.toFixed(1)}%
                                </div>
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
                                <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#3b82f6', margin: '0.125rem 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {result.timeElapsed != null && result.timeElapsed > 0
                                        ? `${Math.floor(result.timeElapsed / 60)}:${String(result.timeElapsed % 60).padStart(2, '0')}`
                                        : '—'}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                    {result.timeElapsed != null && result.timeElapsed > 0
                                        ? (isTHCS ? 'Phút' : 'Minutes')
                                        : (isTHCS ? 'Chưa ghi nhận' : 'Not recorded')}
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




                        {/* Auto-generating feedback: loading shimmer or error/retry */}
                        {isTHCS && !(result as any).formativeFeedback && (
                            <div style={{
                                background: feedbackError
                                    ? 'linear-gradient(135deg, rgba(239,68,68,0.04), rgba(239,68,68,0.08))'
                                    : 'linear-gradient(135deg, rgba(139,92,246,0.04), rgba(99,102,241,0.08))',
                                border: feedbackError
                                    ? '1px solid rgba(239,68,68,0.15)'
                                    : '1px solid rgba(139,92,246,0.12)',
                                borderRadius: '16px',
                                padding: '1.25rem',
                                overflow: 'hidden',
                                position: 'relative' as const,
                            }}>
                                {formativeFeedbackLoading ? (
                                    /* Loading state: shimmer skeleton */
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%',
                                                border: '3px solid rgba(139,92,246,0.15)',
                                                borderTopColor: '#8b5cf6',
                                                animation: 'resultSpin 0.8s linear infinite',
                                                flexShrink: 0,
                                            }} />
                                            <div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#6d28d9' }}>
                                                    🤖 Generating personalized feedback...
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#8b5cf6', marginTop: '0.15rem' }}>
                                                    AI is analyzing your performance
                                                </div>
                                            </div>
                                        </div>
                                        {/* Shimmer bars */}
                                        {[85, 70, 55, 40].map((width, i) => (
                                            <div key={i} style={{
                                                height: 10, borderRadius: 5, marginBottom: 8,
                                                width: `${width}%`,
                                                background: 'linear-gradient(90deg, rgba(139,92,246,0.08) 25%, rgba(139,92,246,0.18) 50%, rgba(139,92,246,0.08) 75%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'feedbackShimmer 1.5s ease-in-out infinite',
                                            }} />
                                        ))}
                                        <style>{`
                                            @keyframes feedbackShimmer {
                                                0% { background-position: 200% 0; }
                                                100% { background-position: -200% 0; }
                                            }
                                        `}</style>
                                    </>
                                ) : feedbackError ? (
                                    /* Error state: subtle retry */
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.2rem' }}>
                                                ⚠️ Feedback unavailable
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#b91c1c' }}>
                                                AI service is temporarily busy. You can try again.
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                feedbackAttemptedRef.current = false;
                                                setFeedbackError(false);
                                                handleGenerateFormativeFeedback();
                                            }}
                                            style={{
                                                border: '1px solid rgba(239,68,68,0.3)',
                                                borderRadius: '999px',
                                                padding: '0.5rem 1rem',
                                                background: 'rgba(239,68,68,0.08)',
                                                color: '#dc2626',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.15s ease',
                                            }}
                                            onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'; }}
                                            onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; }}
                                        >
                                            🔄 Retry
                                        </button>
                                    </div>
                                ) : null}
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
                                </div>

                                {/* Pills Grid — always shown */}
                                {result.questionResults && (
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
                                        aiExplanations={(() => {
                                            const ff = (result as any).formativeFeedback;
                                            return ff?.questionExplanations || undefined;
                                        })()}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (inline) {
        return (
            <div style={{ width: '100%', height: '100%', background: '#fff' }}>
                {renderContent()}
            </div>
        );
    }

    if (!opened) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 'min(960px, 100%)',
                    background: '#ffffff',
                    boxShadow: '0 30px 60px -12px rgba(0,0,0,0.25)',
                    maxHeight: '92vh',
                    overflow: 'hidden',
                    borderRadius: 24,
                }}
            >
                {renderContent()}
            </div>
        </div>
    );
};

/** Format a numeric score: show as integer if whole, otherwise 1 decimal */
const formatScore = (n: number): string => {
    if (n == null || isNaN(n)) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

const cardStyleCompact: React.CSSProperties = {
    textAlign: 'center',
    padding: '0.75rem 0.375rem',
    borderRadius: '0.625rem',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    minWidth: 0,
    overflow: 'hidden',
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
