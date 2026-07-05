// @ts-nocheck
/**
 * THCSDocumentUpload — Phase 3, Task 10.6
 *
 * Drag-and-drop file upload for Auto Test Maker.
 * Accepts .docx, .pdf, .txt (max 10MB).
 * ⚠️ Rule 8: Must be integrated into test creation flow.
 */

import { useState, useCallback, useRef } from 'react';
import { Stack, Text, Badge, Alert, Progress, Group } from '@mantine/core';
import { IconUpload, IconFile, IconAlertCircle } from '@tabler/icons-react';
import { parseThcsDocument } from '../../services/test-creation/thcsDocumentParser.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_EXTENSIONS = ['.docx', '.pdf', '.txt'];

interface THCSDocumentUploadProps {
    onParsed: (result: any) => void;
    onCancel: () => void;
}

export function THCSDocumentUpload({ onParsed, onCancel }: THCSDocumentUploadProps) {
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [parsing, setParsing] = useState(false);
    const [progress, setProgress] = useState({ stage: '', percent: 0, message: '' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateFile = useCallback((file: File): string | null => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
            return `Invalid file type: ${ext}. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`;
        }
        if (file.size > MAX_FILE_SIZE) {
            return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB`;
        }
        return null;
    }, []);

    const handleFile = useCallback(async (file: File) => {
        setError(null);
        const validationError = validateFile(file);
        if (validationError) {
            setError(validationError);
            return;
        }

        setParsing(true);
        setProgress({ stage: 'extracting', percent: 5, message: 'Starting...' });

        const result = await parseThcsDocument(file, (p) => {
            setProgress({ stage: p.stage, percent: p.percent, message: p.message });
        });

        setParsing(false);

        if (result.success) {
            onParsed(result.data);
        } else {
            setError(result.error || 'Parsing failed');
        }
    }, [validateFile, onParsed]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(true);
    }, []);

    const handleDragLeave = useCallback(() => setDragActive(false), []);

    const handleClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    return (
        <Stack gap="md">
            {/* Drop zone */}
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={handleClick}
                style={{
                    border: `2px dashed ${dragActive ? '#8b5cf6' : 'rgba(139,92,246,0.25)'}`,
                    borderRadius: '1rem',
                    padding: '2.5rem 1.5rem',
                    textAlign: 'center',
                    cursor: parsing ? 'wait' : 'pointer',
                    background: dragActive ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.2s',
                    opacity: parsing ? 0.6 : 1,
                    pointerEvents: parsing ? 'none' : 'auto',
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.pdf,.txt"
                    hidden
                    onChange={handleInputChange}
                />
                <IconUpload size={40} color={dragActive ? '#8b5cf6' : '#94a3b8'} style={{ marginBottom: 8 }} />
                <Text fw={600} size="sm" c={dragActive ? 'violet' : 'dimmed'}>
                    {dragActive ? 'Drop file here' : 'Drag & drop or click to upload'}
                </Text>
                <Group gap={4} justify="center" mt={4}>
                    {ACCEPTED_EXTENSIONS.map(ext => (
                        <Badge key={ext} size="xs" variant="light" color="gray">{ext}</Badge>
                    ))}
                    <Badge size="xs" variant="light" color="gray">max 10MB</Badge>
                </Group>
            </div>

            {/* Progress */}
            {parsing && (
                <div style={{
                    padding: '1rem',
                    background: 'rgba(139,92,246,0.04)',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(139,92,246,0.1)',
                }}>
                    <Group gap="xs" mb={6}>
                        <IconFile size={16} color="#8b5cf6" />
                        <Text size="sm" fw={600} c="violet">{progress.message}</Text>
                    </Group>
                    <Progress value={progress.percent} color="violet" size="sm" animated />
                </div>
            )}

            {/* Error */}
            {error && (
                <Alert color="red" icon={<IconAlertCircle size={16} />} title="Upload Error">
                    {error}
                </Alert>
            )}

            {/* Cancel */}
            <div style={{ textAlign: 'right' }}>
                <button
                    onClick={onCancel}
                    disabled={parsing}
                    style={{
                        padding: '0.375rem 1rem',
                        border: '1px solid rgba(100,116,139,0.2)',
                        borderRadius: '0.5rem',
                        background: 'transparent',
                        color: '#64748b',
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                    }}
                >
                    Cancel
                </button>
            </div>
        </Stack>
    );
}

export default THCSDocumentUpload;
