/**
 * GradingAuditTrail — PRD-0030 Task 5.8
 * Collapsible section showing grading history entries.
 * Newest first, table of previous scores per entry.
 * NO MANTINE.
 */

import { useState } from 'react';
import type { WritingGradingAudit } from '../../types/ielts-writing.types';

interface GradingAuditTrailProps {
    entries: WritingGradingAudit[];
}

export default function GradingAuditTrail({ entries }: GradingAuditTrailProps) {
    const [collapsed, setCollapsed] = useState(true);

    if (entries.length === 0) return null;

    const sorted = [...entries].sort((a, b) => (b.gradedAt || 0) - (a.gradedAt || 0));

    const formatTime = (ts?: number) => {
        if (!ts) return '—';
        const d = new Date(ts);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
            + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div style={{
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
        }}>
            <button
                onClick={() => setCollapsed(!collapsed)}
                style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    background: '#f8fafc',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#475569',
                }}
            >
                <span>📋 Grading History ({entries.length})</span>
                <span>{collapsed ? '▶' : '▼'}</span>
            </button>

            {!collapsed && (
                <div style={{ padding: '10px 14px' }}>
                    {sorted.map((entry, i) => (
                        <div key={i} style={{
                            padding: '10px 0',
                            borderBottom: i < sorted.length - 1 ? '1px solid #f1f5f9' : 'none',
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '6px',
                                fontSize: '0.75rem',
                            }}>
                                <span style={{ color: '#64748b' }}>{formatTime(entry.gradedAt)}</span>
                                <span style={{ color: '#94a3b8' }}>v{entry.version} • {entry.teacherId?.slice(0, 8) || 'Teacher'}</span>
                            </div>
                            {entry.reason && (
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: '#64748b',
                                    background: '#f8fafc',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    marginBottom: '6px',
                                    fontStyle: 'italic',
                                }}>
                                    "{entry.reason}"
                                </div>
                            )}
                            {entry.previousScores && (
                                <table style={{
                                    width: '100%',
                                    fontSize: '0.7rem',
                                    borderCollapse: 'collapse',
                                }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '2px 4px', color: '#94a3b8' }}>Task</th>
                                            <th style={{ textAlign: 'center', padding: '2px 4px', color: '#94a3b8' }}>Band</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style={{ padding: '2px 4px', color: '#475569' }}>Overall</td>
                                            <td style={{ textAlign: 'center', padding: '2px 4px', color: '#0f172a', fontWeight: 600 }}>
                                                {entry.previousScores.overallBand ?? '—'}
                                            </td>
                                        </tr>
                                        {entry.previousScores.perTask?.map((task) => (
                                            <tr key={task.taskNumber}>
                                                <td style={{ padding: '2px 4px', color: '#475569' }}>
                                                    Task {task.taskNumber}{task.isVoided ? ' 🚫' : ''}
                                                </td>
                                                <td style={{ textAlign: 'center', padding: '2px 4px', color: '#0f172a', fontWeight: 600 }}>
                                                    {task.isVoided ? 'Voided' : task.taskBand}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
