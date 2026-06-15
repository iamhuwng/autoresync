/**
 * LegacyResultDetailView
 * PRD-0039 Task 4.8: Extracted self-contained view from ResultDetailPage.
 *
 * This component:
 *   1. Fetches the result by resultId
 *   2. Validates ownership
 *   3. Renders the full result detail (score summary, question review, feedback)
 *
 * Used by:
 *   - ResultDetailPage (teacher/admin full-page view)
 *   - Future: ResultSlidePanel (student slide-panel view, Task 5.0)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
import { database } from '../../services/firebase';
import { TestResultRecord } from '../../services/testResults.service';
import { useAuth } from '../../hooks/useAuth';
import { generateCertificatePDF, isPDFGenerationAvailable } from '../../utils/pdfCertificate';
import { useResultOwnershipCheck } from '../../hooks/useOwnershipCheck';
import { isPermissionDeniedError } from '../../utils/rtdbAccessLost';
import { classifyTeacherResultVisibility } from '../../services/resultVisibility.service';
import { isEligibleForSavedResultFeedback, useFeedbackAutoTrigger } from '../../hooks/useFeedbackAutoTrigger';
import type { FormativeFeedback } from '../../types/thcs-test.types';
import type {
    ResolvedResultVisibilityVerdict,
    ResultVisibilitySourceType,
} from '../../types/results.types';
import { ResultContextBadge } from './ResultContextBadge';
import { SharedSavedResultCore } from './SharedSavedResultCore';
import { useNavigation } from '../../hooks/useNavigation';
import type { WritingSubmission } from '../../types/ielts-writing.types';
import WritingTeacherResultSurface from '../writing-results/WritingTeacherResultSurface';
import {
    buildWritingResultSurfaceData,
    buildWritingSubmissionFallbackFromResult,
} from '../writing-results/writingResultSurface';

interface LegacyResultDetailViewProps {
    resultId: string;
    /** Optional: callback for the "Return" button */
    onReturn?: () => void;
}

