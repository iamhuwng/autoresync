import React, { useState, useEffect } from 'react';
import { Stack, Paper, Text, Divider, Alert, Loader, Center, Group } from '@mantine/core';
import { IconMessageCircle, IconAlertCircle } from '@tabler/icons-react';
import { FeedbackEditor } from '../feedback/FeedbackEditor';
import {
    saveQuestionFeedback,
    saveOverallFeedback,
    getAllQuestionFeedback,
    getOverallFeedback,
    canTeacherEditFeedback
} from '@/services/feedbackService';
import { sendFeedbackNotification } from '@/services/notificationService';

/**
 * TeacherFeedbackManager Component
 * 
 * Manages teacher feedback for a student's test result.
 * Displays feedback editors for each question and overall feedback.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

export interface Question {
    id: string;
    number: number;
    text: string;
    type: string;
}

export interface TeacherFeedbackManagerProps {
    /** The test result ID */
    resultId: string;
    /** The student's user ID */
    studentId: string;
    /** The student's name */
    studentName: string;
    /** The test name */
    testName: string;
    /** Array of questions from the test */
    questions: Question[];
    /** Current teacher's user ID */
    teacherId: string;
    /** Current teacher's name */
    teacherName?: string;
    /** Course ID for permission checking */
    courseId?: string;
    /** Whether to notify the student after a successful feedback save */
    notifyStudentOnSave?: boolean;
}

export const TeacherFeedbackManager: React.FC<TeacherFeedbackManagerProps> = ({
    resultId,
    studentId,
    studentName,
    testName,
    questions,
    teacherId,
    teacherName,
    courseId: _courseId,
    notifyStudentOnSave = false,
}) => {
    const [loading, setLoading] = useState(true);
    const [canEdit, setCanEdit] = useState(false);
    const [questionFeedback, setQuestionFeedback] = useState<Record<string, any>>({});
    const [overallFeedback, setOverallFeedback] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load existing feedback and check permissions
     */
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Check if teacher can edit feedback
                const hasPermission = await canTeacherEditFeedback(resultId, teacherId);
                setCanEdit(hasPermission);

                if (!hasPermission) {
                    setError('You do not have permission to add feedback to this result.');
                    setLoading(false);
                    return;
                }

                // Load existing feedback
                const [qFeedback, oFeedback] = await Promise.all([
                    getAllQuestionFeedback(resultId),
                    getOverallFeedback(resultId)
                ]);

                setQuestionFeedback(qFeedback);
                setOverallFeedback(oFeedback);
                setLoading(false);
            } catch (err) {
                console.error('Error loading feedback:', err);
                setError('Failed to load feedback data');
                setLoading(false);
            }
        };

        loadData();
    }, [resultId, teacherId]);

    /**
     * Handle saving question feedback
     */
    const handleSaveQuestionFeedback = async (questionId: string, feedback: string) => {
        try {
            await saveQuestionFeedback(
                resultId,
                questionId,
                feedback,
                teacherId,
                teacherName
            );

            // Send notification to student
            if (notifyStudentOnSave) {
                await sendFeedbackNotification(
                    studentId,
                    resultId,
                    testName,
                    teacherName
                );
            }

            // Reload feedback to get updated data
            const updatedFeedback = await getAllQuestionFeedback(resultId);
            setQuestionFeedback(updatedFeedback);

            console.log(`✅ Question feedback saved for ${questionId}`);
        } catch (err) {
            console.error('Error saving question feedback:', err);
            throw err;
        }
    };

    /**
     * Handle saving overall feedback
     */
    const handleSaveOverallFeedback = async (feedback: string) => {
        try {
            await saveOverallFeedback(
                resultId,
                feedback,
                teacherId,
                teacherName
            );

            // Send notification to student
            if (notifyStudentOnSave) {
                await sendFeedbackNotification(
                    studentId,
                    resultId,
                    testName,
                    teacherName
                );
            }

            // Reload feedback to get updated data
            const updatedFeedback = await getOverallFeedback(resultId);
            setOverallFeedback(updatedFeedback);

            console.log('✅ Overall feedback saved');
        } catch (err) {
            console.error('Error saving overall feedback:', err);
            throw err;
        }
    };

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
    if (error || !canEdit) {
        return (
            <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                variant="light"
            >
                <Text size="sm">{error || 'You cannot add feedback to this result.'}</Text>
            </Alert>
        );
    }

    return (
        <Stack gap="lg">
            {/* Header */}
            <Paper p="md" radius="md" withBorder style={{ backgroundColor: 'rgba(34, 139, 230, 0.05)' }}>
                <Group gap="xs">
                    <IconMessageCircle size={20} color="#228be6" />
                    <Text size="md" fw={600} c="blue">
                        Provide Feedback for {studentName}
                    </Text>
                </Group>
                <Text size="sm" c="dimmed" mt="xs">
                    Add personalized feedback to help the student improve. Students will be notified when you save feedback.
                </Text>
            </Paper>

            {/* Per-Question Feedback */}
            {questions.length > 0 && (
                <Stack gap="md">
                    <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                        Question Feedback
                    </Text>

                    {questions.map((question) => (
                        <Paper key={question.id} p="md" radius="md" withBorder>
                            <Stack gap="sm">
                                <Text size="sm" fw={600}>
                                    Question {question.number}
                                </Text>
                                <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                                    {question.text}
                                </Text>
                                <Divider />
                                <FeedbackEditor
                                    questionId={question.id}
                                    questionText={question.text}
                                    initialFeedback={questionFeedback[question.id]?.feedback || ''}
                                    onSave={(feedback) => handleSaveQuestionFeedback(question.id, feedback)}
                                    placeholder={`Provide feedback for question ${question.number}...`}
                                    minRows={2}
                                    maxRows={6}
                                />
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}

            {/* Overall Feedback */}
            <Stack gap="md">
                <Divider
                    label={
                        <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                            Overall Feedback
                        </Text>
                    }
                    labelPosition="center"
                />

                <Paper p="md" radius="md" withBorder style={{ backgroundColor: 'rgba(34, 139, 230, 0.03)' }}>
                    <FeedbackEditor
                        initialFeedback={overallFeedback?.feedback || ''}
                        onSave={handleSaveOverallFeedback}
                        isOverall={true}
                        placeholder={`Provide overall feedback on ${studentName}'s performance...`}
                        minRows={4}
                        maxRows={12}
                    />
                </Paper>
            </Stack>
        </Stack>
    );
};

export default TeacherFeedbackManager;
