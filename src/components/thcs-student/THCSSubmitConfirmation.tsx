/**
 * THCSSubmitConfirmation — Submit dialog (PRD-0027 Task 5.6)
 */
import React from 'react';
import { Modal, Text, Button } from '@mantine/core';

interface THCSSubmitConfirmationProps {
    opened: boolean;
    unansweredCount: number;
    totalCount: number;
    onConfirm: () => void;
    onCancel: () => void;
}

const THCSSubmitConfirmation: React.FC<THCSSubmitConfirmationProps> = ({
    opened, unansweredCount, totalCount, onConfirm, onCancel,
}) => {
    return (
        <Modal
            opened={opened}
            onClose={onCancel}
            title="Submit Test"
            centered
            size="sm"
        >
            <Text size="sm" mb="md">
                {unansweredCount > 0
                    ? `You have ${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''} out of ${totalCount}. Submit anyway?`
                    : 'Are you sure you want to submit? You cannot change your answers after submission.'
                }
            </Text>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <Button variant="subtle" onClick={onCancel}>Cancel</Button>
                <Button color="violet" onClick={onConfirm}>
                    {unansweredCount > 0 ? 'Submit Anyway' : 'Submit'}
                </Button>
            </div>
        </Modal>
    );
};

export default THCSSubmitConfirmation;
