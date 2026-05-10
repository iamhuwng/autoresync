/**
 * ParseReviewPanel Component (v3.0)
 * 
 * Enhanced full preview and editing panel for parsed IELTS Reading tests.
 * Implements all PRD-0020 requirements for the review phase.
 * 
 * Major Features:
 * ────────────────────────────────────────────────────────────────────────────
 * 
 * 1. THREE-COLUMN LAYOUT:
 *    - Left: Reading Passage with paragraph markers
 *    - Center: Question Groups organized by section instruction
 *    - Right: Quick Actions (Type selector, AI vs Rules, Image upload)
 * 
 * 2. QUESTION TYPE-SPECIFIC RENDERING:
 *    - Completion: Inline input previews with word limits
 *    - T/F/NG & Y/N/NG: Radio button preview
 *    - Matching: Dropdown/chip selector preview
 *    - Multiple Choice: Option list preview
 *    - Diagram: Image upload placeholder
 * 
 * 3. SECTION INSTRUCTION GROUPS:
 *    - Questions grouped by their section instruction
 *    - Editable section instruction with word limit extraction
 *    - "Allow reuse" toggle for matching questions
 * 
 * 4. AI VS RULES COMPARISON:
 *    - Quick indicator showing if AI and Rules agree
 *    - One-click comparison modal access
 *    - Quick accept buttons for suggestions
 * 
 * 5. DIAGRAM/IMAGE UPLOAD:
 *    - Visual placeholder for diagram questions
 *    - Direct image upload interface
 *    - Preview of uploaded images
 * 
 * @module ParseReviewPanel
 * @version 3.0.0
 * @date 2026-02-06
 * @see PRD-0020 Section 4.5 Review & Editing
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, Button } from '../modern';
import {
    Button as MantineButton,
    TextInput,
    Textarea,
    Select,
    Tooltip,
    Badge,
    ActionIcon,
    Tabs,
    Group,
    Stack,
    Switch,
    FileButton,
    Image,
    Radio,
    Chip,
    NumberInput,
    Text,
    ScrollArea,
    Paper,
    ThemeIcon,
    Box,
    Alert,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconEdit,
    IconTrash,
    IconPlus,
    IconBrain,
    IconListCheck,
    IconArrowRight,
    IconPhoto,
    IconUpload,
    IconEye,
    IconRefresh,
    IconInfoCircle,
    IconFileText,
    IconClipboardText,
} from '@tabler/icons-react';
import type { QuestionType } from '../../types/QuestionSchema';
import type {
    ReadingLabeledOption,
    ReadingOptionLabelFormat,
    ReadingSectionReference,
} from '../../types/document.types';
import {
    canonicalizeReadingQuestion,
    createDefaultReadingSectionReferences,
    createDefaultReadingOptions,
    formatReadingOption,
    formatReadingSectionReference,
    isCanonicalReadingOptionType,
    isMatchingInformationType,
} from '../../utils/readingQuestionContract';
import type {
    GroupAcknowledgementsField,
    QuestionGroupsField,
    TableCompletionDiagnosticsField,
} from '../../types/tableCompletion';
import type { TableCompletionIssue } from '../../services/test-creation/tableCompletionValidator';
import {
    TableCompletionGroupReview,
    type TableCompletionReviewAction,
    type UnsupportedRepairAction,
} from '../test/table-completion/TableCompletionGroupReview';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ParsedPassage {
    id: string;
    title: string;
    content: string;
    paragraphs?: { id: string; label: string; content: string }[];
}

export interface SectionInstruction {
    id: string;
    text: string;
    wordLimit?: number;
    allowReuse?: boolean;
    questionRange: { start: number; end: number };
}

export interface ParsedQuestion {
    questionNumber: number;
    questionText: string;
    type: QuestionType;
    options?: Array<ReadingLabeledOption | string> | null;
    sectionReferences?: ReadingSectionReference[] | null;
    optionLabelFormat?: ReadingOptionLabelFormat;
    answer?: string | string[];
    passageId?: string;
    sectionInstructionId?: string;
    confidence: number;
    uncertain: boolean;
    uncertainReason?: string;
    wordLimit?: number;
    // AI vs Rules comparison data
    aiType?: QuestionType;
    rulesType?: QuestionType;
    aiConfidence?: number;
    rulesConfidence?: number;
    // Diagram support
    diagramImage?: string;
    diagramRequired?: boolean;
    // Structured data for complex types
    tableData?: { headers: string[]; rows: (string | null)[][] };
    flowchartData?: { steps: { label: string; content: string; hasBlank: boolean }[] };
    groupId?: string;
    blankId?: string;
    anchorId?: string;
    groupTaskType?: 'table-completion';
    tableGroupSchemaVersion?: number;
    pendingTableReclassification?: boolean;
}

const getOptionValue = (option: ReadingLabeledOption, index: number): string =>
    option.label || String.fromCharCode(65 + index);

const getDisplayOptions = (question: ParsedQuestion): ReadingLabeledOption[] => {
    if (!question.options || question.options.length === 0) {
        return [];
    }

    return canonicalizeReadingQuestion({
        questionNumber: question.questionNumber,
        type: question.type,
        questionText: question.questionText,
        options: question.options,
        optionLabelFormat: question.optionLabelFormat,
    }).labeledOptions || [];
};

const getSectionReferences = (question: ParsedQuestion): ReadingSectionReference[] =>
    canonicalizeReadingQuestion({
        questionNumber: question.questionNumber,
        type: question.type,
        questionText: question.questionText,
        options: question.options,
        optionLabelFormat: question.optionLabelFormat,
        sectionReferences: question.sectionReferences,
    }).sectionReferences || [];

export interface ParseReviewPanelProps {
    /** Parsed passages */
    passages: ParsedPassage[];
    /** Parsed questions */
    questions: ParsedQuestion[];
    /** Section instructions extracted from parsing */
    sectionInstructions?: SectionInstruction[];
    /** Canonical grouped question state */
    questionGroups?: QuestionGroupsField;
    /** Draft-only acknowledgement state for grouped warnings */
    groupAcknowledgements?: GroupAcknowledgementsField;
    /** Current grouped-table validation issues */
    tableCompletionIssues?: TableCompletionIssue[];
    /** Current grouped-table diagnostics, including unresolved runs */
    tableCompletionDiagnostics?: TableCompletionDiagnosticsField;
    /** Callback when passage is edited */
    onPassageChange: (passageId: string, updates: Partial<ParsedPassage>) => void;
    /** Callback when question is edited */
    onQuestionChange: (questionNumber: number, updates: Partial<ParsedQuestion>) => void;
    /** Callback when section instruction is edited */
    onSectionInstructionChange?: (instructionId: string, updates: Partial<SectionInstruction>) => void;
    /** Callback when question is deleted */
    onQuestionDelete?: (questionNumber: number) => void;
    /** Callback when a new question is added (with optional passageId for the current passage) */
    onQuestionAdd?: (passageId?: string) => void;
    /** Callback to open comparison modal */
    onOpenComparison?: (questionNumber: number) => void;
    /** Callback when diagram image is uploaded */
    onDiagramUpload?: (questionNumber: number, file: File) => void;
    /** ID of currently highlighted question (from sidebar) */
    highlightedQuestion?: number;
    /** Callback when question is clicked */
    onQuestionClick?: (questionNumber: number) => void;
    /** Callback when a grouped table changes */
    onQuestionGroupChange?: (groupId: string, nextGroup: QuestionGroupsField[number]) => void;
    /** Callback when grouped warnings are acknowledged */
    onGroupAcknowledge?: (groupId: string, issueCodes: string[], canonicalRevisionHash: string) => void;
    /** Callback for unsupported grouped repair actions */
    onUnsupportedRepair?: (groupId: string, action: UnsupportedRepairAction) => void;
    /** Callback for grouped table repair actions */
    onTableGroupReviewAction?: (action: TableCompletionReviewAction, metadata?: Record<string, unknown>) => void;
    /** Content to render in the left sidebar (e.g., UncertainItemsSidebar) */
    leftSidebarContent?: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const QUESTION_TYPES: { value: QuestionType; label: string; category: string }[] = [
    // Judgment types
    { value: 'true-false-not-given', label: 'True/False/Not Given', category: 'Judgment' },
    { value: 'yes-no-not-given', label: 'Yes/No/Not Given', category: 'Judgment' },
    // Matching types
    { value: 'matching-headings', label: 'Matching Headings', category: 'Matching' },
    { value: 'matching-information', label: 'Matching Information', category: 'Matching' },
    { value: 'matching-features', label: 'Matching Features', category: 'Matching' },
    { value: 'matching-sentence-endings', label: 'Matching Sentence Endings', category: 'Matching' },
    // Completion types
    { value: 'sentence-completion', label: 'Sentence Completion', category: 'Completion' },
    { value: 'summary-completion-text', label: 'Summary Completion (Text)', category: 'Completion' },
    { value: 'summary-completion-list', label: 'Summary Completion (List)', category: 'Completion' },
    { value: 'note-completion', label: 'Note Completion', category: 'Completion' },
    { value: 'table-completion', label: 'Table Completion', category: 'Completion' },
    { value: 'flowchart-completion', label: 'Flowchart Completion', category: 'Completion' },
    { value: 'diagram-labeling', label: 'Diagram Labeling', category: 'Completion' },
    // Choice types
    { value: 'multiple-choice', label: 'Multiple Choice', category: 'Choice' },
    { value: 'multiple-select', label: 'Multiple Select', category: 'Choice' },
    // Other
    { value: 'short-answer', label: 'Short Answer', category: 'Other' },
];

