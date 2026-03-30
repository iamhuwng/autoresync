import React, { useState, useEffect, useCallback } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import { getTestResult, TestResultRecord } from '../../services/testResults.service';
import { ref, onValue } from 'firebase/database';
import { database } from '../../services/firebase';

import { ResultContextBadge } from './ResultContextBadge';
import { SharedSavedResultCore } from './SharedSavedResultCore';
import type { FormativeFeedback } from '../../types/thcs-test.types';
import { isEligibleForSavedResultFeedback, useFeedbackAutoTrigger } from '../../hooks/useFeedbackAutoTrigger';
import { isPermissionDeniedError, AccessLostState, ACCESS_LOST_INITIAL } from '../../utils/rtdbAccessLost';
import type { WritingSubmission } from '../../types/ielts-writing.types';
import { useAuth } from '../../hooks/useAuth';
import { useNavigation } from '../../hooks/useNavigation';
import { classifyTeacherResultVisibility } from '../../services/resultVisibility.service';
import WritingTeacherResultSurface from '../writing-results/WritingTeacherResultSurface';
import {
    buildWritingResultSurfaceData,
    buildWritingSubmissionFallbackFromResult,
} from '../writing-results/writingResultSurface';

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
    const { user } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TestResultRecord | null>(null);
    const [writingSubmission, setWritingSubmission] = useState<WritingSubmission | null>(null);
    const [writingSubmissionLoading, setWritingSubmissionLoading] = useState(false);
    // sectionResultsOpen removed — section accordion is now internal to OverviewTab via SharedSavedResultCore

    // FR-035: Access-lost state (Task 3.3)
    const [accessLost, setAccessLost] = useState<AccessLostState>(ACCESS_LOST_INITIAL);

    // ── Centralized feedback auto-trigger (PRD-0040 Task 3.6) ───────────────
    const {
      feedbackLoading: formativeFeedbackLoading,
      feedbackError,
      storedFeedbackNeedsUpgrade,
      handleGenerateFeedback: handleGenerateFormativeFeedback,
    } = useFeedbackAutoTrigger({
      resultId,
      result,
      loading,
      autoTriggerEnabled: true,
      shellName: 'ResultDetailModal',
    });

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
                    setAccessLost(ACCESS_LOST_INITIAL);
                } else {
                    setResult(null);
                    setError('Test result not found.');
                }
                setLoading(false);
            },
            (err) => {
                console.error('[ResultDetailModal] Realtime subscription failed:', err);

                // FR-035 (Task 3.3): Check for PERMISSION_DENIED
                if (isPermissionDeniedError(err)) {
                    console.warn('[ResultDetailModal] Access revoked (PERMISSION_DENIED). Clearing data.', err);
                    setResult(null);
                    setLoading(false);
                    setError(null);
                    setAccessLost({ isAccessLost: true, reason: 'permission_denied' });
                    return;
                }

                if (!hasReceivedSnapshot) {
                    loadResult();
                }
            }
        );

        return () => unsubscribe();
    }, [opened, inline, resultId, loadResult]);

    const isWritingResult = Boolean(
        result && (
            result.testSkill === 'writing'
            || (result as any).writingData
            || (result as any).writingSubmission
        ),
    );

    useEffect(() => {
        if (!result || !isWritingResult) {
            setWritingSubmission(null);
            setWritingSubmissionLoading(false);
            return;
        }

        const fallbackSubmission = buildWritingSubmissionFallbackFromResult(result);
        const submissionId = (result as any).writingData?.submissionId || result.resultId;
        if (!submissionId) {
            setWritingSubmission(fallbackSubmission);
            setWritingSubmissionLoading(false);
            return;
        }

        let cancelled = false;
        setWritingSubmission(fallbackSubmission);
        setWritingSubmissionLoading(!fallbackSubmission);

        void (async () => {
            try {
                const { getSubmission } = await import('../../services/writingSubmissionService');
                const response = await getSubmission(submissionId);
                if (cancelled) return;
                setWritingSubmission(response.success ? response.data || fallbackSubmission : fallbackSubmission);
            } catch (submissionError) {
                console.warn('[ResultDetailModal] Failed to load canonical writing submission. Falling back to the saved result snapshot.', submissionError);
                if (!cancelled) {
                    setWritingSubmission(fallbackSubmission);
                }
            } finally {
                if (!cancelled) {
                    setWritingSubmissionLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isWritingResult, result]);


    // formatAnswer removed — answer formatting is now internal to ReviewTab via SharedSavedResultCore

    // Feedback generation, auto-trigger, and dedupe are now centralized
    // in useFeedbackAutoTrigger (PRD-0040 Task 3.6)

    // ── Feedback retry handler for core (PRD-0040 Task 2.5) ──────────────────
    const handleFeedbackRetry = useCallback(() => {
        handleGenerateFormativeFeedback(storedFeedbackNeedsUpgrade);
    }, [handleGenerateFormativeFeedback, storedFeedbackNeedsUpgrade]);

    // ── feedbackTiming from homework context ─────────────────────────────────
    const feedbackTiming = result?.context?.configApplied?.feedbackTiming || 'after_completion';

    const renderContent = () => {
        // FR-035 (Task 3.3): Access-lost state takes precedence
        if (accessLost.isAccessLost) {
            return (
                <div style={{ minHeight: 400, display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem', alignItems: 'center', justifyContent: 'center' }} data-testid="rdm-access-lost">
                    <div style={{ fontSize: '3rem' }}>🔒</div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1e293b', marginBottom: '0.5rem' }}>Access Revoked</div>
                        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>You no longer have access to this result. This may happen if permissions were changed.</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontWeight: 600, color: '#475569' }}
                    >
                        Close
                    </button>
                </div>
            );
        }

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

        if (isWritingResult) {
            if (writingSubmissionLoading && !writingSubmission) {
                return (
                    <div style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 600 }}>
                        Loading writing result...
                    </div>
                );
            }

            if (!writingSubmission) {
                return (
                    <div style={{ minHeight: 400, display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Writing submission unavailable</div>
                        <div style={{ fontSize: '0.875rem' }}>The saved result row exists, but the canonical Writing submission could not be loaded.</div>
                    </div>
                );
            }

            const verdict = classifyTeacherResultVisibility({
                result: result as any,
                teacherId: user?.uid || '',
                hasAssignmentAccess: true,
            });

            return (
                <div style={{ height: inline ? '100%' : 'calc(92vh - 85px)', overflowY: 'auto' }}>
                    <div style={{ padding: inline ? '0.5rem' : '1rem' }}>
                        <WritingTeacherResultSurface
                            data={buildWritingResultSurfaceData(writingSubmission, {
                                viewerMode: verdict.shouldAllowTeacherActions ? 'teacher-actionable' : 'teacher-read-only',
                                canRevealPublishedData: true,
                            })}
                            submission={writingSubmission}
                            onClose={onClose}
                            onOpenGrading={verdict.shouldAllowTeacherActions
                                ? () => navigateTo(
                                    'TEACHER_GRADING_DETAIL',
                                    { submissionId: writingSubmission.id },
                                    { reason: 'teacher_saved_result_writing_grade' },
                                )
                                : undefined}
                            onReopen={verdict.shouldAllowTeacherActions
                                ? () => navigateTo(
                                    'TEACHER_GRADING_DETAIL',
                                    { submissionId: writingSubmission.id },
                                    { reason: 'teacher_saved_result_writing_reopen' },
                                )
                                : undefined}
                        />
                    </div>
                </div>
            );
        }

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
                                teacherFeedback: true,
                                writingPlaceholder: false,
                            }}
                            feedbackState={{
                                formativeFeedback: result.formativeFeedback as FormativeFeedback | null | undefined,
                                feedbackLoading: formativeFeedbackLoading && !result.formativeFeedback,
                                feedbackError: feedbackError,
                                needsUpgrade: storedFeedbackNeedsUpgrade,
                                isEligibleForAIFeedback: isEligibleForSavedResultFeedback(result),
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

export default ResultDetailModal;
