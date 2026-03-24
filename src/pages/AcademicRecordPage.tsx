import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getFilteredResults, getLatestResultPerTest } from '@/services/academicRecordService';
import { ResultsByCourse, ResultsBySkill, ResultsByTestType, StatisticsDashboard } from '@/components/academicRecord';
import { THCSProgressTab } from '@/components/academicRecord/THCSProgressTab';
import type { EnhancedTestResultRecord } from '@/types/results.types';
import type { AcademicRecordFilters } from '@/types/academicRecord.types';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S } from '../components/layout/studentLayoutStyles';
import { IconAlertCircle } from '../components/layout/StudentIcons';
import { getProgressiveFeedback, refreshProgressiveFeedback } from '../services/progressiveFeedback.service';
import type { ProgressiveFeedbackRecord } from '@/types/academicRecord.types';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { ResultSlidePanel } from '../components/results/ResultSlidePanel';
import AIMaintenanceBanner from '../components/ai/AIMaintenanceBanner';
import { useAIStatus } from '../hooks/useAIStatus';

// Lazy import for Writing progress (code-split)
const WritingProgressSection = lazy(() => import('../components/writing-practice/WritingProgressSection'));

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  ⚠️  STUDENT VIEW DESIGN STANDARD v1.0 — ACTIVE       ║
 * ║  This file has been migrated.                          ║
 * ╚══════════════════════════════════════════════════════════╝
 */

// ─── Inline Styles for Academic Record ───────────────────────────────────────
const localStyles: any = {
    headerRow: {
        ...S.feedHeader,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
    },
    controlsRow: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 12,
    },
    selectBox: {
        background: '#e5e7eb',
        border: 'none',
        borderRadius: 999,
        padding: '8px 16px',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: '#374151',
        outline: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
    },
    alertBox: {
        margin: '16px',
        padding: '12px 16px',
        background: '#fee2e2',
        color: '#b91c1c',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: '0.875rem',
        border: '1px solid #fca5a5',
    },
    feedSection: {
        padding: '12px 16px 16px',
        animation: 'dashFadeIn 200ms ease-out forwards',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
        marginBottom: 4,
    },
    statCard: {
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '12px 14px',
    },
    statLabel: {
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
        color: '#6b7280',
        marginBottom: 6,
    },
    statValue: {
        fontSize: '1.1rem',
        fontWeight: 800,
        color: '#111827',
        lineHeight: 1.1,
    },
    statHint: {
        fontSize: '0.75rem',
        color: '#6b7280',
        marginTop: 4,
    },
    feedbackCard: {
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 12,
    },
    feedbackTop: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 10,
    },
    feedbackTitleWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    feedbackTitle: {
        margin: 0,
        fontSize: '0.95rem',
        fontWeight: 700,
        color: '#111827',
    },
    feedbackMeta: {
        fontSize: '0.75rem',
        color: '#6b7280',
    },
    refreshButton: {
        width: 30,
        height: 30,
        borderRadius: 999,
        border: '1px solid #d1d5db',
        background: '#ffffff',
        color: '#4b5563',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
    },
    refreshButtonDisabled: {
        background: '#f3f4f6',
        color: '#9ca3af',
        cursor: 'not-allowed',
    },
    feedbackBody: {
        fontSize: '0.875rem',
        lineHeight: 1.6,
        color: '#374151',
        whiteSpace: 'pre-wrap' as const,
    },
    feedbackList: {
        margin: '10px 0 0',
        paddingLeft: 18,
        color: '#4b5563',
        fontSize: '0.8125rem',
        lineHeight: 1.6,
    },
    rightPanelStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    selectorWrap: {
        position: 'relative',
        zIndex: 20,
    },
    selectorButtonWrap: {
        position: 'relative',
        zIndex: 30,
    },
    pillButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        width: '100%',
        padding: '10px 14px',
        borderRadius: 999,
        border: '1px solid #d1d5db',
        background: '#f9fafb',
        color: '#111827',
        fontSize: '0.875rem',
        fontWeight: 700,
        cursor: 'pointer',
    },
    pillButtonOpen: {
        background: '#ffffff',
        border: '1px solid #c7d2fe',
        boxShadow: '0 10px 24px rgba(79, 70, 229, 0.14)',
    },
    dropdownMenu: {
        position: 'absolute',
        top: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        zIndex: 50,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 14,
        padding: 6,
        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)',
        maxHeight: '280px',
        overflowY: 'auto' as const,
    },
    previewCardHidden: {
        opacity: 0.2,
        pointerEvents: 'none' as const,
        filter: 'blur(1px)',
    },
    dropdownItem: {
        width: '100%',
        border: 'none',
        background: 'transparent',
        borderRadius: 10,
        padding: '10px 12px',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    dropdownItemActive: {
        background: '#eef2ff',
    },
    dropdownItemTitle: {
        margin: 0,
        fontSize: '0.875rem',
        fontWeight: 700,
        color: '#111827',
    },
    dropdownItemDescription: {
        margin: 0,
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: '#6b7280',
    },
    previewCard: {
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 14,
        padding: '12px 12px 8px',
        marginTop: 8,
        overflow: 'hidden',
    },
    previewHeader: {
        marginBottom: 10,
    },
    previewTitle: {
        margin: 0,
        fontSize: '0.95rem',
        fontWeight: 700,
        color: '#111827',
    },
    previewDescription: {
        margin: '4px 0 0',
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: '#6b7280',
    },
};

