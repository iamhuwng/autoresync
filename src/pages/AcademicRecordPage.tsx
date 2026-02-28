import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader } from '@mantine/core';
import { useAuth } from '../hooks/useAuth';
import { getFilteredResults } from '@/services/academicRecordService';
import { ResultTimeline, ResultsByCourse, ResultsBySkill, ResultsByTestType, StatisticsDashboard } from '@/components/academicRecord';
import { THCSProgressTab } from '@/components/academicRecord/THCSProgressTab';
import { BadgeShowcase } from '@/components/badges/BadgeShowcase';
import type { EnhancedTestResultRecord } from '@/types/results.types';
import type { AcademicRecordFilters } from '@/types/academicRecord.types';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S } from '../components/layout/studentLayoutStyles';
import { IconAlertCircle } from '../components/layout/StudentIcons';
import { ResultDetailModal } from '../components/results/ResultDetailModal';

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
    controlsRow: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        gap: 16,
        flexWrap: 'wrap',
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
    }
};

const TABS = [
    { value: 'timeline', label: 'Timeline' },
    { value: 'course', label: 'By Course' },
    { value: 'skill', label: 'By Skill' },
    { value: 'type', label: 'By Type' },
    { value: 'writing', label: '✍️ Writing' },
    { value: 'thcs', label: 'THCS/THPT' },
    { value: 'statistics', label: 'Statistics' },
    { value: 'badges', label: 'Badges' },
];

export const AcademicRecordPage: React.FC = () => {
    const { user, profile } = useAuth();
    const location = useLocation();

    const [activeTab, setActiveTab] = useState<string>('timeline');
    const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
    const [results, setResults] = useState<EnhancedTestResultRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [dateRange, setDateRange] = useState<string>('all');



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
        if (location.state?.resultId && location.state?.showResult) {
            setSelectedResultId(location.state.resultId);
        }
        // Auto-switch tab when navigating with state.tab (e.g., PendingReviewsWidget "See all")
        if (location.state?.tab) {
            setActiveTab(location.state.tab);
        }
    }, [location.state]);

    const handleResultClick = (resultId: string) => {
        setSelectedResultId(resultId);
    };

    const handleExportPDF = () => {
        console.log('Export PDF clicked');
    };

    const handleExportCSV = () => {
        console.log('Export CSV clicked');
    };


    // ─── CENTER CONTENT ────────────────────────────────────────────────────────
    const renderContent = () => {
        if (selectedResultId) {
            return (
                <ResultDetailModal
                    opened={true}
                    onClose={() => setSelectedResultId(null)}
                    resultId={selectedResultId}
                    inline={true}
                />
            );
        }

        if (loading && results.length === 0) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 16px' }}>
                    <Loader size="lg" />
                    <p style={{ color: '#6b7280', marginTop: 16 }}>Loading your academic records...</p>
                </div>
            );
        }

        switch (activeTab) {
            case 'timeline':
                return (
                    <ResultTimeline
                        results={results}
                        loading={loading}
                        onResultClick={handleResultClick}
                        emptyMessage="No test results found for the selected period"
                    />
                );
            case 'course':
                return <ResultsByCourse results={results} onResultClick={handleResultClick} />;
            case 'skill':
                return <ResultsBySkill results={results} onResultClick={handleResultClick} />;
            case 'type':
                return <ResultsByTestType results={results} onResultClick={handleResultClick} />;
            case 'statistics':
                return (
                    <StatisticsDashboard
                        results={results}
                        onExportPDF={handleExportPDF}
                        onExportCSV={handleExportCSV}
                    />
                );
            case 'thcs':
                return <THCSProgressTab userId={user?.uid || ''} />;
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
            case 'badges':
                return user?.uid ? (
                    <BadgeShowcase
                        studentId={user.uid as string}
                        showLocked={true}
                        title="🏆 Your Badges"
                    />
                ) : (
                    <div style={{ textAlign: 'center', padding: '48px 16px', color: '#6b7280' }}>
                        Please log in to view your badges
                    </div>
                );
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

        return (
            <div style={S.rightSticky}>
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
                    </div>
                </div>
            </div>
        );
    };

    return (
        <StudentLayout
            mobileTitle="Records"
            sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="records" />}
            rightPanel={renderRightPanel()}
        >
            <div style={S.feedHeader}>
                <h1 style={S.feedHeaderTitle}>Academic Record</h1>
                <p style={{ ...S.feedHeaderSubtitle, fontSize: '0.875rem', color: '#6b7280', marginTop: 4, marginBottom: 0 }}>View and analyze your test results and academic progress</p>
            </div>

            {error && (
                <div style={localStyles.alertBox}>
                    <IconAlertCircle />
                    <span>{error}</span>
                </div>
            )}

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
                <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
                    {results.length} result{results.length !== 1 ? 's' : ''} found
                </span>
            </div>

            {!selectedResultId && (
                <div style={{ ...S.filterBar, overflowX: 'auto' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            style={{
                                ...S.filterTab,
                                ...(activeTab === tab.value ? S.filterTabActive : {}),
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            <div style={{
                padding: '16px',
                animation: 'dashFadeIn 200ms ease-out forwards',
            }}>
                {renderContent()}
            </div>
        </StudentLayout>
    );
};

export default AcademicRecordPage;

