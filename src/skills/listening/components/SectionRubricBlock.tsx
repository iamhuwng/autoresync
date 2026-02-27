/**
 * SectionRubricBlock Component - IELTS CBT Style
 * 
 * Displays the section header and instructions at the top of question content
 * 
 * Layout:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Part 1                                                          │
 * │ Listen and answer questions 1–10.                               │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Followed by:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Questions 1–10                                                  │
 * │ Complete the notes. Write ONE WORD AND/OR A NUMBER for each     │
 * │ answer.                                                         │
 * └─────────────────────────────────────────────────────────────────┘
 */

import React from 'react';

interface SectionRubricBlockProps {
    partNumber: number;
    startQuestion: number;
    endQuestion: number;
    sectionName?: string;
    questionType?: string;
    totalParts?: number;
}

/**
 * Get IELTS-style instructions based on question type
 */
const getTypeInstructions = (type: string): { instruction: string; constraint?: string } => {
    const instructionMap: Record<string, { instruction: string; constraint?: string }> = {
        // Note/Form/Table Completion
        'note-completion': {
            instruction: 'Complete the notes below.',
            constraint: 'Write ONE WORD AND/OR A NUMBER for each answer.',
        },
        'form-completion': {
            instruction: 'Complete the form below.',
            constraint: 'Write ONE WORD AND/OR A NUMBER for each answer.',
        },
        'table-completion': {
            instruction: 'Complete the table below.',
            constraint: 'Write ONE WORD AND/OR A NUMBER for each answer.',
        },
        'completion': {
            instruction: 'Complete the notes below.',
            constraint: 'Write ONE WORD AND/OR A NUMBER for each answer.',
        },

        // Multiple Choice
        'multiple-choice': {
            instruction: 'Choose the correct letter, A, B or C.',
        },

        // Multiple Select
        'multiple-select': {
            instruction: 'Choose TWO letters, A-E.',
        },

        // Matching
        'matching': {
            instruction: 'Match each statement with the correct option.',
            constraint: 'Write the correct letter next to the questions.',
        },
        'matching-features': {
            instruction: 'Match each item with the correct description.',
        },

        // Map/Plan Labelling
        'map-labelling': {
            instruction: 'Label the map below.',
            constraint: 'Write the correct letter, A-H, next to the questions.',
        },
        'plan-labelling': {
            instruction: 'Label the plan below.',
            constraint: 'Write the correct letter, A-I, next to the questions.',
        },
        'diagram-labeling': {
            instruction: 'Label the diagram below.',
            constraint: 'Write NO MORE THAN TWO WORDS for each answer.',
        },

        // Sentence Completion
        'sentence-completion': {
            instruction: 'Complete the sentences below.',
            constraint: 'Write ONE WORD ONLY for each answer.',
        },

        // Summary Completion
        'summary-completion': {
            instruction: 'Complete the summary below.',
            constraint: 'Write NO MORE THAN TWO WORDS for each answer.',
        },

        // Short Answer
        'short-answer': {
            instruction: 'Answer the questions below.',
            constraint: 'Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.',
        },
    };

    return instructionMap[type] || {
        instruction: 'Answer the following questions.',
    };
};

export const SectionRubricBlock: React.FC<SectionRubricBlockProps> = ({
    partNumber,
    startQuestion,
    endQuestion,
    sectionName,
    questionType = 'completion',
}) => {
    const typeInfo = getTypeInstructions(questionType);
    const questionRange = startQuestion === endQuestion
        ? `Question ${startQuestion}`
        : `Questions ${startQuestion}–${endQuestion}`;

    return (
        <div style={{ marginBottom: '20px' }}>
            {/* Part Header Block */}
            <div
                style={{
                    backgroundColor: '#f3f4f6',
                    borderRadius: '8px',
                    padding: '16px 20px',
                    marginBottom: '16px',
                    borderLeft: '4px solid #3b82f6',
                }}
            >
                {/* Part Title */}
                <h2
                    style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#1f2937',
                        margin: 0,
                        marginBottom: '4px',
                    }}
                >
                    Part {partNumber}
                    {sectionName && sectionName !== `Section ${partNumber}` && (
                        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: '8px' }}>
                            – {sectionName}
                        </span>
                    )}
                </h2>

                {/* Section Instruction */}
                <p
                    style={{
                        fontSize: '14px',
                        color: '#4b5563',
                        margin: 0,
                    }}
                >
                    Listen and answer questions {startQuestion}–{endQuestion}.
                </p>
            </div>

            {/* Question Instructions Block */}
            <div
                style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px 20px',
                }}
            >
                {/* Question Range Header */}
                <h3
                    style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#1f2937',
                        margin: 0,
                        marginBottom: '8px',
                    }}
                >
                    {questionRange}
                </h3>

                {/* Task Instruction */}
                <p
                    style={{
                        fontSize: '14px',
                        color: '#374151',
                        margin: 0,
                        lineHeight: 1.6,
                    }}
                >
                    {typeInfo.instruction}
                    {typeInfo.constraint && (
                        <>
                            {' '}
                            <strong style={{ color: '#1f2937' }}>
                                {typeInfo.constraint}
                            </strong>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
};

export default SectionRubricBlock;
