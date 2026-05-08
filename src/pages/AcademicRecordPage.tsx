import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
    getFilteredResults,
    getLatestResultPerTest,
    getThcsProgress,
    type ThcsProgressData,
} from '@/services/academicRecordService';
import { ResultTimeline, ResultsByCourse, ResultsBySkill } from '@/components/academicRecord';
import { THCSProgressTab } from '@/components/academicRecord/THCSProgressTab';
import type { EnhancedTestResultRecord } from '@/types/results.types';
import type { AcademicRecordFilters, ProgressiveFeedbackRecord } from '@/types/academicRecord.types';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens, mobileStyles } from '../components/layout/studentLayoutStyles';
import { IconAlertCircle } from '../components/layout/StudentIcons';
import { getProgressiveFeedback, refreshProgressiveFeedback } from '../services/progressiveFeedback.service';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { DeferredResultSlidePanel } from '../components/results/DeferredResultSlidePanel';
import AIMaintenanceBanner from '../components/ai/AIMaintenanceBanner';
import { useAIStatus } from '../hooks/useAIStatus';
import { useMediaQuery } from '../hooks/useMediaQuery';

const MAIN_VIEW_OPTIONS = [
    { value: 'overview', label: 'Overview' },
    { value: 'thcs', label: 'THCS' },
    { value: 'ielts', label: 'IELTS' },
    { value: 'course', label: 'Course' },
] as const;

const DATE_RANGE_OPTIONS = [
    { value: 'quarter', label: 'Last 3 Months' },
    { value: 'year', label: 'YTD' },
    { value: 'all', label: 'All Time' },
] as const;

type MainView = (typeof MAIN_VIEW_OPTIONS)[number]['value'];

const academicRecordResultsCache = new Map<string, EnhancedTestResultRecord[]>();
const academicRecordFeedbackCache = new Map<string, ProgressiveFeedbackRecord | null>();
const academicRecordThcsCache = new Map<string, ThcsProgressData | null>();

function getAcademicRecordResultsCacheKey(studentId: string, dateRange: string): string {
    return `${studentId}:${dateRange}`;
}

async function fetchAcademicRecordResults(
    studentId: string,
    dateRange: string
): Promise<EnhancedTestResultRecord[]> {
    const appliedFilters: AcademicRecordFilters = {};

    if (dateRange !== 'all') {
        const now = Date.now();
        const ranges: Record<string, number> = {
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
            quarter: 90 * 24 * 60 * 60 * 1000,
            year: 365 * 24 * 60 * 60 * 1000,
        };

        if (ranges[dateRange]) {
            appliedFilters.dateFrom = now - ranges[dateRange];
            appliedFilters.dateTo = now;
        }
    }

    return getFilteredResults(studentId, appliedFilters);
}

export async function preloadAcademicRecordPageData(studentId: string): Promise<void> {
    if (!studentId) return;

    const resultsKey = getAcademicRecordResultsCacheKey(studentId, 'all');
    const tasks: Promise<unknown>[] = [];

    if (!academicRecordResultsCache.has(resultsKey)) {
        tasks.push(
            fetchAcademicRecordResults(studentId, 'all').then((results) => {
                academicRecordResultsCache.set(resultsKey, results);
            })
        );
    }

    if (!academicRecordThcsCache.has(studentId)) {
        tasks.push(
            getThcsProgress(studentId).then((progress) => {
                academicRecordThcsCache.set(studentId, progress);
            })
        );
    }

    if (!academicRecordFeedbackCache.has(studentId)) {
        tasks.push(
            getProgressiveFeedback(studentId).then((feedback) => {
                academicRecordFeedbackCache.set(studentId, feedback);
            })
        );
    }

    await Promise.allSettled(tasks);
}

