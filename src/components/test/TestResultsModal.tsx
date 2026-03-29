/**
 * Test Results Modal Component
 * PRD-TEST-END-FLOW: Displays test results in a modal overlay
 * within the waiting room after teacher ends a test.
 *
 * Features:
 * - Score header (score/max, percentage, band score)
 * - Questions summary (correct/incorrect/partial)
 * - Performance feedback
 * - Scrollable question-by-question breakdown
 * - Close/reopen support
 *
 * Uses Mantine Modal to match existing design patterns (StudentDetailModal).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Center, Loader, ScrollArea, Text } from '@mantine/core';
import {
    getStudentSessionResult,
    getStudentResults,
    getTestResult,
    TestResultRecord,
} from '../../services/testResults.service';
import { calculateBandScore, generatePerformanceFeedback } from '../../services/autoMarking.service';
import { sessionService } from '../../services/sessionService';
import { ref, get } from 'firebase/database';
import { getReleaseVisibility, getEffectiveReleaseState } from '../../types/releaseState.types';
import type { ReviewReleaseState } from '../../types/releaseState.types';
// @ts-ignore
import { database } from '../../services/firebase';

interface TestResultsModalProps {
    opened: boolean;
    onClose: () => void;
    sessionCode: string;
    /** PRD-0040 Phase 2: Controls what students can see */
    reviewReleaseState?: ReviewReleaseState;
}

/**
 * TestResultsModal — shows test results inside the StudentWaitingRoomPage
 * so students stay in the lobby instead of navigating away.
 */
