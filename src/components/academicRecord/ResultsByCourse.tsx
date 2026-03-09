import React, { useState, useMemo } from 'react';
import { IconChevronDown, IconChevronRight, IconBook, IconInbox } from '@tabler/icons-react';
import { ResultCard } from './ResultCard';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultsByCourseProps {
    results: EnhancedTestResultRecord[];
    onResultClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
    showProgress?: boolean;
}

interface CourseGroup {
    courseId: string | null;
    courseName: string | null;
    results: EnhancedTestResultRecord[];
    averageScore: number;
    totalTests: number;
    progressPercentage?: number;
}

/**
 * ResultsByCourse Component
 * 
 * Groups test results by course with collapsible sections.
 * Shows course progress percentage and average score in headers.
 * 
 * Features:
 * - Groups results by course (courseId)
 * - Collapsible course sections (click to expand/collapse)
 * - Course header shows:
 *   - Course name
 *   - Number of tests taken
 *   - Average score percentage
 *   - Optional progress bar (if showProgress is true)
 * - Results sorted by submission date within each course
 * - "Uncategorized" section for results without course context
 * - Empty state when no results exist
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const ResultsByCourse: React.FC<ResultsByCourseProps> = ({
    results,
    onResultClick,
    variant = 'glass',
    showProgress = false
}) => {
    const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

    // Group results by course
    const courseGroups = useMemo(() => {
        const groups = new Map<string, CourseGroup>();

        results.forEach(result => {
            const key = result.courseId || 'uncategorized';

            if (!groups.has(key)) {
                groups.set(key, {
                    courseId: result.courseId || null,
                    courseName: result.courseName || 'Uncategorized',
                    results: [],
                    averageScore: 0,
                    totalTests: 0,
                    progressPercentage: undefined
                });
            }

            const group = groups.get(key)!;
            group.results.push(result);
        });

        // Calculate statistics for each group
        groups.forEach(group => {
            group.totalTests = group.results.length;
            const totalScore = group.results.reduce((sum, r) => sum + r.percentage, 0);
            group.averageScore = group.totalTests > 0 ? totalScore / group.totalTests : 0;

            // Sort results by submission date (newest first)
            group.results.sort((a, b) => b.submittedAt - a.submittedAt);
        });

        // Convert to array and sort by course name
        return Array.from(groups.values()).sort((a, b) => {
            // Uncategorized always goes last
            if (a.courseName === 'Uncategorized') return 1;
            if (b.courseName === 'Uncategorized') return -1;
            return (a.courseName || '').localeCompare(b.courseName || '');
        });
    }, [results]);

    const toggleCourse = (courseId: string | null) => {
        const key = courseId || 'uncategorized';
        setExpandedCourses(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const isCourseExpanded = (courseId: string | null) => {
        const key = courseId || 'uncategorized';
        return expandedCourses.has(key);
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
                    Your test results will appear here grouped by course.
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {courseGroups.map((group) => {
                const isExpanded = isCourseExpanded(group.courseId);
                const key = group.courseId || 'uncategorized';

                return (
                    <div key={key}>
                        {/* Course Header */}
                        <div
                            onClick={() => toggleCourse(group.courseId)}
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

                                    <IconBook size={20} style={{ color: '#64748b' }} />

                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '1rem' }}>
                                            {group.courseName}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.375rem', marginTop: 4, flexWrap: 'wrap' }}>
                                            <span style={badgeBlue}>
                                                {group.totalTests} test{group.totalTests !== 1 ? 's' : ''}
                                            </span>
                                            <span style={badgeGreen}>
                                                Avg: {Math.round(group.averageScore)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Progress percentage badge (if available) */}
                                {showProgress && group.progressPercentage !== undefined && (
                                    <span style={badgePurple}>
                                        {Math.round(group.progressPercentage)}% Complete
                                    </span>
                                )}
                            </div>

                            {/* Progress bar (if enabled) */}
                            {showProgress && group.progressPercentage !== undefined && (
                                <div style={{ marginTop: '0.75rem', height: 8, borderRadius: 4, background: '#ede9fe', overflow: 'hidden' }}>
                                    <div
                                        style={{
                                            width: `${Math.min(group.progressPercentage, 100)}%`,
                                            height: '100%',
                                            background: '#7c3aed',
                                        }}
                                    />
                                </div>
                            )}
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
                {courseGroups.length} course{courseGroups.length !== 1 ? 's' : ''} • {results.length} total result{results.length !== 1 ? 's' : ''}
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
const badgePurple: React.CSSProperties = { ...badgeBase, background: '#7c3aed', color: '#ffffff', padding: '4px 10px' };
