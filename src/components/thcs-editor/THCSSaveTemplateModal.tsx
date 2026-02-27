/**
 * THCSSaveTemplateModal — Phase 3, Task 7.3
 *
 * Modal for saving the current test as a template.
 * Extracted from THCSTestEditorPage to keep the large editor file manageable.
 */

import { useState } from 'react';
import { Modal, TextInput, Textarea, Switch, Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { saveTestAsTemplate } from '../../services/thcsTemplateService';
import type { THCSTest } from '../../types/thcs-test.types';

interface THCSSaveTemplateModalProps {
    opened: boolean;
    onClose: () => void;
    test: THCSTest;
}

export function THCSSaveTemplateModal({ opened, onClose, test }: THCSSaveTemplateModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) {
            notifications.show({ color: 'red', message: 'Template name is required.' });
            return;
        }

        setSaving(true);
        try {
            const result = await saveTestAsTemplate(test, name.trim(), description.trim(), isPublic);
            notifications.show({
                color: 'green',
                title: 'Template Saved',
                message: `Template "${name.trim()}" saved successfully (ID: ${result.templateId.slice(0, 8)}…)`,
            });
            // Reset form and close
            setName('');
            setDescription('');
            setIsPublic(false);
            onClose();
        } catch (err) {
            console.error('[THCSSaveTemplateModal] Save failed:', err);
            notifications.show({ color: 'red', message: 'Failed to save template. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    const sectionSummary = (test.sections || []).map(
        s => `${s.name} (${s.questions.length}Q, ${s.totalPoints}pts)`
    ).join(' · ');

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Save as Template"
            centered
            size="md"
        >
            <Stack gap="md">
                <Text size="xs" c="dimmed">
                    Templates save the structure only — section names, point distribution, and question types.
                    Question content is NOT included.
                </Text>

                {/* Preview */}
                <div style={{
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(139, 92, 246, 0.06)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(139, 92, 246, 0.15)',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                }}>
                    <Text size="xs" fw={600} c="dark" mb={2}>
                        Structure: {(test.sections || []).length} section(s) · Grade {test.metadata?.gradeLevel || '?'}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>
                        {sectionSummary || 'No sections'}
                    </Text>
                </div>

                <TextInput
                    label="Template Name"
                    placeholder="e.g. Đề Giữa Kì Lớp 9 – 4 kỹ năng"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    required
                    autoFocus
                />

                <Textarea
                    label="Description"
                    placeholder="Describe the template structure..."
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                    rows={3}
                />

                <Switch
                    label="Share with other teachers (public)"
                    description="Public templates are visible to all teachers in the template picker."
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.currentTarget.checked)}
                />

                <Group justify="flex-end" mt="sm">
                    <Button variant="subtle" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} loading={saving} color="violet">
                        Save Template
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

export default THCSSaveTemplateModal;
