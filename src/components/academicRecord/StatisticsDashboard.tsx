import React, { useMemo } from 'react';
import { Stack, Grid, Card, Text, Group, Button, SimpleGrid } from '@mantine/core';
import {
    IconTrophy,
    IconChartLine,
    IconFlame,
    IconFileText,
    IconFileTypePdf,
    IconFileTypeCsv
} from '@tabler/icons-react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface StatisticsDashboardProps {
    results: EnhancedTestResultRecord[];
    onExportPDF?: () => void;
    onExportCSV?: () => void;
}

/**
 * StatisticsDashboard Component
 * 
 * Displays comprehensive analytics and visualizations for test results.
 * 
 * Features:
 * - Overview cards: Total tests, Average score, Best score, Study streak
 * - Score progression chart (line graph)
 * - Skill breakdown radar chart
 * - Score distribution histogram
 * - Test frequency chart
 * - Export buttons (PDF, CSV)
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const StatisticsDashboard: React.FC<StatisticsDashboardProps> = ({
    results,
    onExportPDF,
    onExportCSV
}) => {
    // Calculate overview statistics
    const stats = useMemo(() => {
        if (results.length === 0) {
            return {
                totalTests: 0,
                averageScore: 0,
                bestScore: 0,
                studyStreak: 0
            };
        }

        const scores = results.map(r => r.percentage);
        const totalScore = scores.reduce((sum, score) => sum + score, 0);

        // Calculate study streak (consecutive days with activity)
        const sortedDates = results
            .map(r => new Date(r.submittedAt).toDateString())
            .filter((date, index, self) => self.indexOf(date) === index)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        let streak = 0;
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        if (sortedDates[0] === today || sortedDates[0] === yesterday) {
            streak = 1;
            for (let i = 1; i < sortedDates.length; i++) {
                const currentDate = new Date(sortedDates[i]!);
                const previousDate = new Date(sortedDates[i - 1]!);
                const diffDays = Math.floor((previousDate.getTime() - currentDate.getTime()) / 86400000);

                if (diffDays === 1) {
                    streak++;
                } else {
                    break;
                }
            }
        }

        return {
            totalTests: results.length,
            averageScore: totalScore / results.length,
            bestScore: Math.max(...scores),
            studyStreak: streak
        };
    }, [results]);

    // Prepare score progression data
    const scoreProgressionData = useMemo(() => {
        const sortedResults = [...results].sort((a, b) => a.submittedAt - b.submittedAt);

        return sortedResults.map((result, index) => ({
            name: `Test ${index + 1}`,
            score: Math.round(result.percentage),
            date: new Date(result.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }));
    }, [results]);

    // Prepare skill breakdown data
    const skillBreakdownData = useMemo(() => {
        const skillGroups = {
            reading: [] as number[],
            listening: [] as number[],
            writing: [] as number[],
            speaking: [] as number[]
        };

        results.forEach(result => {
            const skill = result.testSkill;
            if (skillGroups[skill]) {
                skillGroups[skill].push(result.percentage);
            }
        });

        return [
            {
                skill: 'Reading',
                score: skillGroups.reading.length > 0
                    ? Math.round(skillGroups.reading.reduce((a, b) => a + b, 0) / skillGroups.reading.length)
                    : 0,
                fullMark: 100
            },
            {
                skill: 'Listening',
                score: skillGroups.listening.length > 0
                    ? Math.round(skillGroups.listening.reduce((a, b) => a + b, 0) / skillGroups.listening.length)
                    : 0,
                fullMark: 100
            },
            {
                skill: 'Writing',
                score: skillGroups.writing.length > 0
                    ? Math.round(skillGroups.writing.reduce((a, b) => a + b, 0) / skillGroups.writing.length)
                    : 0,
                fullMark: 100
            },
            {
                skill: 'Speaking',
                score: skillGroups.speaking.length > 0
                    ? Math.round(skillGroups.speaking.reduce((a, b) => a + b, 0) / skillGroups.speaking.length)
                    : 0,
                fullMark: 100
            }
        ];
    }, [results]);

    // Prepare score distribution data
    const scoreDistributionData = useMemo(() => {
        const ranges = [
            { range: '0-20%', min: 0, max: 20, count: 0 },
            { range: '21-40%', min: 21, max: 40, count: 0 },
            { range: '41-60%', min: 41, max: 60, count: 0 },
            { range: '61-80%', min: 61, max: 80, count: 0 },
            { range: '81-100%', min: 81, max: 100, count: 0 }
        ];

        results.forEach(result => {
            const score = result.percentage;
            const range = ranges.find(r => score >= r.min && score <= r.max);
            if (range) {
                range.count++;
            }
        });

        return ranges;
    }, [results]);

    // Prepare test frequency data (tests per month)
    const testFrequencyData = useMemo(() => {
        const monthGroups = new Map<string, number>();

        results.forEach(result => {
            const date = new Date(result.submittedAt);
            const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            monthGroups.set(monthKey, (monthGroups.get(monthKey) || 0) + 1);
        });

        return Array.from(monthGroups.entries())
            .map(([month, count]) => ({ month, count }))
            .sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA.getTime() - dateB.getTime();
            });
    }, [results]);

    // Empty state
    if (results.length === 0) {
        return (
            <Stack align="center" gap="md" py="xl">
                <Text size="lg" fw={500} c="dimmed">
                    No data available for statistics
                </Text>
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                    Complete some tests to see your performance analytics here.
                </Text>
            </Stack>
        );
    }

    return (
        <Stack gap="xl">
            {/* Export Buttons */}
            <Group justify="flex-end">
                <Button
                    variant="light"
                    leftSection={<IconFileTypeCsv size={18} />}
                    onClick={onExportCSV}
                    disabled={!onExportCSV}
                >
                    Export CSV
                </Button>
                <Button
                    variant="light"
                    leftSection={<IconFileTypePdf size={18} />}
                    onClick={onExportPDF}
                    disabled={!onExportPDF}
                >
                    Export PDF
                </Button>
            </Group>

            {/* Overview Cards */}
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                <Card padding="lg" radius="md" withBorder>
                    <Group justify="apart">
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Total Tests
                            </Text>
                            <Text size="xl" fw={700} mt="xs">
                                {stats.totalTests}
                            </Text>
                        </div>
                        <IconFileText size={32} style={{ color: '#94a3b8' }} />
                    </Group>
                </Card>

                <Card padding="lg" radius="md" withBorder>
                    <Group justify="apart">
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Average Score
                            </Text>
                            <Text size="xl" fw={700} mt="xs">
                                {Math.round(stats.averageScore)}%
                            </Text>
                        </div>
                        <IconChartLine size={32} style={{ color: '#3b82f6' }} />
                    </Group>
                </Card>

                <Card padding="lg" radius="md" withBorder>
                    <Group justify="apart">
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Best Score
                            </Text>
                            <Text size="xl" fw={700} mt="xs" style={{ color: '#10b981' }}>
                                {Math.round(stats.bestScore)}%
                            </Text>
                        </div>
                        <IconTrophy size={32} style={{ color: '#f59e0b' }} />
                    </Group>
                </Card>

                <Card padding="lg" radius="md" withBorder>
                    <Group justify="apart">
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                Study Streak
                            </Text>
                            <Text size="xl" fw={700} mt="xs" style={{ color: '#ef4444' }}>
                                {stats.studyStreak} {stats.studyStreak === 1 ? 'day' : 'days'}
                            </Text>
                        </div>
                        <IconFlame size={32} style={{ color: '#ef4444' }} />
                    </Group>
                </Card>
            </SimpleGrid>

            {/* Charts Grid */}
            <Grid gutter="md">
                {/* Score Progression Chart */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card padding="lg" radius="md" withBorder>
                        <Text size="lg" fw={600} mb="md" id="chart-progression-title">
                            Score Progression
                        </Text>
                        <Text size="sm" c="dimmed" mb="sm" id="chart-progression-desc">
                            Line chart showing score trends across {scoreProgressionData.length} tests.
                            Average: {Math.round(stats.averageScore)}%, Best: {Math.round(stats.bestScore)}%
                        </Text>
                        <div
                            role="img"
                            aria-labelledby="chart-progression-title"
                            aria-describedby="chart-progression-desc"
                        >
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={scoreProgressionData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis domain={[0, 100]} />
                                    <Tooltip />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="score"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        dot={{ fill: '#3b82f6', r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </Grid.Col>

                {/* Skill Breakdown Radar Chart */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card padding="lg" radius="md" withBorder>
                        <Text size="lg" fw={600} mb="md" id="chart-skill-title">
                            Skill Breakdown
                        </Text>
                        <Text size="sm" c="dimmed" mb="sm" id="chart-skill-desc">
                            Radar chart comparing average scores across 4 skills: Reading ({skillBreakdownData[0]?.score ?? 0}%),
                            Listening ({skillBreakdownData[1]?.score ?? 0}%), Writing ({skillBreakdownData[2]?.score ?? 0}%),
                            Speaking ({skillBreakdownData[3]?.score ?? 0}%)
                        </Text>
                        <div
                            role="img"
                            aria-labelledby="chart-skill-title"
                            aria-describedby="chart-skill-desc"
                        >
                            <ResponsiveContainer width="100%" height={300}>
                                <RadarChart data={skillBreakdownData}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="skill" />
                                    <PolarRadiusAxis domain={[0, 100]} />
                                    <Radar
                                        name="Average Score"
                                        dataKey="score"
                                        stroke="#8b5cf6"
                                        fill="#8b5cf6"
                                        fillOpacity={0.6}
                                    />
                                    <Tooltip />
                                    <Legend />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </Grid.Col>

                {/* Score Distribution Histogram */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card padding="lg" radius="md" withBorder>
                        <Text size="lg" fw={600} mb="md" id="chart-distribution-title">
                            Score Distribution
                        </Text>
                        <Text size="sm" c="dimmed" mb="sm" id="chart-distribution-desc">
                            Bar chart showing test count distribution: 0-20% ({scoreDistributionData[0]?.count ?? 0} tests),
                            21-40% ({scoreDistributionData[1]?.count ?? 0}), 41-60% ({scoreDistributionData[2]?.count ?? 0}),
                            61-80% ({scoreDistributionData[3]?.count ?? 0}), 81-100% ({scoreDistributionData[4]?.count ?? 0})
                        </Text>
                        <div
                            role="img"
                            aria-labelledby="chart-distribution-title"
                            aria-describedby="chart-distribution-desc"
                        >
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={scoreDistributionData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="range" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="count" fill="#10b981" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </Grid.Col>

                {/* Test Frequency Chart */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card padding="lg" radius="md" withBorder>
                        <Text size="lg" fw={600} mb="md" id="chart-frequency-title">
                            Test Frequency
                        </Text>
                        <Text size="sm" c="dimmed" mb="sm" id="chart-frequency-desc">
                            Bar chart showing test activity over time across {testFrequencyData.length} months
                        </Text>
                        <div
                            role="img"
                            aria-labelledby="chart-frequency-title"
                            aria-describedby="chart-frequency-desc"
                        >
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={testFrequencyData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="count" fill="#f59e0b" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </Grid.Col>
            </Grid>
        </Stack>
    );
};
