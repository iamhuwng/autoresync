/**
 * TeacherGradingPage — Grading Tab for THCS writing questions (Task 7.6)
 * PRD §4.5.2: Shows tests with pending writing grading, sorted by deadline
 * Uses TeacherHeader, AppShell, and modern components (following TeacherHomeworkListPage pattern)
 */

import { useState, useEffect, useRef } from 'react';
import { AppShell, Loader, Stack, Text, Center } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { firestore, database } from '../services/firebase';
import { Card, CardBody, Button, Input } from '../components/modern';
import { TeacherHeader } from '../components/navigation';
import { GradingTestCard } from '../components/thcs-grading/GradingTestCard';
import type { GradingTestCardData } from '../components/thcs-grading/GradingTestCard';

type ViewMode = 'by-test' | 'by-question';

export function TeacherGradingPage() {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState<ViewMode>('by-test');
    const [filterNeedsReview, setFilterNeedsReview] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [testCards, setTestCards] = useState<GradingTestCardData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Ref for unsubscribe
    const unsubRef = useRef<(() => void) | null>(null);

    // Load grading data from Firestore/RTDB
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

    // Filter cards
    const filteredCards = testCards.filter(card => {
        const matchesSearch = card.testTitle.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterNeedsReview ? card.pendingWritingQuestions > 0 : true;
        return matchesSearch && matchesFilter;
    });

    const totalPending = testCards.reduce((sum, c) => sum + c.pendingWritingQuestions, 0);

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
                    onLogout={handleLogout}
                />

                <AppShell.Main>
                    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
                        {/* Page Header */}
                        <div style={{ marginBottom: '2.5rem', animation: 'slideDown 0.5s ease-out' }}>
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
                                {totalPending > 0 && (
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        marginLeft: '0.75rem',
                                        padding: '0.15rem 0.6rem',
                                        borderRadius: '9999px',
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        color: 'white',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                    }}>
                                        {totalPending} pending
                                    </span>
                                )}
                            </p>
                        </div>

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

                        {/* Content */}
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