export const TestResultsModal: React.FC<TestResultsModalProps> = ({
    opened,
    onClose,
    sessionCode,
    reviewReleaseState,
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TestResultRecord | null>(null);
    const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openedRef = useRef(opened);

    const clearRetryTimer = useCallback(() => {
        if (retryTimeoutRef.current !== null) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        openedRef.current = opened;
    }, [opened]);

    /**
     * Multi-path result fetching with 3 fallback strategies:
     * 
     * Strategy 1: Query test_results_by_session/{sessionCode} (original path)
     *   - This is the normal path when saveTestResult completes on teacher's side
     * 
     * Strategy 2: Query test_results_by_student/{studentId} and filter by sessionCode
     *   - Fallback if the session index write was delayed/failed but student index succeeded
     * 
     * Strategy 3: Read player's latestResultId from game session and load canonical row directly
     *   - Durable pointer when secondary indexes are delayed or missing
     *
     * Strategy 4: Read player's lastTestId from game session and search by testId
     *   - Legacy fallback using the persistent lastTestId we save on each player node
     */
    const loadResult = useCallback(async (retryCount = 0) => {
        const MAX_RETRIES = 7;
        if (!openedRef.current) {
            return;
        }
        try {
            clearRetryTimer();
            setLoading(true);
            setError(null);

            const studentId = sessionService.getPlayerId();
            if (!studentId) {
                if (!openedRef.current) {
                    return;
                }
                setError('Student ID not found');
                setLoading(false);
                return;
            }

            console.log(`📊 [TestResultsModal] Loading result for student ${studentId} in session ${sessionCode} (attempt ${retryCount + 1})`);

            // Strategy 1: Query by session index (fastest path)
            const sessionResult = await getStudentSessionResult(studentId, sessionCode);
            if (!openedRef.current) {
                return;
            }
            if (sessionResult) {
                console.log('✅ [TestResultsModal] Found result via session index');
                setResult(sessionResult);
                setLoading(false);
                return;
            }

            // Strategy 2: Query by student index, filter by sessionCode
            // This works even if test_results_by_session wasn't written yet
            try {
                const studentResults = await getStudentResults(studentId);
                if (!openedRef.current) {
                    return;
                }
                // Sort by submittedAt descending so the most recent submission wins
                const matchingResult = studentResults
                    .filter(r => r.sessionCode === sessionCode)
                    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0];
                if (matchingResult) {
                    console.log('✅ [TestResultsModal] Found result via student index (fallback)');
                    setResult(matchingResult);
                    setLoading(false);
                    return;
                }
            } catch (fallbackErr) {
                console.warn('[TestResultsModal] Student index fallback failed:', fallbackErr);
            }

            // Strategy 3: Read the player's direct canonical result pointer
            try {
                const playerRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);
                const playerSnap = await get(playerRef);
                if (!openedRef.current) {
                    return;
                }
                if (playerSnap.exists()) {
                    const playerData = playerSnap.val();
                    const latestResultId = playerData.latestResultId;
                    if (latestResultId) {
                        console.log(`🔍 [TestResultsModal] Trying with latestResultId: ${latestResultId}`);
                        const directResult = await getTestResult(latestResultId);
                        if (!openedRef.current) {
                            return;
                        }
                        if (
                            directResult
                            && directResult.studentId === studentId
                            && directResult.sessionCode === sessionCode
                        ) {
                            console.log('✅ [TestResultsModal] Found result via latestResultId (direct fallback)');
                            setResult(directResult);
                            setLoading(false);
                            return;
                        }
                    }

                    // Strategy 4: Legacy lastTestId fallback via student history
                    if (retryCount >= 2) {
                        const lastTestId = playerData.lastTestId;
                        if (lastTestId) {
                            console.log(`🔍 [TestResultsModal] Trying with lastTestId: ${lastTestId}`);
                            const studentResults = await getStudentResults(studentId);
                            if (!openedRef.current) {
                                return;
                            }
                            const matchByTest = studentResults.find(
                                r => r.testId === lastTestId && r.sessionCode === sessionCode
                            );
                            if (matchByTest) {
                                console.log('✅ [TestResultsModal] Found result via lastTestId (fallback 2)');
                                setResult(matchByTest);
                                setLoading(false);
                                return;
                            }
                        }
                    }
                }
            } catch (lastTestErr) {
                console.warn('[TestResultsModal] direct player fallback failed:', lastTestErr);
            }

            // Result not available yet — retry with increasing delays
            if (retryCount < MAX_RETRIES) {
                const delay = Math.min((retryCount + 1) * 1500, 5000);
                console.log(`⏳ [TestResultsModal] Result not found via any path, retrying in ${delay}ms (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`);
                retryTimeoutRef.current = setTimeout(() => {
                    retryTimeoutRef.current = null;
                    if (!openedRef.current) {
                        return;
                    }
                    void loadResult(retryCount + 1);
                }, delay);
                return;
            }

            if (!openedRef.current) {
                return;
            }
            setError('Test results are still being processed. Please close and try again in a moment.');
            setLoading(false);
        } catch (err) {
            if (!openedRef.current) {
                return;
            }
            console.error('[TestResultsModal] Error loading result:', err);
            if (retryCount < MAX_RETRIES) {
                const delay = Math.min((retryCount + 1) * 1500, 5000);
                retryTimeoutRef.current = setTimeout(() => {
                    retryTimeoutRef.current = null;
                    if (!openedRef.current) {
                        return;
                    }
                    void loadResult(retryCount + 1);
                }, delay);
                return;
            }
            setError('Failed to load test results. Please try again.');
            setLoading(false);
        }
    }, [clearRetryTimer, sessionCode]);

    // Load on open
    useEffect(() => {
        clearRetryTimer();
        if (opened) {
            setExpandedQuestions(new Set());
            setLoading(true);
            setError(null);
            setResult(null);
            loadResult();
        }
        return () => {
            clearRetryTimer();
        };
    }, [clearRetryTimer, loadResult, opened]);

    // Toggle question expansion
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

    // Format answer display
    const formatAnswer = (answer: string | string[] | Record<string, string>): string => {
        if (Array.isArray(answer)) return answer.join(', ');
        if (typeof answer === 'object') return JSON.stringify(answer, null, 2);
        return String(answer ?? '');
    };

    // ───────────────────────────────────────────────────────────
    // RENDER
    // ───────────────────────────────────────────────────────────

    const renderContent = () => {
        if (loading) {
            return (
                <Center style={{ minHeight: 400, flexDirection: 'column', gap: '1.25rem' }}>
                    <Loader size="xl" color="violet" variant="bars" />
                    <Text c="dimmed" fw={600} size="lg">Compiling your performance metrics...</Text>
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
                    <button
                        onClick={() => loadResult()}
                        style={{
                            padding: '0.75rem 2rem',
                            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '1rem',
                            boxShadow: '0 10px 20px -5px rgba(139, 92, 246, 0.4)',
                            transition: 'transform 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        Re-fetch Results
                    </button>
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

        // PRD-0040 Phase 2: Derive visibility flags from release state
        const effectiveState = getEffectiveReleaseState(reviewReleaseState);
        const visibility = getReleaseVisibility(effectiveState);
        const questionResults = Array.isArray(result.questionResults)
            ? result.questionResults
            : [];
        const hasQuestionBreakdown = questionResults.length > 0;
        const isWritingResult = result.testSkill === 'writing' || Boolean((result as any).writingData);

        const feedback = visibility.showAIFeedback ? generatePerformanceFeedback(result.percentage) : null;

        return (
            <ScrollArea h="calc(92vh - 85px)" offsetScrollbars variant="hover">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1.5rem 2rem 2.5rem' }}>
                    {/* ── HEADER SUMMARY ── */}
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            letterSpacing: '-0.02em',
                            marginBottom: '0.5rem'
                        }}>
                            {result.testTitle || 'Final Assessment'}
                        </div>
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
                            <span style={{ opacity: 0.7 }}>{isTHCS ? 'THCS-THPT' : result.testType}</span>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#cbd5e1' }} />
                            <span style={{ color: isTHCS ? '#7c3aed' : '#8b5cf6' }}>{isTHCS ? 'Tổng hợp' : result.testSkill}</span>
                        </div>
                    </div>

                    {/* ── PRIMARY SCORE CARDS ── */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '1rem',
                    }}>
                        {/* Score */}
                        <div style={cardStyle}>
                            <div style={cardLabel}>{isTHCS ? 'Số điểm đạt' : 'Points Achieved'}</div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#8b5cf6', margin: '0.25rem 0' }}>
                                {result.totalScore} / {result.maxScore}
                            </div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#94a3b8' }}>
                                {result.percentage.toFixed(1)}%
                            </div>
                        </div>

                        {/* Band / Scaled Score */}
                        <div style={cardStyle}>
                            <div style={cardLabel}>{scoreLabel}</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: scoreColor, margin: '0.25rem 0', lineHeight: 1 }}>
                                {displayScore.toFixed(1)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{scoreStandard}</div>
                        </div>

                        {/* Results Distribution */}
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
                    </div>

                    {/* ── THCS SECTION BREAKDOWN (THCS only) ── */}
                    {visibility.showCorrectAnswers && isTHCS && thcsData?.sectionResults && thcsData.sectionResults.length > 0 && (
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
                    {/* PRD-0040: Only show intent breakdown when review is released (shows scoring detail) */}
                    {visibility.showCorrectAnswers && isTHCS && thcsData?.intentBreakdown && Object.keys(thcsData.intentBreakdown).length > 0 && (
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

                    {/* ── FEEDBACK ── */}
                    {/* PRD-0040: Only show feedback section when feedback is released */}
                    {visibility.showAIFeedback && feedback && (
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
                    )}

                    {/* ── LOCKED-REVIEW NOTICE ── */}
                    {/* PRD-0040: Show a notice when content is restricted */}
                    {!visibility.showCorrectAnswers && (
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderRadius: '1rem',
                            background: 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)',
                            border: '1px solid #fde68a',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                        }}>
                            <div style={{ fontSize: '1.5rem' }}>🔒</div>
                            <div>
                                <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.875rem' }}>
                                    {isTHCS ? 'Kết quả chi tiết đang bị khóa' : 'Detailed Review Locked'}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '0.15rem' }}>
                                    {isTHCS
                                        ? 'Giáo viên sẽ mở đáp án và phần giải thích sau.'
                                        : 'Your teacher will release correct answers and explanations soon.'}
                                </div>
                            </div>
                        </div>
                    )}
                    {visibility.showCorrectAnswers && !visibility.showAIFeedback && (
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderRadius: '0.875rem',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                        }}>
                            <div style={{ fontSize: '1.25rem' }}>📋</div>
                            <div>
                                <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.8rem' }}>
                                    {isTHCS ? 'Đáp án đã được mở' : 'Answers Released'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '0.1rem' }}>
                                    {isTHCS
                                        ? 'Phần giải thích và nhận xét chi tiết sẽ được mở sau.'
                                        : 'AI feedback and explanations will be released by your teacher.'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── QUESTION REVIEW ── */}
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
                            {hasQuestionBreakdown ? questionResults.map((qr) => {
                                const isExpanded = expandedQuestions.has(qr.questionNumber);
                                // PRD-0040: In locked-review, all questions appear as neutral (no correct/incorrect indication)
                                const sc = !visibility.showCorrectAnswers
                                    ? { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b', icon: '•', dark: '#475569' }
                                    : qr.isCorrect
                                        ? { bg: '#f0fdf4', border: '#bcf2d4', text: '#15803d', icon: '✓', dark: '#166534' }
                                        : qr.score > 0
                                            ? { bg: '#fffbeb', border: '#fde68a', text: '#b45309', icon: '⚡', dark: '#92400e' }
                                            : { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: '✗', dark: '#991b1b' };

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
                                        {/* Header Row */}
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
                                                    {/* PRD-0040: In locked-review, don't show score breakdown */}
                                                    {visibility.showCorrectAnswers
                                                        ? <>Result: <span style={{ color: sc.text }}>{qr.score} / {qr.maxScore} points</span></>
                                                        : <span style={{ color: '#94a3b8' }}>Tap to view your answer</span>}
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

                                        {/* Expanded Detail */}
                                        {isExpanded && (
                                            <div style={{ padding: '0 1.5rem 1.5rem', borderTop: '1px solid rgba(0,0,0,0.03)' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: qr.isCorrect ? '1fr' : '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
                                                    {/* Student Answer */}
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

                                                    {/* Correct Answer — only when review is released */}
                                                    {visibility.showCorrectAnswers && !qr.isCorrect && (
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

                                                {/* Explainer Feedback — only when feedback is released */}
                                                {visibility.showAIFeedback && qr.feedback && (
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
                            }) : (
                                <div
                                    style={{
                                        padding: '1rem 1.25rem',
                                        borderRadius: '0.875rem',
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        color: '#475569',
                                        fontSize: '0.9rem',
                                        lineHeight: 1.6,
                                    }}
                                >
                                    {isWritingResult
                                        ? 'This writing submission does not include a per-question breakdown. Your writing result is saved, and detailed grading will appear once review is available.'
                                        : 'Detailed question breakdown is not available for this result yet.'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </ScrollArea>
        );
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <div style={{
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                }}>
                    <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)' }}>
                        📈
                    </div>
                    Test Results Analysis
                </div>
            }
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
                header: {
                    padding: '1.5rem 2rem',
                    background: '#fff',
                    borderBottom: '1px solid #f1f5f9',
                },
                body: {
                    padding: 0,
                },
                close: {
                    scale: '1.2',
                    color: '#94a3b8',
                    '&:hover': {
                        color: '#64748b',
                        background: '#f8fafc'
                    }
                }
            }}
        >
            {renderContent()}
        </Modal>
    );
};

// ── Shared styles ──

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

export default TestResultsModal;
