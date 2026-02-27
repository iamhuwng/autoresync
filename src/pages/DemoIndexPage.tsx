/**
 * DemoIndexPage
 * 
 * Central hub for accessing all demo pages for PRD-0015 features.
 * Provides easy navigation to test components without authentication.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Container,
    Stack,
    Title,
    Text,
    Paper,
    SimpleGrid,
    Card,
    Group,
    Badge,
    Button,
    ThemeIcon,
} from '@mantine/core';
import {
    IconChartBar,
    IconMessageCircle,
    IconUser,
    IconArrowRight,
    IconSchool,
    IconFileText,
} from '@tabler/icons-react';

interface DemoCardProps {
    title: string;
    description: string;
    path: string;
    icon: React.ReactNode;
    phase: string;
    status: 'complete' | 'in-progress' | 'planned';
    features: string[];
}

const DemoCard: React.FC<DemoCardProps> = ({
    title,
    description,
    path,
    icon,
    phase,
    status,
    features,
}) => {
    const navigate = useNavigate();

    const statusColors = {
        complete: 'green',
        'in-progress': 'blue',
        planned: 'gray',
    };

    const statusLabels = {
        complete: '✓ Complete',
        'in-progress': '⚙ In Progress',
        planned: '○ Planned',
    };

    return (
        <Card
            shadow="md"
            padding="lg"
            radius="md"
            withBorder
            style={{
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: status === 'complete' ? 'pointer' : 'default',
            }}
            onMouseEnter={(e) => {
                if (status === 'complete') {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '';
            }}
        >
            <Stack gap="md">
                {/* Header */}
                <Group justify="space-between">
                    <ThemeIcon size="xl" radius="md" variant="light">
                        {icon}
                    </ThemeIcon>
                    <Badge color={statusColors[status]} variant="light">
                        {statusLabels[status]}
                    </Badge>
                </Group>

                {/* Title & Description */}
                <Stack gap="xs">
                    <Title order={3}>{title}</Title>
                    <Text size="sm" c="dimmed" lineClamp={2}>
                        {description}
                    </Text>
                </Stack>

                {/* Phase Badge */}
                <Badge size="sm" variant="dot" color="violet">
                    {phase}
                </Badge>

                {/* Features List */}
                <Stack gap={4}>
                    {features.map((feature, idx) => (
                        <Text key={idx} size="xs" c="dimmed" style={{ display: 'flex', alignItems: 'center' }}>
                            • {feature}
                        </Text>
                    ))}
                </Stack>

                {/* Action Button */}
                <Button
                    fullWidth
                    mt="md"
                    rightSection={<IconArrowRight size={16} />}
                    onClick={() => navigate(path)}
                    disabled={status !== 'complete'}
                    variant={status === 'complete' ? 'filled' : 'light'}
                >
                    {status === 'complete' ? 'Open Demo' : 'Coming Soon'}
                </Button>
            </Stack>
        </Card>
    );
};

export const DemoIndexPage: React.FC = () => {
    const demos: DemoCardProps[] = [
        {
            title: 'Academic Record System',
            description:
                'Full academic record page with multiple views: timeline, by course, by skill, by test type, and statistics dashboard.',
            path: '/demo/academic-record',
            icon: <IconChartBar size={28} />,
            phase: 'Phase 4',
            status: 'complete',
            features: [
                '5 organizat views (Timeline, Course, Skill, Type, Statistics)',
                'Progress tracking and analytics',
                'Interactive charts with Recharts',
                'Export to PDF/CSV',
            ],
        },
        {
            title: 'Teacher Feedback System',
            description:
                'Complete feedback workflow showing both teacher (editing) and student (viewing) perspectives for test results.',
            path: '/demo/feedback-system',
            icon: <IconMessageCircle size={28} />,
            phase: 'Phase 5',
            status: 'complete',
            features: [
                'Per-question feedback editor with autosave',
                'Overall test feedback',
                'Student feedback viewer with timestamps',
                'Live feedback state updates',
            ],
        },
        {
            title: 'Profile Completion Flow',
            description:
                'Student profile completion form with validation, avatar upload, and phone/date inputs.',
            path: '/demo/profile',
            icon: <IconUser size={28} />,
            phase: 'Phase 2',
            status: 'planned',
            features: [
                'Multi-field profile form',
                'Avatar upload with R2 integration',
                'Phone number input with country codes',
                'Date of birth input with dropdowns',
            ],
        },
        {
            title: 'Module Session & Attendance',
            description:
                'Teacher-initiated module sessions with attendance tracking and exception management.',
            path: '/demo/attendance',
            icon: <IconSchool size={28} />,
            phase: 'Phase 6',
            status: 'planned',
            features: [
                'Start sessions from course modules',
                'Automatic attendance recording',
                'Module completion tracking',
                'Individual student exceptions',
            ],
        },
        {
            title: 'Badge System',
            description:
                'Gamification badges earned based on student achievements and milestones.',
            path: '/demo/badges',
            icon: <IconFileText size={28} />,
            phase: 'Phase 8',
            status: 'planned',
            features: [
                'Badge earning logic (6 types)',
                'Badge showcase display',
                'Real-time badge notifications',
                'Integration with profile and academic record',
            ],
        },
    ];

    return (
        <Container size="xl" py="xl">
            <Stack gap="xl">
                {/* Header */}
                <Paper
                    p="xl"
                    radius="md"
                    style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                    }}
                >
                    <Stack gap="sm">
                        <Title order={1}>PRD-0015 Demo Center</Title>
                        <Text size="lg" opacity={0.9}>
                            Academic Record & Enhanced Profile System Implementation Demos
                        </Text>
                        <Badge size="lg" variant="white" color="dark" mt="sm" style={{ alignSelf: 'flex-start' }}>
                            Version 1.0.0
                        </Badge>
                    </Stack>
                </Paper>

                {/* Info Paper */}
                <Paper p="md" withBorder>
                    <Stack gap="xs">
                        <Text fw={600} size="lg">
                            About These Demos
                        </Text>
                        <Text size="sm" c="dimmed">
                            These demo pages allow you to test and explore the components and features being
                            built for PRD-0015 without requiring authentication or real data. Each demo uses mock
                            data and simulated interactions.
                        </Text>
                        <Text size="sm" c="dimmed">
                            <strong>Note:</strong> Changes made in demo pages are not persisted. Refresh the page
                            to reset to initial mock data.
                        </Text>
                    </Stack>
                </Paper>

                {/* Demo Cards Grid */}
                <SimpleGrid
                    cols={{ base: 1, sm: 2, lg: 3 }}
                    spacing="lg"
                >
                    {demos.map((demo, idx) => (
                        <DemoCard key={idx} {...demo} />
                    ))}
                </SimpleGrid>

                {/* Footer */}
                <Paper p="md" withBorder bg="gray.0">
                    <Text size="sm" c="dimmed" ta="center">
                        🚀 <strong>Implementation Progress:</strong> 2 of 10 phases complete •
                        <strong> Next up:</strong> Guest Results System (Phase 7)
                    </Text>
                </Paper>
            </Stack>
        </Container>
    );
};

export default DemoIndexPage;
