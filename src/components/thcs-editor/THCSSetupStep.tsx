/**
 * THCSSetupStep — Step 1 of the THCS Test Editor Wizard.
 * 
 * Pixel-perfect mockup match: Clean metadata (Title, Grade+ExamType, Duration pills),
 * collapsible "▸ Advanced Settings", Quick Start row (no descriptions).
 */
import React, { useState } from 'react';
import {
    TextInput, Select,
    Textarea, TagsInput, Switch,
    Collapse,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { THCSTemplatePicker } from './THCSTemplatePicker';

import { THCSParseReviewPanel } from './THCSParseReviewPanel';
import { parseThcsText } from '../../services/test-creation/thcsDocumentParser.service';
import thcsExtractionPrompt from '../../services/test-creation/thcs-pdf-extraction-prompt.txt?raw';
import type { THCSTestMetadata } from '../../types/thcs-test.types';
import { DURATION_PRESETS, GRADE_LEVELS, EXAM_TYPE_OPTIONS } from '../../types/thcs-test.types';

export interface THCSSetupStepProps {
    metadata: THCSTestMetadata;
    isPublic: boolean;
    isEditMode: boolean;
    onMetadataChange: <K extends keyof THCSTestMetadata>(field: K, value: THCSTestMetadata[K]) => void;
    onIsPublicChange: (value: boolean) => void;
    onTemplateSelect?: (template: any) => void;
    onDocumentParsed?: (parsed: any) => void;
    onParsedProceed?: (finalParsed: any) => void;
    onStartBlank?: () => void;
}

const gradeData = (GRADE_LEVELS || [6, 7, 8, 9, 10, 11, 12]).map(g => ({ value: g.toString(), label: `Grade ${g}` }));
const examTypeData = (EXAM_TYPE_OPTIONS || ['giữa kì', 'cuối kì', 'thi vào 10', 'ôn tập']).map(e => ({ value: e, label: e }));

const THCSSetupStep: React.FC<THCSSetupStepProps> = ({
    metadata,
    isPublic,
    isEditMode,
    onMetadataChange,
    onIsPublicChange,
    onTemplateSelect,

    onParsedProceed,
    onStartBlank,
}) => {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);

    const [showPasteText, setShowPasteText] = useState(false);
    const [pasteTextContent, setPasteTextContent] = useState('');

    const [parsedPasteData, setParsedPasteData] = useState<any>(null);
    const [isPasteProcessing, setIsPasteProcessing] = useState(false);
    const [pasteErrorMessage, setPasteErrorMessage] = useState<string | null>(null);
    const [promptCopied, setPromptCopied] = useState(false);

    const selectedDuration = metadata.duration;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* ─── Main Metadata Card ─── */}
            <div style={{
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
            }}>
                {/* Test Title — bold label, no asterisk (mockup style) */}
                <div>
                    <label style={{
                        display: 'block',
                        fontSize: '0.9375rem',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '0.375rem',
                    }}>
                        Test Title
                    </label>
                    <input
                        type="text"
                        placeholder="Đề kiểm tra giữa kì 1 — Tiếng Anh 9"
                        maxLength={200}
                        value={metadata.title}
                        onChange={(e) => onMetadataChange('title', e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.625rem 0.875rem',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '0.5rem',
                            fontSize: '0.9375rem',
                            color: '#1e293b',
                            background: '#fff',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                            boxSizing: 'border-box',
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                        onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    />
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#f1f5f9' }} />

                {/* Grade Level + Exam Type row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            color: '#1e293b',
                            marginBottom: '0.375rem',
                        }}>Grade Level</label>
                        <Select
                            placeholder="Select grade"
                            data={gradeData}
                            value={metadata.gradeLevel?.toString() || null}
                            onChange={(val) => onMetadataChange('gradeLevel', val ? parseInt(val, 10) as any : 6)}
                            styles={{
                                input: {
                                    border: '1.5px solid #cbd5e1',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.9375rem',
                                    padding: '0.625rem 0.875rem',
                                    height: 'auto',
                                },
                            }}
                        />
                    </div>
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            color: '#1e293b',
                            marginBottom: '0.375rem',
                        }}>Exam Type</label>
                        <Select
                            placeholder="giữa kì"
                            data={examTypeData}
                            searchable
                            value={metadata.examType || null}
                            onChange={(val) => onMetadataChange('examType', val || '')}
                            styles={{
                                input: {
                                    border: '1.5px solid #cbd5e1',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.9375rem',
                                    padding: '0.625rem 0.875rem',
                                    height: 'auto',
                                },
                            }}
                        />
                    </div>
                </div>

                {/* Duration with individual pill buttons (mockup-style) */}
                <div>
                    <label style={{
                        display: 'block',
                        fontSize: '0.9375rem',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '0.5rem',
                    }}>Duration</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {DURATION_PRESETS.map(d => (
                            <button
                                key={d}
                                onClick={() => onMetadataChange('duration', d)}
                                style={{
                                    minWidth: 44,
                                    padding: '0.375rem 0.875rem',
                                    border: selectedDuration === d ? '2px solid #8b5cf6' : '1.5px solid #cbd5e1',
                                    borderRadius: '2rem',
                                    background: selectedDuration === d
                                        ? '#8b5cf6'
                                        : '#fff',
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
                        {/* Custom number input */}
                        <div style={{ position: 'relative' }}>
                            <input
                                type="number"
                                min={5}
                                max={300}
                                step={5}
                                value={!DURATION_PRESETS.includes(selectedDuration as any) ? selectedDuration : ''}
                                placeholder=""
                                onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v) && v > 0) onMetadataChange('duration', v);
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

                {/* ▸ Advanced Settings Accordion */}
                <button
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
                        {/* Timer Mode — icon card treatment like Quick Start */}
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: '#334155' }}>
                                Timer Mode
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                <TimerModeCard
                                    svgIcon={timerStrictIcon}
                                    title="Strict"
                                    description="Auto-submit at 0:00"
                                    active={((metadata as any).timerMode || 'strict') === 'strict'}
                                    onClick={() => onMetadataChange('timerMode' as any, 'strict')}
                                />
                                <TimerModeCard
                                    svgIcon={timerInfoIcon}
                                    title="Informational"
                                    description="Timer shown, no auto-submit"
                                    active={(metadata as any).timerMode === 'informational'}
                                    onClick={() => onMetadataChange('timerMode' as any, 'informational')}
                                />
                                <TimerModeCard
                                    svgIcon={timerNoneIcon}
                                    title="None"
                                    description="No timer displayed"
                                    active={(metadata as any).timerMode === 'none'}
                                    onClick={() => onMetadataChange('timerMode' as any, 'none')}
                                />
                            </div>
                        </div>

                        {/* Subject Variant + Province */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <TextInput
                                label="Subject Variant"
                                placeholder="e.g., Global Success"
                                value={metadata.subjectVariant || ''}
                                onChange={(e) => onMetadataChange('subjectVariant', e.target.value || undefined)}
                                styles={{ input: { border: '1.5px solid #cbd5e1', borderRadius: '0.5rem' } }}
                            />
                            <TextInput
                                label="Province"
                                placeholder="e.g., Hà Nội"
                                value={metadata.province || ''}
                                onChange={(e) => onMetadataChange('province', e.target.value || undefined)}
                                styles={{ input: { border: '1.5px solid #cbd5e1', borderRadius: '0.5rem' } }}
                            />
                        </div>

                        {/* School */}
                        <TextInput
                            label="School"
                            placeholder="e.g., THCS Nguyễn Du"
                            value={metadata.school || ''}
                            onChange={(e) => onMetadataChange('school', e.target.value || undefined)}
                            styles={{ input: { border: '1.5px solid #cbd5e1', borderRadius: '0.5rem' } }}
                        />

                        {/* Description */}
                        <Textarea
                            label="Description"
                            placeholder="Optional description"
                            autosize
                            minRows={2}
                            value={metadata.description || ''}
                            onChange={(e) => onMetadataChange('description', e.target.value || undefined)}
                            styles={{ input: { border: '1.5px solid #cbd5e1', borderRadius: '0.5rem' } }}
                        />

                        {/* Tags */}
                        <TagsInput
                            label="Tags"
                            placeholder="Press Enter to add"
                            value={metadata.tags || []}
                            onChange={(val) => onMetadataChange('tags', val)}
                            styles={{ input: { border: '1.5px solid #cbd5e1', borderRadius: '0.5rem' } }}
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
                </Collapse>
            </div>

            {/* ─── Quick Start Row (new tests only) ─── */}
            {!isEditMode && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.75rem',
                }}>
                    <QuickStartCard
                        svgIcon={templateIcon}
                        title="From Template"
                        onClick={() => setShowTemplatePicker(true)}
                        active={false}
                    />

                    <QuickStartCard
                        svgIcon={pasteTextIcon}
                        title="Paste Text"
                        onClick={() => setShowPasteText(true)}
                        active={false}
                    />
                    <QuickStartCard
                        svgIcon={blankIcon}
                        title="Start Blank"
                        onClick={onStartBlank}
                        active={true}
                    />
                </div>
            )}

            {/* Template Picker Modal */}
            <THCSTemplatePicker
                opened={showTemplatePicker}
                onClose={() => setShowTemplatePicker(false)}
                onSelect={(template) => {
                    setShowTemplatePicker(false);
                    onTemplateSelect?.(template);
                }}
            />



            {/* Paste Text Modal */}
            {showPasteText && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                }}>
                    <div style={{
                        background: 'white', borderRadius: '1rem', padding: '2rem',
                        maxWidth: '700px', width: '90%', maxHeight: '85vh', overflow: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        display: 'flex', flexDirection: 'column', gap: '1rem',
                    }}>
                        {!parsedPasteData ? (
                            /* ── Step A: Text Input ── */
                            <>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                                    📝 Paste Test Content
                                </h2>
                                {/* Step 0: Copy Prompt for External AI */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.75rem 1rem',
                                    background: 'linear-gradient(135deg, #f0f4ff 0%, #ede9fe 100%)',
                                    borderRadius: '0.75rem',
                                    border: '1px solid rgba(139,92,246,0.15)',
                                }}>
                                    <span style={{ fontSize: '1.25rem' }}>🤖</span>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b' }}>
                                            Step 1: Copy the prompt below → paste into ChatGPT/Gemini along with your test images
                                        </span>
                                        <br />
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            Step 2: Copy the AI's output → paste it into the text box below
                                        </span>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(thcsExtractionPrompt);
                                                setPromptCopied(true);
                                                setTimeout(() => setPromptCopied(false), 2000);
                                            } catch {
                                                notifications.show({ color: 'red', title: 'Copy failed', message: 'Please copy manually' });
                                            }
                                        }}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            background: promptCopied ? '#22c55e' : '#8b5cf6',
                                            color: '#fff',
                                            fontSize: '0.8125rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {promptCopied ? '✅ Copied!' : '📋 Copy Prompt'}
                                    </button>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                                    Paste the AI's structured output below. The parser will auto-detect sections, question types,
                                    and answers.
                                </p>
                                <textarea
                                    value={pasteTextContent}
                                    onChange={(e) => setPasteTextContent(e.target.value)}
                                    placeholder={`I. MULTIPLE CHOICE QUESTIONS\nMark the letter A, B, C or D...\n\nQuestion 1. We all wanted to ______ in the contest.\nA. take off\nB. take part\nC. take out\nD. take over\n\n...\n\nVI. ANSWER KEY\n1 B\n2 C\n...`}
                                    style={{
                                        width: '100%',
                                        minHeight: '280px',
                                        padding: '0.875rem',
                                        border: '1.5px solid #cbd5e1',
                                        borderRadius: '0.75rem',
                                        fontSize: '0.875rem',
                                        fontFamily: 'monospace',
                                        color: '#1e293b',
                                        resize: 'vertical',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                        lineHeight: 1.6,
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                                    onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                                />
                                {pasteErrorMessage && (
                                    <div style={{
                                        margin: '1rem 0 0 0',
                                        padding: '0.875rem',
                                        background: '#fee2e2',
                                        color: '#b91c1c',
                                        borderRadius: '0.5rem',
                                        border: '1px solid #f87171',
                                        fontSize: '0.875rem',
                                        fontWeight: 500,
                                    }}>
                                        ⚠️ {pasteErrorMessage}
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                        {pasteTextContent.length > 0
                                            ? `${pasteTextContent.split('\n').filter(l => l.trim()).length} lines`
                                            : 'No content'}
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => {
                                                setShowPasteText(false);
                                                setPasteTextContent('');
                                            }}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                border: '1.5px solid #cbd5e1',
                                                borderRadius: '0.5rem',
                                                background: '#fff',
                                                fontSize: '0.875rem',
                                                cursor: 'pointer',
                                                color: '#475569',
                                            }}
                                        >Cancel</button>
                                        <button
                                            onClick={async () => {
                                                if (!pasteTextContent.trim()) return;
                                                setIsPasteProcessing(true);
                                                setPasteErrorMessage(null);
                                                console.log('[PasteText] Starting parse, text length:', pasteTextContent.length);
                                                try {
                                                    const result = await parseThcsText(pasteTextContent);
                                                    console.log('[PasteText] parseThcsText returned:', {
                                                        success: result.success,
                                                        error: !result.success ? result.error : undefined,
                                                        hasSections: result.success ? result.data?.sections?.length : undefined,
                                                        totalQuestions: result.success ? result.data?.sections?.reduce((s: number, sec: any) => s + sec.questions.length, 0) : undefined,
                                                    });
                                                    if (result.success) {
                                                        const { data } = result;
                                                        console.log('[PasteText] ✅ Setting parsedPasteData, sections:', data.sections.length);
                                                        setParsedPasteData(data);
                                                    } else {
                                                        console.log('[PasteText] ❌ Parse failed:', result.error);
                                                        setPasteErrorMessage(result.error || 'Parse failed with no error message');
                                                    }
                                                } catch (err) {
                                                    console.error('[PasteText] ❌ Exception:', err);
                                                    setPasteErrorMessage(err instanceof Error ? err.message : 'Unknown error');
                                                } finally {
                                                    setIsPasteProcessing(false);
                                                }
                                            }}
                                            disabled={!pasteTextContent.trim() || isPasteProcessing}
                                            style={{
                                                padding: '0.5rem 1.25rem',
                                                border: 'none',
                                                borderRadius: '0.5rem',
                                                background: pasteTextContent.trim() && !isPasteProcessing ? '#8b5cf6' : '#e2e8f0',
                                                color: pasteTextContent.trim() && !isPasteProcessing ? '#fff' : '#94a3b8',
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                cursor: pasteTextContent.trim() && !isPasteProcessing ? 'pointer' : 'not-allowed',
                                            }}
                                        >{isPasteProcessing ? '⏳ Parsing...' : 'Parse & Import'}</button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* ── Step B: Review parsed results ── */
                            <THCSParseReviewPanel
                                parsedTest={parsedPasteData}
                                onBack={() => setParsedPasteData(null)}
                                onProceed={(finalParsed) => {
                                    setShowPasteText(false);
                                    setPasteTextContent('');
                                    setParsedPasteData(null);
                                    onParsedProceed?.(finalParsed);
                                }}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

/* ── Quick Start Card (mockup-style: centered icon + title, no description) ── */
const QuickStartCard: React.FC<{
    svgIcon: string;
    title: string;
    onClick?: () => void;
    active: boolean;
}> = ({ svgIcon, title, onClick, active }) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.625rem',
            padding: '1.75rem 1rem',
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
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
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
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.1)';
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
    </button>
);

