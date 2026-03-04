/**
 * THCSParseReviewPanel — Phase 3, Task 10.7
 *
 * Review UI shown after document parsing completes.
 * Displays confidence, section breakdown, answer key grid, and ambiguous items.
 */

import { useState } from 'react';
import { Stack, Text, Badge, Group, Alert, SimpleGrid, Textarea, Button } from '@mantine/core';
import { IconAlertTriangle, IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import type { THCSQuestionType } from '../../types/thcs-test.types';

interface ParsedSection {
    name: string;
    instructionText: string;
    questions: Array<{ questionNumber: number; text: string; type: THCSQuestionType; correctAnswer?: string }>;
    detectedType: THCSQuestionType;
    typeConfidence: number;
}

interface ParseWarning {
    type: string;
    message: string;
    line?: number;
}

interface ParsedTest {
    metadata: { title?: string; gradeLevel?: number; duration?: number; examType?: string };
    sections: ParsedSection[];
    answerKey: Record<number, string>;
    warnings: ParseWarning[];
    overallConfidence: number;
}

interface THCSParseReviewPanelProps {
    parsedTest: ParsedTest;
    onBack: () => void;
    onProceed: (parsedTest: ParsedTest) => void;
}

const CONFIDENCE_COLOR = (c: number) => c >= 80 ? 'green' : c >= 60 ? 'yellow' : 'red';
const CONFIDENCE_ICON = (c: number) => c >= 80 ? '✅' : '⚠️';

export function THCSParseReviewPanel({ parsedTest, onBack, onProceed }: THCSParseReviewPanelProps) {
    const [editedTest, setEditedTest] = useState<ParsedTest>(parsedTest);
    const [showPasteKeys, setShowPasteKeys] = useState(false);
    const [pasteText, setPasteText] = useState('');

    const totalQuestions = editedTest.sections.reduce((sum, s) => sum + s.questions.length, 0);
    const answeredCount = Object.keys(editedTest.answerKey).length;
    const missingAnswers = totalQuestions - answeredCount;

    const handleTypeChange = (sectionIndex: number, newType: THCSQuestionType) => {
        const updated = { ...editedTest };
        updated.sections = [...updated.sections];
        const section = { ...updated.sections[sectionIndex]! };
        section.detectedType = newType;
        section.typeConfidence = 100; // Teacher override = 100% confidence
        section.questions = section.questions.map(q => ({ ...q, type: newType }));
        updated.sections[sectionIndex] = section;
        setEditedTest(updated);
    };

    const handlePasteKeys = () => {
        // Parse pasted answer keys (format: 1.A 2.B 3.C or 1-A, 2-B, 3-C)
        const parsed: Record<number, string> = { ...editedTest.answerKey };
        const matches = pasteText.matchAll(/(\d+)[.\-:\s]+([A-Da-d])/g);
        for (const m of matches) {
            parsed[Number(m[1])] = m[2]!.toUpperCase();
        }
        setEditedTest({ ...editedTest, answerKey: parsed });
        setShowPasteKeys(false);
        setPasteText('');
    };

    return (
        <Stack gap="md">
            {/* Overall confidence */}
            <div style={{
                padding: '1rem',
                background: 'rgba(139,92,246,0.04)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(139,92,246,0.1)',
            }}>
                <Group justify="space-between" mb={4}>
                    <Text fw={700} size="sm">Parse Result</Text>
                    <Badge
                        size="lg"
                        color={CONFIDENCE_COLOR(editedTest.overallConfidence)}
                    >
                        {editedTest.overallConfidence}% Confidence
                    </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                    {editedTest.sections.length} sections · {totalQuestions} questions · {answeredCount} answers extracted
                </Text>
            </div>

            {/* Warnings */}
            {editedTest.warnings.length > 0 && (
                <Alert color="orange" icon={<IconAlertTriangle size={16} />} title="Warnings">
                    <Stack gap={2}>
                        {editedTest.warnings.map((w, i) => (
                            <Text key={i} size="xs">• {w.message}</Text>
                        ))}
                    </Stack>
                </Alert>
            )}

            {/* Section breakdown */}
            <Text fw={700} size="sm">Sections</Text>
            <Stack gap="xs">
                {editedTest.sections.map((section, si) => (
                    <div key={si} style={{
                        padding: '0.75rem',
                        background: 'rgba(255,255,255,0.6)',
                        borderRadius: '0.5rem',
                        border: `1px solid ${section.typeConfidence >= 80 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.2)'}`,
                    }}>
                        <Group justify="space-between" mb={4}>
                            <Group gap="xs">
                                <Text size="sm">{CONFIDENCE_ICON(section.typeConfidence)}</Text>
                                <Text fw={600} size="sm">{section.name}</Text>
                                <Badge size="xs" variant="light">{section.questions.length} Q</Badge>
                            </Group>
                            <Badge size="sm" color={CONFIDENCE_COLOR(section.typeConfidence)}>
                                {section.detectedType} ({section.typeConfidence}%)
                            </Badge>
                        </Group>

                        {/* Low confidence: show type alternatives */}
                        {section.typeConfidence < 80 && (
                            <Group gap={4} mt={4} wrap="wrap">
                                <Text size="xs" c="dimmed">Override type:</Text>
                                {[
                                    'pronunciation', 'word-stress', 'mcq-grammar', 'mcq-vocabulary',
                                    'dialogue-response', 'reading-comprehension', 'reading-cloze-mcq',
                                    'closest-meaning', 'error-identification', 'synonym-mcq', 'antonym-mcq',
                                    'sentence-arrangement', 'verb-form', 'word-form',
                                    'sentence-rewrite', 'sentence-rewrite-keyword',
                                ].map(t => (
                                    <Badge
                                        key={t}
                                        size="xs"
                                        variant={section.detectedType === t ? 'filled' : 'outline'}
                                        color="violet"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => handleTypeChange(si, t as THCSQuestionType)}
                                    >
                                        {t}
                                    </Badge>
                                ))}
                            </Group>
                        )}
                    </div>
                ))}
            </Stack>

            {/* Answer Key Grid */}
            <Group justify="space-between">
                <Text fw={700} size="sm" component="span">
                    Answer Key ({answeredCount}/{totalQuestions})
                    {missingAnswers > 0 && (
                        <Badge size="xs" color="orange" ml={4}>⚠️ {missingAnswers} missing</Badge>
                    )}
                </Text>
                <button
                    onClick={() => setShowPasteKeys(!showPasteKeys)}
                    style={{
                        padding: '0.25rem 0.5rem', border: '1px solid rgba(139,92,246,0.2)',
                        borderRadius: '0.375rem', background: 'transparent',
                        color: '#8b5cf6', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer',
                    }}
                >
                    📋 Paste Missing Keys
                </button>
            </Group>

            {showPasteKeys && (
                <div style={{
                    padding: '0.75rem', background: 'rgba(139,92,246,0.04)', borderRadius: '0.5rem',
                    border: '1px solid rgba(139,92,246,0.1)',
                }}>
                    <Textarea
                        placeholder="1.A 2.B 3.C 4.D ... or 1-A, 2-B, 3-C"
                        value={pasteText}
                        onChange={(e) => setPasteText(e.currentTarget.value)}
                        rows={3}
                        mb={8}
                    />
                    <Group justify="flex-end">
                        <Button size="xs" variant="subtle" onClick={() => setShowPasteKeys(false)}>Cancel</Button>
                        <Button size="xs" color="violet" onClick={handlePasteKeys}>Apply</Button>
                    </Group>
                </div>
            )}

            <SimpleGrid cols={10} spacing={4}>
                {Array.from({ length: totalQuestions }, (_, i) => i + 1).map(num => {
                    const answer = editedTest.answerKey[num];
                    return (
                        <div key={num} style={{
                            textAlign: 'center',
                            padding: '0.25rem',
                            borderRadius: '0.25rem',
                            background: answer ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.1)',
                            border: `1px solid ${answer ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.2)'}`,
                        }}>
                            <Text size="xs" c="dimmed">{num}</Text>
                            <Text size="xs" fw={700} c={answer ? 'green' : 'orange'}>
                                {answer || '?'}
                            </Text>
                        </div>
                    );
                })}
            </SimpleGrid>



            {/* Actions */}
            <Group justify="space-between" mt="md">
                <Button
                    variant="subtle"
                    leftSection={<IconArrowLeft size={16} />}
                    onClick={onBack}
                >
                    ← Back
                </Button>
                <Button
                    color="violet"
                    rightSection={<IconArrowRight size={16} />}
                    onClick={() => onProceed(editedTest)}
                >
                    Edit in Full Editor →
                </Button>
            </Group>
        </Stack>
    );
}

export default THCSParseReviewPanel;
