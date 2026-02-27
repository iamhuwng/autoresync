/**
 * AcademicRecordDemoPage
 * 
 * Demo page for testing Academic Record components without authentication.
 * Shows all the academic record components with mock data.
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */

import React, { useState } from 'react';
import { Container, Stack, Title, Text, Paper, Tabs, Badge, Alert, Group, Button, Code } from '@mantine/core';
import { IconClock, IconBook, IconTarget, IconClipboard, IconChartBar, IconRefresh, IconAlertCircle } from '@tabler/icons-react';
import { ResultTimeline, ResultsByCourse, ResultsBySkill, ResultsByTestType, StatisticsDashboard } from '@/components/academicRecord';
import type { EnhancedTestResultRecord } from '@/types/results.types';

// Generate mock results for demo
const generateMockResults = (): EnhancedTestResultRecord[] => {
    const courses = [
        { id: 'course-1', name: 'IELTS Preparation' },
        { id: 'course-2', name: 'Business English' },
        { id: 'course-3', name: 'Academic Writing' },
    ];

    const skills: Array<'reading' | 'listening' | 'writing' | 'speaking'> = ['reading', 'listening', 'writing', 'speaking'];
    const testTypes: Array<'quiz' | 'test'> = ['quiz', 'test'];
    const modules = ['Module 1: Basics', 'Module 2: Intermediate', 'Module 3: Advanced'];

    const results: EnhancedTestResultRecord[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i < 25; i++) {
        const course = courses[i % courses.length]!;
        const skill = skills[i % skills.length]!;
        const testType = testTypes[i % testTypes.length]!;
        const module = modules[i % modules.length]!;

        const correctAnswers = Math.floor(Math.random() * 8) + 3; // 3-10 correct
        const totalQuestions = 10;
        const percentage = Math.round((correctAnswers / totalQuestions) * 100);
        const maxScore = totalQuestions;
        const totalScore = correctAnswers;

        results.push({
            resultId: `result-${i + 1}`,
            testId: `test-${i + 1}`,
            testTitle: `${skill.charAt(0).toUpperCase() + skill.slice(1)} ${testType.charAt(0).toUpperCase() + testType.slice(1)} ${i + 1}`,
            testType: testType,
            testSkill: skill,
            sessionCode: `SESSION${i + 100}`,
            studentId: 'demo-student',
            studentName: 'Demo Student',
            isGuest: false,
            teacherId: 'demo-teacher',

            // Scores
            totalScore,
            maxScore,
            percentage,
            bandScore: Math.min(9, Math.floor(percentage / 10) + 1),

            // Summary
            totalQuestions,
            correct: correctAnswers,
            incorrect: totalQuestions - correctAnswers,
            partialCredit: 0,

            // Timestamps
            submittedAt: now - (i * dayMs * 2), // Spread over time
            timeElapsed: Math.floor(Math.random() * 1800) + 600, // 10-40 minutes
            createdAt: now - (i * dayMs * 2),
            testDuration: 3600, // 1 hour

            // Academic context
            courseId: course.id,
            courseName: course.name,
            classId: 'class-1',
            className: 'Morning Class A',
            moduleId: `module-${(i % 3) + 1}`,
            moduleName: module,

            // Feedback
            overallFeedback: i % 3 === 0 ? 'Good effort! Keep practicing.' : null,
            feedbackUpdatedAt: i % 3 === 0 ? now - (i * dayMs) : null,
            feedbackUpdatedBy: i % 3 === 0 ? 'Teacher Demo' : null,

            // Question results
            questionResults: Array.from({ length: totalQuestions }, (_, qIdx) => ({
                questionNumber: qIdx + 1,
                questionType: 'multiple_choice',
                isCorrect: qIdx < correctAnswers,
                studentAnswer: String.fromCharCode(65 + (qIdx % 4)),
                correctAnswer: qIdx < correctAnswers ? String.fromCharCode(65 + (qIdx % 4)) : String.fromCharCode(65 + ((qIdx + 1) % 4)),
                score: qIdx < correctAnswers ? 1 : 0,
                maxScore: 1,
                feedback: '',
                teacherFeedback: null,
            })),
        });
    }

    return results;
};

