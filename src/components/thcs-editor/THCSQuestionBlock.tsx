/**
 * THCSQuestionBlock — Individual question editor (PRD-0027 Task 4.4)
 * Supports image upload via file picker AND clipboard paste (Ctrl+V / button)
 */
import React, { useRef, useState, useCallback } from 'react';
import type { THCSQuestion, MCQIntent, THCSQuestionType } from '../../types/thcs-test.types';
import { INSTRUCTION_TEMPLATES } from '../../types/thcs-test.types';
import THCSPronunciationOptions from './THCSPronunciationOptions';
import THCSErrorIdentification from './THCSErrorIdentification';
import THCSFillInBlock from './THCSFillInBlock';
import THCSWritingBlock from './THCSWritingBlock';
import THCSClozeWordBankBlock from './THCSClozeWordBankBlock';
import r2StorageService from '../../services/r2Storage';
import { useClipboard } from '../../core/platform/hooks/useClipboard';

interface THCSQuestionBlockProps {
    question: THCSQuestion;
    questionIndex: number;
    globalNumber: number;
    sectionPointMode: 'auto' | 'manual';
    draftId: string | null;
    onUpdate: (question: THCSQuestion) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onTrackAction?: (actionName: string, metadata?: Record<string, unknown>) => void;
}

const QUESTION_TYPE_OPTIONS = [
    {
        group: 'MCQ',
        items: [
            { value: 'pronunciation', label: 'Pronunciation' },
            { value: 'word-stress', label: 'Word Stress' },
            { value: 'mcq-grammar', label: 'Grammar MCQ' },
            { value: 'mcq-vocabulary', label: 'Vocabulary MCQ' },
            { value: 'mcq-sign-notice', label: 'Sign/Notice MCQ' },
            { value: 'dialogue-response', label: 'Dialogue Response' },
            { value: 'reading-cloze-mcq', label: 'Reading Cloze' },
            { value: 'reading-comprehension', label: 'Reading Comprehension' },
            { value: 'reading-announcement', label: 'Reading Announcement' },
            { value: 'sentence-arrangement', label: 'Sentence Arrangement' },
            { value: 'closest-meaning', label: 'Closest Meaning' },
            { value: 'error-identification', label: 'Error Identification' },
            { value: 'synonym-mcq', label: 'Synonym' },
            { value: 'antonym-mcq', label: 'Antonym' },
            { value: 'word-reference', label: 'Word Reference' },
        ],
    },
    {
        group: 'Fill-in',
        items: [
            { value: 'verb-form', label: 'Verb Form (Fill-in)' },
            { value: 'word-form', label: 'Word Form (Fill-in)' },
        ],
    },
    {
        group: 'Writing',
        items: [
            { value: 'sentence-rewrite', label: 'Sentence Rewrite (Given Start)' },
            { value: 'sentence-rewrite-keyword', label: 'Sentence Rewrite (Keyword)' },
        ],
    },
    {
        group: 'Cloze',
        items: [
            { value: 'reading-cloze-wordbank', label: 'Cloze Word Bank' },
        ],
    },
];

const LABELS = ['A', 'B', 'C', 'D'] as const;