/* ── Timer Mode Card (same visual as Quick Start) ── */
const TimerModeCard: React.FC<{
    svgIcon: string;
    title: string;
    description: string;
    active: boolean;
    onClick: () => void;
}> = ({ svgIcon, title, description, active, onClick }) => (
    <button
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
        <span style={{
            fontSize: '0.6875rem',
            color: '#94a3b8',
            lineHeight: 1.2,
        }}>{description}</span>
    </button>
);

/* ── Timer Mode SVG Icons ── */
const timerStrictIcon = `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="14" cy="15" r="10" stroke="#8b5cf6" stroke-width="1.5" fill="none"/>
  <path d="M14 9v6l4 3" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M11 3h6" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const timerInfoIcon = `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="14" cy="15" r="10" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <path d="M14 9v6l4 3" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="22" cy="7" r="4" fill="#3b82f6" opacity="0.15"/>
  <path d="M22 6v2m0 1.5v0" stroke="#3b82f6" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

const timerNoneIcon = `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="14" cy="15" r="10" stroke="#94a3b8" stroke-width="1.5" fill="none" stroke-dasharray="4 3"/>
  <path d="M6 4l18 20" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

/* ── SVG icons matching mockup's minimal line-art style ── */
const templateIcon = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="4" width="28" height="32" rx="3" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <path d="M12 12h16M12 18h12M12 24h14" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
  <rect x="20" y="20" width="14" height="14" rx="7" fill="#8b5cf6" opacity="0.15"/>
  <path d="M25 25l2 2 4-4" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;



const pasteTextIcon = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="6" width="24" height="30" rx="3" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <path d="M15 4h10v4a1 1 0 01-1 1H16a1 1 0 01-1-1V4z" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
  <rect x="17" y="2" width="6" height="4" rx="1" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
  <path d="M14 16h12M14 22h10M14 28h8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const blankIcon = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="4" width="28" height="32" rx="3" stroke="#8b5cf6" stroke-width="1.5" fill="none"/>
  <path d="M12 14l4 3-4 3" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20 14h8M20 20h6M20 26h8M12 26h4" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

export default THCSSetupStep;
