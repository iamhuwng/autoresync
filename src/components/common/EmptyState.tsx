/**
 * EmptyState.tsx
 * 
 * Reusable empty state component with helpful messages and actions.
 * Per PRD-0016, Task 7.8 - UI/UX Polish
 * 
 * @module components/common/EmptyState
 */

import React from 'react';
import {
    Button,
    Card,
    Center,
    Stack,
    Text,
    ThemeIcon,
    Title
} from '@mantine/core';
import {
    IconBooks,
    IconClipboardList,
    IconFlame,
    IconHistory,
    IconNotebook,
    IconPlus,
    IconSearch,
    IconTrophy
} from '@tabler/icons-react';

// ============================================================================
// TYPES
// ============================================================================

export type EmptyStateType =
    | 'homework'
    | 'library'
    | 'results'
    | 'streak'
    | 'search'
    | 'history'
    | 'generic';

export interface EmptyStateProps {
    /** Empty state type determines icon and default message */
    type?: EmptyStateType;
    /** Custom title */
    title?: string;
    /** Custom message */
    message?: string;
    /** Icon to display */
    icon?: React.ReactNode;
    /** Primary action */
    action?: {
        label: string;
        onClick: () => void;
        icon?: React.ReactNode;
    };
    /** Secondary action */
    secondaryAction?: {
        label: string;
        onClick: () => void;
    };
    /** If true, show compact inline version */
    compact?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const getEmptyConfig = (type: EmptyStateType) => {
    switch (type) {
        case 'homework':
            return {
                icon: IconClipboardList,
                color: 'blue',
                defaultTitle: 'No Homework Yet',
                defaultMessage: 'You don\'t have any homework assignments right now. Check back later or start some self-study!'
            };
        case 'library':
            return {
                icon: IconBooks,
                color: 'violet',
                defaultTitle: 'Your Library is Empty',
                defaultMessage: 'Add materials to your library to practice them anytime. Browse courses or search for specific topics.'
            };
        case 'results':
            return {
                icon: IconTrophy,
                color: 'yellow',
                defaultTitle: 'No Results Yet',
                defaultMessage: 'Complete some quizzes or practice sessions to see your results here.'
            };
        case 'streak':
            return {
                icon: IconFlame,
                color: 'orange',
                defaultTitle: 'Start Your Streak!',
                defaultMessage: 'Practice today to begin your learning streak. Consistent practice leads to better results!'
            };
        case 'search':
            return {
                icon: IconSearch,
                color: 'gray',
                defaultTitle: 'No Results Found',
                defaultMessage: 'Try adjusting your search terms or filters to find what you\'re looking for.'
            };
        case 'history':
            return {
                icon: IconHistory,
                color: 'teal',
                defaultTitle: 'No Activity Yet',
                defaultMessage: 'Your recent activity will appear here after you start practicing.'
            };
        case 'generic':
        default:
            return {
                icon: IconNotebook,
                color: 'gray',
                defaultTitle: 'Nothing Here Yet',
                defaultMessage: 'There\'s no content to display at the moment.'
            };
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const EmptyState: React.FC<EmptyStateProps> = ({
    type = 'generic',
    title,
    message,
    icon,
    action,
    secondaryAction,
    compact = false
}) => {
    const config = getEmptyConfig(type);
    const Icon = config.icon;
    const displayTitle = title || config.defaultTitle;
    const displayMessage = message || config.defaultMessage;

    // Compact inline version
    if (compact) {
        return (
            <Card padding="md" withBorder bg="dark.6">
                <Stack align="center" gap="xs">
                    <ThemeIcon size="md" variant="light" color={config.color}>
                        {icon || <Icon size={16} />}
                    </ThemeIcon>
                    <Text size="sm" c="dimmed" ta="center">
                        {displayMessage}
                    </Text>
                    {action && (
                        <Button
                            size="xs"
                            variant="light"
                            leftSection={action.icon}
                            onClick={action.onClick}
                        >
                            {action.label}
                        </Button>
                    )}
                </Stack>
            </Card>
        );
    }

    // Full empty state
    return (
        <Center py="xl">
            <Card
                padding="xl"
                withBorder
                style={{ maxWidth: 400, textAlign: 'center' }}
                bg="dark.6"
            >
                <Stack align="center" gap="md">
                    <ThemeIcon
                        size={70}
                        variant="light"
                        color={config.color}
                        radius="xl"
                    >
                        {icon || <Icon size={35} />}
                    </ThemeIcon>

                    <Title order={4}>{displayTitle}</Title>

                    <Text c="dimmed" size="sm">
                        {displayMessage}
                    </Text>

                    {(action || secondaryAction) && (
                        <Stack gap="xs" mt="md" w="100%">
                            {action && (
                                <Button
                                    leftSection={action.icon || <IconPlus size={16} />}
                                    onClick={action.onClick}
                                    fullWidth
                                >
                                    {action.label}
                                </Button>
                            )}
                            {secondaryAction && (
                                <Button
                                    variant="subtle"
                                    onClick={secondaryAction.onClick}
                                    fullWidth
                                >
                                    {secondaryAction.label}
                                </Button>
                            )}
                        </Stack>
                    )}
                </Stack>
            </Card>
        </Center>
    );
};

// ============================================================================
// SPECIALIZED EMPTY STATES
// ============================================================================

export const NoHomework: React.FC<{ onStartPractice?: () => void }> = ({ onStartPractice }) => (
    <EmptyState
        type="homework"
        action={onStartPractice ? {
            label: 'Start Self-Study',
            onClick: onStartPractice,
            icon: <IconBooks size={16} />
        } : undefined}
    />
);

export const EmptyLibrary: React.FC<{ onBrowse?: () => void }> = ({ onBrowse }) => (
    <EmptyState
        type="library"
        action={onBrowse ? {
            label: 'Browse Materials',
            onClick: onBrowse
        } : undefined}
    />
);

export const NoResults: React.FC<{ onStartPractice?: () => void }> = ({ onStartPractice }) => (
    <EmptyState
        type="results"
        action={onStartPractice ? {
            label: 'Start Practicing',
            onClick: onStartPractice
        } : undefined}
    />
);

export const NoSearchResults: React.FC<{ onClear?: () => void }> = ({ onClear }) => (
    <EmptyState
        type="search"
        action={onClear ? {
            label: 'Clear Search',
            onClick: onClear
        } : undefined}
    />
);

export const StartStreak: React.FC<{ onStartPractice?: () => void }> = ({ onStartPractice }) => (
    <EmptyState
        type="streak"
        action={onStartPractice ? {
            label: 'Start Practicing',
            onClick: onStartPractice,
            icon: <IconFlame size={16} />
        } : undefined}
    />
);

export default EmptyState;
