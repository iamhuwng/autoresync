import React, { useState, useEffect } from 'react';
import { Stack, Paper, Text, Alert, Loader, Center, Badge, Group } from '@mantine/core';
import { IconMessageCircle, IconSparkles } from '@tabler/icons-react';
import { FeedbackDisplay } from '../feedback/FeedbackDisplay';
import {
    getAllQuestionFeedback,
    getOverallFeedback
} from '@/services/feedbackService';
import { ref, onValue } from 'firebase/database';
import { database } from '@/services/firebase';

/**
 * StudentFeedbackViewer Component
 * 
 * Displays teacher feedback for a student's test result.
 * Shows feedback for each question and overall feedback.
 * Supports real-time updates when teacher adds new feedback.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

export interface Question {
    id: string;
    number: number;
    text: string;
}

export interface StudentFeedbackViewerProps {
    /** The test result ID */
    resultId: string;
    /** Array of questions from the test */
    questions: Question[];
    /** Whether to show a "new feedback" indicator */
    highlightNew?: boolean;
}

export const StudentFeedbackViewer: React.FC<StudentFeedbackViewerProps> = ({
    resultId,
    questions,
    highlightNew = false
}) => {
    const [loading, setLoading] = useState(true);
    const [questionFeedback, setQuestionFeedback] = useState<Record<string, any>>({});
    const [overallFeedback, setOverallFeedback] = useState<any>(null);
    const [hasNewFeedback, setHasNewFeedback] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load feedback data
     */
    const loadFeedback = async () => {
        try {
            const [qFeedback, oFeedback] = await Promise.all([
                getAllQuestionFeedback(resultId),
                getOverallFeedback(resultId)
            ]);

            setQuestionFeedback(qFeedback);
            setOverallFeedback(oFeedback);
            setLoading(false);
        } catch (err) {
            console.error('Error loading feedback:', err);
            setError('Failed to load feedback');
            setLoading(false);
        }
    };

    /**
     * Initial load
     */
    useEffect(() => {
        loadFeedback();
    }, [resultId]);

    /**
     * Set up real-time listener for feedback updates
     */
    useEffect(() => {
        if (!resultId) return;

        // Listen for feedback updates
        const feedbackRef = ref(database, `test_results/${resultId}/feedbackUpdatedAt`);

        const unsubscribe = onValue(feedbackRef, (snapshot) => {
            if (snapshot.exists()) {
                const updatedAt = snapshot.val();
                const lastChecked = localStorage.getItem(`feedback_checked_${resultId}`);

                // Check if this is new feedback
                if (lastChecked && updatedAt > parseInt(lastChecked)) {
                    setHasNewFeedback(true);
                }

                // Reload feedback data
                loadFeedback();
            }
        });

        // Mark as checked when component unmounts
        return () => {
            localStorage.setItem(`feedback_checked_${resultId}`, Date.now().toString());
            unsubscribe();
        };
    }, [resultId]);

    /**
     * Check if there's any feedback
     */
    const hasFeedback = Object.keys(questionFeedback).length > 0 || overallFeedback !== null;

    /**
     * Render loading state
     */
    if (loading) {
        return (
            <Center p="xl">
                <Loader size="md" />
            </Center>
        );
    }

    /**
     * Render error state
     */
    if (error) {
        return (
            <Alert color="red" variant="light">
                <Text size="sm">{error}</Text>
            </Alert>
        );
    }

    /**
     * Render empty state
     */
    if (!hasFeedback) {
        return (
            <Paper p="xl" radius="md" withBorder style={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                <Center>
                    <Stack align="center" gap="sm">
                        <IconMessageCircle size={48} color="#adb5bd" />
                        <Text size="sm" c="dimmed" ta="center">
                            No feedback available yet
                        </Text>
                        <Text size="xs" c="dimmed" ta="center">
                            Your teacher hasn't provided feedback for this test yet.
                        </Text>
                    </Stack>
                </Center>
            </Paper>
        );
    }

    return (
        <Stack gap="lg">
            {/* New Feedback Banner */}
            {(hasNewFeedback || highlightNew) && (
                <Alert
                    icon={<IconSparkles size={16} />}
                    color="blue"
                    variant="filled"
                    withCloseButton
                    onClose={() => setHasNewFeedback(false)}
                >
                    <Text fw={600} size="sm">
                        New feedback available from your teacher!
                    </Text>
                </Alert>
            )}

            {/* Header */}
            <Paper p="md" radius="md" withBorder style={{ backgroundColor: 'rgba(34, 139, 230, 0.05)' }}>
                <Stack gap="xs">
                    <Group gap="xs">
                        <IconMessageCircle size={20} color="#228be6" />
                        <Text size="md" fw={600} c="blue">
                            Teacher Feedback
                        </Text>
                        {hasFeedback && (
                            <Badge size="sm" variant="light" color="blue">
                                {Object.keys(questionFeedback).length + (overallFeedback ? 1 : 0)} feedback(s)
                            </Badge>
                        )}
                    </Group>
                    <Text size="sm" c="dimmed">
                        Your teacher has provided personalized feedback to help you improve.
                    </Text>
                </Stack>
            </Paper>

            {/* Per-Question Feedback */}
            {Object.keys(questionFeedback).length > 0 && (
                <Stack gap="md">
                    <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                        Question Feedback
                    </Text>

                    {questions.map((question) => {
                        const feedback = questionFeedback[question.id];
                        if (!feedback) return null;

                        return (
                            <FeedbackDisplay
                                key={question.id}
                                feedback={feedback.feedback}
                                teacherName={feedback.teacherName}
                                updatedAt={feedback.updatedAt}
                                questionId={question.id}
                                questionText={question.text}
                                variant={hasNewFeedback ? 'highlighted' : 'default'}
                            />
                        );
                    })}
                </Stack>
            )}

            {/* Overall Feedback */}
            {overallFeedback && (
                <Stack gap="md">
                    <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                        Overall Feedback
                    </Text>

                    <FeedbackDisplay
                        feedback={overallFeedback.feedback}
                        teacherName={overallFeedback.teacherName}
                        updatedAt={overallFeedback.updatedAt}
                        isOverall={true}
                        variant="highlighted"
                    />
                </Stack>
            )}
        </Stack>
    );
};

export default StudentFeedbackViewer;
