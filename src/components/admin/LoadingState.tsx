/**
 * LoadingState Component
 * 
 * Displays a loading spinner with a message.
 * Uses a clean, modern spinner design with animation.
 * 
 * @example
 * <LoadingState message="Synchronizing data..." />
 */

import { Group, Stack, Text } from '@mantine/core';

interface LoadingStateProps {
    message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
    return (
        <Group justify="center" py="xl" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <Stack align="center" gap="xs">
                {/* Spinner */}
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    border: '4px solid rgba(99, 102, 241, 0.1)',
                    borderTopColor: '#6366f1',
                    animation: 'spin 1s linear infinite'
                }}></div>

                {/* Message */}
                <Text size="sm" fw={600} c="dimmed">{message}</Text>
            </Stack>

            {/* Keyframe Animation */}
            <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </Group>
    );
}