const localStyles: Record<string, React.CSSProperties> = {
    headerRow: {
        ...S.feedHeader,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 24,
    },
    controlsRow: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
    },
    datePillGroup: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        background: studentTokens.bgSurfaceAlt,
        borderRadius: 8,
        padding: 4,
    },
    dateRangeButton: {
        border: 'none',
        background: 'transparent',
        borderRadius: 6,
        padding: '6px 16px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: studentTokens.textMuted,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'color 0.15s ease',
    },
    dateRangeButtonActive: {
        background: '#ffffff',
        color: studentTokens.accent,
        boxShadow: '0 1px 2px rgba(43, 52, 55, 0.06)',
    },
    alertBox: {
        marginTop: 28,
        padding: '18px 20px',
        background: 'rgba(226, 223, 255, 0.42)',
        color: studentTokens.textPrimary,
        borderRadius: 0,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        fontSize: '0.875rem',
        borderLeft: `4px solid ${studentTokens.accent}`,
    },
    defaultBanner: {
        marginTop: 28,
        padding: '18px 20px',
        background: 'rgba(226, 223, 255, 0.42)',
        color: studentTokens.textPrimary,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        borderLeft: `4px solid ${studentTokens.accent}`,
    },
    feedSection: {
        padding: '48px 0 0',
        animation: 'dashFadeIn 200ms ease-out forwards',
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 32,
        marginBottom: 0,
    },
    statCard: {
        background: '#ffffff',
        borderRadius: 0,
        padding: '24px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 0,
        minHeight: 128,
    },
    statLabel: {
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
        marginBottom: 0,
    },
    statValueRow: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
    },
    statValue: {
        fontSize: '2.25rem',
        fontWeight: 800,
        color: studentTokens.textPrimary,
        lineHeight: 1.1,
    },
    statHint: {
        fontSize: '0.75rem',
        fontWeight: 500,
        color: studentTokens.textMuted,
    },
    feedbackCard: {
        background: studentTokens.bgSurfaceAlt,
        borderRadius: 0,
        padding: '32px 32px',
        position: 'relative',
        overflow: 'hidden',
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
    feedbackEyebrow: {
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: studentTokens.accent,
    },
    feedbackTitle: {
        margin: 0,
        fontSize: '1.25rem',
        fontWeight: 600,
        color: studentTokens.textPrimary,
    },
    feedbackMeta: {
        fontSize: '0.75rem',
        color: studentTokens.textMuted,
    },
    refreshButton: {
        minWidth: 126,
        height: 38,
        padding: '0 16px',
        borderRadius: studentTokens.radiusSoft,
        border: 'none',
        background: studentTokens.accent,
        color: '#faf6ff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
    },
    refreshButtonDisabled: {
        background: studentTokens.bgSurfaceStrong,
        color: studentTokens.textDim,
        cursor: 'not-allowed',
    },
    feedbackBody: {
        fontSize: '0.875rem',
        lineHeight: 1.6,
        color: studentTokens.textBody,
        whiteSpace: 'pre-wrap',
    },
    feedbackList: {
        margin: '10px 0 0',
        paddingLeft: 18,
        color: studentTokens.textBody,
        fontSize: '0.8125rem',
        lineHeight: 1.6,
    },
    viewSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    sectionHeader: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    sectionTitle: {
        margin: 0,
        fontSize: '0.875rem',
        fontWeight: 700,
        color: studentTokens.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
    },
    sectionBody: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    pageTabBar: {
        display: 'flex',
        gap: 32,
        overflowX: 'auto',
        padding: '0 0 0',
        marginTop: 32,
        borderBottom: `1px solid rgba(171, 179, 183, 0.1)`,
    },
    pageTab: {
        padding: '0 0 16px',
        fontWeight: 500,
        fontSize: '0.875rem',
        color: studentTokens.textMuted,
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        borderBottom: '2px solid transparent',
        transition: 'color 0.15s ease, border-color 0.15s ease',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
    },
    pageTabActive: {
        color: studentTokens.accent,
        fontWeight: 600,
        borderBottom: `2px solid ${studentTokens.accent}`,
    },
    feedbackDecoration: {
        position: 'absolute',
        right: -18,
        bottom: -16,
        fontSize: '5rem',
        fontWeight: 800,
        letterSpacing: '-0.06em',
        color: 'rgba(43, 52, 55, 0.05)',
        pointerEvents: 'none',
        userSelect: 'none',
    },
};

