/**
 * StudentHomeworkProfile – PRD-0034 Task 13.4
 *
 * Teacher-facing page showing a single student's homework history:
 *   • Summary header with completion rate, avg score, late count
 *   • List of homework cards with status, score, attempts, date
 *   • Click to expand and see all attempts per homework
 *   • Load More pagination (AC-9.7)
 */
import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useStudentHomework } from '../hooks/useStudentHomework';
import { Card, CardBody, Button, VanillaLoader } from '../components/modern';
import { TeacherHeader } from '../components/navigation';
import './StudentHomeworkProfile.css';

/* ─────────── helpers ─────────── */
function fmtDate(ts?: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function statusLabel(status: string): { text: string; bg: string; color: string } {
    switch (status) {
        case 'submitted':
        case 'graded':
            return { text: '✅ Submitted', bg: 'rgba(16,185,129,0.12)', color: '#047857' };
        case 'in_progress':
            return { text: '🔄 In Progress', bg: 'rgba(99,102,241,0.12)', color: '#4338ca' };
        case 'not_started':
        default:
            return { text: '⏳ Not Started', bg: 'rgba(148,163,184,0.12)', color: '#64748b' };
    }
}

/* ─────────── component ─────────── */
function StudentHomeworkProfile() {
    const { studentId } = useParams<{ studentId: string }>();
    const { user, profile, logout } = useAuth();
    const { groups, loading, error, loadMore, hasMore, summary } = useStudentHomework(studentId ?? '');
    const [expandedHw, setExpandedHw] = useState<Set<string>>(new Set());

    const toggleExpand = useCallback((hwId: string) => {
        setExpandedHw((prev) => {
            const next = new Set(prev);
            if (next.has(hwId)) next.delete(hwId);
            else next.add(hwId);
            return next;
        });
    }, []);

    if (!studentId) {
        return <div className="shp-error">Invalid student ID.</div>;
    }

    /* ── stat chip helper ── */
    const statChip = (icon: string, value: string | number, label: string, color: string, bg: string) => (
        <div className="shp-stat-chip" style={{ background: bg }}>
            <span className="shp-stat-icon">{icon}</span>
            <span className="shp-stat-value" style={{ color }}>{value}</span>
            <span className="shp-stat-label">{label}</span>
        </div>
    );

    return (
        <div className="shp-root">
            <TeacherHeader
                pageTitle="Student Homework Profile"
                userId={user?.uid}
                userDisplayName={profile?.displayName}
                userEmail={user?.email ?? undefined}
                onLogout={logout}
            />

            <div className="shp-container">
                {/* Breadcrumb */}
                <div className="shp-breadcrumb">
                    <Link to="/teacher/homework" className="shp-breadcrumb-link">← Homework</Link>
                    <span className="shp-breadcrumb-sep">/</span>
                    <span className="shp-breadcrumb-current">Student Profile</span>
                </div>

                {/* Header */}
                <Card variant="glass" hover={false} style={{ marginBottom: '1.5rem' }}>
                    <CardBody>
                        <h1 className="shp-title">🎓 Student Homework Profile</h1>

                        {loading && groups.length === 0 ? (
                            <VanillaLoader />
                        ) : error ? (
                            <div className="shp-error-inline">⚠️ {error}</div>
                        ) : (
                            <div className="shp-stat-row">
                                {statChip('📋', summary.totalHomework, 'Total Homework', '#4338ca', 'rgba(99,102,241,0.1)')}
                                {statChip('✅', `${summary.completionRate}%`, 'Completion', '#047857', 'rgba(16,185,129,0.1)')}
                                {statChip('🏆', summary.avgScore > 0 ? `${summary.avgScore}%` : '—', 'Avg Score', '#b45309', 'rgba(245,158,11,0.1)')}
                                {statChip('⏰', summary.lateCount, 'Late', summary.lateCount > 0 ? '#b91c1c' : '#64748b', summary.lateCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.06)')}
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* Homework list */}
                {groups.length === 0 && !loading ? (
                    <Card variant="default" hover={false}>
                        <CardBody>
                            <div className="shp-empty">No homework submissions found for this student.</div>
                        </CardBody>
                    </Card>
                ) : (
                    <div className="shp-group-list">
                        {groups.map(({ homework: hw, submissions: subs }) => {
                            const isExpanded = expandedHw.has(hw.id);
                            const best = subs.reduce<number | null>((max, s) => {
                                const p = s.percentage ?? s.score;
                                if (typeof p !== 'number') return max;
                                return max === null ? p : Math.max(max, p);
                            }, null);
                            const latestSub = subs[0];
                            const status = latestSub ? statusLabel(latestSub.status) : statusLabel('not_started');

                            return (
                                <Card key={hw.id} variant="default" hover style={{ cursor: 'pointer' }}>
                                    <CardBody>
                                        <div className="shp-hw-row" onClick={() => toggleExpand(hw.id)}>
                                            <div className="shp-hw-info">
                                                <div className="shp-hw-title">
                                                    {hw.title || hw.materialTitle}
                                                </div>
                                                <div className="shp-hw-meta">
                                                    Due {fmtDate(hw.scheduling.dueDate)}
                                                    {latestSub?.isLate && (
                                                        <span className="shp-late-badge">Late</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="shp-hw-right">
                                                <span className="shp-hw-status" style={{ background: status.bg, color: status.color }}>
                                                    {status.text}
                                                </span>
                                                {best !== null && (
                                                    <span className="shp-hw-score">{Math.round(best)}%</span>
                                                )}
                                                <span className="shp-hw-attempts">{subs.length} attempt{subs.length !== 1 ? 's' : ''}</span>
                                                <span className={`shp-hw-chevron ${isExpanded ? 'expanded' : ''}`}>▼</span>
                                            </div>
                                        </div>

                                        {/* Expanded attempts */}
                                        {isExpanded && (
                                            <div className="shp-attempts-list">
                                                {subs.map((s, i) => (
                                                    <div key={s.id} className="shp-attempt-row">
                                                        <span className="shp-attempt-num">Attempt #{s.attemptNumber || i + 1}</span>
                                                        <span className="shp-attempt-score">
                                                            {typeof s.percentage === 'number' ? `${Math.round(s.percentage)}%` : typeof s.score === 'number' ? s.score : '—'}
                                                        </span>
                                                        <span className="shp-attempt-date">{fmtDate(s.submittedAt)}</span>
                                                        {s.isLate && <span className="shp-late-badge">Late</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardBody>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* Load more */}
                {hasMore && (
                    <div className="shp-load-more">
                        <Button
                            variant="outline"
                            onClick={loadMore}
                            loading={loading}
                        >
                            Load More
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default StudentHomeworkProfile;
