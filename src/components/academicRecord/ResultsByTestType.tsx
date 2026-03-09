import React, { useState, useMemo } from 'react';
import { IconChevronDown, IconChevronRight, IconClipboardList, IconFileText, IconInbox } from '@tabler/icons-react';
import { ResultCard } from './ResultCard';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultsByTestTypeProps {
    results: EnhancedTestResultRecord[];
    onResultClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

interface TestTypeGroup {
    testType: 'quiz' | 'test';
    results: EnhancedTestResultRecord[];
    averageScore: number;
    totalTests: number;
    bestScore: number;
    passRate: number; // Percentage of tests with score >= 70%
}

/**
 * ResultsByTestType Component
 * 
 * Groups test results by test type (Quiz, Test, etc.).
 * Shows type-specific statistics and performance indicators.
 * 
 * Features:
 * - Groups results by testType field
 * - Collapsible test type sections (click to expand/collapse)
 * - Test type header shows:
 *   - Type icon (clipboard for quiz, document for test)
 *   - Type name
 *   - Number of tests taken
 *   - Average score
 *   - Best score
 *   - Pass rate (percentage with score >= 70%)
 * - Results sorted by submission date within each type
 * - Color-coded type badges
 * - Empty state when no results exist
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const ResultsByTestType: React.FC<ResultsByTestTypeProps> = ({
    results,
    onResultClick,
    variant = 'glass'
}) => {
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

    // Test type configuration
    const testTypeConfig: Record<string, { icon: typeof IconClipboardList; color: string; label: string }> = {
        quiz: {
            icon: IconClipboardList,
            color: 'cyan',
            label: 'Quizzes'
        },
        test: {
            icon: IconFileText,
            color: 'indigo',
            label: 'Tests'
        },
        ielts: {
            icon: IconFileText,
            color: 'blue',
            label: 'IELTS'
        },
        toefl: {
            icon: IconFileText,
            color: 'violet',
            label: 'TOEFL'
        },
        custom: {
            icon: IconClipboardList,
            color: 'teal',
            label: 'Custom'
        },
        'college entrance': {
            icon: IconFileText,
            color: 'orange',
            label: 'College Entrance'
        }
    };

    // Fallback config for unknown/unexpected test type values
    const fallbackConfig = {
        icon: IconFileText,
        color: 'gray',
        label: 'Other'
    };

    // Group results by test type
    const testTypeGroups = useMemo(() => {
        const groups = new Map<string, TestTypeGroup>();

        results.forEach(result => {
            // Normalize testType to lowercase for consistent matching
            const testType = (result.testType || 'test').toLowerCase() as TestTypeGroup['testType'];

            if (!groups.has(testType)) {
                groups.set(testType, {
                    testType,
                    results: [],
                    averageScore: 0,
                    totalTests: 0,
                    bestScore: 0,
                    passRate: 0
                });
            }

            const group = groups.get(testType)!;
            group.results.push(result);
        });

        // Calculate statistics for each group
        groups.forEach(group => {
            group.totalTests = group.results.length;
            const scores = group.results.map(r => r.percentage);
            const totalScore = scores.reduce((sum, score) => sum + score, 0);
            group.averageScore = group.totalTests > 0 ? totalScore / group.totalTests : 0;
            group.bestScore = Math.max(...scores, 0);

            // Calculate pass rate (score >= 70%)
            const passedCount = scores.filter(score => score >= 70).length;
            group.passRate = group.totalTests > 0 ? (passedCount / group.totalTests) * 100 : 0;

            // Sort results by submission date (newest first)
            group.results.sort((a, b) => b.submittedAt - a.submittedAt);
        });

        // Convert to array and sort by test type (quiz first, then test)
        const typeOrder = ['quiz', 'test'];
        return Array.from(groups.values()).sort((a, b) => {
            return typeOrder.indexOf(a.testType) - typeOrder.indexOf(b.testType);
        });
    }, [results]);

    const toggleTestType = (testType: string) => {
        setExpandedTypes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(testType)) {
                newSet.delete(testType);
            } else {
                newSet.add(testType);
            }
            return newSet;
        });
    };

    const isTestTypeExpanded = (testType: string) => {
        return expandedTypes.has(testType);
    };

    // Get color for pass rate
    const getPassRateColor = (passRate: number): string => {
        if (passRate >= 80) return 'green';
        if (passRate >= 60) return 'yellow';
        return 'red';
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
                    Your test results will appear here grouped by test type.
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {testTypeGroups.map((group) => {
                const isExpanded = isTestTypeExpanded(group.testType);
                const config = testTypeConfig[group.testType] || fallbackConfig;
                const TestTypeIcon = config.icon;

                return (
                    <div key={group.testType}>
                        {/* Test Type Header */}
                        <div
                            onClick={() => toggleTestType(group.testType)}
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

                                    <span style={{ width: 32, height: 32, borderRadius: 8, background: iconBg(config.color), color: iconFg(config.color), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <TestTypeIcon size={20} />
                                    </span>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '1rem' }}>
                                            {config.label}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.375rem', marginTop: 4, flexWrap: 'wrap' }}>
                                            <span style={badgeByColor(config.color)}>
                                                {group.totalTests} {group.testType}{group.totalTests !== 1 ? (group.testType === 'quiz' ? 'zes' : 's') : ''}
                                            </span>
                                            <span style={badgeBlue}>
                                                Avg: {Math.round(group.averageScore)}%
                                            </span>
                                            <span style={badgeGreen}>
                                                Best: {Math.round(group.bestScore)}%
                                            </span>
                                            <span style={badgeByColor(getPassRateColor(group.passRate))}>
                                                Pass Rate: {Math.round(group.passRate)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Average Score Display */}
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ color: '#1e293b', lineHeight: 1, fontSize: '1.25rem', fontWeight: 700 }}>
                                        {Math.round(group.averageScore)}%
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                        average
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
                {testTypeGroups.length} type{testTypeGroups.length !== 1 ? 's' : ''} • {results.length} total result{results.length !== 1 ? 's' : ''}
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

const badgeBlue: React.CSSProperties = { ...badgeBase, background: '#eff6ff', color: '#1d4ed8' };
const badgeGreen: React.CSSProperties = { ...badgeBase, background: '#ecfdf5', color: '#047857' };

function badgeByColor(color: string): React.CSSProperties {
    const map: Record<string, React.CSSProperties> = {
        cyan: { ...badgeBase, background: '#ecfeff', color: '#0e7490' },
        indigo: { ...badgeBase, background: '#eef2ff', color: '#4338ca' },
        blue: { ...badgeBase, background: '#eff6ff', color: '#1d4ed8' },
        violet: { ...badgeBase, background: '#f5f3ff', color: '#6d28d9' },
        teal: { ...badgeBase, background: '#f0fdfa', color: '#0f766e' },
        orange: { ...badgeBase, background: '#fff7ed', color: '#c2410c' },
        green: { ...badgeBase, background: '#ecfdf5', color: '#047857' },
        yellow: { ...badgeBase, background: '#fef9c3', color: '#a16207' },
        red: { ...badgeBase, background: '#fee2e2', color: '#b91c1c' },
        gray: { ...badgeBase, background: '#f8fafc', color: '#64748b' },
    };
    return map[color] || map.gray;
}

function iconBg(color: string): string {
    return (badgeByColor(color).background as string) || '#f8fafc';
}

function iconFg(color: string): string {
    return (badgeByColor(color).color as string) || '#64748b';
}
