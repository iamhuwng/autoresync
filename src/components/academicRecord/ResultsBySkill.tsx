import React, { useEffect, useMemo, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconInbox } from '@tabler/icons-react';
import { AcademicRecordResultRow } from './AcademicRecordResultRow';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultsBySkillProps {
    results: EnhancedTestResultRecord[];
    onResultClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

interface SkillGroup {
    skill: string;
    label: string;
    results: EnhancedTestResultRecord[];
    averageScore: number;
    totalTests: number;
}

const skillOrder = ['reading', 'listening', 'writing', 'speaking'];

const styles: Record<string, React.CSSProperties> = {
    stack: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
    },
    groupHeader: {
        width: '100%',
        border: 'none',
        borderRadius: 14,
        padding: '14px 16px',
        background: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        textAlign: 'left',
        cursor: 'pointer',
    },
    groupHeaderMain: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        minWidth: 0,
        flex: 1,
    },
    chevron: {
        color: '#6b7280',
        flexShrink: 0,
        marginTop: 2,
    },
    leadingBadge: {
        minWidth: 38,
        height: 38,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#e0e7ff',
        color: '#4338ca',
        fontSize: '0.8125rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        flexShrink: 0,
    },
    groupTitleWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
    },
    groupTitle: {
        margin: 0,
        color: '#111827',
        fontSize: '0.95rem',
        fontWeight: 700,
    },
    groupMeta: {
        margin: 0,
        color: '#6b7280',
        fontSize: '0.75rem',
        lineHeight: 1.5,
    },
    groupSummary: {
        color: '#4f46e5',
        fontSize: '0.8125rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
    },
    groupRows: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        marginTop: '0.5rem',
    },
    emptyWrap: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '2rem 0',
    },
    emptyHeading: {
        margin: 0,
        fontSize: '1.125rem',
        fontWeight: 700,
        color: '#374151',
    },
    emptyBody: {
        margin: 0,
        fontSize: '0.875rem',
        color: '#6b7280',
        textAlign: 'center',
        maxWidth: 400,
    },
    summaryText: {
        margin: '0.5rem 0 0',
        fontSize: '0.75rem',
        color: '#6b7280',
        textAlign: 'center',
    },
};

function formatSkillLabel(skill: string): string {
    return skill
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSkillBadge(skill: string): string {
    const normalized = skill.trim().toUpperCase();
    return normalized.slice(0, 2) || 'OT';
}

export const ResultsBySkill: React.FC<ResultsBySkillProps> = ({
    results,
    onResultClick,
}) => {
    const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

    const skillGroups = useMemo(() => {
        const groups = new Map<string, SkillGroup>();

        results.forEach((result) => {
            const skill = (result.testSkill || 'other').toLowerCase();

            if (!groups.has(skill)) {
                groups.set(skill, {
                    skill,
                    label: formatSkillLabel(skill),
                    results: [],
                    averageScore: 0,
                    totalTests: 0,
                });
            }

            groups.get(skill)!.results.push(result);
        });

        groups.forEach((group) => {
            group.totalTests = group.results.length;
            const scoredResults = group.results.filter((result) => !result.thcsData && result.markingStatus !== 'pending-review');
            const totalScore = scoredResults.reduce((sum, result) => sum + result.percentage, 0);
            group.averageScore = scoredResults.length > 0 ? totalScore / scoredResults.length : 0;
            group.results.sort((a, b) => b.submittedAt - a.submittedAt);
        });

        return Array.from(groups.values()).sort((a, b) => {
            const left = skillOrder.indexOf(a.skill);
            const right = skillOrder.indexOf(b.skill);
            if (left === -1 && right === -1) {
                return a.label.localeCompare(b.label);
            }
            if (left === -1) return 1;
            if (right === -1) return -1;
            return left - right;
        });
    }, [results]);

    useEffect(() => {
        setExpandedSkills(new Set(skillGroups.map((group) => group.skill)));
    }, [skillGroups]);

    if (results.length === 0) {
        return (
            <div style={styles.emptyWrap}>
                <IconInbox size={52} style={{ color: '#9ca3af' }} />
                <p style={styles.emptyHeading}>No skill results found</p>
                <p style={styles.emptyBody}>Your latest results will appear here grouped by skill.</p>
            </div>
        );
    }

    return (
        <div style={styles.stack}>
            {skillGroups.map((group) => {
                const isExpanded = expandedSkills.has(group.skill);
                const headerMeta = `${group.totalTests} test${group.totalTests !== 1 ? 's' : ''}${group.averageScore > 0 ? ` | avg ${Math.round(group.averageScore)}%` : ''}`;

                return (
                    <section key={group.skill}>
                        <button
                            type="button"
                            onClick={() => {
                                setExpandedSkills((current) => {
                                    const next = new Set(current);
                                    if (next.has(group.skill)) {
                                        next.delete(group.skill);
                                    } else {
                                        next.add(group.skill);
                                    }
                                    return next;
                                });
                            }}
                            aria-expanded={isExpanded}
                            style={styles.groupHeader}
                        >
                            <div style={styles.groupHeaderMain}>
                                <span style={styles.chevron}>
                                    {isExpanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                                </span>
                                <span style={styles.leadingBadge}>{getSkillBadge(group.skill)}</span>
                                <div style={styles.groupTitleWrap}>
                                    <p style={styles.groupTitle}>{group.label}</p>
                                    <p style={styles.groupMeta}>{headerMeta}</p>
                                </div>
                            </div>
                            <span style={styles.groupSummary}>Skill view</span>
                        </button>

                        {isExpanded && (
                            <div style={styles.groupRows}>
                                {group.results.map((result) => (
                                    <AcademicRecordResultRow
                                        key={result.resultId}
                                        result={result}
                                        onClick={onResultClick}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}

            <p style={styles.summaryText}>
                {skillGroups.length} skill{skillGroups.length !== 1 ? 's' : ''} | {results.length} total result{results.length !== 1 ? 's' : ''}
            </p>
        </div>
    );
};
