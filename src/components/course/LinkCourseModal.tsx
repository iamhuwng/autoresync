
import React, { useEffect, useState } from 'react';
import { Modal, Button, TextInput, NumberInput, Select, Switch, Group, Stack, Text, Loader, ScrollArea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSearch } from '@tabler/icons-react';
import { getCoursesByOwner } from '../../services/courseManager';
import { linkCourseToClass } from '../../services/enrollmentManager';
import type { Course } from '../../types/course.types';
import { notifications } from '@mantine/notifications';

interface LinkCourseModalProps {
    opened: boolean;
    onClose: () => void;
    classId: string;
    teacherId: string;
    onSuccess: () => void;
}

export const LinkCourseModal: React.FC<LinkCourseModalProps> = ({
    opened,
    onClose,
    classId,
    teacherId,
    onSuccess
}) => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

    const form = useForm({
        initialValues: {
            durationValue: 1,
            durationUnit: 'months' as 'days' | 'months' | 'years',
            isAutoEnroll: true
        },
        validate: {
            durationValue: (value) => value > 0 ? null : 'Duration must be positive'
        }
    });

    useEffect(() => {
        if (opened && teacherId) {
            loadCourses();
        }
    }, [opened, teacherId]);

    const loadCourses = async () => {
        setLoading(true);
        try {
            const data = await getCoursesByOwner(teacherId);
            // Filter out archived? Maybe.
            setCourses(data.filter(c => !c.archivedAt));
        } catch (error) {
            console.error('Error loading courses:', error);
            notifications.show({ title: 'Error', message: 'Failed to load courses', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (values: typeof form.values) => {
        if (!selectedCourseId) return;

        setSubmitting(true);
        try {
            const result = await linkCourseToClass(
                classId,
                selectedCourseId,
                { value: values.durationValue, unit: values.durationUnit },
                values.isAutoEnroll
            );

            if (result.success) {
                notifications.show({ title: 'Success', message: 'Course linked successfully', color: 'green' });
                onSuccess();
                handleClose();
            } else {
                notifications.show({ title: 'Error', message: result.error || 'Failed to link course', color: 'red' });
            }
        } catch (error) {
            console.error('Error linking course:', error);
            notifications.show({ title: 'Error', message: 'An unexpected error occurred', color: 'red' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        form.reset();
        setSelectedCourseId(null);
        onClose();
    };

    const filteredCourses = courses.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Modal opened={opened} onClose={handleClose} title="Link Course to Class" size="lg">
            <Stack>
                <TextInput
                    placeholder="Search your courses..."
                    leftSection={<IconSearch size={16} />}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.currentTarget.value)}
                />

                <Text size="sm" fw={500} mt="xs">Select a Course:</Text>

                <ScrollArea h={200} type="always" offsetScrollbars>
                    {loading ? (
                        <Group justify="center" p="md"><Loader size="sm" /></Group>
                    ) : filteredCourses.length === 0 ? (
                        <Text c="dimmed" ta="center" py="md">No courses found</Text>
                    ) : (
                        <Stack gap="xs">
                            {filteredCourses.map(course => (
                                <div
                                    key={course.id}
                                    style={{
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        border: `1px solid ${selectedCourseId === course.id ? '#7c3aed' : '#e2e8f0'}`,
                                        backgroundColor: selectedCourseId === course.id ? '#f3e8ff' : 'white',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                    onClick={() => setSelectedCourseId(course.id)}
                                >
                                    <Group justify="space-between">
                                        <div>
                                            <Text fw={500} size="sm">{course.name}</Text>
                                            <Text size="xs" c="dimmed">{course.code}</Text>
                                        </div>
                                        <Text size="xs" fw={500} c={selectedCourseId === course.id ? 'violet' : 'dimmed'}>
                                            {selectedCourseId === course.id ? 'Selected' : 'Select'}
                                        </Text>
                                    </Group>
                                </div>
                            ))}
                        </Stack>
                    )}
                </ScrollArea>

                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Group grow align="flex-start">
                        <NumberInput
                            label="Access Duration"
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

                    <Switch
                        label="Auto-enroll current students"
                        description="All students currently in the class will be enrolled immediately"
                        mt="md"
                        {...form.getInputProps('isAutoEnroll', { type: 'checkbox' })}
                    />

                    <Group justify="flex-end" mt="xl">
                        <Button variant="default" onClick={handleClose}>Cancel</Button>
                        <Button
                            type="submit"
                            loading={submitting}
                            disabled={!selectedCourseId}
                            color="violet"
                        >
                            Link Course
                        </Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};