// Mantine v8 grouped Select format: { group, items: [...] }
// (v8 treats any item with 'group' as a group container, NOT as a flat item with a group label)
const TYPE_SELECT_DATA = Object.entries(
    QUESTION_TYPES.reduce<Record<string, { value: string; label: string }[]>>((acc, t) => {
        const group = acc[t.category] ?? (acc[t.category] = []);
        group.push({ value: t.value, label: t.label });
        return acc;
    }, {})
).map(([group, items]) => ({ group, items }));

const QUESTION_TYPE_ICONS: Record<string, React.ReactNode> = {
    'Judgment': <IconCheck size={14} />,
    'Matching': <IconArrowRight size={14} />,
    'Completion': <IconClipboardText size={14} />,
    'Choice': <IconListCheck size={14} />,
    'Other': <IconFileText size={14} />,
};

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Section Instruction Header with editing capability
 */
interface SectionInstructionHeaderProps {
    instruction: SectionInstruction;
    onUpdate?: (updates: Partial<SectionInstruction>) => void;
    isEditing: boolean;
    onToggleEdit: () => void;
}

const SectionInstructionHeader: React.FC<SectionInstructionHeaderProps> = ({
    instruction,
    onUpdate,
    isEditing,
    onToggleEdit,
}) => {
    const isMatchingType = instruction.text.toLowerCase().includes('match') ||
        instruction.text.toLowerCase().includes('heading');
    const hasReusableNote = instruction.text.toLowerCase().includes('may use') ||
        instruction.text.toLowerCase().includes('more than once');

    return (
        <Paper
            p="md"
            radius="md"
            style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                marginBottom: '1rem',
            }}
        >
            <Group justify="space-between" align="flex-start" mb="xs">
                <Group gap="xs">
                    <ThemeIcon size="sm" variant="light" color="violet">
                        <IconInfoCircle size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={700} c="violet.7">
                        Questions {instruction.questionRange.start}–{instruction.questionRange.end}
                    </Text>
                </Group>
                <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={onToggleEdit}
                    aria-label={isEditing ? "Save instruction" : "Edit instruction"}
                >
                    {isEditing ? <IconCheck size={14} /> : <IconEdit size={14} />}
                </ActionIcon>
            </Group>

            {isEditing ? (
                <Stack gap="sm">
                    <Textarea
                        value={instruction.text}
                        onChange={(e) => onUpdate?.({ text: e.target.value })}
                        minRows={2}
                        placeholder="Enter section instruction..."
                        styles={{
                            input: {
                                fontSize: '0.875rem',
                                background: 'rgba(255, 255, 255, 0.8)',
                            }
                        }}
                    />
                    <Group gap="md">
                        <NumberInput
                            label="Word Limit"
                            value={instruction.wordLimit}
                            onChange={(val) => onUpdate?.({ wordLimit: val as number })}
                            min={1}
                            max={5}
                            size="xs"
                            w={100}
                        />
                        {isMatchingType && (
                            <Switch
                                label="Allow reusing options"
                                checked={instruction.allowReuse ?? hasReusableNote}
                                onChange={(e) => onUpdate?.({ allowReuse: e.currentTarget.checked })}
                                size="sm"
                            />
                        )}
                    </Group>
                </Stack>
            ) : (
                <>
                    <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
                        {instruction.text}
                    </Text>
                    <Group gap="xs" mt="sm">
                        {instruction.wordLimit && (
                            <Badge size="xs" variant="light" color="blue">
                                Max {instruction.wordLimit} word{instruction.wordLimit > 1 ? 's' : ''}
                            </Badge>
                        )}
                        {isMatchingType && (
                            <Badge
                                size="xs"
                                variant="light"
                                color={instruction.allowReuse || hasReusableNote ? 'green' : 'orange'}
                            >
                                {instruction.allowReuse || hasReusableNote ? 'Letters reusable' : 'Each letter once'}
                            </Badge>
                        )}
                    </Group>
                </>
            )}
        </Paper>
    );
};

