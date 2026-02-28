/**
 * WritingGradingQueuePage — PRD-0030 Task 5.1
 * Displays pending writing submissions for teacher grading.
 * Queries Firestore writing_submissions where markingStatus === 'pending-review',
 * filters client-side for teacher ownership.
 * NO MANTINE.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPendingSubmissions } from '../services/writingSubmissionService';
import { useAuth } from '../hooks/useAuth';
import type { WritingSubmission } from '../types/ielts-writing.types';
import './WritingGradingQueuePage.css';

type ContextFilter = 'all' | 'live-session' | 'solo-practice' | 'homework';
type SortOption = 'newest' | 'oldest';

const PAGE_SIZE = 20;

export default function WritingGradingQueuePage() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [submissions, setSubmissions] = useState<WritingSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [contextFilter, setContextFilter] = useState<ContextFilter>('all');
    const [sortOption, setSortOption] = useState<SortOption>('newest');
    const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

    // Fetch pending submissions
    const fetchSubmissions = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        setError(null);
        try {
            const result = await getPendingSubmissions(user.uid);
            if (result.success && result.data) {
                setSubmissions(result.data);
            } else {
                setError(result.error || 'Failed to load submissions');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unexpected error');
        } finally {
            setLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        fetchSubmissions();
    }, [fetchSubmissions]);

    // Filtered and sorted
    const filtered = useMemo(() => {
        let list = [...submissions];

        // Context filter
        if (contextFilter !== 'all') {
            list = list.filter(s => s.context?.type === contextFilter);
        }

        // Sort
        list.sort((a, b) => {
            if (sortOption === 'newest') return (b.submittedAt || 0) - (a.submittedAt || 0);
            return (a.submittedAt || 0) - (b.submittedAt || 0);
        });

        return list;
    }, [submissions, contextFilter, sortOption]);

    // Paginated
    const paginated = useMemo(() => filtered.slice(0, displayCount), [filtered, displayCount]);
    const hasMore = displayCount < filtered.length;

    const formatTime = (ts?: number) => {
        if (!ts) return '—';
        const d = new Date(ts);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    const getTotalWordCount = (s: WritingSubmission) =>
        (s.tasks || []).reduce((sum, t) => sum + (t.wordCount || 0), 0);

    const getContextClass = (type?: string) => {
        switch (type) {
            case 'live-session': return 'wgq-card-context--live';
            case 'solo-practice': return 'wgq-card-context--solo';
            case 'homework': return 'wgq-card-context--homework';
            default: return '';
        }
    };

    const getContextLabel = (type?: string) => {
        switch (type) {
            case 'live-session': return '🎯 Live';
            case 'solo-practice': return '📝 Solo';
            case 'homework': return '📚 HW';
            default: return type || '—';
        }
    };

    // Render loading
    if (loading) {
        return (
            <div className="wgq-page">
                <div className="wgq-loading">
                    <div className="wgq-spinner" />
                </div>
            </div>
        );
    }

    return (
        <div className="wgq-page">
            <div className="wgq-container">
                {/* Header */}
                <div className="wgq-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h1>✍️ Writing Grading</h1>
                        <span className="wgq-header-badge">
                            {submissions.length} pending
                        </span>
                    </div>
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            color: '#475569',
                        }}
                    >
                        ← Back
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        padding: '1rem',
                        borderRadius: '8px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        marginBottom: '1rem',
                        fontSize: '0.875rem',
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Filters */}
                <div className="wgq-filters">
                    <select
                        className="wgq-filter-select"
                        value={contextFilter}
                        onChange={e => setContextFilter(e.target.value as ContextFilter)}
                    >
                        <option value="all">All Sources</option>
                        <option value="live-session">Live Session</option>
                        <option value="homework">Homework</option>
                        <option value="solo-practice">Solo Practice</option>
                    </select>
                    <select
                        className="wgq-filter-select"
                        value={sortOption}
                        onChange={e => setSortOption(e.target.value as SortOption)}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                </div>

                {/* Submissions List */}
                {paginated.length === 0 ? (
                    <div className="wgq-empty">
                        <div className="wgq-empty-icon">📭</div>
                        <h3>No Pending Reviews</h3>
                        <p>All writing submissions have been graded. Check back later for new submissions.</p>
                    </div>
                ) : (
                    <>
                        {paginated.map(sub => {
                            const studentName = sub.studentName || '[Deleted Student]';
                            const isDeleted = !sub.studentName;
                            const wordCount = getTotalWordCount(sub);
                            const pasteAttempts = sub.pasteAttemptCount || 0;

                            return (
                                <div
                                    key={sub.id}
                                    className="wgq-card"
                                    onClick={() => navigate(`/teacher/grading/writing/${sub.id}`)}
                                >
                                    <div className="wgq-card-header">
                                        <span className={`wgq-card-student ${isDeleted ? 'wgq-card-student--deleted' : ''}`}>
                                            {studentName}
                                        </span>
                                        <span className={`wgq-card-context ${getContextClass(sub.context?.type)}`}>
                                            {getContextLabel(sub.context?.type)}
                                        </span>
                                    </div>

                                    <div className="wgq-card-meta">
                                        <span className="wgq-card-format">
                                            {sub.testMeta?.format === 'full-test' ? 'Full Test' :
                                                sub.testMeta?.format === 'task1-only' ? 'Task 1' : 'Task 2'}
                                        </span>
                                        <span className="wgq-card-meta-item">📝 {wordCount} words</span>
                                        <span className="wgq-card-meta-item">📄 {sub.testMeta?.testTitle || 'Untitled'}</span>
                                        {pasteAttempts > 0 && (
                                            <span className="wgq-card-meta-item wgq-card-paste-warn">
                                                ⚠️ {pasteAttempts} paste attempt{pasteAttempts > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>

                                    <div className="wgq-card-footer">
                                        <span className="wgq-card-time">
                                            Submitted {formatTime(sub.submittedAt)}
                                        </span>
                                        <button
                                            className="wgq-card-action"
                                            onClick={e => { e.stopPropagation(); navigate(`/teacher/grading/writing/${sub.id}`); }}
                                        >
                                            Grade →
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Load More */}
                        {hasMore && (
                            <div className="wgq-load-more">
                                <button onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}>
                                    Load More ({filtered.length - displayCount} remaining)
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
