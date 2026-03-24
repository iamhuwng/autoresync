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

import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
import { database } from '../../services/firebase';
import { TestResultRecord } from '../../services/testResults.service';
import { generateCertificatePDF, isPDFGenerationAvailable } from '../../utils/pdfCertificate';
import { useResultOwnershipCheck } from '../../hooks/useOwnershipCheck';
import { isPermissionDeniedError } from '../../utils/rtdbAccessLost';
import { ResultContextBadge } from './ResultContextBadge';
import { SharedSavedResultCore } from './SharedSavedResultCore';

interface LegacyResultDetailViewProps {
    resultId: string;
    /** Optional: callback for the "Return" button */
    onReturn?: () => void;
}

export const LegacyResultDetailView: React.FC<LegacyResultDetailViewProps> = ({
    resultId,
    onReturn,
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TestResultRecord | null>(null);
    const [pdfAvailable, setPdfAvailable] = useState(false);
    const [accessLost, setAccessLost] = useState(false);

    // PRD-0016: Ownership validation
    const {
        allowed: canViewResult,
        loading: ownershipLoading,
        denialReason
    } = useResultOwnershipCheck(result?.studentId);

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
    if (accessLost) {
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
     * PRD-0016: Ownership validation
     */
    if (!canViewResult) {
        console.warn(`[Security] Access denied to result ${resultId}, reason: ${denialReason}`);
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
            <SharedSavedResultCore
                result={result}
                variant="full-page"
                sections={{ teacherFeedback: true, writingPlaceholder: true }}
            />

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

                {pdfAvailable && (
                    <button
                        type="button"
                        onClick={async () => { await generateCertificatePDF(result); }}
                        style={primaryButtonStyle}
                    >
                        📄 Download Certificate
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => window.print()}
                    style={glassButtonStyle}
                >
                    🖨️ Print Results
                </button>
            </div>

        </div>
    );
};

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

export default LegacyResultDetailView;
