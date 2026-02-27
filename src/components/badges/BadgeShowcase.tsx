/**
 * Badge Showcase Component
 * 
 * Displays a grid of all earned badges with count indicator.
 * Shows empty state when no badges have been earned.
 */

import React, { useEffect, useState } from 'react';
import {
    Paper,
    Text,
    SimpleGrid,
    Stack,
    Group,
    Badge as MantineBadge,
    Loader,
    Center,
    Title,
} from '@mantine/core';
import { IconTrophy, IconLock } from '@tabler/icons-react';
import { Badge, BADGE_DEFINITIONS, BadgeType } from '../../types/badge.types';
import { BadgeDisplay } from './BadgeDisplay';
import { getStudentBadges } from '../../services/badgeService';

interface BadgeShowcaseProps {
    /** Student user ID */
    studentId: string;

    /** Show locked (unearned) badges */
    showLocked?: boolean;

    /** Custom title */
    title?: string;
}

/**
 * Badge Showcase Component
 */
export const BadgeShowcase: React.FC<BadgeShowcaseProps> = ({
    studentId,
    showLocked = true,
    title = '🏆 Badges',
}) => {
    const [badges, setBadges] = useState<Badge[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadBadges();
    }, [studentId]);

    const loadBadges = async () => {
        try {
            setLoading(true);
            setError(null);
            const earnedBadges = await getStudentBadges(studentId);
            setBadges(earnedBadges);
        } catch (err) {
            console.error('Error loading badges:', err);
            setError('Failed to load badges');
        } finally {
            setLoading(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <Paper shadow="sm" p="lg" radius="md" withBorder>
                <Center py="xl">
                    <Loader size="md" />
                </Center>
            </Paper>
        );
    }

    // Error state
    if (error) {
        return (
            <Paper shadow="sm" p="lg" radius="md" withBorder>
                <Center py="xl">
                    <Text c="red">{error}</Text>
                </Center>
            </Paper>
        );
    }

    // Get earned badge types
    const earnedTypes = new Set(badges.map((b) => b.type));

    // All badge types
    const allBadgeTypes = Object.values(BadgeType);

    // Empty state
    if (badges.length === 0 && !showLocked) {
        return (
            <Paper shadow="sm" p="lg" radius="md" withBorder>
                <Stack align="center" gap="md" py="xl">
                    <IconTrophy size={64} stroke={1.5} color="var(--mantine-color-gray-4)" />
                    <Stack align="center" gap="xs">
                        <Title order={3} c="dimmed">No Badges Yet</Title>
                        <Text size="sm" c="dimmed" ta="center">
                            Complete tests and achieve milestones to earn badges!
                        </Text>
                    </Stack>
                </Stack>
            </Paper>
        );
    }

    return (
        <Paper shadow="sm" p="lg" radius="md" withBorder>
            <Stack gap="md">
                {/* Header */}
                <Group justify="space-between" align="center">
                    <Text fw={600} size="lg">{title}</Text>
                    <MantineBadge size="lg" variant="filled" color="blue">
                        {badges.length} / {allBadgeTypes.length}
                    </MantineBadge>
                </Group>

                {/* Progress bar */}
                <div
                    style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: 'var(--mantine-color-gray-2)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            width: `${(badges.length / allBadgeTypes.length) * 100}%`,
                            height: '100%',
                            backgroundColor: 'var(--mantine-color-blue-6)',
                            transition: 'width 0.3s ease',
                        }}
                    />
                </div>

                {/* Badge grid */}
                <SimpleGrid
                    cols={{ base: 3, xs: 4, sm: 5, md: 6 }}
                    spacing="md"
                    verticalSpacing="md"
                >
                    {allBadgeTypes.map((badgeType) => {
                        const isEarned = earnedTypes.has(badgeType);
                        const badge = badges.find((b) => b.type === badgeType);
                        const definition = BADGE_DEFINITIONS[badgeType];

                        if (isEarned && badge) {
                            // Show earned badge
                            return (
                                <div key={badgeType} style={{ textAlign: 'center' }}>
                                    <BadgeDisplay
                                        badge={badge}
                                        size={56}
                                        clickable={true}
                                    />
                                    <Text size="xs" mt={4} lineClamp={2}>
                                        {definition.name}
                                    </Text>
                                </div>
                            );
                        } else if (showLocked) {
                            // Show locked badge
                            return (
                                <div
                                    key={badgeType}
                                    style={{
                                        textAlign: 'center',
                                        opacity: 0.3,
                                        filter: 'grayscale(100%)',
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'relative',
                                            display: 'inline-block',
                                        }}
                                    >
                                        <div style={{ filter: 'blur(2px)' }}>
                                            <BadgeDisplay
                                                badge={{
                                                    type: badgeType,
                                                    earnedAt: Date.now(),
                                                }}
                                                size={56}
                                                clickable={false}
                                            />
                                        </div>
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: '50%',
                                                left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                            }}
                                        >
                                            <IconLock size={24} stroke={2} />
                                        </div>
                                    </div>
                                    <Text size="xs" mt={4} lineClamp={2}>
                                        {definition.name}
                                    </Text>
                                </div>
                            );
                        }

                        return null;
                    })}
                </SimpleGrid>

                {/* Footer message */}
                {badges.length > 0 && badges.length < allBadgeTypes.length && (
                    <Text size="sm" c="dimmed" ta="center" mt="md">
                        {allBadgeTypes.length - badges.length} more badge{allBadgeTypes.length - badges.length !== 1 ? 's' : ''} to unlock!
                    </Text>
                )}

                {badges.length === allBadgeTypes.length && (
                    <Text size="sm" c="blue" ta="center" mt="md" fw={600}>
                        🎉 Congratulations! You've earned all badges!
                    </Text>
                )}
            </Stack>
        </Paper>
    );
};