const RIGHT_PANEL_MODULES = [
    { value: 'course', label: 'By Course', description: 'Review how your results are distributed across different courses and identify which course strands need more attention.' },
    { value: 'skill', label: 'By Skill', description: 'See which language skills are holding up well and which ones are repeatedly weakening your overall performance.' },
    { value: 'type', label: 'By Type', description: 'Compare performance by task type to spot where question formats are beginning to slow you down.' },
    { value: 'writing', label: 'Writing', description: 'Open your writing progress area to inspect writing-specific development and recurring correction patterns.' },
    { value: 'statistics', label: 'Statistics', description: 'View the broader numbers and trends behind your record to understand how your performance is moving over time.' },
];

export const AcademicRecordPage: React.FC = () => {
    const { user, profile } = useAuth();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    // PRD-0039 Task 9.15: Instrumentation
    const { trackAction } = useFeatureTracking('academicRecords');
    const [{ maintenance: aiMaintenance, loaded: aiStatusLoaded }] = useAIStatus();

    // PRD-0039 Task 4.1: Query param is the single source of truth for the open panel
    const selectedResultId = searchParams.get('result');

    const [results, setResults] = useState<EnhancedTestResultRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [progressiveFeedback, setProgressiveFeedback] = useState<ProgressiveFeedbackRecord | null>(null);
    const [progressiveFeedbackLoading, setProgressiveFeedbackLoading] = useState(false);

    const [dateRange, setDateRange] = useState<string>('all');
    const [selectedRightModule, setSelectedRightModule] = useState<string>(RIGHT_PANEL_MODULES[0].value);
    const [showModuleMenu, setShowModuleMenu] = useState(false);

    // PRD-0039 Task 4.5: Keep the full raw results array for result lookup
    // PRD-0039 Task 4.6: Derived latest-only array for timeline/grouped-card rendering
    const latestResults = useMemo(() => getLatestResultPerTest(results), [results]);



    const fetchResults = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        setError(null);
        try {
            const appliedFilters: AcademicRecordFilters = {};
            if (dateRange !== 'all') {
                const now = Date.now();
                const ranges: Record<string, number> = {
                    'week': 7 * 24 * 60 * 60 * 1000,
                    'month': 30 * 24 * 60 * 60 * 1000,
                    'quarter': 90 * 24 * 60 * 60 * 1000,
                    'year': 365 * 24 * 60 * 60 * 1000
                };
                if (ranges[dateRange]) {
                    appliedFilters.dateFrom = now - ranges[dateRange];
                    appliedFilters.dateTo = now;
                }
            }
            const fetchedResults = await getFilteredResults(user.uid, appliedFilters);
            setResults(fetchedResults);
        } catch (err) {
            console.error('Error fetching academic records:', err);
            setError('Failed to load your academic records. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [user?.uid, dateRange]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    useEffect(() => {
        if (!user?.uid) return;

        let cancelled = false;

        const loadProgressiveFeedback = async () => {
            try {
                setProgressiveFeedbackLoading(true);
                const existing = await getProgressiveFeedback(user.uid);
                if (!cancelled) {
                    setProgressiveFeedback(existing);
                }

                const refreshed = await refreshProgressiveFeedback(user.uid);
                if (!cancelled && refreshed) {
                    setProgressiveFeedback(refreshed);
                }
            } catch (err) {
                console.error('Failed to load progressive feedback:', err);
            } finally {
                if (!cancelled) {
                    setProgressiveFeedbackLoading(false);
                }
            }
        };

        loadProgressiveFeedback();

        return () => {
            cancelled = true;
        };
    }, [user?.uid]);

    // PRD-0039 Task 4.2: Normalize location.state entries to query params
    useEffect(() => {
        if (location.state?.resultId && location.state?.showResult) {
            setSearchParams({ result: location.state.resultId }, { replace: true });
        }
        // PRD-0039 Task 4.3: Support resetRecordsView from StudentSidebar
        if (location.state?.resetRecordsView) {
            setSearchParams({}, { replace: true });
        }
    }, [location.state, setSearchParams]);

    // PRD-0039 Task 4.6a: Single callback for opening a result panel
    const handleOpenResult = useCallback((resultId: string) => {
        setSearchParams({ result: resultId });
        // PRD-0039 Task 9.15: Track slide panel open
        trackAction('openSlidePanel', { resultId });
    }, [setSearchParams, trackAction]);

    // PRD-0039 Task 4.7: THCS history click uses full raw results array, resolves to handleOpenResult
    const handleThcsHistoryClick = useCallback((historyTestId: string) => {
        const latestMatch = [...results]
            .sort((a, b) => b.submittedAt - a.submittedAt)
            .find(result => {
                const candidateIds = [
                    (result as any).testId,
                    (result as any).quizId,
                    result.resultId,
                ].filter(Boolean);

                return candidateIds.includes(historyTestId);
            });

        if (latestMatch?.resultId) {
            handleOpenResult(latestMatch.resultId);
        }
    }, [results, handleOpenResult]);

    const handleExportPDF = () => {
        console.log('Export PDF clicked');
    };

    const handleExportCSV = () => {
        console.log('Export CSV clicked');
    };

    const handleRefreshProgressiveFeedback = async () => {
        if (!user?.uid) return;
        if (aiStatusLoaded && aiMaintenance) {
            trackAction('retryAiFeedback', { source: 'academic_record', outcome: 'blocked_maintenance' });
            return;
        }

        try {
            trackAction('retryAiFeedback', { source: 'academic_record', outcome: 'manual_refresh' });
            setProgressiveFeedbackLoading(true);
            const refreshed = await refreshProgressiveFeedback(user.uid, { manual: true, force: true });
            setProgressiveFeedback(refreshed);
        } catch (err) {
            console.error('Failed to manually refresh progressive feedback:', err);
        } finally {
            setProgressiveFeedbackLoading(false);
        }
    };


    // PRD-0039 Task 4.4: Removed ResultDetailModal inline usage. Panel will be added in Task 5.0.
    const handleClosePanel = useCallback(() => {
        setSearchParams({}, { replace: true });
        // PRD-0039 Task 9.15: Track slide panel close
        trackAction('closeSlidePanel');
    }, [setSearchParams, trackAction]);

    // ─── CENTER CONTENT ────────────────────────────────────────────────────────
    const renderContent = () => {
        if (loading && results.length === 0) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 16px' }}>
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            border: '3px solid #e2e8f0',
                            borderTopColor: '#8b5cf6',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                        }}
                    />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ color: '#6b7280', marginTop: 16 }}>Loading your academic records...</p>
                </div>
            );
        }

        return <THCSProgressTab userId={user?.uid || ''} onResultClick={handleThcsHistoryClick} />;
    };

    const renderModulePreview = (module: string) => {
        switch (module) {
            case 'course':
                return <ResultsByCourse results={latestResults.slice(0, 8)} onResultClick={handleOpenResult} />;
            case 'skill':
                return <ResultsBySkill results={latestResults.slice(0, 8)} onResultClick={handleOpenResult} />;
            case 'type':
                return <ResultsByTestType results={latestResults.slice(0, 8)} onResultClick={handleOpenResult} />;
            case 'statistics':
                return (
                    <StatisticsDashboard
                        results={results.slice(0, 12)}
                        onExportPDF={handleExportPDF}
                        onExportCSV={handleExportCSV}
                    />
                );
            case 'writing':
                return user?.uid ? (
                    <Suspense fallback={
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '64px 16px' }}>
                            <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    }>
                        <WritingProgressSection studentId={user.uid} />
                    </Suspense>
                ) : null;
            default:
                return null;
        }
    };

    // ─── RIGHT PANEL WIDGET ──────────────────────────────────────────────────
    const renderRightPanel = () => {
        const totalTests = results.length;
        const validScores = results.filter(r => r.percentage !== undefined && r.percentage !== null);
        const avgScore = validScores.length > 0
            ? validScores.reduce((acc, r) => acc + (r.percentage || 0), 0) / validScores.length
            : 0;
        const highestScore = validScores.length > 0
            ? Math.max(...validScores.map(r => r.percentage || 0))
            : 0;

        const activeModule = RIGHT_PANEL_MODULES.find(module => module.value === selectedRightModule) || RIGHT_PANEL_MODULES[0];

        return (
            <div style={S.rightSticky}>
                <div style={localStyles.rightPanelStack}>
                    <div style={S.widget}>
                        <h3 style={S.widgetTitle}>Overview</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: 500 }}>Tests Taken</span>
                                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{totalTests}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: 500 }}>Average Score</span>
                                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#4f46e5' }}>{avgScore.toFixed(0)}%</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: 500 }}>Best Score</span>
                                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{highestScore.toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>

                    <div style={localStyles.selectorWrap}>
                        <div style={localStyles.selectorButtonWrap}>
                            <button
                                type="button"
                                style={{
                                    ...localStyles.pillButton,
                                    ...(showModuleMenu ? localStyles.pillButtonOpen : {}),
                                }}
                                onClick={() => setShowModuleMenu(prev => !prev)}
                                aria-haspopup="menu"
                            >
                                <span>{activeModule.label}</span>
                                <span>{showModuleMenu ? '▴' : '▾'}</span>
                            </button>

                            {showModuleMenu && (
                                <div style={localStyles.dropdownMenu} role="menu" aria-label="Select record module">
                                    {RIGHT_PANEL_MODULES.map(module => {
                                        const isActive = module.value === activeModule.value;
                                        return (
                                            <button
                                                key={module.value}
                                                type="button"
                                                role="menuitem"
                                                style={{
                                                    ...localStyles.dropdownItem,
                                                    ...(isActive ? localStyles.dropdownItemActive : {}),
                                                }}
                                                onClick={() => {
                                                    setSelectedRightModule(module.value);
                                                    setShowModuleMenu(false);
                                                }}
                                            >
                                                <p style={localStyles.dropdownItemTitle}>{module.label}</p>
                                                <p style={localStyles.dropdownItemDescription}>{module.description}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div
                            style={{
                                ...localStyles.previewCard,
                                ...(showModuleMenu ? localStyles.previewCardHidden : {}),
                            }}
                        >
                            <div style={localStyles.previewHeader}>
                                <h3 style={localStyles.previewTitle}>{activeModule.label}</h3>
                                <p style={localStyles.previewDescription}>{activeModule.description}</p>
                            </div>
                            <div>
                                {renderModulePreview(activeModule.value)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderSidebar = () => {
        return (
            <StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="records" />
        );
    };

    const validScores = results.filter(r => r.percentage !== undefined && r.percentage !== null);
    const averageScore = validScores.length > 0
        ? Math.round(validScores.reduce((sum, result) => sum + (result.percentage || 0), 0) / validScores.length)
        : 0;
    const bestScore = validScores.length > 0
        ? Math.max(...validScores.map(result => result.percentage || 0))
        : 0;
    const canManualRefresh = !!progressiveFeedback && (!progressiveFeedback.nextEligibleManualRefreshAt || Date.now() >= progressiveFeedback.nextEligibleManualRefreshAt);
    const isProgressiveFeedbackRefreshDisabled =
        !canManualRefresh
        || progressiveFeedbackLoading
        || (aiStatusLoaded && aiMaintenance);
    const progressiveFeedbackRefreshTitle = aiStatusLoaded && aiMaintenance
        ? 'AI system is in maintenance while all available API keys cool down.'
        : canManualRefresh
            ? 'Refresh progressive feedback now'
            : 'Manual refresh becomes available 24 hours after the last manual refresh';

    return (
        <StudentLayout
            mobileTitle="Records"
            sidebar={renderSidebar()}
            rightPanel={renderRightPanel()}
        >
            <div style={localStyles.headerRow}>
                <h1 style={S.feedHeaderTitle}>Academic Record</h1>
                <div style={localStyles.controlsRow}>
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        style={localStyles.selectBox}
                        aria-label="Filter by time period"
                    >
                        <option value="all">All Time</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="quarter">Last 3 Months</option>
                        <option value="year">Last Year</option>
                    </select>
                </div>
            </div>

            {error && (
                <div style={localStyles.alertBox}>
                    <IconAlertCircle />
                    <span>{error}</span>
                </div>
            )}

            <AIMaintenanceBanner />

            {!selectedResultId && (
                <div style={localStyles.feedSection}>
                    <div style={localStyles.statsGrid}>
                        <div style={localStyles.statCard}>
                            <div style={localStyles.statLabel}>Total Tests</div>
                            <div style={localStyles.statValue}>{results.length}</div>
                            <div style={localStyles.statHint}>Recorded attempts</div>
                        </div>
                        <div style={localStyles.statCard}>
                            <div style={localStyles.statLabel}>Average Score</div>
                            <div style={{ ...localStyles.statValue, color: '#4f46e5' }}>
                                {averageScore}%
                            </div>
                            <div style={localStyles.statHint}>Across visible results</div>
                        </div>
                        <div style={localStyles.statCard}>
                            <div style={localStyles.statLabel}>Best Score</div>
                            <div style={localStyles.statValue}>{bestScore}%</div>
                            <div style={localStyles.statHint}>Highest performance</div>
                        </div>
                    </div>

                    <div style={localStyles.feedbackCard}>
                        <div style={localStyles.feedbackTop}>
                            <div style={localStyles.feedbackTitleWrap}>
                                <h2 style={localStyles.feedbackTitle}>Progressive Feedback</h2>
                            </div>
                            <button
                                type="button"
                                onClick={handleRefreshProgressiveFeedback}
                                style={{
                                    ...localStyles.refreshButton,
                                    ...(isProgressiveFeedbackRefreshDisabled ? localStyles.refreshButtonDisabled : {}),
                                }}
                                disabled={isProgressiveFeedbackRefreshDisabled}
                                aria-label="Refresh progressive feedback"
                                title={progressiveFeedbackRefreshTitle}
                            >
                                ↻
                            </button>
                        </div>
                        {progressiveFeedbackLoading && !progressiveFeedback ? (
                            <div style={localStyles.feedbackBody}>Loading progressive feedback...</div>
                        ) : progressiveFeedback ? (
                            <>
                                <div style={localStyles.feedbackBody}>{progressiveFeedback.narrative.summary}</div>
                                <div style={{ ...localStyles.feedbackMeta, marginTop: 10 }}>
                                    Generated {new Date(progressiveFeedback.generatedAt).toLocaleString()}
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={localStyles.feedbackBody}>
                                    Progressive feedback is not available yet. Complete more recent tests to generate a 5-day progress summary.
                                </div>
                                <ul style={localStyles.feedbackList}>
                                    <li>Refresh cadence: every 5 days automatically</li>
                                    <li>Manual refresh: once per 24 hours</li>
                                    <li>History window: latest 25 tests</li>
                                </ul>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div style={localStyles.feedSection}>
                {renderContent()}
            </div>

            {/* PRD-0039: Slide panel integration — render when a result is selected */}
            {selectedResultId && (
                <ResultSlidePanel
                    resultId={selectedResultId}
                    onClose={handleClosePanel}
                />
            )}
        </StudentLayout>
    );
};

export default AcademicRecordPage;

