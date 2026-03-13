/**
 * AtRiskStudentList – PRD-0034 Task 12.2
 *
 * Collapsible list of students with < 50 % completion rate.
 * Collapsed by default, expands on click.
 * Shows each student's name, completion rate (red if < 50 %), and avg score.
 */
import { useState, type CSSProperties } from 'react';

export interface AtRiskStudent {
    name: string;
    completionRate: number;
    avgScore: number;
}

export interface AtRiskStudentListProps {
    students: AtRiskStudent[];
}

const container: CSSProperties = {
    marginTop: '0.5rem',
    borderRadius: '0.85rem',
    border: '1.5px solid rgba(249,115,22,0.18)',
    background: 'rgba(249,115,22,0.04)',
    overflow: 'hidden',
    transition: 'border-color 0.2s ease',
};

const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.65rem 0.85rem',
    cursor: 'pointer',
    userSelect: 'none',
};

const headerText: CSSProperties = {
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#c2410c',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
};

const chevronStyle = (expanded: boolean): CSSProperties => ({
    fontSize: '0.9rem',
    transition: 'transform 0.25s ease',
    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
    color: '#c2410c',
});

const listStyle: CSSProperties = {
    padding: '0 0.85rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.55rem 0.7rem',
    borderRadius: '0.65rem',
    background: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(226,232,240,0.5)',
};

const nameStyle: CSSProperties = {
    fontSize: '0.84rem',
    fontWeight: 600,
    color: '#1e293b',
};

const metaRow: CSSProperties = {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
};

export default function AtRiskStudentList({ students }: AtRiskStudentListProps) {
    const [expanded, setExpanded] = useState(false);

    if (students.length === 0) return null;

    return (
        <div style={container}>
            <div
                style={headerStyle}
                onClick={() => setExpanded((prev) => !prev)}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((p) => !p); }}
            >
                <span style={headerText}>
                    ⚠️ At-Risk Students ({students.length})
                </span>
                <span style={chevronStyle(expanded)}>▼</span>
            </div>

            {expanded && (
                <div style={listStyle}>
                    {students.map((s, i) => (
                        <div key={i} style={cardStyle}>
                            <span style={nameStyle}>{s.name}</span>
                            <div style={metaRow}>
                                <span style={{
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    color: s.completionRate < 50 ? '#b91c1c' : '#047857',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '999px',
                                    background: s.completionRate < 50
                                        ? 'rgba(239,68,68,0.1)'
                                        : 'rgba(16,185,129,0.1)',
                                }}>
                                    {s.completionRate}% done
                                </span>
                                <span style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: '#64748b',
                                }}>
                                    Avg: {s.avgScore > 0 ? `${s.avgScore}%` : '—'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
