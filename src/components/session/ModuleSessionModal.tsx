/**
 * Module Session Modal
 * 
 * Modal for starting a session from a module with pre-filled context.
 */

import { useState, useEffect } from 'react';
import { Modal, Select, Radio, Group, Button, Stack, Text, Alert, Loader } from '@mantine/core';
import { IconAlertCircle, IconRocket } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { getMaterialsByModule } from '../../services/materialLinkManager';
import { useAuth } from '../../hooks/useAuth';
// @ts-ignore - JS service
import queryOptimizer, { CacheTypes } from '../../services/firebaseQueryOptimizer';
// @ts-ignore - sessionManager is JS
import { createSession, SessionMode } from '../../services/sessionManager';

interface Material {
    id: string;
    title: string;
    type: 'reading' | 'listening' | 'writing' | 'speaking' | 'THCS-THPT' | string;
}

interface ModuleSessionModalProps {
    opened: boolean;
    onClose: () => void;
    courseId: string;
    courseName: string;
    classId?: string; // Optional - if not provided, defaults to "open" access
    className?: string;
    moduleId: string;
    moduleName: string;
    materials?: Material[]; // Optional - will be fetched if not provided
    onCreateSession?: (sessionData: SessionData) => Promise<void>; // Optional - uses internal handler if not provided
}

export interface SessionData {
    materialId: string;
    materialTitle: string;
    materialType: string;
    courseId: string;
    courseName: string;
    classId?: string; // Optional
    className?: string; // Optional
    moduleId: string;
    moduleName: string;
    accessType: 'class-only' | 'open';
    duration: number; // in minutes
}

export function ModuleSessionModal({
    opened,
    onClose,
    courseId,
    courseName,
    classId,
    className,
    moduleId,
    moduleName,
    materials: providedMaterials,
    onCreateSession
}: ModuleSessionModalProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [materials, setMaterials] = useState<Material[]>(providedMaterials || []);
    const [selectedMaterial, setSelectedMaterial] = useState<string>('');
    const [accessType, setAccessType] = useState<'class-only' | 'open'>(classId ? 'class-only' : 'open');
    const [duration, setDuration] = useState<string>('30');
    const [loading, setLoading] = useState(false);
    const [fetchingMaterials, setFetchingMaterials] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch materials if not provided
    useEffect(() => {
        const fetchMaterials = async () => {
            if (providedMaterials && providedMaterials.length > 0) {
                return; // Already have materials
            }

            if (!opened || !moduleId) return;

            setFetchingMaterials(true);
            try {
                const moduleMaterials = await getMaterialsByModule(moduleId);

                // Fetch test metadata for each material
                const enrichedMaterials: Material[] = await Promise.all(
                    moduleMaterials.map(async (m) => {
                        const test = await queryOptimizer.getTest(m.materialId);
                        // Phase 3 Task 5.4: Handle THCS test metadata
                        const isThcs = test?.testType === 'THCS-THPT';
                        return {
                            id: m.materialId,
                            title: isThcs ? (test?.metadata?.title || 'Untitled THCS Test') : (test?.title || 'Unknown Material'),
                            type: isThcs ? 'THCS-THPT' : (test?.type || 'reading')
                        };
                    })
                );

                setMaterials(enrichedMaterials);
            } catch (err) {
                console.error('Failed to fetch materials:', err);
                setError('Failed to load materials for this module');
            } finally {
                setFetchingMaterials(false);
            }
        };

        fetchMaterials();
    }, [opened, moduleId, providedMaterials]);

    // Reset form when modal opens
    useEffect(() => {
        if (opened) {
            setSelectedMaterial('');
            setAccessType(classId ? 'class-only' : 'open');
            setDuration('30');
            setError(null);
        }
    }, [opened, classId]);

    const handleCreateSession = async () => {
        if (!selectedMaterial) {
            setError('Please select a material');
            return;
        }

        const material = materials.find(m => m.id === selectedMaterial);
        if (!material) {
            setError('Selected material not found');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const sessionData: SessionData = {
                materialId: selectedMaterial,
                materialTitle: material.title,
                materialType: material.type,
                courseId,
                courseName,
                classId,
                className,
                moduleId,
                moduleName,
                accessType,
                duration: parseInt(duration, 10)
            };

            // Use custom callback if provided, otherwise create session and navigate
            if (onCreateSession) {
                await onCreateSession(sessionData);
            } else {
                // Default behavior: create session using sessionManager
                const result = await createSession({
                    testId: selectedMaterial,
                    mode: SessionMode.TEST,
                    settings: {
                        duration: parseInt(duration, 10),
                        accessType
                    },
                    classId: classId || null,
                    courseId,
                    moduleId,
                    createdBy: user?.uid // FIX: Add user UID for session ownership tracking
                });

                if (result.success) {
                    // Navigate to session page
                    navigate(`/teacher/session/${result.sessionCode}`);
                } else {
                    throw new Error(result.error || 'Failed to create session');
                }
            }

            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create session');
        } finally {
            setLoading(false);
        }
    };

    const materialOptions = materials.map(material => ({
        value: material.id,
        label: `${material.title} (${material.type === 'THCS-THPT' ? '🇻🇳 THCS-THPT' : material.type})`
    }));

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <IconRocket size={24} />
                    <Text fw={600}>Start Module Session</Text>
                </Group>
            }
            size="lg"
        >
            <Stack gap="md">
                {/* Module Context Display */}
                <Alert color="blue" variant="light">
                    <Stack gap={4}>
                        <Text size="sm" fw={500}>Session Context</Text>
                        <Text size="xs" c="dimmed">Course: {courseName}</Text>
                        {className && <Text size="xs" c="dimmed">Class: {className}</Text>}
                        <Text size="xs" c="dimmed">Module: {moduleName}</Text>
                    </Stack>
                </Alert>

                {/* Material Selection */}
                {fetchingMaterials ? (
                    <Group justify="center" py="md">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Loading materials...</Text>
                    </Group>
                ) : (
                    <Select
                        label="Select Material"
                        placeholder="Choose a material from this module"
                        data={materialOptions}
                        value={selectedMaterial}
                        onChange={(value) => setSelectedMaterial(value || '')}
                        required
                        searchable
                        clearable
                    />
                )}

                {/* Access Type */}
                <Radio.Group
                    label="Session Access"
                    description="Who can join this session?"
                    value={accessType}
                    onChange={(value) => setAccessType(value as 'class-only' | 'open')}
                >
                    <Stack gap="xs" mt="xs">
                        <Radio
                            value="class-only"
                            label="Class Students Only"
                            description="Only students enrolled in this class can join"
                        />
                        <Radio
                            value="open"
                            label="Open to All"
                            description="Any student with the session code can join"
                        />
                    </Stack>
                </Radio.Group>

                {/* Duration */}
                <Select
                    label="Session Duration"
                    description="How long should the test last?"
                    data={[
                        { value: '15', label: '15 minutes' },
                        { value: '30', label: '30 minutes' },
                        { value: '45', label: '45 minutes' },
                        { value: '60', label: '1 hour' },
                        { value: '90', label: '1.5 hours' },
                        { value: '120', label: '2 hours' }
                    ]}
                    value={duration}
                    onChange={(value) => setDuration(value || '30')}
                    required
                />

                {/* Error Display */}
                {error && (
                    <Alert color="red" icon={<IconAlertCircle size={16} />}>
                        {error}
                    </Alert>
                )}

                {/* Action Buttons */}
                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreateSession}
                        loading={loading}
                        leftSection={<IconRocket size={16} />}
                    >
                        Create Session
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
