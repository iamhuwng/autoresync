/**
 * AvatarUploader Component
 * 
 * File input with drag-and-drop, preview, and R2 storage integration.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { useState } from 'react';
import { Group, Avatar, Button, Text, FileButton, Stack, Progress } from '@mantine/core';
import { IconUpload, IconX } from '@tabler/icons-react';
import r2StorageService from '@/services/r2Storage';
import { useAuth } from '@/hooks/useAuth';

interface AvatarUploaderProps {
    currentAvatarUrl?: string | null;
    onUploadComplete: (url: string) => void;
    onRemove?: () => void;
    disabled?: boolean;
}

export function AvatarUploader({
    currentAvatarUrl,
    onUploadComplete,
    onRemove,
    disabled
}: AvatarUploaderProps) {
    const { user } = useAuth();
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const displayUrl = previewUrl || currentAvatarUrl;

    const validateFile = (file: File): string | null => {
        // Check file type
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            return 'Only JPEG, PNG, WebP, and GIF images are allowed';
        }

        // Check file size (5MB max)
        const maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if (file.size > maxSize) {
            return 'File size must be less than 5MB';
        }

        return null;
    };

    const resizeImage = (file: File): Promise<File> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        reject(new Error('Failed to get canvas context'));
                        return;
                    }

                    // Set canvas size to 200x200
                    canvas.width = 200;
                    canvas.height = 200;

                    // Calculate scaling to cover the square
                    const scale = Math.max(200 / img.width, 200 / img.height);
                    const scaledWidth = img.width * scale;
                    const scaledHeight = img.height * scale;

                    // Center the image
                    const x = (200 - scaledWidth) / 2;
                    const y = (200 - scaledHeight) / 2;

                    // Draw image
                    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

                    // Convert to blob
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('Failed to create blob'));
                            return;
                        }

                        // Create new file from blob
                        const resizedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now(),
                        });

                        resolve(resizedFile);
                    }, file.type, 0.9); // 90% quality
                };

                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target?.result as string;
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    };

    const handleFileSelect = async (file: File | null) => {
        if (!file) return;

        setError(null);

        // Validate file
        const validationError = validateFile(file);
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setUploading(true);
            setUploadProgress(0);

            // Resize image to 200x200
            const resizedFile = await resizeImage(file);

            // Create preview
            const preview = URL.createObjectURL(resizedFile);
            setPreviewUrl(preview);

            // Upload avatar directly to PERMANENT storage
            // NOTE: Avatars should NOT use the temp folder strategy
            // The temp→permanent flow is only for test creation workflow
            // where files might be abandoned during creation.
            const result = await r2StorageService.uploadAvatar(resizedFile, user?.uid, currentAvatarUrl);

            // Call callback with URL (already permanent, no move needed)
            onUploadComplete(result.url);

            setUploading(false);
            setUploadProgress(100);

        } catch (err) {
            console.error('Avatar upload error:', err);
            setError(err instanceof Error ? err.message : 'Failed to upload avatar');
            setUploading(false);
            setPreviewUrl(null);
        }
    };

    const handleRemove = () => {
        setPreviewUrl(null);
        setError(null);
        if (onRemove) {
            onRemove();
        }
    };

    return (
        <Stack gap="sm">
            <Text size="sm" fw={500}>
                Profile Picture
            </Text>

            <Group align="center" gap="md">
                <Avatar
                    src={displayUrl}
                    size={120}
                    radius="xl"
                    alt="Profile picture"
                />

                <Stack gap="xs">
                    <FileButton
                        onChange={handleFileSelect}
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        disabled={disabled || uploading}
                    >
                        {(props) => (
                            <Button
                                {...props}
                                leftSection={<IconUpload size={16} />}
                                variant="light"
                                loading={uploading}
                            >
                                {uploading ? 'Uploading...' : 'Upload Photo'}
                            </Button>
                        )}
                    </FileButton>

                    {displayUrl && (
                        <Button
                            onClick={handleRemove}
                            leftSection={<IconX size={16} />}
                            variant="subtle"
                            color="red"
                            disabled={disabled || uploading}
                        >
                            Remove
                        </Button>
                    )}

                    <Text size="xs" c="dimmed">
                        JPEG, PNG, WebP, or GIF. Max 5MB.
                        <br />
                        Image will be resized to 200x200.
                    </Text>
                </Stack>
            </Group>

            {uploading && (
                <Progress value={uploadProgress} size="sm" animated />
            )}

            {error && (
                <Text size="sm" c="red">
                    {error}
                </Text>
            )}
        </Stack>
    );
}
