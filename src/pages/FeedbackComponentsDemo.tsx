import React, { useState } from 'react';
import { Container, Title, Text, Stack, Paper, Tabs, Button, Group, Badge, Alert } from '@mantine/core';
import { IconMessageCircle, IconUser, IconSchool, IconAlertCircle, IconDatabase } from '@tabler/icons-react';
import { TeacherFeedbackManager } from '../components/results/TeacherFeedbackManager';
import { StudentFeedbackViewer } from '../components/results/StudentFeedbackViewer';
import { useAuth } from '../contexts/AuthContext';
import { ref, set } from 'firebase/database';
import { database } from '../services/firebase';
import { notifications } from '@mantine/notifications';

/**
 * Feedback Components Demo Page
 * 
 * Test page to demonstrate and test the feedback components.
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

// Mock data for testing
const MOCK_RESULT_ID = 'demo-result-123';
const MOCK_STUDENT_ID = 'student-456';
const MOCK_STUDENT_NAME = 'John Doe';
const MOCK_TEST_NAME = 'IELTS Reading Practice Test 1';

const MOCK_QUESTIONS = [
    {
        id: 'q1',
        number: 1,
        text: 'What is the main idea of the passage?',
        type: 'multiple-choice'
    },
    {
        id: 'q2',
        number: 2,
        text: 'According to the text, what are the three main causes of climate change?',
        type: 'short-answer'
    },
    {
        id: 'q3',
        number: 3,
        text: 'The author suggests that renewable energy is important because...',
        type: 'multiple-choice'
    }
];

export const FeedbackComponentsDemo: React.FC = () => {
    const [activeTab, setActiveTab] = useState<string>('teacher');
    const [refreshKey, setRefreshKey] = useState(0);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const { user } = useAuth();

    const handleRefresh = () => {
        setRefreshKey(prev => prev + 1);
    };

    // Use actual logged-in user's UID and name
    const teacherId = user?.uid || 'not-logged-in';
    const teacherName = user?.displayName || user?.email || 'Unknown User';

    const handleSetupDemoData = async () => {
        if (!user) {
            notifications.show({
                title: 'Login Required',
                message: 'Please log in before setting up demo data',
                color: 'orange',
            });
            return;
        }

        setIsSettingUp(true);
        try {
            // Create demo course (no createdBy so any teacher can access)
            const courseData = {
                id: 'demo-course-789',
                name: 'Demo Course - IELTS Preparation',
                code: 'DEMO-IELTS-001',
                description: 'Demo course for testing feedback components',
                type: 'public',
                visibility: 'public',
                createdAt: Date.now(),
            };

            await set(ref(database, 'courses/demo-course-789'), courseData);

            // Create demo test result
            const resultData = {
                id: MOCK_RESULT_ID,
                studentId: MOCK_STUDENT_ID,
                studentName: MOCK_STUDENT_NAME,
                courseId: 'demo-course-789',
                testName: MOCK_TEST_NAME,
                score: 75,
                totalQuestions: 3,
                correctAnswers: 2,
                completedAt: Date.now(),
                answers: {
                    q1: {
                        questionId: 'q1',
                        answer: 'B',
                        isCorrect: true,
                        points: 1
                    },
                    q2: {
                        questionId: 'q2',
                        answer: 'greenhouse gases, deforestation',
                        isCorrect: false,
                        points: 0
                    },
                    q3: {
                        questionId: 'q3',
                        answer: 'C',
                        isCorrect: true,
                        points: 1
                    }
                }
            };

            await set(ref(database, `test_results/${MOCK_RESULT_ID}`), resultData);

            notifications.show({
                title: 'Demo Data Created',
                message: 'You can now test the feedback components!',
                color: 'green',
            });

            // Refresh components to load the new data
            handleRefresh();
        } catch (error) {
            console.error('Error setting up demo data:', error);
            notifications.show({
                title: 'Setup Failed',
                message: 'Failed to create demo data. Check console for details.',
                color: 'red',
            });
        } finally {
            setIsSettingUp(false);
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 50%, rgba(240, 253, 250, 0.95) 100%)',
                padding: '2rem',
            }}
        >
            <Container size="xl">
                <Stack gap="xl">
                    {/* Header */}
                    <Paper p="xl" radius="md" withBorder style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}>
                        <Stack gap="md">
                            <Group justify="space-between">
                                <Group gap="md">
                                    <IconMessageCircle size={40} color="#228be6" />
                                    <div>
                                        <Title order={1} style={{ color: '#228be6' }}>
                                            Feedback Components Demo
                                        </Title>
                                        <Text size="sm" c="dimmed" mt={4}>
                                            Test the teacher and student feedback components
                                        </Text>
                                    </div>
                                </Group>
                                <Badge size="lg" variant="light" color="green">
                                    Phase 5 - Live Demo
                                </Badge>
                            </Group>

                            {/* Mock Data Info */}
                            <Paper p="md" radius="sm" style={{ backgroundColor: 'rgba(34, 139, 230, 0.05)' }}>
                                <Text size="sm" fw={600} mb="xs">Mock Data:</Text>
                                <Stack gap={4}>
                                    <Text size="xs" c="dimmed">Result ID: {MOCK_RESULT_ID}</Text>
                                    <Text size="xs" c="dimmed">Student: {MOCK_STUDENT_NAME} ({MOCK_STUDENT_ID})</Text>
                                    <Text size="xs" c="dimmed">Teacher: {teacherName} ({teacherId})</Text>
                                    <Text size="xs" c="dimmed">Test: {MOCK_TEST_NAME}</Text>
                                    <Text size="xs" c="dimmed">Questions: {MOCK_QUESTIONS.length}</Text>
                                </Stack>
                            </Paper>

                            {/* Login Warning */}
                            {!user && (
                                <Alert
                                    icon={<IconAlertCircle size={16} />}
                                    color="orange"
                                    variant="light"
                                >
                                    <Text size="sm" fw={600}>Not Logged In</Text>
                                    <Text size="xs" mt={4}>
                                        You need to log in to test the feedback components. The permission check will fail without authentication.
                                    </Text>
                                </Alert>
                            )}

                            {/* Instructions */}
                            <Paper p="md" radius="sm" style={{ backgroundColor: 'rgba(255, 193, 7, 0.05)', borderLeft: '4px solid #ffc107' }}>
                                <Text size="sm" fw={600} mb="xs">📝 Instructions:</Text>
                                <Stack gap={4}>
                                    <Text size="xs">1. Click "Setup Demo Data" to create test data in Firebase (one-time setup)</Text>
                                    <Text size="xs">2. Switch between Teacher and Student tabs to see both views</Text>
                                    <Text size="xs">3. As Teacher: Add feedback and save (will trigger notification)</Text>
                                    <Text size="xs">4. As Student: View the feedback you added</Text>
                                    <Text size="xs">5. Click "Refresh Components" to reload data</Text>
                                    <Text size="xs">6. Check browser console for Firebase operations</Text>
                                </Stack>
                            </Paper>

                            <Group>
                                <Button
                                    variant="filled"
                                    color="green"
                                    onClick={handleSetupDemoData}
                                    loading={isSettingUp}
                                    leftSection={<IconDatabase size={16} />}
                                    disabled={!user}
                                >
                                    Setup Demo Data
                                </Button>
                                <Button
                                    variant="light"
                                    onClick={handleRefresh}
                                    leftSection={<IconMessageCircle size={16} />}
                                >
                                    Refresh Components
                                </Button>
                            </Group>
                        </Stack>
                    </Paper>

                    {/* Tabs */}
                    <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'teacher')}>
                        <Tabs.List>
                            <Tabs.Tab
                                value="teacher"
                                leftSection={<IconSchool size={16} />}
                            >
                                Teacher View
                            </Tabs.Tab>
                            <Tabs.Tab
                                value="student"
                                leftSection={<IconUser size={16} />}
                            >
                                Student View
                            </Tabs.Tab>
                        </Tabs.List>

                        {/* Teacher Tab */}
                        <Tabs.Panel value="teacher" pt="xl">
                            <Paper p="xl" radius="md" withBorder style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}>
                                <Stack gap="md">
                                    <div>
                                        <Title order={2} size="h3" mb="xs">
                                            Teacher Feedback Manager
                                        </Title>
                                        <Text size="sm" c="dimmed">
                                            Add feedback for {MOCK_STUDENT_NAME}'s test result
                                        </Text>
                                    </div>

                                    <TeacherFeedbackManager
                                        key={`teacher-${refreshKey}`}
                                        resultId={MOCK_RESULT_ID}
                                        studentId={MOCK_STUDENT_ID}
                                        studentName={MOCK_STUDENT_NAME}
                                        testName={MOCK_TEST_NAME}
                                        questions={MOCK_QUESTIONS}
                                        teacherId={teacherId}
                                        teacherName={teacherName}
                                    />
                                </Stack>
                            </Paper>
                        </Tabs.Panel>

                        {/* Student Tab */}
                        <Tabs.Panel value="student" pt="xl">
                            <Paper p="xl" radius="md" withBorder style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}>
                                <Stack gap="md">
                                    <div>
                                        <Title order={2} size="h3" mb="xs">
                                            Student Feedback Viewer
                                        </Title>
                                        <Text size="sm" c="dimmed">
                                            View feedback from your teacher
                                        </Text>
                                    </div>

                                    <StudentFeedbackViewer
                                        key={`student-${refreshKey}`}
                                        resultId={MOCK_RESULT_ID}
                                        questions={MOCK_QUESTIONS}
                                        highlightNew={true}
                                    />
                                </Stack>
                            </Paper>
                        </Tabs.Panel>
                    </Tabs>

                    {/* Footer Info */}
                    <Paper p="md" radius="md" style={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                        <Text size="xs" c="dimmed" ta="center">
                            💡 Tip: Open browser DevTools (F12) → Console to see Firebase operations and logs
                        </Text>
                    </Paper>
                </Stack>
            </Container>
        </div>
    );
};

export default FeedbackComponentsDemo;
