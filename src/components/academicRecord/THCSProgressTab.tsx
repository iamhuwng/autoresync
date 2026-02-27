/**
 * THCSProgressTab — Task 12.5
 *
 * THCS/THPT tab for Academic Record page.
 * Shows score trend, test history table, and skill breakdown.
 */

import React, { useState, useEffect } from 'react';
import { Loader } from '@mantine/core';
import { ref, get } from 'firebase/database';
// @ts-ignore
import { database } from '../../services/firebase';

interface ScoreHistoryEntry {
    testId: string;
    testTitle: string;
    scaledScore: number;
    gradeLevel: number;
    examType: string;
    date: number;
}

interface ThcsProgressData {
    testsCompleted: number;
    averageScore: number;
    scoreHistory: ScoreHistoryEntry[];
    skillBreakdown: Record<string, { correct: number; total: number }>;
    lastUpdated: number;
}

interface THCSProgressTabProps {
    userId: string;
}

const SKILL_COLORS: Record<string, string> = {
    pronunciation: '#8b5cf6',
    grammar: '#3b82f6',
    vocabulary: '#10b981',
    reading: '#f59e0b',
    writing: '#ef4444',
};

export const THCSProgressTab: React.FC<THCSProgressTabProps> = ({ userId }) => {
    const [data, setData] = useState<ThcsProgressData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;
        const fetchData = async () => {
            try {
                const snap = await get(ref(database, `academic_records/${userId}`));
                if (snap.exists()) {
                    const record = snap.val();
                    setData(record.thcsProgress || null);
                }
            } catch (err) {
                console.error('Failed to load THCS progress:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [userId]);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 48 }}>
                <Loader />
            </div>
        );
    }

    if (!data || !data.scoreHistory?.length) {
        return (
            <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📚</div>
                <h3 style={{ fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>No THCS/THPT tests completed yet</h3>
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Your scores will appear here after completing THCS-THPT tests.</p>
            </div>
        );
    }

    const sortedHistory = [...data.scoreHistory].sort((a, b) => b.date - a.date);
    const maxScore = Math.max(...data.scoreHistory.map(h => h.scaledScore));

    // SVG score trend
    const trendWidth = 600;
    const trendHeight = 150;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartW = trendWidth - padding.left - padding.right;
    const chartH = trendHeight - padding.top - padding.bottom;

    const points = data.scoreHistory
        .sort((a, b) => a.date - b.date)
        .map((entry, i, arr) => {
            const x = padding.left + (arr.length > 1 ? (i / (arr.length - 1)) * chartW : chartW / 2);
            const y = padding.top + chartH - ((entry.scaledScore / 10) * chartH);
            return { x, y, entry };
        });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Skill breakdown
    const skills = Object.entries(data.skillBreakdown || {});

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ background: '#f5f3ff', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid rgba(139,92,246,0.15)' }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#7c3aed' }}>{data.testsCompleted}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>Tests Completed</div>
                </div>
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#059669' }}>{data.averageScore.toFixed(1)}/10</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>Average Score</div>
                </div>
                <div style={{ background: '#eff6ff', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid rgba(59,130,246,0.15)' }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2563eb' }}>{maxScore.toFixed(1)}/10</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>Best Score</div>
                </div>
            </div>

            {/* Score trend SVG */}
            <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 12px', fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>📈 Score Trend</h4>
                <svg viewBox={`0 0 ${trendWidth} ${trendHeight}`} style={{ width: '100%', height: 'auto' }}>
                    {/* Grid lines */}
                    {[0, 2.5, 5, 7.5, 10].map(v => {
                        const y = padding.top + chartH - (v / 10) * chartH;
                        return (
                            <g key={v}>
                                <line x1={padding.left} y1={y} x2={trendWidth - padding.right} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
                                <text x={padding.left - 8} y={y + 4} fill="#9ca3af" fontSize={10} textAnchor="end">{v}</text>
                            </g>
                        );
                    })}
                    {/* Line */}
                    <path d={linePath} fill="none" stroke="#7c3aed" strokeWidth={2} />
                    {/* Dots */}
                    {points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r={4} fill="#7c3aed" stroke="white" strokeWidth={2}>
                            <title>{`${p.entry.testTitle}: ${p.entry.scaledScore}/10`}</title>
                        </circle>
                    ))}
                </svg>
            </div>

            {/* Skill breakdown */}
            {skills.length > 0 && (
                <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb' }}>
                    <h4 style={{ margin: '0 0 12px', fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>🎯 Skill Breakdown</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {skills.map(([skill, { correct, total }]) => {
                            const pct = total > 0 ? (correct / total) * 100 : 0;
                            const color = SKILL_COLORS[skill] || '#64748b';
                            return (
                                <div key={skill}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'capitalize', color: '#374151' }}>{skill}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{correct}/{total} ({pct.toFixed(0)}%)</span>
                                    </div>
                                    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Test history table */}
            <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 12px', fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>📋 Test History</h4>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>Date</th>
                                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>Test Title</th>
                                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>Grade</th>
                                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>Type</th>
                                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedHistory.map((entry, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>
                                        {new Date(entry.date).toLocaleDateString()}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }}>
                                        {entry.testTitle}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280' }}>
                                        {entry.gradeLevel}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280' }}>
                                        {entry.examType}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                        <span style={{
                                            fontWeight: 700,
                                            color: entry.scaledScore >= 8 ? '#059669' : entry.scaledScore >= 5 ? '#d97706' : '#dc2626',
                                        }}>
                                            {entry.scaledScore.toFixed(1)}/10
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default THCSProgressTab;
