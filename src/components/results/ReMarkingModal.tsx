import React, { useState, useEffect } from 'react';
import { Modal, NumberInput, Select, Textarea, Group, Text, Box, Alert } from '@mantine/core';
import { Button } from '../modern';
import { QuestionResult } from '../../types/results.types';

interface ReMarkingModalProps {
    isOpen: boolean;
    onClose: () => void;
    studentName: string;
    questions: { questionNumber: number; maxScore: number; text?: string }[];
    results: QuestionResult[];
    onSave: (questionNumber: number, newScore: number, reason: string) => Promise<void>;
}

export const ReMarkingModal: React.FC<ReMarkingModalProps> = ({
    isOpen,
    onClose,
    studentName,
    questions,
    results,
    onSave
}) => {
    const [selectedQNum, setSelectedQNum] = useState<string | null>(null);
    const [newScore, setNewScore] = useState<number | ''>('');
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state when opening/closing or changing student
    useEffect(() => {
        if (isOpen) {
            setSelectedQNum(null);
            setNewScore('');
            setReason('');
            setError(null);
        }
    }, [isOpen, studentName]);

    // Computed values for selected question
    const selectedQuestion = selectedQNum ? questions.find(q => q.questionNumber === parseInt(selectedQNum)) : null;
    const currentResult = selectedQNum ? results.find(r => r.questionNumber === parseInt(selectedQNum)) : null;

    useEffect(() => {
        if (currentResult) {
            setNewScore(currentResult.score);
        }
    }, [currentResult]);

    const handleSave = async () => {
        if (!selectedQNum || newScore === '' || !reason.trim()) {
            setError('Please complete all fields.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await onSave(parseInt(selectedQNum), Number(newScore), reason);
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to save re-mark. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const questionOptions = questions.map(q => ({
        value: q.questionNumber.toString(),
        label: `Q${q.questionNumber} (Max: ${q.maxScore})`
    }));

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={<Text fw={700}>Re-mark Result: {studentName}</Text>}
            size="lg"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Select
                    label="Select Question"
                    placeholder="Choose a question to re-mark"
                    data={questionOptions}
                    value={selectedQNum}
                    onChange={setSelectedQNum}
                    searchable
                />

                {selectedQuestion && currentResult && (
                    <Box p="md" bg="gray.1" style={{ borderRadius: '8px' }}>
                        <Group justify="space-between" mb="xs">
                            <Text size="sm" c="dimmed">Current Score</Text>
                            <Text fw={700} c={currentResult.isCorrect ? 'green' : 'red'}>
                                {currentResult.score} / {selectedQuestion.maxScore}
                            </Text>
                        </Group>
                        <Text size="sm" fw={600} mb={4}>Student Answer:</Text>
                        <Box p="xs" bg="white" style={{ borderRadius: '4px', border: '1px solid #dee2e6' }}>
                            <Text size="sm" style={{ wordBreak: 'break-word' }}>
                                {typeof currentResult.studentAnswer === 'object'
                                    ? JSON.stringify(currentResult.studentAnswer)
                                    : String(currentResult.studentAnswer || '(No Answer)')}
                            </Text>
                        </Box>
                    </Box>
                )}

                <NumberInput
                    label="New Score"
                    description={`Max possible: ${selectedQuestion?.maxScore || 0}`}
                    value={newScore}
                    onChange={(val) => setNewScore(val)}
                    min={0}
                    max={selectedQuestion?.maxScore}
                    disabled={!selectedQNum}
                />

                <Textarea
                    label="Reason for Change"
                    placeholder="e.g. valid alternative answer, spelling error ignored"
                    value={reason}
                    onChange={(e) => setReason(e.currentTarget.value)}
                    minRows={3}
                    disabled={!selectedQNum}
                />

                {error && <Alert color="red">{error}</Alert>}

                <Group justify="flex-end" mt="md">
                    <Button variant="glass" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={!selectedQNum || isSubmitting}
                    >
                        {isSubmitting ? 'Saving...' : 'Update Score'}
                    </Button>
                </Group>
            </div>
        </Modal>
    );
};
