/**
 * AnswerKeyModal Component
 * 
 * Modal for managing answer keys with three modes:
 * 1. Show only questions missing answers for individual fill
 * 2. Mass input mode for bulk answer entry
 * 3. AI suggestions mode
 * 
 * @module AnswerKeyModal
 * @version 1.0.0
 * @date 2026-02-06
 */

import React, { useState, useMemo } from 'react';
import {
    Modal,
    Tabs,
    TextInput,
    Button,
    Badge,
    Text,
    Stack,
    Group,
    ScrollArea,
    Paper,
    Textarea,
    Alert,
    Loader,
} from '@mantine/core';
import {
    IconKey,
    IconList,
    IconBrain,
    IconCheck,
    IconAlertTriangle,
    IconDownload,
} from '@tabler/icons-react';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface QuestionForAnswer {
    questionNumber: number;
    questionText: string;
    type: string;
    answer?: string | string[];
    options?: string[] | null;
}

export interface AnswerKeyModalProps {
    opened: boolean;
    onClose: () => void;
    questions: QuestionForAnswer[];
    onUpdateAnswer: (questionNumber: number, answer: string | string[]) => void;
    onRequestAISuggestions?: () => Promise<Record<number, string>>;
}

// ═══════════════════════════════════════════════════════════════
// MULTI-BLANK ANSWER INPUT (for questions with 2+ blanks)
// ═══════════════════════════════════════════════════════════════

