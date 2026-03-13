/**
 * ModuleSyncBanner
 * 
 * Inline notification banner shown inside a module card when the original
 * course has new materials that haven't been synced to this class copy.
 * Teachers can cherry-pick which materials to add or dismiss the notification.
 */

import { useState } from 'react';
import { Alert, Button, Checkbox, Group, Stack, Text, Loader } from '@mantine/core';
import { IconRefresh, IconX, IconArrowDown } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { ModuleSyncStatus } from '../../services/courseSyncService';
import { applySyncMaterials, dismissModuleSync } from '../../services/courseSyncService';

interface ModuleSyncBannerProps {
    copyCourseId: string;
    syncStatus: ModuleSyncStatus;
    onSyncComplete: () => void; // Callback to refresh parent
}

export const ModuleSyncBanner = ({ copyCourseId, syncStatus, onSyncComplete }: ModuleSyncBannerProps) => {
    const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(
        new Set(syncStatus.pendingMaterials.map(m => m.materialId))
    );
    const [isApplying, setIsApplying] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);

    const toggleMaterial = (materialId: string) => {
        setSelectedMaterials(prev => {
            const next = new Set(prev);
            if (next.has(materialId)) {
                next.delete(materialId);
            } else {
                next.add(materialId);
            }
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedMaterials.size === syncStatus.pendingMaterials.length) {
            setSelectedMaterials(new Set());
        } else {
            setSelectedMaterials(new Set(syncStatus.pendingMaterials.map(m => m.materialId)));
        }
    };

    const handleApply = async () => {
        if (selectedMaterials.size === 0) {
            notifications.show({ color: 'orange', message: 'Select at least one material to sync' });
            return;
        }

        setIsApplying(true);
        try {
            const result = await applySyncMaterials(
                copyCourseId,
                syncStatus.copyModuleId,
                Array.from(selectedMaterials)
            );

            if (result.success) {
                notifications.show({
                    color: 'green',
                    message: `${result.addedCount} material${result.addedCount !== 1 ? 's' : ''} synced successfully`,
                });
                onSyncComplete();
            } else {
                notifications.show({ color: 'red', message: result.error || 'Failed to sync materials' });
            }
        } catch (error) {
            console.error('Sync apply error:', error);
            notifications.show({ color: 'red', message: 'An error occurred while syncing' });
        } finally {
            setIsApplying(false);
        }
    };

    const handleDismiss = async () => {
        setIsDismissing(true);
        try {
            const result = await dismissModuleSync(syncStatus.copyModuleId);
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

    const isAllSelected = selectedMaterials.size === syncStatus.pendingMaterials.length;
    const isNoneSelected = selectedMaterials.size === 0;

    return (
        <Alert
            variant="light"
            color="blue"
            radius="md"
            title={
                <Group gap={6} wrap="nowrap">
                    <IconRefresh size={14} />
                    <Text size="xs" fw={600}>
                        {syncStatus.pendingMaterials.length} new material{syncStatus.pendingMaterials.length !== 1 ? 's' : ''} available from original course
                    </Text>
                </Group>
            }
            withCloseButton={false}
            styles={{
                root: {
                    padding: '8px 12px',
                },
                title: {
                    marginBottom: 4,
                },
            }}
        >
            <Stack gap={4}>
                {/* Select all toggle */}
                <Checkbox
                    size="xs"
                    label={<Text size="xs" c="dimmed">Select all</Text>}
                    checked={isAllSelected}
                    indeterminate={!isAllSelected && !isNoneSelected}
                    onChange={toggleAll}
                />

                {/* Material checkboxes */}
                {syncStatus.pendingMaterials.map(material => (
                    <Checkbox
                        key={material.materialId}
                        size="xs"
                        label={
                            <Text size="xs" lineClamp={1}>
                                {material.title}
                            </Text>
                        }
                        checked={selectedMaterials.has(material.materialId)}
                        onChange={() => toggleMaterial(material.materialId)}
                    />
                ))}

                {/* Actions */}
                <Group gap={6} mt={4}>
                    <Button
                        size="compact-xs"
                        variant="filled"
                        color="blue"
                        leftSection={isApplying ? <Loader size={10} color="white" /> : <IconArrowDown size={12} />}
                        onClick={handleApply}
                        disabled={isApplying || isDismissing || isNoneSelected}
                    >
                        {isApplying ? 'Syncing...' : `Sync ${selectedMaterials.size} selected`}
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
