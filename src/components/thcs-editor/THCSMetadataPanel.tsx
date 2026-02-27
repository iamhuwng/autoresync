/**
 * THCSMetadataPanel — Metadata form for THCS-THPT editor (PRD-0027 Task 4.2)
 */
import React from 'react';
import {
    TextInput, Select, Autocomplete, NumberInput,
    Switch, Textarea, TagsInput, SegmentedControl,
} from '@mantine/core';
import type { THCSTestMetadata } from '../../types/thcs-test.types';
import { DURATION_PRESETS, GRADE_LEVELS, EXAM_TYPE_OPTIONS } from '../../types/thcs-test.types';

interface THCSMetadataPanelProps {
    metadata: THCSTestMetadata;
    isPublic: boolean;
    onMetadataChange: <K extends keyof THCSTestMetadata>(field: K, value: THCSTestMetadata[K]) => void;
    onIsPublicChange: (value: boolean) => void;
}

const gradeData = GRADE_LEVELS.map(g => ({ value: g.toString(), label: `Grade ${g}` }));
const examTypeData = [...EXAM_TYPE_OPTIONS] as string[];

const THCSMetadataPanel: React.FC<THCSMetadataPanelProps> = ({
    metadata, isPublic, onMetadataChange, onIsPublicChange,
}) => {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            border: '1px solid rgba(139,92,246,0.15)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
        }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#1e293b' }}>
                📋 Test Metadata
            </h3>

            {/* Title */}
            <TextInput
                label="Test Title"
                placeholder="e.g., Đề kiểm tra giữa kì 1 — Tiếng Anh 9"
                maxLength={200}
                required
                value={metadata.title}
                onChange={(e) => onMetadataChange('title', e.target.value)}
            />

            {/* Duration */}
            <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>
                    Duration (minutes) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <SegmentedControl
                        data={DURATION_PRESETS.map(d => ({ value: d.toString(), label: `${d}m` }))}
                        value={DURATION_PRESETS.includes(metadata.duration as any) ? metadata.duration.toString() : ''}
                        onChange={(val) => onMetadataChange('duration', parseInt(val, 10))}
                        size="xs"
                    />
                    <NumberInput
                        placeholder="Custom"
                        min={5}
                        max={300}
                        step={5}
                        style={{ width: 100 }}
                        value={metadata.duration || ''}
                        onChange={(val) => onMetadataChange('duration', typeof val === 'number' ? val : 0)}
                        size="xs"
                    />
                </div>
            </div>

            {/* Timer Mode (Task 11.1) */}
            <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>
                    Timer Mode
                </label>
                <SegmentedControl
                    data={[
                        { value: 'strict', label: '⏱️ Strict' },
                        { value: 'informational', label: 'ℹ️ Informational' },
                        { value: 'none', label: '🚫 None' },
                    ]}
                    value={(metadata as any).timerMode || 'strict'}
                    onChange={(val) => onMetadataChange('timerMode' as any, val)}
                    size="xs"
                    fullWidth
                />
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    {(metadata as any).timerMode === 'informational'
                        ? 'Timer shown but no auto-submit'
                        : (metadata as any).timerMode === 'none'
                            ? 'No timer displayed'
                            : 'Auto-submit when timer reaches 0:00'}
                </span>
            </div>

            {/* Grade + Exam Type row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Select
                    label="Grade Level"
                    placeholder="Select grade"
                    data={gradeData}
                    required
                    value={metadata.gradeLevel?.toString() || null}
                    onChange={(val) => onMetadataChange('gradeLevel', val ? parseInt(val, 10) as any : 6)}
                />
                <Autocomplete
                    label="Exam Type"
                    placeholder="e.g., giữa kì"
                    data={examTypeData}
                    required
                    value={metadata.examType}
                    onChange={(val) => onMetadataChange('examType', val)}
                />
            </div>

            {/* Subject Variant + Province row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <TextInput
                    label="Subject Variant"
                    placeholder="e.g., Global Success"
                    value={metadata.subjectVariant || ''}
                    onChange={(e) => onMetadataChange('subjectVariant', e.target.value || undefined)}
                />
                <TextInput
                    label="Province"
                    placeholder="e.g., Hà Nội"
                    value={metadata.province || ''}
                    onChange={(e) => onMetadataChange('province', e.target.value || undefined)}
                />
            </div>

            {/* School */}
            <TextInput
                label="School"
                placeholder="e.g., THCS Nguyễn Du"
                value={metadata.school || ''}
                onChange={(e) => onMetadataChange('school', e.target.value || undefined)}
            />

            {/* Description */}
            <Textarea
                label="Description"
                placeholder="Optional description"
                autosize
                minRows={2}
                value={metadata.description || ''}
                onChange={(e) => onMetadataChange('description', e.target.value || undefined)}
            />

            {/* Tags */}
            <TagsInput
                label="Tags"
                placeholder="Press Enter to add"
                value={metadata.tags || []}
                onChange={(val) => onMetadataChange('tags', val)}
            />

            {/* Public toggle */}
            <Switch
                label="Share in Public Library"
                description="Allow other teachers to use this test"
                checked={isPublic}
                onChange={(e) => onIsPublicChange(e.currentTarget.checked)}
                color="violet"
            />
        </div>
    );
};

export default THCSMetadataPanel;
