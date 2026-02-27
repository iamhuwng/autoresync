/**
 * THCSQuestionBlock — Individual question editor (PRD-0027 Task 4.4)
 */
import React, { useRef, useState } from 'react';
import { TextInput, Textarea, Select, NumberInput, ActionIcon, Tooltip, Collapse } from '@mantine/core';
import type { THCSQuestion, MCQIntent, THCSQuestionType } from '../../types/thcs-test.types';
import { INSTRUCTION_TEMPLATES } from '../../types/thcs-test.types';
import THCSPronunciationOptions from './THCSPronunciationOptions';
import THCSErrorIdentification from './THCSErrorIdentification';
import THCSFillInBlock from './THCSFillInBlock';
import THCSWritingBlock from './THCSWritingBlock';
import THCSClozeWordBankBlock from './THCSClozeWordBankBlock';
import r2StorageService from '../../services/r2Storage';

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
    onUpdate, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showExplanation, setShowExplanation] = useState(!!question.explanation?.text);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const isFillIn = question.type === 'verb-form' || question.type === 'word-form';
    const isWriting = question.type === 'sentence-rewrite' || question.type === 'sentence-rewrite-keyword';
    const isCloze = question.type === 'reading-cloze-wordbank';
    const isPronunciation = question.intent === 'pronunciation' || question.intent === 'word-stress';
    const isErrorId = question.intent === 'error-identification';

    const handleTypeChange = (newType: THCSQuestionType) => {
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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Reset file input so re-selecting same file triggers onChange again
        e.target.value = '';

        // Validate size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            setUploadError('File too large — max 5MB');
            return;
        }
        setUploadError(null);
        setUploading(true);
        try {
            // Upload to R2 temp/images/ folder — will be moved to permanent on publish
            const result = await r2StorageService.uploadImage(file, 'images');
            onUpdate({ ...question, imageUrl: result.url, _imageKey: result.key } as any);
        } catch (err) {
            console.error('R2 image upload failed:', err);
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{
            background: 'rgba(255,255,255,0.6)',
            borderRadius: '0.75rem',
            border: '1px solid rgba(139,92,246,0.1)',
            padding: '1rem',
            position: 'relative',
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

                <Select
                    data={QUESTION_TYPE_OPTIONS}
                    value={question.type}
                    onChange={(val) => val && handleTypeChange(val as THCSQuestionType)}
                    size="xs"
                    style={{ flex: 1, maxWidth: 240 }}
                    placeholder="Select type"
                    searchable
                />

                <div style={{ flex: 1 }} />

                <Tooltip label="Move up (Alt+↑)">
                    <ActionIcon variant="subtle" size="xs" disabled={!canMoveUp} onClick={onMoveUp} style={{ opacity: 0.5 }}>↑</ActionIcon>
                </Tooltip>
                <Tooltip label="Move down (Alt+↓)">
                    <ActionIcon variant="subtle" size="xs" disabled={!canMoveDown} onClick={onMoveDown} style={{ opacity: 0.5 }}>↓</ActionIcon>
                </Tooltip>
                <Tooltip label="Delete question">
                    <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>✕</ActionIcon>
                </Tooltip>
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
                    <Textarea
                        label="Question"
                        placeholder="Enter question text..."
                        value={question.questionText}
                        onChange={(e) => onUpdate({ ...question, questionText: e.target.value })}
                        minRows={2}
                        autosize
                        size="sm"
                        mb="sm"
                    />

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
                                        onChange={() => onUpdate({ ...question, correctAnswer: label })}
                                        style={{ accentColor: '#8b5cf6', width: 16, height: 16 }}
                                    />
                                    <span style={{
                                        fontWeight: 700, fontSize: '0.8125rem',
                                        color: question.correctAnswer === label ? '#8b5cf6' : '#64748b',
                                        minWidth: 20,
                                    }}>
                                        {label}.
                                    </span>
                                    <TextInput
                                        placeholder={`Option ${label}`}
                                        value={question.options[i]}
                                        onChange={(e) => {
                                            const newOpts = [...question.options] as [string, string, string, string];
                                            newOpts[i] = e.target.value;
                                            onUpdate({ ...question, options: newOpts });
                                        }}
                                        style={{ flex: 1 }}
                                        size="xs"
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Image upload */}
            <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        hidden
                        onChange={handleImageUpload}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        style={{
                            padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 600,
                            border: '1px solid rgba(139,92,246,0.2)', borderRadius: '0.375rem',
                            background: 'transparent', color: '#8b5cf6', cursor: 'pointer',
                        }}
                    >
                        {uploading ? '⏳ Uploading...' : '🖼️ Add Image'}
                    </button>
                    {question.imageUrl && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <img src={question.imageUrl} alt="" style={{ maxWidth: 120, maxHeight: 80, borderRadius: '0.375rem' }} />
                            <ActionIcon
                                variant="subtle"
                                color="red"
                                size="xs"
                                onClick={() => onUpdate({ ...question, imageUrl: undefined, _imageKey: undefined } as any)}
                            >
                                ×
                            </ActionIcon>
                        </div>
                    )}
                </div>
                {uploadError && (
                    <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>{uploadError}</p>
                )}
            </div>

            {/* Manual points */}
            {sectionPointMode === 'manual' && (
                <NumberInput
                    label="Points"
                    value={question.points || 0}
                    onChange={(val) => onUpdate({ ...question, points: typeof val === 'number' ? val : 0 })}
                    step={0.25}
                    min={0}
                    size="xs"
                    mt="xs"
                    style={{ maxWidth: 100 }}
                />
            )}

            {/* Explanation */}
            <div style={{ marginTop: '0.5rem' }}>
                <button
                    onClick={() => setShowExplanation(!showExplanation)}
                    style={{
                        border: 'none', background: 'transparent', fontSize: '0.75rem',
                        color: '#8b5cf6', cursor: 'pointer', fontWeight: 600,
                    }}
                >
                    {showExplanation ? '− Hide Explanation' : '+ Add Explanation'}
                </button>
                <Collapse in={showExplanation}>
                    <Textarea
                        label="Why is this answer correct?"
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
                        size="xs"
                        minRows={2}
                        autosize
                        mt={4}
                    />
                </Collapse>
            </div>
        </div>
    );
};

export default THCSQuestionBlock;
