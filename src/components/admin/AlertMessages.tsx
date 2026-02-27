/**
 * AlertMessages Component
 * 
 * Displays error and success messages with dismissible alerts.
 * Auto-clears after 5 seconds.
 * 
 * @example
 * <AlertMessages
 *   error={error}
 *   successMessage={successMessage}
 *   onClearError={() => setError(null)}
 *   onClearSuccess={() => setSuccessMessage(null)}
 * />
 */

import { Alert } from '@mantine/core';
import { IconBan, IconCheck } from '@tabler/icons-react';

interface AlertMessagesProps {
    error: string | null;
    successMessage: string | null;
    onClearError: () => void;
    onClearSuccess: () => void;
}

export function AlertMessages({
    error,
    successMessage,
    onClearError,
    onClearSuccess
}: AlertMessagesProps) {
    if (!error && !successMessage) {
        return null;
    }

    return (
        <div style={{ marginBottom: '1rem' }}>
            {error && (
                <Alert
                    color="red"
                    title="Error"
                    onClose={onClearError}
                    withCloseButton
                    icon={<IconBan size={16} />}
                    mb="md"
                >
                    {error}
                </Alert>
            )}
            {successMessage && (
                <Alert
                    color="green"
                    title="Success"
                    onClose={onClearSuccess}
                    withCloseButton
                    icon={<IconCheck size={16} />}
                    mb="md"
                >
                    {successMessage}
                </Alert>
            )}
        </div>
    );
}
