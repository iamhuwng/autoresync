
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    Container,
    Paper,
    Title,
    Text,
    Badge,
    Group,
    Stack,
    Grid,
    Button,
    Loader,
    Alert,
    ThemeIcon,
    Box,
    Divider
} from '@mantine/core';
import {
    IconInfoCircle,
    IconClock,
    IconSchool,
    IconTrophy,
    IconTag,
    IconEdit,
    IconArrowLeft,
    IconBook,
    IconPlayerPlay
} from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';
import { getTestFromFirebase, TestData } from '../services/testStorage';
import { getMaterialUsageCount } from '../services/materialLinkManager';
import { getCourse } from '../services/courseManager';
import { CreateSessionModal } from '../components/session/CreateSessionModal';

const MaterialProfilePage: React.FC = () => {
    const { materialId } = useParams<{ materialId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [material, setMaterial] = useState<TestData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usageCount, setUsageCount] = useState<number>(0);
    const [courseName, setCourseName] = useState<string | null>(null);
    const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
    const { user, profile } = useAuth();

    useEffect(() => {
        const fetchCourseInfo = async () => {
            if (location.state?.courseId) {
                try {
                    const course = await getCourse(location.state.courseId);
                    if (course) setCourseName(course.name);
                } catch (e) {
                    console.error('Failed to load course info', e);
                }
            }
        };
        fetchCourseInfo();
    }, [location.state]);

    useEffect(() => {
        const fetchMaterial = async () => {
            try {
                if (!materialId) {
                    setError('Material ID is missing');
                    setLoading(false);
                    return;
                }

                const result = await getTestFromFirebase(materialId);
                if (result.success && result.data) {
                    setMaterial(result.data);

                    // Fetch usage count
                    const count = await getMaterialUsageCount(materialId);
                    setUsageCount(count);
                } else {
                    setError(result.error || 'Failed to load material');
                }
            } catch (err) {
                console.error('Error fetching material:', err);
                setError('An unexpected error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchMaterial();
    }, [materialId]);

    const handleBack = () => {
        navigate(-1);
    };

    const handleEdit = () => {
        if (materialId) {
            // Navigate to existing test builder or editor
            navigate(`/create-test?edit=${materialId}`);
        }
    };

    const handleSessionCreated = (sessionCode: string) => {
        navigate(`/teacher-lobby/${sessionCode}`);
    };

    if (loading) {
        return (
            <Container size="lg" py="xl">
                <Group justify="center" h={400} data-testid="loader">
                    <Loader size="xl" />
                </Group>
            </Container>
        );
    }

    if (error || !material) {
        return (
            <Container size="lg" py="xl">
                <Alert icon={<IconInfoCircle size={16} />} title="Error" color="red" variant="filled">
                    {error || 'Material not found'}
                </Alert>
                <Button leftSection={<IconArrowLeft size={16} />} variant="subtle" onClick={handleBack} mt="md">
                    Go Back
                </Button>
            </Container>
        );
    }

    const canEdit = user && profile && (
        profile.role === 'super_admin' ||
        user.uid === material.ownerId ||
        user.uid === material.createdBy
    );

    return (
        <Container size="lg" py="xl">
            <CreateSessionModal
                opened={isSessionModalOpen}
                onClose={() => setIsSessionModalOpen(false)}
                onSessionCreated={handleSessionCreated}
                courseId={location.state?.courseId}
                courseName={courseName}
                moduleId={location.state?.moduleId}
            />

            {/* Header Section */}
            <Group justify="space-between" mb="lg">
                <Button leftSection={<IconArrowLeft size={16} />} variant="subtle" color="gray" onClick={handleBack}>
                    Back
                </Button>
                <Group>
                    <Button
                        leftSection={<IconPlayerPlay size={16} />}
                        color="violet"
                        onClick={() => setIsSessionModalOpen(true)}
                    >
                        Start Session
                    </Button>
                    {canEdit && (
                        <Button leftSection={<IconEdit size={16} />} onClick={handleEdit} variant="light">
                            Edit Material
                        </Button>
                    )}
                </Group>
            </Group>

            <Paper withBorder shadow="sm" p="xl" radius="md">
                <Group justify="space-between" align="flex-start" mb="md">
                    <Box>
                        <Title order={2}>{material.title}</Title>
                        <Text c="dimmed" size="sm" mt={4}>
                            Created on {new Date(material.createdAt).toLocaleDateString()}
                            {material.isPublic && (
                                <Badge ml="xs" color="blue" variant="light">Public</Badge>
                            )}
                        </Text>
                    </Box>
                    <Badge size="lg" color={material.isComplete ? 'green' : 'yellow'}>
                        {material.isComplete ? 'Ready' : 'Draft'}
                    </Badge>
                </Group>

                <Divider my="lg" />

                <Grid>
                    {/* Main Info Column */}
                    <Grid.Col span={{ base: 12, md: 8 }}>
                        <Stack gap="lg">
                            <Box>
                                <Text fw={600} size="lg" mb="xs">Description</Text>
                                <Text c="dimmed">
                                    {material.metadata?.description || 'No description provided.'}
                                </Text>
                            </Box>

                            <Box>
                                <Text fw={600} size="lg" mb="xs">Details</Text>
                                <Grid>
                                    <Grid.Col span={6}>
                                        <Group gap="xs">
                                            <ThemeIcon color="blue" variant="light" size="md">
                                                <IconSchool size={16} />
                                            </ThemeIcon>
                                            <Box>
                                                <Text size="xs" c="dimmed">Type</Text>
                                                <Text size="sm" fw={500}>{material.type}</Text>
                                            </Box>
                                        </Group>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Group gap="xs">
                                            <ThemeIcon color="cyan" variant="light" size="md">
                                                <IconBook size={16} />
                                            </ThemeIcon>
                                            <Box>
                                                <Text size="xs" c="dimmed">Skill</Text>
                                                <Text size="sm" fw={500}>{material.skill}</Text>
                                            </Box>
                                        </Group>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Group gap="xs">
                                            <ThemeIcon color="orange" variant="light" size="md">
                                                <IconClock size={16} />
                                            </ThemeIcon>
                                            <Box>
                                                <Text size="xs" c="dimmed">Duration</Text>
                                                <Text size="sm" fw={500}>{material.duration} minutes</Text>
                                            </Box>
                                        </Group>
                                    </Grid.Col>
                                    <Grid.Col span={6}>
                                        <Group gap="xs">
                                            <ThemeIcon color="grape" variant="light" size="md">
                                                <IconTrophy size={16} />
                                            </ThemeIcon>
                                            <Box>
                                                <Text size="xs" c="dimmed">Difficulty</Text>
                                                <Text size="sm" fw={500}>{material.difficulty}</Text>
                                            </Box>
                                        </Group>
                                    </Grid.Col>
                                </Grid>
                            </Box>

                            {(material.metadata?.targetBand || material.metadata?.estimatedScore) && (
                                <Box>
                                    <Text fw={600} size="lg" mb="xs">Target Level</Text>
                                    <Group>
                                        {material.metadata?.targetBand && (
                                            <Badge variant="outline" size="lg" color="teal">
                                                Band: {material.metadata.targetBand}
                                            </Badge>
                                        )}
                                        {material.metadata?.estimatedScore && (
                                            <Badge variant="outline" size="lg" color="indigo">
                                                Score: {material.metadata.estimatedScore}
                                            </Badge>
                                        )}
                                    </Group>
                                </Box>
                            )}

                            {material.metadata?.tags && material.metadata.tags.length > 0 && (
                                <Box>
                                    <Text fw={600} size="lg" mb="xs">Tags</Text>
                                    <Group gap="xs">
                                        {material.metadata.tags.map((tag: string, index: number) => (
                                            <Badge key={index} leftSection={<IconTag size={12} />} variant="dot" color="gray">
                                                {tag}
                                            </Badge>
                                        ))}
                                    </Group>
                                </Box>
                            )}
                        </Stack>
                    </Grid.Col>

                    {/* Sidebar Stats */}
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Paper withBorder p="md" bg="var(--mantine-color-gray-0)">
                            <Stack>
                                <Text fw={600}>Statistics</Text>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Questions</Text>
                                    <Text fw={500}>{material.questionCount}</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Passages</Text>
                                    <Text fw={500}>{material.passages?.length || 0}</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Created By</Text>
                                    <Text fw={500} truncate w={120} style={{ textAlign: 'right' }}>
                                        {material.createdBy === 'teacher-default' ? 'System' : 'Teacher'}
                                    </Text>
                                </Group>
                                <Divider />
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Attempts</Text>
                                    <Text fw={500}>{material.statistics?.attempts || 0}</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Avg. Score</Text>
                                    <Text fw={500}>{Math.round(material.statistics?.averageScore || 0)}%</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Used in Courses</Text>
                                    <Text fw={500}>{usageCount}</Text>
                                </Group>
                            </Stack>
                        </Paper>
                    </Grid.Col>
                </Grid>
            </Paper>
        </Container>
    );
};

export default MaterialProfilePage;
