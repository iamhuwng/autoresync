/**
 * TeacherGradingPage — Grading Tab for all writing grading (THCS + IELTS Writing)
 * PRD §4.5.2: Shows tests with pending writing grading, sorted by deadline
 * PRD-0030: IELTS Writing sub-tab integrated here instead of a separate page
 * Uses TeacherHeader, AppShell, and modern components (following TeacherHomeworkListPage pattern)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AppShell, Loader, Stack, Text, Center } from '@mantine/core';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { firestore, database } from '../services/firebase';
import { FEATURE_IDS } from '../config/featureRegistry';
import { Card, CardBody, Button, Input } from '../components/modern';
import { TeacherHeader } from '../components/navigation';
import { GradingTestCard } from '../components/thcs-grading/GradingTestCard';
import type { GradingTestCardData } from '../components/thcs-grading/GradingTestCard';
// PRD-0030: Writing grading queue
import { getPendingSubmissions } from '../services/writingSubmissionService';
import type { WritingSubmission } from '../types/ielts-writing.types';

type ViewMode = 'by-test' | 'by-question';
type GradingTab = 'thcs' | 'writing';
type ContextFilter = 'all' | 'live-session' | 'solo-practice' | 'homework';
type SortOption = 'newest' | 'oldest';

export function TeacherGradingPage() {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const { trackAction } = useFeatureTracking(FEATURE_IDS.grading);
    const navigate = useNavigate();
    const location = useLocation();

    // Determine initial tab from URL or location state
    const initialTab: GradingTab = location.pathname.includes('/teacher/grading/writing') ||
        (location.state as any)?.tab === 'writing' ? 'writing' : 'thcs';

    const [gradingTab, setGradingTab] = useState<GradingTab>(initialTab);
    const [viewMode, setViewMode] = useState<ViewMode>('by-test');
    const [filterNeedsReview, setFilterNeedsReview] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [testCards, setTestCards] = useState<GradingTestCardData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // PRD-0030: Writing grading state
    const [writingSubmissions, setWritingSubmissions] = useState<WritingSubmission[]>([]);
    const [writingLoading, setWritingLoading] = useState(false);
    const [writingError, setWritingError] = useState<string | null>(null);
    const [contextFilter, setContextFilter] = useState<ContextFilter>('all');
    const [sortOption, setSortOption] = useState<SortOption>('newest');

    // Ref for unsubscribe
    const unsubRef = useRef<(() => void) | null>(null);

    // Load THCS grading data from Firestore/RTDB
    useEffect(() => {
        if (!user?.uid) return;

        const loadGradingData = async () => {
            try {
                setLoading(true);

                // Query game_sessions where teacherId === current user
                const sessionsRef = collection(firestore, 'game_sessions');
                const q = query(sessionsRef, where('teacherId', '==', user.uid));
                const snapshot = await getDocs(q);

                const cards: GradingTestCardData[] = [];

                for (const doc of snapshot.docs) {
                    const session = doc.data();
                    if (!session.testId) continue;

                    // Check if this is a THCS test
                    const testSnap = await get(ref(database, `tests/${session.testId}/testType`));
                    if (!testSnap.exists() || testSnap.val() !== 'THCS-THPT') continue;

                    // Get test title
                    const titleSnap = await get(ref(database, `tests/${session.testId}/title`));
                    const testTitle = titleSnap.exists() ? titleSnap.val() : 'Untitled Test';

                    // Get results for this session
                    const resultsSnap = await get(ref(database, `game_sessions/${session.sessionCode}/results`));
                    const results = resultsSnap.exists() ? resultsSnap.val() : {};

                    let totalStudents = 0;
                    let submittedStudents = 0;
                    let totalWritingQuestions = 0;
                    let gradedWritingQuestions = 0;
                    let pendingWritingQuestions = 0;

                    if (session.players) {
                        totalStudents = Object.keys(session.players).length;
                    }

                    // Count writing grading status
                    for (const studentId of Object.keys(results)) {
                        const studentResult = results[studentId];
                        if (!studentResult) continue;
                        submittedStudents++;

                        const qResults = studentResult.questionResults || {};
                        for (const qr of Object.values(qResults)) {
                            const qrData = qr as any;
                            if (qrData?.writingResult) {
                                totalWritingQuestions++;
                                const tier = qrData.writingResult.gradingTier;
                                if (tier === 'teacher-graded' || tier === 'auto-correct' || tier === 'ai-correct') {
                                    gradedWritingQuestions++;
                                } else {
                                    pendingWritingQuestions++;
                                }
                            }
                        }
                    }

                    // Only include tests that have writing questions
                    if (totalWritingQuestions > 0) {
                        cards.push({
                            testId: session.testId,
                            testTitle,
                            sessionCode: session.sessionCode || doc.id,
                            totalStudents,
                            submittedStudents,
                            totalWritingQuestions,
                            gradedWritingQuestions,
                            pendingWritingQuestions,
                            deadline: session.deadline || undefined,
                        });
                    }
                }

                // Sort by deadline (approaching first), then by pending count
                cards.sort((a, b) => {
                    // Tests with deadlines first
                    if (a.deadline && b.deadline) return a.deadline - b.deadline;
                    if (a.deadline) return -1;
                    if (b.deadline) return 1;
                    // Then by pending count (higher first)
                    return b.pendingWritingQuestions - a.pendingWritingQuestions;
                });

                setTestCards(cards);
                setError(null);
            } catch (err) {
                console.error('Error loading grading data:', err);
                setError('Failed to load grading data');
            } finally {
                setLoading(false);
            }
        };

        loadGradingData();

        return () => {
            if (unsubRef.current) {
                unsubRef.current();
            }
        };
    }, [user?.uid]);

    // PRD-0030: Load writing submissions
    const fetchWritingSubmissions = useCallback(async () => {
        if (!user?.uid) return;
        setWritingLoading(true);
        setWritingError(null);
        try {
            const result = await getPendingSubmissions(user.uid);
            if (result.success && result.data) {
                setWritingSubmissions(result.data);
            } else {
                setWritingError(result.error || 'Failed to load submissions');
            }
        } catch (err) {
            setWritingError(err instanceof Error ? err.message : 'Unexpected error');
        } finally {
            setWritingLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        if (gradingTab === 'writing') {
            fetchWritingSubmissions();
        }
    }, [gradingTab, fetchWritingSubmissions]);

    // Writing: filtered and sorted
    const filteredWriting = useMemo(() => {
        let list = [...writingSubmissions];
        if (contextFilter !== 'all') {
            list = list.filter(s => s.context?.type === contextFilter);
        }
        list.sort((a, b) => {
            if (sortOption === 'newest') return (b.submittedAt || 0) - (a.submittedAt || 0);
            return (a.submittedAt || 0) - (b.submittedAt || 0);
        });
        return list;
    }, [writingSubmissions, contextFilter, sortOption]);

    const handleLogout = async () => {
        try {
            await logout();
            sessionStorage.removeItem('isAdmin');
            navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const handleOpenGrading = (sessionCode: string) => {
        // Navigate to test monitor page for grading
        navigate(`/teacher-test/${sessionCode}`);
    };

    // Filter THCS cards
    const filteredCards = testCards.filter(card => {
        const matchesSearch = card.testTitle.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterNeedsReview ? card.pendingWritingQuestions > 0 : true;
        return matchesSearch && matchesFilter;
    });

    const totalPending = testCards.reduce((sum, c) => sum + c.pendingWritingQuestions, 0);

    // Writing helpers
    const formatTime = (ts?: number) => {
        if (!ts) return '—';
        const d = new Date(ts);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    const getTotalWordCount = (s: WritingSubmission) =>
        (s.tasks || []).reduce((sum, t) => sum + (t.wordCount || 0), 0);

    const getContextLabel = (type?: string) => {
        switch (type) {
            case 'live-session': return '🎯 Live';
            case 'solo-practice': return '📝 Solo';
            case 'homework': return '📚 HW';
            default: return type || '—';
        }
    };

    const getWritingQueueState = (submission: WritingSubmission) => {
        if (submission.gradingDraftMeta?.ownerTeacherId) {
            if (submission.gradingDraftMeta.ownerTeacherId === user?.uid) {
                return {
                    label: 'draft-in-progress',
                    accent: '#2563eb',
                    background: 'rgba(37, 99, 235, 0.12)',
                    actionable: true,
                    cta: 'Resume Draft',
                };
            }

            return {
                label: 'lock conflict',
                accent: '#b45309',
                background: 'rgba(245, 158, 11, 0.14)',
                actionable: true,
                cta: 'View Conflict',
            };
        }

        return {
            label: 'pending-review',
            accent: '#ea580c',
            background: 'rgba(249, 115, 22, 0.12)',
            actionable: true,
            cta: 'Grade',
        };
    };

    const openWritingSubmission = useCallback((submission: WritingSubmission, source: 'card' | 'button') => {
        trackAction('openSubmission', {
            source: `teacher_grading_queue_${source}`,
            submissionId: submission.id,
            queueState: getWritingQueueState(submission).label,
            contextType: submission.context?.type,
        });

        navigateTo(
            'TEACHER_GRADING_DETAIL',
            { submissionId: submission.id },
            { reason: 'teacher_open_writing_submission' },
        );
    }, [navigateTo, trackAction, user?.uid]);

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
                backgroundAttachment: 'fixed',
            }}
        >
            <AppShell padding="md">
                <TeacherHeader
                    pageTitle="Grading"
                    userId={user?.uid}
                    userRole={profile?.role}
                    userDisplayName={profile?.displayName || user?.displayName || user?.email}
                    userEmail={profile?.email || user?.email}
                    userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                    onLogout={handleLogout}
                />

                <AppShell.Main>
                    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
                        {/* Page Header */}
                        <div style={{ marginBottom: '1.5rem', animation: 'slideDown 0.5s ease-out' }}>
                            <h1
                                style={{
                                    fontSize: '2.5rem',
                                    fontWeight: '800',
                                    marginBottom: '0.5rem',
                                    color: '#1e293b',
                                }}
                            >
                                📝 Grading
                            </h1>
                            <p style={{ fontSize: '1rem', color: '#64748b' }}>
                                Review and grade student writing answers
                            </p>
                        </div>

                        {/* Sub-tabs: THCS vs Writing */}
                        <div style={{
                            display: 'flex',
                            gap: '0.5rem',
                            marginBottom: '1.5rem',
                            animation: 'slideUp 0.4s ease-out 0.05s backwards',
                        }}>
                            <button
                                onClick={() => setGradingTab('thcs')}
                                style={{
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: '0.75rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.9375rem',
                                    fontWeight: gradingTab === 'thcs' ? '700' : '500',
                                    background: gradingTab === 'thcs'
                                        ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                                        : 'rgba(255, 255, 255, 0.8)',
                                    color: gradingTab === 'thcs' ? '#fff' : '#64748b',
                                    boxShadow: gradingTab === 'thcs'
                                        ? '0 4px 12px rgba(139, 92, 246, 0.3)'
                                        : '0 1px 3px rgba(0,0,0,0.05)',
                                    transition: 'all 0.2s ease',
                                    backdropFilter: 'blur(8px)',
                                }}
                            >
                                🇻🇳 THCS Grading
                                {totalPending > 0 && (
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        marginLeft: '0.5rem',
                                        padding: '0.1rem 0.5rem',
                                        borderRadius: '9999px',
                                        background: gradingTab === 'thcs' ? 'rgba(255,255,255,0.3)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        color: gradingTab === 'thcs' ? '#fff' : '#fff',
                                        fontSize: '0.6875rem',
                                        fontWeight: '700',
                                    }}>{totalPending}</span>
                                )}
                            </button>
                            <button
                                onClick={() => setGradingTab('writing')}
                                style={{
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: '0.75rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.9375rem',
                                    fontWeight: gradingTab === 'writing' ? '700' : '500',
                                    background: gradingTab === 'writing'
                                        ? 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)'
                                        : 'rgba(255, 255, 255, 0.8)',
                                    color: gradingTab === 'writing' ? '#fff' : '#64748b',
                                    boxShadow: gradingTab === 'writing'
                                        ? '0 4px 12px rgba(234, 88, 12, 0.3)'
                                        : '0 1px 3px rgba(0,0,0,0.05)',
                                    transition: 'all 0.2s ease',
                                    backdropFilter: 'blur(8px)',
                                }}
                            >
                                ✍️ IELTS Writing
                                {writingSubmissions.length > 0 && (
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        marginLeft: '0.5rem',
                                        padding: '0.1rem 0.5rem',
                                        borderRadius: '9999px',
                                        background: gradingTab === 'writing' ? 'rgba(255,255,255,0.3)' : 'linear-gradient(135deg, #ea580c, #f97316)',
                                        color: '#fff',
                                        fontSize: '0.6875rem',
                                        fontWeight: '700',
                                    }}>{writingSubmissions.length}</span>
                                )}
                            </button>
                        </div>

                        {/* ═════════════════════════ THCS TAB ═════════════════════════ */}
                        {gradingTab === 'thcs' && (
                            <>
                                {/* Search and Filters */}
                                <Card
                                    variant="glass"
                                    style={{
                                        marginBottom: '2rem',
                                        animation: 'slideUp 0.5s ease-out 0.1s backwards',
                                    }}
                                >
                                    <CardBody>
                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: '1rem',
                                                alignItems: 'flex-end',
                                                flexWrap: 'wrap',
                                            }}
                                        >
                                            <div style={{ flex: '1 1 300px' }}>
                                                <Input
                                                    placeholder="🔍 Search tests..."
                                                    value={searchQuery}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                                    variant="default"
                                                />
                                            </div>

                                            {/* View Mode Toggle */}
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <Button
                                                    variant={viewMode === 'by-test' ? 'primary' : 'glass'}
                                                    onClick={() => setViewMode('by-test')}
                                                    size="sm"
                                                >
                                                    By Test
                                                </Button>
                                                <Button
                                                    variant={viewMode === 'by-question' ? 'primary' : 'glass'}
                                                    onClick={() => setViewMode('by-question')}
                                                    size="sm"
                                                >
                                                    By Question
                                                </Button>
                                            </div>

                                            {/* Needs Review Toggle */}
                                            <Button
                                                variant={filterNeedsReview ? 'primary' : 'glass'}
                                                onClick={() => setFilterNeedsReview(!filterNeedsReview)}
                                                size="sm"
                                                style={filterNeedsReview ? {
                                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                } : {}}
                                            >
                                                {filterNeedsReview ? '⚠️ Needs Review' : 'Needs Review'}
                                            </Button>
                                        </div>
                                    </CardBody>
                                </Card>

                                {/* THCS Content */}
                                {loading ? (
                                    <Card
                                        variant="default"
                                        style={{
                                            textAlign: 'center',
                                            padding: '4rem 2rem',
                                            animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                                        }}
                                    >
                                        <Center>
                                            <Stack align="center" gap="md">
                                                <Loader size="xl" color="violet" type="bars" />
                                                <Text fw={500} c="dimmed">Loading grading data...</Text>
                                            </Stack>
                                        </Center>
                                    </Card>
                                ) : error ? (
                                    <Card
                                        variant="default"
                                        style={{
                                            textAlign: 'center',
                                            padding: '4rem 2rem',
                                            animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                                        }}
                                    >
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                                        <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#dc2626' }}>
                                            {error}
                                        </h2>
                                        <Button variant="primary" onClick={() => window.location.reload()} style={{ marginTop: '1rem' }}>
                                            🔄 Retry
                                        </Button>
                                    </Card>
                                ) : filteredCards.length === 0 ? (
                                    <Card
                                        variant="default"
                                        style={{
                                            textAlign: 'center',
                                            padding: '4rem 2rem',
                                            animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                                        }}
                                    >
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                                            {filterNeedsReview ? '✅' : '📝'}
                                        </div>
                                        <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1e293b' }}>
                                            {filterNeedsReview
                                                ? 'All caught up!'
                                                : 'No tests with writing questions'}
                                        </h2>
                                        <p style={{ fontSize: '1rem', color: '#64748b' }}>
                                            {filterNeedsReview
                                                ? 'No tests need grading at the moment'
                                                : searchQuery
                                                    ? 'Try adjusting your search'
                                                    : 'Tests with writing questions will appear here after students submit'}
                                        </p>
                                    </Card>
                                ) : (
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '1rem',
                                        }}
                                    >
                                        {filteredCards.map((card, index) => (
                                            <div
                                                key={`${card.testId}-${card.sessionCode}`}
                                                style={{ animation: `slideUp 0.5s ease-out ${index * 0.05}s backwards` }}
                                            >
                                                <GradingTestCard
                                                    data={card}
                                                    onOpenGrading={handleOpenGrading}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {/* ═════════════════════════ WRITING TAB ═════════════════════════ */}
                        {gradingTab === 'writing' && (
                            <div style={{ animation: 'slideUp 0.4s ease-out 0.05s backwards' }}>
                                {/* Writing Filters */}
                                <Card variant="glass" style={{ marginBottom: '1.5rem' }}>
                                    <CardBody>
                                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '500' }}>Source:</span>
                                                <select
                                                    value={contextFilter}
                                                    onChange={e => setContextFilter(e.target.value as ContextFilter)}
                                                    style={{
                                                        padding: '0.4rem 0.75rem',
                                                        borderRadius: '0.5rem',
                                                        border: '1px solid #e2e8f0',
                                                        background: '#fff',
                                                        fontSize: '0.875rem',
                                                        color: '#334155',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <option value="all">All Sources</option>
                                                    <option value="live-session">Live Session</option>
                                                    <option value="homework">Homework</option>
                                                    <option value="solo-practice">Solo Practice</option>
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '500' }}>Sort:</span>
                                                <select
                                                    value={sortOption}
                                                    onChange={e => setSortOption(e.target.value as SortOption)}
                                                    style={{
                                                        padding: '0.4rem 0.75rem',
                                                        borderRadius: '0.5rem',
                                                        border: '1px solid #e2e8f0',
                                                        background: '#fff',
                                                        fontSize: '0.875rem',
                                                        color: '#334155',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <option value="newest">Newest First</option>
                                                    <option value="oldest">Oldest First</option>
                                                </select>
                                            </div>
                                            <div style={{ marginLeft: 'auto' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: '0.25rem 0.75rem',
                                                    borderRadius: '9999px',
                                                    background: writingSubmissions.length > 0
                                                        ? 'linear-gradient(135deg, #ea580c, #f97316)'
                                                        : 'rgba(34, 197, 94, 0.1)',
                                                    color: writingSubmissions.length > 0 ? '#fff' : '#16a34a',
                                                    fontSize: '0.8125rem',
                                                    fontWeight: '700',
                                                }}>
                                                    {writingSubmissions.length > 0
                                                        ? `${writingSubmissions.length} pending`
                                                        : '✅ All clear'}
                                                </span>
                                            </div>
                                        </div>
                                    </CardBody>
                                </Card>

                                {/* Writing Content */}
                                {writingLoading ? (
                                    <Card variant="default" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                                        <Center>
                                            <Stack align="center" gap="md">
                                                <Loader size="xl" color="orange" type="bars" />
                                                <Text fw={500} c="dimmed">Loading writing submissions...</Text>
                                            </Stack>
                                        </Center>
                                    </Card>
                                ) : writingError ? (
                                    <Card variant="default" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                                        <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#dc2626' }}>
                                            {writingError}
                                        </h2>
                                        <Button variant="primary" onClick={fetchWritingSubmissions} style={{ marginTop: '1rem' }}>
                                            🔄 Retry
                                        </Button>
                                    </Card>
                                ) : filteredWriting.length === 0 ? (
                                    <Card variant="default" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                                        <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1e293b' }}>
                                            No Pending Reviews
                                        </h2>
                                        <p style={{ fontSize: '1rem', color: '#64748b' }}>
                                            All writing submissions have been graded. Check back later for new submissions.
                                        </p>
                                    </Card>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {filteredWriting.map((sub, index) => {
                                            const studentName = sub.studentName || '[Deleted Student]';
                                            const isDeleted = !sub.studentName;
                                            const wordCount = getTotalWordCount(sub);
                                            const pasteAttempts = sub.pasteAttemptCount || 0;
                                            const queueState = getWritingQueueState(sub);

                                            return (
                                                <Card
                                                    key={sub.id}
                                                    variant="glass"
                                                    hover
                                                    onClick={() => openWritingSubmission(sub, 'card')}
                                                    style={{
                                                        cursor: 'pointer',
                                                        animation: `slideUp 0.4s ease-out ${index * 0.04}s backwards`,
                                                        border: '1px solid rgba(234, 88, 12, 0.15)',
                                                    }}
                                                >
                                                    <CardBody>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                                                            {/* Student + Context */}
                                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                                    <span style={{
                                                                        fontSize: '1rem',
                                                                        fontWeight: '700',
                                                                        color: isDeleted ? '#94a3b8' : '#1e293b',
                                                                        fontStyle: isDeleted ? 'italic' : 'normal',
                                                                    }}>
                                                                        {studentName}
                                                                    </span>
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        padding: '0.125rem 0.5rem',
                                                                        borderRadius: '9999px',
                                                                        fontSize: '0.6875rem',
                                                                        fontWeight: '700',
                                                                        background: sub.context?.type === 'live-session' ? 'rgba(34, 197, 94, 0.12)' :
                                                                            sub.context?.type === 'homework' ? 'rgba(59, 130, 246, 0.12)' :
                                                                                'rgba(168, 85, 247, 0.12)',
                                                                        color: sub.context?.type === 'live-session' ? '#16a34a' :
                                                                            sub.context?.type === 'homework' ? '#2563eb' :
                                                                                '#9333ea',
                                                                    }}>
                                                                        {getContextLabel(sub.context?.type)}
                                                                    </span>
                                                                </div>
                                                                {/* Meta badges */}
                                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        padding: '0.125rem 0.5rem',
                                                                        borderRadius: '9999px',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: '600',
                                                                        background: 'rgba(249, 115, 22, 0.1)',
                                                                        color: '#ea580c',
                                                                    }}>
                                                                        {sub.testMeta?.format === 'full-test' ? 'Full Test' :
                                                                            sub.testMeta?.format === 'task1-only' ? 'Task 1' : 'Task 2'}
                                                                    </span>
                                                                    <span style={{
                                                                        fontSize: '0.8125rem',
                                                                        color: '#64748b',
                                                                    }}>
                                                                        📝 {wordCount} words
                                                                    </span>
                                                                    <span style={{
                                                                        fontSize: '0.8125rem',
                                                                        color: '#64748b',
                                                                    }}>
                                                                        📄 {sub.testMeta?.testTitle || 'Untitled'}
                                                                    </span>
                                                                    {pasteAttempts > 0 && (
                                                                        <span style={{
                                                                            fontSize: '0.8125rem',
                                                                            color: '#dc2626',
                                                                            fontWeight: '600',
                                                                        }}>
                                                                            ⚠️ {pasteAttempts} paste attempt{pasteAttempts > 1 ? 's' : ''}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Right: time + action */}
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    padding: '0.18rem 0.6rem',
                                                                    borderRadius: '9999px',
                                                                    fontSize: '0.6875rem',
                                                                    fontWeight: '700',
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.04em',
                                                                    background: queueState.background,
                                                                    color: queueState.accent,
                                                                }}>
                                                                    {queueState.label}
                                                                </span>
                                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                                    {formatTime(sub.submittedAt)}
                                                                </span>
                                                                <Button
                                                                    variant="primary"
                                                                    size="sm"
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        openWritingSubmission(sub, 'button');
                                                                    }}
                                                                    style={{
                                                                        background: 'linear-gradient(135deg, #ea580c, #f97316)',
                                                                        fontSize: '0.8125rem',
                                                                    }}
                                                                >
                                                                    {queueState.cta} →
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </CardBody>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </AppShell.Main>
            </AppShell>

            {/* Animations */}
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}

export default TeacherGradingPage;
