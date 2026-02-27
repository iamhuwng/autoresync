/**
 * Student Solo Test Page
 * PRD-0016: Solo Study & Homework System
 * 
 * Self-paced practice page for students.
 * Reuses existing test components from StudentTestPage.
 * 
 * Now supports both modes:
 * - Solo Study: Self-study from library (context.type = 'self_study')
 * - Homework: Teacher-assigned homework (context.type = 'homework')
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    Container,
    Paper,
    Title,
    Text,
    Button,
    Group,
    Stack,
    Badge,
    Progress,
    Modal,
    Loader,
    Alert,
    ActionIcon,
    Box
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    IconClock,
    IconCheck,
    IconAlertCircle,
    IconPlayerPause,
    IconPlayerPlay,
    IconX,
    IconAlertTriangle
} from '@tabler/icons-react';
import { useSoloSession } from '../hooks/useSoloSession';
import { useAuth } from '../contexts/AuthContext';
import { getTestFromFirebase } from '../services/testStorage';
import { IELTSQuestionsPanel } from '../components/test/IELTSQuestionsPanel';
import { QuestionNavigator } from '../components/test/QuestionNavigator';
import { submitHomework, updateSubmission } from '../services/homeworkSubmissionService';
import type { TestData } from '../services/testStorage';
import type { HomeworkConfig } from '../types/homework.types';

// ============================================================================
// TYPES
// ============================================================================

interface HomeworkLocationState {
    submissionId: string;
    homeworkId: string;
    materialId: string;
    isHomework: boolean;
    config?: HomeworkConfig;
    resuming?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const StudentSoloTestPage: React.FC = () => {
    const { materialId: urlMaterialId } = useParams<{ materialId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    // Responsive breakpoint detection
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Parse location state for homework context
    const homeworkState = location.state as HomeworkLocationState | null;
    const isHomework = homeworkState?.isHomework || false;
    const homeworkId = homeworkState?.homeworkId;
    const submissionId = homeworkState?.submissionId;
    const homeworkConfig = homeworkState?.config;

    // Material ID can come from URL param (solo study) or location state (homework)
    const materialId = homeworkState?.materialId || urlMaterialId || '';

    // State
    const [material, setMaterial] = useState<TestData | null>(null);
    const [isLoadingMaterial, setIsLoadingMaterial] = useState(true);
    const [materialError, setMaterialError] = useState<string | null>(null);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [showExitModal, setShowExitModal] = useState(false);
    // Note: isLateSubmission state would be set based on homework due date vs current time
    // For now, we'll derive it from homeworkState if provided

    // Build context based on mode (homework vs self_study)
    const sessionContext = useMemo(() => {
        if (isHomework && homeworkId) {
            return {
                type: 'homework' as const,
                source: {
                    type: 'homework' as const,
                    id: homeworkId,
                    name: '' // Will be set after material loads
                }
            };
        }

        return {
            type: 'self_study' as const,
            source: {
                type: 'library' as const,
                id: materialId,
                name: '' // Will be set after material loads
            }
        };
    }, [isHomework, homeworkId, materialId]);

    // Solo session hook - uses homework config if available
    const {
        session,
        isLoading: isLoadingSession,
        error: sessionError,
        timeRemaining,
        answers,
        setAnswer,
        currentQuestion,
        setCurrentQuestion,
        nextQuestion,
        prevQuestion,
        pauseSession,
        resumeSession,
        submitSession,
        abandonSession,
        isSubmitting,
        isCompleted,
        resultId
    } = useSoloSession({
        studentId: user?.uid || '',
        materialId: materialId,
        context: sessionContext,
        autoSaveInterval: 30,
        autoSubmitOnTimeout: true
    });

    /**
     * Load material data
     */
    useEffect(() => {
        const loadMaterial = async () => {
            if (!materialId) {
                setMaterialError('No material ID provided');
                setIsLoadingMaterial(false);
                return;
            }

            try {
                const result = await getTestFromFirebase(materialId);

                if (!result.success || !result.data) {
                    throw new Error(result.error || 'Material not found');
                }

                setMaterial(result.data);
            } catch (err) {
                console.error('Error loading material:', err);
                setMaterialError(err instanceof Error ? err.message : 'Failed to load material');
            } finally {
                setIsLoadingMaterial(false);
            }
        };

        loadMaterial();
    }, [materialId]);

    /**
     * Navigate to results when completed
     */
    useEffect(() => {
        if (isCompleted && resultId) {
            // Navigate to the correct result detail page route
            navigate(`/result/${resultId}`);
        }
    }, [isCompleted, resultId, navigate]);

    /**
     * Handle answer change
     */
    const handleAnswerChange = useCallback((questionNumber: number, answer: any) => {
        setAnswer(questionNumber, answer);

        // For homework, update submission progress periodically
        if (isHomework && submissionId) {
            updateSubmissionProgress();
        }
    }, [setAnswer, isHomework, submissionId]);

    /**
     * Update homework submission progress
     */
    const updateSubmissionProgress = useCallback(async () => {
        if (!submissionId || !session) return;

        try {
            const timeSpent = Math.floor((Date.now() - session.startedAt) / 1000);
            await updateSubmission(submissionId, {
                timeSpent
            });
        } catch (err) {
            console.error('Error updating submission progress:', err);
        }
    }, [submissionId, session]);

    /**
     * Handle submit confirmation
     */
    const handleSubmitClick = () => {
        // Check if this would be a late submission
        if (isHomework && homeworkConfig) {
            // Note: We already determined late status when starting the attempt
            // This is just a reminder for the user
        }
        setShowSubmitModal(true);
    };

    /**
     * Handle actual submission
     */
    const handleConfirmSubmit = async () => {
        setShowSubmitModal(false);
        try {
            // Submit the solo session first to get the result
            const generatedResultId = await submitSession();

            // If this is homework, also update the homework submission
            if (isHomework && submissionId && generatedResultId) {
                const timeSpent = session ? Math.floor((Date.now() - session.startedAt) / 1000) : 0;

                // Note: Score will be calculated and updated from the result
                // Here we just link the result to the submission
                await submitHomework(
                    submissionId,
                    generatedResultId,
                    0,  // score - will be updated when results are ready
                    100, // maxScore - placeholder
                    0,  // percentage - will be updated when results are ready
                    undefined, // bandScore
                    timeSpent
                );

                console.log('✅ Homework submission completed');
            }
        } catch (err) {
            console.error('Error submitting session:', err);
            alert('Failed to submit test. Please try again.');
        }
    };

    /**
     * Handle pause/resume
     */
    const handlePauseResume = async () => {
        try {
            if (session?.status === 'paused') {
                await resumeSession();
            } else {
                await pauseSession();
            }
        } catch (err) {
            console.error('Error pausing/resuming:', err);
        }
    };

    /**
     * Handle exit attempt
     */
    const handleExitClick = () => {
        setShowExitModal(true);
    };

    /**
     * Handle confirmed exit
     */
    const handleConfirmExit = async () => {
        try {
            await abandonSession();
            navigateBack();
        } catch (err) {
            console.error('Error abandoning session:', err);
            navigateBack();
        }
    };

    /**
     * Navigate back to appropriate page based on mode
     */
    const navigateBack = () => {
        if (isHomework && homeworkId) {
            navigate(`/student/homework/${homeworkId}`);
        } else {
            navigate('/student/library');
        }
    };

    /**
     * Format time remaining
     */
    const formatTime = (seconds: number | null): string => {
        if (seconds === null) return 'No time limit';

        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    /**
     * Calculate progress
     */
    const answeredCount = Object.keys(answers).length;
    const totalQuestions = material?.questionCount || 0;
    const progressPercentage = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

    /**
     * Check if this is a late submission (past due date for homework)
     */
    const isLateSubmission = isHomework && homeworkConfig
        ? false // Late status would be determined from homework scheduling.dueDate
        : false;

    // Loading state
    if (isLoadingMaterial || isLoadingSession) {
        return (
            <Container size="xl" py="xl">
                <Stack align="center" gap="md">
                    <Loader size="lg" />
                    <Text>
                        {isHomework ? 'Loading homework...' : 'Loading practice session...'}
                    </Text>
                </Stack>
            </Container>
        );
    }

    // Error state
    if (materialError || sessionError) {
        return (
            <Container size="xl" py="xl">
                <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
                    {materialError || sessionError}
                </Alert>
                <Button mt="md" onClick={navigateBack}>
                    {isHomework ? 'Back to Homework' : 'Back to Library'}
                </Button>
            </Container>
        );
    }

    // No material or session
    if (!material || !session) {
        return (
            <Container size="xl" py="xl">
                <Alert icon={<IconAlertCircle size={16} />} title="Not Found" color="yellow">
                    Material or session not found
                </Alert>
                <Button mt="md" onClick={navigateBack}>
                    {isHomework ? 'Back to Homework' : 'Back to Library'}
                </Button>
            </Container>
        );
    }

    return (
        <Container size="xl" py="md">
            {/* Header */}
            <Paper p="md" mb="md" withBorder>
                <Group justify="space-between" align="flex-start">
                    <div style={{ flex: 1 }}>
                        <Group gap="xs" mb="xs">
                            <Title order={3}>{material.title}</Title>
                            <Badge color={isHomework ? 'orange' : 'blue'} variant="light">
                                {isHomework ? 'Homework' : 'Solo Practice'}
                            </Badge>
                            {session.status === 'paused' && (
                                <Badge color="yellow" variant="light">
                                    Paused
                                </Badge>
                            )}
                            {isLateSubmission && (
                                <Badge color="red" variant="light">
                                    Late Submission
                                </Badge>
                            )}
                        </Group>
                        <Group gap="md">
                            <Text size="sm" c="dimmed">
                                {material.skill} • {material.type}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {totalQuestions} questions
                            </Text>
                        </Group>
                    </div>

                    {/* Timer */}
                    {timeRemaining !== null && (
                        <Paper p="sm" withBorder>
                            <Group gap="xs">
                                <IconClock size={20} />
                                <div>
                                    <Text size="xs" c="dimmed">
                                        Time Remaining
                                    </Text>
                                    <Text fw={600} size="lg" c={timeRemaining < 300 ? 'red' : undefined}>
                                        {formatTime(timeRemaining)}
                                    </Text>
                                </div>
                            </Group>
                        </Paper>
                    )}

                    {/* Exit button */}
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={handleExitClick}
                        size="lg"
                    >
                        <IconX size={20} />
                    </ActionIcon>
                </Group>

                {/* Progress bar */}
                <div style={{ marginTop: '1rem' }}>
                    <Group justify="space-between" mb="xs">
                        <Text size="sm" fw={500}>
                            Progress
                        </Text>
                        <Text size="sm" c="dimmed">
                            {answeredCount} / {totalQuestions} answered
                        </Text>
                    </Group>
                    <Progress value={progressPercentage} size="sm" />
                </div>
            </Paper>

            {/* Main content - Responsive layout */}
            <Box
                style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
                    gap: '1rem',
                }}
            >
                {/* Left: Questions */}
                <Paper p="md" withBorder>
                    <IELTSQuestionsPanel
                        questions={material.questions}
                        currentPassageId={null}
                        answers={answers}
                        onAnswerChange={handleAnswerChange}
                        activeQuestionNumber={currentQuestion + 1}
                        onQuestionClick={(num) => setCurrentQuestion(num - 1)}
                        skill={material.skillType}
                    />
                </Paper>

                {/* Right: Navigation & Controls */}
                <Stack gap="md">
                    {/* Question Navigator */}
                    <Paper p="md" withBorder>
                        <QuestionNavigator
                            totalQuestions={totalQuestions}
                            currentQuestion={currentQuestion + 1}
                            answeredQuestions={new Set(
                                Object.keys(answers)
                                    .filter(key => answers[key] !== undefined && answers[key] !== '')
                                    .map(key => parseInt(key))
                            )}
                            onQuestionClick={(num) => setCurrentQuestion(num - 1)}
                        />
                    </Paper>

                    {/* Navigation buttons */}
                    <Paper p="md" withBorder>
                        <Stack gap="sm">
                            <Group grow>
                                <Button
                                    variant="light"
                                    onClick={prevQuestion}
                                    disabled={currentQuestion === 0}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="light"
                                    onClick={nextQuestion}
                                    disabled={currentQuestion === totalQuestions - 1}
                                >
                                    Next
                                </Button>
                            </Group>

                            {/* Pause/Resume - Only for self-study mode */}
                            {!isHomework && (
                                <Button
                                    variant="outline"
                                    leftSection={session.status === 'paused' ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
                                    onClick={handlePauseResume}
                                    fullWidth
                                >
                                    {session.status === 'paused' ? 'Resume' : 'Pause'}
                                </Button>
                            )}

                            {/* Submit */}
                            <Button
                                color="green"
                                leftSection={<IconCheck size={16} />}
                                onClick={handleSubmitClick}
                                loading={isSubmitting}
                                fullWidth
                            >
                                Submit {isHomework ? 'Homework' : 'Test'}
                            </Button>
                        </Stack>
                    </Paper>

                    {/* Homework Info */}
                    {isHomework && (
                        <Paper p="md" withBorder bg="orange.0">
                            <Stack gap="xs">
                                <Group gap="xs">
                                    <IconAlertTriangle size={16} color="orange" />
                                    <Text size="sm" fw={500} c="orange.8">
                                        Homework Mode
                                    </Text>
                                </Group>
                                <Text size="xs" c="dimmed">
                                    Your progress is automatically saved. Submit when you're done!
                                </Text>
                            </Stack>
                        </Paper>
                    )}

                    {/* Self-study Info */}
                    {!isHomework && (
                        <Paper p="md" withBorder bg="blue.0">
                            <Text size="sm" c="dimmed">
                                💡 Your progress is automatically saved every 30 seconds
                            </Text>
                        </Paper>
                    )}
                </Stack>
            </Box>

            {/* Submit Confirmation Modal */}
            <Modal
                opened={showSubmitModal}
                onClose={() => setShowSubmitModal(false)}
                title={isHomework ? "Submit Homework?" : "Submit Test?"}
                centered
            >
                <Stack gap="md">
                    <Text>
                        Are you sure you want to submit your {isHomework ? 'homework' : 'test'}?
                    </Text>
                    <Text size="sm" c="dimmed">
                        You have answered {answeredCount} out of {totalQuestions} questions.
                    </Text>
                    {answeredCount < totalQuestions && (
                        <Alert icon={<IconAlertCircle size={16} />} color="yellow">
                            You have {totalQuestions - answeredCount} unanswered question(s).
                        </Alert>
                    )}
                    {isLateSubmission && (
                        <Alert icon={<IconAlertTriangle size={16} />} color="orange">
                            This will be marked as a late submission.
                        </Alert>
                    )}
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setShowSubmitModal(false)}>
                            Cancel
                        </Button>
                        <Button color="green" onClick={handleConfirmSubmit} loading={isSubmitting}>
                            Submit
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Exit Confirmation Modal */}
            <Modal
                opened={showExitModal}
                onClose={() => setShowExitModal(false)}
                title={isHomework ? "Exit Homework?" : "Exit Practice?"}
                centered
            >
                <Stack gap="md">
                    <Text>
                        {isHomework
                            ? 'Are you sure you want to exit? Your progress is saved, and you can resume later.'
                            : 'Are you sure you want to exit? Your progress will be saved but the session will be abandoned.'}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setShowExitModal(false)}>
                            Cancel
                        </Button>
                        <Button color="red" onClick={handleConfirmExit}>
                            Exit
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
};

export default StudentSoloTestPage;
