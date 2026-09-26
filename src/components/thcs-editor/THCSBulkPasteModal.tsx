/**
 * THCSBulkPasteModal — Phase 3, Task 8.2
 *
 * Modal for pasting multiple questions from text.
 * Parses MCQ or Fill-in format text and adds questions to a section.
 * ⚠️ Rule 8: Must be integrated into THCSSectionBlock.tsx via [📋 Paste Questions] button.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { IconClipboard, IconAlertCircle } from '@tabler/icons-react';
import { Button } from '../modern';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { parseQuestionText } from '../../utils/thcsQuestionParser';
import type { ParsedQuestion } from '../../utils/thcsQuestionParser';
import './THCSNestedDialog.css';

interface THCSBulkPasteModalProps {
    opened: boolean;
    onClose: () => void;
    onImport: (questions: ParsedQuestion[]) => void;
    sectionName: string;
}

export function THCSBulkPasteModal({ opened, onClose, onImport, sectionName }: THCSBulkPasteModalProps) {
    const [text, setText] = useState('');
    const [format, setFormat] = useState<'mcq' | 'fill-in'>('mcq');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (opened && !dialog.open) dialog.showModal();
        if (!opened && dialog.open) dialog.close();
    }, [opened]);

    const parseResult = useMemo(() => {
        if (!text.trim()) return { questions: [], errors: [] };
        return parseQuestionText(text, format);
    }, [text, format]);

    const handleImport = () => {
        if (parseResult.questions.length === 0) return;
        trackAction('bulkPasteQuestions', { count: parseResult.questions.length, format });
        onImport(parseResult.questions);
        setText('');
        onClose();
    };

    const handleClose = () => {
        setText('');
        onClose();
    };

    return (
        <dialog
            ref={dialogRef}
            onClose={handleClose}
            onCancel={(event) => { event.preventDefault(); handleClose(); }}
            aria-label={`Paste Questions — ${sectionName}`}
            className="thcs-nested-dialog thcs-nested-dialog--large"
        >
            <h2 className="thcs-nested-dialog__title">
                <IconClipboard size={20} aria-hidden="true" /> Paste Questions — {sectionName}
            </h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Format
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#64748b' }}>Choose the format that matches your pasted text</span>
                    <select
                        value={format}
                        onChange={(event) => setFormat(event.currentTarget.value as 'mcq' | 'fill-in')}
                        style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                    >
                        <option value="mcq">MCQ (1 per line, with A/B/C/D options)</option>
                        <option value="fill-in">Fill-in-the-blank (with ___ markers)</option>
                    </select>
                </label>

                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Paste your questions here
                    <textarea
                        placeholder={
                            format === 'mcq'
                                ? 'Câu 1: What is the capital of France?\nA. London\nB. Paris\nC. Berlin\nD. Madrid\nĐáp án: B\n\nCâu 2: ...'
                                : 'The capital of France is ___.\nAnswer: Paris\n\nShe ___ to school every day.\nAnswer: goes'
                        }
                        value={text}
                        onChange={(e) => setText(e.currentTarget.value)}
                        rows={10}
                        style={{ minHeight: '8rem', maxHeight: '18rem', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontFamily: 'monospace', fontSize: '0.8125rem', resize: 'vertical' }}
                    />
                </label>

                {/* Live preview */}
                {text.trim() && (
                    <div style={{
                        padding: '0.625rem 0.75rem',
                        background: parseResult.questions.length > 0 ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                        borderRadius: '0.5rem',
                        border: `1px solid ${parseResult.questions.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
                    }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                            <span>
                                {parseResult.questions.length} question{parseResult.questions.length !== 1 ? 's' : ''} detected
                            </span>
                            {parseResult.errors.length > 0 && (
                                <span style={{ color: '#92400e' }}>
                                    {parseResult.errors.length} warning{parseResult.errors.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Parse errors */}
                {parseResult.errors.length > 0 && (
                    <div role="status" style={{ padding: '0.75rem', border: '1px solid #fcd34d', borderRadius: '0.5rem', background: '#fffbeb', color: '#92400e' }}>
                        <strong style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', fontSize: '0.875rem' }}><IconAlertCircle size={16} /> Parse Warnings</strong>
                        <div style={{ display: 'grid', gap: '0.125rem', marginTop: '0.375rem' }}>
                            {parseResult.errors.slice(0, 5).map((err, i) => (
                                <span key={i} style={{ fontSize: '0.75rem' }}>
                                    Line {err.line}: {err.message}
                                </span>
                            ))}
                            {parseResult.errors.length > 5 && (
                                <span style={{ fontSize: '0.75rem' }}>...and {parseResult.errors.length - 5} more</span>
                            )}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <Button variant="glass" onClick={handleClose}>Cancel</Button>
                    <Button
                        variant="primary"
                        disabled={parseResult.questions.length === 0}
                        onClick={handleImport}
                        leftSection={<IconClipboard size={16} />}
                    >
                        Import {parseResult.questions.length} Question{parseResult.questions.length !== 1 ? 's' : ''} →
                    </Button>
                </div>
            </div>
        </dialog>
    );
}

export default THCSBulkPasteModal;
