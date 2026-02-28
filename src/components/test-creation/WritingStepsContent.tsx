/**
 * WritingStepsContent — In-modal wizard steps for IELTS Writing test creation.
 * 
 * Three steps matching THCS glass card design (THCSSetupStep.tsx = source of truth):
 *   Step 1 (writing-metadata): Title, Duration pills, Advanced Settings accordion
 *   Step 2 (writing-format): Task 1 Only / Task 2 Only / Full Test format selection
 *   Step 3 (writing-content): Task prompt panels for the selected format
 * 
 * Design tokens are pixel-matched to THCSSetupStep.tsx:
 *   - Glass card: rgba(255,255,255,0.55), blur(16px), border-radius 1.25rem
 *   - Labels: 0.9375rem, fontWeight 700, color #1e293b, no red asterisks
 *   - Inputs: 1.5px solid #cbd5e1, border-radius 0.5rem, focus → #8b5cf6
 *   - Duration pills: border-radius 2rem, active = #8b5cf6 bg + white text
 *   - Accordion: fontWeight 700, 0.9375rem, color #334155
 *   - Divider: height 1px, background #f1f5f9
 * 
 * NO MANTINE IMPORTS
 */

import React, { useState, useCallback, useRef } from 'react';
import { Collapse } from '@mantine/core';
import r2StorageService from '../../services/r2Storage';
import type { WritingTask1Type, WritingTask2Type } from '../../types/ielts-writing.types';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface WritingMetadataFields {
    title: string;
    description?: string;
    duration: number;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    targetBand?: number;
    tags?: string[];
}

export interface WritingTaskFields {
    taskType: string;
    promptText: string;
    promptImageUrl?: string;
    _imageKey?: string;
    wordMinimum: number;
    recommendedTimeMinutes: number;
    modelAnswer?: string;
    showModelAnswerToStudent: boolean;
}

export type WritingFormat = 'task1-only' | 'task2-only' | 'full-test';

// ═══════════════════════════════════════════════════════════════
// SHARED DESIGN TOKENS — pixel-matched to THCSSetupStep.tsx
// ═══════════════════════════════════════════════════════════════

/* Glass card container — same as THCSSetupStep lines 61-72 */
const glassCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '1.25rem',
    border: '1px solid rgba(148,163,184,0.2)',
    padding: '2rem 2.25rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.125rem',
    maxWidth: 680,
    margin: '0 auto',
};

/* Label — same as THCSSetupStep lines 75-81 */
const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: '#1e293b',
    marginBottom: '0.375rem',
};

/* Input — same as THCSSetupStep lines 90-101 */
const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.875rem',
    border: '1.5px solid #cbd5e1',
    borderRadius: '0.5rem',
    fontSize: '0.9375rem',
    color: '#1e293b',
    background: '#fff',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
};

/* Divider — same as THCSSetupStep line 108 */
const dividerStyle: React.CSSProperties = {
    height: 1,
    background: '#f1f5f9',
};

/* Advanced Settings label — same as THCSSetupStep line 255 */
const advancedLabelStyle: React.CSSProperties = {
    fontSize: '0.875rem',
    fontWeight: 600,
    display: 'block',
    marginBottom: '0.5rem',
    color: '#334155',
};

// ═══════════════════════════════════════════════════════════════
// SVG ICONS — matching THCSSetupStep's minimal line-art style
// Must be declared before constants that reference them
// ═══════════════════════════════════════════════════════════════

