import React, { useState, useRef, useEffect } from 'react';
import { Text, TextInput, Stack, Group, Progress, Divider, NumberInput } from '@mantine/core';
import { Button } from '../../modern';
import { IconVolume, IconUpload, IconClock } from '@tabler/icons-react';
import type { ContextResource } from '../../../services/testStorage';
import r2StorageService from '../../../services/r2Storage';

interface AudioResourceEditorProps {
    resource: ContextResource;
    onUpdate: (resource: ContextResource) => void;
    totalQuestions: number;
    readOnly?: boolean;
}

export const AudioResourceEditor: React.FC<AudioResourceEditorProps> = ({
    resource,
    onUpdate,
    totalQuestions,
    readOnly = false
}) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [detectingDuration, setDetectingDuration] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const handleChange = (field: keyof ContextResource, value: any) => {
        onUpdate({ ...resource, [field]: value });
    };

    // Helper to get duration from audio URL
    const detectDuration = (url: string) => {
        if (!url) return;

        setDetectingDuration(true);
        const audio = new Audio(url);

        audio.addEventListener('loadedmetadata', () => {
            const duration = Math.ceil(audio.duration);
            console.log(`🎵 Detected duration: ${duration}s`);
            handleChange('duration', duration);
            setDetectingDuration(false);
        });

        audio.addEventListener('error', (e) => {
            console.warn('⚠️ Could not detect audio duration automatically', e);
            setDetectingDuration(false);
            // Don't clear existing duration, just fail silently
        });
    };

    // Auto-detect duration when URL changes (and duration is missing or zero)
    // We don't want to overwrite if user manually set it, unless it's a new upload
    // using a ref to track previous url to detect actual changes vs value updates
    const prevUrlRef = useRef(resource.audioUrl);

    useEffect(() => {
        if (resource.audioUrl && resource.audioUrl !== prevUrlRef.current) {
            // New URL detected
            detectDuration(resource.audioUrl);
            prevUrlRef.current = resource.audioUrl;
        }
    }, [resource.audioUrl]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (readOnly) return;
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('audio/')) {
            setUploadError('Please select a valid audio file (MP3, WAV, M4A)');
            return;
        }

        // Max size 50MB
        if (file.size > 50 * 1024 * 1024) {
            setUploadError('File size must be less than 50MB');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);
        setUploadError(null);

        try {
            // 1. Upload file
            const result = await r2StorageService.uploadAudioReplacement(file, resource.audioUrl, 'audio', (percent: number) => {
                setUploadProgress(percent);
            });

            // 2. Update URL
            handleChange('audioUrl', result.url);

            // 3. Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';

            // Duration detection will trigger via useEffect

        } catch (error: any) {
            console.error('Audio upload failed:', error);
            setUploadError(error.message || 'Failed to upload audio');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div style={{ padding: '1.5rem', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <Stack gap="lg">
                {/* Header */}
                <div>
                    <Text size="lg" fw={700} mb="sm" style={{ color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <IconVolume size={24} color="#06b6d4" />
                        Audio Resource Editor
                    </Text>
                    <Text size="sm" c="dimmed">
                        Manage audio track for listening questions.
                    </Text>
                </div>

                {/* Title */}
                <div>
                    <Text size="sm" fw={600} mb="xs">Title</Text>
                    <TextInput
                        value={resource.title}
                        onChange={(e) => !readOnly && handleChange('title', e.target.value)}
                        disabled={readOnly}
                        placeholder="e.g. Section 1: Conversation"
                    />
                </div>

                {/* Audio Source */}
                <div style={{ padding: '1.5rem', background: '#ecfeff', borderRadius: '0.5rem', border: '1px solid #a5f3fc' }}>
                    <Text size="sm" fw={600} mb="md" style={{ color: '#0e7490' }}>Audio Source</Text>

                    {resource.audioUrl ? (
                        <Stack gap="md">
                            <audio
                                ref={audioRef}
                                controls
                                src={resource.audioUrl}
                                style={{ width: '100%', borderRadius: '30px' }}
                                onLoadedMetadata={(e) => {
                                    // Backup detection in case useEffect one fails or for initial load
                                    if (!resource.duration) {
                                        handleChange('duration', Math.ceil(e.currentTarget.duration));
                                    }
                                }}
                            />

                            <Group align="flex-end">
                                <Stack gap={4} style={{ flex: 1 }}>
                                    <Text size="xs" fw={500} c="dimmed" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <IconClock size={14} /> Duration (seconds)
                                    </Text>
                                    <NumberInput
                                        value={resource.duration || 0}
                                        onChange={(val) => !readOnly && handleChange('duration', typeof val === 'number' ? val : 0)}
                                        min={0}
                                        disabled={readOnly}
                                        placeholder="Duration in seconds"
                                        rightSection={detectingDuration ? <Progress value={100} animated size="xs" w={20} /> : null}
                                    />
                                </Stack>

                                <Button
                                    variant="glass"
                                    size="sm"
                                    onClick={() => !readOnly && fileInputRef.current?.click()}
                                    disabled={readOnly}
                                    style={{ borderColor: '#06b6d4', color: '#0891b2', marginBottom: 2 }}
                                >
                                    Replace
                                </Button>
                                <Button
                                    variant="glass"
                                    size="sm"
                                    onClick={() => {
                                        if (readOnly) return;
                                        handleChange('audioUrl', '');
                                        handleChange('duration', 0);
                                    }}
                                    disabled={readOnly}
                                    style={{ borderColor: '#ef4444', color: '#ef4444', marginBottom: 2 }}
                                >
                                    Remove
                                </Button>
                            </Group>

                            <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>URL: {resource.audioUrl}</Text>
                        </Stack>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '1rem' }}>
                            <input
                                type="file"
                                accept="audio/*"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                            <Button
                                onClick={() => !readOnly && fileInputRef.current?.click()}
                                loading={isUploading}
                                disabled={readOnly}
                                icon={<IconUpload size={18} />}
                                style={{ background: '#06b6d4', opacity: readOnly ? 0.5 : 1, cursor: readOnly ? 'not-allowed' : undefined }}
                            >
                                Upload Audio File
                            </Button>
                            <Text size="xs" c="dimmed" mt="sm">Supports MP3, WAV, M4A (Max 50MB)</Text>

                            {isUploading && (
                                <div style={{ marginTop: '1rem' }}>
                                    <Progress value={uploadProgress} size="sm" color="cyan" striped animated />
                                    <Text size="xs" style={{ textAlign: 'center' }} mt={4}>{uploadProgress}% Uploading...</Text>
                                </div>
                            )}

                            {uploadError && (
                                <Text size="sm" color="red" mt="sm">{uploadError}</Text>
                            )}

                            <Divider my="md" label="OR" labelPosition="center" />

                            <TextInput
                                placeholder="Paste direct audio URL..."
                                disabled={readOnly}
                                onChange={(e) => !readOnly && handleChange('audioUrl', e.target.value)}
                            />
                        </div>
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
