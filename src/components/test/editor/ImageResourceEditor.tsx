import React, { useState, useRef } from 'react';
import { Text, TextInput, Stack, Group, SimpleGrid, Card, Image, ActionIcon, Loader, Badge } from '@mantine/core';
import { Button } from '../../modern';
import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import type { ContextResource } from '../../../services/testStorage';
// @ts-ignore
import r2StorageService from '../../../services/r2Storage';

interface ImageResourceEditorProps {
    resource: ContextResource;
    onUpdate: (resource: ContextResource) => void;
    totalQuestions: number;
    readOnly?: boolean;
}

export const ImageResourceEditor: React.FC<ImageResourceEditorProps> = ({
    resource,
    onUpdate,
    totalQuestions,
    readOnly = false
}) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleChange = (field: keyof ContextResource, value: any) => {
        onUpdate({ ...resource, [field]: value });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (readOnly) return;
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsUploading(true);
        setUploadError(null);

        const newImages = [...(resource.images || [])];
        let errorCount = 0;

        try {
            // Upload sequentially to avoid overwhelming the browser/network
            for (let i = 0; i < files.length; i++) {
                const file = files.item(i);
                if (!file) continue;

                // Validate file type
                if (!file.type.startsWith('image/')) {
                    errorCount++;
                    continue;
                }

                // Max size 10MB
                if (file.size > 10 * 1024 * 1024) {
                    errorCount++;
                    continue;
                }

                const result = await r2StorageService.uploadImage(file);
                newImages.push(result.url);
            }

            if (errorCount > 0) {
                setUploadError(`${errorCount} file(s) failed validation (must be image < 10MB)`);
            }

            handleChange('images', newImages);

            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error: any) {
            console.error('Image upload failed:', error);
            setUploadError(error.message || 'Failed to upload images');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveImage = (index: number) => {
        if (readOnly) return;
        const newImages = [...(resource.images || [])];
        newImages.splice(index, 1);
        handleChange('images', newImages);
    };

    return (
        <div style={{ padding: '1.5rem', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <Stack gap="lg">
                {/* Header */}
                <div>
                    <Text size="lg" fw={700} mb="sm" style={{ color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <IconPhoto size={24} color="#10b981" />
                        Image Resource Editor
                    </Text>
                    <Text size="sm" c="dimmed">
                        Manage images for this question group.
                    </Text>
                </div>

                {/* Title */}
                <div>
                    <Text size="sm" fw={600} mb="xs">Title</Text>
                    <TextInput
                        value={resource.title}
                        disabled={readOnly}
                        onChange={(e) => !readOnly && handleChange('title', e.target.value)}
                        placeholder="e.g. Activity 2 Images"
                    />
                </div>

                {/* Image Gallery */}
                <div style={{ padding: '1.5rem', background: '#ecfdf5', borderRadius: '0.5rem', border: '1px solid #6ee7b7' }}>
                    <Group justify="space-between" mb="md">
                        <Text size="sm" fw={600} style={{ color: '#047857' }}>
                            Images ({resource.images?.length || 0})
                        </Text>
                        <Button
                            size="xs"
                            variant="glass"
                            onClick={() => !readOnly && fileInputRef.current?.click()}
                            loading={isUploading}
                            disabled={readOnly}
                            icon={<IconUpload size={14} />}
                            style={{ borderColor: '#10b981', color: '#059669', opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'not-allowed' : undefined }}
                        >
                            Add Images
                        </Button>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                    </Group>

                    {isUploading && (
                        <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                            <Loader size="sm" color="teal" />
                            <Text size="xs" c="teal">Uploading...</Text>
                        </div>
                    )}

                    {uploadError && (
                        <Text size="sm" c="red" mb="md" style={{ textAlign: 'center' }}>{uploadError}</Text>
                    )}

                    {!resource.images || resource.images.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #a7f3d0', borderRadius: '0.5rem' }}>
                            <Text size="sm" c="dimmed">No images uploaded yet.</Text>
                            <Button
                                size="sm"
                                variant="glass"
                                onClick={() => !readOnly && fileInputRef.current?.click()}
                                disabled={readOnly}
                                style={{ marginTop: '1rem', borderColor: '#10b981', color: '#059669', opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'not-allowed' : undefined }}
                            >
                                Select Files
                            </Button>
                        </div>
                    ) : (
                        <SimpleGrid cols={3} spacing="sm">
                            {resource.images.map((url, index) => (
                                <Card key={index} padding="0" radius="sm" withBorder>
                                    <div style={{ position: 'relative', aspectRatio: '16/9' }}>
                                        <Image
                                            src={url}
                                            height="100%"
                                            width="100%"
                                            fit="cover"
                                            fallbackSrc="https://placehold.co/400x300?text=Error"
                                        />
                                        <ActionIcon
                                            color="red"
                                            variant="filled"
                                            size="sm"
                                            disabled={readOnly}
                                            style={{ position: 'absolute', top: 5, right: 5, opacity: readOnly ? 0 : 1, display: readOnly ? 'none' : 'flex' }}
                                            onClick={() => handleRemoveImage(index)}
                                        >
                                            <IconX size={14} />
                                        </ActionIcon>
                                        <Badge
                                            size="xs"
                                            variant="filled"
                                            color="dark"
                                            style={{ position: 'absolute', bottom: 5, left: 5, opacity: 0.8 }}
                                        >
                                            #{index + 1}
                                        </Badge>
                                    </div>
                                </Card>
                            ))}
                        </SimpleGrid>
                    )}
                </div>

                {/* Question Range */}
                <div>
                    <Text size="sm" fw={600} mb="xs">Associated Questions</Text>
                    <Group grow>
                        <div>
                            <Text size="xs" c="dimmed" mb={4}>Start Question</Text>
                            <TextInput
                                type="number"
                                min={1}
                                max={totalQuestions}
                                disabled={readOnly}
                                value={resource.questionStart || 1}
                                onChange={(e) => !readOnly && handleChange('questionStart', parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div>
                            <Text size="xs" c="dimmed" mb={4}>End Question</Text>
                            <TextInput
                                type="number"
                                min={resource.questionStart || 1}
                                max={totalQuestions}
                                disabled={readOnly}
                                value={resource.questionEnd || totalQuestions}
                                onChange={(e) => !readOnly && handleChange('questionEnd', parseInt(e.target.value) || totalQuestions)}
                            />
                        </div>
                    </Group>
                </div>
            </Stack>
        </div>
    );
};