/* Difficulty icons — TimerModeCard style */
const difficultyIcons: Record<string, string> = {
    beginner: `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="10" stroke="#8b5cf6" stroke-width="1.5" fill="none"/>
      <path d="M10 17c1-2 3-3 4-3s3 1 4 3" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="10.5" cy="11" r="1" fill="#8b5cf6"/>
      <circle cx="17.5" cy="11" r="1" fill="#8b5cf6"/>
    </svg>`,
    intermediate: `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="18" width="6" height="6" rx="1" stroke="#8b5cf6" stroke-width="1.5" fill="none"/>
      <rect x="11" y="12" width="6" height="12" rx="1" stroke="#8b5cf6" stroke-width="1.5" fill="none"/>
      <rect x="19" y="4" width="6" height="20" rx="1" stroke="#94a3b8" stroke-width="1.5" fill="none" stroke-dasharray="3 2"/>
      <path d="M5 10l4-4 4 2 4-4 4 2" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    advanced: `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 3l3 6h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" stroke="#8b5cf6" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
      <circle cx="14" cy="14" r="3" fill="#8b5cf6" opacity="0.15"/>
    </svg>`,
};

/* Format step icons — QuickStartCard style */
const formatTask1Icon = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="4" width="28" height="32" rx="3" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <rect x="10" y="22" width="5" height="10" rx="1" fill="#8b5cf6" opacity="0.2"/>
  <rect x="17" y="16" width="5" height="16" rx="1" fill="#8b5cf6" opacity="0.3"/>
  <rect x="24" y="10" width="5" height="22" rx="1" fill="#8b5cf6" opacity="0.4"/>
  <path d="M10 8h20" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const formatTask2Icon = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="4" width="28" height="32" rx="3" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <path d="M12 12h16M12 18h14M12 24h12M12 30h10" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="26" cy="26" r="6" fill="#8b5cf6" opacity="0.15"/>
  <path d="M24 26h4M26 24v4" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const formatFullTestIcon = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="4" width="14" height="32" rx="2" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <rect x="22" y="4" width="14" height="32" rx="2" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <rect x="7" y="18" width="3" height="8" rx="0.5" fill="#8b5cf6" opacity="0.25"/>
  <rect x="11" y="14" width="3" height="12" rx="0.5" fill="#8b5cf6" opacity="0.35"/>
  <path d="M25 12h8M25 17h7M25 22h6M25 27h5" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M7 8h8" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M25 8h8" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

/* Image upload icon */
const uploadImageIcon = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="6" width="24" height="20" rx="3" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <circle cx="12" cy="14" r="3" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <path d="M4 22l6-6 4 4 4-6 10 8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DURATION_PRESETS = [20, 40, 60, 90];

const DIFFICULTY_OPTIONS: { value: 'beginner' | 'intermediate' | 'advanced'; label: string }[] = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
];

const FORMAT_OPTIONS: { value: WritingFormat; label: string; description: string; svgIcon: string }[] = [
    {
        value: 'task1-only',
        label: 'Task 1 Only',
        description: 'Graph/Chart/Diagram description (150+ words)',
        svgIcon: formatTask1Icon,
    },
    {
        value: 'task2-only',
        label: 'Task 2 Only',
        description: 'Essay writing (250+ words)',
        svgIcon: formatTask2Icon,
    },
    {
        value: 'full-test',
        label: 'Full Test',
        description: 'Both Task 1 & Task 2',
        svgIcon: formatFullTestIcon,
    },
];

const TASK1_TYPES: { value: WritingTask1Type; label: string }[] = [
    { value: 'bar-chart', label: 'Bar Chart' },
    { value: 'line-graph', label: 'Line Graph' },
    { value: 'pie-chart', label: 'Pie Chart' },
    { value: 'table', label: 'Table' },
    { value: 'process-diagram', label: 'Process Diagram' },
    { value: 'map', label: 'Map' },
    { value: 'mixed', label: 'Mixed' },
];

const TASK2_TYPES: { value: WritingTask2Type; label: string }[] = [
    { value: 'opinion', label: 'Opinion' },
    { value: 'discussion', label: 'Discussion' },
    { value: 'problem-solution', label: 'Problem/Solution' },
    { value: 'advantages-disadvantages', label: 'Adv./Disadv.' },
    { value: 'two-part-question', label: 'Two-Part Question' },
];

const MAX_PROMPT_CHARS = 2000;

// ═══════════════════════════════════════════════════════════════
// STEP 1: WRITING METADATA
// Directly mirrors THCSSetupStep glass card layout
// ═══════════════════════════════════════════════════════════════

interface WritingMetadataStepProps {
    metadata: WritingMetadataFields;
    onChange: (updated: WritingMetadataFields) => void;
}

export const WritingMetadataStep: React.FC<WritingMetadataStepProps> = ({ metadata, onChange }) => {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const selectedDuration = metadata.duration;

    const update = <K extends keyof WritingMetadataFields>(key: K, val: WritingMetadataFields[K]) => {
        onChange({ ...metadata, [key]: val });
    };

    return (
        <div style={glassCard}>
            {/* Test Title — bold label, NO asterisk (THCS mockup style) */}
            <div>
                <label style={labelStyle}>Test Title</label>
                <input
                    type="text"
                    placeholder="e.g., IELTS Writing Practice — Line Graphs"
                    maxLength={200}
                    value={metadata.title}
                    onChange={(e) => update('title', e.target.value)}
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                    onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                />
            </div>

            {/* Divider */}
            <div style={dividerStyle} />

            {/* Duration with individual pill buttons (mockup-style) */}
            <div>
                <label style={{ ...labelStyle, marginBottom: '0.5rem' }}>Duration</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {DURATION_PRESETS.map(d => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => update('duration', d)}
                            style={{
                                minWidth: 44,
                                padding: '0.375rem 0.875rem',
                                border: selectedDuration === d ? '2px solid #8b5cf6' : '1.5px solid #cbd5e1',
                                borderRadius: '2rem',
                                background: selectedDuration === d ? '#8b5cf6' : '#fff',
                                color: selectedDuration === d ? '#fff' : '#475569',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {d}m
                        </button>
                    ))}
                    {/* Custom number input — 0.5rem radius like THCSSetupStep */}
                    <div style={{ position: 'relative' }}>
                        <input
                            type="number"
                            min={5}
                            max={300}
                            step={5}
                            value={!DURATION_PRESETS.includes(selectedDuration) ? selectedDuration : ''}
                            placeholder=""
                            onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v) && v > 0) update('duration', v);
                            }}
                            style={{
                                width: 52,
                                padding: '0.375rem 0.5rem',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '0.5rem',
                                fontSize: '0.8125rem',
                                color: '#475569',
                                textAlign: 'center',
                                outline: 'none',
                                background: '#fff',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                        />
                    </div>
                </div>
            </div>

            {/* ▸ Advanced Settings Accordion — exact same as THCSSetupStep */}
            <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.375rem 0',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    color: '#334155',
                }}
            >
                <span style={{
                    display: 'inline-block',
                    transition: 'transform 0.2s',
                    transform: advancedOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    fontSize: '0.75rem',
                }}>▶</span>
                Advanced Settings
            </button>

            <Collapse in={advancedOpen}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.25rem' }}>
                    {/* Difficulty — card grid like Timer Mode in THCSSetupStep */}
                    <div>
                        <label style={advancedLabelStyle}>Difficulty</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                            {DIFFICULTY_OPTIONS.map(opt => (
                                <DifficultyCard
                                    key={opt.value}
                                    svgIcon={difficultyIcons[opt.value] || ''}
                                    title={opt.label}
                                    active={metadata.difficulty === opt.value}
                                    onClick={() => update('difficulty', metadata.difficulty === opt.value ? undefined : opt.value)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Target Band + Description (2-column like THCSSetupStep Grade+ExamType) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={advancedLabelStyle}>Target Band</label>
                            <input
                                type="number"
                                style={inputStyle}
                                value={metadata.targetBand ?? ''}
                                onChange={(e) => update('targetBand', parseFloat(e.target.value) || undefined)}
                                min={0}
                                max={9}
                                step={0.5}
                                placeholder="e.g., 6.5"
                                onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                            />
                        </div>
                        <div>
                            <label style={advancedLabelStyle}>Description</label>
                            <input
                                type="text"
                                style={inputStyle}
                                value={metadata.description || ''}
                                onChange={(e) => update('description', e.target.value)}
                                placeholder="Optional description"
                                onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                            />
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label style={advancedLabelStyle}>Tags</label>
                        <input
                            type="text"
                            style={inputStyle}
                            value={(metadata.tags || []).join(', ')}
                            onChange={(e) => update('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                            placeholder="Press Enter to add — e.g., academic, line-graph"
                            onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                        />
                    </div>
                </div>
            </Collapse>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// STEP 2: WRITING FORMAT SELECTION
// Uses QuickStartCard pattern from THCSSetupStep (centered icon + label)
// ═══════════════════════════════════════════════════════════════

interface WritingFormatStepProps {
    selectedFormat: WritingFormat | undefined;
    onSelect: (format: WritingFormat) => void;
}

export const WritingFormatStep: React.FC<WritingFormatStepProps> = ({ selectedFormat, onSelect }) => {
    return (
        <div style={glassCard}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#1e293b' }}>
                    Select Test Format
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    Choose how many tasks this writing test will have
                </div>
            </div>

            <div style={dividerStyle} />

            {/* Format cards — QuickStartCard visual from THCSSetupStep */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {FORMAT_OPTIONS.map(opt => (
                    <FormatCard
                        key={opt.value}
                        svgIcon={opt.svgIcon}
                        title={opt.label}
                        description={opt.description}
                        active={selectedFormat === opt.value}
                        onClick={() => onSelect(opt.value)}
                    />
                ))}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// STEP 3: WRITING CONTENT INPUT
// ═══════════════════════════════════════════════════════════════

interface WritingContentStepProps {
    format: WritingFormat;
    task1: WritingTaskFields;
    task2: WritingTaskFields;
    onTask1Change: (task: WritingTaskFields) => void;
    onTask2Change: (task: WritingTaskFields) => void;
}

export const WritingContentStep: React.FC<WritingContentStepProps> = ({
    format, task1, task2, onTask1Change, onTask2Change,
}) => {
    const showTask1 = format !== 'task2-only';
    const showTask2 = format !== 'task1-only';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 720, margin: '0 auto' }}>
            {showTask1 && (
                <TaskPanel
                    taskNumber={1}
                    task={task1}
                    onChange={onTask1Change}
                    taskTypes={TASK1_TYPES}
                />
            )}
            {showTask2 && (
                <TaskPanel
                    taskNumber={2}
                    task={task2}
                    onChange={onTask2Change}
                    taskTypes={TASK2_TYPES}
                />
            )}
        </div>
    );
};

// ─── Task Panel (Step 3 inner component) ──────────────────────

interface TaskPanelProps {
    taskNumber: 1 | 2;
    task: WritingTaskFields;
    onChange: (task: WritingTaskFields) => void;
    taskTypes: { value: string; label: string }[];
}

const TaskPanel: React.FC<TaskPanelProps> = ({ taskNumber, task, onChange, taskTypes }) => {
    const [showModel, setShowModel] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [imgError, setImgError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const update = <K extends keyof WritingTaskFields>(key: K, val: WritingTaskFields[K]) => {
        onChange({ ...task, [key]: val });
    };

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setImgError('Only image files are allowed');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setImgError('Image must be under 10MB');
            return;
        }
        setUploading(true);
        setImgError('');
        try {
            const result = await r2StorageService.uploadImage(file);
            onChange({ ...task, promptImageUrl: result.url, _imageKey: result.key });
        } catch {
            setImgError('Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    }, [task, onChange]);

    const charCount = task.promptText?.length || 0;

    return (
        <div style={{
            ...glassCard,
            maxWidth: '100%',
        }}>
            {/* Task header with numbered badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                }}>
                    {taskNumber}
                </span>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>
                    Task {taskNumber}
                    {taskNumber === 1 ? ' — Describe Visual Data' : ' — Essay Writing'}
                </span>
            </div>

            <div style={dividerStyle} />

            {/* Task Type — select with THCS border styling */}
            <div>
                <label style={labelStyle}>Task Type</label>
                <select
                    style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
                    value={task.taskType}
                    onChange={(e) => update('taskType', e.target.value)}
                >
                    {taskTypes.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
            </div>

            {/* Prompt Text */}
            <div>
                <label style={labelStyle}>Prompt Text</label>
                <textarea
                    style={{
                        ...inputStyle,
                        minHeight: 100,
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        lineHeight: 1.6,
                    }}
                    value={task.promptText}
                    onChange={(e) => {
                        if (e.target.value.length <= MAX_PROMPT_CHARS) {
                            update('promptText', e.target.value);
                        }
                    }}
                    placeholder={taskNumber === 1
                        ? 'Describe the chart/graph/diagram below...'
                        : 'Write an essay about the following topic...'
                    }
                    onFocus={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                />
                <div style={{
                    fontSize: '0.75rem',
                    color: charCount > MAX_PROMPT_CHARS * 0.9 ? '#ef4444' : '#94a3b8',
                    textAlign: 'right',
                    marginTop: '0.25rem',
                }}>
                    {charCount}/{MAX_PROMPT_CHARS}
                </div>
            </div>

            {/* Task 1: Image Upload — dashed dropzone like upload card */}
            {taskNumber === 1 && (
                <div>
                    <label style={advancedLabelStyle}>Chart/Graph Image</label>
                    {task.promptImageUrl ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <img
                                src={task.promptImageUrl}
                                alt="Task visual"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: 200,
                                    borderRadius: '0.75rem',
                                    border: '1.5px solid #e2e8f0',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => onChange({ ...task, promptImageUrl: undefined, _imageKey: undefined })}
                                style={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                    background: 'rgba(0,0,0,0.6)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: 24,
                                    height: 24,
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.375rem',
                                width: '100%',
                                padding: '1.5rem 1rem',
                                borderRadius: '1rem',
                                border: '2px dashed #cbd5e1',
                                background: 'rgba(255,255,255,0.5)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                color: '#94a3b8',
                                cursor: uploading ? 'wait' : 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                textAlign: 'center',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 16px rgba(139,92,246,0.1)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                            }}
                        >
                            <div
                                style={{ width: 32, height: 32 }}
                                dangerouslySetInnerHTML={{ __html: uploadImageIcon }}
                            />
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                                {uploading ? '⏳ Uploading...' : 'Upload Chart / Graph Image'}
                            </span>
                        </button>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                    {imgError && (
                        <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{imgError}</div>
                    )}
                </div>
            )}

            {/* Word Minimum + Time (2-column like Grade+ExamType) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                    <label style={labelStyle}>Min. Words</label>
                    <input
                        type="number"
                        style={inputStyle}
                        value={task.wordMinimum}
                        onChange={(e) => update('wordMinimum', Math.max(1, parseInt(e.target.value) || 150))}
                        min={1}
                        onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                        onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    />
                </div>
                <div>
                    <label style={labelStyle}>Recommended Time (min)</label>
                    <input
                        type="number"
                        style={inputStyle}
                        value={task.recommendedTimeMinutes}
                        onChange={(e) => update('recommendedTimeMinutes', Math.max(1, parseInt(e.target.value) || 20))}
                        min={1}
                        onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                        onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    />
                </div>
            </div>

            {/* Model Answer Toggle — same accordion style as Advanced Settings */}
            <button
                type="button"
                onClick={() => setShowModel(!showModel)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.375rem 0',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    color: '#334155',
                }}
            >
                <span style={{
                    display: 'inline-block',
                    transition: 'transform 0.2s',
                    transform: showModel ? 'rotate(90deg)' : 'rotate(0deg)',
                    fontSize: '0.75rem',
                }}>▶</span>
                Model Answer (Optional)
            </button>

            <Collapse in={showModel}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '0.25rem' }}>
                    <textarea
                        style={{
                            ...inputStyle,
                            minHeight: 80,
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            lineHeight: 1.6,
                        }}
                        value={task.modelAnswer || ''}
                        onChange={(e) => update('modelAnswer', e.target.value)}
                        placeholder="Enter a model answer (shown to students after grading)"
                        onFocus={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                        onBlur={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: '#475569', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={task.showModelAnswerToStudent}
                            onChange={(e) => update('showModelAnswerToStudent', e.target.checked)}
                            style={{ accentColor: '#8b5cf6' }}
                        />
                        Show model answer to student after grading
                    </label>
                </div>
            </Collapse>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// CARD COMPONENTS — matching QuickStartCard / TimerModeCard
// from THCSSetupStep.tsx (lines 559-663)
// ═══════════════════════════════════════════════════════════════

/* Format Card — like QuickStartCard: centered SVG icon + title + description */
const FormatCard: React.FC<{
    svgIcon: string;
    title: string;
    description: string;
    active: boolean;
    onClick: () => void;
}> = ({ svgIcon, title, description, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '1.5rem 1rem',
            border: active
                ? '2px solid #8b5cf6'
                : '1px solid rgba(148,163,184,0.2)',
            borderRadius: '1rem',
            background: active
                ? 'rgba(139,92,246,0.06)'
                : 'rgba(255,255,255,0.5)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            textAlign: 'center',
            boxShadow: active
                ? '0 4px 16px rgba(139,92,246,0.1)'
                : '0 2px 8px rgba(0,0,0,0.03)',
        }}
        onMouseOver={(e) => {
            if (!active) {
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(139,92,246,0.1)';
            }
        }}
        onMouseOut={(e) => {
            if (!active) {
                e.currentTarget.style.borderColor = 'rgba(148,163,184,0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
            }
        }}
    >
        <div
            style={{ width: 40, height: 40 }}
            dangerouslySetInnerHTML={{ __html: svgIcon }}
        />
        <span style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: active ? '#8b5cf6' : '#1e293b',
        }}>{title}</span>
        <span style={{
            fontSize: '0.6875rem',
            color: '#94a3b8',
            lineHeight: 1.2,
        }}>{description}</span>
    </button>
);

/* Difficulty Card — same visual as TimerModeCard from THCSSetupStep */
const DifficultyCard: React.FC<{
    svgIcon: string;
    title: string;
    active: boolean;
    onClick: () => void;
}> = ({ svgIcon, title, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            padding: '1rem 0.5rem',
            border: active
                ? '2px solid #8b5cf6'
                : '1px solid rgba(148,163,184,0.2)',
            borderRadius: '0.75rem',
            background: active
                ? 'rgba(139,92,246,0.06)'
                : 'rgba(255,255,255,0.5)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            textAlign: 'center',
            boxShadow: active ? '0 4px 16px rgba(139,92,246,0.1)' : '0 2px 8px rgba(0,0,0,0.03)',
        }}
    >
        <div
            style={{ width: 28, height: 28 }}
            dangerouslySetInnerHTML={{ __html: svgIcon }}
        />
        <span style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: active ? '#8b5cf6' : '#1e293b',
        }}>{title}</span>
    </button>
);

export default WritingContentStep;
