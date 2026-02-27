/**
 * MetadataStep Component
 * 
 * Step 3 of the Test Creation Modal.
 * Collects test metadata: Title, Duration, Target Band, CEFR Level, Difficulty, Description
 * 
 * @module MetadataStep
 * @version 1.0.0
 * @date 2026-02-07
 * 
 * PRD Reference: PRD-0022 Test Creation Modal with Draft Management
 * Design System: Modern Pastel (glassmorphism, lavender accents)
 */

import React, { useEffect } from 'react';
import { Text } from '@mantine/core';
import { Input } from '../modern';
import {
    type TestType,
    type SkillType,
    type TestFormat,
    type DraftMetadata,
    type CEFRLevel,
    type IELTSBand,
    type DifficultyLevel,
    DURATION_OPTIONS,
    generateDefaultTitle,
} from '../../types/draft.types';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MetadataStepProps {
    /** Current metadata values */
    metadata: Partial<DraftMetadata>;
    /** Test format (academic/general) */
    format: TestFormat;
    /** Selected test type */
    testType: TestType | null;
    /** Selected skill type */
    skillType: SkillType | null;
    /** Callback to update metadata and format */
    onUpdate: (metadata: Partial<DraftMetadata>, format: TestFormat) => void;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const CEFR_LEVELS: { value: CEFRLevel; label: string; description: string }[] = [
    { value: 'A1', label: 'A1 - Beginner', description: 'Basic phrases and expressions' },
    { value: 'A2', label: 'A2 - Elementary', description: 'Simple everyday language' },
    { value: 'B1', label: 'B1 - Intermediate', description: 'Main points on familiar matters' },
    { value: 'B2', label: 'B2 - Upper Intermediate', description: 'Complex topics and discussions' },
    { value: 'C1', label: 'C1 - Advanced', description: 'Fluent and spontaneous expression' },
    { value: 'C2', label: 'C2 - Proficient', description: 'Near-native proficiency' },
];

const IELTS_BANDS: { value: IELTSBand; label: string }[] = [
    { value: '4.0', label: '4.0' },
    { value: '4.5', label: '4.5' },
    { value: '5.0', label: '5.0' },
    { value: '5.5', label: '5.5' },
    { value: '6.0', label: '6.0' },
    { value: '6.5', label: '6.5' },
    { value: '7.0', label: '7.0' },
    { value: '7.5', label: '7.5' },
    { value: '8.0', label: '8.0' },
    { value: '8.5', label: '8.5' },
    { value: '9.0', label: '9.0' },
];

const DIFFICULTY_LEVELS: { value: DifficultyLevel; label: string; color: string }[] = [
    { value: 'Beginner', label: 'Beginner', color: '#22c55e' },
    { value: 'Intermediate', label: 'Intermediate', color: '#f59e0b' },
    { value: 'Advanced', label: 'Advanced', color: '#ef4444' },
];

const FORMAT_OPTIONS: { value: TestFormat; label: string; description: string }[] = [
    { value: 'academic', label: 'Academic', description: 'For university admission' },
    { value: 'general', label: 'General Training', description: 'For work or migration' },
];

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const styles = {
    container: {
        maxWidth: '600px',
        margin: '0 auto',
    },
    formGroup: {
        marginBottom: '1.5rem',
    },
    label: {
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: 600,
        fontSize: '0.875rem',
        color: '#1e293b',
    },
    required: {
        color: '#f43f5e',
        marginLeft: '0.25rem',
    },
    hint: {
        fontSize: '0.75rem',
        color: '#64748b',
        marginTop: '0.25rem',
    },
    select: {
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(8px)',
        fontSize: '0.875rem',
        color: '#1e293b',
        cursor: 'pointer',
        outline: 'none',
        transition: 'all 0.2s ease',
    },
    textarea: {
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(8px)',
        fontSize: '0.875rem',
        color: '#1e293b',
        outline: 'none',
        resize: 'vertical' as const,
        minHeight: '80px',
        fontFamily: 'inherit',
    },
    row: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
    },
    formatToggle: {
        display: 'flex',
        gap: '0.75rem',
    },
    formatOption: (isSelected: boolean) => ({
        flex: 1,
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        border: isSelected
            ? '2px solid #8b5cf6'
            : '1px solid rgba(139, 92, 246, 0.2)',
        background: isSelected
            ? 'rgba(139, 92, 246, 0.08)'
            : 'rgba(255, 255, 255, 0.8)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'center' as const,
    }),
    difficultyOption: (isSelected: boolean, color: string) => ({
        flex: 1,
        padding: '0.5rem',
        borderRadius: '0.5rem',
        border: isSelected
            ? `2px solid ${color}`
            : '1px solid rgba(139, 92, 246, 0.2)',
        background: isSelected
            ? `${color}15`
            : 'rgba(255, 255, 255, 0.8)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'center' as const,
    }),
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const MetadataStep: React.FC<MetadataStepProps> = ({
    metadata,
    format,
    testType,
    skillType,
    onUpdate,
}) => {
    // Generate default title on mount if not set
    useEffect(() => {
        if (!metadata.title && testType && skillType) {
            const defaultTitle = generateDefaultTitle(testType, skillType);
            onUpdate({ ...metadata, title: defaultTitle }, format);
        }
    }, [testType, skillType]); // Only run when test/skill type changes

    const handleChange = (field: keyof DraftMetadata, value: unknown) => {
        onUpdate({ ...metadata, [field]: value }, format);
    };

    const handleFormatChange = (newFormat: TestFormat) => {
        onUpdate(metadata, newFormat);
    };

    const isIELTS = testType === 'IELTS';

    return (
        <div style={styles.container}>
            {/* Title */}
            <div style={styles.formGroup}>
                <label style={styles.label}>
                    Test Title
                    <span style={styles.required}>*</span>
                </label>
                <Input
                    type="text"
                    value={metadata.title || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('title', e.target.value)}
                    placeholder={testType && skillType
                        ? `${testType} ${skillType.charAt(0).toUpperCase() + skillType.slice(1)} Test`
                        : 'Enter test title'
                    }
                    style={{
                        width: '100%',
                    }}
                />
                <div style={styles.hint}>
                    This will be displayed to students when they see the test
                </div>
            </div>

            {/* Format (IELTS only) */}
            {isIELTS && (
                <div style={styles.formGroup}>
                    <label style={styles.label}>Test Format</label>
                    <div style={styles.formatToggle}>
                        {FORMAT_OPTIONS.map((option) => (
                            <div
                                key={option.value}
                                style={styles.formatOption(format === option.value)}
                                onClick={() => handleFormatChange(option.value)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleFormatChange(option.value);
                                    }
                                }}
                            >
                                <Text size="sm" fw={600} style={{ color: format === option.value ? '#8b5cf6' : '#64748b' }}>
                                    {option.label}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {option.description}
                                </Text>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Duration and Target Band (row) */}
            <div style={{ ...styles.formGroup, ...styles.row }}>
                <div>
                    <label style={styles.label}>Duration</label>
                    <select
                        style={styles.select}
                        value={metadata.duration || DURATION_OPTIONS[2]}
                        onChange={(e) => handleChange('duration', parseInt(e.target.value, 10))}
                    >
                        {DURATION_OPTIONS.map((duration) => (
                            <option key={duration} value={duration}>
                                {duration} minutes
                            </option>
                        ))}
                    </select>
                </div>

                {isIELTS && (
                    <div>
                        <label style={styles.label}>Target Band</label>
                        <select
                            style={styles.select}
                            value={metadata.targetBand || ''}
                            onChange={(e) => handleChange('targetBand', e.target.value as IELTSBand)}
                        >
                            <option value="">Select band...</option>
                            {IELTS_BANDS.map((band) => (
                                <option key={band.value} value={band.value}>
                                    Band {band.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* CEFR Level and Difficulty (row) */}
            <div style={{ ...styles.formGroup, ...styles.row }}>
                <div>
                    <label style={styles.label}>CEFR Level</label>
                    <select
                        style={styles.select}
                        value={metadata.cefrLevel || ''}
                        onChange={(e) => handleChange('cefrLevel', e.target.value as CEFRLevel)}
                    >
                        <option value="">Select level...</option>
                        {CEFR_LEVELS.map((level) => (
                            <option key={level.value} value={level.value}>
                                {level.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label style={styles.label}>Difficulty</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {DIFFICULTY_LEVELS.map((diff) => (
                            <div
                                key={diff.value}
                                style={styles.difficultyOption(
                                    metadata.difficulty === diff.value,
                                    diff.color
                                )}
                                onClick={() => handleChange('difficulty', diff.value)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleChange('difficulty', diff.value);
                                    }
                                }}
                            >
                                <Text
                                    size="xs"
                                    fw={600}
                                    style={{
                                        color: metadata.difficulty === diff.value
                                            ? diff.color
                                            : '#64748b',
                                    }}
                                >
                                    {diff.label}
                                </Text>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Description */}
            <div style={styles.formGroup}>
                <label style={styles.label}>Description</label>
                <textarea
                    style={styles.textarea}
                    value={metadata.description || ''}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Add a description for this test (optional)..."
                    rows={3}
                />
                <div style={styles.hint}>
                    Describe what this test covers or any special instructions
                </div>
            </div>
        </div>
    );
};

export default MetadataStep;
