import React, { useState, useMemo } from 'react';
import { Stack, Text, Collapse, Group, Badge, ActionIcon, RingProgress, Center } from '@mantine/core';
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
            <Stack align="center" gap="md" py="xl">
                <IconInbox size={64} style={{ color: '#94a3b8', opacity: 0.5 }} />
                <Text size="lg" fw={500} c="dimmed">
                    No test results found
                </Text>
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                    Your test results will appear here grouped by skill.
                </Text>
            </Stack>
        );
    }

    return (
        <Stack gap="lg">
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
                            <Group justify="space-between" wrap="nowrap">
                                <Group gap="sm" style={{ flex: 1 }}>
                                    <ActionIcon
                                        variant="subtle"
                                        size="sm"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {isExpanded ? (
                                            <IconChevronDown size={18} />
                                        ) : (
                                            <IconChevronRight size={18} />
                                        )}
                                    </ActionIcon>

                                    <SkillIcon size={24} style={{ color: `var(--mantine-color-${config.color}-6)` }} />

                                    <div style={{ flex: 1 }}>
                                        <Text fw={600} size="md" style={{ color: '#1e293b' }}>
                                            {config.label}
                                        </Text>
                                        <Group gap="xs" mt={4}>
                                            <Badge size="xs" variant="light" color={config.color}>
                                                {group.totalTests} test{group.totalTests !== 1 ? 's' : ''}
                                            </Badge>
                                            <Badge size="xs" variant="outline" color="gray">
                                                Best: {Math.round(group.bestScore)}%
                                            </Badge>
                                            <Badge size="xs" variant="outline" color="gray">
                                                Worst: {Math.round(group.worstScore)}%
                                            </Badge>
                                        </Group>
                                    </div>
                                </Group>

                                {/* Ring Progress for Average Score */}
                                <Center>
                                    <RingProgress
                                        size={80}
                                        thickness={8}
                                        sections={[
                                            { value: group.averageScore, color: getScoreColor(group.averageScore) }
                                        ]}
                                        label={
                                            <Center>
                                                <div style={{ textAlign: 'center' }}>
                                                    <Text size="lg" fw={700} style={{ color: getScoreColor(group.averageScore), lineHeight: 1 }}>
                                                        {Math.round(group.averageScore)}%
                                                    </Text>
                                                    <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                                                        avg
                                                    </Text>
                                                </div>
                                            </Center>
                                        }
                                    />
                                </Center>
                            </Group>
                        </div>

                        {/* Collapsible Results List */}
                        <Collapse in={isExpanded}>
                            <Stack gap="md" mt="xs" style={{ paddingLeft: '1rem' }}>
                                {group.results.map((result) => (
                                    <ResultCard
                                        key={result.resultId}
                                        result={result}
                                        onClick={onResultClick}
                                        variant={variant}
                                    />
                                ))}
                            </Stack>
                        </Collapse>
                    </div>
                );
            })}

            {/* Summary */}
            <Text size="xs" c="dimmed" ta="center" mt="md">
                {skillGroups.length} skill{skillGroups.length !== 1 ? 's' : ''} • {results.length} total result{results.length !== 1 ? 's' : ''}
            </Text>
        </Stack>
    );
};
