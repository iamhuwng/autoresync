/**
 * Badge Display Component
 * 
 * Displays a single badge icon with tooltip showing badge information.
 * Can be clicked for an expanded view with more details.
 */

import React, { useState } from 'react';
import { Tooltip, Modal, Text, Stack, Group, Badge as MantineBadge } from '@mantine/core';
import { Badge, BADGE_DEFINITIONS } from '../../types/badge.types';
import { getBadgeIcon } from './BadgeIcons';

interface BadgeDisplayProps {
    /** Badge data */
    badge: Badge;

    /** Size of the badge icon */
    size?: number;

    /** Whether badge is clickable */
    clickable?: boolean;

    /** Custom className */
    className?: string;
}

/**
 * Badge Display Component
 */
export const BadgeDisplay: React.FC<BadgeDisplayProps> = ({
    badge,
    size = 48,
    clickable = true,
    className = '',
}) => {
    const [modalOpen, setModalOpen] = useState(false);

    // Get badge definition
    const definition = BADGE_DEFINITIONS[badge.type];

    if (!definition) {
        console.error(`Badge definition not found for type: ${badge.type}`);
        return null;
    }

    // Get badge icon component
    const BadgeIcon = getBadgeIcon(badge.type);

    // Format earned date
    const earnedDate = new Date(badge.earnedAt);
    const formattedDate = earnedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Rarity color mapping
    const rarityColors: Record<string, string> = {
        common: 'gray',
        rare: 'blue',
        epic: 'violet',
        legendary: 'yellow',
    };

    const handleClick = () => {
        if (clickable) {
            setModalOpen(true);
        }
    };

    return (
        <>
            <Tooltip
                label={
                    <Stack gap="xs">
                        <Text fw={600}>{definition.name}</Text>
                        <Text size="sm">{definition.description}</Text>
                        <Text size="xs" c="dimmed">Earned {formattedDate}</Text>
                    </Stack>
                }
                withArrow
                position="top"
            >
                <div
                    onClick={handleClick}
                    className={className}
                    style={{
                        cursor: clickable ? 'pointer' : 'default',
                        display: 'inline-block',
                        transition: 'transform 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        if (clickable) {
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <BadgeIcon size={size} />
                </div>
            </Tooltip>

            {/* Expanded view modal */}
            {clickable && (
                <Modal
                    opened={modalOpen}
                    onClose={() => setModalOpen(false)}
                    title={
                        <Group gap="sm">
                            <BadgeIcon size={32} />
                            <Text fw={600} size="lg">{definition.name}</Text>
                        </Group>
                    }
                    centered
                    size="md"
                >
                    <Stack gap="md">
                        {/* Badge icon (large) */}
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <BadgeIcon size={128} />
                        </div>

                        {/* Badge details */}
                        <Stack gap="xs">
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Description:</Text>
                                <Text size="sm">{definition.description}</Text>
                            </Group>

                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Criteria:</Text>
                                <Text size="sm">{definition.criteria}</Text>
                            </Group>

                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Rarity:</Text>
                                <MantineBadge
                                    color={rarityColors[definition.rarity]}
                                    variant="filled"
                                    size="sm"
                                >
                                    {definition.rarity.toUpperCase()}
                                </MantineBadge>
                            </Group>

                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Earned on:</Text>
                                <Text size="sm" fw={500}>{formattedDate}</Text>
                            </Group>

                            {/* Context information */}
                            {badge.courseId && (
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Course ID:</Text>
                                    <Text size="sm">{badge.courseId}</Text>
                                </Group>
                            )}

                            {badge.moduleId && (
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Module ID:</Text>
                                    <Text size="sm">{badge.moduleId}</Text>
                                </Group>
                            )}

                            {badge.testId && (
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Test ID:</Text>
                                    <Text size="sm">{badge.testId}</Text>
                                </Group>
                            )}
                        </Stack>
                    </Stack>
                </Modal>
            )}
        </>
    );
};
