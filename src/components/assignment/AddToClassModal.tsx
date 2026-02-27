import React, { useState, useEffect } from 'react';
import {
    Modal,
    Stack,
    Select,
    Button,
    Group,
    Text,
    Alert
} from '@mantine/core';
import { IconSchool, IconAlertCircle } from '@tabler/icons-react';

interface AddToClassModalProps {
    opened: boolean;
    onClose: () => void;
    student: {
        uid: string;
        displayName: string;
        email: string;
    } | null;
    classes: Array<{ value: string; label: string }>;
    onConfirm: (classId: string) => Promise<void>;
}

export const AddToClassModal: React.FC<AddToClassModalProps> = ({
    opened,
    onClose,
    student,
    classes,
    onConfirm
}) => {
    const [selectedClass, setSelectedClass] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state when modal opens
    useEffect(() => {
        if (opened) {
            setSelectedClass(null);
            setError(null);
            setLoading(false);
        }
    }, [opened]);

    const handleSubmit = async () => {
        if (!selectedClass || !student) return;

        setLoading(true);
        setError(null);

        try {
            await onConfirm(selectedClass);
            onClose();
        } catch (err) {
            console.error('Error in add to class modal:', err);
            setError(err instanceof Error ? err.message : 'Failed to add student to class');
            setLoading(false); // Only stop loading on error
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <IconSchool size={20} />
                    <Text fw={600}>Add Student to Class</Text>
                </Group>
            }
            size="sm"
            centered
        >
            <Stack gap="md">
                {student && (
                    <Text size="sm">
                        Add <strong>{student.displayName || student.email}</strong> to a class.
                    </Text>
                )}

                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
                        {error}
                    </Alert>
                )}

                <Select
                    label="Select Class"
                    placeholder="Choose a class"
                    data={classes}
                    value={selectedClass}
                    onChange={setSelectedClass}
                    searchable
                    required
                    disabled={loading}
                    nothingFoundMessage="No classes found"
                />

                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        loading={loading}
                        disabled={!selectedClass}
                    >
                        Add to Class
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
