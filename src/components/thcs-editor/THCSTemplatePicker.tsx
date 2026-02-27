/**
 * THCSTemplatePicker — Phase 3, Task 7.4
 *
 * Modal for browsing and selecting a test template.
 * Shows "My Templates" and "Public Templates" tabs.
 */

import { useState, useEffect } from 'react';
import { Modal, Tabs, Stack, Text, Card, Group, Badge, Button, Loader, Radio } from '@mantine/core';
import { IconBook, IconWorld } from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
import { getMyTemplates, getPublicTemplates } from '../../services/thcsTemplateService';
import type { THCSTestTemplate } from '../../services/thcsTemplateService';

interface THCSTemplatePickerProps {
    opened: boolean;
    onClose: () => void;
    onSelect: (template: THCSTestTemplate) => void;
}

export function THCSTemplatePicker({ opened, onClose, onSelect }: THCSTemplatePickerProps) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<string | null>('mine');
    const [myTemplates, setMyTemplates] = useState<THCSTestTemplate[]>([]);
    const [publicTemplates, setPublicTemplates] = useState<THCSTestTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (!opened || !user?.uid) return;

        const load = async () => {
            setLoading(true);
            try {
                const [mine, pub] = await Promise.all([
                    getMyTemplates(user.uid),
                    getPublicTemplates(),
                ]);
                setMyTemplates(mine);
                // Exclude own templates from public list
                setPublicTemplates(pub.filter(t => t.ownerId !== user.uid));
            } catch (err) {
                console.error('[THCSTemplatePicker] Load error:', err);
            } finally {
                setLoading(false);
            }
        };

        load();
        setSelectedId(null);
    }, [opened, user?.uid]);

    const currentList = activeTab === 'mine' ? myTemplates : publicTemplates;
    const selectedTemplate = [...myTemplates, ...publicTemplates].find(t => t.id === selectedId);

    const handleCreate = () => {
        if (selectedTemplate) {
            onSelect(selectedTemplate);
            onClose();
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Create from Template"
            centered
            size="lg"
        >
            <Stack gap="md">
                <Text size="xs" c="dimmed">
                    Templates provide pre-built structures — section names, question counts, and point distribution.
                    You'll fill in the question content after creation.
                </Text>

                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="mine" leftSection={<IconBook size={14} />}>
                            My Templates ({myTemplates.length})
                        </Tabs.Tab>
                        <Tabs.Tab value="public" leftSection={<IconWorld size={14} />}>
                            Public ({publicTemplates.length})
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs>

                {loading ? (
                    <Group justify="center" py="xl">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Loading templates...</Text>
                    </Group>
                ) : currentList.length === 0 ? (
                    <Text ta="center" c="dimmed" py="xl">
                        {activeTab === 'mine'
                            ? 'No templates yet. Save a test as template from the editor.'
                            : 'No public templates available.'}
                    </Text>
                ) : (
                    <Radio.Group value={selectedId || ''} onChange={setSelectedId}>
                        <Stack gap="xs">
                            {currentList.map(template => (
                                <Card
                                    key={template.id}
                                    withBorder
                                    padding="sm"
                                    radius="md"
                                    style={{
                                        cursor: 'pointer',
                                        borderColor: selectedId === template.id ? '#7c3aed' : undefined,
                                        background: selectedId === template.id ? 'rgba(139, 92, 246, 0.04)' : undefined,
                                    }}
                                    onClick={() => setSelectedId(template.id)}
                                >
                                    <Group wrap="nowrap" gap="sm">
                                        <Radio value={template.id} />
                                        <Stack gap={2} style={{ flex: 1 }}>
                                            <Text fw={600} size="sm">{template.name}</Text>
                                            {template.description && (
                                                <Text size="xs" c="dimmed" lineClamp={1}>{template.description}</Text>
                                            )}
                                            <Group gap="xs" mt={2}>
                                                <Badge size="xs" color="violet">Grade {template.gradeLevel}</Badge>
                                                <Badge size="xs" color="gray">
                                                    {template.sections.length} sections
                                                </Badge>
                                                <Badge size="xs" color="gray">
                                                    {template.sections.reduce((s, sec) => s + sec.questionCount, 0)} Qs
                                                </Badge>
                                                <Badge size="xs" color="gray">
                                                    {template.totalDuration} min
                                                </Badge>
                                            </Group>
                                        </Stack>
                                    </Group>
                                </Card>
                            ))}
                        </Stack>
                    </Radio.Group>
                )}

                <Group justify="flex-end" mt="sm">
                    <Button variant="subtle" onClick={onClose}>Cancel</Button>
                    <Button
                        color="violet"
                        disabled={!selectedTemplate}
                        onClick={handleCreate}
                    >
                        Create Test →
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

export default THCSTemplatePicker;
