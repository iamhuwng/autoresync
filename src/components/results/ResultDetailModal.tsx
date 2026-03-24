import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import { getTestResult, TestResultRecord } from '../../services/testResults.service';
import { ref, onValue } from 'firebase/database';
import { database } from '../../services/firebase';

import { ResultContextBadge } from './ResultContextBadge';
import { SharedSavedResultCore } from './SharedSavedResultCore';
import type { FormativeFeedback } from '../../types/thcs-test.types';
import { generateFormativeFeedbackForSavedResult } from '../../services/resultFeedbackGeneration.service';
import { needsAiFeedbackUpgrade } from '../../services/formativeFeedback.service';

interface ResultDetailModalProps {
    opened: boolean;
    onClose: () => void;
    resultId: string;
    inline?: boolean;
}

function isIeltsResult(result: TestResultRecord): boolean {
    const type = String(result.testType || '').toLowerCase();
    const skill = String(result.testSkill || '').toLowerCase();
    return type.includes('ielts') || skill === 'reading' || skill === 'listening';
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
    // sectionResultsOpen removed — section accordion is now internal to OverviewTab via SharedSavedResultCore
    const [formativeFeedbackLoading, setFormativeFeedbackLoading] = useState(false);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const feedbackAttemptedRef = useRef(false);
    const storedFeedbackNeedsUpgrade = useMemo(() => {
        const formativeFeedback = result?.formativeFeedback as FormativeFeedback | undefined;
        return Boolean(formativeFeedback && needsAiFeedbackUpgrade(formativeFeedback, result?.questionResults as any));
    }, [result?.formativeFeedback, result?.questionResults]);

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


    // formatAnswer removed — answer formatting is now internal to ReviewTab via SharedSavedResultCore

    const handleGenerateFormativeFeedback = useCallback(async (forceAiUpgrade = false) => {
        if (!result) return;

        try {
            setFormativeFeedbackLoading(true);
            setFeedbackError(null);

            const generationResult = await generateFormativeFeedbackForSavedResult(
                resultId,
                forceAiUpgrade ? { forceAiUpgrade: true } : undefined,
            );
            if (generationResult && !generationResult.saved) {
                setFeedbackError('AI feedback could not be saved for this result. Please try again.');
            } else if (!generationResult) {
                setFeedbackError('AI feedback is not available for this result.');
            } else if (generationResult.upgradeAttempted && generationResult.upgradeApplied === false) {
                setFeedbackError(generationResult.error || 'AI upgrade did not complete. The saved feedback is still being shown.');
            } else {
                setFeedbackError(null);
            }
            // No need to call loadResult() — the RTDB onValue listener
            // will automatically pick up the newly-written formativeFeedback
        } catch (err) {
            console.error('[ResultDetailModal] Failed to generate formative feedback:', err);
            setFeedbackError('Failed to generate feedback.');
        } finally {
            setFormativeFeedbackLoading(false);
        }
    }, [result, resultId]);

    // ── Auto-trigger feedback generation for THCS only. IELTS is generated after save. ──
    useEffect(() => {
        if (!result || loading) return;

        const hasFeedback = !!result.formativeFeedback;
        const hasThcsData = !!result.thcsData?.sectionResults;

        if (!formativeFeedbackLoading && !feedbackError && !feedbackAttemptedRef.current) {
            // Deduplication: only attempt once per modal open
            if (hasThcsData && !hasFeedback) {
                feedbackAttemptedRef.current = true;
                console.log('🤖 [ResultDetailModal] Auto-triggering feedback generation');
                handleGenerateFormativeFeedback();
                return;
            }

            if (hasFeedback && storedFeedbackNeedsUpgrade) {
                feedbackAttemptedRef.current = true;
                console.log('[ResultDetailModal] Auto-triggering AI feedback upgrade');
                handleGenerateFormativeFeedback(true);
            }
        }
    }, [result, loading, formativeFeedbackLoading, feedbackError, storedFeedbackNeedsUpgrade, handleGenerateFormativeFeedback]);

    // Reset the attempt ref when modal closes or resultId changes
    useEffect(() => {
        feedbackAttemptedRef.current = false;
        setFeedbackError(null);
    }, [resultId, opened]);

    useEffect(() => {
        if (result?.formativeFeedback) {
            setFeedbackError(null);
        }
    }, [result?.formativeFeedback]);

    // ── Feedback retry handler for core (PRD-0040 Task 2.5) ──────────────────
    const handleFeedbackRetry = useCallback(() => {
        feedbackAttemptedRef.current = false;
        setFeedbackError(null);
        handleGenerateFormativeFeedback(true);
    }, [handleGenerateFormativeFeedback]);

    // ── feedbackTiming from homework context ─────────────────────────────────
    const feedbackTiming = result?.context?.configApplied?.feedbackTiming || 'after_completion';

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

        // Delegate content to SharedSavedResultCore (PRD-0040 Task 2.5)
        return (
            <div style={{ height: inline ? '100%' : 'calc(92vh - 85px)', overflowY: 'auto' }}>
                <div style={{ padding: inline ? '0.5rem' : '1.25rem' }}>
                    {/* Header Bar — shell-owned chrome */}
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

                    {/* Content body — delegated to shared core */}
                    <div style={{ padding: inline ? '0' : '0 1rem 1rem' }}>
                        <SharedSavedResultCore
                            result={result}
                            variant="modal"
                            sections={{
                                scoreSummary: true,
                                answerMap: true,
                                sectionBreakdown: true,
                                questionReview: true,
                                feedbackDisplay: true,
                                teacherFeedback: false,
                                writingPlaceholder: false,
                            }}
                            feedbackState={{
                                formativeFeedback: result.formativeFeedback as FormativeFeedback | null | undefined,
                                feedbackLoading: formativeFeedbackLoading && !result.formativeFeedback,
                                feedbackError: feedbackError,
                                needsUpgrade: storedFeedbackNeedsUpgrade,
                                isEligibleForAIFeedback: Boolean((result as any).thcsData?.sectionResults) || isIeltsResult(result),
                                onRetryFeedback: handleFeedbackRetry,
                            }}
                            feedbackTiming={feedbackTiming as 'after_completion' | 'after_deadline' | 'never'}
                        />
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

// formatScore, cardStyleCompact, cardLabel removed — rendering delegated to SharedSavedResultCore (PRD-0040 Task 2.5)

export default ResultDetailModal;
