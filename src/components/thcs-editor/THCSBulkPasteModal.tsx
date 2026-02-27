/**
 * THCSBulkPasteModal — Phase 3, Task 8.2
 *
 * Modal for pasting multiple questions from text.
 * Parses MCQ or Fill-in format text and adds questions to a section.
 * ⚠️ Rule 8: Must be integrated into THCSSectionBlock.tsx via [📋 Paste Questions] button.
 */

import { useState, useMemo } from 'react';
import { Modal, Select, Textarea, Button, Group, Stack, Text, Alert, Badge } from '@mantine/core';
import { IconClipboard, IconAlertCircle } from '@tabler/icons-react';
import { parseQuestionText } from '../../utils/thcsQuestionParser';
import type { ParsedQuestion } from '../../utils/thcsQuestionParser';

interface THCSBulkPasteModalProps {
    opened: boolean;
    onClose: () => void;
    onImport: (questions: ParsedQuestion[]) => void;
    sectionName: string;
}

export function THCSBulkPasteModal({ opened, onClose, onImport, sectionName }: THCSBulkPasteModalProps) {
    const [text, setText] = useState('');
    const [format, setFormat] = useState<'mcq' | 'fill-in'>('mcq');

    const parseResult = useMemo(() => {
        if (!text.trim()) return { questions: [], errors: [] };
        return parseQuestionText(text, format);
    }, [text, format]);

    const handleImport = () => {
        if (parseResult.questions.length === 0) return;
        onImport(parseResult.questions);
        setText('');
        onClose();
    };

    const handleClose = () => {
        setText('');
        onClose();
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={
                <Group gap="xs">
                    <IconClipboard size={20} />
                    <Text fw={600}>Paste Questions — {sectionName}</Text>
                </Group>
            }
            centered
            size="lg"
        >
            <Stack gap="md">
                <Select
                    label="Format"
                    description="Choose the format that matches your pasted text"
                    value={format}
                    onChange={(v) => setFormat((v as 'mcq' | 'fill-in') || 'mcq')}
                    data={[
                        { value: 'mcq', label: 'MCQ (1 per line, with A/B/C/D options)' },
                        { value: 'fill-in', label: 'Fill-in-the-blank (with ___ markers)' },
                    ]}
                />

                <Textarea
                    label="Paste your questions here"
                    placeholder={
                        format === 'mcq'
                            ? 'Câu 1: What is the capital of France?\nA. London\nB. Paris\nC. Berlin\nD. Madrid\nĐáp án: B\n\nCâu 2: ...'
                            : 'The capital of France is ___.\nAnswer: Paris\n\nShe ___ to school every day.\nAnswer: goes'
                    }
                    value={text}
                    onChange={(e) => setText(e.currentTarget.value)}
                    rows={10}
                    autosize
                    minRows={6}
                    maxRows={14}
                    styles={{ input: { fontFamily: 'monospace', fontSize: '0.8125rem' } }}
                />

                {/* Live preview */}
                {text.trim() && (
                    <div style={{
                        padding: '0.625rem 0.75rem',
                        background: parseResult.questions.length > 0 ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                        borderRadius: '0.5rem',
                        border: `1px solid ${parseResult.questions.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
                    }}>
                        <Group gap="xs">
                            <Badge color={parseResult.questions.length > 0 ? 'green' : 'gray'} size="sm">
                                {parseResult.questions.length} question{parseResult.questions.length !== 1 ? 's' : ''} detected
                            </Badge>
                            {parseResult.errors.length > 0 && (
                                <Badge color="orange" size="sm">
                                    {parseResult.errors.length} warning{parseResult.errors.length !== 1 ? 's' : ''}
                                </Badge>
                            )}
                        </Group>
                    </div>
                )}

                {/* Parse errors */}
                {parseResult.errors.length > 0 && (
                    <Alert color="orange" icon={<IconAlertCircle size={16} />} title="Parse Warnings">
                        <Stack gap={2}>
                            {parseResult.errors.slice(0, 5).map((err, i) => (
                                <Text key={i} size="xs">
                                    Line {err.line}: {err.message}
                                </Text>
                            ))}
                            {parseResult.errors.length > 5 && (
                                <Text size="xs" c="dimmed">...and {parseResult.errors.length - 5} more</Text>
                            )}
                        </Stack>
                    </Alert>
                )}

                <Group justify="flex-end" mt="sm">
                    <Button variant="subtle" onClick={handleClose}>Cancel</Button>
                    <Button
                        color="violet"
                        disabled={parseResult.questions.length === 0}
                        onClick={handleImport}
                        leftSection={<IconClipboard size={16} />}
                    >
                        Import {parseResult.questions.length} Question{parseResult.questions.length !== 1 ? 's' : ''} →
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

export default THCSBulkPasteModal;
