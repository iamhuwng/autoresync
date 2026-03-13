/**
 * NewModuleSyncBanner
 * 
 * Top-of-list banner shown when the original course has entirely new modules
 * that don't exist in the class copy. Teachers can select which new modules
 * to add or dismiss the notification.
 */

import { useState } from 'react';
import { Alert, Button, Checkbox, Group, Stack, Text, Loader, Badge } from '@mantine/core';
import { IconPackage, IconX, IconArrowDown } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { NewModuleInfo } from '../../services/courseSyncService';
import { applySyncNewModule, dismissNewModulesSync } from '../../services/courseSyncService';

interface NewModuleSyncBannerProps {
    copyCourseId: string;
    newModules: NewModuleInfo[];
    onSyncComplete: () => void;
}

export const NewModuleSyncBanner = ({ copyCourseId, newModules, onSyncComplete }: NewModuleSyncBannerProps) => {
    const [selectedModules, setSelectedModules] = useState<Set<string>>(
        new Set(newModules.map(m => m.originalModuleId))
    );
    const [isApplying, setIsApplying] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);

    const toggleModule = (originalModuleId: string) => {
        setSelectedModules(prev => {
            const next = new Set(prev);
            if (next.has(originalModuleId)) {
                next.delete(originalModuleId);
            } else {
                next.add(originalModuleId);
            }
            return next;
        });
    };

    const handleApply = async () => {
        if (selectedModules.size === 0) {
            notifications.show({ color: 'orange', message: 'Select at least one module to add' });
            return;
        }

        setIsApplying(true);
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const moduleId of selectedModules) {
                const result = await applySyncNewModule(copyCourseId, moduleId);
                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`Failed to sync module ${moduleId}:`, result.error);
                }
            }

            if (successCount > 0) {
                notifications.show({
                    color: 'green',
                    message: `${successCount} new module${successCount !== 1 ? 's' : ''} added successfully${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
                });
            }

            if (errorCount > 0 && successCount === 0) {
                notifications.show({ color: 'red', message: 'Failed to add new modules' });
            }

            onSyncComplete();
        } catch (error) {
            console.error('New module sync error:', error);
            notifications.show({ color: 'red', message: 'An error occurred while syncing modules' });
        } finally {
            setIsApplying(false);
        }
    };

    const handleDismiss = async () => {
        setIsDismissing(true);
        try {
            const result = await dismissNewModulesSync(copyCourseId);
            if (result.success) {
                onSyncComplete();
            } else {
                notifications.show({ color: 'red', message: result.error || 'Failed to dismiss' });
            }
        } catch (error) {
            console.error('Dismiss error:', error);
        } finally {
            setIsDismissing(false);
        }
    };

    if (newModules.length === 0) return null;

    return (
        <Alert
            variant="light"
            color="teal"
            radius="md"
            title={
                <Group gap={6} wrap="nowrap">
                    <IconPackage size={14} />
                    <Text size="xs" fw={600}>
                        {newModules.length} new module{newModules.length !== 1 ? 's' : ''} available from original course
                    </Text>
                </Group>
            }
            withCloseButton={false}
            styles={{
                root: {
                    padding: '10px 14px',
                },
                title: {
                    marginBottom: 6,
                },
            }}
        >
            <Stack gap={6}>
                {newModules.map(mod => (
                    <Checkbox
                        key={mod.originalModuleId}
                        size="xs"
                        checked={selectedModules.has(mod.originalModuleId)}
                        onChange={() => toggleModule(mod.originalModuleId)}
                        label={
                            <Group gap={6} wrap="nowrap">
                                <Text size="xs" fw={500} lineClamp={1}>
                                    {mod.name}
                                </Text>
                                <Badge size="xs" color="gray" variant="light">
                                    {mod.materialCount} material{mod.materialCount !== 1 ? 's' : ''}
                                </Badge>
                            </Group>
                        }
                    />
                ))}

                {/* Actions */}
                <Group gap={6} mt={4}>
                    <Button
                        size="compact-xs"
                        variant="filled"
                        color="teal"
                        leftSection={isApplying ? <Loader size={10} color="white" /> : <IconArrowDown size={12} />}
                        onClick={handleApply}
                        disabled={isApplying || isDismissing || selectedModules.size === 0}
                    >
                        {isApplying ? 'Adding...' : `Add ${selectedModules.size} module${selectedModules.size !== 1 ? 's' : ''}`}
                    </Button>
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        leftSection={isDismissing ? <Loader size={10} /> : <IconX size={12} />}
                        onClick={handleDismiss}
                        disabled={isApplying || isDismissing}
                    >
                        Dismiss
                    </Button>
                </Group>
            </Stack>
        </Alert>
    );
};
