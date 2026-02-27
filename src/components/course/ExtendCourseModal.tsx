
import React, { useState } from 'react';
import { Modal, Button, NumberInput, Select, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { extendCourseDuration } from '../../services/enrollmentManager';
import { notifications } from '@mantine/notifications';

interface ExtendCourseModalProps {
    opened: boolean;
    onClose: () => void;
    classCourseId: string | null;
    onSuccess: () => void;
}

export const ExtendCourseModal: React.FC<ExtendCourseModalProps> = ({
    opened,
    onClose,
    classCourseId,
    onSuccess
}) => {
    const [submitting, setSubmitting] = useState(false);

    const form = useForm({
        initialValues: {
            durationValue: 30,
            durationUnit: 'days' as 'days' | 'months' | 'years'
        },
        validate: {
            durationValue: (value) => value > 0 ? null : 'Duration must be positive'
        }
    });

    const handleSubmit = async (values: typeof form.values) => {
        if (!classCourseId) return;

        setSubmitting(true);
        try {
            const result = await extendCourseDuration(
                classCourseId,
                { value: values.durationValue, unit: values.durationUnit }
            );

            if (result.success) {
                notifications.show({ title: 'Success', message: 'Course duration extended', color: 'green' });
                onSuccess();
                handleClose();
            } else {
                notifications.show({ title: 'Error', message: result.error || 'Failed to extend duration', color: 'red' });
            }
        } catch (error) {
            console.error('Error extending duration:', error);
            notifications.show({ title: 'Error', message: 'An unexpected error occurred', color: 'red' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        form.reset();
        onClose();
    };

    return (
        <Modal opened={opened} onClose={handleClose} title="Extend Course Access">
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack>
                    <Group grow align="flex-start">
                        <NumberInput
                            label="Extend by"
                            min={1}
                            {...form.getInputProps('durationValue')}
                        />
                        <Select
                            label="Unit"
                            data={[
                                { value: 'days', label: 'Days' },
                                { value: 'months', label: 'Months' },
                                { value: 'years', label: 'Years' }
                            ]}
                            {...form.getInputProps('durationUnit')}
                        />
                    </Group>

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={handleClose}>Cancel</Button>
                        <Button
                            type="submit"
                            loading={submitting}
                            color="violet"
                            disabled={!classCourseId}
                        >
                            Extend
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
