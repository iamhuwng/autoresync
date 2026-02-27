/**
 * ErrorState.tsx
 * 
 * Reusable error state component with retry functionality.
 * Per PRD-0016, Task 7.8 - UI/UX Polish
 * 
 * @module components/common/ErrorState
 */

import React from 'react';
import {
    Alert,
    Button,
    Card,
    Center,
    Group,
    Stack,
    Text,
    ThemeIcon,
    Title
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconRefresh,
    IconWifiOff,
    IconLock,
    IconServerOff,
    IconBug
} from '@tabler/icons-react';

// ============================================================================
// TYPES
// ============================================================================

export type ErrorType =
    | 'generic'
    | 'network'
    | 'permission'
    | 'server'
    | 'not_found'
    | 'validation';

export interface ErrorStateProps {
    /** Error type determines icon and default message */
    type?: ErrorType;
    /** Custom error title */
    title?: string;
    /** Custom error message */
    message?: string;
    /** Original error object for debugging */
    error?: Error | unknown;
    /** Retry callback */
    onRetry?: () => void;
    /** Retry button text */
    retryText?: string;
    /** If true, show compact inline version */
    compact?: boolean;
    /** If true, show in full page center */
    fullPage?: boolean;
    /** Additional action button */
    action?: {
        label: string;
        onClick: () => void;
    };
}

// ============================================================================
// HELPERS
// ============================================================================

const getErrorConfig = (type: ErrorType) => {
    switch (type) {
        case 'network':
            return {
                icon: IconWifiOff,
                color: 'orange',
                defaultTitle: 'Connection Error',
                defaultMessage: 'Unable to connect. Please check your internet connection and try again.'
            };
        case 'permission':
            return {
                icon: IconLock,
                color: 'red',
                defaultTitle: 'Access Denied',
                defaultMessage: 'You don\'t have permission to access this resource.'
            };
        case 'server':
            return {
                icon: IconServerOff,
                color: 'red',
                defaultTitle: 'Server Error',
                defaultMessage: 'Something went wrong on our end. Please try again later.'
            };
        case 'not_found':
            return {
                icon: IconBug,
                color: 'gray',
                defaultTitle: 'Not Found',
                defaultMessage: 'The requested resource could not be found.'
            };
        case 'validation':
            return {
                icon: IconAlertTriangle,
                color: 'yellow',
                defaultTitle: 'Invalid Data',
                defaultMessage: 'Some data appears to be invalid. Please check and try again.'
            };
        case 'generic':
        default:
            return {
                icon: IconAlertTriangle,
                color: 'red',
                defaultTitle: 'Something Went Wrong',
                defaultMessage: 'An unexpected error occurred. Please try again.'
            };
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ErrorState: React.FC<ErrorStateProps> = ({
    type = 'generic',
    title,
    message,
    error,
    onRetry,
    retryText = 'Try Again',
    compact = false,
    fullPage = false,
    action
}) => {
    const config = getErrorConfig(type);
    const Icon = config.icon;
    const displayTitle = title || config.defaultTitle;
    const displayMessage = message || config.defaultMessage;

    // Log error for debugging in development
    if (error && process.env.NODE_ENV === 'development') {
        console.error('ErrorState:', error);
    }

    // Compact inline version
    if (compact) {
        return (
            <Alert
                color={config.color}
                icon={<Icon size={16} />}
                title={displayTitle}
            >
                <Group justify="space-between" align="center">
                    <Text size="sm">{displayMessage}</Text>
                    {onRetry && (
                        <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconRefresh size={14} />}
                            onClick={onRetry}
                        >
                            {retryText}
                        </Button>
                    )}
                </Group>
            </Alert>
        );
    }

    // Full error card
    const content = (
        <Card padding="xl" withBorder style={{ maxWidth: 400, margin: '0 auto' }}>
            <Stack align="center" gap="md">
                <ThemeIcon
                    size={60}
                    variant="light"
                    color={config.color}
                    radius="xl"
                >
                    <Icon size={30} />
                </ThemeIcon>

                <Title order={4} ta="center">{displayTitle}</Title>

                <Text c="dimmed" size="sm" ta="center">
                    {displayMessage}
                </Text>

                <Group gap="sm" mt="md">
                    {onRetry && (
                        <Button
                            leftSection={<IconRefresh size={16} />}
                            onClick={onRetry}
                        >
                            {retryText}
                        </Button>
                    )}
                    {action && (
                        <Button
                            variant="light"
                            onClick={action.onClick}
                        >
                            {action.label}
                        </Button>
                    )}
                </Group>
            </Stack>
        </Card>
    );

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
// SPECIALIZED ERROR STATES
// ============================================================================

export const NetworkError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
    <ErrorState type="network" onRetry={onRetry} />
);

export const PermissionError: React.FC<{ message?: string }> = ({ message }) => (
    <ErrorState
        type="permission"
        message={message || 'You need permission from your teacher to access this content.'}
    />
);

export const HomeworkNotFoundError: React.FC = () => (
    <ErrorState
        type="not_found"
        title="Homework Not Found"
        message="This homework assignment may have been deleted or you don't have access to it."
    />
);

export const SessionExpiredError: React.FC<{ onLogin?: () => void }> = ({ onLogin }) => (
    <ErrorState
        type="permission"
        title="Session Expired"
        message="Your session has expired. Please log in again."
        action={onLogin ? { label: 'Log In', onClick: onLogin } : undefined}
    />
);

export default ErrorState;