export const AcademicRecordDemoPage: React.FC = () => {
    const [results, setResults] = useState<EnhancedTestResultRecord[]>(generateMockResults());
    const [activeTab, setActiveTab] = useState<string | null>('timeline');
    const [lastClicked, setLastClicked] = useState<string | null>(null);

    const handleResultClick = (resultId: string) => {
        setLastClicked(resultId);
        console.log('Result clicked:', resultId);
    };

    const handleRefresh = () => {
        setResults(generateMockResults());
        setLastClicked(null);
    };

    const handleExportPDF = () => {
        console.log('Export PDF clicked');
        alert('PDF export would be triggered here');
    };

    const handleExportCSV = () => {
        console.log('Export CSV clicked');
        alert('CSV export would be triggered here');
    };

    return (
        <Container size="xl" py="xl">
            <Stack gap="lg">
                {/* Header */}
                <Paper p="xl" radius="md" style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white'
                }}>
                    <Group justify="space-between" align="center">
                        <div>
                            <Title order={1}>Academic Record Demo</Title>
                            <Text size="lg" mt="xs" opacity={0.9}>
                                Test the academic record components with mock data
                            </Text>
                        </div>
                        <Badge size="lg" variant="white" color="dark">
                            PHASE 4 - DEMO
                        </Badge>
                    </Group>
                </Paper>

                {/* Instructions */}
                <Alert icon={<IconAlertCircle size={16} />} title="Instructions" color="blue" variant="light">
                    <Stack gap="xs">
                        <Text size="sm">1. This page displays mock academic record data for testing purposes</Text>
                        <Text size="sm">2. Switch between tabs to see different views of the data</Text>
                        <Text size="sm">3. Click on any result card to see click handling in action</Text>
                        <Text size="sm">4. Use "Refresh Data" to generate new random mock data</Text>
                    </Stack>
                </Alert>

                {/* Controls */}
                <Group>
                    <Button
                        leftSection={<IconRefresh size={16} />}
                        variant="light"
                        onClick={handleRefresh}
                    >
                        Refresh Data
                    </Button>
                    <Text size="sm" c="dimmed">
                        {results.length} results loaded
                    </Text>
                    {lastClicked && (
                        <Text size="sm" c="blue">
                            Last clicked: <Code>{lastClicked}</Code>
                        </Text>
                    )}
                </Group>

                {/* Tab Navigation */}
                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="timeline" leftSection={<IconClock size={16} />}>
                            Timeline
                        </Tabs.Tab>
                        <Tabs.Tab value="course" leftSection={<IconBook size={16} />}>
                            By Course
                        </Tabs.Tab>
                        <Tabs.Tab value="skill" leftSection={<IconTarget size={16} />}>
                            By Skill
                        </Tabs.Tab>
                        <Tabs.Tab value="type" leftSection={<IconClipboard size={16} />}>
                            By Type
                        </Tabs.Tab>
                        <Tabs.Tab value="statistics" leftSection={<IconChartBar size={16} />}>
                            Statistics
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="timeline" pt="xl">
                        <ResultTimeline
                            results={results}
                            loading={false}
                            onResultClick={handleResultClick}
                            emptyMessage="No test results found"
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="course" pt="xl">
                        <ResultsByCourse
                            results={results}
                            onResultClick={handleResultClick}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="skill" pt="xl">
                        <ResultsBySkill
                            results={results}
                            onResultClick={handleResultClick}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="type" pt="xl">
                        <ResultsByTestType
                            results={results}
                            onResultClick={handleResultClick}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="statistics" pt="xl">
                        <StatisticsDashboard
                            results={results}
                            onExportPDF={handleExportPDF}
                            onExportCSV={handleExportCSV}
                        />
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Container>
    );
};

export default AcademicRecordDemoPage;
