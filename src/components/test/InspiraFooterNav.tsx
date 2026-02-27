/**
 * Inspera-style Footer Navigation Component
 * Implements "Designated Space" logic:
 * - Footer is divided into equal chunks (1/N) for each part.
 * - Inactive parts show a summary: "Part X (Range)".
 * - Active part expands to show question numbers: "Part X 1 2 3...".
 * - Position of other parts remains stable unless the active part overflows its designated space.
 * - Clean white background with gray dividers.
 */

import React from 'react';

interface Question {
    number: number;
    passageId: string;
}

interface Passage {
    id: string;
    title?: string;
}

interface InspiraFooterNavProps {
    questions: Question[];
    passages: Passage[];
    answers: Record<number, any>;
    activePassageId: string | null;
    activeQuestionNumber: number;
    onPassageChange: (passageId: string) => void;
    onQuestionClick: (questionNumber: number) => void;
    onSubmit: () => void;
    testSubmitted?: boolean;
    questionResults?: Record<number, boolean>;
}

export const InspiraFooterNav: React.FC<InspiraFooterNavProps> = ({
    questions,
    passages,
    answers,
    activePassageId,
    activeQuestionNumber,
    onPassageChange,
    onQuestionClick,
    onSubmit,
    testSubmitted = false,
    questionResults,
}) => {
    const primaryBlue = 'rgb(65, 143, 198)';
    const textDark = '#333333';
    const textGray = '#666666';

    const parts = passages.map((passage, idx) => {
        const pQuestions = questions.filter(q => q.passageId === passage.id);
        const answeredCount = pQuestions.filter(q => answers[q.number] !== undefined).length;
        const totalCount = pQuestions.length;
        const startNum = pQuestions[0]?.number;
        const endNum = pQuestions[pQuestions.length - 1]?.number;
        const range = startNum && endNum ? `${startNum}–${endNum}` : '';

        return {
            id: passage.id,
            num: idx + 1,
            questions: pQuestions,
            answeredCount,
            totalCount,
            range,
            isActive: passage.id === activePassageId
        };
    });

    return (
        <div style={{
            height: '56px',
            background: '#ffffff',
            borderTop: '1px solid #d1d5db',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0',
            boxSizing: 'border-box',
            flexShrink: 0,
            zIndex: 1000,
            userSelect: 'none',
        }}>
            {/* Parts Container: Divided into equal slots */}
            <div style={{
                display: 'flex',
                flex: 1,
                height: '100%',
                alignItems: 'center',
            }}>
                {parts.map((part, index) => (
                    <React.Fragment key={part.id}>
                        <div
                            style={{
                                flex: part.isActive ? '1 1 auto' : '1 1 0px',
                                minWidth: 0,
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 12px',
                                transition: 'all 0.3s ease',
                                position: 'relative',
                                // Keep content starting at the same spot in the slot
                                justifyContent: 'flex-start',
                            }}
                        >
                            <div
                                onClick={() => {
                                    onPassageChange(part.id);
                                    if (part.questions[0]) onQuestionClick(part.questions[0].number);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    height: '36px',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <span style={{
                                    fontSize: '15px',
                                    fontWeight: part.isActive ? 700 : 500,
                                    color: part.isActive ? '#000000' : textGray,
                                }}>
                                    Part {part.num}
                                </span>

                                {!part.isActive && (
                                    <span style={{ fontSize: '13px', color: '#888888', fontWeight: 400 }}>
                                        ({part.range})
                                    </span>
                                )}
                            </div>

                            {/* Question Strip for Active Part */}
                            {part.isActive && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    paddingLeft: '12px',
                                    height: '100%',
                                }}>
                                    {part.questions.map((q) => {
                                        const isAns = answers[q.number] !== undefined;
                                        const isAct = q.number === activeQuestionNumber;
                                        const isRes = testSubmitted && questionResults ? questionResults[q.number] : null;

                                        return (
                                            <div
                                                key={q.number}
                                                onClick={() => onQuestionClick(q.number)}
                                                style={{
                                                    minWidth: '24px',
                                                    height: '28px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '15px',
                                                    fontWeight: isAct ? 700 : 400,
                                                    color: textDark,
                                                    cursor: 'pointer',
                                                    borderRadius: '3px',
                                                    backgroundColor: testSubmitted ? (isRes ? '#dcfce7' : '#fee2e2') : 'transparent',
                                                    border: (!testSubmitted && isAct) ? `2px solid ${primaryBlue}` : 'none',
                                                    position: 'relative',
                                                }}
                                            >
                                                {q.number}
                                                {isAns && !isAct && !testSubmitted && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        bottom: '2px',
                                                        width: '12px',
                                                        height: '2px',
                                                        backgroundColor: primaryBlue,
                                                    }} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        {index < parts.length - 1 && (
                            <div style={{
                                width: '1px',
                                height: '24px',
                                backgroundColor: '#e5e7eb',
                                flexShrink: 0
                            }} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Finish Button */}
            <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center' }}>
                <button
                    onClick={onSubmit}
                    style={{
                        width: '38px',
                        height: '38px',
                        backgroundColor: primaryBlue,
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default InspiraFooterNav;
