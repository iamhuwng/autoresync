import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { QuickCommentPreset, CommentCategoryId } from '../../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../../types/ielts-writing.types';
import './QuickCommentsDialog.css';

export interface QuickCommentsDialogProps {
    taskNumber: 1 | 2;
    hasSelection: boolean;
    presets: QuickCommentPreset[];
    onSelectPreset: (preset: QuickCommentPreset) => void;
    onCreatePreset: (text: string, categoryId: CommentCategoryId) => void | Promise<void>;
    onDeletePreset: (presetId: string) => void | Promise<void>;
}

const QuickCommentsDialog: React.FC<QuickCommentsDialogProps> = ({
    taskNumber,
    hasSelection,
    presets,
    onSelectPreset,
    onCreatePreset,
    onDeletePreset,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [newPresetText, setNewPresetText] = useState('');
    const [newPresetCategory, setNewPresetCategory] = useState<CommentCategoryId>('gra');
    const dialogRef = useRef<HTMLDivElement>(null);
    const fabRef = useRef<HTMLButtonElement>(null);
    const tooltipTimeoutRef = useRef<number | null>(null);

    const remapTaskSpecificCategory = useCallback((categoryId: CommentCategoryId): CommentCategoryId => {
        if (taskNumber === 1 && categoryId === 'tr') {
            return 'ta';
        }

        if (taskNumber === 2 && categoryId === 'ta') {
            return 'tr';
        }

        return categoryId;
    }, [taskNumber]);

    const handleFabClick = useCallback(() => {
        if (!hasSelection) {
            setShowTooltip(true);
            if (tooltipTimeoutRef.current) {
                clearTimeout(tooltipTimeoutRef.current);
            }
            tooltipTimeoutRef.current = window.setTimeout(() => setShowTooltip(false), 2500);
            return;
        }

        setIsOpen((current) => !current);
    }, [hasSelection]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                dialogRef.current
                && !dialogRef.current.contains(target)
                && fabRef.current
                && !fabRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
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

    const handlePresetClick = useCallback((preset: QuickCommentPreset) => {
        const adjustedCategoryId = remapTaskSpecificCategory(preset.categoryId);
        const adjustedPreset = {
            ...preset,
            categoryId: adjustedCategoryId,
            categoryLabel: COMMENT_CATEGORIES[adjustedCategoryId].label,
            color: COMMENT_CATEGORIES[adjustedCategoryId].color,
        };

        onSelectPreset(adjustedPreset);
        setIsOpen(false);
    }, [onSelectPreset, remapTaskSpecificCategory]);

    const handleAddPreset = useCallback(() => {
        if (!newPresetText.trim()) {
            return;
        }

        void onCreatePreset(newPresetText.trim(), newPresetCategory);
        setNewPresetText('');
    }, [newPresetCategory, newPresetText, onCreatePreset]);

    const groupedPresets = useMemo(() => {
        const groups: Record<string, { label: string; color: string; presets: QuickCommentPreset[] }> = {};
        const taskSpecificCategoryId = taskNumber === 1 ? 'ta' : 'tr';
        const taskSpecificLabel = taskNumber === 1 ? 'TA' : 'TR';

        for (const preset of presets) {
            const displayCategoryId = preset.categoryId === 'ta' || preset.categoryId === 'tr'
                ? taskSpecificCategoryId
                : preset.categoryId;
            const displayLabel = preset.categoryId === 'ta' || preset.categoryId === 'tr'
                ? taskSpecificLabel
                : preset.categoryLabel;

            if (!groups[displayCategoryId]) {
                const category = COMMENT_CATEGORIES[displayCategoryId] || COMMENT_CATEGORIES.uncategorized;
                groups[displayCategoryId] = {
                    label: displayLabel,
                    color: category.color,
                    presets: [],
                };
            }

            groups[displayCategoryId].presets.push(preset);
        }

        const order = [taskSpecificCategoryId, 'cc', 'lr', 'gra', 'uncategorized'];
        return order
            .filter((id) => groups[id])
            .map((id) => ({ id, ...groups[id]! }));
    }, [presets, taskNumber]);

    const categoryOptions = useMemo(() => {
        const taskSpecificCategoryId = taskNumber === 1 ? 'ta' : 'tr';
        return [
            { id: 'gra' as CommentCategoryId, label: 'GRA' },
            { id: 'lr' as CommentCategoryId, label: 'LR' },
            { id: 'cc' as CommentCategoryId, label: 'CC' },
            {
                id: taskSpecificCategoryId as CommentCategoryId,
                label: COMMENT_CATEGORIES[taskSpecificCategoryId].label,
            },
        ];
    }, [taskNumber]);

    return (
        <div className="quick-comments-wrapper" id="quick-comments-wrapper">
            <button
                ref={fabRef}
                className="quick-comments-fab"
                onClick={handleFabClick}
                title="Quick Comments"
                id="quick-comments-fab"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="quick-comments-fab-label">Quick Comments</span>
            </button>

            {showTooltip && (
                <div className="quick-comments-tooltip" id="quick-comments-tooltip">
                    Select text first, then use Quick Comments
                </div>
            )}

            {isOpen && (
                <div ref={dialogRef} className="quick-comments-dialog" id="quick-comments-dialog">
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
                                    {group.presets.map((preset) => (
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
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void onDeletePreset(preset.id);
                                                    }}
                                                    title="Remove preset"
                                                >
                                                    x
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="quick-comments-add" id="quick-comments-add-section">
                            <div className="quick-comments-add-row">
                                <input
                                    className="quick-comments-add-input"
                                    type="text"
                                    value={newPresetText}
                                    onChange={(event) => setNewPresetText(event.target.value)}
                                    onKeyDown={(event) => event.key === 'Enter' && handleAddPreset()}
                                    placeholder="New preset text..."
                                    id="quick-comments-add-input"
                                />
                                <select
                                    className="quick-comments-add-category"
                                    value={newPresetCategory}
                                    onChange={(event) => setNewPresetCategory(event.target.value as CommentCategoryId)}
                                    id="quick-comments-add-category"
                                >
                                    {categoryOptions.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                                <button
                                    className="quick-comments-add-btn"
                                    onClick={handleAddPreset}
                                    disabled={!newPresetText.trim()}
                                    id="quick-comments-add-btn"
                                >
                                    Add
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
