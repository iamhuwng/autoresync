/**
 * QuickCommentsDialog — Speech-bubble dialog for preset comments
 *
 * FAB button (💬) in bottom-right of essay panel. Opens a categorized
 * preset dialog. Clicking a preset auto-creates a commentMark + GradingComment
 * on the selected text.
 *
 * Presets stored in localStorage at `kahoot_quick_comment_presets`.
 *
 * @see specs/grading-editor-redesign FR-19 through FR-28
 * @module components/writing-grading/QuickCommentsDialog
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { QuickCommentPreset, CommentCategoryId } from '../../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../../types/ielts-writing.types';
import './QuickCommentsDialog.css';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'kahoot_quick_comment_presets';

/** Default presets — cannot be deleted */
const DEFAULT_PRESETS: QuickCommentPreset[] = [
    // GRA - Grammar Range & Accuracy
    { id: 'gra-1', text: 'Subject-verb agreement', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'gra-2', text: 'Wrong tense', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'gra-3', text: 'Article error', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'gra-4', text: 'Run-on sentence', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'gra-5', text: 'Fragment', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },

    // LR - Lexical Resource
    { id: 'lr-1', text: 'Word choice', categoryId: 'lr', categoryLabel: 'LR', color: COMMENT_CATEGORIES.lr.color, isDefault: true },
    { id: 'lr-2', text: 'Repetitive vocabulary', categoryId: 'lr', categoryLabel: 'LR', color: COMMENT_CATEGORIES.lr.color, isDefault: true },
    { id: 'lr-3', text: 'Informal register', categoryId: 'lr', categoryLabel: 'LR', color: COMMENT_CATEGORIES.lr.color, isDefault: true },
    { id: 'lr-4', text: 'Spelling error', categoryId: 'lr', categoryLabel: 'LR', color: COMMENT_CATEGORIES.lr.color, isDefault: true },

    // CC - Coherence & Cohesion
    { id: 'cc-1', text: 'Needs transition word', categoryId: 'cc', categoryLabel: 'CC', color: COMMENT_CATEGORIES.cc.color, isDefault: true },
    { id: 'cc-2', text: 'Weak paragraph structure', categoryId: 'cc', categoryLabel: 'CC', color: COMMENT_CATEGORIES.cc.color, isDefault: true },
    { id: 'cc-3', text: 'Unclear reference', categoryId: 'cc', categoryLabel: 'CC', color: COMMENT_CATEGORIES.cc.color, isDefault: true },

    // TA - Task Achievement (default, will show as TR for Task 2)
    { id: 'ta-1', text: 'Off-topic', categoryId: 'ta', categoryLabel: 'TA', color: COMMENT_CATEGORIES.ta.color, isDefault: true },
    { id: 'ta-2', text: "Doesn't address the prompt", categoryId: 'ta', categoryLabel: 'TA', color: COMMENT_CATEGORIES.ta.color, isDefault: true },
    { id: 'ta-3', text: 'Missing key info', categoryId: 'ta', categoryLabel: 'TA', color: COMMENT_CATEGORIES.ta.color, isDefault: true },
];

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface QuickCommentsDialogProps {
    taskNumber: 1 | 2;
    hasSelection: boolean;
    onSelectPreset: (preset: QuickCommentPreset) => void;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const QuickCommentsDialog: React.FC<QuickCommentsDialogProps> = ({
    taskNumber,
    hasSelection,
    onSelectPreset,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [presets, setPresets] = useState<QuickCommentPreset[]>(() => loadPresets());
    const [newPresetText, setNewPresetText] = useState('');
    const [newPresetCategory, setNewPresetCategory] = useState<CommentCategoryId>('gra');
    const dialogRef = useRef<HTMLDivElement>(null);
    const fabRef = useRef<HTMLButtonElement>(null);
    const tooltipTimeoutRef = useRef<number | null>(null);

    // ─── Load/Save presets from localStorage ─────────────────
    function loadPresets(): QuickCommentPreset[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const custom = JSON.parse(stored) as QuickCommentPreset[];
                // Merge defaults + custom (defaults first, then custom)
                return [...DEFAULT_PRESETS, ...custom];
            }
        } catch { /* ignore parse errors */ }
        return [...DEFAULT_PRESETS];
    }

    function saveCustomPresets(allPresets: QuickCommentPreset[]) {
        const custom = allPresets.filter(p => !p.isDefault);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    }

    // ─── FAB Click ───────────────────────────────────────────
    const handleFabClick = useCallback(() => {
        if (!hasSelection) {
            // Show tooltip instead of opening dialog
            setShowTooltip(true);
            if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
            tooltipTimeoutRef.current = window.setTimeout(() => setShowTooltip(false), 2500);
            return;
        }
        setIsOpen(prev => !prev);
    }, [hasSelection]);

    // ─── Click outside to dismiss ────────────────────────────
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                dialogRef.current && !dialogRef.current.contains(e.target as Node) &&
                fabRef.current && !fabRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    // ─── Preset click ────────────────────────────────────────
    const handlePresetClick = useCallback((preset: QuickCommentPreset) => {
        // Adjust category for task number
        const adjustedPreset = { ...preset };
        if (preset.categoryId === 'ta' && taskNumber === 2) {
            adjustedPreset.categoryId = 'tr';
            adjustedPreset.categoryLabel = 'TR';
            adjustedPreset.color = COMMENT_CATEGORIES.tr.color;
        }
        onSelectPreset(adjustedPreset);
        setIsOpen(false);
    }, [taskNumber, onSelectPreset]);

    // ─── Add custom preset ───────────────────────────────────
    const handleAddPreset = useCallback(() => {
        if (!newPresetText.trim()) return;

        const cat = COMMENT_CATEGORIES[newPresetCategory];
        const newPreset: QuickCommentPreset = {
            id: `custom-${Date.now()}`,
            text: newPresetText.trim(),
            categoryId: newPresetCategory,
            categoryLabel: cat.label,
            color: cat.color,
            isDefault: false,
        };

        const updated = [...presets, newPreset];
        setPresets(updated);
        saveCustomPresets(updated);
        setNewPresetText('');
    }, [newPresetText, newPresetCategory, presets]);

    // ─── Delete custom preset ────────────────────────────────
    const handleDeletePreset = useCallback((presetId: string) => {
        const updated = presets.filter(p => p.id !== presetId);
        setPresets(updated);
        saveCustomPresets(updated);
    }, [presets]);

    // ─── Group presets by category ───────────────────────────
    const groupedPresets = useMemo(() => {
        const groups: Record<string, { label: string; color: string; presets: QuickCommentPreset[] }> = {};

        // Determine TA/TR based on task
        const taCategoryId = taskNumber === 1 ? 'ta' : 'tr';
        const taLabel = taskNumber === 1 ? 'TA' : 'TR';

        for (const preset of presets) {
            // Map ta presets to the correct category based on task
            const displayCatId = preset.categoryId === 'ta' || preset.categoryId === 'tr' ? taCategoryId : preset.categoryId;
            const displayLabel = preset.categoryId === 'ta' || preset.categoryId === 'tr' ? taLabel : preset.categoryLabel;

            if (!groups[displayCatId]) {
                const cat = COMMENT_CATEGORIES[displayCatId] || COMMENT_CATEGORIES.uncategorized;
                groups[displayCatId] = { label: displayLabel, color: cat.color, presets: [] };
            }
            groups[displayCatId].presets.push(preset);
        }

        // Order: TA/TR, CC, LR, GRA
        const order = [taCategoryId, 'cc', 'lr', 'gra', 'uncategorized'];
        return order
            .filter(id => groups[id])
            .map(id => ({ id, ...groups[id]! }));
    }, [presets, taskNumber]);

    // ─── Available categories for new preset dropdown ────────
    const categoryOptions = useMemo(() => {
        const taCat = taskNumber === 1 ? COMMENT_CATEGORIES.ta : COMMENT_CATEGORIES.tr;
        return [
            { id: 'gra' as CommentCategoryId, label: 'GRA' },
            { id: 'lr' as CommentCategoryId, label: 'LR' },
            { id: 'cc' as CommentCategoryId, label: 'CC' },
            { id: (taskNumber === 1 ? 'ta' : 'tr') as CommentCategoryId, label: taCat.label },
        ];
    }, [taskNumber]);

    // ─── RENDER ──────────────────────────────────────────────

    return (
        <div className="quick-comments-wrapper" id="quick-comments-wrapper">
            {/* ── FAB Button ── */}
            <button
                ref={fabRef}
                className="quick-comments-fab"
                onClick={handleFabClick}
                title="Quick Comments"
                id="quick-comments-fab"
            >
                {/* SVG Chat Bubble Icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            </button>

            {/* ── Tooltip (no selection) ── */}
            {showTooltip && (
                <div className="quick-comments-tooltip" id="quick-comments-tooltip">
                    Select text first, then use Quick Comments
                </div>
            )}

            {/* ── Dialog ── */}
            {isOpen && (
                <div ref={dialogRef} className="quick-comments-dialog" id="quick-comments-dialog">
                    {/* Speech-bubble tail */}
                    <div className="quick-comments-tail" />

                    <div className="quick-comments-header">
                        <span className="quick-comments-title">Quick Comments</span>
                    </div>

                    <div className="quick-comments-body">
                        {groupedPresets.map((group) => (
                            <div key={group.id} className="quick-comments-group">
                                <div
                                    className="quick-comments-group-header"
                                    style={{ borderLeftColor: group.color }}
                                >
                                    <span
                                        className="group-dot"
                                        style={{ backgroundColor: group.color }}
                                    />
                                    {group.label}
                                </div>
                                <div className="quick-comments-chips">
                                    {group.presets.map(preset => (
                                        <button
                                            key={preset.id}
                                            className="quick-comment-chip"
                                            onClick={() => handlePresetClick(preset)}
                                            title={preset.text}
                                            id={`quick-chip-${preset.id}`}
                                        >
                                            {preset.text}
                                            {!preset.isDefault && (
                                                <span
                                                    className="chip-delete"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeletePreset(preset.id);
                                                    }}
                                                    title="Remove preset"
                                                >
                                                    ✕
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* ── Add New Preset ── */}
                        <div className="quick-comments-add" id="quick-comments-add-section">
                            <div className="quick-comments-add-row">
                                <input
                                    className="quick-comments-add-input"
                                    type="text"
                                    value={newPresetText}
                                    onChange={(e) => setNewPresetText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddPreset()}
                                    placeholder="New preset text…"
                                    id="quick-comments-add-input"
                                />
                                <select
                                    className="quick-comments-add-category"
                                    value={newPresetCategory}
                                    onChange={(e) => setNewPresetCategory(e.target.value as CommentCategoryId)}
                                    id="quick-comments-add-category"
                                >
                                    {categoryOptions.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </select>
                                <button
                                    className="quick-comments-add-btn"
                                    onClick={handleAddPreset}
                                    disabled={!newPresetText.trim()}
                                    id="quick-comments-add-btn"
                                >
                                    ➕ Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuickCommentsDialog;
