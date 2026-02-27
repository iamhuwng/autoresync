/**
 * TestTypeSelectionModal
 * 
 * Modal for selecting test type and skill variation when creating a new test.
 * Flow: Test Type → Skill Selection → Navigate to appropriate test maker
 * 
 * @usage
 * <TestTypeSelectionModal
 *   opened={showModal}
 *   onClose={() => setShowModal(false)}
 *   onConfirm={(type, skill) => navigateTo(...)}
 * />
 */

import React, { useState } from 'react';
import { Modal, Text } from '@mantine/core';
import { Button, Card, CardBody } from './modern';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type TestType = 'IELTS' | 'TOEIC' | 'SAT' | 'THCS-THPT' | 'Mixed-Test';
type Skill = 'Reading' | 'Listening' | 'Writing' | 'Speaking' | 'Mixed-Test';

interface TestTypeOption {
    id: TestType;
    label: string;
    description: string;
    icon: string;
    skills: Skill[];
    available: boolean;
}

interface TestTypeSelectionModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: (testType: TestType, skill: Skill) => void;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const TEST_TYPES: TestTypeOption[] = [
    {
        id: 'IELTS',
        label: 'IELTS',
        description: 'International English Language Testing System',
        icon: '🌍',
        skills: ['Reading', 'Listening', 'Writing', 'Speaking', 'Mixed-Test'],
        available: true,
    },
    {
        id: 'TOEIC',
        label: 'TOEIC',
        description: 'Test of English for International Communication',
        icon: '💼',
        skills: ['Reading', 'Listening', 'Mixed-Test'],
        available: false,
    },
    {
        id: 'SAT',
        label: 'SAT',
        description: 'Scholastic Assessment Test',
        icon: '📚',
        skills: ['Reading', 'Writing', 'Mixed-Test'],
        available: false,
    },
    {
        id: 'THCS-THPT',
        label: 'THCS-THPT',
        description: 'Vietnamese National High School Exam',
        icon: '🇻🇳',
        skills: ['Mixed-Test'],
        available: true,
    },
    {
        id: 'Mixed-Test',
        label: 'Custom Test',
        description: 'Create a custom test with any question types',
        icon: '🎨',
        skills: ['Mixed-Test'],
        available: false,
    },
];

const SKILL_ICONS: Record<Skill, string> = {
    'Reading': '📖',
    'Listening': '🎧',
    'Writing': '✍️',
    'Speaking': '🎙️',
    'Mixed-Test': '🔀',
};

