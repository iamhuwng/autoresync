/**
 * WritingTestResultsSection — PRD-0030 Task 6.5
 * Writing-specific results view for TeacherTestResultsPage.
 * Shows writing-specific columns: Student, Overall Band, T1 Band, T2 Band, Status, Submitted At.
 * Row click → WritingResultDetailModal.
 * NO MANTINE.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSubmissionsBySession } from '../../services/writingSubmissionService';
import type { WritingSubmission } from '../../types/ielts-writing.types';
import WritingResultDetailModal from './WritingResultDetailModal';

interface WritingTestResultsSectionProps {
    sessionCode: string;
    testTitle: string;
}

export default function WritingTestResultsSection({
    sessionCode,
    testTitle,
}: WritingTestResultsSectionProps) {
    const navigate = useNavigate();
    const [submissions, setSubmissions] = useState<WritingSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState<WritingSubmission | null>(null);
    const [sortField, setSortField] = useState<'name' | 'band' | 'status' | 'date'>('date');
    const [sortAsc, setSortAsc] = useState(false);

    useEffect(() => {
        loadSubmissions();
    }, [sessionCode]);

    const loadSubmissions = async () => {
        setLoading(true);
        const result = await getSubmissionsBySession(sessionCode);
        if (result.success && result.data) {
            setSubmissions(result.data);
        }
        setLoading(false);
    };

    const handleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(false);
        }
    };

    const sorted = [...submissions].sort((a, b) => {
        let aVal: number | string;
        let bVal: number | string;
        switch (sortField) {
            case 'name': aVal = a.studentName; bVal = b.studentName; break;
            case 'band': aVal = a.grading?.overallBand ?? -1; bVal = b.grading?.overallBand ?? -1; break;
            case 'status': aVal = a.markingStatus; bVal = b.markingStatus; break;
            case 'date': aVal = a.submittedAt; bVal = b.submittedAt; break;
            default: return 0;
        }
        if (aVal < bVal) return sortAsc ? -1 : 1;
        if (aVal > bVal) return sortAsc ? 1 : -1;
        return 0;
    });

    // Stats
    const gradedCount = submissions.filter(s => s.markingStatus === 'graded').length;
    const avgBand = gradedCount > 0
        ? submissions
            .filter(s => s.grading)
            .reduce((sum, s) => sum + (s.grading?.overallBand ?? 0), 0) / gradedCount
        : 0;

    if (loading) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '50vh', fontFamily: "'Inter', sans-serif",
            }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                    Loading writing submissions...
                </div>
            </div>
        );
    }

    const thStyle: React.CSSProperties = {
        padding: '12px 16px',
        textAlign: 'left',
        fontSize: '0.8rem',
        fontWeight: 600,
        color: '#64748b',
        cursor: 'pointer',
        userSelect: 'none',
    };

    const tdStyle: React.CSSProperties = {
        padding: '12px 16px',
        fontSize: '0.85rem',
        color: '#1e293b',
    };

    const arrow = (field: typeof sortField) =>
        sortField === field ? (sortAsc ? ' ↑' : ' ↓') : '';

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, rgba(250,245,255,0.95), rgba(240,249,255,0.95), rgba(240,253,250,0.95))',
            padding: '2rem',
            fontFamily: "'Inter', sans-serif",
        }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '2rem',
                }}>
                    <div>
                        <h1 style={{
                            margin: 0, fontSize: '1.8rem', fontWeight: 800,
                            background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}>
                            ✍️ Writing Results
                        </h1>
                        <div style={{ fontSize: '1rem', color: '#64748b', fontWeight: 500, marginTop: '0.25rem' }}>
                            {testTitle} • Session: {sessionCode}
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/sessions')}
                        style={{
                            padding: '8px 16px', borderRadius: '8px',
                            border: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.8)',
                            color: '#475569', fontSize: '0.85rem', cursor: 'pointer',
                            fontWeight: 500,
                        }}
                    >
                        ← Back to Sessions
                    </button>
                </div>

                {/* Stats */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '1rem', marginBottom: '2rem',
                }}>
                    {[
                        { label: 'Total Submissions', value: submissions.length.toString(), color: '#8b5cf6' },
                        { label: 'Graded', value: `${gradedCount}/${submissions.length}`, color: '#10b981' },
                        { label: 'Avg Band', value: avgBand > 0 ? avgBand.toFixed(1) : '—', color: '#06b6d4' },
                        { label: 'Pending', value: (submissions.length - gradedCount).toString(), color: '#f59e0b' },
                    ].map(stat => (
                        <div key={stat.label} style={{
                            padding: '1.25rem', borderRadius: '12px',
                            background: 'rgba(255,255,255,0.8)', border: '1px solid #e2e8f0',
                            backdropFilter: 'blur(8px)', textAlign: 'center',
                        }}>
                            <div style={{
                                fontSize: '0.65rem', color: '#64748b',
                                textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px',
                            }}>
                                {stat.label}
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: stat.color }}>
                                {stat.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Table */}
                <div style={{
                    background: 'rgba(255,255,255,0.9)', borderRadius: '12px',
                    border: '1px solid #e2e8f0', overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0',
                        fontWeight: 700, fontSize: '1rem', color: '#0f172a',
                    }}>
                        Individual Results
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={thStyle} onClick={() => handleSort('name')}>
                                        Student{arrow('name')}
                                    </th>
                                    <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => handleSort('band')}>
                                        Overall Band{arrow('band')}
                                    </th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>T1 Band</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>T2 Band</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => handleSort('status')}>
                                        Status{arrow('status')}
                                    </th>
                                    <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => handleSort('date')}>
                                        Submitted{arrow('date')}
                                    </th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map(sub => {
                                    const t1 = sub.grading?.perTask.find(t => t.taskNumber === 1);
                                    const t2 = sub.grading?.perTask.find(t => t.taskNumber === 2);

                                    return (
                                        <tr
                                            key={sub.id}
                                            style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s',
                                            }}
                                            onClick={() => setSelectedSubmission(sub)}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                                        >
                                            <td style={tdStyle}>
                                                <span style={{ fontWeight: 600 }}>{sub.studentName}</span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                {sub.grading ? (
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: '6px',
                                                        background: '#eff6ff', color: '#1d4ed8',
                                                        fontWeight: 700, fontSize: '0.85rem',
                                                    }}>
                                                        {sub.grading.overallBand.toFixed(1)}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center', color: '#475569' }}>
                                                {t1?.isVoided ? 'Voided' : t1?.taskBand ?? '—'}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center', color: '#475569' }}>
                                                {t2?.isVoided ? 'Voided' : t2?.taskBand ?? '—'}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '3px 8px', borderRadius: '6px',
                                                    fontSize: '0.7rem', fontWeight: 600,
                                                    background: sub.markingStatus === 'graded' ? '#dcfce7' : '#fef3c7',
                                                    color: sub.markingStatus === 'graded' ? '#16a34a' : '#d97706',
                                                }}>
                                                    {sub.markingStatus === 'graded' ? 'Graded' : 'Pending'}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                                                {new Date(sub.submittedAt).toLocaleDateString()}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                {sub.markingStatus === 'pending-review' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/teacher/grading/writing/${sub.id}`);
                                                        }}
                                                        style={{
                                                            padding: '4px 10px', borderRadius: '6px',
                                                            border: '1px solid #3b82f6', background: '#eff6ff',
                                                            color: '#1d4ed8', fontSize: '0.75rem',
                                                            fontWeight: 600, cursor: 'pointer',
                                                        }}
                                                    >
                                                        Grade →
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {submissions.length === 0 && (
                        <div style={{
                            padding: '3rem', textAlign: 'center', color: '#94a3b8',
                        }}>
                            No writing submissions found for this session.
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Modal */}
            {selectedSubmission && (
                <WritingResultDetailModal
                    submission={selectedSubmission}
                    onClose={() => setSelectedSubmission(null)}
                />
            )}
        </div>
    );
}
