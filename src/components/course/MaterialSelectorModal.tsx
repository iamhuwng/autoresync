import { useState, useEffect, useMemo } from 'react';
import { Modal, Tabs, TextInput, Group, Button, Stack, Loader, Text, Badge, Card, ScrollArea } from '@mantine/core';
import { IconSearch, IconLink, IconCopy, IconBook, IconWorld } from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
// @ts-ignore - JS service
import queryOptimizer from '../../services/firebaseQueryOptimizer';
import { hasGoogleDriveAudio } from '../../services/retirement/retiredMaterialClassifier';

interface MaterialSelectorModalProps {
    opened: boolean;
    onClose: () => void;
    onSelect: (materialId: string, type: 'link' | 'copy') => Promise<void>;
}

export const MaterialSelectorModal = ({ opened, onClose, onSelect }: MaterialSelectorModalProps) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<string | null>('tests');
    const [searchTerm, setSearchTerm] = useState('');
    const [tests, setTests] = useState<any[]>([]);
    const [publicMaterials, setPublicMaterials] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState<string | null>(null);

    const loadMaterials = async () => {
        setLoading(true);
        try {
            const testList = await queryOptimizer.getAllTests();
            const assignableTests = testList.filter((item: any) => !hasGoogleDriveAudio(item));

            // Filter by ownership
            const myTests = assignableTests.filter((item: any) => item.ownerId === user?.uid || item.createdBy === user?.uid);

            // Filter public materials (excluding own)
            const publicTests = assignableTests.filter((item: any) =>
                item.isPublic && item.ownerId !== user?.uid && item.createdBy !== user?.uid
            );

            setTests(myTests);
            setPublicMaterials(publicTests);
        } catch (error) {
            console.error('Error loading materials:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (opened) {
            loadMaterials();
        }
    }, [opened, user]);

    const filteredMaterials = useMemo(() => {
        let list: any[] = [];
        if (activeTab === 'tests') list = tests;
        else if (activeTab === 'public') list = publicMaterials;

        // Phase 3 Task 5.1: Support THCS titles in metadata.title
        return list.filter(item => {
            const title = item.testType === 'THCS-THPT' ? (item.metadata?.title || item.title) : item.title;
            return (title || '').toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [activeTab, tests, publicMaterials, searchTerm]);

    const handleSelect = async (materialId: string, type: 'link' | 'copy') => {
        setSubmitting(materialId + type);
        try {
            await onSelect(materialId, type);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(null);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Select Material to Add"
            size="lg"
            scrollAreaComponent={ScrollArea.Autosize}
        >
            <Stack>
                <TextInput
                    placeholder="Search materials..."
                    leftSection={<IconSearch size={16} />}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.currentTarget.value)}
                />

                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="tests" leftSection={<IconBook size={14} />}>My Tests</Tabs.Tab>
                        <Tabs.Tab value="public" leftSection={<IconWorld size={14} />}>Public Library</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="tests" pt="xs">
                        {loading ? <Loader size="sm" mx="auto" display="block" my="xl" /> : (
                            <Stack gap="xs">
                                {filteredMaterials.length === 0 && <Text c="dimmed" ta="center" py="xl">No tests found</Text>}
                                {filteredMaterials.map(item => (
                                    <MaterialItem
                                        key={item.id}
                                        item={item}
                                        onSelect={handleSelect}
                                        submitting={submitting}
                                    />
                                ))}
                            </Stack>
                        )}
                    </Tabs.Panel>

                    <Tabs.Panel value="public" pt="xs">
                        {loading ? <Loader size="sm" mx="auto" display="block" my="xl" /> : (
                            <Stack gap="xs">
                                {filteredMaterials.length === 0 && <Text c="dimmed" ta="center" py="xl">No public materials found</Text>}
                                {filteredMaterials.map(item => (
                                    <MaterialItem
                                        key={item.id}
                                        item={item}
                                        onSelect={handleSelect}
                                        submitting={submitting}
                                        isPublicTab={true}
                                    />
                                ))}
                            </Stack>
                        )}
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Modal>
    );
};

const MaterialItem = ({
    item,
    onSelect,
    submitting,
    isPublicTab = false
}: {
    item: any,
    onSelect: (id: string, type: 'link' | 'copy') => void,
    submitting: string | null,
    isPublicTab?: boolean
}) => (
    <Card withBorder padding="sm" radius="md">
        <Group justify="space-between" wrap="nowrap">
            <Stack gap={2} style={{ flex: 1 }}>
                <Text fw={500} size="sm" truncate>
                    {item.testType === 'THCS-THPT' ? (item.metadata?.title || item.title || 'Untitled') : (item.title || 'Untitled')}
                </Text>
                <Group gap="xs">
                    {item.testType === 'THCS-THPT' ? (
                        <>
                            <Badge size="xs" color="violet">THCS-THPT</Badge>
                            <Badge size="xs" color="grape">Grade {item.metadata?.gradeLevel || '?'}</Badge>
                        </>
                    ) : (
                        <>
                            <Badge size="xs" color="blue">{item.type || 'Test'}</Badge>
                            <Badge size="xs" color="gray">{item.skill || 'General'}</Badge>
                        </>
                    )}
                    {item.isComplete === false && <Badge size="xs" color="orange">Incomplete</Badge>}
                </Group>
            </Stack>

            <Group gap="xs" wrap="nowrap">
                <Button
                    variant="light"
                    size="compact-xs"
                    leftSection={<IconLink size={14} />}
                    onClick={() => onSelect(item.id, 'link')}
                    loading={submitting === item.id + 'link'}
                >
                    Link
                </Button>
                {!isPublicTab && (
                    <Button
                        variant="light"
                        color="green"
                        size="compact-xs"
                        leftSection={<IconCopy size={14} />}
                        onClick={() => onSelect(item.id, 'copy')}
                        loading={submitting === item.id + 'copy'}
                    >
                        Copy
                    </Button>
                )}
            </Group>
        </Group>
    </Card>
);
