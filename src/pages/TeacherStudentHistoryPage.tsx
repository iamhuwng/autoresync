/**
 * TeacherStudentHistoryPage.tsx
 *
 * Teacher view of a specific student's testing history.
 *
 * Security:
 * - PRD-0016 Task 3.9: Ownership validation before rendering
 * - PRD-0041 Task 5.1: Result visibility comes from the shared classifier only
 * - Teacher must have assignment to student to view data
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { buildRoute } from '../constants/routes';
import {
    getStudentResults,
    TestResultRecord,
} from '../services/testResults.service';
import { classifyTeacherResultVisibility } from '../services/resultVisibility.service';
import { ResultFilters as FilterType } from '../types/results.types';

import { Card, CardBody, Button } from '../components/modern';
import { TeacherHeader } from '../components/navigation';
import { ProgressLineChart } from '../components/results/ProgressLineChart';
import { SkillRadarChart } from '../components/results/SkillRadarChart';
import { BandScoreProgress } from '../components/results/BandScoreProgress';
import { ResultFilters } from '../components/results/ResultFilters';

import {
    calculateStudyStreak,
    calculateSkillBreakdown,
    calculateBandProgression,
    calculateAverageScore,
    findBestScore,
} from '../utils/progressCalculations';

import { useStudentDataAccessCheck } from '../hooks/useOwnershipCheck';
import { useFeatureTracking } from '../hooks/useFeatureTracking';

const ITEMS_PER_PAGE = 20;

const StatCard: React.FC<{
    title: string;
    value: string | number;
    subtext?: string;
    iconLabel: string;
    color: string;
    testId?: string;
}> = ({ title, value, subtext, iconLabel, color, testId }) => (
    <Card variant="glass">
        <CardBody style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
                style={{
                    width: '3rem',
                    height: '3rem',
                    borderRadius: '50%',
                    background: `${color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                }}
            >
                {iconLabel}
            </div>
            <div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600 }}>{title}</div>
                <div
                    data-testid={testId}
                    style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}
                >
                    {value}
                </div>
                {subtext ? (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{subtext}</div>
                ) : null}
            </div>
        </CardBody>
    </Card>
);

const ResultRow: React.FC<{
    result: TestResultRecord;
    isExpanded: boolean;
    onToggle: () => void;
    onViewDetails: () => void;
}> = ({ result, isExpanded, onToggle, onViewDetails }) => {
    const dateStr = new Date(result.submittedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    const scoreColor = getScoreColor(result.percentage);
    const isSoloPractice = result.visibility?.contextType === 'solo_practice';
    const isDeletedSource = Boolean(result.visibility?.sourceDeleted);
    const isArchivedSource = Boolean(result.visibility?.sourceArchived);

    return (
        <div
            style={{
                background: 'rgba(255, 255, 255, 0.72)',
                borderRadius: '0.75rem',
                marginBottom: '0.75rem',
                border: '1px solid rgba(226, 232, 240, 0.9)',
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
            }}
        >
            <div
                style={{
                    padding: '1rem',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(220px, 2fr) 1fr 1fr 1fr auto',
                    gap: '1rem',
                    alignItems: 'center',
                    cursor: 'pointer',
                }}
                onClick={onToggle}
            >
                <div>
                    <div style={{ fontWeight: 700, color: '#1e293b' }}>
                        {result.testTitle || 'Untitled Test'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                        {dateStr} •{' '}
                        <span style={{ textTransform: 'capitalize' }}>{formatDisplayLabel(result.testType)}</span>{' '}
                        ({formatDisplayLabel(result.testSkill)})
                    </div>
                    {(isSoloPractice || isDeletedSource || isArchivedSource) ? (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                            {isSoloPractice ? (
                                <span
                                    data-testid={`history-badge-solo-practice-${result.resultId}`}
                                    style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        color: '#0369a1',
                                        background: 'rgba(14, 165, 233, 0.12)',
                                        border: '1px solid rgba(14, 165, 233, 0.25)',
                                        borderRadius: '999px',
                                        padding: '0.1rem 0.55rem',
                                    }}
                                >
                                    Solo Practice
                                </span>
                            ) : null}
                            {isDeletedSource ? (
                                <span
                                    data-testid={`history-badge-deleted-source-${result.resultId}`}
                                    style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        color: '#b91c1c',
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        border: '1px solid rgba(239, 68, 68, 0.25)',
                                        borderRadius: '999px',
                                        padding: '0.1rem 0.55rem',
                                    }}
                                >
                                    Deleted source
                                </span>
                            ) : null}
                            {isArchivedSource ? (
                                <span
                                    data-testid={`history-badge-archived-source-${result.resultId}`}
                                    style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        color: '#92400e',
                                        background: 'rgba(245, 158, 11, 0.14)',
                                        border: '1px solid rgba(245, 158, 11, 0.28)',
                                        borderRadius: '999px',
                                        padding: '0.1rem 0.55rem',
                                    }}
                                >
                                    Archived source
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={metaLabelStyle}>Score</div>
                    <div style={{ fontWeight: 700, color: scoreColor }}>
                        {result.totalScore.toFixed(1)}/{result.maxScore}
                    </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={metaLabelStyle}>Band</div>
                    <div style={{ fontWeight: 800, color: '#8b5cf6' }}>{result.bandScore}</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={metaLabelStyle}>Accuracy</div>
                    <div style={{ fontWeight: 700 }}>{result.percentage}%</div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Button
                        variant="glass"
                        onClick={(event: React.MouseEvent) => {
                            event.stopPropagation();
                            onViewDetails();
                        }}
                    >
                        View
                    </Button>
                    <div style={{ padding: '0.5rem', color: '#94a3b8', fontWeight: 700 }}>
                        {isExpanded ? '−' : '+'}
                    </div>
                </div>
            </div>

            {isExpanded ? (
                <div
                    style={{
                        padding: '1rem',
                        background: 'rgba(241, 245, 249, 0.7)',
                        borderTop: '1px solid rgba(226, 232, 240, 0.9)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '2rem',
                    }}
                >
                    <div>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#64748b' }}>
                            Summary
                        </h4>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                            <span style={{ color: '#10b981' }}>Correct: {result.correct}</span>
                            <span style={{ color: '#ef4444' }}>Incorrect: {result.incorrect}</span>
                            <span style={{ color: '#f59e0b' }}>Partial: {result.partialCredit}</span>
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                            Time Spent: {Math.floor(result.timeElapsed / 1000)}s
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <Button variant="secondary" onClick={onViewDetails}>
                            Open Full Report
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export const TeacherStudentHistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const { studentId } = useParams<{ studentId: string }>();
    const auth = getAuth();
    const currentUser = auth.currentUser;
    const { trackAction } = useFeatureTracking('results');

    const {
        allowed: canViewStudent,
        loading: ownershipLoading,
        denialReason,
    } = useStudentDataAccessCheck(studentId);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rawResults, setRawResults] = useState<TestResultRecord[]>([]);
    const [studentName, setStudentName] = useState('Student');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const hadHistoryAccessRef = useRef(false);

    const [filters, setFilters] = useState<FilterType>({
        scoreMin: 0,
        scoreMax: 100,
    });

    useEffect(() => {
        let isMounted = true;

        const fetchResults = async () => {
            if (ownershipLoading) {
                return;
            }

            if (!studentId) {
                if (isMounted) {
                    setError('Student ID missing.');
                    setLoading(false);
                    setRawResults([]);
                }
                return;
            }

            if (!canViewStudent) {
                if (isMounted) {
                    setRawResults([]);
                    setExpandedIds(new Set());
                    setStudentName('Student');
                    setLoading(false);
                    setError(null);
                }
                return;
            }

            if (!currentUser?.uid) {
                if (isMounted) {
                    setError('Teacher authentication required.');
                    setLoading(false);
                    setRawResults([]);
                }
                return;
            }

            try {
                if (isMounted) {
                    setLoading(true);
                    setError(null);
                }

                const results = await getStudentResults(studentId);

                if (!isMounted) {
                    return;
                }

                const visibleResults = results
                    .filter((result) => classifyTeacherResultVisibility({
                        result,
                        teacherId: currentUser.uid,
                        hasAssignmentAccess: canViewStudent,
                    }).shouldDisplayInTeacherHistory)
                    .sort((left, right) => (right.submittedAt || 0) - (left.submittedAt || 0));

                setRawResults(visibleResults);
                setStudentName(visibleResults[0]?.studentName || 'Student');
                setLoading(false);
            } catch (fetchError) {
                if (!isMounted) {
                    return;
                }

                console.error('Failed to load history:', fetchError);
                setError('Failed to load student history.');
                setLoading(false);
                setRawResults([]);
            }
        };

        void fetchResults();

        return () => {
            isMounted = false;
        };
    }, [canViewStudent, currentUser?.uid, ownershipLoading, studentId]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters, rawResults]);

    useEffect(() => {
        if (!ownershipLoading && canViewStudent) {
            hadHistoryAccessRef.current = true;
        }
    }, [canViewStudent, ownershipLoading]);

    const filteredResults = useMemo(
        () => rawResults.filter((result) => {
            if (filters.testType && result.testType !== filters.testType) {
                return false;
            }
            if (filters.skill && result.testSkill !== filters.skill) {
                return false;
            }
            if (filters.dateFrom && result.submittedAt < filters.dateFrom) {
                return false;
            }
            if (filters.dateTo && result.submittedAt > filters.dateTo) {
                return false;
            }
            if (filters.scoreMin !== undefined && result.percentage < filters.scoreMin) {
                return false;
            }
            if (filters.scoreMax !== undefined && result.percentage > filters.scoreMax) {
                return false;
            }
            return true;
        }),
        [filters, rawResults],
    );

    const analyticsResults = useMemo(() => {
        if (!currentUser?.uid) {
            return [];
        }

        return filteredResults.filter((result) => {
            const verdict = classifyTeacherResultVisibility({
                result,
                teacherId: currentUser.uid,
                hasAssignmentAccess: canViewStudent,
            });

            return verdict.shouldDisplayInTeacherHistory && !verdict.excludeFromAnalytics;
        });
    }, [canViewStudent, currentUser?.uid, filteredResults]);

    const stats = useMemo(() => {
        const average = calculateAverageScore(analyticsResults);
        const best = findBestScore(analyticsResults);
        const streak = calculateStudyStreak(analyticsResults);

        return {
            totalTests: analyticsResults.length,
            avgScore: average.percentage,
            avgBand: average.bandScore,
            bestMark: best ? `${best.percentage}% (${best.bandScore})` : 'N/A',
            streak,
        };
    }, [analyticsResults]);

    const chartData = useMemo(() => ({
        progress: calculateBandProgression(analyticsResults),
        skills: calculateSkillBreakdown(analyticsResults),
    }), [analyticsResults]);

    const totalPages = Math.max(1, Math.ceil(filteredResults.length / ITEMS_PER_PAGE));
    const paginatedData = useMemo(() => {
        const safePage = Math.min(currentPage, totalPages);
        const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
        return filteredResults.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [currentPage, filteredResults, totalPages]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const handleToggleExpand = (resultId: string) => {
        setExpandedIds((previous) => {
            const next = new Set(previous);
            if (next.has(resultId)) {
                next.delete(resultId);
            } else {
                next.add(resultId);
            }
            return next;
        });
    };

    const handleClearFilters = () => {
        setFilters({
            scoreMin: 0,
            scoreMax: 100,
        });
    };

    const handleOpenResultDetail = (result: TestResultRecord) => {
        trackAction('viewResults', {
            source: 'teacher_student_history',
            resultId: result.resultId,
            studentId: result.studentId,
            sessionCode: result.sessionCode,
        });

        navigate(buildRoute('RESULT_DETAIL', { resultId: result.resultId }));
    };

    const handleLogout = async () => {
        await signOut(auth);
        sessionStorage.removeItem('isAdmin');
        navigate(buildRoute('LOGIN'), { replace: true });
    };

    const showAccessLostState = !ownershipLoading && !loading && !error && !canViewStudent;

    return (
        <div style={teacherPageShellStyle}>
            <TeacherHeader
                pageTitle="Student History"
                userId={currentUser?.uid}
                userRole="teacher"
                userDisplayName={currentUser?.displayName || currentUser?.email || 'Teacher'}
                userEmail={currentUser?.email || undefined}
                userAvatarUrl={currentUser?.photoURL || undefined}
                onLogout={handleLogout}
            />

            <main style={teacherPageContentStyle}>
                {renderPageContent({
                    ownershipLoading,
                    loading,
                    error,
                    navigate,
                    studentName,
                    stats,
                    analyticsResultCount: analyticsResults.length,
                    filteredResults,
                    chartData,
                    filters,
                    setFilters,
                    rawResults,
                    handleClearFilters,
                    paginatedData,
                    expandedIds,
                    handleToggleExpand,
                    handleOpenResultDetail,
                    currentPage,
                    totalPages,
                    setCurrentPage,
                    showAccessLostState,
                    hadHistoryAccess: hadHistoryAccessRef.current,
                })}
            </main>

            <style>{`@keyframes teacherStudentHistorySpin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

type RenderPageContentArgs = {
    ownershipLoading: boolean;
    loading: boolean;
    error: string | null;
    navigate: ReturnType<typeof useNavigate>;
    studentName: string;
    stats: {
        totalTests: number;
        avgScore: number;
        avgBand: number;
        bestMark: string;
        streak: number;
    };
    analyticsResultCount: number;
    filteredResults: TestResultRecord[];
    chartData: {
        progress: ReturnType<typeof calculateBandProgression>;
        skills: ReturnType<typeof calculateSkillBreakdown>;
    };
    filters: FilterType;
    setFilters: React.Dispatch<React.SetStateAction<FilterType>>;
    rawResults: TestResultRecord[];
    handleClearFilters: () => void;
    paginatedData: TestResultRecord[];
    expandedIds: Set<string>;
    handleToggleExpand: (resultId: string) => void;
    handleOpenResultDetail: (result: TestResultRecord) => void;
    currentPage: number;
    totalPages: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    showAccessLostState: boolean;
    hadHistoryAccess: boolean;
};

function renderPageContent({
    ownershipLoading,
    loading,
    error,
    navigate,
    studentName,
    stats,
    analyticsResultCount,
    filteredResults,
    chartData,
    filters,
    setFilters,
    rawResults,
    handleClearFilters,
    paginatedData,
    expandedIds,
    handleToggleExpand,
    handleOpenResultDetail,
    currentPage,
    totalPages,
    setCurrentPage,
    showAccessLostState,
    hadHistoryAccess,
}: RenderPageContentArgs): React.ReactNode {
    if (ownershipLoading || loading) {
        return (
            <StateCard
                title="Loading student history"
                description="Fetching the classified result history for this student."
            >
                <div style={loadingIndicatorStyle}>
                    <div style={spinnerStyle} />
                    <div style={{ color: '#64748b', fontWeight: 600 }}>Loading student history...</div>
                </div>
            </StateCard>
        );
    }

    if (showAccessLostState) {
        return (
            <StateCard
                title={hadHistoryAccess ? 'Access revoked' : 'Access denied'}
                description={
                    hadHistoryAccess
                        ? 'Your assignment to this student changed while this page was open. The history has been cleared immediately.'
                        : 'You do not currently have an active assignment for this student.'
                }
            >
                <div>
                    <Button
                        variant="primary"
                        onClick={() => navigate(buildRoute('TEACHER_STUDENTS'))}
                    >
                        Back to Students
                    </Button>
                </div>
            </StateCard>
        );
    }

    if (error) {
        return (
            <StateCard title="Unable to load student history" description={error}>
                <div>
                    <Button
                        variant="primary"
                        onClick={() => navigate(buildRoute('TEACHER_STUDENTS'))}
                    >
                        Back to Students
                    </Button>
                </div>
            </StateCard>
        );
    }

    return (
        <>
            <div style={pageHeaderStyle}>
                <div>
                    <h1 style={pageTitleStyle}>{studentName}'s History</h1>
                    <div style={{ color: '#64748b', marginTop: '0.25rem' }}>
                        Performance analytics from the shared teacher visibility pipeline.
                    </div>
                </div>
                <Button variant="secondary" onClick={() => navigate(-1)}>
                    Back
                </Button>
            </div>

            <div style={statsGridStyle}>
                <StatCard
                    title="Total Tests"
                    value={stats.totalTests}
                    iconLabel="ALL"
                    color="#3b82f6"
                    testId="teacher-history-total-tests"
                />
                <StatCard
                    title="Avg Band Score"
                    value={stats.avgBand}
                    subtext={`${stats.avgScore}% Average Accuracy`}
                    iconLabel="AVG"
                    color="#8b5cf6"
                    testId="teacher-history-average-band"
                />
                <StatCard
                    title="Best Result"
                    value={stats.bestMark}
                    iconLabel="TOP"
                    color="#10b981"
                    testId="teacher-history-best-result"
                />
                <StatCard
                    title="Latest Streak"
                    value={`${stats.streak} Days`}
                    iconLabel="RUN"
                    color="#f59e0b"
                    testId="teacher-history-streak"
                />
            </div>

            {analyticsResultCount > 0 ? (
                <div style={chartsGridStyle}>
                    <ProgressLineChart data={chartData.progress} title="Band Score History" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <BandScoreProgress currentBand={stats.avgBand} targetBand={7.0} />
                        <SkillRadarChart data={chartData.skills} />
                    </div>
                </div>
            ) : null}

            <ResultFilters
                filters={filters}
                results={rawResults}
                onChange={setFilters}
                onClear={handleClearFilters}
            />

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                        History ({filteredResults.length})
                    </h2>
                </div>

                {paginatedData.length === 0 ? (
                    <Card variant="glass">
                        <CardBody style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                            No results found matching your filters.
                        </CardBody>
                    </Card>
                ) : (
                    paginatedData.map((result) => (
                        <ResultRow
                            key={result.resultId}
                            result={result}
                            isExpanded={expandedIds.has(result.resultId)}
                            onToggle={() => handleToggleExpand(result.resultId)}
                            onViewDetails={() => handleOpenResultDetail(result)}
                        />
                    ))
                )}

                {totalPages > 1 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem' }}>
                        <Button
                            variant="glass"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        >
                            Previous
                        </Button>
                        <span
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 1rem',
                                fontWeight: 600,
                            }}
                        >
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            variant="glass"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        >
                            Next
                        </Button>
                    </div>
                ) : null}
            </div>
        </>
    );
}

const StateCard: React.FC<{
    title: string;
    description: string;
    children?: React.ReactNode;
}> = ({ title, description, children }) => (
    <Card variant="glass">
        <CardBody style={stateCardBodyStyle}>
            <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{title}</div>
                <div style={{ color: '#64748b', maxWidth: '40rem', textAlign: 'center' }}>{description}</div>
                {children}
            </div>
        </CardBody>
    </Card>
);

function getScoreColor(percentage: number): string {
    if (percentage >= 80) {
        return '#10b981';
    }
    if (percentage >= 60) {
        return '#f59e0b';
    }
    return '#ef4444';
}

function formatDisplayLabel(value?: string | null): string {
    if (!value) {
        return 'Unknown';
    }

    return value
        .split(/[_-]+/g)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
}

const metaLabelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    color: '#64748b',
    fontWeight: 600,
};

const teacherPageShellStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
    backgroundAttachment: 'fixed',
};

const teacherPageContentStyle: React.CSSProperties = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '2rem 1rem 3rem',
    minHeight: 'calc(100vh - 110px)',
};

const pageHeaderStyle: React.CSSProperties = {
    marginBottom: '2rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    flexWrap: 'wrap',
};

const pageTitleStyle: React.CSSProperties = {
    fontSize: '2rem',
    fontWeight: 800,
    color: '#1e293b',
    margin: 0,
};

const statsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem',
};

const chartsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: '1.5rem',
    marginBottom: '2rem',
};

const stateCardBodyStyle: React.CSSProperties = {
    padding: '3rem 2rem',
    minHeight: '320px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const loadingIndicatorStyle: React.CSSProperties = {
    display: 'grid',
    gap: '1rem',
    justifyItems: 'center',
    marginTop: '0.5rem',
};

const spinnerStyle: React.CSSProperties = {
    width: 48,
    height: 48,
    border: '4px solid #e2e8f0',
    borderTopColor: '#8b5cf6',
    borderRadius: '50%',
    animation: 'teacherStudentHistorySpin 0.8s linear infinite',
};

export default TeacherStudentHistoryPage;
