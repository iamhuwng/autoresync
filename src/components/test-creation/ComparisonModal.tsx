/**
 * ComparisonModal Component
 * 
 * Modal for comparing AI vs Rules-based classification.
 * Allows teacher to pick preferred option for uncertain items.
 * 
 * Features:
 * - Side-by-side comparison display
 * - Radio buttons to select option
 * - Confidence indicators
 * - Explanation of differences
 * - Confirm/cancel buttons
 * 
 * @module ComparisonModal
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 6, Task 6.5
 */

import React, { useState } from 'react';
import { Modal, Radio, Group, Badge } from '@mantine/core';
import { Card, CardBody, Button } from '../modern';
import {
    IconBrain,
    IconListCheck,
    IconArrowRight,
    IconCheck,
} from '@tabler/icons-react';
import type { QuestionType } from '../../types/QuestionSchema';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ComparisonData {
    questionNumber: number;
    questionText: string;
    aiType: QuestionType;
    aiConfidence: number;
    rulesType: QuestionType;
    rulesConfidence: number;
    recommendation: 'ai' | 'rules' | 'manual';
    reason: string;
}

export interface ComparisonModalProps {
    /** Whether modal is open */
    opened: boolean;
    /** Callback to close modal */
    onClose: () => void;
    /** Comparison data */
    data: ComparisonData;
    /** Callback when selection is confirmed */
    onConfirm: (selectedType: QuestionType, source: 'ai' | 'rules' | 'manual') => void;
}

// ═══════════════════════════════════════════════════════════════
// TYPE LABELS
// ═══════════════════════════════════════════════════════════════

