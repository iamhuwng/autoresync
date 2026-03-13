/**
 * THCSTestEditorModal — Edit Test Modal for THCS-THPT tests (PRD-0027)
 *
 * Architecture: Mirrors TestEditor.tsx (IELTS) exactly:
 *   - Uses EditTestFrame for the chrome (header, tabs, save/cancel, settings)
 *   - Questions tab uses the same left-panel (380px) + right-panel layout
 *   - Context tab shows sections in a ResourceManager-like panel
 *   - Settings tab is handled by EditTestFrame
 *
 * Metadata editing borrows the honed design from THCSSetupStep (Step 1):
 *   - Duration pill buttons
 *   - Collapsible advanced settings
 *   - Glass card treatment
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Modal, Text, Badge, Select, Collapse, Switch, Textarea, TagsInput, ScrollArea } from '@mantine/core';
import { Card } from '../modern';
import { EditTestFrame, type EditorTab } from '../test/editor/EditTestFrame';
import THCSSectionBlock from './THCSSectionBlock';
import type { THCSTest, THCSSection, THCSTestMetadata } from '../../types/thcs-test.types';
import { DURATION_PRESETS, GRADE_LEVELS, EXAM_TYPE_OPTIONS } from '../../types/thcs-test.types';
import { updateThcsTestInFirebase } from '../../services/thcsTestStorage';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../modern/ToastNotification';
import { propagateTestMetadataToHomework } from '../../services/homeworkManager';

// ─── Props ──────────────────────────────────────────────────────
interface THCSTestEditorModalProps {
    test: THCSTest;
    show: boolean;
    handleClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────
const cloneSections = (sections: THCSSection[]): THCSSection[] =>
    JSON.parse(JSON.stringify(sections));

const gradeData = (GRADE_LEVELS || [6, 7, 8, 9, 10, 11, 12]).map(g => ({ value: g.toString(), label: `Grade ${g}` }));
const examTypeData = (EXAM_TYPE_OPTIONS || ['giữa kì', 'cuối kì', 'thi vào 10', 'ôn tập']).map(e => ({ value: e, label: e }));

// ─── Component ──────────────────────────────────────────────────
const THCSTestEditorModal: React.FC<THCSTestEditorModalProps> = ({ test, show, handleClose }) => {
    const { user, isAdmin } = useAuth();

    const isReadOnly = useMemo(() => {
        if (!test) return false;
        if (isAdmin) return false;
        const ownerId = test.ownerId ?? test.createdBy;
        if (!ownerId) return false;
        return ownerId !== user?.uid;
    }, [test, user?.uid, isAdmin]);

    // ── Local edit state ─────────────────────────────────────────
    const [editedSections, setEditedSections] = useState<THCSSection[]>([]);
    const [editedMetadata, setEditedMetadata] = useState<THCSTestMetadata>({
        title: '', duration: 45, gradeLevel: 9 as any, examType: '',
    });
    const [editedIsPublic, setEditedIsPublic] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<EditorTab>('questions');

    // Sections tab: selected section index for right-panel editing
    const [selectedSectionIndex, setSelectedSectionIndex] = useState<number | null>(null);

    // Advanced settings accordion (from THCSSetupStep)
    const [advancedOpen, setAdvancedOpen] = useState(false);

    // ── Initialize state when modal opens ────────────────────────
    useEffect(() => {
        if (test && show) {
            setEditedSections(cloneSections(test.sections || []));
            setEditedMetadata({ ...test.metadata });
            setEditedIsPublic(test.isPublic || false);

            setActiveTab('questions');
            setSelectedSectionIndex(test.sections?.length > 0 ? 0 : null);
        }
    }, [test, show]);

    // ── Derived stats ────────────────────────────────────────────
    const totalQuestions = useMemo(
        () => editedSections.reduce((sum, s) => sum + s.questions.length, 0),
        [editedSections]
    );
    const totalPoints = useMemo(
        () => editedSections.reduce((sum, s) => {
            if (s.pointMode === 'manual') {
                return sum + s.questions.reduce((qs, q) => qs + (q.points || 0), 0);
            }
            return sum + (s.totalPoints || s.questions.length);
        }, 0),
        [editedSections]
    );

    // ── Section operations ───────────────────────────────────────

    const handleSectionUpdate = useCallback((index: number, updated: THCSSection) => {
        setEditedSections(prev => {
            const next = [...prev];
            next[index] = updated;
            return next;
        });
    }, []);

    const handleSectionDelete = useCallback((index: number) => {
        if (!window.confirm(`Delete "${editedSections[index]?.name || 'this section'}"? This cannot be undone.`)) return;
        setEditedSections(prev => prev.filter((_, i) => i !== index));
        if (selectedSectionIndex === index) {
            setSelectedSectionIndex(null);
        } else if (selectedSectionIndex !== null && selectedSectionIndex > index) {
            setSelectedSectionIndex(selectedSectionIndex - 1);
        }
    }, [editedSections, selectedSectionIndex]);

    const handleSectionMove = useCallback((index: number, direction: -1 | 1) => {
        setEditedSections(prev => {
            const newIdx = index + direction;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const next = [...prev];
            const temp = next[index]!;
            next[index] = next[newIdx]!;
            next[newIdx] = temp;
            return next.map((s, i) => ({ ...s, order: i }));
        });
    }, []);

    const handleAddSection = useCallback(() => {
        const newSection: THCSSection = {
            id: crypto.randomUUID(),
            name: `Part ${String.fromCharCode(65 + editedSections.length)}`,
            order: editedSections.length,
            totalPoints: 0,
            pointMode: 'auto',
            instructionText: '',
            isCustomInstruction: false,
            questions: [],
            passage: null as any,
            layout: 'single-column',
        };
        setEditedSections(prev => [...prev, newSection]);
        setSelectedSectionIndex(editedSections.length); // select the new one
    }, [editedSections.length]);

    // ── Metadata update ──────────────────────────────────────────
    const handleMetadataChange = useCallback(<K extends keyof THCSTestMetadata>(field: K, value: THCSTestMetadata[K]) => {
        setEditedMetadata(prev => ({ ...prev, [field]: value }));
    }, []);

    // ── Section offsets ──────────────────────────────────────────
    const sectionOffsets = useMemo(() => {
        const offsets: number[] = [];
        let acc = 0;
        editedSections.forEach(s => {
            offsets.push(acc);
            acc += s.questions.length;
        });
        return offsets;
    }, [editedSections]);

    // ── Save ─────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        if (isReadOnly || !test?.id) return;

        if (editedSections.length === 0) {
            alert('Test must have at least one section.');
            return;
        }
        const emptySections = editedSections.filter(s => s.questions.length === 0);
        if (emptySections.length > 0) {
            alert(`Section "${emptySections[0]?.name || 'Unknown'}" has no questions.`);
            return;
        }

        setIsSaving(true);
        try {
            const updatePayload = {
                metadata: editedMetadata,
                sections: editedSections.map((s, i) => ({ ...s, order: i })),
                questionCount: totalQuestions,
                totalPoints,
                isPublic: editedIsPublic,
            };

            // 🔍 DIAGNOSTIC: Log exactly what the editor is sending
            console.log(`📤 [THCSTestEditor] Saving test ${test.id}:`, {
                title: editedMetadata.title,
                sectionCount: editedSections.length,
                questionCount: totalQuestions,
                totalPoints,
                isPublic: editedIsPublic,
                sectionNames: editedSections.map(s => s.name),
                questionsPerSection: editedSections.map(s => s.questions.length),
            });

            const result = await updateThcsTestInFirebase(test.id, updatePayload);

            if (result.success) {
                toast.success('Test saved successfully ✅');

                // Fire-and-forget: propagate title change to homework assignments
                if (editedMetadata.title !== test.metadata?.title) {
                    propagateTestMetadataToHomework(test.id, { materialTitle: editedMetadata.title });
                }

                handleClose();
            } else {
                toast.error(`Failed to save: ${result.error}`);
            }
        } catch (err) {
            console.error('[THCSTestEditor] Save error:', err);
            toast.error('Failed to save test changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }, [isReadOnly, test?.id, editedMetadata, editedSections, totalQuestions, totalPoints, editedIsPublic, handleClose]);

    // ── Cancel ───────────────────────────────────────────────────
    const handleCancel = useCallback(() => {
        // Compare actual data to original — avoids false positives from component init side-effects
        const sectionsChanged = JSON.stringify(editedSections) !== JSON.stringify(test.sections || []);
        const metadataChanged = JSON.stringify(editedMetadata) !== JSON.stringify(test.metadata);
        const publicChanged = editedIsPublic !== (test.isPublic || false);
        const hasRealChanges = sectionsChanged || metadataChanged || publicChanged;

        if (hasRealChanges) {
            if (!window.confirm('You have unsaved changes. Discard changes and close?')) return;
        }
        handleClose();
    }, [editedSections, editedMetadata, editedIsPublic, test, handleClose]);

    // ── Tab handling ─────────────────────────────────────────────
    const handleTabChange = useCallback((tab: EditorTab) => {
        setActiveTab(tab);
    }, []);

    if (!test) return null;

    // ── Section List Panel (left, 380px — identical shape to IELTS QuestionList) ──
    const sectionListPanel = (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Section List Header */}
            <div style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <Text size="sm" fw={700} style={{ color: '#1e293b' }}>
                    Sections
                    <Badge size="xs" variant="light" color="violet" ml={6}>{editedSections.length}</Badge>
                </Text>
                {!isReadOnly && (
                    <button
                        onClick={handleAddSection}
                        style={{
                            padding: '0.25rem 0.625rem',
                            border: '1px solid rgba(139,92,246,0.3)',
                            borderRadius: '0.375rem',
                            background: 'rgba(139,92,246,0.06)',
                            color: '#8b5cf6', fontWeight: 600, fontSize: '0.75rem',
                            cursor: 'pointer', transition: 'all 0.15s',
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                        Add
                    </button>
                )}
            </div>

            {/* Section Items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                {editedSections.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', opacity: 0.5 }}>
                        <Text size="md" fw={600}>No sections yet</Text>
                        <Text size="sm" c="dimmed">Click "Add" to create a section</Text>
                    </div>
                ) : (
                    editedSections.map((section, idx) => {
                        const isSelected = selectedSectionIndex === idx;
                        const qCount = section.questions.length;
                        const pts = section.pointMode === 'manual'
                            ? section.questions.reduce((s, q) => s + (q.points || 0), 0)
                            : (section.totalPoints || qCount);

                        return (
                            <button
                                key={section.id}
                                onClick={() => setSelectedSectionIndex(idx)}
                                style={{
                                    width: '100%',
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.75rem 1rem',
                                    border: isSelected ? '2px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.3)',
                                    borderRadius: '0.75rem',
                                    cursor: 'pointer',
                                    marginBottom: '0.375rem',
                                    textAlign: 'left',
                                    background: isSelected
                                        ? 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.12) 100%)'
                                        : 'rgba(255,255,255,0.5)',
                                    boxShadow: isSelected ? '0 4px 12px rgba(139,92,246,0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(59,130,246,0.06) 100%)';
                                        e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                                    }
                                }}
                            >
                                {/* Section number circle */}
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                                    background: isSelected ? '#8b5cf6' : '#e2e8f0',
                                    color: isSelected ? '#fff' : '#64748b',
                                }}>
                                    {idx + 1}
                                </div>

                                {/* Section info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text size="sm" fw={isSelected ? 700 : 600} style={{
                                        color: isSelected ? '#8b5cf6' : '#1e293b',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {section.name || 'Untitled Section'}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {qCount} question{qCount !== 1 ? 's' : ''} · {pts} pts
                                    </Text>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Bottom stats bar */}
            <div style={{
                padding: '0.625rem 1rem',
                borderTop: '1px solid rgba(0,0,0,0.06)',
                display: 'flex', justifyContent: 'space-between',
                fontSize: '0.75rem', color: '#64748b', fontWeight: 500,
            }}>
                <span>{totalQuestions} questions</span>
                <span>{totalPoints} points</span>
            </div>
        </div>
    );

    // ── Section Editor Panel (right side — full THCSSectionBlock) ──
    const sectionEditorPanel = selectedSectionIndex !== null && editedSections[selectedSectionIndex] ? (
        <ScrollArea style={{ height: '100%' }} offsetScrollbars>
            <div style={{ padding: '1rem' }}>
                <THCSSectionBlock
                    section={editedSections[selectedSectionIndex]}
                    sectionIndex={selectedSectionIndex}
                    totalSections={editedSections.length}
                    globalQuestionOffset={sectionOffsets[selectedSectionIndex] ?? 0}
                    draftId={null}
                    onUpdate={(updated) => handleSectionUpdate(selectedSectionIndex, updated)}
                    onDelete={() => handleSectionDelete(selectedSectionIndex)}
                    onMoveUp={() => handleSectionMove(selectedSectionIndex, -1)}
                    onMoveDown={() => handleSectionMove(selectedSectionIndex, 1)}
                />
            </div>
        </ScrollArea>
    ) : null;

    // ── Metadata Panel (Context tab — exact same design as THCSSetupStep Step 1) ──
    const metadataPanel = (
        <ScrollArea style={{ height: '100%' }} offsetScrollbars>
            <div style={{ padding: '2rem', maxWidth: '680px', margin: '0 auto' }}>
                {/* Main Metadata Card — same glass card treatment as THCSSetupStep */}
                <div style={{
                    background: 'rgba(255,255,255,0.55)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    borderRadius: '1.25rem',
                    border: '1px solid rgba(148,163,184,0.2)',
                    padding: '2rem 2.25rem',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
                    display: 'flex', flexDirection: 'column', gap: '1.125rem',
                    opacity: isReadOnly ? 0.7 : 1,
                }}>
                    {/* Test Title — bold label, same style as THCSSetupStep */}
                    <div>
                        <label style={{
                            display: 'block', fontSize: '0.9375rem', fontWeight: 700,
                            color: '#1e293b', marginBottom: '0.375rem',
                        }}>Test Title</label>
                        <input
                            type="text"
                            placeholder="Đề kiểm tra giữa kì 1 — Tiếng Anh 9"
                            maxLength={200}
                            value={editedMetadata.title}
                            onChange={(e) => handleMetadataChange('title', e.target.value)}
                            disabled={isReadOnly}
                            style={{
                                width: '100%', padding: '0.625rem 0.875rem',
                                border: '1.5px solid #cbd5e1', borderRadius: '0.5rem',
                                fontSize: '0.9375rem', color: '#1e293b', background: '#fff',
                                outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' as const,
                            }}
                            onFocus={(e) => { e.target.style.borderColor = '#8b5cf6'; }}
                            onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; }}
                        />
                    </div>

                    <div style={{ height: 1, background: '#f1f5f9' }} />

                    {/* Grade Level + Exam Type row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{
                                display: 'block', fontSize: '0.9375rem', fontWeight: 700,
                                color: '#1e293b', marginBottom: '0.375rem',
                            }}>Grade Level</label>
                            <Select
                                placeholder="Select grade"
                                data={gradeData}
                                value={editedMetadata.gradeLevel?.toString() || null}
                                onChange={(val) => handleMetadataChange('gradeLevel', val ? parseInt(val, 10) as any : 6)}
                                disabled={isReadOnly}
                                styles={{
                                    input: {
                                        border: '1.5px solid #cbd5e1', borderRadius: '0.5rem',
                                        fontSize: '0.9375rem', padding: '0.625rem 0.875rem', height: 'auto',
                                    },
                                }}
                            />
                        </div>
                        <div>
                            <label style={{
                                display: 'block', fontSize: '0.9375rem', fontWeight: 700,
                                color: '#1e293b', marginBottom: '0.375rem',
                            }}>Exam Type</label>
                            <Select
                                placeholder="giữa kì"
                                data={examTypeData}
                                searchable
                                value={editedMetadata.examType || null}
                                onChange={(val) => handleMetadataChange('examType', val || '')}
                                disabled={isReadOnly}
                                styles={{
                                    input: {
                                        border: '1.5px solid #cbd5e1', borderRadius: '0.5rem',
                                        fontSize: '0.9375rem', padding: '0.625rem 0.875rem', height: 'auto',
                                    },
                                }}
                            />
                        </div>
                    </div>

                    {/* Duration with pill buttons — exact same pattern as THCSSetupStep */}
                    <div>
                        <label style={{
                            display: 'block', fontSize: '0.9375rem', fontWeight: 700,
                            color: '#1e293b', marginBottom: '0.5rem',
                        }}>Duration</label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {DURATION_PRESETS.map(d => (
                                <button
                                    key={d}
                                    onClick={() => !isReadOnly && handleMetadataChange('duration', d)}
                                    disabled={isReadOnly}
                                    style={{
                                        minWidth: 44, padding: '0.375rem 0.875rem',
                                        border: editedMetadata.duration === d ? '2px solid #8b5cf6' : '1.5px solid #cbd5e1',
                                        borderRadius: '2rem',
                                        background: editedMetadata.duration === d ? '#8b5cf6' : '#fff',
                                        color: editedMetadata.duration === d ? '#fff' : '#475569',
                                        fontSize: '0.8125rem', fontWeight: 600,
                                        cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    {d}m
                                </button>
                            ))}
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="number" min={5} max={300} step={5}
                                    value={!DURATION_PRESETS.includes(editedMetadata.duration as any) ? editedMetadata.duration : ''}
                                    placeholder=""
                                    disabled={isReadOnly}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (!isNaN(v) && v > 0) handleMetadataChange('duration', v);
                                    }}
                                    style={{
                                        width: 52, padding: '0.375rem 0.5rem',
                                        border: '1.5px solid #cbd5e1', borderRadius: '0.5rem',
                                        fontSize: '0.8125rem', color: '#475569',
                                        textAlign: 'center' as const, outline: 'none', background: '#fff',
                                    }}
                                    onFocus={(e) => { e.target.style.borderColor = '#8b5cf6'; }}
                                    onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ▸ Advanced Settings Accordion — from THCSSetupStep */}
                    <button
                        onClick={() => setAdvancedOpen(!advancedOpen)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.375rem 0', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: '0.9375rem', fontWeight: 700, color: '#334155',
                        }}
                    >
                        <span style={{
                            display: 'inline-block', transition: 'transform 0.2s',
                            transform: advancedOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                            fontSize: '0.75rem',
                        }}>▶</span>
                        Advanced Settings
                    </button>

                    <Collapse in={advancedOpen}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.25rem' }}>
                            {/* Timer Mode — SVG icon card treatment (matching THCSSetupStep TimerModeCard) */}
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: '#334155' }}>
                                    Timer Mode
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                    {([
                                        {
                                            value: 'strict', title: 'Strict', desc: 'Auto-submit at 0:00',
                                            icon: `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="15" r="10" stroke="#8b5cf6" stroke-width="1.5" fill="none"/><line x1="14" y1="15" x2="14" y2="9" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="15" x2="19" y2="15" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="3" x2="16" y2="3" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/><path d="M22 8l2-2" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/></svg>`,
                                        },
                                        {
                                            value: 'informational', title: 'Informational', desc: 'Timer shown, no auto-submit',
                                            icon: `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="11" stroke="#8b5cf6" stroke-width="1.5" fill="none"/><line x1="14" y1="8" x2="14" y2="14" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/><circle cx="14" cy="19" r="1" fill="#8b5cf6"/></svg>`,
                                        },
                                        {
                                            value: 'none', title: 'None', desc: 'No timer displayed',
                                            icon: `<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="15" r="10" stroke="#94a3b8" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/><line x1="14" y1="15" x2="14" y2="9" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="15" x2="19" y2="15" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/><path d="M6 4l18 20" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/></svg>`,
                                        },
                                    ] as const).map(mode => {
                                        const current = (editedMetadata as any).timerMode || 'strict';
                                        const isActive = current === mode.value;
                                        return (
                                            <button
                                                key={mode.value}
                                                onClick={() => !isReadOnly && handleMetadataChange('timerMode' as any, mode.value)}
                                                disabled={isReadOnly}
                                                style={{
                                                    display: 'flex', flexDirection: 'column',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    gap: '0.375rem', padding: '0.875rem 0.5rem',
                                                    border: isActive ? '2px solid #8b5cf6' : '1px solid rgba(148,163,184,0.2)',
                                                    borderRadius: '0.75rem',
                                                    background: isActive ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.5)',
                                                    cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s ease', textAlign: 'center' as const,
                                                }}
                                            >
                                                <div
                                                    style={{ width: 28, height: 28 }}
                                                    dangerouslySetInnerHTML={{ __html: mode.icon }}
                                                />
                                                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: isActive ? '#8b5cf6' : '#1e293b' }}>
                                                    {mode.title}
                                                </span>
                                                <span style={{ fontSize: '0.6875rem', color: '#94a3b8', lineHeight: 1.2 }}>
                                                    {mode.desc}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Subject Variant + Province — matching THCSSetupStep layout */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.375rem', color: '#334155' }}>Subject Variant</label>
                                    <input
                                        type="text" placeholder="e.g., Global Success"
                                        value={(editedMetadata as any).subjectVariant || ''}
                                        onChange={(e) => handleMetadataChange('subjectVariant' as any, e.target.value || undefined)}
                                        disabled={isReadOnly}
                                        style={{
                                            width: '100%', padding: '0.5rem 0.75rem',
                                            border: '1.5px solid #cbd5e1', borderRadius: '0.5rem',
                                            fontSize: '0.875rem', color: '#1e293b', background: '#fff',
                                            outline: 'none', boxSizing: 'border-box' as const,
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.375rem', color: '#334155' }}>Province</label>
                                    <input
                                        type="text" placeholder="e.g., Hà Nội"
                                        value={editedMetadata.province || ''}
                                        onChange={(e) => handleMetadataChange('province', e.target.value || undefined)}
                                        disabled={isReadOnly}
                                        style={{
                                            width: '100%', padding: '0.5rem 0.75rem',
                                            border: '1.5px solid #cbd5e1', borderRadius: '0.5rem',
                                            fontSize: '0.875rem', color: '#1e293b', background: '#fff',
                                            outline: 'none', boxSizing: 'border-box' as const,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* School */}
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.375rem', color: '#334155' }}>School</label>
                                <input
                                    type="text" placeholder="e.g., THCS Nguyễn Du"
                                    value={editedMetadata.school || ''}
                                    onChange={(e) => handleMetadataChange('school', e.target.value || undefined)}
                                    disabled={isReadOnly}
                                    style={{
                                        width: '100%', padding: '0.5rem 0.75rem',
                                        border: '1.5px solid #cbd5e1', borderRadius: '0.5rem',
                                        fontSize: '0.875rem', color: '#1e293b', background: '#fff',
                                        outline: 'none', boxSizing: 'border-box' as const,
                                    }}
                                />
                            </div>

                            {/* Description */}
                            <Textarea
                                label="Description"
                                placeholder="Optional description"
                                autosize minRows={2}
                                value={editedMetadata.description || ''}
                                onChange={(e) => handleMetadataChange('description', e.target.value || undefined)}
                                disabled={isReadOnly}
                                styles={{ input: { border: '1.5px solid #cbd5e1', borderRadius: '0.5rem' } }}
                            />

                            {/* Tags */}
                            <TagsInput
                                label="Tags"
                                placeholder="Press Enter to add"
                                value={editedMetadata.tags || []}
                                onChange={(val) => handleMetadataChange('tags', val)}
                                disabled={isReadOnly}
                                styles={{ input: { border: '1.5px solid #cbd5e1', borderRadius: '0.5rem' } }}
                            />

                            {/* Public toggle */}
                            <Switch
                                label="Share in Public Library"
                                description="Allow other teachers to use this test"
                                checked={editedIsPublic}
                                onChange={(e) => { if (!isReadOnly) { setEditedIsPublic(e.currentTarget.checked); } }}
                                disabled={isReadOnly}
                                color="violet"
                            />
                        </div>
                    </Collapse>
                </div>

                {/* Test ID info — small footer */}
                <div style={{
                    marginTop: '1.5rem', padding: '0.75rem 1rem',
                    background: 'rgba(0,0,0,0.02)', borderRadius: '0.5rem',
                    border: '1px dashed rgba(0,0,0,0.1)',
                }}>
                    <Text size="xs" c="dimmed">Test ID: <code style={{ fontSize: '0.75rem' }}>{test.id}</code></Text>
                    <Text size="xs" c="dimmed">Created: {new Date(test.createdAt).toLocaleDateString()}</Text>
                    {test.updatedAt && (
                        <Text size="xs" c="dimmed">Updated: {new Date(test.updatedAt).toLocaleDateString()}</Text>
                    )}
                </div>
            </div>
        </ScrollArea>
    );

    // ── frameProps — feeds into EditTestFrame (same pattern as TestEditor.tsx) ──
    const frameProps = {
        title: editedMetadata.title || test.metadata.title,
        onTitleChange: (newTitle: string) => { handleMetadataChange('title', newTitle); },
        activeTab,
        onTabChange: handleTabChange,
        onSave: handleSave,
        onCancel: handleCancel,
        isSaving,
        questionCount: totalQuestions,
        resourceCount: editedSections.length,
        duration: editedMetadata.duration,
        onDurationChange: (d: number) => { handleMetadataChange('duration', d); },
        isPublic: editedIsPublic,
        onIsPublicChange: (val: boolean) => { setEditedIsPublic(val); },
        readOnly: isReadOnly,
        hiddenTabs: ['answerKey'] as EditorTab[],
    };

    return (
        <Modal
            opened={show}
            onClose={handleCancel}
            size="auto"
            padding={0}
            withCloseButton={false}
            centered
            styles={{
                body: { padding: 0, background: 'transparent' },
                content: { background: 'transparent', boxShadow: 'none' },
                inner: { padding: 0 },
            }}
        >
            <EditTestFrame {...frameProps}>
                {/* Questions Tab → Left panel (Section list) + Right panel (Section editor) */}
                {activeTab === 'questions' && (
                    <div style={{ display: 'flex', gap: '1.5rem', height: '100%', padding: '1rem' }}>
                        {/* Left Panel: Section List (380px — same as IELTS) */}
                        <div style={{ width: '380px', height: '100%', flexShrink: 0 }}>
                            <Card variant="glass" style={{ height: '100%', padding: 0, overflow: 'hidden' }}>
                                {sectionListPanel}
                            </Card>
                        </div>

                        {/* Right Panel: Section Editor or Placeholder */}
                        <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
                            {sectionEditorPanel ? (
                                <div
                                    style={{
                                        width: '650px',
                                        maxHeight: '80vh',
                                        overflow: 'auto',
                                        animation: 'slideInFromRight 0.3s ease',
                                    }}
                                >
                                    {sectionEditorPanel}
                                </div>
                            ) : (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    height: '100%', flexDirection: 'column', opacity: 0.5,
                                }}>
                                    <Text size="xl">Select a section to edit</Text>
                                    <Text size="sm" c="dimmed">Detailed section editor will appear here</Text>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Context Tab → Test Info / Metadata (using THCSSetupStep design) */}
                {activeTab === 'context' && (
                    <div style={{ width: '100%', height: '100%', padding: 0 }}>
                        {metadataPanel}
                    </div>
                )}
            </EditTestFrame>

            <style>{`
                @keyframes slideInFromRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </Modal>
    );
};

export default THCSTestEditorModal;
