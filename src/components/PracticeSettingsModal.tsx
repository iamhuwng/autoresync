import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Text, Switch, NumberInput, Select, Button, Group, Box, Badge } from '@mantine/core';
import { IconSettings, IconDeviceFloppy } from '@tabler/icons-react';
import { getPracticeSettings, savePracticeSettings } from '../services/practiceSettingsService';
import { resolvePracticeSettings } from '../services/practiceSettingsResolver';
import type { PracticeSettings, ResolvedPracticeSettings } from '../types/practice.types';

interface PracticeSettingsModalProps {
    opened: boolean;
    onClose: () => void;
    materialId?: string;
    moduleId?: string;
    courseId?: string;
    readOnly?: boolean;
    inline?: boolean;
}

/**
 * Helper: Render an inheritance badge next to a field label
 */
const InheritanceBadge: React.FC<{ source?: string }> = ({ source }) => {
    if (!source || source === 'material') {
        return <Badge size="xs" variant="light" color="blue">Custom</Badge>;
    }
    const labels: Record<string, string> = {
        module: 'From Module',
        course: 'From Course',
        material_owner_default: 'Default',
    };
    return (
        <Badge size="xs" variant="light" color="gray">
            {labels[source] || `From ${source}`}
        </Badge>
    );
};

export const PracticeSettingsModal: React.FC<PracticeSettingsModalProps> = ({
    opened,
    onClose,
    materialId,
    moduleId,
    courseId,
    readOnly = false,
    inline = false,
}) => {
    const [settings, setSettings] = useState<Partial<PracticeSettings>>({});
    const [resolved, setResolved] = useState<ResolvedPracticeSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadSettings = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPracticeSettings(courseId || 'default', moduleId, materialId);
            setSettings(data || {});

            // Also load resolved settings for inheritance indicators
            if (courseId) {
                try {
                    const resolvedData = await resolvePracticeSettings(
                        courseId,
                        moduleId || '',
                        materialId || '',
                        { timerMinutes: null, feedbackTiming: 'after_completion' }
                    );
                    setResolved(resolvedData);
                } catch {
                    setResolved(null);
                }
            }
        } catch (err) {
            console.error('Failed to load practice settings:', err);
        } finally {
            setLoading(false);
        }
    }, [courseId, moduleId, materialId]);

    useEffect(() => {
        if (opened) {
            loadSettings();
        }
    }, [opened, loadSettings]);

    const handleSave = async () => {
        if (readOnly) return;
        setSaving(true);
        try {
            await savePracticeSettings(courseId || 'default', settings as PracticeSettings, moduleId, materialId);
            onClose();
        } catch (err) {
            console.error('Failed to save practice settings:', err);
            alert('Failed to save practice settings');
        } finally {
            setSaving(false);
        }
    };

    const getSource = (fieldPath: string): string | undefined => {
        return resolved?._sources?.[fieldPath];
    };

    if (loading) {
        if (inline) {
            return <div style={{ padding: '2rem' }}><Text>Loading practice settings...</Text></div>;
        }
        return (
            <Modal opened={opened} onClose={onClose} title="Practice Settings">
                <Text>Loading...</Text>
            </Modal>
        );
    }

    const formContent = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Text size="sm" color="dimmed" mb="md">
                Configure how this material behaves when students practice it alone.
            </Text>

            {/* ── General Settings ──────────────────────────────────────── */}
            <Text fw={600} size="md" c="blue.7" mb="xs">General</Text>

            <Group justify="space-between">
                <Group gap="xs">
                    <Text size="sm" fw={500}>Enable Practice Mode</Text>
                    <InheritanceBadge source={getSource('enabled')} />
                </Group>
                <Switch
                    checked={settings.enabled !== false}
                    onChange={(event) => setSettings({ ...settings, enabled: event.currentTarget.checked })}
                    disabled={readOnly}
                />
            </Group>

            <Box>
                <Group gap="xs" mb={4}>
                    <Text size="sm" fw={500}>Timer Priority</Text>
                    <InheritanceBadge source={getSource('timerMinutes')} />
                </Group>
                <Select
                    description="Override material default timer or use inherited settings"
                    data={[
                        { value: 'default', label: 'Inherit from Module/Course' },
                        { value: 'none', label: 'No Timer' },
                        { value: 'custom', label: 'Custom Timer' },
                    ]}
                    value={settings.timerMinutes === 'default' ? 'default' : settings.timerMinutes === null ? 'none' : 'custom'}
                    onChange={(val) => {
                        if (val === 'default') setSettings({ ...settings, timerMinutes: 'default' });
                        else if (val === 'none') setSettings({ ...settings, timerMinutes: null });
                        else setSettings({ ...settings, timerMinutes: 60 });
                    }}
                    disabled={readOnly}
                />
            </Box>

            {typeof settings.timerMinutes === 'number' && (
                <NumberInput
                    label="Duration (minutes)"
                    value={settings.timerMinutes}
                    onChange={(val) => setSettings({ ...settings, timerMinutes: Number(val) || null })}
                    min={1}
                    disabled={readOnly}
                />
            )}

            <Box>
                <Group gap="xs" mb={4}>
                    <Text size="sm" fw={500}>Feedback Timing</Text>
                    <InheritanceBadge source={getSource('feedbackTiming')} />
                </Group>
                <Select
                    data={[
                        { value: 'default', label: 'Inherit Default' },
                        { value: 'immediate', label: 'Immediate (After each question)' },
                        { value: 'after_completion', label: 'After Completion (Exam style)' },
                        { value: 'never', label: 'Never (Blind practice)' },
                    ]}
                    value={settings.feedbackTiming || 'default'}
                    onChange={(val: any) => setSettings({ ...settings, feedbackTiming: val })}
                    disabled={readOnly}
                />
            </Box>

            <Group justify="space-between">
                <Group gap="xs">
                    <Text size="sm" fw={500}>Allow Pause</Text>
                    <InheritanceBadge source={getSource('allowPause')} />
                </Group>
                <Switch
                    checked={settings.allowPause === true || settings.allowPause === 'default'}
                    onChange={(event) => setSettings({ ...settings, allowPause: event.currentTarget.checked })}
                    disabled={readOnly}
                />
            </Group>

            {/* ── Attempt Limits (M2) ──────────────────────────────────── */}
            <Text fw={600} size="md" c="blue.7" mt="md" mb="xs">Attempt Limits</Text>

            <Box>
                <Group gap="xs" mb={4}>
                    <Text size="sm" fw={500}>Max Attempts</Text>
                    <InheritanceBadge source={getSource('maxAttempts')} />
                </Group>
                <NumberInput
                    description="Leave empty for unlimited attempts"
                    placeholder="Unlimited"
                    value={settings.maxAttempts ?? ''}
                    onChange={(val) => setSettings({ ...settings, maxAttempts: val ? Number(val) : null })}
                    min={1}
                    max={100}
                    disabled={readOnly}
                />
            </Box>

            <Box>
                <Group gap="xs" mb={4}>
                    <Text size="sm" fw={500}>Minimum Passing Score (%)</Text>
                    <InheritanceBadge source={getSource('minPassingScore')} />
                </Group>
                <NumberInput
                    description="Score required to mark material as 'completed' in course progress. Leave empty for no threshold."
                    placeholder="No threshold"
                    value={settings.minPassingScore ?? ''}
                    onChange={(val) => setSettings({ ...settings, minPassingScore: val ? Number(val) : null })}
                    min={0}
                    max={100}
                    suffix="%"
                    disabled={readOnly}
                />
            </Box>

            {/* ── Reading Settings (M3) ────────────────────────────────── */}
            <Text fw={600} size="md" c="blue.7" mt="md" mb="xs">Reading</Text>

            <Group justify="space-between">
                <Group gap="xs">
                    <Text size="sm" fw={500}>Show Timer</Text>
                    <InheritanceBadge source={getSource('reading.showTimer')} />
                </Group>
                <Switch
                    checked={settings.reading?.showTimer !== false && settings.reading?.showTimer !== 'default'}
                    onChange={(event) => setSettings({
                        ...settings,
                        reading: { ...settings.reading, showTimer: event.currentTarget.checked },
                    })}
                    disabled={readOnly}
                />
            </Group>

            {/* ── Listening Settings (M3) ──────────────────────────────── */}
            <Text fw={600} size="md" c="blue.7" mt="md" mb="xs">Listening</Text>

            <Group justify="space-between">
                <Group gap="xs">
                    <Text size="sm" fw={500}>Allow Replay</Text>
                    <InheritanceBadge source={getSource('listening.allowReplay')} />
                </Group>
                <Switch
                    checked={settings.listening?.allowReplay !== false && settings.listening?.allowReplay !== 'default'}
                    onChange={(event) => {
                        const prev = (settings.listening || {}) as Partial<NonNullable<PracticeSettings['listening']>>;
                        setSettings({
                            ...settings,
                            listening: {
                                allowReplay: event.currentTarget.checked,
                                maxReplays: prev.maxReplays ?? null,
                                allowSpeedControl: prev.allowSpeedControl ?? 'default',
                                allowSkipSection: prev.allowSkipSection ?? 'default',
                                allowPauseAudio: prev.allowPauseAudio ?? 'default',
                            },
                        });
                    }}
                    disabled={readOnly}
                />
            </Group>

            {(settings.listening?.allowReplay === true) && (
                <Box>
                    <Group gap="xs" mb={4}>
                        <Text size="sm" fw={500}>Max Replays</Text>
                    </Group>
                    <NumberInput
                        description="Leave empty for unlimited replays"
                        placeholder="Unlimited"
                        value={settings.listening?.maxReplays ?? ''}
                        onChange={(val) => {
                            const prev = (settings.listening || {}) as Partial<NonNullable<PracticeSettings['listening']>>;
                            setSettings({
                                ...settings,
                                listening: {
                                    allowReplay: prev.allowReplay ?? 'default',
                                    maxReplays: val ? Number(val) : null,
                                    allowSpeedControl: prev.allowSpeedControl ?? 'default',
                                    allowSkipSection: prev.allowSkipSection ?? 'default',
                                    allowPauseAudio: prev.allowPauseAudio ?? 'default',
                                },
                            });
                        }}
                        min={1}
                        max={10}
                        disabled={readOnly}
                    />
                </Box>
            )}

            <Group justify="space-between">
                <Group gap="xs">
                    <Text size="sm" fw={500}>Allow Speed Control</Text>
                    <InheritanceBadge source={getSource('listening.allowSpeedControl')} />
                </Group>
                <Switch
                    checked={settings.listening?.allowSpeedControl !== false && settings.listening?.allowSpeedControl !== 'default'}
                    onChange={(event) => {
                        const prev = (settings.listening || {}) as Partial<NonNullable<PracticeSettings['listening']>>;
                        setSettings({
                            ...settings,
                            listening: {
                                allowReplay: prev.allowReplay ?? 'default',
                                maxReplays: prev.maxReplays ?? null,
                                allowSpeedControl: event.currentTarget.checked,
                                allowSkipSection: prev.allowSkipSection ?? 'default',
                                allowPauseAudio: prev.allowPauseAudio ?? 'default',
                            },
                        });
                    }}
                    disabled={readOnly}
                />
            </Group>

            <Group justify="space-between">
                <Group gap="xs">
                    <Text size="sm" fw={500}>Allow Skip Section</Text>
                    <InheritanceBadge source={getSource('listening.allowSkipSection')} />
                </Group>
                <Switch
                    checked={settings.listening?.allowSkipSection !== false && settings.listening?.allowSkipSection !== 'default'}
                    onChange={(event) => {
                        const prev = (settings.listening || {}) as Partial<NonNullable<PracticeSettings['listening']>>;
                        setSettings({
                            ...settings,
                            listening: {
                                allowReplay: prev.allowReplay ?? 'default',
                                maxReplays: prev.maxReplays ?? null,
                                allowSpeedControl: prev.allowSpeedControl ?? 'default',
                                allowSkipSection: event.currentTarget.checked,
                                allowPauseAudio: prev.allowPauseAudio ?? 'default',
                            },
                        });
                    }}
                    disabled={readOnly}
                />
            </Group>

            <Group justify="space-between">
                <Group gap="xs">
                    <Text size="sm" fw={500}>Allow Pause Audio</Text>
                    <InheritanceBadge source={getSource('listening.allowPauseAudio')} />
                </Group>
                <Switch
                    checked={settings.listening?.allowPauseAudio !== false && settings.listening?.allowPauseAudio !== 'default'}
                    onChange={(event) => {
                        const prev = (settings.listening || {}) as Partial<NonNullable<PracticeSettings['listening']>>;
                        setSettings({
                            ...settings,
                            listening: {
                                allowReplay: prev.allowReplay ?? 'default',
                                maxReplays: prev.maxReplays ?? null,
                                allowSpeedControl: prev.allowSpeedControl ?? 'default',
                                allowSkipSection: prev.allowSkipSection ?? 'default',
                                allowPauseAudio: event.currentTarget.checked,
                            },
                        });
                    }}
                    disabled={readOnly}
                />
            </Group>

            <Group justify="flex-end" mt="xl">
                {!inline && <Button variant="outline" onClick={onClose}>Cancel</Button>}
                {!readOnly && (
                    <Button onClick={handleSave} loading={saving} leftSection={<IconDeviceFloppy size={16} />}>
                        Save Settings
                    </Button>
                )}
            </Group>
        </div>
    );

    if (inline) {
        return formContent;
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Group><IconSettings size={20} /> <Text fw={600}>Solo Practice Settings</Text></Group>}
            size="md"
        >
            {formContent}
        </Modal>
    );
};