const TYPE_LABELS: Record<QuestionType, string> = {
    'true-false-not-given': 'True/False/Not Given',
    'yes-no-not-given': 'Yes/No/Not Given',
    'matching-headings': 'Matching Headings',
    'matching-information': 'Matching Information',
    'matching-features': 'Matching Features',
    'matching-sentence-endings': 'Matching Sentence Endings',
    'sentence-completion': 'Sentence Completion',
    'summary-completion-text': 'Summary Completion (Text)',
    'summary-completion-list': 'Summary Completion (List)',
    'note-completion': 'Note Completion',
    'table-completion': 'Table Completion',
    'flowchart-completion': 'Flowchart Completion',
    'diagram-labeling': 'Diagram Labeling',
    'multiple-choice': 'Multiple Choice',
    'multiple-select': 'Multiple Select',
    'short-answer': 'Short Answer',
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export const ComparisonModal: React.FC<ComparisonModalProps> = ({
    opened,
    onClose,
    data,
    onConfirm,
}) => {
    const [selectedOption, setSelectedOption] = useState<'ai' | 'rules'>(
        data.recommendation === 'ai' ? 'ai' : 'rules'
    );

    const handleConfirm = () => {
        const selectedType = selectedOption === 'ai' ? data.aiType : data.rulesType;
        onConfirm(selectedType, selectedOption);
        onClose();
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '1.125rem' }}>
                        Resolve Question Type
                    </span>
                    <Badge color="violet" variant="light">
                        Q{data.questionNumber}
                    </Badge>
                </div>
            }
            size="lg"
            radius="lg"
            centered
            styles={{
                header: {
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #e2e8f0',
                },
                body: {
                    padding: '1.5rem',
                },
            }}
        >
            {/* Question Preview */}
            <div
                style={{
                    padding: '1rem',
                    background: 'rgba(248, 250, 252, 0.8)',
                    borderRadius: '12px',
                    marginBottom: '1.5rem',
                }}
            >
                <p style={{
                    margin: 0,
                    fontSize: '0.9375rem',
                    color: '#334155',
                    lineHeight: '1.6',
                }}>
                    {data.questionText}
                </p>
            </div>

            {/* Explanation */}
            <div
                style={{
                    padding: '1rem',
                    background: 'rgba(251, 191, 36, 0.1)',
                    borderRadius: '12px',
                    marginBottom: '1.5rem',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                }}
            >
                <p style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    color: '#92400e',
                    fontWeight: '500',
                }}>
                    💡 {data.reason}
                </p>
            </div>

            {/* Comparison Cards */}
            <Radio.Group
                value={selectedOption}
                onChange={(value) => setSelectedOption(value as 'ai' | 'rules')}
            >
                <Group grow align="stretch" style={{ marginBottom: '1.5rem' }}>
                    {/* AI Option */}
                    <div
                        onClick={() => setSelectedOption('ai')}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedOption('ai');
                            }
                        }}
                        tabIndex={0}
                        role="radio"
                        aria-checked={selectedOption === 'ai'}
                        aria-label={`AI Detection: ${TYPE_LABELS[data.aiType]}, ${data.aiConfidence}% confidence`}
                    >
                        <Card
                            variant="glass"
                            style={{
                                cursor: 'pointer',
                                border: selectedOption === 'ai'
                                    ? '2px solid #8b5cf6'
                                    : '2px solid transparent',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <CardBody style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <div
                                        style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '12px',
                                            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <IconBrain size={20} color="white" />
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontWeight: '700', color: '#1e293b' }}>AI Detection</p>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                                            {data.aiConfidence}% confidence
                                        </p>
                                    </div>
                                    <Radio
                                        value="ai"
                                        style={{ marginLeft: 'auto' }}
                                        styles={{ radio: { cursor: 'pointer' } }}
                                    />
                                </div>

                                <div
                                    style={{
                                        padding: '0.75rem 1rem',
                                        background: selectedOption === 'ai'
                                            ? 'rgba(139, 92, 246, 0.1)'
                                            : 'rgba(248, 250, 252, 0.8)',
                                        borderRadius: '8px',
                                        textAlign: 'center',
                                    }}
                                >
                                    <span style={{
                                        fontWeight: '700',
                                        fontSize: '1rem',
                                        color: selectedOption === 'ai' ? '#8b5cf6' : '#334155',
                                    }}>
                                        {TYPE_LABELS[data.aiType] || data.aiType}
                                    </span>
                                </div>

                                {data.recommendation === 'ai' && (
                                    <Badge
                                        color="violet"
                                        variant="light"
                                        style={{ marginTop: '0.75rem', width: '100%' }}
                                    >
                                        ⭐ Recommended
                                    </Badge>
                                )}
                            </CardBody>
                        </Card>
                    </div>

                    {/* Arrow */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 40px',
                    }}>
                        <IconArrowRight size={24} color="#94a3b8" />
                    </div>

                    {/* Rules Option */}
                    <div
                        onClick={() => setSelectedOption('rules')}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedOption('rules');
                            }
                        }}
                        tabIndex={0}
                        role="radio"
                        aria-checked={selectedOption === 'rules'}
                        aria-label={`Rule-Based: ${TYPE_LABELS[data.rulesType]}, ${data.rulesConfidence}% confidence`}
                    >
                        <Card
                            variant="glass"
                            style={{
                                cursor: 'pointer',
                                border: selectedOption === 'rules'
                                    ? '2px solid #22c55e'
                                    : '2px solid transparent',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <CardBody style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <div
                                        style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '12px',
                                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <IconListCheck size={20} color="white" />
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontWeight: '700', color: '#1e293b' }}>Rule-Based</p>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                                            {data.rulesConfidence}% confidence
                                        </p>
                                    </div>
                                    <Radio
                                        value="rules"
                                        style={{ marginLeft: 'auto' }}
                                        styles={{ radio: { cursor: 'pointer' } }}
                                    />
                                </div>

                                <div
                                    style={{
                                        padding: '0.75rem 1rem',
                                        background: selectedOption === 'rules'
                                            ? 'rgba(34, 197, 94, 0.1)'
                                            : 'rgba(248, 250, 252, 0.8)',
                                        borderRadius: '8px',
                                        textAlign: 'center',
                                    }}
                                >
                                    <span style={{
                                        fontWeight: '700',
                                        fontSize: '1rem',
                                        color: selectedOption === 'rules' ? '#22c55e' : '#334155',
                                    }}>
                                        {TYPE_LABELS[data.rulesType] || data.rulesType}
                                    </span>
                                </div>

                                {data.recommendation === 'rules' && (
                                    <Badge
                                        color="green"
                                        variant="light"
                                        style={{ marginTop: '0.75rem', width: '100%' }}
                                    >
                                        ⭐ Recommended
                                    </Badge>
                                )}
                            </CardBody>
                        </Card>
                    </div>
                </Group>
            </Radio.Group>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <Button variant="glass" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    onClick={handleConfirm}
                    style={{ minWidth: '140px' }}
                >
                    <IconCheck size={18} style={{ marginRight: '0.5rem' }} />
                    Confirm
                </Button>
            </div>
        </Modal>
    );
};

export default ComparisonModal;