export const AcademicRecordPage: React.FC = () => {
    const { user, profile } = useAuth();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { trackAction } = useFeatureTracking('academicRecords');
    const [{ maintenance: aiMaintenance, loaded: aiStatusLoaded }] = useAIStatus();
    const isMobile = useMediaQuery('(max-width: 768px)');
    const initialResultsCache = user?.uid
        ? academicRecordResultsCache.get(getAcademicRecordResultsCacheKey(user.uid, 'all')) ?? null
        : null;
    const initialFeedbackCache = user?.uid && academicRecordFeedbackCache.has(user.uid)
        ? academicRecordFeedbackCache.get(user.uid) ?? null
        : null;
    const initialThcsCache = user?.uid && academicRecordThcsCache.has(user.uid)
        ? academicRecordThcsCache.get(user.uid) ?? null
        : null;

    const selectedResultId = searchParams.get('result');

    const [results, setResults] = useState<EnhancedTestResultRecord[]>(() => initialResultsCache ?? []);
    const [loading, setLoading] = useState(() => Boolean(user?.uid) && !initialResultsCache);
    const [error, setError] = useState<string | null>(null);
    const [progressiveFeedback, setProgressiveFeedback] = useState<ProgressiveFeedbackRecord | null>(() => initialFeedbackCache);
    const [progressiveFeedbackLoading, setProgressiveFeedbackLoading] = useState(() => Boolean(user?.uid) && !(user?.uid && academicRecordFeedbackCache.has(user.uid)));
    const [thcsProgress, setThcsProgress] = useState<ThcsProgressData | null>(() => initialThcsCache);
    const [thcsLoading, setThcsLoading] = useState(() => Boolean(user?.uid) && !(user?.uid && academicRecordThcsCache.has(user.uid)));
    const [dateRange, setDateRange] = useState<string>('all');
    const [activeView, setActiveView] = useState<MainView>('overview');

    const latestResults = useMemo(() => getLatestResultPerTest(results), [results]);
    const ieltsResults = useMemo(
        () => latestResults.filter((result) => {
            if ((result as any).thcsData) {
                return false;
            }

            const skill = String(result.testSkill || '').toLowerCase();
            return ['reading', 'listening', 'writing', 'speaking'].includes(skill);
        }),
        [latestResults],
    );

    const fetchResults = useCallback(async () => {
        if (!user?.uid) return;

        const cacheKey = getAcademicRecordResultsCacheKey(user.uid, dateRange);
        const cachedResults = academicRecordResultsCache.get(cacheKey) ?? null;

        if (cachedResults) {
            setResults(cachedResults);
        } else {
            setResults([]);
        }

        setLoading(!cachedResults);
        setError(null);

        try {
            const fetchedResults = await fetchAcademicRecordResults(user.uid, dateRange);
            academicRecordResultsCache.set(cacheKey, fetchedResults);
            setResults(fetchedResults);
        } catch (err) {
            console.error('Error fetching academic records:', err);
            setError('Failed to load your academic records. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [dateRange, user?.uid]);

    useEffect(() => {
        if (!user?.uid) {
            setResults([]);
            setLoading(false);
            setError(null);
            return;
        }

        const cachedResults = academicRecordResultsCache.get(getAcademicRecordResultsCacheKey(user.uid, dateRange));
        if (cachedResults) {
            setResults(cachedResults);
            setLoading(false);
        }

        void fetchResults();
    }, [fetchResults]);

    useEffect(() => {
        if (!user?.uid) {
            setThcsProgress(null);
            setThcsLoading(false);
            return;
        }

        if (academicRecordThcsCache.has(user.uid)) {
            setThcsProgress(academicRecordThcsCache.get(user.uid) ?? null);
            setThcsLoading(false);
        }

        let cancelled = false;

        const loadThcsProgress = async () => {
            try {
                setThcsLoading(!academicRecordThcsCache.has(user.uid));
                const nextProgress = await getThcsProgress(user.uid);
                if (!cancelled) {
                    setThcsProgress(nextProgress);
                    academicRecordThcsCache.set(user.uid, nextProgress);
                }
            } catch (err) {
                console.error('Failed to load THCS progress:', err);
            } finally {
                if (!cancelled) {
                    setThcsLoading(false);
                }
            }
        };

        loadThcsProgress();

        return () => {
            cancelled = true;
        };
    }, [user?.uid]);

    useEffect(() => {
        if (!user?.uid) {
            setProgressiveFeedback(null);
            setProgressiveFeedbackLoading(false);
            return;
        }

        if (academicRecordFeedbackCache.has(user.uid)) {
            setProgressiveFeedback(academicRecordFeedbackCache.get(user.uid) ?? null);
            setProgressiveFeedbackLoading(false);
        }

        let cancelled = false;

        const loadProgressiveFeedback = async () => {
            try {
                setProgressiveFeedbackLoading(!academicRecordFeedbackCache.has(user.uid));
                const existing = await getProgressiveFeedback(user.uid);
                if (!cancelled) {
                    setProgressiveFeedback(existing);
                    academicRecordFeedbackCache.set(user.uid, existing);
                }

                const shouldRefresh = !existing
                    || !existing.nextScheduledRefreshAt
                    || Date.now() >= existing.nextScheduledRefreshAt;

                if (shouldRefresh) {
                    const refreshed = await refreshProgressiveFeedback(user.uid);
                    if (!cancelled && refreshed) {
                        setProgressiveFeedback(refreshed);
                        academicRecordFeedbackCache.set(user.uid, refreshed);
                    }
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

    useEffect(() => {
        if (location.state?.resultId && location.state?.showResult) {
            setSearchParams({ result: location.state.resultId }, { replace: true });
        }

        if (location.state?.resetRecordsView) {
            setSearchParams({}, { replace: true });
        }
    }, [location.state, setSearchParams]);

    const handleOpenResult = useCallback((resultId: string) => {
        setSearchParams({ result: resultId });
        trackAction('openSlidePanel', { resultId });
    }, [setSearchParams, trackAction]);

    const handleClosePanel = useCallback(() => {
        setSearchParams({}, { replace: true });
        trackAction('closeSlidePanel');
    }, [setSearchParams, trackAction]);

    const handleThcsHistoryClick = useCallback((historyTestId: string) => {
        const latestMatch = [...results]
            .sort((a, b) => b.submittedAt - a.submittedAt)
            .find((result) => {
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
    }, [handleOpenResult, results]);

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
            academicRecordFeedbackCache.set(user.uid, refreshed);
        } catch (err) {
            console.error('Failed to manually refresh progressive feedback:', err);
        } finally {
            setProgressiveFeedbackLoading(false);
        }
    };

    const validScores = results.filter((result) => result.percentage !== undefined && result.percentage !== null);
    const averageScore = validScores.length > 0
        ? Math.round(validScores.reduce((sum, result) => sum + (result.percentage || 0), 0) / validScores.length)
        : 0;
    const bestScore = validScores.length > 0
        ? Math.max(...validScores.map((result) => result.percentage || 0))
        : 0;

    const canManualRefresh = !!progressiveFeedback
        && (!progressiveFeedback.nextEligibleManualRefreshAt || Date.now() >= progressiveFeedback.nextEligibleManualRefreshAt);
    const isProgressiveFeedbackRefreshDisabled =
        !canManualRefresh
        || progressiveFeedbackLoading
        || (aiStatusLoaded && aiMaintenance);
    const progressiveFeedbackRefreshTitle = aiStatusLoaded && aiMaintenance
        ? 'AI system is in maintenance while all available API keys cool down.'
        : canManualRefresh
            ? 'Refresh progressive feedback now'
            : 'Manual refresh becomes available 24 hours after the last manual refresh';

    const mobileTitle = MAIN_VIEW_OPTIONS.find((option) => option.value === activeView)?.label || 'Records';

    const renderOverviewView = () => {
        if (loading && results.length === 0) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 16px' }}>
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            border: `3px solid ${studentTokens.accentSoft}`,
                            borderTopColor: studentTokens.accent,
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                        }}
                    />
                    <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
                    <p style={{ color: studentTokens.textMuted, marginTop: 16 }}>Loading your academic records...</p>
                </div>
            );
        }

        return (
            <>
                <div style={{ ...localStyles.statsGrid, ...(isMobile ? mobileStyles.singleColumnGrid : {}) }}>
                    <div style={{ ...localStyles.statCard, ...(isMobile ? { padding: '20px 18px' } : {}) }}>
                        <div style={localStyles.statLabel}>Total Tests</div>
                        <div style={localStyles.statValueRow}>
                            <span style={localStyles.statValue}>{results.length}</span>
                            <span style={localStyles.statHint}>Recorded</span>
                        </div>
                    </div>
                    <div style={{ ...localStyles.statCard, ...(isMobile ? { padding: '20px 18px' } : {}) }}>
                        <div style={localStyles.statLabel}>Average Score</div>
                        <div style={localStyles.statValueRow}>
                            <span style={{ ...localStyles.statValue, color: studentTokens.accent }}>{averageScore}%</span>
                        </div>
                    </div>
                    <div style={{ ...localStyles.statCard, ...(isMobile ? { padding: '20px 18px' } : {}) }}>
                        <div style={localStyles.statLabel}>Best Score</div>
                        <div style={localStyles.statValueRow}>
                            <span style={{ ...localStyles.statValue, color: '#4c5458' }}>{bestScore}%</span>
                        </div>
                    </div>
                </div>

                <div style={{ ...localStyles.feedbackCard, ...(isMobile ? { padding: '24px 20px' } : {}) }}>
                    <div style={{ ...localStyles.feedbackTop, ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch' } : {}) }}>
                        <div style={localStyles.feedbackTitleWrap}>
                            <span style={localStyles.feedbackEyebrow}>Progressive Feedback</span>
                            <h2 style={localStyles.feedbackTitle}>Recent Progress Synthesis</h2>
                        </div>
                        <button
                            type="button"
                            onClick={handleRefreshProgressiveFeedback}
                            style={{
                                ...localStyles.refreshButton,
                                ...(isMobile ? mobileStyles.fullWidthButton : {}),
                                ...(isProgressiveFeedbackRefreshDisabled ? localStyles.refreshButtonDisabled : {}),
                            }}
                            disabled={isProgressiveFeedbackRefreshDisabled}
                            aria-label="Refresh progressive feedback"
                            title={progressiveFeedbackRefreshTitle}
                        >
                            Refresh
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
                    <div style={localStyles.feedbackDecoration}>AI</div>
                </div>

                <section style={localStyles.viewSection}>
                    <div style={localStyles.sectionHeader}>
                        <h2 style={localStyles.sectionTitle}>Recent Assessment Results</h2>
                    </div>
                    <div style={localStyles.sectionBody}>
                        <ResultTimeline
                            results={latestResults}
                            loading={loading}
                            onResultClick={handleOpenResult}
                            emptyMessage="No recent results found for the selected period"
                            pageSize={6}
                        />
                    </div>
                </section>
            </>
        );
    };

    const renderIeltsView = () => {
        if (loading && results.length === 0) {
            return renderOverviewView();
        }

        return (
            <section style={localStyles.viewSection}>
                <div style={localStyles.sectionHeader}>
                    <h2 style={localStyles.sectionTitle}>IELTS Progress</h2>
                </div>
                <div style={localStyles.sectionBody}>
                    <ResultsBySkill results={ieltsResults} isMobile={isMobile} onResultClick={handleOpenResult} />
                </div>
            </section>
        );
    };

    const renderThcsView = () => {
        if (loading && results.length === 0) {
            return renderOverviewView();
        }

        return (
            <section style={localStyles.viewSection}>
                <div style={localStyles.sectionHeader}>
                    <h2 style={localStyles.sectionTitle}>THCS Progress</h2>
                </div>
                <div style={localStyles.sectionBody}>
                    <THCSProgressTab
                        data={thcsProgress}
                        isMobile={isMobile}
                        loading={thcsLoading}
                        onResultClick={handleThcsHistoryClick}
                    />
                </div>
            </section>
        );
    };

    const renderCourseView = () => {
        if (loading && results.length === 0) {
            return renderOverviewView();
        }

        return (
            <section style={localStyles.viewSection}>
                <div style={localStyles.sectionHeader}>
                    <h2 style={localStyles.sectionTitle}>Course Results</h2>
                </div>
                <div style={localStyles.sectionBody}>
                    <ResultsByCourse results={latestResults} isMobile={isMobile} onResultClick={handleOpenResult} />
                </div>
            </section>
        );
    };

    const renderSidebar = () => (
        <StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="records" />
    );

    return (
        <StudentLayout mobileTitle={mobileTitle} sidebar={renderSidebar()} rightRailVariant="academic-record">
            <div style={{ ...localStyles.headerRow, ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch', gap: 16 } : {}) }}>
                <div style={{ ...S.feedHeaderText, flex: 1 }}>
                    <h1 style={{ ...S.feedHeaderTitle, ...(isMobile ? { fontSize: '1.5rem' } : {}) }}>Academic Record</h1>
                    <p style={{ ...S.feedHeaderSubtitle, maxWidth: 420, ...(isMobile ? mobileStyles.feedSubtitleHidden : {}) }}>
                        Holistic performance tracking and feedback synthesis.
                    </p>
                </div>
                <div style={{ ...localStyles.controlsRow, ...(isMobile ? { justifyContent: 'flex-start', width: '100%' } : {}) }}>
                    <div
                        style={{
                            ...localStyles.datePillGroup,
                            ...(isMobile ? { display: 'flex', width: '100%', overflowX: 'auto' } : {}),
                        }}
                        className={isMobile ? 'student-mobile-scrollbar-hidden' : undefined}
                        aria-label="Filter by time period"
                        role="tablist"
                    >
                        {DATE_RANGE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setDateRange(option.value)}
                                style={{
                                    ...localStyles.dateRangeButton,
                                    ...(isMobile ? { ...mobileStyles.touchTarget, flex: '1 0 auto', padding: '8px 12px' } : {}),
                                    ...(dateRange === option.value ? localStyles.dateRangeButtonActive : {}),
                                }}
                                aria-pressed={dateRange === option.value}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && (
                <div style={{ ...localStyles.alertBox, ...(isMobile ? { padding: '16px', gap: 12 } : {}) }}>
                    <IconAlertCircle />
                    <span>{error}</span>
                </div>
            )}

            <AIMaintenanceBanner
                style={isMobile ? { padding: '0.875rem 1rem', gap: '0.75rem' } : undefined}
            />

            <div
                className={isMobile ? 'student-mobile-scrollbar-hidden' : undefined}
                style={{ ...localStyles.pageTabBar, ...(isMobile ? { gap: 16, marginTop: 24 } : {}) }}
            >
                {MAIN_VIEW_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                            setActiveView(option.value);
                            trackAction('switchResultTab', { tab: option.value, surface: 'main_view' });
                        }}
                        style={{
                            ...localStyles.pageTab,
                            ...(isMobile ? mobileStyles.touchTarget : {}),
                            ...(activeView === option.value ? localStyles.pageTabActive : {}),
                        }}
                        aria-pressed={activeView === option.value}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div style={{ ...localStyles.feedSection, ...(isMobile ? { gap: 24, paddingTop: 32 } : {}) }}>
                {activeView === 'overview' && renderOverviewView()}
                {activeView === 'thcs' && renderThcsView()}
                {activeView === 'ielts' && renderIeltsView()}
                {activeView === 'course' && renderCourseView()}
            </div>

            {selectedResultId && (
                <DeferredResultSlidePanel
                    resultId={selectedResultId}
                    onClose={handleClosePanel}
                />
            )}
        </StudentLayout>
    );
};

export default AcademicRecordPage;
