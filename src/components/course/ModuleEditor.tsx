import React, { useEffect } from 'react';
import { Modal, TextInput, Select, Button, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { createModule, updateModule } from '../../services/courseManager';
import type { Module } from '../../types/course.types';
import { notifications } from '@mantine/notifications';

interface ModuleEditorProps {
    opened: boolean;
    onClose: () => void;
    module?: Module;
    courseId: string;
    onSuccess: () => void;
}

export const ModuleEditor = ({ opened, onClose, module, courseId, onSuccess }: ModuleEditorProps) => {
    const form = useForm({
        initialValues: {
            name: '',
            accessType: 'open'
        },
        validate: {
            name: (value) => value.trim().length > 0 ? null : 'Name is required'
        }
    });

    useEffect(() => {
        if (module) {
            form.setValues({
                name: module.name,
                accessType: module.accessType
            });
        } else {
            form.reset();
        }
    }, [module, opened]);

    const handleSubmit = async (values: typeof form.values) => {
        try {
            if (module) {
                await updateModule(module.id, values as unknown as Partial<Module>);
                notifications.show({ color: 'green', message: 'Module updated successfully' });
            } else {
                await createModule(courseId, {
                    name: values.name,
                    accessType: values.accessType as 'open' | 'sequential'
                });
                notifications.show({ color: 'green', message: 'Module created successfully' });
            }
            form.reset();
            onSuccess();
        } catch (error) {
            console.error(error);
            notifications.show({ color: 'red', message: 'Operation failed' });
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={module ? 'Edit Module' : 'Create Module'}
            centered
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack>
                    <TextInput
                        label="Module Name"
                        placeholder="e.g. Introduction"
                        required
                        {...form.getInputProps('name')}
                    />

                    <Select
                        label="Access Type"
                        data={[
                            { value: 'open', label: 'Open' },
                            { value: 'sequential', label: 'Sequential (Must complete previous modules)' }
                        ]}
                        allowDeselect={false}
                        {...form.getInputProps('accessType')}
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={onClose}>Cancel</Button>
                        <Button type="submit">{module ? 'Update' : 'Create'}</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