/**
 * AI vs Rules Comparison Indicator
 */
interface ComparisonIndicatorProps {
    question: ParsedQuestion;
    onOpenComparison?: () => void;
    onAcceptAI?: () => void;
    onAcceptRules?: () => void;
}

const ComparisonIndicator: React.FC<ComparisonIndicatorProps> = ({
    question,
    onOpenComparison,
    onAcceptAI,
    onAcceptRules,
}) => {
    if (!question.aiType || !question.rulesType) return null;

    const typesMatch = question.aiType === question.rulesType;

    if (typesMatch) {
        return (
            <Tooltip label="AI and Rules agree on question type">
                <Badge size="xs" variant="light" color="green" leftSection={<IconCheck size={10} />}>
                    Types Match
                </Badge>
            </Tooltip>
        );
    }

    return (
        <Paper
            p="xs"
            radius="sm"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
            }}
        >
            <Group gap="xs" justify="space-between">
                <Text size="xs" fw={600} c="yellow.8">
                    Type Mismatch
                </Text>
                <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpenComparison?.(); }}
                    aria-label="View comparison"
                >
                    <IconEye size={12} />
                </ActionIcon>
            </Group>
            <Group gap="xs" mt="xs">
                <Tooltip label={`AI: ${question.aiConfidence}% confidence`}>
                    <Chip
                        size="xs"
                        variant="light"
                        color="violet"
                        onClick={(e) => { e.stopPropagation(); onAcceptAI?.(); }}
                        checked={false}
                    >
                        <Group gap={4}>
                            <IconBrain size={10} />
                            {QUESTION_TYPES.find(t => t.value === question.aiType)?.label?.split(' ')[0]}
                        </Group>
                    </Chip>
                </Tooltip>
                <Tooltip label={`Rules: ${question.rulesConfidence}% confidence`}>
                    <Chip
                        size="xs"
                        variant="light"
                        color="green"
                        onClick={(e) => { e.stopPropagation(); onAcceptRules?.(); }}
                        checked={false}
                    >
                        <Group gap={4}>
                            <IconListCheck size={10} />
                            {QUESTION_TYPES.find(t => t.value === question.rulesType)?.label?.split(' ')[0]}
                        </Group>
                    </Chip>
                </Tooltip>
            </Group>
        </Paper>
    );
};

/**
 * Diagram Image Upload Component
 */
interface DiagramUploaderProps {
    questionNumber: number;
    currentImage?: string;
    onUpload?: (file: File) => void;
}

const DiagramUploader: React.FC<DiagramUploaderProps> = ({
    questionNumber,
    currentImage,
    onUpload,
}) => {
    return (
        <Paper
            p="md"
            radius="md"
            style={{
                background: currentImage
                    ? 'transparent'
                    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(251, 146, 60, 0.05) 100%)',
                border: currentImage
                    ? '1px solid #e2e8f0'
                    : '2px dashed rgba(239, 68, 68, 0.3)',
                textAlign: 'center',
            }}
        >
            {currentImage ? (
                <Stack gap="sm">
                    <Image
                        src={currentImage}
                        alt={`Diagram for question ${questionNumber}`}
                        radius="md"
                        h={200}
                        fit="contain"
                    />
                    <FileButton onChange={(file) => file && onUpload?.(file)} accept="image/*">
                        {(props) => (
                            <Button variant="glass" size="xs" {...props}>
                                <IconRefresh size={14} style={{ marginRight: '0.5rem' }} />
                                Replace Image
                            </Button>
                        )}
                    </FileButton>
                </Stack>
            ) : (
                <Stack gap="sm" align="center">
                    <ThemeIcon size="xl" variant="light" color="orange" radius="xl">
                        <IconPhoto size={24} />
                    </ThemeIcon>
                    <Text size="sm" fw={600} c="orange.7">
                        Diagram Required
                    </Text>
                    <Text size="xs" c="dimmed">
                        Upload an image for this diagram labeling question
                    </Text>
                    <FileButton onChange={(file) => file && onUpload?.(file)} accept="image/*">
                        {(props) => (
                            <Button variant="primary" size="sm" {...props}>
                                <IconUpload size={14} style={{ marginRight: '0.5rem' }} />
                                Upload Diagram
                            </Button>
                        )}
                    </FileButton>
                </Stack>
            )}
        </Paper>
    );
};

/**
 * Type-specific Question Preview
 */
interface QuestionPreviewProps {
    question: ParsedQuestion;
    isPreviewMode?: boolean;
}

