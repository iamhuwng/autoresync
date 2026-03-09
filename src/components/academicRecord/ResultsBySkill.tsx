import React, { useState, useMemo } from 'react';
import { IconChevronDown, IconChevronRight, IconBook, IconHeadphones, IconPencil, IconMicrophone, IconInbox } from '@tabler/icons-react';
import { ResultCard } from './ResultCard';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultsBySkillProps {
    results: EnhancedTestResultRecord[];
    onResultClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

interface SkillGroup {
    skill: 'reading' | 'listening' | 'writing' | 'speaking';
    results: EnhancedTestResultRecord[];
    averageScore: number;
    totalTests: number;
    bestScore: number;
    worstScore: number;
}

/**
 * ResultsBySkill Component
 * 
 * Groups test results by skill type (Reading, Listening, Writing, Speaking).
 * Shows skill-specific statistics and performance indicators.
 * 
 * Features:
 * - Groups results by testSkill field
 * - Collapsible skill sections (click to expand/collapse)
 * - Skill header shows:
 *   - Skill icon (book, headphones, pencil, microphone)
 *   - Skill name
 *   - Number of tests taken
 *   - Average score with ring progress indicator
 *   - Best and worst scores
 * - Results sorted by submission date within each skill
 * - Color-coded skill badges
 * - Empty state when no results exist
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const ResultsBySkill: React.FC<ResultsBySkillProps> = ({
    results,
    onResultClick,
    variant = 'glass'
}) => {
    const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

    // Skill configuration
    const skillConfig = {
        reading: {
            icon: IconBook,
            color: 'blue',
            label: 'Reading'
        },
        listening: {
            icon: IconHeadphones,
            color: 'grape',
            label: 'Listening'
        },
        writing: {
            icon: IconPencil,
            color: 'teal',
            label: 'Writing'
        },
        speaking: {
            icon: IconMicrophone,
            color: 'orange',
            label: 'Speaking'
        }
    };

    // Fallback config for unknown/unexpected skill values
    const fallbackConfig = {
        icon: IconBook,
        color: 'gray',
        label: 'Other'
    };

    // Group results by skill (normalize to lowercase for consistent matching)
    const skillGroups = useMemo(() => {
        const groups = new Map<string, SkillGroup>();

        results.forEach(result => {
            // Normalize skill to lowercase to match skillConfig keys
            const skill = (result.testSkill || 'reading').toLowerCase() as SkillGroup['skill'];

            if (!groups.has(skill)) {
                groups.set(skill, {
                    skill,
                    results: [],
                    averageScore: 0,
                    totalTests: 0,
                    bestScore: 0,
                    worstScore: 100
                });
            }

            const group = groups.get(skill)!;
            group.results.push(result);
        });

        // Calculate statistics for each group
        groups.forEach(group => {
            group.totalTests = group.results.length;
            const scores = group.results.map(r => r.percentage);
            const totalScore = scores.reduce((sum, score) => sum + score, 0);
            group.averageScore = group.totalTests > 0 ? totalScore / group.totalTests : 0;
            group.bestScore = Math.max(...scores, 0);
            group.worstScore = Math.min(...scores, 100);

            // Sort results by submission date (newest first)
            group.results.sort((a, b) => b.submittedAt - a.submittedAt);
        });

        // Convert to array and sort by skill order (reading, listening, writing, speaking)
        const skillOrder = ['reading', 'listening', 'writing', 'speaking'];
        return Array.from(groups.values()).sort((a, b) => {
            return skillOrder.indexOf(a.skill) - skillOrder.indexOf(b.skill);
        });
    }, [results]);

    const toggleSkill = (skill: string) => {
        setExpandedSkills(prev => {
            const newSet = new Set(prev);
            if (newSet.has(skill)) {
                newSet.delete(skill);
            } else {
                newSet.add(skill);
            }
            return newSet;
        });
    };

    const isSkillExpanded = (skill: string) => {
        return expandedSkills.has(skill);
    };

    // Get color for score
    const getScoreColor = (score: number): string => {
        if (score >= 70) return '#10b981'; // green
        if (score >= 50) return '#f59e0b'; // yellow/amber
        return '#ef4444'; // red
    };

    // Empty state
    if (results.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '2rem 0' }}>
                <IconInbox size={64} style={{ color: '#94a3b8', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#64748b' }}>
                    No test results found
                </p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', textAlign: 'center', maxWidth: 400 }}>
                    Your test results will appear here grouped by skill.
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {skillGroups.map((group) => {
                const isExpanded = isSkillExpanded(group.skill);
                const config = skillConfig[group.skill] || fallbackConfig;
                const SkillIcon = config.icon;

                return (
                    <div key={group.skill}>
                        {/* Skill Header */}
                        <div
                            onClick={() => toggleSkill(group.skill)}
                            style={{
                                padding: '1rem',
                                background: 'rgba(255, 255, 255, 0.6)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: '12px',
                                border: '1px solid rgba(226, 232, 240, 0.8)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                marginBottom: isExpanded ? '0.75rem' : '0'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                    <span style={{ pointerEvents: 'none', color: '#64748b', display: 'inline-flex', alignItems: 'center' }}>
                                        {isExpanded ? (
                                            <IconChevronDown size={18} />
                                        ) : (
                                            <IconChevronRight size={18} />
                                        )}
                                    </span>

                                    <SkillIcon size={24} style={{ color: skillIconColor(config.color) }} />

                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '1rem' }}>
                                            {config.label}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.375rem', marginTop: 4, flexWrap: 'wrap' }}>
                                            <span style={badgeByColor(config.color)}>
                                                {group.totalTests} test{group.totalTests !== 1 ? 's' : ''}
                                            </span>
                                            <span style={badgeOutline}>
                                                Best: {Math.round(group.bestScore)}%
                                            </span>
                                            <span style={badgeOutline}>
                                                Worst: {Math.round(group.worstScore)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Ring Progress for Average Score */}
                                <div style={{ width: 80, height: 80, borderRadius: '50%', background: `conic-gradient(${getScoreColor(group.averageScore)} ${Math.max(0, Math.min(group.averageScore, 100)) * 3.6}deg, #e2e8f0 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: 62, height: 62, borderRadius: '50%', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ fontSize: '1rem', fontWeight: 700, color: getScoreColor(group.averageScore), lineHeight: 1 }}>
                                            {Math.round(group.averageScore)}%
                                        </div>
                                        <div style={{ fontSize: '0.6875rem', color: '#6b7280', lineHeight: 1.2 }}>
                                            avg
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Collapsible Results List */}
                        {isExpanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', paddingLeft: '1rem' }}>
                                {group.results.map((result) => (
                                    <ResultCard
                                        key={result.resultId}
                                        result={result}
                                        onClick={onResultClick}
                                        variant={variant}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Summary */}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                {skillGroups.length} skill{skillGroups.length !== 1 ? 's' : ''} • {results.length} total result{results.length !== 1 ? 's' : ''}
            </p>
        </div>
    );
};

const badgeBase: React.CSSProperties = {
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: '0.6875rem',
    fontWeight: 600,
};

const badgeOutline: React.CSSProperties = {
    ...badgeBase,
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#6b7280',
};

function skillIconColor(color: string): string {
    const map: Record<string, string> = {
        blue: '#2563eb',
        grape: '#7c3aed',
        teal: '#0f766e',
        orange: '#ea580c',
        gray: '#64748b',
    };
    return map[color] || '#64748b';
}

function badgeByColor(color: string): React.CSSProperties {
    const map: Record<string, React.CSSProperties> = {
        blue: { ...badgeBase, background: '#eff6ff', color: '#1d4ed8' },
        grape: { ...badgeBase, background: '#f3e8ff', color: '#7e22ce' },
        teal: { ...badgeBase, background: '#f0fdfa', color: '#0f766e' },
        orange: { ...badgeBase, background: '#fff7ed', color: '#c2410c' },
        gray: { ...badgeBase, background: '#f8fafc', color: '#64748b' },
    };
    return map[color] || map.gray;
}
