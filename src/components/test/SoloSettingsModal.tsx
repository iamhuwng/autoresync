import React from 'react';
import { Modal, Switch, Select, Button, Group, Text, Box } from '@mantine/core';
import { Slider } from '@mantine/core';

import type { ResolvedPracticeSettings, StudentSoloPreferences } from '../../types/practice.types';

interface SoloSettingsModalProps {
    opened: boolean;
    onClose: () => void;
    testSkill: 'Reading' | 'Listening' | string;
    resolvedSettings: ResolvedPracticeSettings;
    studentPrefs: StudentSoloPreferences;
    onPrefsChange: (prefs: StudentSoloPreferences) => void;
    onExit?: () => void;
}

export const SoloSettingsModal: React.FC<SoloSettingsModalProps> = ({
    opened,
    onClose,
    testSkill,
    resolvedSettings,
    studentPrefs,
    onPrefsChange,
    onExit,
}) => {
    const [localPrefs, setLocalPrefs] = React.useState<StudentSoloPreferences>(studentPrefs);

    React.useEffect(() => {
        setLocalPrefs(studentPrefs);
    }, [studentPrefs, opened]);

    const handleSave = () => {
        onPrefsChange(localPrefs);
        onClose();
    };

    const updatePref = (key: keyof StudentSoloPreferences, value: any) => {
        setLocalPrefs(prev => ({ ...prev, [key]: value }));
    };

    // Check if teacher locked settings (not from default = teacher set it)
    const isTimerLocked = resolvedSettings._sources?.['reading.showTimer'] !== undefined
        && resolvedSettings._sources?.['reading.showTimer'] !== 'material_owner_default';
    const isReplayLocked = !resolvedSettings.listening.allowReplay;
    const isSpeedLocked = !resolvedSettings.listening.allowSpeedControl;
    const isSkipLocked = !resolvedSettings.listening.allowSkipSection;
    const isPauseAudioLocked = !resolvedSettings.listening.allowPauseAudio;

    const normalizedTestSkill = testSkill.trim().toLowerCase();
    const showReading = normalizedTestSkill === 'reading';
    const showListening = normalizedTestSkill === 'listening';

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Text fw={700} size="lg">Practice Settings</Text>}
            size="md"
            radius="md"
            padding="xl"
        >
            <Box mb="xl">
                {showReading && (
                    <Box mb="xl">
                        <Text fw={600} size="md" mb="md" c="blue.7">Reading & Display</Text>

                        <Box mb="md">
                            <Group justify="space-between" mb="xs">
                                <Text size="sm" fw={500}>Font Size ({localPrefs.fontSize}px)</Text>
                            </Group>
                            <Slider
                                value={localPrefs.fontSize}
                                onChange={(v) => updatePref('fontSize', v)}
                                min={12}
                                max={24}
                                step={1}
                                marks={[
                                    { value: 12, label: '12' },
                                    { value: 16, label: '16' },
                                    { value: 20, label: '20' },
                                    { value: 24, label: '24' },
                                ]}
                                pb="xl"
                            />
                        </Box>

                        <Box mb="md">
                            <Group justify="space-between" mb="xs">
                                <Text size="sm" fw={500}>Line Spacing ({localPrefs.lineSpacing})</Text>
                            </Group>
                            <Slider
                                value={localPrefs.lineSpacing}
                                onChange={(v) => updatePref('lineSpacing', v)}
                                min={1.0}
                                max={2.5}
                                step={0.1}
                                marks={[
                                    { value: 1.0, label: '1.0' },
                                    { value: 1.5, label: '1.5' },
                                    { value: 2.0, label: '2.0' },
                                    { value: 2.5, label: '2.5' },
                                ]}
                                pb="xl"
                            />
                        </Box>

                        <Group justify="space-between" mt="md" mb="md">
                            <Box>
                                <Text size="sm" fw={500}>Highlighter Tool</Text>
                                <Text size="xs" c="dimmed">Enable text highlighting on passages</Text>
                            </Box>
                            <Switch
                                checked={localPrefs.highlighterEnabled}
                                onChange={(e) => updatePref('highlighterEnabled', e.currentTarget.checked)}
                            />
                        </Group>

                        <Group justify="space-between" mb="md" title={isTimerLocked ? "Set by teacher" : ""}>
                            <Box>
                                <Text size="sm" fw={500} c={isTimerLocked ? "dimmed" : undefined}>Show Timer</Text>
                                <Text size="xs" c="dimmed">
                                    Display the countdown clock
                                    {isTimerLocked && <span style={{ color: '#f59e0b', marginLeft: 4 }}>🔒 Teacher locked</span>}
                                </Text>
                            </Box>
                            <Switch
                                checked={localPrefs.showTimer}
                                onChange={(e) => updatePref('showTimer', e.currentTarget.checked)}
                                disabled={isTimerLocked}
                            />
                        </Group>

                        <Group justify="space-between" mb="xl">
                            <Box>
                                <Text size="sm" fw={500}>Dark Mode</Text>
                                <Text size="xs" c="dimmed">Use dark theme for reading</Text>
                            </Box>
                            <Switch
                                checked={localPrefs.darkMode}
                                onChange={(e) => updatePref('darkMode', e.currentTarget.checked)}
                            />
                        </Group>
                    </Box>
                )}

                {showListening && (
                    <Box>
                        <Text fw={600} size="md" mb="md" c="blue.7">Listening Audio</Text>

                        {/* Audio Speed */}
                        <Box mb="md" title={isSpeedLocked ? "Disabled by teacher" : ""}>
                            <Select
                                label="Audio Speed"
                                description={isSpeedLocked ? "Speed control disabled by teacher" : "Adjust playback speed"}
                                data={['0.75', '1.0', '1.25', '1.5', '2.0']}
                                value={localPrefs.audioSpeed.toString()}
                                onChange={(v) => updatePref('audioSpeed', parseFloat(v || '1.0'))}
                                disabled={isSpeedLocked}
                            />
                        </Box>

                        {/* Replay Audio — uses the resolved allowReplay setting */}
                        <Group justify="space-between" mb="md">
                            <Box>
                                <Text size="sm" fw={500} c={isReplayLocked ? "dimmed" : undefined}>Replay Audio</Text>
                                <Text size="xs" c="dimmed">
                                    Allow replaying audio sections
                                    {isReplayLocked && <span style={{ color: '#f59e0b', marginLeft: 4 }}>🔒 Teacher locked</span>}
                                    {!isReplayLocked && resolvedSettings.listening.maxReplays != null && (
                                        <span style={{ color: '#6b7280', marginLeft: 4 }}>
                                            (max {resolvedSettings.listening.maxReplays} replays)
                                        </span>
                                    )}
                                </Text>
                            </Box>
                            <Switch
                                checked={resolvedSettings.listening.allowReplay}
                                disabled={true} // Teacher controls this, student cannot toggle
                            />
                        </Group>

                        {/* Skip to Section */}
                        <Group justify="space-between" mb="md">
                            <Box>
                                <Text size="sm" fw={500} c={isSkipLocked ? "dimmed" : undefined}>Skip to Section</Text>
                                <Text size="xs" c="dimmed">
                                    Jump between audio sections
                                    {isSkipLocked && <span style={{ color: '#f59e0b', marginLeft: 4 }}>🔒 Teacher locked</span>}
                                </Text>
                            </Box>
                            <Switch
                                checked={resolvedSettings.listening.allowSkipSection}
                                disabled={true} // Teacher controls this
                            />
                        </Group>

                        {/* Pause Audio */}
                        <Group justify="space-between" mb="md">
                            <Box>
                                <Text size="sm" fw={500} c={isPauseAudioLocked ? "dimmed" : undefined}>Pause Audio</Text>
                                <Text size="xs" c="dimmed">
                                    Pause during playback
                                    {isPauseAudioLocked && <span style={{ color: '#f59e0b', marginLeft: 4 }}>🔒 Teacher locked</span>}
                                </Text>
                            </Box>
                            <Switch
                                checked={resolvedSettings.listening.allowPauseAudio}
                                disabled={true} // Teacher controls this
                            />
                        </Group>
                    </Box>
                )}
            </Box>

            <Group justify={onExit ? "space-between" : "flex-end"}>
                {onExit && (
                    <Button variant="outline" color="red" onClick={onExit}>Exit</Button>
                )}
                <Group gap="sm">
                <Button variant="subtle" onClick={onClose} color="gray">Cancel</Button>
                <Button onClick={handleSave} color="blue">Save Settings</Button>
                </Group>
            </Group>
        </Modal>
    );
};
