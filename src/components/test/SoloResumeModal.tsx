import React from 'react';
import { Modal, Button, Text, Group } from '@mantine/core';
import type { SoloSessionProgress } from '../../types/practice.types';

interface SoloResumeModalProps {
    opened: boolean;
    onResume: () => void;
    onStartNew: () => void;
    onClose: () => void;
    savedProgress: SoloSessionProgress;
    totalQuestions: number;
}

export const SoloResumeModal: React.FC<SoloResumeModalProps> = ({
    opened,
    onResume,
    onStartNew,
    onClose,
    savedProgress,
    totalQuestions,
}) => {
    const answeredCount = savedProgress?.answers ? Object.keys(savedProgress.answers).length : 0;

    const formattedDate = React.useMemo(() => {
        if (!savedProgress?.startedAt) return 'Unknown Date';
        return new Date(savedProgress.startedAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    }, [savedProgress]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Text fw={700} size="lg">Resume Practice?</Text>}
            radius="md"
            centered
        >
            <Text mb="xl" size="sm">
                You have an in-progress session from <strong>{formattedDate}</strong>.
                <br /><br />
                You have <strong>{answeredCount}{totalQuestions > 0 ? `/${totalQuestions}` : ''}</strong> questions answered so far.
            </Text>

            <Group justify="flex-end">
                <Button variant="outline" onClick={onStartNew} color="gray">
                    Start New
                </Button>
                <Button onClick={onResume} color="indigo">
                    Resume
                </Button>
            </Group>
        </Modal>
    );
};
