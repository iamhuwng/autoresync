/**
 * EmptyState Component
 * 
 * Displays an empty state with emoji, title, description, and optional action button.
 * Used when no data is available or search returns no results.
 * 
 * @example
 * <EmptyState
 *   emoji="📑"
 *   title="No students match your search"
 *   description="We couldn't find any student entries for this filter."
 *   actionLabel="Add your first student"
 *   onAction={() => openModal()}
 * />
 */

import { Text } from '@mantine/core';
import { IconUserPlus } from '@tabler/icons-react';
import { Button } from '../modern';
import type { ReactNode } from 'react';

interface EmptyStateProps {
    emoji?: string;
    title: string;
    description?: string;
    actionLabel?: string;
    actionIcon?: ReactNode;
    onAction?: () => void;
    showAction?: boolean;
}

export function EmptyState({
    emoji = '📑',
    title,
    description,
    actionLabel,
    actionIcon = <IconUserPlus size={18} />,
    onAction,
    showAction = false
}: EmptyStateProps) {
    return (
        <div
            style={{
                textAlign: 'center',
                padding: '5rem 3rem',
                color: '#94a3b8',
                animation: 'fadeIn 0.5s ease-out'
            }}
        >
            {/* Emoji */}
            <div style={{
                fontSize: '4.5rem',
                marginBottom: '1.5rem',
                filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))'
            }}>
                {emoji}
            </div>

            {/* Title */}
            <Text fw={900} size="xl" c="dark">
                {title}
            </Text>

            {/* Description */}
            {description && (
                <Text
                    size="sm"
                    c="dimmed"
                    style={{
                        maxWidth: 450,
                        margin: '0.75rem auto 2rem'
                    }}
                >
                    {description}
                </Text>
            )}

            {/* Action Button */}
            {showAction && actionLabel && onAction && (
                <Button
                    variant="primary"
                    size="lg"
                    onClick={onAction}
                    leftSection={actionIcon}
                >
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
