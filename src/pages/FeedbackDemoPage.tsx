/**
 * FeedbackDemoPage
 * 
 * Demo page for testing Teacher Feedback components without authentication.
 * Shows both teacher and student views of the feedback system.
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

import React, { useState } from 'react';
import {
    Container,
    Stack,
    Title,
    Text,
    Paper,
    Tabs,
    Badge,
    Alert,
    Group,
    Button,
    Card,
    Divider,
    Grid,
    Code,
} from '@mantine/core';
import {
    IconSchool,
    IconUser,
    IconAlertCircle,
    IconRefresh,
    IconMessageCircle,
} from '@tabler/icons-react';
import { FeedbackEditor } from '@/components/feedback/FeedbackEditor';
import { FeedbackDisplay } from '@/components/feedback/FeedbackDisplay';
import type { EnhancedTestResultRecord } from '@/types/results.types';
import { generateMockResultWithFeedback } from '@/scripts/mockFeedbackData';

export const FeedbackDemoPage: React.FC = () => {
    const [selectedResult, setSelectedResult] = useState<EnhancedTestResultRecord>(
        generateMockResultWithFeedback()
    );
    const [activeTab, setActiveTab] = useState<string | null>('teacher');
    const [lastAction, setLastAction] = useState<string | null>(null);

    // Mock save functions for demo
    const handleSaveQuestionFeedback = async (
        questionNumber: number,
        feedback: string
    ): Promise<void> => {
        console.log(`Saving feedback for question ${questionNumber}:`, feedback);
        setLastAction(`Saved feedback for Q${questionNumber}`);

        // Update local state to simulate save
        setSelectedResult(prev => ({
            ...prev,
            questionResults: prev.questionResults.map(q =>
                q.questionNumber === questionNumber
                    ? { ...q, teacherFeedback: feedback }
                    : q
            ),
        }));
    };

    const handleSaveOverallFeedback = async (feedback: string): Promise<void> => {
        console.log('Saving overall feedback:', feedback);
        setLastAction('Saved overall feedback');

        // Update local state
        setSelectedResult(prev => ({
            ...prev,
            overallFeedback: feedback,
            feedbackUpdatedAt: Date.now(),
            feedbackUpdatedBy: 'Demo Teacher',
        }));
    };

    const handleClearQuestionFeedback = (questionNumber: number): void => {
        console.log(`Clearing feedback for question ${questionNumber}`);
        setLastAction(`Cleared feedback for Q${questionNumber}`);

        setSelectedResult(prev => ({
            ...prev,
            questionResults: prev.questionResults.map(q =>
                q.questionNumber === questionNumber
                    ? { ...q, teacherFeedback: null }
                    : q
            ),
        }));
    };

    const handleClearOverallFeedback = (): void => {
        console.log('Clearing overall feedback');
        setLastAction('Cleared overall feedback');

        setSelectedResult(prev => ({
            ...prev,
            overallFeedback: null,
            feedbackUpdatedAt: null,
            feedbackUpdatedBy: null,
        }));
    };

    const handleRefresh = () => {
        setSelectedResult(generateMockResultWithFeedback());
        setLastAction(null);
    };

    const questionsWithFeedback = selectedResult.questionResults.filter(
        q => q.teacherFeedback
    ).length;

    return (
        <Container size="xl" py="xl">
            <Stack gap="lg">
                {/* Header */}
                <Paper
                    p="xl"
                    radius="md"
                    style={{
                        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        color: 'white',
                    }}
                >
                    <Group justify="space-between" align="center">
                        <div>
                            <Title order={1}>Teacher Feedback Demo</Title>
                            <Text size="lg" mt="xs" opacity={0.9}>
                                Test the feedback system from both teacher and student perspectives
                            </Text>
                        </div>
                        <Badge size="lg" variant="white" color="dark">
                            PHASE 5 - DEMO
                        </Badge>
                    </Group>
                </Paper>

                {/* Instructions */}
                <Alert
                    icon={<IconAlertCircle size={16} />}
                    title="Instructions"
                    color="blue"
                    variant="light"
                >
                    <Stack gap="xs">
                        <Text size="sm">
                            1. <strong>Teacher View:</strong> Add, edit, or delete feedback for individual
                            questions and overall test
                        </Text>
                        <Text size="sm">
                            2. <strong>Student View:</strong> See how students view teacher feedback
                        </Text>
                        <Text size="sm">
                            3. All changes are simulated and won't persist after refresh
                        </Text>
                        <Text size="sm">
                            4. Click "Refresh Data" to reset to default mock data
                        </Text>
                    </Stack>
                </Alert>

                {/* Controls & Status */}
                <Group>
                    <Button
                        leftSection={<IconRefresh size={16} />}
                        variant="light"
                        onClick={handleRefresh}
                    >
                        Refresh Data
                    </Button>
                    <Badge variant="light" color="blue" size="lg">
                        <IconMessageCircle size={14} style={{ marginRight: 4 }} />
                        {questionsWithFeedback} / {selectedResult.questionResults.length} questions with
                        feedback
                    </Badge>
                    {selectedResult.overallFeedback && (
                        <Badge variant="light" color="green" size="lg">
                            Overall feedback added
                        </Badge>
                    )}
                    {lastAction && (
                        <Text size="sm" c="blue">
                            Last action: <Code>{lastAction}</Code>
                        </Text>
                    )}
                </Group>

                {/* Test Info Card */}
                <Card withBorder shadow="sm">
                    <Grid>
                        <Grid.Col span={{ base: 12, md: 6 }}>
                            <Text size="sm" c="dimmed">Test Title</Text>
                            <Text fw={500}>{selectedResult.testTitle}</Text>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 6 }}>
                            <Text size="sm" c="dimmed">Student</Text>
                            <Text fw={500}>{selectedResult.studentName}</Text>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Text size="sm" c="dimmed">Score</Text>
                            <Text fw={500}>
                                {selectedResult.totalScore} / {selectedResult.maxScore} (
                                {selectedResult.percentage}%)
                            </Text>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Text size="sm" c="dimmed">Skill</Text>
                            <Text fw={500} style={{ textTransform: 'capitalize' }}>
                                {selectedResult.testSkill}
                            </Text>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Text size="sm" c="dimmed">Submitted</Text>
                            <Text fw={500}>
                                {new Date(selectedResult.submittedAt).toLocaleDateString()}
                            </Text>
                        </Grid.Col>
                    </Grid>
                </Card>

                {/* Tab Navigation */}
                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="teacher" leftSection={<IconSchool size={16} />}>
                            Teacher View (Add Feedback)
                        </Tabs.Tab>
                        <Tabs.Tab value="student" leftSection={<IconUser size={16} />}>
                            Student View (View Feedback)
                        </Tabs.Tab>
                    </Tabs.List>

                    {/* Teacher View */}
                    <Tabs.Panel value="teacher" pt="xl">
                        <Stack gap="xl">
                            <Paper p="lg" withBorder>
                                <Title order={3} mb="md">
                                    Overall Test Feedback
                                </Title>
                                <FeedbackEditor
                                    initialFeedback={selectedResult.overallFeedback || ''}
                                    onSave={handleSaveOverallFeedback}
                                    onClear={handleClearOverallFeedback}
                                    isOverall={true}
                                    placeholder="Add overall feedback about the student's performance on this test..."
                                    autosave={false}
                                    autosaveDelay={2000}
                                />
                            </Paper>

                            <Divider label="Per-Question Feedback" labelPosition="center" />

                            <Stack gap="md">
                                {selectedResult.questionResults.map(question => (
                                    <Paper key={question.questionNumber} p="md" withBorder>
                                        <Group justify="apart" mb="sm">
                                            <Text fw={600}>
                                                Question {question.questionNumber}
                                                {question.isCorrect ? (
                                                    <Badge ml="sm" color="green" variant="light" size="sm">
                                                        Correct ✓
                                                    </Badge>
                                                ) : (
                                                    <Badge ml="sm" color="red" variant="light" size="sm">
                                                        Incorrect ✗
                                                    </Badge>
                                                )}
                                            </Text>
                                            <Text size="sm" c="dimmed">
                                                Student: {question.studentAnswer} | Correct: {question.correctAnswer}
                                            </Text>
                                        </Group>
                                        <FeedbackEditor
                                            questionId={String(question.questionNumber)}
                                            initialFeedback={question.teacherFeedback || ''}
                                            onSave={feedback =>
                                                handleSaveQuestionFeedback(question.questionNumber, feedback)
                                            }
                                            onClear={() => handleClearQuestionFeedback(question.questionNumber)}
                                            placeholder={
                                                question.isCorrect
                                                    ? 'Optionally add praise or explain why this answer is correct...'
                                                    : 'Explain why the answer is incorrect or give hints...'
                                            }
                                            autosave={false}
                                            autosaveDelay={2000}
                                        />
                                    </Paper>
                                ))}
                            </Stack>
                        </Stack>
                    </Tabs.Panel>

                    {/* Student View */}
                    <Tabs.Panel value="student" pt="xl">
                        <Stack gap="xl">
                            {/* Overall Feedback Display */}
                            {selectedResult.overallFeedback ? (
                                <Paper p="lg" withBorder>
                                    <Title order={3} mb="md">
                                        Teacher's Overall Feedback
                                    </Title>
                                    <FeedbackDisplay
                                        feedback={selectedResult.overallFeedback}
                                        teacherName={selectedResult.feedbackUpdatedBy || 'Teacher'}
                                        updatedAt={selectedResult.feedbackUpdatedAt || Date.now()}
                                        isOverall={true}
                                        variant="highlighted"
                                    />
                                </Paper>
                            ) : (
                                <Alert color="gray" variant="light">
                                    No overall feedback has been added by your teacher yet.
                                </Alert>
                            )}

                            <Divider label="Feedback on Individual Questions" labelPosition="center" />

                            {/* Per-Question Feedback Display */}
                            <Stack gap="md">
                                {selectedResult.questionResults.map(question => (
                                    <Paper key={question.questionNumber} p="md" withBorder>
                                        <Group justify="apart" mb="sm">
                                            <Text fw={600}>
                                                Question {question.questionNumber}
                                                {question.isCorrect ? (
                                                    <Badge ml="sm" color="green" variant="light" size="sm">
                                                        Correct ✓
                                                    </Badge>
                                                ) : (
                                                    <Badge ml="sm" color="red" variant="light" size="sm">
                                                        Incorrect ✗
                                                    </Badge>
                                                )}
                                            </Text>
                                            <Text size="sm" c="dimmed">
                                                Your answer: {question.studentAnswer} | Correct: {question.correctAnswer}
                                            </Text>
                                        </Group>

                                        {question.teacherFeedback ? (
                                            <FeedbackDisplay
                                                feedback={question.teacherFeedback}
                                                teacherName={selectedResult.feedbackUpdatedBy || 'Teacher'}
                                                updatedAt={selectedResult.feedbackUpdatedAt || Date.now()}
                                                questionId={String(question.questionNumber)}
                                                variant="default"
                                            />
                                        ) : (
                                            <Text size="sm" c="dimmed" fs="italic">
                                                No feedback for this question yet.
                                            </Text>
                                        )}
                                    </Paper>
                                ))}
                            </Stack>

                            {/* Summary */}
                            <Card withBorder bg="blue.0">
                                <Group>
                                    <IconMessageCircle size={20} />
                                    <div>
                                        <Text fw={600}>Feedback Summary</Text>
                                        <Text size="sm" c="dimmed">
                                            You have feedback on {questionsWithFeedback} out of{' '}
                                            {selectedResult.questionResults.length} questions
                                            {selectedResult.overallFeedback && ', plus overall feedback'}.
                                        </Text>
                                    </div>
                                </Group>
                            </Card>
                        </Stack>
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Container>
    );
};

export default FeedbackDemoPage;
