
import { useState, useRef } from 'react';
import { Stack, TextInput, Button, Group, Text, Paper, FileButton, ThemeIcon, ActionIcon, MultiSelect } from '@mantine/core';
import { IconTrash, IconPaperclip, IconSend, IconFileText } from '@tabler/icons-react';
import r2StorageService from '../../services/r2Storage';

interface Attachment {
    name: string;
    url: string;
    type: string;
    size: number;
}

interface CourseAnnouncementEditorProps {
    courseName?: string;
    onSubmit: (data: {
        title: string;
        content: string;
        attachments: Attachment[];
        targetClassIds: string[];
    }) => Promise<void>;
    classes?: { id: string; name: string }[]; // For targeting specific classes
    onCancel?: () => void;
    initialData?: any;
    isSubmitting?: boolean;
}

export function CourseAnnouncementEditor({
    courseName,
    onSubmit,
    classes = [],
    onCancel,
    initialData,
    isSubmitting = false
}: CourseAnnouncementEditorProps) {
    const [title, setTitle] = useState(initialData?.title || '');
    const [content, setContent] = useState(initialData?.content || '');
    const [attachments, setAttachments] = useState<Attachment[]>(initialData?.attachments || []);
    const [targetClassIds, setTargetClassIds] = useState<string[]>(initialData?.targetClassIds || []);
    const [isUploading, setIsUploading] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Simple formatting functions (same as PassageEditorPanel)
    const insertFormatting = (before: string, after: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = content.substring(start, end);
        const newText = content.substring(0, start) + before + selectedText + after + content.substring(end);

        setContent(newText);

        // Restore cursor position in next tick
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + before.length, end + before.length);
        }, 0);
    };

    const handleFileUpload = async (file: File | null) => {
        if (!file) return;

        setIsUploading(true);
        try {
            // Upload directly to permanent storage (not temp)
            // Announcement attachments should persist indefinitely
            const result = await r2StorageService.uploadFilePermanent(file, 'announcements');

            const newAttachment: Attachment = {
                name: file.name,
                url: result.url,
                type: file.type,
                size: file.size
            };

            setAttachments(prev => [...prev, newAttachment]);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Failed to upload file. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!title.trim() || !content.trim()) {
            return;
        }

        await onSubmit({
            title,
            content,
            attachments,
            targetClassIds
        });
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <Stack gap="md">
            {courseName && <Text size="sm" c="dimmed">New Announcement for: <Text span fw={600}>{courseName}</Text></Text>}
            <TextInput
                label="Announcement Title"
                placeholder="e.g., Midterm Exam Schedule Change"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                required
                styles={{ input: { fontSize: '1.1rem', fontWeight: 600 } }}
            />

            {/* Target Audience (if classes provided) */}
            {classes.length > 0 && (
                <MultiSelect
                    label="Send to Specific Classes (Optional)"
                    placeholder="All enrolled students"
                    data={classes.map(c => ({ value: c.id, label: c.name }))}
                    value={targetClassIds}
                    onChange={setTargetClassIds}
                    clearable
                    description="Leave empty to send to all students enrolled in this course"
                />
            )}

            {/* Editor Toolbar */}
            <Paper withBorder p={0} radius="md" style={{ overflow: 'hidden' }}>
                <Group gap={4} p="xs" bg="gray.1" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
                    <Button variant="subtle" size="xs" onClick={() => insertFormatting('**', '**')} fw={700}>B</Button>
                    <Button variant="subtle" size="xs" onClick={() => insertFormatting('*', '*')} fs="italic">I</Button>
                    <div style={{ width: 1, height: 20, backgroundColor: '#ddd', margin: '0 4px' }} />
                    <Button variant="subtle" size="xs" onClick={() => insertFormatting('### ', '')}>H3</Button>
                    <Button variant="subtle" size="xs" onClick={() => insertFormatting('- ', '')}>List</Button>
                    <div style={{ width: 1, height: 20, backgroundColor: '#ddd', margin: '0 4px' }} />
                    <FileButton onChange={handleFileUpload} accept="*/*" disabled={isUploading}>
                        {(props) => (
                            <Button {...props} variant="subtle" size="xs" leftSection={<IconPaperclip size={14} />} disabled={isUploading}>
                                {isUploading ? 'Uploading...' : 'Attach File'}
                            </Button>
                        )}
                    </FileButton>
                </Group>

                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your announcement here..."
                    style={{
                        width: '100%',
                        minHeight: '200px',
                        padding: '1rem',
                        border: 'none',
                        resize: 'vertical',
                        outline: 'none',
                        fontSize: '1rem',
                        fontFamily: 'inherit'
                    }}
                />
            </Paper>

            {/* Attachments List */}
            {attachments.length > 0 && (
                <Stack gap="xs">
                    <Text size="sm" fw={500} c="dimmed">Attachments ({attachments.length})</Text>
                    {attachments.map((file, index) => (
                        <Paper key={index} withBorder p="xs" radius="sm">
                            <Group justify="space-between">
                                <Group gap="sm">
                                    <ThemeIcon variant="light" color="blue" size="md">
                                        <IconFileText size={18} />
                                    </ThemeIcon>
                                    <div>
                                        <Text size="sm" fw={500} lineClamp={1}>{file.name}</Text>
                                        <Text size="xs" c="dimmed">{formatFileSize(file.size)}</Text>
                                    </div>
                                </Group>
                                <ActionIcon color="red" variant="subtle" onClick={() => handleRemoveAttachment(index)}>
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}

            <Group justify="flex-end" mt="md">
                {onCancel && (
                    <Button variant="default" onClick={onCancel} disabled={isSubmitting}>
                        Cancel
                    </Button>
                )}
                <Button
                    onClick={handleSubmit}
                    loading={isSubmitting || isUploading}
                    disabled={!title.trim() || !content.trim()}
                    leftSection={<IconSend size={16} />}
                >
                    Post Announcement
                </Button>
            </Group>
        </Stack>
    );
}

export default CourseAnnouncementEditor;