const QuestionPreview: React.FC<QuestionPreviewProps> = ({ question, isPreviewMode }) => {
    const { type, questionText, answer } = question;
    const displayOptions = getDisplayOptions(question);

    // Render based on question type
    switch (type) {
        case 'true-false-not-given':
        case 'yes-no-not-given':
            return (
                <Stack gap="xs" onClick={e => e.stopPropagation()}>
                    <Text size="sm" c="gray.7" style={{ lineHeight: 1.6 }}>
                        {questionText}
                    </Text>
                    <Radio.Group value={isPreviewMode ? undefined : (answer as string)} onChange={() => { }}>
                        <Group gap="sm">
                            {type === 'true-false-not-given' ? (
                                <>
                                    <Radio value="TRUE" label="TRUE" size="xs" readOnly />
                                    <Radio value="FALSE" label="FALSE" size="xs" readOnly />
                                    <Radio value="NOT GIVEN" label="NOT GIVEN" size="xs" readOnly />
                                </>
                            ) : (
                                <>
                                    <Radio value="YES" label="YES" size="xs" readOnly />
                                    <Radio value="NO" label="NO" size="xs" readOnly />
                                    <Radio value="NOT GIVEN" label="NOT GIVEN" size="xs" readOnly />
                                </>
                            )}
                        </Group>
                    </Radio.Group>
                </Stack>
            );

        case 'matching-information': {
            const sectionReferences = getSectionReferences(question);
            return (
                <Stack gap="xs" onClick={e => e.stopPropagation()}>
                    <Text size="sm" c="gray.7" style={{ lineHeight: 1.6 }}>
                        {questionText}
                    </Text>
                    {sectionReferences.length > 0 ? (
                        <Chip.Group value={isPreviewMode ? undefined : (answer as string)} onChange={() => { }}>
                            <Group gap="xs" wrap="wrap">
                                {sectionReferences.map((section, i) => (
                                    <Chip
                                        key={i}
                                        value={section.label}
                                        size="xs"
                                        variant="light"
                                        readOnly
                                    >
                                        {formatReadingSectionReference(section)}
                                    </Chip>
                                ))}
                            </Group>
                        </Chip.Group>
                    ) : (
                        <Text size="xs" c="dimmed" fs="italic">No section references available</Text>
                    )}
                </Stack>
            );
        }

        case 'matching-headings':
        case 'matching-features':
        case 'matching-sentence-endings':
            return (
                <Stack gap="xs" onClick={e => e.stopPropagation()}>
                    <Text size="sm" c="gray.7" style={{ lineHeight: 1.6 }}>
                        {questionText}
                    </Text>
                    {displayOptions.length > 0 ? (
                        displayOptions.length <= 8 ? (
                            <Chip.Group value={isPreviewMode ? undefined : (answer as string)} onChange={() => { }}>
                                <Group gap="xs" wrap="wrap">
                                    {displayOptions.map((opt, i) => (
                                        <Chip
                                            key={i}
                                            value={getOptionValue(opt, i)}
                                            size="xs"
                                            variant="light"
                                            readOnly
                                        >
                                            {formatReadingOption(opt)}
                                        </Chip>
                                    ))}
                                </Group>
                            </Chip.Group>
                        ) : (
                            <Select
                                placeholder="Select option"
                                data={displayOptions.map((opt, i) => ({
                                    value: getOptionValue(opt, i),
                                    label: formatReadingOption(opt),
                                })) || []}
                                value={isPreviewMode ? null : (answer as string) || null}
                                onChange={() => { }}
                                size="xs"
                                readOnly
                            />
                        )
                    ) : (
                        <Text size="xs" c="dimmed" fs="italic">No options available</Text>
                    )}
                </Stack>
            );

        case 'sentence-completion':
        case 'summary-completion-text':
        case 'note-completion':
        case 'short-answer': {
            // Render with inline blank placeholder
            const textWithBlanks = questionText.replace(
                /_{2,}|\[___+\]|\(\s*\)/g,
                '______'
            );
            return (
                <Box style={{ fontSize: 'var(--mantine-font-size-sm)', lineHeight: 1.8, color: 'var(--mantine-color-gray-7)' }}>
                    {textWithBlanks.split('______').map((part, i, arr) => (
                        <React.Fragment key={i}>
                            {part}
                            {i < arr.length - 1 && (
                                <TextInput
                                    size="xs"
                                    placeholder="answer"
                                    value={isPreviewMode ? '' : (answer as string) || ''}
                                    onChange={() => { }}
                                    readOnly
                                    style={{
                                        display: 'inline-block',
                                        width: '120px',
                                        margin: '0 4px',
                                    }}
                                    styles={{
                                        input: {
                                            borderBottom: '2px solid #8b5cf6',
                                            borderTop: 'none',
                                            borderLeft: 'none',
                                            borderRight: 'none',
                                            borderRadius: 0,
                                            background: 'transparent',
                                            textAlign: 'center',
                                        }
                                    }}
                                />
                            )}
                        </React.Fragment>
                    ))}
                </Box>
            );
        }

        case 'summary-completion-list':
            return (
                <Stack gap="xs">
                    <Paper p="sm" radius="sm" bg="gray.0">
                        <Text size="sm" c="gray.7" style={{ lineHeight: 1.6 }}>
                            {questionText}
                        </Text>
                    </Paper>
                    {displayOptions.length > 0 ? (
                        <Select
                            placeholder="Select from list"
                            data={displayOptions.map((opt, i) => ({
                                value: getOptionValue(opt, i),
                                label: formatReadingOption(opt),
                            })) || []}
                            value={isPreviewMode ? null : (answer as string) || null}
                            onChange={() => { }}
                            size="xs"
                            readOnly
                        />
                    ) : (
                        <Text size="xs" c="dimmed" fs="italic">No options available</Text>
                    )}
                </Stack>
            );

        case 'multiple-choice':
            return (
                <Stack gap="xs" onClick={e => e.stopPropagation()}>
                    <Text size="sm" c="gray.7" style={{ lineHeight: 1.6 }}>
                        {questionText}
                    </Text>
                    <Radio.Group value={isPreviewMode ? undefined : (answer as string)} onChange={() => { }}>
                        <Stack gap="xs">
                            {displayOptions.map((opt, i) => (
                                <Radio
                                    key={i}
                                    value={getOptionValue(opt, i)}
                                    label={formatReadingOption(opt)}
                                    size="xs"
                                    readOnly
                                />
                            ))}
                        </Stack>
                    </Radio.Group>
                </Stack>
            );

        case 'multiple-select':
            return (
                <Stack gap="xs" onClick={e => e.stopPropagation()}>
                    <Text size="sm" c="gray.7" style={{ lineHeight: 1.6 }}>
                        {questionText}
                    </Text>
                    <Chip.Group multiple value={isPreviewMode ? [] : (Array.isArray(answer) ? answer : [])} onChange={() => { }}>
                        <Group gap="xs" wrap="wrap">
                            {displayOptions.map((opt, i) => (
                                <Chip
                                    key={i}
                                    value={getOptionValue(opt, i)}
                                    size="xs"
                                    variant="light"
                                    readOnly
                                >
                                    {formatReadingOption(opt)}
                                </Chip>
                            ))}
                        </Group>
                    </Chip.Group>
                </Stack>
            );

        case 'diagram-labeling':
            return (
                <Stack gap="sm">
                    {question.diagramImage ? (
                        <Image
                            src={question.diagramImage}
                            alt="Diagram"
                            radius="md"
                            h={150}
                            fit="contain"
                        />
                    ) : (
                        <Alert color="orange" variant="light" icon={<IconPhoto size={16} />}>
                            Diagram image required
                        </Alert>
                    )}
                    <Text size="sm" c="gray.7">{questionText}</Text>
                </Stack>
            );

        case 'table-completion':
        case 'flowchart-completion':
            return (
                <Stack gap="xs">
                    <Badge size="xs" variant="light" color="blue">
                        {type === 'table-completion' ? 'Table Format' : 'Flowchart Format'}
                    </Badge>
                    <Text size="sm" c="gray.7" style={{ lineHeight: 1.6 }}>
                        {questionText}
                    </Text>
                </Stack>
            );

        default:
            return (
                <Text size="sm" c="gray.7" style={{ lineHeight: 1.6 }}>
                    {questionText}
                </Text>
            );
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const ParseReviewPanel: React.FC<ParseReviewPanelProps> = ({
    passages,
    questions,
    sectionInstructions = [],
    questionGroups = [],
    groupAcknowledgements = {},
    tableCompletionIssues = [],
    tableCompletionDiagnostics = [],
    onQuestionChange,
    onSectionInstructionChange,
    onQuestionDelete,
    onQuestionAdd,
    onOpenComparison,
    onDiagramUpload,
    highlightedQuestion,
    onQuestionClick,
    onQuestionGroupChange,
    onGroupAcknowledge,
    onUnsupportedRepair,
    onTableGroupReviewAction,
    leftSidebarContent,
}) => {
    // ─────────────────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────────────────

    const [activePassageId, setActivePassageId] = useState<string | null>(passages[0]?.id || null);
    const [editingQuestion, setEditingQuestion] = useState<number | null>(null);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const questionGroupById = useMemo(
        () => new Map(questionGroups.map((group) => [group.groupId, group])),
        [questionGroups],
    );
    const tableCompletionIssuesByGroup = useMemo(() => {
        const grouped = new Map<string, TableCompletionIssue[]>();

        tableCompletionIssues.forEach((issue) => {
            const current = grouped.get(issue.groupId) || [];
            current.push(issue);
            grouped.set(issue.groupId, current);
        });

        return grouped;
    }, [tableCompletionIssues]);
    const tableCompletionDiagnosticsByGroup = useMemo(() => {
        const grouped = new Map<string, TableCompletionDiagnosticsField[number]>();

        tableCompletionDiagnostics.forEach((diagnostic) => {
            grouped.set(diagnostic.groupId, diagnostic);
        });

        return grouped;
    }, [tableCompletionDiagnostics]);

    // Sync activePassageId if passages change and current selection is invalid
    React.useEffect(() => {
        if (passages.length > 0 && !passages.find(p => p.id === activePassageId) && activePassageId !== 'unassigned') {
            setActivePassageId(passages[0]?.id || null);
        }
    }, [passages, activePassageId]);

    // ─────────────────────────────────────────────────────────────────────────
    // DERIVED DATA
    // ─────────────────────────────────────────────────────────────────────────

    // Auto-switch tab and scroll when highlighted question changes
    useEffect(() => {
        if (highlightedQuestion) {
            const q = questions.find(q => q.questionNumber === highlightedQuestion);
            if (q) {
                const targetPassageId = q.passageId || 'unassigned';
                if (targetPassageId !== activePassageId) {
                    setActivePassageId(targetPassageId);
                }
                setTimeout(() => {
                    document.getElementById(`question-${highlightedQuestion}`)?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                    });
                }, 100);
            }
        }
    }, [highlightedQuestion, questions, activePassageId]);

    // Group questions by section instruction
    const questionsBySection = useMemo(() => {
        const grouped: Record<string, ParsedQuestion[]> = {};

        // First, try to group by section instruction
        for (const q of questions) {
            const passageId = q.passageId || 'unassigned';
            if (passageId !== activePassageId && activePassageId !== 'unassigned') continue;

            const sectionId = q.sectionInstructionId || `passage-${passageId}`;
            if (!grouped[sectionId]) {
                grouped[sectionId] = [];
            }
            grouped[sectionId].push(q);
        }

        return grouped;
    }, [questions, activePassageId]);

    // Filter questions for active passage
    const activeQuestions = useMemo(() => {
        if (!activePassageId) return [];
        return questions.filter(q => (q.passageId || 'unassigned') === activePassageId);
    }, [questions, activePassageId]);

    const unassignedQuestions = useMemo(() =>
        questions.filter(q => !q.passageId),
        [questions]
    );

    // Count questions needing review per passage
    const uncertainCountByPassage = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const q of questions) {
            const passageId = q.passageId || 'unassigned';
            if (q.uncertain) {
                counts[passageId] = (counts[passageId] || 0) + 1;
            }
        }
        return counts;
    }, [questions]);

    // ─────────────────────────────────────────────────────────────────────────
    // HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    const handleAcceptType = useCallback((questionNumber: number, type: QuestionType) => {
        onQuestionChange(questionNumber, {
            type,
            uncertain: false,
            uncertainReason: undefined,
        });
    }, [onQuestionChange]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    const renderQuestionCard = (question: ParsedQuestion) => {
        const isEditing = editingQuestion === question.questionNumber;
        const isHighlighted = highlightedQuestion === question.questionNumber;
        const category = QUESTION_TYPES.find(t => t.value === question.type)?.category || 'Other';
        const isDiagramType = question.type === 'diagram-labeling';

        return (
            <Paper
                key={question.questionNumber}
                id={`question-${question.questionNumber}`}
                p="md"
                radius="md"
                onClick={() => onQuestionClick?.(question.questionNumber)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onQuestionClick?.(question.questionNumber);
                    }
                }}
                role="article"
                tabIndex={0}
                aria-label={`Question ${question.questionNumber}${question.uncertain ? ', needs review' : ''}`}
                style={{
                    marginBottom: '0.75rem',
                    background: isHighlighted
                        ? 'rgba(139, 92, 246, 0.08)'
                        : question.uncertain
                            ? 'rgba(251, 191, 36, 0.06)'
                            : 'rgba(255, 255, 255, 0.7)',
                    border: isHighlighted
                        ? '2px solid #8b5cf6'
                        : question.uncertain
                            ? '1px solid rgba(251, 191, 36, 0.4)'
                            : '1px solid rgba(226, 232, 240, 0.8)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isHighlighted ? '0 4px 20px rgba(139, 92, 246, 0.2)' : undefined,
                }}
            >
                {/* Question Header */}
                <Group justify="space-between" align="flex-start" mb="sm">
                    <Group gap="xs">
                        <ThemeIcon
                            size="md"
                            radius="md"
                            variant="light"
                            color={question.uncertain ? 'yellow' : 'green'}
                        >
                            <Text size="xs" fw={800}>{question.questionNumber}</Text>
                        </ThemeIcon>

                        <Badge
                            size="xs"
                            variant="light"
                            color="violet"
                            leftSection={QUESTION_TYPE_ICONS[category]}
                        >
                            {QUESTION_TYPES.find(t => t.value === question.type)?.label || question.type}
                        </Badge>

                        {question.uncertain && (
                            <Tooltip label={question.uncertainReason || 'Needs review'}>
                                <Badge
                                    color="yellow"
                                    variant="light"
                                    size="xs"
                                    leftSection={<IconAlertTriangle size={10} />}
                                >
                                    Review
                                </Badge>
                            </Tooltip>
                        )}
                    </Group>

                    <Group gap="xs">
                        <>
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingQuestion(isEditing ? null : question.questionNumber);
                                }}
                                aria-label={isEditing ? "Save" : "Edit"}
                            >
                                {isEditing ? <IconCheck size={16} /> : <IconEdit size={16} />}
                            </ActionIcon>
                            {onQuestionDelete && (
                                <ActionIcon
                                    variant="subtle"
                                    color="red"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onQuestionDelete(question.questionNumber);
                                    }}
                                    aria-label="Delete question"
                                >
                                    <IconTrash size={16} />
                                </ActionIcon>
                            )}
                        </>
                    </Group>
                </Group>

                {/* AI vs Rules Comparison */}
                {question.aiType && question.rulesType && question.aiType !== question.rulesType && !isEditing && (
                    <Box mb="sm">
                        <ComparisonIndicator
                            question={question}
                            onOpenComparison={() => onOpenComparison?.(question.questionNumber)}
                            onAcceptAI={() => handleAcceptType(question.questionNumber, question.aiType!)}
                            onAcceptRules={() => handleAcceptType(question.questionNumber, question.rulesType!)}
                        />
                    </Box>
                )
                }

                {/* Question Content */}
                {
                    isEditing ? (
                        <Stack gap="sm" onClick={e => e.stopPropagation()}>
                            <Textarea
                                label="Question Text"
                                value={question.questionText}
                                onChange={(e) => onQuestionChange(question.questionNumber, { questionText: e.target.value })}
                                minRows={2}
                                styles={{ input: { borderRadius: '8px' } }}
                            />
                            <Group grow>
                                <Select
                                    label="Question Type"
                                    data={TYPE_SELECT_DATA}
                                    value={question.type || null}
                                    onChange={(value) => {
                                        if (!value) return;
                                        const nextType = value as QuestionType;
                                        const isMatchingInformation = isMatchingInformationType(nextType);
                                        const usesCanonicalOptions = isCanonicalReadingOptionType(nextType);
                                        const nextLabelFormat = nextType === 'matching-headings' ? 'roman' : 'letter';
                                        onQuestionChange(question.questionNumber, {
                                            type: nextType,
                                            diagramRequired: value === 'diagram-labeling',
                                            options: usesCanonicalOptions
                                                ? (question.options && question.options.length > 0
                                                    ? question.options
                                                    : createDefaultReadingOptions(
                                                        nextType === 'matching-headings' ? 6 : 4,
                                                        nextLabelFormat,
                                                    ))
                                                : undefined,
                                            sectionReferences: isMatchingInformation
                                                ? (question.sectionReferences && question.sectionReferences.length > 0
                                                    ? question.sectionReferences
                                                    : createDefaultReadingSectionReferences(6, 'letter'))
                                                : undefined,
                                            optionLabelFormat: (usesCanonicalOptions || isMatchingInformation)
                                                ? nextLabelFormat
                                                : undefined,
                                        });
                                    }}
                                    styles={{ input: { borderRadius: '8px' } }}
                                />
                                <Select
                                    label="Passage"
                                    data={[
                                        { value: '__unassigned__', label: 'Unassigned' },
                                        ...(passages || []).filter(p => p && p.id).map(p => ({ value: p.id, label: p.title || p.id })),
                                    ]}
                                    value={question.passageId || '__unassigned__'}
                                    onChange={(value) => onQuestionChange(question.questionNumber, {
                                        passageId: value === '__unassigned__' ? undefined : (value || undefined),
                                    })}
                                    styles={{ input: { borderRadius: '8px' } }}
                                />
                            </Group>
                            <TextInput
                                label="Answer"
                                value={Array.isArray(question.answer) ? question.answer.join(', ') : question.answer || ''}
                                onChange={(e) => onQuestionChange(question.questionNumber, { answer: e.target.value })}
                                styles={{ input: { borderRadius: '8px' } }}
                            />
                            {isCanonicalReadingOptionType(question.type) && (
                                <Stack gap="xs">
                                    <Group justify="space-between" align="center">
                                        <Text size="sm" fw={600}>Options</Text>
                                        <MantineButton
                                            size="xs"
                                            variant="light"
                                            leftSection={<IconPlus size={14} />}
                                            onClick={() => {
                                                const labelFormat = question.optionLabelFormat
                                                    || (question.type === 'matching-headings' ? 'roman' : 'letter');
                                                const nextGeneratedOption = createDefaultReadingOptions(
                                                    (question.options?.length || 0) + 1,
                                                    labelFormat,
                                                ).slice(-1)[0] || { label: '', text: '' };
                                                const nextOptions = question.options && question.options.length > 0
                                                    ? [...question.options, { label: nextGeneratedOption.label, text: '' }]
                                                    : createDefaultReadingOptions(4, labelFormat);
                                                onQuestionChange(question.questionNumber, {
                                                    options: nextOptions,
                                                    optionLabelFormat: labelFormat,
                                                });
                                            }}
                                        >
                                            Add option
                                        </MantineButton>
                                    </Group>
                                    {((question.options || []) as ReadingLabeledOption[]).map((option, optionIndex) => (
                                        <Group key={`${question.questionNumber}-option-${optionIndex}`} align="flex-end" wrap="nowrap">
                                            <TextInput
                                                label="Label"
                                                value={option.label}
                                                onChange={(e) => {
                                                    const nextOptions = [...((question.options || []) as ReadingLabeledOption[])];
                                                    nextOptions[optionIndex] = { ...option, label: e.target.value };
                                                    onQuestionChange(question.questionNumber, { options: nextOptions });
                                                }}
                                                styles={{ input: { borderRadius: '8px' } }}
                                                w={110}
                                            />
                                            <TextInput
                                                label="Text"
                                                value={option.text}
                                                onChange={(e) => {
                                                    const nextOptions = [...((question.options || []) as ReadingLabeledOption[])];
                                                    nextOptions[optionIndex] = { ...option, text: e.target.value };
                                                    onQuestionChange(question.questionNumber, { options: nextOptions });
                                                }}
                                                styles={{ input: { borderRadius: '8px' } }}
                                                style={{ flex: 1 }}
                                            />
                                            <ActionIcon
                                                color="red"
                                                variant="light"
                                                mb={2}
                                                onClick={() => {
                                                    const nextOptions = (question.options || []).filter((_, currentIndex) => currentIndex !== optionIndex);
                                                    onQuestionChange(question.questionNumber, { options: nextOptions });
                                                }}
                                                aria-label={`Remove option ${optionIndex + 1}`}
                                            >
                                                <IconTrash size={16} />
                                            </ActionIcon>
                                        </Group>
                                    ))}
                                </Stack>
                            )}

                            {isMatchingInformationType(question.type) && (
                                <Stack gap="xs">
                                    <Group justify="space-between" align="center">
                                        <Text size="sm" fw={600}>Section References</Text>
                                        <MantineButton
                                            size="xs"
                                            variant="light"
                                            leftSection={<IconPlus size={14} />}
                                            onClick={() => {
                                                const nextGeneratedSection = createDefaultReadingSectionReferences(
                                                    (question.sectionReferences?.length || 0) + 1,
                                                    question.optionLabelFormat || 'letter',
                                                ).slice(-1)[0] || { label: '', title: '', paragraph: '' };
                                                const nextSections = question.sectionReferences && question.sectionReferences.length > 0
                                                    ? [...question.sectionReferences, nextGeneratedSection]
                                                    : createDefaultReadingSectionReferences(6, question.optionLabelFormat || 'letter');
                                                onQuestionChange(question.questionNumber, {
                                                    sectionReferences: nextSections,
                                                    optionLabelFormat: question.optionLabelFormat || 'letter',
                                                });
                                            }}
                                        >
                                            Add section
                                        </MantineButton>
                                    </Group>
                                    {(question.sectionReferences || []).map((section, sectionIndex) => (
                                        <Stack key={`${question.questionNumber}-section-${sectionIndex}`} gap="xs">
                                            <Group align="flex-end" wrap="nowrap">
                                                <TextInput
                                                    label="Label"
                                                    value={section.label}
                                                    onChange={(e) => {
                                                        const nextSections = [...(question.sectionReferences || [])];
                                                        nextSections[sectionIndex] = { ...section, label: e.target.value };
                                                        onQuestionChange(question.questionNumber, { sectionReferences: nextSections });
                                                    }}
                                                    styles={{ input: { borderRadius: '8px' } }}
                                                    w={110}
                                                />
                                                <TextInput
                                                    label="Title (optional)"
                                                    value={section.title || ''}
                                                    onChange={(e) => {
                                                        const nextSections = [...(question.sectionReferences || [])];
                                                        nextSections[sectionIndex] = { ...section, title: e.target.value };
                                                        onQuestionChange(question.questionNumber, { sectionReferences: nextSections });
                                                    }}
                                                    styles={{ input: { borderRadius: '8px' } }}
                                                    style={{ flex: 1 }}
                                                />
                                                <ActionIcon
                                                    color="red"
                                                    variant="light"
                                                    mb={2}
                                                    onClick={() => {
                                                        const nextSections = (question.sectionReferences || []).filter((_, currentIndex) => currentIndex !== sectionIndex);
                                                        onQuestionChange(question.questionNumber, { sectionReferences: nextSections });
                                                    }}
                                                    aria-label={`Remove section reference ${sectionIndex + 1}`}
                                                >
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Group>
                                            <TextInput
                                                label="Paragraph / note (optional)"
                                                value={section.paragraph || ''}
                                                onChange={(e) => {
                                                    const nextSections = [...(question.sectionReferences || [])];
                                                    nextSections[sectionIndex] = { ...section, paragraph: e.target.value };
                                                    onQuestionChange(question.questionNumber, { sectionReferences: nextSections });
                                                }}
                                                styles={{ input: { borderRadius: '8px' } }}
                                            />
                                        </Stack>
                                    ))}
                                </Stack>
                            )}

                            {/* Diagram Upload for diagram-labeling type */}
                            {isDiagramType && (
                                <DiagramUploader
                                    questionNumber={question.questionNumber}
                                    currentImage={question.diagramImage}
                                    onUpload={(file) => onDiagramUpload?.(question.questionNumber, file)}
                                />
                            )}
                        </Stack>
                    ) : (
                        <>
                            <QuestionPreview question={question} isPreviewMode={false} />

                            {/* Answer Badge */}
                            {question.answer && (
                                <Group gap="xs" mt="sm">
                                    <Badge variant="light" color="green" size="sm">
                                        Answer: {Array.isArray(question.answer) ? question.answer.join(', ') : question.answer}
                                    </Badge>
                                    <Badge variant="light" color="gray" size="sm">
                                        {question.confidence}% confidence
                                    </Badge>
                                </Group>
                            )}

                            {/* Diagram Upload Alert */}
                            {isDiagramType && !question.diagramImage && !isEditing && (
                                <Alert
                                    color="orange"
                                    variant="light"
                                    mt="sm"
                                    icon={<IconPhoto size={16} />}
                                    styles={{
                                        root: { padding: '0.5rem 0.75rem' },
                                        message: { fontSize: '0.8125rem' },
                                    }}
                                >
                                    <Group justify="space-between">
                                        <span>Upload diagram image</span>
                                        <FileButton
                                            onChange={(file) => file && onDiagramUpload?.(question.questionNumber, file)}
                                            accept="image/*"
                                        >
                                            {(props) => (
                                                <MantineButton size="xs" variant="light" {...props}>
                                                    <IconUpload size={12} />
                                                </MantineButton>
                                            )}
                                        </FileButton>
                                    </Group>
                                </Alert>
                            )}
                        </>
                    )
                }
            </Paper >
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    // Compute summary stats for the stats bar
    const totalQuestions = questions.length;
    const totalUncertain = questions.filter(q => q.uncertain).length;
    const typeMismatches = questions.filter(q => q.aiType && q.rulesType && q.aiType !== q.rulesType).length;
    const avgConfidence = totalQuestions > 0
        ? Math.round(questions.reduce((sum, q) => sum + q.confidence, 0) / totalQuestions)
        : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%', overflow: 'hidden', paddingBottom: '0.5rem' }}>
            {/* ── Compact Header with Stats ────────────────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, auto) repeat(3, 1fr)',
                gap: '0.625rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(16px) saturate(200%)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: '10px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            }}>
                {/* Title Section */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>📋</span>
                    <div>
                        <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.2 }}>
                            Review & Edit
                        </div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#64748b' }}>
                            {passages.length} passages · {totalQuestions} questions
                        </div>
                    </div>
                </div>

                {/* Stat Cards */}
                {[
                    { label: 'Confidence', value: `${avgConfidence}%`, icon: '📊', color: avgConfidence >= 80 ? '#16a34a' : avgConfidence >= 60 ? '#f59e0b' : '#ef4444', bg: avgConfidence >= 80 ? 'rgba(34, 197, 94, 0.08)' : avgConfidence >= 60 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)' },
                    { label: 'Need Review', value: totalUncertain, icon: '⚠️', color: totalUncertain > 0 ? '#f59e0b' : '#16a34a', bg: totalUncertain > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.08)' },
                    { label: 'Type Conflicts', value: typeMismatches, icon: '🔀', color: typeMismatches > 0 ? '#ef4444' : '#16a34a', bg: typeMismatches > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)' },
                ].map((stat, i) => (
                    <div key={i} style={{
                        padding: '0.5rem 0.625rem',
                        background: stat.bg,
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <span style={{ fontSize: '0.9375rem' }}>{stat.icon}</span>
                        <div>
                            <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: stat.color, lineHeight: 1.2 }}>
                                {stat.value}
                            </div>
                            <div style={{ fontSize: '0.625rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                {stat.label}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Split View Layout ─────────────────────────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '340px minmax(0, 1fr)',
                gap: '0.75rem',
                alignItems: 'stretch',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                marginBottom: '0.5rem',
            }}>
                {/* LEFT COLUMN: Need Review Sidebar */}
                <div
                    style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    {leftSidebarContent}
                </div>

                {/* CENTER/RIGHT COLUMN: Questions with Passage Tabs */}
                <Card
                    variant="glass"
                    hover={false}
                    style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        padding: 0,
                    }}
                >
                    {/* Passage Tabs (moved from left column) */}
                    <div style={{
                        padding: '0.625rem 0.875rem',
                        borderBottom: '1px solid rgba(226, 232, 240, 0.5)',
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.04) 0%, rgba(99, 102, 241, 0.02) 100%)',
                        flexShrink: 0,
                    }}>
                        <Tabs
                            value={activePassageId || ''}
                            onChange={setActivePassageId}
                            variant="pills"
                            keepMounted
                            styles={{
                                tab: {
                                    fontSize: '0.8125rem',
                                    padding: '0.375rem 0.75rem',
                                    fontWeight: 600,
                                },
                            }}
                        >
                            <Tabs.List>
                                {passages.map((p, idx) => {
                                    // Fix: Clean up title - remove duplicate 'Passage' prefix
                                    const cleanTitle = p.title.replace(/^Passage\s*/i, '').trim();
                                    const displayTitle = `Passage ${idx + 1}${cleanTitle && !cleanTitle.match(/^\d+$/) ? `: ${cleanTitle}` : ''}`;
                                    return (
                                        <Tabs.Tab
                                            key={p.id}
                                            value={p.id}
                                            rightSection={
                                                uncertainCountByPassage[p.id] ? (
                                                    <Badge size="xs" color="yellow" variant="filled">
                                                        {uncertainCountByPassage[p.id]}
                                                    </Badge>
                                                ) : null
                                            }
                                        >
                                            {displayTitle}
                                        </Tabs.Tab>
                                    );
                                })}
                                {unassignedQuestions.length > 0 && (
                                    <Tabs.Tab
                                        value="unassigned"
                                        color="orange"
                                        rightSection={
                                            <Badge size="xs" color="orange" variant="filled">
                                                {unassignedQuestions.length}
                                            </Badge>
                                        }
                                    >
                                        Unassigned
                                    </Tabs.Tab>
                                )}
                            </Tabs.List>
                        </Tabs>
                    </div>

                    {/* Questions Header */}
                    <div style={{
                        padding: '0.625rem 0.875rem',
                        borderBottom: '1px solid rgba(226, 232, 240, 0.5)',
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.04) 0%, rgba(14, 165, 233, 0.02) 100%)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0,
                    }}>
                        <div>
                            <Text size="xs" fw={700} c="green.6" mb={2} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Questions
                            </Text>
                            <Text size="sm" fw={700} c="gray.8">
                                {activePassageId === 'unassigned'
                                    ? 'Unassigned Questions'
                                    : `${activeQuestions.length} question${activeQuestions.length !== 1 ? 's' : ''} in this passage`
                                }
                            </Text>
                        </div>
                        {onQuestionAdd && (
                            <Button size="xs" variant="glass" onClick={() => onQuestionAdd(activePassageId || undefined)}>
                                <IconPlus size={14} style={{ marginRight: '0.25rem' }} />
                                Add
                            </Button>
                        )}
                    </div>

                    {/* Questions Scroll Area - with consistent scrollbar to prevent layout shift */}
                    <ScrollArea style={{ flex: 1 }} p="sm" scrollbarSize={8} type="always">
                        {/* Render by section instruction if available */}
                        {Object.entries(questionsBySection).map(([sectionId, sectionQuestions]) => {
                            const instruction = sectionInstructions.find(i => i.id === sectionId);
                            const questionGroup = questionGroupById.get(sectionId);
                            const tableCompletionDiagnostic = tableCompletionDiagnosticsByGroup.get(sectionId);
                            const isCanonicalTableGroup =
                                questionGroup?.taskType === 'table-completion' &&
                                sectionQuestions.some((question) => question.groupId === sectionId);

                            return (
                                <div key={sectionId} style={{ marginBottom: '1.25rem' }}>
                                    {isCanonicalTableGroup && questionGroup && onQuestionGroupChange ? (
                                        <TableCompletionGroupReview
                                            group={questionGroup}
                                            issues={tableCompletionIssuesByGroup.get(questionGroup.groupId) || []}
                                            diagnostic={tableCompletionDiagnostic}
                                            acknowledgement={groupAcknowledgements[questionGroup.groupId]}
                                            onGroupChange={(nextGroup) =>
                                                onQuestionGroupChange(questionGroup.groupId, nextGroup)
                                            }
                                            onAcknowledgeIssues={(groupId, issueCodes, canonicalRevisionHash) =>
                                                onGroupAcknowledge?.(groupId, issueCodes, canonicalRevisionHash)
                                            }
                                            onUnsupportedRepair={(groupId, action) =>
                                                onUnsupportedRepair?.(groupId, action)
                                            }
                                            onReviewAction={onTableGroupReviewAction}
                                        />
                                    ) : (
                                        <>
                                            {tableCompletionDiagnostic && (
                                                <Alert
                                                    color={tableCompletionDiagnostic.validationSeverity === 'blocking' ? 'red' : 'yellow'}
                                                    variant="light"
                                                    mb="sm"
                                                    icon={<IconAlertTriangle size={16} />}
                                                >
                                                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                        <strong>
                                                            Table-completion diagnostics: {tableCompletionDiagnostic.parseMode}
                                                        </strong>
                                                        <span>
                                                            Source workflow: {tableCompletionDiagnostic.sourceWorkflow} · Source shape:{' '}
                                                            {tableCompletionDiagnostic.sourceShape}
                                                        </span>
                                                        <span>
                                                            Severity: {tableCompletionDiagnostic.validationSeverity} · Issue codes:{' '}
                                                            {tableCompletionDiagnostic.issueCodes.join(', ') || 'none'}
                                                        </span>
                                                    </div>
                                                </Alert>
                                            )}
                                            {/* Section Instruction Header */}
                                            {instruction && (
                                                <SectionInstructionHeader
                                                    instruction={instruction}
                                                    onUpdate={(updates) => onSectionInstructionChange?.(sectionId, updates)}
                                                    isEditing={editingSectionId === sectionId}
                                                    onToggleEdit={() => setEditingSectionId(
                                                        editingSectionId === sectionId ? null : sectionId
                                                    )}
                                                />
                                            )}

                                            {/* Section Questions */}
                                            {sectionQuestions.map(renderQuestionCard)}
                                        </>
                                    )}
                                </div>
                            );
                        })}

                        {/* Empty State */}
                        {activeQuestions.length === 0 && (
                            <Paper
                                p="xl"
                                radius="md"
                                ta="center"
                                style={{
                                    border: '2px dashed #e2e8f0',
                                }}
                            >
                                <Text c="dimmed" mb="sm">No questions in this section.</Text>
                                {onQuestionAdd && (
                                    <Button variant="glass" size="sm" onClick={() => onQuestionAdd(activePassageId || undefined)}>
                                        Create one
                                    </Button>
                                )}
                            </Paper>
                        )}
                    </ScrollArea>
                </Card>
            </div>

            {/* Animations & Hover Styles */}
            <style>{`
                @keyframes highlight {
                    0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(139, 92, 246, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
                }
                [id^="question-"]:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
                }
            `}</style>
        </div>
    );
};

export default ParseReviewPanel;
