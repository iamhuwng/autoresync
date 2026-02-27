/**
 * LoadingState.tsx
 * 
 * Reusable loading state component with skeleton patterns.
 * Per PRD-0016, Task 7.8 - UI/UX Polish
 * 
 * @module components/common/LoadingState
 */

import React from 'react';
import {
    Card,
    Center,
    Group,
    Loader,
    Skeleton,
    Stack,
    Text,
    ThemeIcon
} from '@mantine/core';
import { IconClock } from '@tabler/icons-react';

// ============================================================================
// TYPES
// ============================================================================

export interface LoadingStateProps {
    /** Loading message to display */
    message?: string;
    /** Type of loading display */
    variant?: 'spinner' | 'skeleton' | 'card' | 'inline';
    /** Number of skeleton items to show */
    skeletonCount?: number;
    /** Height of skeleton items */
    skeletonHeight?: number;
    /** If true, show in full page center */
    fullPage?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const LoadingState: React.FC<LoadingStateProps> = ({
    message = 'Loading...',
    variant = 'spinner',
    skeletonCount = 3,
    skeletonHeight = 60,
    fullPage = false
}) => {
    const content = (() => {
        switch (variant) {
            case 'skeleton':
                return (
                    <Stack gap="md">
                        {Array.from({ length: skeletonCount }).map((_, i) => (
                            <Skeleton key={i} height={skeletonHeight} radius="md" />
                        ))}
                    </Stack>
                );

            case 'card':
                return (
                    <Stack gap="md">
                        {Array.from({ length: skeletonCount }).map((_, i) => (
                            <Card key={i} padding="md" withBorder>
                                <Group>
                                    <Skeleton circle height={40} width={40} />
                                    <Stack gap="xs" style={{ flex: 1 }}>
                                        <Skeleton height={16} width="60%" />
                                        <Skeleton height={12} width="40%" />
                                    </Stack>
                                </Group>
                            </Card>
                        ))}
                    </Stack>
                );

            case 'inline':
                return (
                    <Group gap="xs">
                        <Loader size="xs" />
                        <Text size="sm" c="dimmed">{message}</Text>
                    </Group>
                );

            case 'spinner':
            default:
                return (
                    <Stack align="center" gap="md">
                        <ThemeIcon
                            size={60}
                            variant="light"
                            color="blue"
                            radius="xl"
                        >
                            <Loader size="md" color="blue" />
                        </ThemeIcon>
                        <Text c="dimmed" size="sm">{message}</Text>
                    </Stack>
                );
        }
    })();

    if (fullPage) {
        return (
            <Center style={{ minHeight: '60vh' }}>
                {content}
            </Center>
        );
    }

    return content;
};

// ============================================================================
// SPECIALIZED LOADING STATES
// ============================================================================

export const HomeworkLoadingState: React.FC = () => (
    <LoadingState
        message="Loading homework assignments..."
        variant="card"
        skeletonCount={4}
    />
);

export const LibraryLoadingState: React.FC = () => (
    <LoadingState
        message="Loading your library..."
        variant="skeleton"
        skeletonCount={6}
        skeletonHeight={80}
    />
);

export const ResultsLoadingState: React.FC = () => (
    <LoadingState
        message="Loading results..."
        variant="card"
        skeletonCount={5}
    />
);

export const StreakLoadingState: React.FC = () => (
    <Card padding="md" withBorder>
        <Stack gap="md">
            <Group>
                <Skeleton circle height={40} width={40} />
                <Skeleton height={20} width={120} />
            </Group>
            <Group justify="space-around">
                <Skeleton height={60} width={70} radius="md" />
                <Skeleton height={60} width={70} radius="md" />
                <Skeleton height={60} width={70} radius="md" />
            </Group>
            <Skeleton height={40} radius="md" />
        </Stack>
    </Card>
);

export default LoadingState;