export const LegacyResultDetailView: React.FC<LegacyResultDetailViewProps> = ({
    resultId,
    onReturn,
}) => {
    const { user, profile } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TestResultRecord | null>(null);
    const [writingSubmission, setWritingSubmission] = useState<WritingSubmission | null>(null);
    const [writingSubmissionLoading, setWritingSubmissionLoading] = useState(false);
    const [pdfAvailable, setPdfAvailable] = useState(false);
    const [accessLost, setAccessLost] = useState(false);
    const hadTeacherDetailAccessRef = useRef(false);

    // PRD-0016: Ownership validation
    const {
        allowed: canViewResult,
        loading: ownershipLoading,
        denialReason
    } = useResultOwnershipCheck(result?.studentId);

    const isAdminViewer = profile?.role === 'super_admin';

    const visibilityVerdict = useMemo<ResolvedResultVisibilityVerdict | null>(() => {
        if (!result) {
            return null;
        }

        return classifyTeacherResultVisibility({
            result,
            teacherId: isAdminViewer
                ? (result.visibility?.visibilityOwnerTeacherId ?? '')
                : (user?.uid ?? ''),
            hasAssignmentAccess: isAdminViewer ? true : canViewResult,
        });
    }, [canViewResult, isAdminViewer, result, user?.uid]);

    const canRenderTeacherDetail = Boolean(
        result
        && visibilityVerdict
        && visibilityVerdict.shouldDisplayInTeacherDetail
        && (isAdminViewer || canViewResult)
    );

    const deletedSourceMetadata = visibilityVerdict?.deletedSource ?? null;
    const visibilitySnapshot = result?.visibility ?? null;
    const sourceDisplayName =
        deletedSourceMetadata?.snapshotName
        ?? visibilitySnapshot?.sourceNameSnapshot
        ?? null;
    const currentSourceName =
        deletedSourceMetadata?.currentName
        ?? visibilitySnapshot?.currentSourceName
        ?? null;
    const sourceContextLabel = formatContextTypeLabel(
        visibilitySnapshot?.contextType ?? result?.context?.type ?? null,
    );
    const sourceResolutionLabel = formatResolutionSourceLabel(visibilitySnapshot?.ownerResolutionSource ?? null);
    const shouldShowSourceMetadata = Boolean(
        visibilitySnapshot
        || sourceDisplayName
        || currentSourceName
        || deletedSourceMetadata,
    );
    const hasNewerSourceVersion = Boolean(currentSourceName && sourceDisplayName && currentSourceName !== sourceDisplayName);
    const soloPracticeViewOnly = Boolean(visibilityVerdict?.soloPractice.isSoloPractice);
    const sourceVisibilityLabel = formatVisibilityClassificationLabel({
        isSoloPractice: soloPracticeViewOnly,
        visibilityOwnerTeacherId: visibilitySnapshot?.visibilityOwnerTeacherId ?? null,
    });
    const assignmentAttemptNumber = typeof result?.context?.assignment?.attemptNumber === 'number'
        ? result.context.assignment.attemptNumber
        : null;
    const allowTeacherOwnedSections = Boolean(visibilityVerdict?.shouldAllowTeacherActions);
    const isWritingResult = Boolean(
        result && (
            result.testSkill === 'writing'
            || (result as any).writingData
            || (result as any).writingSubmission
        ),
    );
    const feedbackTiming = result?.context?.configApplied?.feedbackTiming || 'after_completion';
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
        shellName: 'LegacyResultDetailView',
    });

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
                console.warn('[LegacyResultDetailView] Failed to load canonical writing submission. Falling back to the saved result snapshot.', submissionError);
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
    const shouldShowAccessLost = Boolean(
        accessLost
        || (
            hadTeacherDetailAccessRef.current
            && !ownershipLoading
            && result
            && !canRenderTeacherDetail
        )
    );

    /**
     * Load result via RTDB real-time listener (PRD-0040 Task 3.5 parity).
     * Converts from one-shot getTestResult to onValue so that feedback
     * generated after page load is reflected without manual refresh.
     */
    useEffect(() => {
        if (!resultId) {
            setError('No result ID provided');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        setAccessLost(false);

        const resultRef = ref(database, `test_results/${resultId}`);

        const unsubscribe = onValue(
            resultRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    setResult(null);
                    setError('Result not found');
                    setLoading(false);
                    return;
                }

                const data = snapshot.val();
                setResult({ id: resultId, ...data } as TestResultRecord);
                setAccessLost(false);
                setLoading(false);
            },
            (err) => {
                console.error('[LegacyResultDetailView] RTDB listener error:', err);
                if (isPermissionDeniedError(err)) {
                    setResult(null);
                    setAccessLost(true);
                    setLoading(false);
                    return;
                }
                setError('Failed to load result');
                setLoading(false);
            },
        );

        isPDFGenerationAvailable().then(setPdfAvailable);

        return () => unsubscribe();
    }, [resultId]);

    useEffect(() => {
        if (!ownershipLoading && canRenderTeacherDetail) {
            hadTeacherDetailAccessRef.current = true;
        }
    }, [canRenderTeacherDetail, ownershipLoading]);

    useEffect(() => {
        if (ownershipLoading || !result || accessLost) {
            return;
        }

        if (hadTeacherDetailAccessRef.current && !canRenderTeacherDetail) {
            setResult(null);
            setError(null);
            setAccessLost(true);
            setLoading(false);
        }
    }, [accessLost, canRenderTeacherDetail, ownershipLoading, result]);

    /**
     * Loading state
     */
    if (loading || ownershipLoading) {
        return (
            <div style={centeredContainerStyle}>
                <div style={spinnerStyle} />
                <style>{`@keyframes legacyViewSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    /**
     * Access-lost state (FR-035 parity — Task 3.3/3.5)
     */
    if (shouldShowAccessLost) {
        return (
            <div style={{ ...centeredContainerStyle, flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '3rem' }}>🔒</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#64748b' }}>
                    Access Revoked
                </div>
                <div style={{ fontSize: '0.875rem', color: '#94a3b8', textAlign: 'center', maxWidth: '24rem' }}>
                    Your access to this result has been revoked. The content has been cleared for security.
                </div>
                {onReturn && (
                    <button
                        type="button"
                        onClick={onReturn}
                        style={primaryButtonStyle}
                    >
                        Return to Dashboard
                    </button>
                )}
            </div>
        );
    }

    /**
     * Error state
     */
    if (error || !result) {
        return (
            <div style={{ ...centeredContainerStyle, flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '3rem' }}>⚠️</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
                    {error || 'Failed to load result'}
                </div>
                {onReturn && (
                    <button
                        type="button"
                        onClick={onReturn}
                        style={primaryButtonStyle}
                    >
                        Return to Dashboard
                    </button>
                )}
            </div>
        );
    }

    /**
     * Shared teacher/admin visibility verdict is the final authority.
     */
    if (!canRenderTeacherDetail) {
        console.warn(
            `[Security] Access denied to result ${resultId}, reason: ${visibilityVerdict?.exclusionReason ?? denialReason ?? 'ownership'}`,
        );
        return (
            <Navigate
                to="/access-denied"
                state={{
                    from: `/result/${resultId}`,
                    reason: 'ownership'
                }}
                replace
            />
        );
    }

    return (
        <div>
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

                {soloPracticeViewOnly && (
                    <div
                        data-testid="solo-practice-view-only"
                        style={{
                            marginTop: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.9rem',
                            borderRadius: '999px',
                            background: 'rgba(14, 165, 233, 0.12)',
                            border: '1px solid rgba(14, 165, 233, 0.24)',
                            color: '#0f766e',
                            fontSize: '0.875rem',
                            fontWeight: 700,
                        }}
                    >
                        Solo Practice
                        <span style={{ color: '#0f172a', fontWeight: 600 }}>Student-owned</span>
                        <span style={{ color: '#475569', fontWeight: 600 }}>View only</span>
                    </div>
                )}

                {shouldShowSourceMetadata && (
                    <div
                        data-testid="result-source-metadata"
                        style={sourceMetadataPanelStyle}
                    >
                        <div style={sourceMetadataHeaderStyle}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>Source Metadata</span>
                            <span style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                                {formatSourceTypeLabel(deletedSourceMetadata?.sourceType ?? visibilitySnapshot?.sourceType ?? null)}
                            </span>
                        </div>

                        <div data-testid="result-source-primary-label" style={sourceMetadataRowStyle}>
                            <span style={sourceMetadataLabelStyle}>Submission snapshot</span>
                            <span style={sourceMetadataValueStyle}>{sourceDisplayName ?? 'Snapshot unavailable'}</span>
                        </div>

                        {currentSourceName && currentSourceName !== sourceDisplayName && (
                            <div data-testid="result-source-current-label" style={sourceMetadataRowStyle}>
                                <span style={sourceMetadataLabelStyle}>Current source name</span>
                                <span style={sourceMetadataSecondaryValueStyle}>{currentSourceName}</span>
                            </div>
                        )}

                        {hasNewerSourceVersion && (
                            <div data-testid="result-source-newer-version-note" style={sourceMetadataRowStyle}>
                                <span style={sourceMetadataLabelStyle}>Version note</span>
                                <span style={sourceMetadataSecondaryValueStyle}>
                                    Newer source version available; this review remains bound to the assigned snapshot.
                                </span>
                            </div>
                        )}

                        {sourceContextLabel && (
                            <div data-testid="result-source-context" style={sourceMetadataRowStyle}>
                                <span style={sourceMetadataLabelStyle}>Visibility context</span>
                                <span style={sourceMetadataSecondaryValueStyle}>{sourceContextLabel}</span>
                            </div>
                        )}

                        <div data-testid="result-source-id" style={sourceMetadataRowStyle}>
                            <span style={sourceMetadataLabelStyle}>Source ID</span>
                            <span style={sourceMetadataSecondaryValueStyle}>{visibilitySnapshot?.sourceId ?? 'Unavailable'}</span>
                        </div>

                        {assignmentAttemptNumber !== null && (
                            <div data-testid="result-source-attempt" style={sourceMetadataRowStyle}>
                                <span style={sourceMetadataLabelStyle}>Attempt</span>
                                <span style={sourceMetadataSecondaryValueStyle}>Attempt {assignmentAttemptNumber}</span>
                            </div>
                        )}

                        {sourceResolutionLabel && (
                            <div data-testid="result-source-resolution" style={sourceMetadataRowStyle}>
                                <span style={sourceMetadataLabelStyle}>Ownership resolved by</span>
                                <span style={sourceMetadataSecondaryValueStyle}>{sourceResolutionLabel}</span>
                            </div>
                        )}

                        {sourceVisibilityLabel && (
                            <div data-testid="result-source-visibility" style={sourceMetadataRowStyle}>
                                <span style={sourceMetadataLabelStyle}>Visibility classification</span>
                                <span style={sourceMetadataSecondaryValueStyle}>{sourceVisibilityLabel}</span>
                            </div>
                        )}

                        {deletedSourceMetadata && (
                            <div data-testid="result-source-status" style={sourceStatusRowStyle}>
                                {deletedSourceMetadata.isDeleted && (
                                    <span style={{ ...sourceStatusBadgeStyle, background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c' }}>
                                        Deleted source
                                    </span>
                                )}
                                {deletedSourceMetadata.isArchived && (
                                    <span style={{ ...sourceStatusBadgeStyle, background: 'rgba(245, 158, 11, 0.14)', color: '#b45309' }}>
                                        Archived source
                                    </span>
                                )}
                            </div>
                        )}
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
                                background: 'rgba(6, 182, 212, 0.1)',
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

            {/* ── Shared Result Content Body (PRD-0040 Task 2.3) ── */}
            {isWritingResult ? (
                writingSubmissionLoading ? (
                    <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 600 }}>
                        Loading writing result...
                    </div>
                ) : writingSubmission ? (
                    <WritingTeacherResultSurface
                        data={buildWritingResultSurfaceData(writingSubmission, {
                            viewerMode: allowTeacherOwnedSections ? 'teacher-actionable' : 'teacher-read-only',
                            canRevealPublishedData: true,
                        })}
                        submission={writingSubmission}
                        onOpenGrading={allowTeacherOwnedSections
                            ? () => navigateTo('TEACHER_GRADING_DETAIL', { submissionId: writingSubmission.id }, { reason: 'teacher_result_detail_writing_grade' })
                            : undefined}
                        onReopen={allowTeacherOwnedSections
                            ? () => navigateTo('TEACHER_GRADING_DETAIL', { submissionId: writingSubmission.id }, { reason: 'teacher_result_detail_writing_reopen' })
                            : undefined}
                    />
                ) : (
                    <div style={{ minHeight: 320, display: 'grid', placeItems: 'center', color: '#64748b' }}>
                        Canonical Writing submission unavailable.
                    </div>
                )
            ) : (
                <SharedSavedResultCore
                    result={result}
                    variant="full-page"
                    sections={{
                        teacherFeedback: allowTeacherOwnedSections,
                        writingPlaceholder: allowTeacherOwnedSections,
                    }}
                    feedbackState={{
                        formativeFeedback: result.formativeFeedback as FormativeFeedback | null | undefined,
                        feedbackLoading: formativeFeedbackLoading && !result.formativeFeedback,
                        feedbackError,
                        needsUpgrade: storedFeedbackNeedsUpgrade,
                        isEligibleForAIFeedback: isEligibleForSavedResultFeedback(result),
                        onRetryFeedback: () => handleGenerateFormativeFeedback(storedFeedbackNeedsUpgrade),
                    }}
                    feedbackTiming={feedbackTiming as 'after_completion' | 'after_deadline' | 'never'}
                />
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
                {onReturn && (
                    <button
                        type="button"
                        onClick={onReturn}
                        style={primaryButtonStyle}
                    >
                        🏠 Return to Dashboard
                    </button>
                )}

                {allowTeacherOwnedSections && pdfAvailable && (
                    <button
                        type="button"
                        onClick={async () => { await generateCertificatePDF(result); }}
                        style={primaryButtonStyle}
                    >
                        📄 Download Certificate
                    </button>
                )}

                {allowTeacherOwnedSections && (
                    <button
                        type="button"
                        onClick={() => window.print()}
                        style={glassButtonStyle}
                    >
                        🖨️ Print Results
                    </button>
                )}
            </div>

        </div>
    );
};

function formatSourceTypeLabel(sourceType: ResultVisibilitySourceType | null | undefined): string {
    if (!sourceType) {
        return 'Source unavailable';
    }

    return sourceType
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatContextTypeLabel(contextType: string | null | undefined): string | null {
    if (!contextType) {
        return null;
    }

    return contextType
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatResolutionSourceLabel(source: string | null | undefined): string | null {
    if (!source) {
        return null;
    }

    return source
        .replace(/\./g, ' -> ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatVisibilityClassificationLabel(input: {
    isSoloPractice: boolean;
    visibilityOwnerTeacherId: string | null;
}): string | null {
    if (input.isSoloPractice) {
        return 'Student-owned solo practice';
    }

    if (input.visibilityOwnerTeacherId) {
        return 'Teacher-owned teaching context';
    }

    return null;
}

// ─── Shared inline styles (replaces Mantine Card/Button/Loader per Rule 15) ──

const centeredContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60vh',
};

const spinnerStyle: React.CSSProperties = {
    width: 48,
    height: 48,
    border: '4px solid #e2e8f0',
    borderTopColor: '#8b5cf6',
    borderRadius: '50%',
    animation: 'legacyViewSpin 0.8s linear infinite',
};


const primaryButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#ffffff',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    border: 'none',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)',
};

const glassButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#4b5563',
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
};

const sourceMetadataPanelStyle: React.CSSProperties = {
    marginTop: '1rem',
    padding: '1rem 1.25rem',
    borderRadius: '1rem',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    background: 'rgba(255, 255, 255, 0.8)',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
    display: 'grid',
    gap: '0.75rem',
    maxWidth: '40rem',
    marginInline: 'auto',
};

const sourceMetadataHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.75rem',
    alignItems: 'center',
    flexWrap: 'wrap',
};

const sourceMetadataRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'baseline',
    flexWrap: 'wrap',
};

const sourceMetadataLabelStyle: React.CSSProperties = {
    color: '#64748b',
    fontSize: '0.8125rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
};

const sourceMetadataValueStyle: React.CSSProperties = {
    color: '#0f172a',
    fontSize: '1rem',
    fontWeight: 700,
};

const sourceMetadataSecondaryValueStyle: React.CSSProperties = {
    color: '#334155',
    fontSize: '0.95rem',
    fontWeight: 600,
};

const sourceStatusRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
};

const sourceStatusBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.35rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontWeight: 700,
};

export default LegacyResultDetailView;
