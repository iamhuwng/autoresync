/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  STUDENT VIEW DESIGN STANDARD v1.0 — ACTIVE               ║
 * ║                                                                 ║
 * ║  This file uses LEGACY styling (glassmorphism, #667eea, etc.)  ║
 * ║  that is DEPRECATED and scheduled for migration.                ║
 * ║                                                                 ║
 * ║  🚫 DO NOT copy styles from this file for new student pages.   ║
 * ║  ✅ Reference: src/pages/StudentDashboardPage.jsx               ║
 * ║  📖 Spec: documentation/design/student-view-design-standard.md ║
 * ║                                                                 ║
 * ║  BANNED patterns in this file (to be removed during migration): ║
 * ║  - #667eea / #764ba2 (purple gradients)                        ║
 * ║  - linear-gradient backgrounds                                  ║
 * ║  - .glass / .glass-card classes                                 ║
 * ║  - AppShell from @mantine/core                                  ║
 * ║  - Emoji navigation icons                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

/**
 * Student Homework Detail Page
 * PRD-0016: Solo Study & Homework System
 * 
 * UNIFIED DESIGN: Now follows app-wide design patterns with AppShell,
 * header navigation, gradient background, and modern components.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    AppShell,
    Badge,
    Group,
    Text,
    Loader,
    Stack,
    ThemeIcon,
    Divider,
    Alert,
    Modal,
    List,
    Grid,
    Timeline,
    Center
} from '@mantine/core';
import {
    IconClipboard,
    IconClock,
    IconCalendar,
    IconAlertTriangle,
    IconPlaylistAdd,
    IconBook,
    IconArrowLeft,
    IconCheck,
    IconX,
    IconInfoCircle,
    IconPlayerPlay,
    IconHistory,
    IconTrophy,
    IconEye,
    IconEyeOff,
    IconHome,
    IconBooks
} from '@tabler/icons-react';
import { useHomeworkSubmission } from '../hooks/useHomeworkSubmission';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../hooks/useNavigation';
import { getTestFromFirebase, TestData } from '../services/testStorage';
import { Card, CardBody, Button } from '../components/modern';


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const getTimeRemaining = (dueDate: number): { text: string; urgent: boolean; color: string } => {
    const now = Date.now();
    const diff = dueDate - now;

    if (diff <= 0) {
        return { text: 'Past Due', urgent: true, color: 'red' };
    }

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (hours < 1) {
        return { text: `${minutes} minutes remaining`, urgent: true, color: 'red' };
    }

    if (hours < 24) {
        return { text: `${hours} hour${hours > 1 ? 's' : ''} remaining`, urgent: true, color: 'orange' };
    }

    if (days < 7) {
        return { text: `${days} day${days > 1 ? 's' : ''} remaining`, urgent: days < 2, color: days < 2 ? 'yellow' : 'blue' };
    }

    return { text: `${days} days remaining`, urgent: false, color: 'green' };
};

const getFeedbackTimingDescription = (timing: string): string => {
    switch (timing) {
        case 'immediate': return 'Answers shown after each question';
        case 'after_completion': return 'Answers shown after you submit';
        case 'after_deadline': return 'Answers shown after deadline passes';
        case 'never': return 'Only score will be shown';
        default: return 'Unknown';
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const StudentHomeworkDetailPage: React.FC = () => {
    const { homeworkId } = useParams<{ homeworkId: string }>();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { navigateTo } = useNavigation('student');

    // State
    const [material, setMaterial] = useState<TestData | null>(null);
    const [materialLoading, setMaterialLoading] = useState(true);
    const [showStartModal, setShowStartModal] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);

    // Fetch homework data
    const {
        homework,
        currentSubmission,
        allSubmissions,
        bestSubmission,
        maxAttempts,
        attemptsUsed,
        attemptsRemaining,
        isLoading,
        error,
        isOverdue,
        isAvailable,
        canStartAttempt,
        hasInProgressAttempt,
        startAttempt
    } = useHomeworkSubmission({
        homeworkId: homeworkId || '',
        studentId: user?.uid || '',
        studentName: user?.displayName || undefined
    });

    // Load material data
    useEffect(() => {
        const loadMaterial = async () => {
            if (!homework?.materialId) return;

            try {
                setMaterialLoading(true);
                const result = await getTestFromFirebase(homework.materialId);
                if (result.success && result.data) {
                    setMaterial(result.data);
                }
            } catch (err) {
                console.error('Error loading material:', err);
            } finally {
                setMaterialLoading(false);
            }
        };

        loadMaterial();
    }, [homework?.materialId]);

    const navigateToTest = (submission?: any) => {
        if (!homework?.materialId || !homeworkId) return;
        navigate(`/student/practice/${homework.materialId}`, {
            state: {
                isHomework: true,
                homeworkId,
                submissionId: submission?.id || currentSubmission?.id,
            },
        });
    };

    const handleStartClick = () => {
        setShowStartModal(true);
    };

    const handleConfirmStart = async () => {
        try {
            setIsStarting(true);
            setStartError(null);

            const submission = await startAttempt();

            setShowStartModal(false);
            // Navigate to the test-taking interface
            navigateToTest(submission);
        } catch (err: any) {
            console.error('Error starting homework:', err);
            setStartError(err.message || 'Failed to start homework');
        } finally {
            setIsStarting(false);
        }
    };

    const handleResume = () => {
        if (currentSubmission) {
            navigateToTest(currentSubmission);
        }
    };

    const handleViewResult = (resultId: string) => {
        navigate(`/student/results/${resultId}`);
    };

    const handleLogout = () => {
        logout();
        navigateTo('LOGIN', {}, { reason: 'student_logout', replace: true });
    };

    // Loading state
    if (isLoading || materialLoading) {
        return (
            <AppShell
                header={{ height: 70 }}
                padding="md"
                style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    minHeight: '100vh'
                }}
            >
                <AppShell.Header style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(203, 213, 225, 0.3)'
                }}>
                    <div style={{
                        height: '100%',
                        padding: '0 1.5rem',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <Group gap="sm">
                            <IconClipboard size={28} color="#8b5cf6" />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                                Homework Details
                            </h2>
                        </Group>
                    </div>
                </AppShell.Header>
                <AppShell.Main>
                    <Center style={{ height: '60vh' }}>
                        <Stack align="center" gap="md">
                            <Loader size="xl" color="white" type="bars" />
                            <Text c="white" fw={500}>Loading homework...</Text>
                        </Stack>
                    </Center>
                </AppShell.Main>
            </AppShell>
        );
    }

    // Error state
    if (error || !homework) {
        return (
            <AppShell
                header={{ height: 70 }}
                padding="md"
                style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    minHeight: '100vh'
                }}
            >
                <AppShell.Header style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)'
                }}>
                    <div style={{ height: '100%', padding: '0 1.5rem', display: 'flex', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                            Homework Details
                        </h2>
                    </div>
                </AppShell.Header>
                <AppShell.Main>
                    <Center style={{ height: '60vh' }}>
                        <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)', padding: '3rem' }}>
                            <Stack align="center" gap="md">
                                <ThemeIcon size="xl" color="red" variant="light">
                                    <IconAlertTriangle size={32} />
                                </ThemeIcon>
                                <Text size="xl" fw={700} c="#1e293b">
                                    {error || 'Homework not found'}
                                </Text>
                                <Button
                                    variant="primary"
                                    leftSection={<IconArrowLeft size={16} />}
                                    onClick={() => navigateTo('STUDENT_HOMEWORK')}
                                >
                                    Back to Homework List
                                </Button>
                            </Stack>
                        </Card>
                    </Center>
                </AppShell.Main>
            </AppShell>
        );
    }

    const timeInfo = getTimeRemaining(homework.scheduling.dueDate);
    const completedSubmissions = allSubmissions.filter(s => s.status === 'submitted' || s.status === 'graded');

    return (
        <AppShell
            header={{ height: 70 }}
            padding="md"
            style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                minHeight: '100vh'
            }}
        >
            {/* Header */}
            <AppShell.Header style={{
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(203, 213, 225, 0.3)'
            }}>
                <div style={{
                    height: '100%',
                    padding: '0 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <Group gap="sm">
                        <Button
                            variant="glass"
                            onClick={() => navigateTo('STUDENT_HOMEWORK')}
                            leftSection={<IconArrowLeft size={16} />}
                        >
                            Back
                        </Button>
                        <IconClipboard size={28} color="#8b5cf6" />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                            Homework Details
                        </h2>
                    </Group>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Button
                            variant="glass"
                            onClick={() => navigateTo('STUDENT_DASHBOARD')}
                            leftSection={<IconHome size={18} />}
                        >
                            Dashboard
                        </Button>
                        <Button
                            variant="glass"
                            onClick={() => navigateTo('STUDENT_LIBRARY')}
                            leftSection={<IconBooks size={18} />}
                        >
                            Library
                        </Button>
                        <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                            {user?.displayName || user?.email}
                        </span>
                        <Button variant="glass" onClick={handleLogout}>Logout</Button>
                    </div>
                </div>
            </AppShell.Header>

            <AppShell.Main>
                <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>
                    <Stack gap="xl">
                        {/* Header Card */}
                        <Card variant="glass" style={{
                            background: 'rgba(255, 255, 255, 0.95)',
                            animation: 'slideDown 0.5s ease-out'
                        }}>
                            <CardBody style={{ padding: '2rem' }}>
                                <Stack gap="md">
                                    <Group justify="space-between" align="flex-start">
                                        <div style={{ flex: 1 }}>
                                            <h1 style={{
                                                fontSize: '1.75rem',
                                                fontWeight: '800',
                                                color: '#1e293b',
                                                margin: 0,
                                                marginBottom: '0.75rem'
                                            }}>
                                                {homework.title || homework.materialTitle}
                                            </h1>
                                            <Group gap="xs">
                                                <Badge color="blue" variant="light" size="lg">
                                                    {homework.materialSkill}
                                                </Badge>
                                                <Badge color="gray" variant="light" size="lg">
                                                    {homework.materialType}
                                                </Badge>
                                                {isOverdue && (
                                                    <Badge color="red" variant="filled" size="lg">
                                                        Overdue
                                                    </Badge>
                                                )}
                                            </Group>
                                        </div>
                                    </Group>

                                    <Divider />

                                    <Grid>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <Group gap="xs">
                                                <ThemeIcon color="gray" variant="light" size="lg">
                                                    <IconCalendar size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Due Date</Text>
                                                    <Text fw={600}>{formatDate(homework.scheduling.dueDate)}</Text>
                                                </div>
                                            </Group>
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <Group gap="xs">
                                                <ThemeIcon color={timeInfo.color} variant="light" size="lg">
                                                    <IconClock size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Time Remaining</Text>
                                                    <Text fw={600} c={timeInfo.color}>{timeInfo.text}</Text>
                                                </div>
                                            </Group>
                                        </Grid.Col>
                                    </Grid>
                                </Stack>
                            </CardBody>
                        </Card>

                        {/* Configuration Info */}
                        <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                            <CardBody style={{ padding: '1.5rem' }}>
                                <Text fw={700} size="lg" mb="md" c="#1e293b">📋 Assignment Details</Text>
                                <Grid>
                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <div style={{
                                            padding: '1rem',
                                            background: 'rgba(99, 102, 241, 0.05)',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(99, 102, 241, 0.1)'
                                        }}>
                                            <Group gap="xs">
                                                <ThemeIcon color="blue" variant="light" size="lg">
                                                    <IconClock size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Time Limit</Text>
                                                    <Text fw={600}>
                                                        {homework.config.timerMinutes
                                                            ? `${homework.config.timerMinutes} minutes`
                                                            : 'No time limit'}
                                                    </Text>
                                                </div>
                                            </Group>
                                        </div>
                                    </Grid.Col>

                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <div style={{
                                            padding: '1rem',
                                            background: 'rgba(139, 92, 246, 0.05)',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(139, 92, 246, 0.1)'
                                        }}>
                                            <Group gap="xs">
                                                <ThemeIcon color="violet" variant="light" size="lg">
                                                    <IconPlaylistAdd size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Attempts</Text>
                                                    <Text fw={600}>
                                                        {maxAttempts !== null
                                                            ? `${attemptsUsed} of ${maxAttempts} used`
                                                            : 'Unlimited attempts'}
                                                    </Text>
                                                    {attemptsRemaining !== null && attemptsRemaining > 0 && maxAttempts !== null && (
                                                        <Text size="xs" c="blue">{attemptsRemaining} remaining</Text>
                                                    )}
                                                </div>
                                            </Group>
                                        </div>
                                    </Grid.Col>

                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <div style={{
                                            padding: '1rem',
                                            background: 'rgba(20, 184, 166, 0.05)',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(20, 184, 166, 0.1)'
                                        }}>
                                            <Group gap="xs">
                                                <ThemeIcon color="teal" variant="light" size="lg">
                                                    <IconBook size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Questions</Text>
                                                    <Text fw={600}>
                                                        {material?.questions?.length || 'Loading...'} questions
                                                    </Text>
                                                </div>
                                            </Group>
                                        </div>
                                    </Grid.Col>

                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <div style={{
                                            padding: '1rem',
                                            background: 'rgba(249, 115, 22, 0.05)',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(249, 115, 22, 0.1)'
                                        }}>
                                            <Group gap="xs">
                                                <ThemeIcon color="orange" variant="light" size="lg">
                                                    {homework.config.feedbackTiming === 'never'
                                                        ? <IconEyeOff size={20} />
                                                        : <IconEye size={20} />}
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Feedback</Text>
                                                    <Text fw={600} size="sm">
                                                        {getFeedbackTimingDescription(homework.config.feedbackTiming)}
                                                    </Text>
                                                </div>
                                            </Group>
                                        </div>
                                    </Grid.Col>
                                </Grid>
                            </CardBody>
                        </Card>

                        {/* Teacher Instructions */}
                        {homework.description && (
                            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                                <CardBody>
                                    <Group gap="xs" mb="md">
                                        <ThemeIcon color="gray" variant="light">
                                            <IconInfoCircle size={20} />
                                        </ThemeIcon>
                                        <Text fw={700} size="lg" c="#1e293b">Instructions</Text>
                                    </Group>
                                    <Text style={{ whiteSpace: 'pre-wrap' }} c="#475569">
                                        {homework.description}
                                    </Text>
                                </CardBody>
                            </Card>
                        )}

                        {/* Attempt History */}
                        {completedSubmissions.length > 0 && (
                            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                                <CardBody>
                                    <Group gap="xs" mb="md">
                                        <ThemeIcon color="gray" variant="light">
                                            <IconHistory size={20} />
                                        </ThemeIcon>
                                        <Text fw={700} size="lg" c="#1e293b">Your Attempts</Text>
                                    </Group>

                                    <Timeline active={-1} bulletSize={24} lineWidth={2}>
                                        {completedSubmissions.map((submission) => (
                                            <Timeline.Item
                                                key={submission.id}
                                                bullet={
                                                    <ThemeIcon
                                                        size={24}
                                                        variant="filled"
                                                        color={submission.status === 'graded' ? 'green' : 'blue'}
                                                        radius="xl"
                                                    >
                                                        {submission.status === 'graded' ? <IconCheck size={14} /> : <IconClipboard size={14} />}
                                                    </ThemeIcon>
                                                }
                                                title={
                                                    <Group gap="xs">
                                                        <Text fw={600}>Attempt {submission.attemptNumber}</Text>
                                                        {submission.isLate && (
                                                            <Badge color="orange" size="xs">Late</Badge>
                                                        )}
                                                    </Group>
                                                }
                                            >
                                                <Group justify="space-between" mt="xs">
                                                    <div>
                                                        <Text size="sm" c="dimmed">
                                                            {new Date(submission.submittedAt || 0).toLocaleString()}
                                                        </Text>
                                                        {submission.percentage !== undefined && (
                                                            <Text size="lg" fw={700} c="blue">
                                                                {submission.percentage.toFixed(0)}%
                                                            </Text>
                                                        )}
                                                    </div>
                                                    {submission.resultId && (
                                                        <Button
                                                            variant="glass"
                                                            size="sm"
                                                            onClick={() => handleViewResult(submission.resultId!)}
                                                        >
                                                            View Details
                                                        </Button>
                                                    )}
                                                </Group>
                                            </Timeline.Item>
                                        ))}
                                    </Timeline>

                                    {bestSubmission && completedSubmissions.length > 1 && (
                                        <div style={{
                                            padding: '1rem',
                                            marginTop: '1rem',
                                            background: 'rgba(99, 102, 241, 0.1)',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(99, 102, 241, 0.2)'
                                        }}>
                                            <Group gap="xs">
                                                <ThemeIcon color="blue" variant="light">
                                                    <IconTrophy size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Best Score</Text>
                                                    <Text fw={700} size="lg" c="blue">
                                                        {bestSubmission.percentage?.toFixed(0)}%
                                                    </Text>
                                                </div>
                                            </Group>
                                        </div>
                                    )}
                                </CardBody>
                            </Card>
                        )}

                        {/* Alerts */}
                        {!isAvailable && homework.scheduling.availableFrom && (
                            <Alert icon={<IconInfoCircle size={16} />} color="blue">
                                This homework will be available starting {formatDate(homework.scheduling.availableFrom)}
                            </Alert>
                        )}

                        {isOverdue && !homework.config.lateSubmissionAllowed && (
                            <Alert icon={<IconAlertTriangle size={16} />} color="red">
                                This homework is past due and no longer accepting submissions.
                            </Alert>
                        )}

                        {isOverdue && homework.config.lateSubmissionAllowed && canStartAttempt && (
                            <Alert icon={<IconAlertTriangle size={16} />} color="orange">
                                This homework is past due. You can still submit, but it will be marked as late.
                            </Alert>
                        )}

                        {attemptsRemaining !== null && attemptsRemaining === 0 && (
                            <Alert icon={<IconX size={16} />} color="red">
                                You have used all available attempts for this homework.
                            </Alert>
                        )}

                        {/* Action Buttons */}
                        <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                            <CardBody style={{ padding: '1.5rem' }}>
                                <Group justify="center">
                                    {hasInProgressAttempt ? (
                                        <Button
                                            variant="primary"
                                            size="lg"
                                            leftSection={<IconPlayerPlay size={20} />}
                                            onClick={handleResume}
                                            style={{
                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                border: 'none',
                                                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
                                            }}
                                        >
                                            Resume Attempt
                                        </Button>
                                    ) : canStartAttempt ? (
                                        <Button
                                            variant="primary"
                                            size="lg"
                                            leftSection={<IconPlayerPlay size={20} />}
                                            onClick={handleStartClick}
                                            style={{
                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                border: 'none',
                                                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
                                            }}
                                        >
                                            Start Homework
                                            {maxAttempts !== null && (
                                                <Badge ml="sm" color="white" variant="light">
                                                    Attempt {attemptsUsed + 1}
                                                </Badge>
                                            )}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="glass"
                                            size="lg"
                                            disabled
                                        >
                                            {attemptsRemaining === 0
                                                ? 'No Attempts Remaining'
                                                : isOverdue
                                                    ? 'Homework Closed'
                                                    : 'Cannot Start'}
                                        </Button>
                                    )}
                                </Group>
                            </CardBody>
                        </Card>
                    </Stack>
                </div>
            </AppShell.Main>

            {/* Start Confirmation Modal */}
            <Modal
                opened={showStartModal}
                onClose={() => setShowStartModal(false)}
                title={<Text fw={700} size="lg">Start Homework?</Text>}
                centered
            >
                <Stack gap="md">
                    <Text>
                        You are about to start <strong>{homework.title || homework.materialTitle}</strong>.
                    </Text>

                    <List size="sm" spacing="xs">
                        {homework.config.timerMinutes && (
                            <List.Item icon={
                                <ThemeIcon color="blue" size={20} radius="xl">
                                    <IconClock size={12} />
                                </ThemeIcon>
                            }>
                                You will have <strong>{homework.config.timerMinutes} minutes</strong> to complete
                            </List.Item>
                        )}
                        {maxAttempts !== null && (
                            <List.Item icon={
                                <ThemeIcon color="violet" size={20} radius="xl">
                                    <IconPlaylistAdd size={12} />
                                </ThemeIcon>
                            }>
                                This will be attempt <strong>{attemptsUsed + 1} of {maxAttempts}</strong>
                            </List.Item>
                        )}
                        {isOverdue && (
                            <List.Item icon={
                                <ThemeIcon color="orange" size={20} radius="xl">
                                    <IconAlertTriangle size={12} />
                                </ThemeIcon>
                            }>
                                This submission will be marked as <strong>late</strong>
                            </List.Item>
                        )}
                    </List>

                    {startError && (
                        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                            {startError}
                        </Alert>
                    )}

                    <Group justify="flex-end" mt="md">
                        <Button variant="glass" onClick={() => setShowStartModal(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            leftSection={<IconPlayerPlay size={16} />}
                            onClick={handleConfirmStart}
                            loading={isStarting}
                            style={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                border: 'none'
                            }}
                        >
                            Start Now
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Animations */}
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </AppShell>
    );
};

export default StudentHomeworkDetailPage;