const SKILL_COLORS: Record<Skill, { bg: string; text: string; border: string }> = {
    'Reading': { bg: 'rgba(34, 197, 94, 0.1)', text: '#16a34a', border: 'rgba(34, 197, 94, 0.3)' },
    'Listening': { bg: 'rgba(59, 130, 246, 0.1)', text: '#2563eb', border: 'rgba(59, 130, 246, 0.3)' },
    'Writing': { bg: 'rgba(249, 115, 22, 0.1)', text: '#ea580c', border: 'rgba(249, 115, 22, 0.3)' },
    'Speaking': { bg: 'rgba(168, 85, 247, 0.1)', text: '#9333ea', border: 'rgba(168, 85, 247, 0.3)' },
    'Mixed-Test': { bg: 'rgba(107, 114, 128, 0.1)', text: '#4b5563', border: 'rgba(107, 114, 128, 0.3)' },
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const TestTypeSelectionModal: React.FC<TestTypeSelectionModalProps> = ({
    opened,
    onClose,
    onConfirm,
}) => {
    const [step, setStep] = useState<'type' | 'skill'>('type');
    const [selectedType, setSelectedType] = useState<TestType | null>(null);

    const handleTypeSelect = (type: TestType) => {
        const typeConfig = TEST_TYPES.find(t => t.id === type);
        if (typeConfig && typeConfig.skills.length === 1) {
            // Single skill — auto-confirm, skip skill picker
            setSelectedType(type);
            handleSkillSelect(typeConfig.skills[0]!);
            return;
        }
        setSelectedType(type);
        setStep('skill');
    };

    const handleSkillSelect = (skill: Skill) => {
        if (selectedType) {
            onConfirm(selectedType, skill);
            handleClose();
        }
    };

    const handleClose = () => {
        setStep('type');
        setSelectedType(null);
        onClose();
    };

    const handleBack = () => {
        setStep('type');
        setSelectedType(null);
    };

    const currentTestType = TEST_TYPES.find(t => t.id === selectedType);

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            size="lg"
            title={null}
            withCloseButton={false}
            padding={0}
            styles={{
                body: { padding: 0 },
                content: {
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(245, 243, 255, 0.98) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                    boxShadow: '0 25px 50px -12px rgba(139, 92, 246, 0.25)',
                    borderRadius: '1.5rem',
                },
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
                    borderRadius: '1.5rem 1.5rem 0 0',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <Text size="xl" fw={700} style={{ color: '#1e293b' }}>
                            {step === 'type' ? 'Create New Test' : `${selectedType} - Select Skill`}
                        </Text>
                        <Text size="sm" c="dimmed" mt={4}>
                            {step === 'type'
                                ? 'Choose the type of test you want to create'
                                : 'Select which skill section to create'}
                        </Text>
                    </div>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            borderRadius: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ padding: '1.5rem 2rem' }}>
                {step === 'type' ? (
                    // Step 1: Select Test Type
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {TEST_TYPES.map((type) => (
                            <Card
                                key={type.id}
                                variant={type.available ? 'glass' : 'default'}
                                hover={type.available}
                                onClick={() => type.available && handleTypeSelect(type.id)}
                                style={{
                                    cursor: type.available ? 'pointer' : 'not-allowed',
                                    opacity: type.available ? 1 : 0.5,
                                    transition: 'all 0.2s ease',
                                    border: type.available
                                        ? '1px solid rgba(139, 92, 246, 0.2)'
                                        : '1px solid rgba(148, 163, 184, 0.2)',
                                }}
                            >
                                <CardBody style={{ padding: '1rem 1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div
                                            style={{
                                                fontSize: '2rem',
                                                width: '48px',
                                                height: '48px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: type.available
                                                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)'
                                                    : 'rgba(148, 163, 184, 0.1)',
                                                borderRadius: '0.75rem',
                                            }}
                                        >
                                            {type.icon}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Text fw={600} size="lg" style={{ color: type.available ? '#1e293b' : '#94a3b8' }}>
                                                    {type.label}
                                                </Text>
                                                {!type.available && (
                                                    <span
                                                        style={{
                                                            fontSize: '0.625rem',
                                                            fontWeight: 700,
                                                            padding: '0.125rem 0.5rem',
                                                            background: 'rgba(148, 163, 184, 0.2)',
                                                            borderRadius: '9999px',
                                                            color: '#94a3b8',
                                                        }}
                                                    >
                                                        COMING SOON
                                                    </span>
                                                )}
                                            </div>
                                            <Text size="sm" c="dimmed">
                                                {type.description}
                                            </Text>
                                        </div>
                                        {type.available && (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                                                <polyline points="9 18 15 12 9 6" />
                                            </svg>
                                        )}
                                    </div>
                                </CardBody>
                            </Card>
                        ))}
                    </div>
                ) : (
                    // Step 2: Select Skill
                    <div>
                        {/* Back button */}
                        <button
                            onClick={handleBack}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#8b5cf6',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                padding: '0.5rem 0',
                                marginBottom: '1rem',
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Back to Test Types
                        </button>

                        {/* Skill Grid */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                gap: '1rem',
                            }}
                        >
                            {currentTestType?.skills.map((skill) => {
                                const colors = SKILL_COLORS[skill];
                                const isAvailable = skill === 'Reading' || skill === 'Listening'; // Only Reading and Listening are available

                                return (
                                    <Card
                                        key={skill}
                                        variant="glass"
                                        hover={isAvailable}
                                        onClick={() => isAvailable && handleSkillSelect(skill)}
                                        style={{
                                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                                            opacity: isAvailable ? 1 : 0.5,
                                            textAlign: 'center',
                                            border: `1px solid ${isAvailable ? colors.border : 'rgba(148, 163, 184, 0.2)'}`,
                                            background: isAvailable ? colors.bg : 'rgba(148, 163, 184, 0.05)',
                                        }}
                                    >
                                        <CardBody style={{ padding: '1.25rem 1rem' }}>
                                            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{SKILL_ICONS[skill]}</div>
                                            <Text fw={600} size="md" style={{ color: isAvailable ? colors.text : '#94a3b8' }}>
                                                {skill === 'Mixed-Test' ? 'Mixed' : skill}
                                            </Text>
                                            {!isAvailable && (
                                                <Text size="xs" c="dimmed" mt={4}>
                                                    Coming Soon
                                                </Text>
                                            )}
                                        </CardBody>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div
                style={{
                    padding: '1rem 2rem 1.5rem',
                    borderTop: '1px solid rgba(139, 92, 246, 0.1)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                }}
            >
                <Button variant="glass" onClick={handleClose}>
                    Cancel
                </Button>
            </div>
        </Modal>
    );
};

export default TestTypeSelectionModal;