const MultiBlankAnswerInput: React.FC<{
    blankCount: number;
    questionNumber: number;
    onSubmit: (answer: string) => void;
}> = ({ blankCount, questionNumber, onSubmit }) => {
    const [values, setValues] = useState<string[]>(Array(blankCount).fill(''));

    const handleChange = (idx: number, value: string) => {
        const updated = [...values];
        updated[idx] = value;
        setValues(updated);
    };

    const handleSubmit = () => {
        const allFilled = values.every(v => v.trim().length > 0);
        if (allFilled) {
            onSubmit(values.map(v => v.trim()).join('|'));
            setValues(Array(blankCount).fill(''));
        }
    };

    return (
        <Stack gap={4}>
            <Text size="xs" c="dimmed" fs="italic">
                Enter each blank separately — answers are stored as pipe-delimited.
            </Text>
            <Group gap="xs" align="flex-end">
                {values.map((val, idx) => (
                    <TextInput
                        key={idx}
                        placeholder={`Blank ${idx + 1}`}
                        label={<Text size="xs" fw={600}>{questionNumber}{String.fromCharCode(97 + idx)}</Text>}
                        size="sm"
                        value={val}
                        onChange={(e) => handleChange(idx, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        style={{ flex: 1 }}
                    />
                ))}
                <Button
                    size="sm"
                    variant="light"
                    onClick={handleSubmit}
                    disabled={values.some(v => !v.trim())}
                >
                    <IconCheck size={16} />
                </Button>
            </Group>
        </Stack>
    );
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export const AnswerKeyModal: React.FC<AnswerKeyModalProps> = ({
    opened,
    onClose,
    questions,
    onUpdateAnswer,
    onRequestAISuggestions,
}) => {
    const [activeTab, setActiveTab] = useState<string | null>('missing');
    const [bulkAnswers, setBulkAnswers] = useState<string>('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<Record<number, string>>({});
    const [aiError, setAiError] = useState<string | null>(null);

    // Get questions missing answers
    const missingAnswers = useMemo(() => {
        return questions.filter(q => !q.answer || (Array.isArray(q.answer) && q.answer.length === 0));
    }, [questions]);

    // Parse bulk answers (format: "1. A\n2. B\n3. TRUE" etc.)
    const parseBulkAnswers = () => {
        const lines = bulkAnswers.split('\n').filter(line => line.trim());
        const updates: { questionNumber: number; answer: string }[] = [];

        for (const line of lines) {
            // Match patterns like "1. A", "1) A", "1: A", "1 A"
            const match = line.match(/^(\d+)[\.\)\:\s]+(.+)$/);
            if (match) {
                const questionNumber = parseInt(match[1], 10);
                const answer = match[2].trim();
                updates.push({ questionNumber, answer });
            }
        }

        return updates;
    };

    const handleApplyBulk = () => {
        const updates = parseBulkAnswers();
        for (const { questionNumber, answer } of updates) {
            onUpdateAnswer(questionNumber, answer);
        }
        setBulkAnswers('');
    };

    const handleRequestAI = async () => {
        if (!onRequestAISuggestions) return;

        setAiLoading(true);
        setAiError(null);

        try {
            const suggestions = await onRequestAISuggestions();
            setAiSuggestions(suggestions);
        } catch (error) {
            setAiError(error instanceof Error ? error.message : 'Failed to get AI suggestions');
        } finally {
            setAiLoading(false);
        }
    };

    const handleApplyAISuggestion = (questionNumber: number, answer: string) => {
        onUpdateAnswer(questionNumber, answer);
        // Remove from suggestions after applying
        setAiSuggestions(prev => {
            const next = { ...prev };
            delete next[questionNumber];
            return next;
        });
    };

    const handleApplyAllAI = () => {
        for (const [questionNumber, answer] of Object.entries(aiSuggestions)) {
            onUpdateAnswer(parseInt(questionNumber, 10), answer);
        }
        setAiSuggestions({});
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <IconKey size={20} style={{ color: '#8b5cf6' }} />
                    <Text fw={700}>Answer Key Manager</Text>
                    <Badge size="sm" color="yellow" variant="light">
                        {missingAnswers.length} missing
                    </Badge>
                </Group>
            }
            size="lg"
            styles={{
                header: {
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '0.75rem',
                },
                body: {
                    padding: '0',
                },
            }}
        >
            <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List grow style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <Tabs.Tab
                        value="missing"
                        leftSection={<IconList size={16} />}
                        rightSection={
                            missingAnswers.length > 0 ? (
                                <Badge size="xs" color="red" variant="filled">
                                    {missingAnswers.length}
                                </Badge>
                            ) : null
                        }
                    >
                        Fill Missing
                    </Tabs.Tab>
                    <Tabs.Tab value="bulk" leftSection={<IconDownload size={16} />}>
                        Bulk Input
                    </Tabs.Tab>
                    <Tabs.Tab
                        value="ai"
                        leftSection={<IconBrain size={16} />}
                        disabled={!onRequestAISuggestions}
                    >
                        AI Suggestions
                    </Tabs.Tab>
                </Tabs.List>

                {/* Tab: Fill Missing Answers */}
                <Tabs.Panel value="missing" p="md">
                    <ScrollArea h={400}>
                        {missingAnswers.length === 0 ? (
                            <Paper p="xl" ta="center" bg="green.0" radius="md">
                                <IconCheck size={48} style={{ color: '#22c55e', marginBottom: '0.5rem' }} />
                                <Text fw={600} c="green.7">All questions have answers!</Text>
                                <Text size="sm" c="dimmed">No missing answer keys found.</Text>
                            </Paper>
                        ) : (
                            <Stack gap="sm">
                                {missingAnswers.map(q => {
                                    // Detect multi-blank: count underscored blanks in question text
                                    const blankCount = (q.questionText?.match(/_{3,}/g) || []).length;
                                    const isMultiBlank = blankCount > 1;

                                    return (
                                        <Paper
                                            key={q.questionNumber}
                                            p="sm"
                                            radius="md"
                                            style={{
                                                border: '1px solid #fbbf24',
                                                background: 'rgba(251, 191, 36, 0.05)',
                                            }}
                                        >
                                            <Group justify="space-between" mb="xs">
                                                <Badge color="violet" variant="light" size="sm">
                                                    Q{q.questionNumber}
                                                </Badge>
                                                <Group gap={4}>
                                                    {isMultiBlank && (
                                                        <Badge color="blue" variant="light" size="xs">
                                                            {blankCount} blanks
                                                        </Badge>
                                                    )}
                                                    <Badge color="gray" variant="light" size="xs">
                                                        {q.type}
                                                    </Badge>
                                                </Group>
                                            </Group>
                                            <Text size="sm" mb="xs" lineClamp={2}>
                                                {q.questionText || '(No question text)'}
                                            </Text>
                                            {isMultiBlank ? (
                                                <MultiBlankAnswerInput
                                                    blankCount={blankCount}
                                                    questionNumber={q.questionNumber}
                                                    onSubmit={(answer) => onUpdateAnswer(q.questionNumber, answer)}
                                                />
                                            ) : (
                                                <TextInput
                                                    placeholder="Enter answer..."
                                                    size="sm"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const value = e.currentTarget.value.trim();
                                                            if (value) {
                                                                onUpdateAnswer(q.questionNumber, value);
                                                                e.currentTarget.value = '';
                                                            }
                                                        }
                                                    }}
                                                    rightSection={
                                                        <Text size="xs" c="dimmed">
                                                            Enter ↵
                                                        </Text>
                                                    }
                                                    rightSectionWidth={60}
                                                />
                                            )}
                                        </Paper>
                                    );
                                })}
                            </Stack>
                        )}
                    </ScrollArea>
                </Tabs.Panel>

                {/* Tab: Bulk Input */}
                <Tabs.Panel value="bulk" p="md">
                    <Stack gap="md">
                        <Alert icon={<IconAlertTriangle size={16} />} color="blue" variant="light">
                            <Text size="sm">
                                Enter answers in format: <code>1. A</code> or <code>1) TRUE</code>
                                <br />
                                One answer per line. Question numbers must match.
                            </Text>
                        </Alert>
                        <Textarea
                            placeholder={`1. A\n2. B\n3. TRUE\n4. NOT GIVEN\n5. C`}
                            minRows={12}
                            value={bulkAnswers}
                            onChange={(e) => setBulkAnswers(e.target.value)}
                            styles={{
                                input: {
                                    fontFamily: 'monospace',
                                    fontSize: '0.875rem',
                                },
                            }}
                        />
                        <Group justify="space-between">
                            <Text size="xs" c="dimmed">
                                {parseBulkAnswers().length} valid entries detected
                            </Text>
                            <Button
                                onClick={handleApplyBulk}
                                disabled={parseBulkAnswers().length === 0}
                                leftSection={<IconCheck size={16} />}
                            >
                                Apply {parseBulkAnswers().length} Answers
                            </Button>
                        </Group>
                    </Stack>
                </Tabs.Panel>

                {/* Tab: AI Suggestions */}
                <Tabs.Panel value="ai" p="md">
                    <Stack gap="md">
                        {aiError && (
                            <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
                                {aiError}
                            </Alert>
                        )}

                        {!aiLoading && Object.keys(aiSuggestions).length === 0 && (
                            <Paper p="xl" ta="center" bg="violet.0" radius="md">
                                <IconBrain size={48} style={{ color: '#8b5cf6', marginBottom: '0.5rem' }} />
                                <Text fw={600} c="violet.7" mb="xs">AI Answer Suggestions</Text>
                                <Text size="sm" c="dimmed" mb="md">
                                    Let AI analyze the passage and questions to suggest answers.
                                </Text>
                                <Button
                                    onClick={handleRequestAI}
                                    loading={aiLoading}
                                    leftSection={<IconBrain size={16} />}
                                    variant="gradient"
                                    gradient={{ from: 'violet', to: 'indigo' }}
                                >
                                    Generate Suggestions
                                </Button>
                            </Paper>
                        )}

                        {aiLoading && (
                            <Paper p="xl" ta="center" radius="md">
                                <Loader size="lg" color="violet" type="dots" />
                                <Text mt="md" c="dimmed">Analyzing questions and generating suggestions...</Text>
                            </Paper>
                        )}

                        {!aiLoading && Object.keys(aiSuggestions).length > 0 && (
                            <>
                                <Group justify="space-between">
                                    <Text size="sm" fw={600}>
                                        {Object.keys(aiSuggestions).length} suggestions ready
                                    </Text>
                                    <Button
                                        size="xs"
                                        variant="light"
                                        onClick={handleApplyAllAI}
                                        leftSection={<IconCheck size={14} />}
                                    >
                                        Apply All
                                    </Button>
                                </Group>
                                <ScrollArea h={300}>
                                    <Stack gap="xs">
                                        {Object.entries(aiSuggestions).map(([qNum, answer]) => {
                                            const question = questions.find(q => q.questionNumber === parseInt(qNum, 10));
                                            return (
                                                <Paper
                                                    key={qNum}
                                                    p="sm"
                                                    radius="md"
                                                    style={{
                                                        border: '1px solid #8b5cf6',
                                                        background: 'rgba(139, 92, 246, 0.05)',
                                                    }}
                                                >
                                                    <Group justify="space-between" wrap="nowrap">
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <Badge color="violet" variant="light" size="sm" mb={4}>
                                                                Q{qNum}
                                                            </Badge>
                                                            <Text size="xs" c="dimmed" lineClamp={1}>
                                                                {question?.questionText || ''}
                                                            </Text>
                                                            <Text size="sm" fw={600} c="violet.7">
                                                                Suggested: {answer}
                                                            </Text>
                                                        </div>
                                                        <Button
                                                            size="xs"
                                                            variant="light"
                                                            color="green"
                                                            onClick={() => handleApplyAISuggestion(parseInt(qNum, 10), answer)}
                                                            leftSection={<IconCheck size={12} />}
                                                        >
                                                            Apply
                                                        </Button>
                                                    </Group>
                                                </Paper>
                                            );
                                        })}
                                    </Stack>
                                </ScrollArea>
                            </>
                        )}
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </Modal>
    );
};

export default AnswerKeyModal;
