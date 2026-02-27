
import React, { useEffect, useState } from 'react';
import { Modal, TextInput, NumberInput, Select, Button, Group, Stack, Radio, Textarea, LoadingOverlay } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX, IconRefresh } from '@tabler/icons-react';
import { createCourse, updateCourse, generateCourseCode, validateCourseCode, requestCourseType, getCourseTypes } from '../../services/courseManager';
import type { Course, CourseVisibility } from '../../types/course.types';
import { useAuth } from '../../hooks/useAuth';

interface CourseCreateModalProps {
    opened: boolean;
    onClose: () => void;
    onSuccess: () => void;
    courseToEdit?: Course | null;
}

export const CourseCreateModal: React.FC<CourseCreateModalProps> = ({ opened, onClose, onSuccess, courseToEdit }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [codeValid, setCodeValid] = useState<boolean | null>(null);
    const [isRequestingType, setIsRequestingType] = useState(false);
    const [newTypeRequest, setNewTypeRequest] = useState('');
    const [availableTypes, setAvailableTypes] = useState<{ value: string, label: string }[]>([
        { value: 'IELTS', label: 'IELTS' },
        { value: 'TOEIC', label: 'TOEIC' },
        { value: 'THCS', label: 'THCS' },
        { value: 'THPT', label: 'THPT' },
        { value: 'Communicative', label: 'Communicative' }
    ]);

    useEffect(() => {
        loadCourseTypes();
    }, [opened]);

    const loadCourseTypes = async () => {
        const types = await getCourseTypes();
        const customTypes = types.map(t => ({ value: t.name, label: t.name }));

        // Merge with defaults, avoiding duplicates
        const defaults = [
            { value: 'IELTS', label: 'IELTS' },
            { value: 'TOEIC', label: 'TOEIC' },
            { value: 'THCS', label: 'THCS' },
            { value: 'THPT', label: 'THPT' },
            { value: 'Communicative', label: 'Communicative' }
        ];

        // Combine defaults + custom. If a custom type has same name as default, it's fine.
        // We filter out custom types that overlap with defaults to keep list clean if needed, 
        // but simple concat is usually safe if names are distinct enough or we just dedup by value.
        const allTypes = [...defaults];
        customTypes.forEach(ct => {
            if (!allTypes.some(at => at.value === ct.value)) {
                allTypes.push(ct);
            }
        });

        setAvailableTypes(allTypes);
    };

    const form = useForm({
        initialValues: {
            name: '',
            code: '',
            type: 'IELTS',
            description: '',
            durationValue: 3,
            durationUnit: 'months',
            visibility: 'private',
            entranceRequirements: '',
            graduateTarget: '',
            note: '',
            newType: '',
        },
        validate: {
            name: (value) => !isRequestingType && (value.trim().length < 3 ? 'Name must be at least 3 characters' : null),
            code: (value) => !isRequestingType && (value.trim().length < 5 ? 'Code must be valid' : null),
            durationValue: (value) => !isRequestingType && (value <= 0 ? 'Duration must be positive' : null),
            newType: (value) => isRequestingType && (value.trim().length < 2 ? 'Type name too short' : null),
        },
    });

    // Populate form on edit
    useEffect(() => {
        if (courseToEdit) {
            form.setValues({
                name: courseToEdit.name,
                code: courseToEdit.code,
                type: courseToEdit.type,
                description: courseToEdit.description || '',
                durationValue: courseToEdit.duration.value,
                durationUnit: courseToEdit.duration.unit,
                visibility: courseToEdit.visibility,
                entranceRequirements: courseToEdit.entranceRequirements || '',
                graduateTarget: courseToEdit.graduateTarget || '',
                note: courseToEdit.note || '',
                newType: ''
            });
            setCodeValid(true); // Existing code is valid
            setIsRequestingType(false);
        } else {
            form.reset();
            handleGenerateCode('IELTS'); // Default type
            setIsRequestingType(false);
        }
    }, [courseToEdit, opened]);

    // Generate code when type changes (if creating new)
    const handleGenerateCode = (type: string) => {
        if (!courseToEdit && type !== 'request_new') {
            const code = generateCourseCode(type);
            form.setFieldValue('code', code);
            validateCode(code);
        }
    };

    const validateCode = async (code: string) => {
        if (!code || isRequestingType) return;
        setLoading(true);
        // If editing and code hasn't changed, it's valid
        if (courseToEdit && code === courseToEdit.code) {
            setCodeValid(true);
            setLoading(false);
            return;
        }

        const isValid = await validateCourseCode(code);
        setCodeValid(isValid);
        setLoading(false);
        if (!isValid) {
            form.setFieldError('code', 'Course code already exists');
        } else {
            form.clearFieldError('code');
        }
    };

    const handleSubmit = async (values: typeof form.values) => {
        if (!user?.uid) return;

        setLoading(true);
        try {
            if (isRequestingType) {
                // Handle Type Request
                const result = await requestCourseType(user.uid, values.newType);
                if (result.success) {
                    notifications.show({ title: 'Success', message: 'Course type requested. Please wait for approval.', color: 'green' });
                    // Optional: Switch back to normal mode or close
                    setIsRequestingType(false);
                    form.setFieldValue('type', 'IELTS'); // Reset to default
                } else {
                    notifications.show({ title: 'Error', message: result.error || 'Failed to request type', color: 'red' });
                }
            } else {
                // Handle Course Creation/Update
                if (codeValid === false) return;

                const courseData: Partial<Course> = {
                    name: values.name,
                    code: values.code,
                    type: values.type,
                    description: values.description,
                    duration: {
                        value: values.durationValue,
                        unit: values.durationUnit as 'days' | 'months' | 'years',
                    },
                    visibility: values.visibility as CourseVisibility,
                    entranceRequirements: values.entranceRequirements,
                    graduateTarget: values.graduateTarget,
                    note: values.note,
                };

                if (courseToEdit) {
                    await updateCourse(courseToEdit.id, courseData);
                    notifications.show({ title: 'Success', message: 'Course updated successfully', color: 'green' });
                } else {
                    await createCourse(courseData as any, user.uid);
                    notifications.show({ title: 'Success', message: 'Course created successfully', color: 'green' });
                }
                onSuccess();
                onClose();
            }
        } catch (error) {
            console.error(error);
            notifications.show({ title: 'Error', message: 'Operation failed', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📚</span>
                    <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>
                        {courseToEdit ? "Edit Course" : "Create New Course"}
                    </span>
                </div>
            }
            size="lg"
            padding="xl"
            radius="lg"
            styles={{
                header: {
                    paddingBottom: '1.5rem',
                    borderBottom: '1px solid #f1f5f9'
                },
                body: {
                    paddingTop: '1.5rem'
                }
            }}
        >
            <LoadingOverlay visible={loading} />
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="lg">
                    <TextInput
                        label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Course Name</span>}
                        placeholder="e.g. IELTS Intensive"
                        required
                        styles={{ input: { borderRadius: '0.75rem', padding: '0.75rem' } }}
                        {...form.getInputProps('name')}
                    />

                    <Group grow>
                        <Select
                            label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Course Type</span>}
                            data={[
                                ...availableTypes,
                                { value: 'request_new', label: '+ Request new type...' }
                            ]}
                            required
                            styles={{ input: { borderRadius: '0.75rem' } }}
                            {...form.getInputProps('type')}
                            onChange={(value) => {
                                if (value === 'request_new') {
                                    setIsRequestingType(true);
                                    form.setFieldValue('type', 'request_new');
                                } else {
                                    setIsRequestingType(false);
                                    form.setFieldValue('type', value || 'IELTS');
                                    handleGenerateCode(value || 'IELTS');
                                }
                            }}
                        />
                        <TextInput
                            label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Course Code</span>}
                            description="Unique identifier"
                            required
                            styles={{ input: { borderRadius: '0.75rem' } }}
                            rightSection={
                                loading ? <IconRefresh className="mantine-rotate" size={16} /> :
                                    codeValid ? <IconCheck color="green" size={16} /> :
                                        codeValid === false ? <IconX color="red" size={16} /> : null
                            }
                            {...form.getInputProps('code')}
                            onBlur={(e) => validateCode(e.target.value)}
                        />
                    </Group>

                    {isRequestingType && (
                        <TextInput
                            label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>New Course Type Name</span>}
                            placeholder="e.g. SAT"
                            required
                            value={newTypeRequest}
                            onChange={(e) => {
                                setNewTypeRequest(e.currentTarget.value);
                                form.setFieldValue('newType', e.currentTarget.value);
                            }}
                            styles={{ input: { borderRadius: '0.75rem' } }}
                            mb="sm"
                        />
                    )}

                    <Group grow>
                        <NumberInput
                            label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Duration Value</span>}
                            min={1}
                            styles={{ input: { borderRadius: '0.75rem' } }}
                            {...form.getInputProps('durationValue')}
                        />
                        <Select
                            label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Duration Unit</span>}
                            data={[
                                { value: 'days', label: 'Days' },
                                { value: 'months', label: 'Months' },
                                { value: 'years', label: 'Years' },
                            ]}
                            styles={{ input: { borderRadius: '0.75rem' } }}
                            {...form.getInputProps('durationUnit')}
                        />
                    </Group>

                    <Radio.Group
                        label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Visibility</span>}
                        description="Who can see this course?"
                        {...form.getInputProps('visibility')}
                    >
                        <Group mt="xs">
                            <Radio value="private" label="Private (You only)" />
                            <Radio value="public" label="Public (Catalog)" />
                            <Radio value="protected" label="Protected (Code required)" />
                        </Group>
                    </Radio.Group>

                    <Textarea
                        label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Description</span>}
                        placeholder="Course overview..."
                        minRows={3}
                        styles={{ input: { borderRadius: '0.75rem', padding: '0.75rem' } }}
                        {...form.getInputProps('description')}
                    />

                    <Group grow>
                        <TextInput
                            label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Entrance Req.</span>}
                            placeholder="e.g. 4.0+"
                            styles={{ input: { borderRadius: '0.75rem' } }}
                            {...form.getInputProps('entranceRequirements')}
                        />
                        <TextInput
                            label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Target</span>}
                            placeholder="e.g. 6.5+"
                            styles={{ input: { borderRadius: '0.75rem' } }}
                            {...form.getInputProps('graduateTarget')}
                        />
                    </Group>

                    <Textarea
                        label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Private Notes</span>}
                        placeholder="Internal notes..."
                        styles={{ input: { borderRadius: '0.75rem', padding: '0.75rem' } }}
                        {...form.getInputProps('note')}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                        <Button
                            variant="default"
                            onClick={onClose}
                            styles={{
                                root: {
                                    borderRadius: '0.75rem',
                                    fontWeight: 600
                                }
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            loading={loading}
                            styles={{
                                root: {
                                    borderRadius: '0.75rem',
                                    fontWeight: 600
                                }
                            }}
                        >
                            {isRequestingType ? 'Request Type' : 'Save Course'}
                        </Button>
                    </div>
                </Stack>
            </form>
        </Modal>
    );
};