const THCSQuestionBlock: React.FC<THCSQuestionBlockProps> = ({
    question, questionIndex: _questionIndex, globalNumber, sectionPointMode,
    onUpdate, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onTrackAction,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { availableImage, refreshImage } = useClipboard({ watchImages: true });
    const [showExplanation, setShowExplanation] = useState(!!question.explanation?.text);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [pasteHover, setPasteHover] = useState(false);

    const isFillIn = question.type === 'verb-form' || question.type === 'word-form';
    const isWriting = question.type === 'sentence-rewrite' || question.type === 'sentence-rewrite-keyword';
    const isCloze = question.type === 'reading-cloze-wordbank';
    const isPronunciation = question.intent === 'pronunciation' || question.intent === 'word-stress';
    const isErrorId = question.intent === 'error-identification';
    const supportsVisualText = question.type === 'mcq-sign-notice' || question.intent === 'mcq-sign-notice'
        || question.type === 'reading-announcement' || question.intent === 'reading-announcement';

    const handleTypeChange = (newType: THCSQuestionType) => {
        onTrackAction?.('thcsQuestionTypeChanged', { questionNumber: globalNumber, type: newType });
        const isMCQNow = newType in INSTRUCTION_TEMPLATES;

        let updates: Partial<THCSQuestion> = { type: newType };

        if (isMCQNow) {
            // New type is MCQ — set intent, clear Phase 2 fields
            updates.intent = newType as MCQIntent;
            updates.sentenceTemplate = undefined;
            updates.blankAnswers = undefined;
            updates.originalSentence = undefined;
            updates.sentenceStarter = undefined;
            updates.keyword = undefined;
            updates.modelAnswers = undefined;
            updates.passageTemplate = undefined;
            updates.wordBank = undefined;
            updates.blankMapping = undefined;
            updates.allowWordReuse = undefined;
            updates.autoGradeWriting = undefined;
        } else {
            // New type is Phase 2 — clear MCQ fields, unset intent
            updates.intent = undefined;
            updates.options = ['', '', '', ''];
            updates.correctAnswer = '' as any;
            updates.optionUnderlines = undefined;
            updates.underlinedParts = undefined;
        }

        onUpdate({ ...question, ...updates } as THCSQuestion);
    };

    // Shared image processing — used by both file picker and clipboard paste
    const processImageFile = useCallback(async (file: File) => {
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!ALLOWED_TYPES.includes(file.type)) {
            setUploadError('Unsupported format — use JPEG, PNG, WebP, or GIF');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setUploadError('File too large — max 5MB');
            return;
        }
        setUploadError(null);
        setUploading(true);
        try {
            const result = await r2StorageService.uploadImageReplacement(file, question.imageUrl, 'images');
            onUpdate({ ...question, imageUrl: result.url, _imageKey: result.key } as any);
        } catch (err) {
            console.error('R2 image upload failed:', err);
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    }, [question, onUpdate]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        processImageFile(file);
    };

    // Clipboard paste handler — reads image from clipboard
    const handleClipboardPaste = useCallback(async () => {
        if (uploading) return;
        onTrackAction?.('thcsQuestionImagePasteRequested', { questionNumber: globalNumber });
        const file = await refreshImage();
        if (!file) {
            setUploadError('No image found or clipboard access was blocked — focus this card and press Ctrl+V');
            return;
        }
        await processImageFile(file);
    }, [globalNumber, onTrackAction, processImageFile, refreshImage, uploading]);

    const handlePasteEvent = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
        if (question.imageUrl || uploading) return;
        const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'))?.getAsFile();
        if (!image) return;
        event.preventDefault();
        event.stopPropagation();
        onTrackAction?.('thcsQuestionImagePasteRequested', { questionNumber: globalNumber });
        void processImageFile(image);
    }, [globalNumber, onTrackAction, processImageFile, question.imageUrl, uploading]);

    return (
        <div onPaste={handlePasteEvent} style={{
            background: 'rgba(255,255,255,0.6)',
            borderRadius: '0.75rem',
            border: '1px solid rgba(139,92,246,0.1)',
            padding: '1rem',
            position: 'relative',
            outline: 'none',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{
                    fontWeight: 700, fontSize: '0.875rem', color: '#8b5cf6',
                    background: 'rgba(139,92,246,0.1)', padding: '0.125rem 0.5rem',
                    borderRadius: '0.375rem', minWidth: 40, textAlign: 'center',
                }}>
                    Q{globalNumber}
                </span>

                <select
                    aria-label="Question type"
                    value={question.type}
                    onChange={(event) => handleTypeChange(event.target.value as THCSQuestionType)}
                    style={{ flex: 1, maxWidth: 240, padding: '0.35rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', background: '#fff' }}
                >
                    {QUESTION_TYPE_OPTIONS.map((group) => (
                        <optgroup key={group.group} label={group.group}>
                            {group.items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </optgroup>
                    ))}
                </select>

                <div style={{ flex: 1 }} />

                <button type="button" title="Move up (Alt+↑)" aria-label="Move question up" disabled={!canMoveUp} onClick={() => { onTrackAction?.('thcsQuestionMoved', { questionNumber: globalNumber, direction: 'up' }); onMoveUp(); }} style={{ opacity: 0.5, border: 0, background: 'transparent' }}>↑</button>
                <button type="button" title="Move down (Alt+↓)" aria-label="Move question down" disabled={!canMoveDown} onClick={() => { onTrackAction?.('thcsQuestionMoved', { questionNumber: globalNumber, direction: 'down' }); onMoveDown(); }} style={{ opacity: 0.5, border: 0, background: 'transparent' }}>↓</button>
                <button type="button" title="Delete question" aria-label="Delete question" onClick={() => { onTrackAction?.('thcsQuestionDeleted', { questionNumber: globalNumber }); onDelete(); }} style={{ border: 0, background: 'transparent', color: '#ef4444' }}>✕</button>
            </div>

            {/* Question content — varies by type */}
            {isFillIn ? (
                <THCSFillInBlock question={question} onUpdate={onUpdate} />
            ) : isWriting ? (
                <THCSWritingBlock question={question} onUpdate={onUpdate} />
            ) : isCloze ? (
                <THCSClozeWordBankBlock question={question} onUpdate={onUpdate} />
            ) : isErrorId ? (
                <THCSErrorIdentification
                    questionText={question.questionText}
                    underlinedParts={question.underlinedParts || ''}
                    correctAnswer={question.correctAnswer}
                    onUpdate={(updates) => onUpdate({ ...question, ...updates } as THCSQuestion)}
                />
            ) : (
                <>
                    {/* Standard question text */}
                    <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                        <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8125rem', fontWeight: 600 }}>Question</span>
                        <textarea
                            placeholder="Enter question text..."
                            value={question.questionText}
                            onChange={(e) => onUpdate({ ...question, questionText: e.target.value })}
                            onBlur={() => onTrackAction?.('thcsQuestionTextUpdated', { questionNumber: globalNumber })}
                            rows={2}
                            style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', font: 'inherit' }}
                        />
                    </label>

                    {/* Options */}
                    {isPronunciation ? (
                        <THCSPronunciationOptions
                            options={question.options}
                            optionUnderlines={question.optionUnderlines || ['', '', '', '']}
                            correctAnswer={question.correctAnswer}
                            onUpdate={(updates) => onUpdate({
                                ...question,
                                ...(updates.options && { options: updates.options }),
                                ...(updates.optionUnderlines && { optionUnderlines: updates.optionUnderlines }),
                                ...(updates.correctAnswer !== undefined && { correctAnswer: updates.correctAnswer }),
                            } as THCSQuestion)}
                        />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            {LABELS.map((label, i) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="radio"
                                        name={`correct-${question.id}`}
                                        checked={question.correctAnswer === label}
                                        onChange={() => {
                                            onTrackAction?.('thcsQuestionAnswerChanged', { questionNumber: globalNumber });
                                            onUpdate({ ...question, correctAnswer: label });
                                        }}
                                        style={{ accentColor: '#8b5cf6', width: 16, height: 16 }}
                                    />
                                    <span style={{
                                        fontWeight: 700, fontSize: '0.8125rem',
                                        color: question.correctAnswer === label ? '#8b5cf6' : '#64748b',
                                        minWidth: 20,
                                    }}>
                                        {label}.
                                    </span>
                                    <input
                                        aria-label={`Option ${label}`}
                                        placeholder={`Option ${label}`}
                                        value={question.options[i]}
                                        onChange={(e) => {
                                            const newOpts = [...question.options] as [string, string, string, string];
                                            newOpts[i] = e.target.value;
                                            onUpdate({ ...question, options: newOpts });
                                        }}
                                        onBlur={() => onTrackAction?.('thcsQuestionOptionUpdated', { questionNumber: globalNumber, option: label })}
                                        style={{ flex: 1, minWidth: 0, padding: '0.35rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', font: 'inherit', fontSize: '0.75rem' }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Image upload + clipboard paste */}
            <div style={{ marginTop: '0.5rem' }}>
                {question.imageUrl ? (
                    /* ── Image preview (already uploaded) ── */
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.5rem', background: 'rgba(139,92,246,0.04)',
                        borderRadius: '0.5rem', border: '1px solid rgba(139,92,246,0.1)',
                    }}>
                        <img src={question.imageUrl} alt="" style={{
                            maxWidth: 120, maxHeight: 80, borderRadius: '0.375rem',
                            objectFit: 'cover',
                        }} />
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    onTrackAction?.('thcsQuestionImageUploadRequested', { questionNumber: globalNumber });
                                    fileInputRef.current?.click();
                                }}
                                style={{
                                    padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 600,
                                    border: '1px solid rgba(139,92,246,0.2)', borderRadius: '0.25rem',
                                    background: 'transparent', color: '#8b5cf6', cursor: 'pointer',
                                }}
                            >
                                🔄 Replace
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onTrackAction?.('thcsQuestionImageRemoved', { questionNumber: globalNumber });
                                    onUpdate({ ...question, imageUrl: undefined, _imageKey: undefined } as any);
                                }}
                                style={{
                                    padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 600,
                                    border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.25rem',
                                    background: 'transparent', color: '#ef4444', cursor: 'pointer',
                                }}
                            >
                                ✕ Remove
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── Empty state: buttons + paste zone ── */
                    <div
                        onPointerEnter={() => { void refreshImage(); }}
                        onDragOver={(e) => { e.preventDefault(); setPasteHover(true); }}
                        onDragLeave={() => setPasteHover(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setPasteHover(false);
                            const file = e.dataTransfer.files[0];
                            if (file?.type.startsWith('image/')) {
                                onTrackAction?.('thcsQuestionImageDropRequested', { questionNumber: globalNumber });
                                processImageFile(file);
                            }
                        }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.5rem',
                            border: pasteHover
                                ? '2px dashed #8b5cf6'
                                : '1.5px dashed rgba(139,92,246,0.15)',
                            background: pasteHover
                                ? 'rgba(139,92,246,0.06)'
                                : 'transparent',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                onTrackAction?.('thcsQuestionImageUploadRequested', { questionNumber: globalNumber });
                                fileInputRef.current?.click();
                            }}
                            disabled={uploading}
                            style={{
                                padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 600,
                                border: '1px solid rgba(139,92,246,0.2)', borderRadius: '0.375rem',
                                background: 'transparent', color: '#8b5cf6', cursor: 'pointer',
                                opacity: uploading ? 0.5 : 1,
                            }}
                        >
                            🖼️ Add Image
                        </button>
                        {availableImage && (
                            <button
                                type="button"
                                onClick={handleClipboardPaste}
                                disabled={uploading}
                                style={{
                                    padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 600,
                                    border: '1px solid rgba(34,197,94,0.2)', borderRadius: '0.375rem',
                                    background: 'transparent', color: '#16a34a', cursor: 'pointer',
                                    opacity: uploading ? 0.5 : 1,
                                }}
                            >
                                📋 Paste screenshot
                            </button>
                        )}
                        {uploading && (
                            <span style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 500 }}>
                                ⏳ Uploading...
                            </span>
                        )}
                        <span style={{
                            fontSize: '0.65rem', color: '#94a3b8', marginLeft: 'auto', fontStyle: 'italic',
                        }}>
                            or Ctrl+V / drag & drop
                        </span>
                    </div>
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    hidden
                    onChange={handleImageUpload}
                />
                {uploadError && (
                    <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>{uploadError}</p>
                )}
            </div>

            {supportsVisualText && (
                <label style={{ display: 'block', marginTop: '0.75rem' }}>
                    <span style={{ display: 'block', marginBottom: '0.25rem', color: '#334155', fontSize: '0.75rem', fontWeight: 600 }}>
                        {question.imageUrl ? 'Image description (optional)' : 'Visual text alternative (instead of an image)'}
                    </span>
                    <textarea
                        aria-label="Visual text alternative"
                        value={question.imageCaption || ''}
                        onChange={(event) => onUpdate({ ...question, imageCaption: event.target.value })}
                        onBlur={() => {
                            if (question.imageCaption?.trim()) {
                                onTrackAction?.('thcsQuestionVisualTextUpdated', { questionNumber: globalNumber });
                            }
                        }}
                        placeholder="Type the sign, notice, or poster text students need to read..."
                        rows={3}
                        style={{
                            width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: '0.5rem 0.625rem',
                            border: '1px solid #cbd5e1', borderRadius: '0.375rem', color: '#1e293b', font: 'inherit', fontSize: '0.8125rem',
                        }}
                    />
                </label>
            )}

            {/* Manual points */}
            {sectionPointMode === 'manual' && (
                <label style={{ display: 'block', maxWidth: 100, marginTop: '0.75rem' }}>
                    <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>Points</span>
                    <input
                        type="number"
                        value={question.points || 0}
                        onChange={(event) => onUpdate({ ...question, points: Number(event.target.value) || 0 })}
                        onBlur={() => onTrackAction?.('thcsQuestionPointsUpdated', { questionNumber: globalNumber })}
                        step={0.25}
                        min={0}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '0.35rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem' }}
                    />
                </label>
            )}

            {/* Explanation */}
            <div style={{ marginTop: '0.5rem' }}>
                <button
                    type="button"
                    onClick={() => {
                        onTrackAction?.('thcsQuestionExplanationToggled', { questionNumber: globalNumber, open: !showExplanation });
                        setShowExplanation(!showExplanation);
                    }}
                    style={{
                        border: 'none', background: 'transparent', fontSize: '0.75rem',
                        color: '#8b5cf6', cursor: 'pointer', fontWeight: 600,
                    }}
                >
                    {showExplanation ? '− Hide Explanation' : '+ Add Explanation'}
                </button>
                {showExplanation && (
                    <label style={{ display: 'block', marginTop: '0.25rem' }}>
                        <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>Why is this answer correct?</span>
                        <textarea
                            placeholder="Optional explanation for students..."
                            value={question.explanation?.text || ''}
                            onChange={(e) => onUpdate({
                                ...question,
                                explanation: {
                                    text: e.target.value,
                                    source: 'teacher',
                                    approvedByTeacher: true,
                                },
                            })}
                            onBlur={() => onTrackAction?.('thcsQuestionExplanationUpdated', { questionNumber: globalNumber })}
                            rows={2}
                            style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', font: 'inherit', fontSize: '0.75rem' }}
                        />
                    </label>
                )}
            </div>
        </div>
    );
};

export default THCSQuestionBlock;
